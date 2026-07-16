import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const AUTH_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_FAILURES = 5
const ACCESS_KEYS_STORE_KEY = 'accessKeys'
const LEGACY_PASSWORD_KEY = 'bookshelfPassword'
const SESSION_KEY_PREFIX = 'dreamloom:auth:session:'
const SESSION_KEY_INDEX_PREFIX = 'dreamloom:auth:key-sessions:'
const LOGIN_FAIL_PREFIX = 'dreamloom:auth:fail:'
const SESSION_EPOCH_KEY = 'dreamloom:auth:epoch'

function passwordDigest(password) {
  return createHash('sha256').update(String(password || '')).digest()
}
function hashSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}
function credentialFingerprint(credential) {
  return createHash('sha256').update(String(credential || '')).digest('hex')
}
function nowText(now = Date.now) {
  return new Date(now()).toISOString()
}
function sanitizeKeyId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}
function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}
function isProductionMode(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase()
  if (nodeEnv === 'production') return true
  if (boolFromEnv(env.NOVEL_AUTH_STRICT, false)) return true
  return false
}
function safeAuthError(message, statusCode = 503) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.expose = true
  return error
}
function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function'
}
async function resolveMaybePromise(value) {
  return isPromiseLike(value) ? await value : value
}

export function createMemoryAuthStateStore({ now = () => Date.now() } = {}) {
  const sessions = new Map()
  const failures = new Map()
  let epoch = 0
  return {
    kind: 'memory',
    async getEpoch() { return epoch },
    async bumpEpoch() { epoch += 1; return epoch },
    async getSession(tokenHash) {
      const session = sessions.get(tokenHash)
      if (!session) return null
      if (session.expiresAt <= now()) { sessions.delete(tokenHash); return null }
      return { ...session }
    },
    async setSession(tokenHash, session, ttlMs) {
      const expiresAt = now() + Math.max(1, Number(ttlMs) || AUTH_SESSION_MAX_AGE_MS)
      sessions.set(tokenHash, { ...session, expiresAt })
      return true
    },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); return true },
    async deleteSessionsByKeyId(keyId) {
      for (const [tokenHash, session] of sessions.entries()) {
        if (session.keyId === keyId) sessions.delete(tokenHash)
      }
      return true
    },
    async clearSessions() { sessions.clear(); epoch += 1; return true },
    async getLoginFailures(clientKey) { return [...(failures.get(clientKey) || [])] },
    async setLoginFailures(clientKey, times) {
      if (!times.length) failures.delete(clientKey)
      else failures.set(clientKey, [...times])
      return true
    },
    async clearLoginFailures(clientKey) { failures.delete(clientKey); return true },
    async close() { sessions.clear(); failures.clear() },
    _sessions: sessions,
    _failures: failures
  }
}

export function createRedisAuthStateStore({ redis, now = () => Date.now(), keyPrefix = '' } = {}) {
  if (!redis) throw new Error('Redis client is required')
  const sessionKey = (h) => `${keyPrefix}${SESSION_KEY_PREFIX}${h}`
  const keyIndex = (id) => `${keyPrefix}${SESSION_KEY_INDEX_PREFIX}${id}`
  const failKey = (c) => `${keyPrefix}${LOGIN_FAIL_PREFIX}${c}`
  const epochKey = `${keyPrefix}${SESSION_EPOCH_KEY}`
  async function readJson(key) {
    const raw = await redis.get(key)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  return {
    kind: 'redis',
    async getEpoch() {
      const value = Number(await redis.get(epochKey))
      return Number.isFinite(value) ? value : 0
    },
    async bumpEpoch() { return Number(await redis.incr(epochKey)) },
    async getSession(tokenHash) {
      const session = await readJson(sessionKey(tokenHash))
      if (!session) return null
      if (session.expiresAt <= now()) { await redis.del(sessionKey(tokenHash)); return null }
      const epoch = await this.getEpoch()
      if (Number(session.epoch || 0) !== Number(epoch || 0)) {
        await redis.del(sessionKey(tokenHash)); return null
      }
      return session
    },
    async setSession(tokenHash, session, ttlMs) {
      const ttlSeconds = Math.max(1, Math.ceil((Number(ttlMs) || AUTH_SESSION_MAX_AGE_MS) / 1000))
      const expiresAt = now() + ttlSeconds * 1000
      const epoch = await this.getEpoch()
      const payload = JSON.stringify({ ...session, expiresAt, epoch })
      const pipeline = redis.multi()
      pipeline.set(sessionKey(tokenHash), payload, 'EX', ttlSeconds)
      if (session.keyId) {
        pipeline.sadd(keyIndex(session.keyId), tokenHash)
        pipeline.expire(keyIndex(session.keyId), ttlSeconds)
      }
      await pipeline.exec()
      return true
    },
    async deleteSession(tokenHash) {
      const session = await readJson(sessionKey(tokenHash))
      const pipeline = redis.multi()
      pipeline.del(sessionKey(tokenHash))
      if (session?.keyId) pipeline.srem(keyIndex(session.keyId), tokenHash)
      await pipeline.exec()
      return true
    },
    async deleteSessionsByKeyId(keyId) {
      const members = await redis.smembers(keyIndex(keyId))
      if (members.length) {
        const pipeline = redis.multi()
        for (const tokenHash of members) pipeline.del(sessionKey(tokenHash))
        pipeline.del(keyIndex(keyId))
        await pipeline.exec()
      } else await redis.del(keyIndex(keyId))
      return true
    },
    async clearSessions() { await this.bumpEpoch(); return true },
    async getLoginFailures(clientKey) {
      const raw = await redis.get(failKey(clientKey))
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []
      } catch { return [] }
    },
    async setLoginFailures(clientKey, times) {
      const key = failKey(clientKey)
      if (!times.length) { await redis.del(key); return true }
      await redis.set(key, JSON.stringify(times), 'EX', Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000)))
      return true
    },
    async clearLoginFailures(clientKey) { await redis.del(failKey(clientKey)); return true },
    async close() {
      if (typeof redis.quit === 'function') {
        try { await redis.quit() } catch {}
      }
    }
  }
}

export async function createAuthStateStoreFromEnv({
  redisUrl = process.env.REDIS_URL,
  redisFactory,
  now = () => Date.now(),
  preferRedis = null,
  memoryStore
} = {}) {
  const url = String(redisUrl || '').trim()
  const shouldUseRedis =
    preferRedis === true ||
    (preferRedis == null && Boolean(url) && boolFromEnv(process.env.NOVEL_AUTH_REDIS, true))
  if (!shouldUseRedis || !url) return memoryStore || createMemoryAuthStateStore({ now })
  try {
    let redis
    if (typeof redisFactory === 'function') redis = await redisFactory(url)
    else {
      const { default: Redis } = await import('ioredis')
      redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: Number(process.env.NOVEL_AUTH_REDIS_CONNECT_TIMEOUT_MS) || 3000
      })
      await redis.connect()
      await redis.ping()
    }
    return createRedisAuthStateStore({ redis, now })
  } catch {
    return memoryStore || createMemoryAuthStateStore({ now })
  }
}

export function createWebAuthService({
  storeGet, storeSet, storeDelete,
  now = () => Date.now(), random = randomBytes, stateStore, redisUrl,
  allowOpenAuth, productionMode, trustProxy, env = process.env
} = {}) {
  const resolvedStateStore = stateStore || createMemoryAuthStateStore({ now })
  const requireSharedStore =
    boolFromEnv(env.NOVEL_AUTH_REQUIRE_REDIS, false) ||
    (isProductionMode(env) && Boolean(String(redisUrl || env.REDIS_URL || '').trim()))

  const openAuthEnabled = () => typeof allowOpenAuth === 'boolean' ? allowOpenAuth : boolFromEnv(env.NOVEL_ALLOW_OPEN_AUTH, false)
  const inProduction = () => typeof productionMode === 'boolean' ? productionMode : isProductionMode(env)
  const trustProxyEnabled = () => typeof trustProxy === 'boolean' ? trustProxy : boolFromEnv(env.NOVEL_TRUST_PROXY, false)

  function passwordsMatch(actual, expected) {
    const stored = String(expected || '')
    if (stored.startsWith('scrypt$v1$')) {
      const [, , saltHex, hashHex] = stored.split('$')
      if (!saltHex || !hashHex) return false
      const actualHash = scryptSync(String(actual || ''), Buffer.from(saltHex, 'hex'), 64)
      const expectedHash = Buffer.from(hashHex, 'hex')
      return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash)
    }
    const left = passwordDigest(actual)
    const right = passwordDigest(expected)
    return left.length === right.length && timingSafeEqual(left, right)
  }
  function hashAccessKey(accessKey) {
    const salt = random(16)
    const hash = scryptSync(String(accessKey), salt, 64)
    return `scrypt$v1$${salt.toString('hex')}$${hash.toString('hex')}`
  }
  function parseCookies(req) {
    return Object.fromEntries(
      String(req.headers?.cookie || '').split(';').map((p) => p.trim()).filter(Boolean).map((part) => {
        const i = part.indexOf('=')
        return i === -1 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))]
      })
    )
  }
  async function readStore(key) { return resolveMaybePromise(storeGet(key)) }
  async function writeStore(key, value) { return resolveMaybePromise(storeSet(key, value)) }
  async function deleteStore(key) { return resolveMaybePromise(storeDelete(key)) }
  async function readAccessKeysRaw() {
    const raw = await readStore(ACCESS_KEYS_STORE_KEY)
    return Array.isArray(raw) ? raw : []
  }
  async function writeAccessKeys(keys) {
    await writeStore(ACCESS_KEYS_STORE_KEY, keys)
    const admin = keys.find((item) => item?.role === 'admin')
    if (admin?.credential) await writeStore(LEGACY_PASSWORD_KEY, admin.credential)
    else await deleteStore(LEGACY_PASSWORD_KEY)
  }
  async function ensureAccessKeysMigrated() {
    const existing = (await readAccessKeysRaw()).filter((item) => item && typeof item === 'object').map((item) => ({
      id: sanitizeKeyId(item.id) || `key_${passwordDigest(String(item.createdAt || Math.random())).toString('hex').slice(0, 12)}`,
      role: item.role === 'guest' ? 'guest' : 'admin',
      label: String(item.label || (item.role === 'guest' ? '访客密钥' : '管理员密钥')).slice(0, 64),
      credential: String(item.credential || ''),
      createdAt: item.createdAt || nowText(now),
      createdBy: String(item.createdBy || 'system'),
      revokedAt: item.revokedAt || null
    })).filter((item) => item.credential)
    if (existing.length) {
      if (!existing.some((item) => item.role === 'admin' && !item.revokedAt)) {
        const legacy = String((await readStore(LEGACY_PASSWORD_KEY)) || '')
        if (legacy) existing.unshift({ id: 'admin', role: 'admin', label: '管理员密钥', credential: legacy, createdAt: nowText(now), createdBy: 'migration', revokedAt: null })
      }
      await writeAccessKeys(existing)
      return existing.filter((item) => !item.revokedAt)
    }
    const legacy = String((await readStore(LEGACY_PASSWORD_KEY)) || '')
    if (!legacy) return []
    const migrated = [{ id: 'admin', role: 'admin', label: '管理员密钥', credential: legacy, createdAt: nowText(now), createdBy: 'migration', revokedAt: null }]
    await writeAccessKeys(migrated)
    return migrated
  }
  async function listActiveAccessKeys() { return ensureAccessKeysMigrated() }
  async function getAdminKey() { return (await listActiveAccessKeys()).find((item) => item.role === 'admin') || null }
  async function getBookshelfPassword() { return (await getAdminKey())?.credential || String((await readStore(LEGACY_PASSWORD_KEY)) || '') }
  async function findMatchingKey(password) { return (await listActiveAccessKeys()).find((item) => passwordsMatch(password, item.credential)) || null }
  function publicKeyView(key) {
    if (!key) return null
    return { id: key.id, role: key.role, label: key.label, createdAt: key.createdAt, createdBy: key.createdBy }
  }
  function sessionPayload(session, passwordConfigured) {
    if (!session) return { authenticated: false, passwordConfigured, role: null, keyId: null, ownerId: null, canManageKeys: false }
    return { authenticated: true, passwordConfigured, role: session.role, keyId: session.keyId, ownerId: session.ownerId, canManageKeys: session.role === 'admin', label: session.label || '' }
  }
  function openSessionPayload() {
    return { authenticated: true, passwordConfigured: false, role: 'admin', keyId: 'admin', ownerId: null, canManageKeys: true, label: '开放访问' }
  }
  function isLoopbackRequest(req) {
    const address = String(req.socket?.remoteAddress || '')
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }
  function isHttpsRequest(req) {
    if (req.socket?.encrypted) return true
    if (!trustProxyEnabled()) return false
    return String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https'
  }
  function isSecureAuthRequest(req) { return isLoopbackRequest(req) || isHttpsRequest(req) }
  function clientAddress(req) {
    if (trustProxyEnabled()) {
      const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',').map((p) => p.trim()).filter(Boolean)[0]
      if (forwarded) return forwarded
    }
    return String(req.socket?.remoteAddress || 'unknown')
  }
  function setAuthCookie(req, res, token) {
    const secure = isHttpsRequest(req) ? '; Secure' : ''
    res.setHeader('Set-Cookie', `dreamloom_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(AUTH_SESSION_MAX_AGE_MS / 1000)}${secure}`)
  }
  async function clearAuthCookie(req, res) {
    const token = parseCookies(req).dreamloom_session
    if (token) { try { await resolvedStateStore.deleteSession(hashSessionToken(token)) } catch {} }
    const secure = isHttpsRequest(req) ? '; Secure' : ''
    res.setHeader('Set-Cookie', `dreamloom_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
  }
  async function assertStateStoreReady(action = '会话操作') {
    if (resolvedStateStore.kind === 'redis') return
    if (requireSharedStore) throw safeAuthError(`${action}失败：共享会话存储不可用`, 503)
  }
  async function createSession(key) {
    await assertStateStoreReady('创建会话')
    const token = random(32).toString('hex')
    try {
      await resolvedStateStore.setSession(hashSessionToken(token), {
        keyId: key.id, role: key.role, ownerId: key.role === 'guest' ? key.id : null,
        label: key.label, credentialFingerprint: credentialFingerprint(key.credential), createdAt: now()
      }, AUTH_SESSION_MAX_AGE_MS)
    } catch { throw safeAuthError('创建会话失败，请稍后重试', 503) }
    return token
  }
  async function invalidateSessionsForKey(keyId) { try { await resolvedStateStore.deleteSessionsByKeyId(keyId) } catch {} }
  async function clearAllSessions() { try { await resolvedStateStore.clearSessions() } catch {} }
  function validatePlainKey(accessKey) {
    const value = String(accessKey || '')
    if (value.length < 8 || value.length > 128 || /\s/.test(value)) return { ok: false, message: '密钥长度须为 8-128 位，且不可包含空格' }
    return { ok: true, value }
  }
  async function storeAccessKey(accessKey) {
    const check = validatePlainKey(accessKey)
    if (!check.ok) throw new Error(check.message)
    const credential = hashAccessKey(check.value)
    const keys = (await listActiveAccessKeys()).filter((item) => item.role !== 'admin')
    await writeAccessKeys([{ id: 'admin', role: 'admin', label: '管理员密钥', credential, createdAt: nowText(now), createdBy: 'admin', revokedAt: null }, ...keys])
    await clearAllSessions()
    return credential
  }
  async function clearAccessKey() { await writeAccessKeys([]); await clearAllSessions() }
  async function normalizeStoredCredential(accessKey, credential) {
    if (String(credential).startsWith('scrypt$v1$')) return credential
    return storeAccessKey(accessKey)
  }
  async function createGuestKey({ label, plainKey, createdBy = 'admin' } = {}) {
    const check = validatePlainKey(plainKey)
    if (!check.ok) throw new Error(check.message)
    const keys = await listActiveAccessKeys()
    if (!keys.some((item) => item.role === 'admin')) throw new Error('请先设置管理员密钥')
    const id = `guest_${random(8).toString('hex')}`
    const guest = { id, role: 'guest', label: String(label || '访客密钥').trim().slice(0, 64) || '访客密钥', credential: hashAccessKey(check.value), createdAt: nowText(now), createdBy: String(createdBy || 'admin'), revokedAt: null }
    await writeAccessKeys([...keys, guest])
    return { key: publicKeyView(guest), plainKey: check.value }
  }
  async function revokeAccessKey(keyId) {
    const id = sanitizeKeyId(keyId)
    if (!id) throw new Error('密钥 ID 无效')
    if (id === 'admin') throw new Error('不能删除管理员密钥')
    const keys = await listActiveAccessKeys()
    const next = keys.filter((item) => item.id !== id)
    if (next.length === keys.length) throw new Error('密钥不存在')
    await writeAccessKeys(next)
    await invalidateSessionsForKey(id)
    return true
  }
  async function listPublicAccessKeys() { return (await listActiveAccessKeys()).map(publicKeyView) }
  async function updateAdminKey({ currentKey, newKey }) {
    const admin = await getAdminKey()
    if (!admin) {
      if (!newKey) { await clearAccessKey(); return { passwordConfigured: false } }
      await storeAccessKey(newKey); return { passwordConfigured: true }
    }
    if (!passwordsMatch(currentKey, admin.credential)) {
      const error = new Error('原密钥错误'); error.statusCode = 401; throw error
    }
    if (!newKey) { await clearAccessKey(); return { passwordConfigured: false } }
    await storeAccessKey(newKey); return { passwordConfigured: true }
  }
  function loginClientKey(req) { return clientAddress(req) }
  async function activeLoginFailures(req) {
    const key = loginClientKey(req)
    const cutoff = now() - LOGIN_WINDOW_MS
    let failures = []
    try {
      failures = (await resolvedStateStore.getLoginFailures(key)).filter((time) => time > cutoff)
      await resolvedStateStore.setLoginFailures(key, failures)
    } catch { failures = [] }
    return { key, failures }
  }
  async function checkLoginAllowed(req) {
    const { failures } = await activeLoginFailures(req)
    if (failures.length < MAX_LOGIN_FAILURES) return { allowed: true, retryAfterSeconds: 0 }
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((failures[0] + LOGIN_WINDOW_MS - now()) / 1000)) }
  }
  async function recordLoginFailure(req) {
    const { key, failures } = await activeLoginFailures(req)
    failures.push(now())
    try { await resolvedStateStore.setLoginFailures(key, failures) } catch {}
  }
  async function clearLoginFailures(req) {
    try { await resolvedStateStore.clearLoginFailures(loginClientKey(req)) } catch {}
  }
  function generateGuestPlainKey() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    const bytes = random(16)
    let out = ''
    for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length]
    return out
  }
  async function getAuthenticatedSession(req) {
    const keys = await listActiveAccessKeys()
    const passwordConfigured = keys.length > 0
    if (!passwordConfigured) {
      if (openAuthEnabled()) {
        if (inProduction() && !isLoopbackRequest(req)) return sessionPayload(null, false)
        return openSessionPayload()
      }
      return sessionPayload(null, false)
    }
    const token = parseCookies(req).dreamloom_session
    if (!token) return sessionPayload(null, true)
    let session = null
    try { session = await resolvedStateStore.getSession(hashSessionToken(token)) }
    catch { return sessionPayload(null, true) }
    if (!session || session.expiresAt <= now()) {
      try { await resolvedStateStore.deleteSession(hashSessionToken(token)) } catch {}
      return sessionPayload(null, true)
    }
    const key = keys.find((item) => item.id === session.keyId)
    if (!key || credentialFingerprint(key.credential) !== session.credentialFingerprint) {
      try { await resolvedStateStore.deleteSession(hashSessionToken(token)) } catch {}
      return sessionPayload(null, true)
    }
    return sessionPayload({ role: key.role, keyId: key.id, ownerId: key.role === 'guest' ? key.id : null, label: key.label }, true)
  }

  return {
    getAuthenticatedSession, getBookshelfPassword, passwordsMatch, storeAccessKey, clearAccessKey,
    normalizeStoredCredential, isSecureAuthRequest, isHttpsRequest, isLoopbackRequest,
    isOpenAuthEnabled: openAuthEnabled, checkLoginAllowed, recordLoginFailure, clearLoginFailures,
    createSession, setAuthCookie, clearAuthCookie, findMatchingKey, listPublicAccessKeys,
    createGuestKey, revokeAccessKey, updateAdminKey, generateGuestPlainKey, validatePlainKey,
    getStateStoreKind: () => resolvedStateStore.kind || 'memory',
    getStateStore: () => resolvedStateStore,
    hashSessionToken, AUTH_SESSION_MAX_AGE_MS
  }
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const AUTH_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_FAILURES = 5
const LEGACY_PASSWORD_KEY = 'bookshelfPassword'
const SESSION_KEY_PREFIX = 'dreamloom:auth:session:'
const LOGIN_FAIL_PREFIX = 'dreamloom:auth:fail:'
const SESSION_EPOCH_KEY = 'dreamloom:auth:epoch'

function passwordDigest(password) {
  return createHash('sha256').update(String(password || '')).digest()
}

function hashSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
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
  return boolFromEnv(env.NOVEL_AUTH_STRICT, false)
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
      if (session.expiresAt <= now()) {
        sessions.delete(tokenHash)
        return null
      }
      return { ...session }
    },
    async setSession(tokenHash, session, ttlMs) {
      const expiresAt = now() + Math.max(1, Number(ttlMs) || AUTH_SESSION_MAX_AGE_MS)
      sessions.set(tokenHash, { ...session, expiresAt })
      return true
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash)
      return true
    },
    async clearSessions() {
      sessions.clear()
      epoch += 1
      return true
    },
    async getLoginFailures(clientKey) {
      return [...(failures.get(clientKey) || [])]
    },
    async setLoginFailures(clientKey, times) {
      if (!times.length) failures.delete(clientKey)
      else failures.set(clientKey, [...times])
      return true
    },
    async clearLoginFailures(clientKey) {
      failures.delete(clientKey)
      return true
    },
    async close() {
      sessions.clear()
      failures.clear()
    },
    _sessions: sessions,
    _failures: failures
  }
}

export function createRedisAuthStateStore({ redis, now = () => Date.now(), keyPrefix = '' } = {}) {
  if (!redis) throw new Error('Redis client is required')
  const sessionKey = (tokenHash) => `${keyPrefix}${SESSION_KEY_PREFIX}${tokenHash}`
  const failKey = (clientKey) => `${keyPrefix}${LOGIN_FAIL_PREFIX}${clientKey}`
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
    async bumpEpoch() {
      return Number(await redis.incr(epochKey))
    },
    async getSession(tokenHash) {
      const session = await readJson(sessionKey(tokenHash))
      if (!session) return null
      if (session.expiresAt <= now()) {
        await redis.del(sessionKey(tokenHash))
        return null
      }
      const epoch = await this.getEpoch()
      if (Number(session.epoch || 0) !== Number(epoch || 0)) {
        await redis.del(sessionKey(tokenHash))
        return null
      }
      return session
    },
    async setSession(tokenHash, session, ttlMs) {
      const ttlSeconds = Math.max(1, Math.ceil((Number(ttlMs) || AUTH_SESSION_MAX_AGE_MS) / 1000))
      const expiresAt = now() + ttlSeconds * 1000
      const epoch = await this.getEpoch()
      await redis.set(sessionKey(tokenHash), JSON.stringify({ ...session, expiresAt, epoch }), 'EX', ttlSeconds)
      return true
    },
    async deleteSession(tokenHash) {
      await redis.del(sessionKey(tokenHash))
      return true
    },
    async clearSessions() {
      await this.bumpEpoch()
      return true
    },
    async getLoginFailures(clientKey) {
      const raw = await redis.get(failKey(clientKey))
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []
      } catch {
        return []
      }
    },
    async setLoginFailures(clientKey, times) {
      const key = failKey(clientKey)
      if (!times.length) {
        await redis.del(key)
        return true
      }
      await redis.set(key, JSON.stringify(times), 'EX', Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000)))
      return true
    },
    async clearLoginFailures(clientKey) {
      await redis.del(failKey(clientKey))
      return true
    },
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
  storeGet,
  storeSet,
  storeDelete,
  now = () => Date.now(),
  random = randomBytes,
  stateStore,
  redisUrl,
  allowOpenAuth,
  productionMode,
  trustProxy,
  env = process.env
} = {}) {
  const resolvedStateStore = stateStore || createMemoryAuthStateStore({ now })
  const requireSharedStore =
    boolFromEnv(env.NOVEL_AUTH_REQUIRE_REDIS, false) ||
    (isProductionMode(env) && Boolean(String(redisUrl || env.REDIS_URL || '').trim()))

  function openAuthEnabled() {
    if (typeof allowOpenAuth === 'boolean') return allowOpenAuth
    return boolFromEnv(env.NOVEL_ALLOW_OPEN_AUTH, false)
  }

  function inProduction() {
    if (typeof productionMode === 'boolean') return productionMode
    return isProductionMode(env)
  }

  function trustProxyEnabled() {
    if (typeof trustProxy === 'boolean') return trustProxy
    return boolFromEnv(env.NOVEL_TRUST_PROXY, false)
  }

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
      String(req.headers?.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const separator = part.indexOf('=')
          return separator === -1
            ? [part, '']
            : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
        })
    )
  }

  async function getBookshelfPassword() {
    return String((await resolveMaybePromise(storeGet(LEGACY_PASSWORD_KEY))) || '')
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

  function isSecureAuthRequest(req) {
    return isLoopbackRequest(req) || isHttpsRequest(req)
  }

  function clientAddress(req) {
    if (trustProxyEnabled()) {
      const forwarded = String(req.headers?.['x-forwarded-for'] || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)[0]
      if (forwarded) return forwarded
    }
    return String(req.socket?.remoteAddress || 'unknown')
  }

  function setAuthCookie(req, res, token) {
    const secure = isHttpsRequest(req) ? '; Secure' : ''
    res.setHeader(
      'Set-Cookie',
      `dreamloom_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(AUTH_SESSION_MAX_AGE_MS / 1000)}${secure}`
    )
  }

  async function clearAuthCookie(req, res) {
    const token = parseCookies(req).dreamloom_session
    if (token) {
      try {
        await resolvedStateStore.deleteSession(hashSessionToken(token))
      } catch {}
    }
    const secure = isHttpsRequest(req) ? '; Secure' : ''
    res.setHeader(
      'Set-Cookie',
      `dreamloom_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    )
  }

  async function assertStateStoreReady(action = '会话操作') {
    if (resolvedStateStore.kind === 'redis') return
    if (requireSharedStore) throw safeAuthError(`${action}失败：共享会话存储不可用`, 503)
  }

  async function createSession(passwordOrCredential) {
    await assertStateStoreReady('创建会话')
    const credential = String(passwordOrCredential || '')
    const token = random(32).toString('hex')
    try {
      await resolvedStateStore.setSession(
        hashSessionToken(token),
        {
          // store fingerprint of the credential, never the raw token
          passwordHash: passwordDigest(credential).toString('hex'),
          createdAt: now()
        },
        AUTH_SESSION_MAX_AGE_MS
      )
    } catch {
      throw safeAuthError('创建会话失败，请稍后重试', 503)
    }
    return token
  }

  async function storeAccessKey(accessKey) {
    const value = String(accessKey || '')
    if (value.length < 8 || value.length > 128 || /\s/.test(value)) {
      throw new Error('密钥长度须为 8-128 位，且不可包含空格')
    }
    const credential = hashAccessKey(value)
    await resolveMaybePromise(storeSet(LEGACY_PASSWORD_KEY, credential))
    try { await resolvedStateStore.clearSessions() } catch {}
    return credential
  }

  async function clearAccessKey() {
    await resolveMaybePromise(storeDelete(LEGACY_PASSWORD_KEY))
    try { await resolvedStateStore.clearSessions() } catch {}
  }

  async function normalizeStoredCredential(accessKey, credential) {
    if (String(credential).startsWith('scrypt$v1$')) return credential
    return storeAccessKey(accessKey)
  }

  async function activeLoginFailures(req) {
    const key = clientAddress(req)
    const cutoff = now() - LOGIN_WINDOW_MS
    let failures = []
    try {
      failures = (await resolvedStateStore.getLoginFailures(key)).filter((time) => time > cutoff)
      await resolvedStateStore.setLoginFailures(key, failures)
    } catch {
      failures = []
    }
    return { key, failures }
  }

  async function checkLoginAllowed(req) {
    const { failures } = await activeLoginFailures(req)
    if (failures.length < MAX_LOGIN_FAILURES) return { allowed: true, retryAfterSeconds: 0 }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((failures[0] + LOGIN_WINDOW_MS - now()) / 1000))
    }
  }

  async function recordLoginFailure(req) {
    const { key, failures } = await activeLoginFailures(req)
    failures.push(now())
    try { await resolvedStateStore.setLoginFailures(key, failures) } catch {}
  }

  async function clearLoginFailures(req) {
    try { await resolvedStateStore.clearLoginFailures(clientAddress(req)) } catch {}
  }

  async function getAuthenticatedSession(req) {
    const password = await getBookshelfPassword()
    if (!password) {
      if (openAuthEnabled()) {
        if (inProduction() && !isLoopbackRequest(req)) {
          return { authenticated: false, passwordConfigured: false }
        }
        return { authenticated: true, passwordConfigured: false }
      }
      return { authenticated: false, passwordConfigured: false }
    }

    const token = parseCookies(req).dreamloom_session
    if (!token) return { authenticated: false, passwordConfigured: true }

    let session = null
    try {
      session = await resolvedStateStore.getSession(hashSessionToken(token))
    } catch {
      return { authenticated: false, passwordConfigured: true }
    }

    if (!session || session.expiresAt <= now()) {
      try { await resolvedStateStore.deleteSession(hashSessionToken(token)) } catch {}
      return { authenticated: false, passwordConfigured: true }
    }

    if (session.passwordHash !== passwordDigest(password).toString('hex')) {
      try { await resolvedStateStore.deleteSession(hashSessionToken(token)) } catch {}
      return { authenticated: false, passwordConfigured: true }
    }

    return { authenticated: true, passwordConfigured: true }
  }

  return {
    getAuthenticatedSession,
    getBookshelfPassword,
    passwordsMatch,
    storeAccessKey,
    clearAccessKey,
    normalizeStoredCredential,
    isSecureAuthRequest,
    isHttpsRequest,
    isLoopbackRequest,
    isOpenAuthEnabled: openAuthEnabled,
    checkLoginAllowed,
    recordLoginFailure,
    clearLoginFailures,
    createSession,
    setAuthCookie,
    clearAuthCookie,
    getStateStoreKind: () => resolvedStateStore.kind || 'memory',
    getStateStore: () => resolvedStateStore,
    hashSessionToken,
    AUTH_SESSION_MAX_AGE_MS
  }
}

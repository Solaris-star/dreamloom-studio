import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const AUTH_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_FAILURES = 5

function passwordDigest(password) {
  return createHash('sha256').update(String(password || '')).digest()
}

export function createWebAuthService({
  storeGet,
  storeSet,
  storeDelete,
  now = () => Date.now(),
  random = randomBytes
}) {
  const authSessions = new Map()
  const loginFailures = new Map()

  function passwordsMatch(actual, expected) {
    const stored = String(expected || '')
    if (stored.startsWith('scrypt$v1$')) {
      const [, , saltHex, hashHex] = stored.split('$')
      if (!saltHex || !hashHex) return false
      const actualHash = scryptSync(String(actual || ''), Buffer.from(saltHex, 'hex'), 64)
      const expectedHash = Buffer.from(hashHex, 'hex')
      return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash)
    }
    return timingSafeEqual(passwordDigest(actual), passwordDigest(expected))
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

  function getBookshelfPassword() {
    return String(storeGet('bookshelfPassword') || '')
  }

  function getAuthenticatedSession(req) {
    const password = getBookshelfPassword()
    if (!password) return { authenticated: true, passwordConfigured: false }
    const token = parseCookies(req).dreamloom_session
    const session = token ? authSessions.get(token) : null
    if (
      !session ||
      session.expiresAt <= now() ||
      session.passwordHash !== passwordDigest(password).toString('hex')
    ) {
      if (token) authSessions.delete(token)
      return { authenticated: false, passwordConfigured: true }
    }
    return { authenticated: true, passwordConfigured: true }
  }

  function isLoopbackRequest(req) {
    const address = String(req.socket?.remoteAddress || '')
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  function isHttpsRequest(req) {
    if (req.socket?.encrypted) return true
    const trustProxy = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.NOVEL_TRUST_PROXY || '').trim().toLowerCase()
    )
    return (
      trustProxy &&
      String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https'
    )
  }

  function isSecureAuthRequest(req) {
    return isLoopbackRequest(req) || isHttpsRequest(req)
  }

  function setAuthCookie(req, res, token) {
    const secure = isHttpsRequest(req) ? '; Secure' : ''
    res.setHeader(
      'Set-Cookie',
      `dreamloom_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(AUTH_SESSION_MAX_AGE_MS / 1000)}${secure}`
    )
  }

  function clearAuthCookie(req, res) {
    const token = parseCookies(req).dreamloom_session
    if (token) authSessions.delete(token)
    res.setHeader(
      'Set-Cookie',
      'dreamloom_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
    )
  }

  function createSession(password) {
    const token = random(32).toString('hex')
    authSessions.set(token, {
      passwordHash: passwordDigest(password).toString('hex'),
      expiresAt: now() + AUTH_SESSION_MAX_AGE_MS
    })
    return token
  }

  function storeAccessKey(accessKey) {
    const credential = hashAccessKey(accessKey)
    storeSet('bookshelfPassword', credential)
    return credential
  }

  function clearAccessKey() {
    storeDelete('bookshelfPassword')
    authSessions.clear()
  }

  function normalizeStoredCredential(accessKey, credential) {
    if (String(credential).startsWith('scrypt$v1$')) return credential
    const hashed = storeAccessKey(accessKey)
    authSessions.clear()
    return hashed
  }

  function loginClientKey(req) {
    return String(req.socket?.remoteAddress || 'unknown')
  }

  function activeLoginFailures(req) {
    const key = loginClientKey(req)
    const cutoff = now() - LOGIN_WINDOW_MS
    const failures = (loginFailures.get(key) || []).filter((time) => time > cutoff)
    if (failures.length) loginFailures.set(key, failures)
    else loginFailures.delete(key)
    return { key, failures }
  }

  function checkLoginAllowed(req) {
    const { failures } = activeLoginFailures(req)
    if (failures.length < MAX_LOGIN_FAILURES) return { allowed: true, retryAfterSeconds: 0 }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((failures[0] + LOGIN_WINDOW_MS - now()) / 1000)
      )
    }
  }

  function recordLoginFailure(req) {
    const { key, failures } = activeLoginFailures(req)
    failures.push(now())
    loginFailures.set(key, failures)
  }

  function clearLoginFailures(req) {
    loginFailures.delete(loginClientKey(req))
  }

  return {
    getAuthenticatedSession,
    getBookshelfPassword,
    passwordsMatch,
    storeAccessKey,
    clearAccessKey,
    normalizeStoredCredential,
    isSecureAuthRequest,
    checkLoginAllowed,
    recordLoginFailure,
    clearLoginFailures,
    createSession,
    setAuthCookie,
    clearAuthCookie
  }
}

const ROUTES = new Set([
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/access-key'
])

export function isAuthRoute(path) {
  return ROUTES.has(path)
}

export function handleAuthRoute({
  path,
  body,
  req,
  res,
  sendJson,
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
}) {
  if (!isAuthRoute(path)) return false

  if (path === '/api/auth/status') {
    const auth = getAuthenticatedSession(req)
    sendJson(res, { success: true, ...auth })
    return true
  }

  if (path === '/api/auth/login') {
    if (!isSecureAuthRequest(req)) {
      sendJson(res, { success: false, message: '远程登录必须使用 HTTPS' }, 426)
      return true
    }
    const loginLimit = checkLoginAllowed(req)
    if (!loginLimit.allowed) {
      sendJson(
        res,
        { success: false, message: `尝试次数过多，请在 ${loginLimit.retryAfterSeconds} 秒后重试` },
        429
      )
      return true
    }
    const password = getBookshelfPassword()
    if (!password) {
      sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
      return true
    }
    if (!passwordsMatch(body?.password, password)) {
      recordLoginFailure(req)
      sendJson(res, { success: false, message: '密码错误' }, 401)
      return true
    }
    clearLoginFailures(req)
    const credential = normalizeStoredCredential(body?.password, password)
    const token = createSession(credential)
    setAuthCookie(req, res, token)
    sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
    return true
  }

  if (path === '/api/auth/access-key') {
    const storedCredential = getBookshelfPassword()
    const auth = getAuthenticatedSession(req)
    if (storedCredential && !auth.authenticated) {
      sendJson(res, { success: false, message: '需要先登录' }, 401)
      return true
    }
    if (storedCredential && !passwordsMatch(body?.currentKey, storedCredential)) {
      sendJson(res, { success: false, message: '原密钥错误' }, 401)
      return true
    }
    const newKey = String(body?.newKey || '')
    if (!newKey) {
      clearAccessKey()
      clearAuthCookie(req, res)
      sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
      return true
    }
    if (newKey.length < 8 || newKey.length > 128 || /\s/.test(newKey)) {
      sendJson(res, { success: false, message: '密钥长度须为 8-128 位，且不可包含空格' }, 400)
      return true
    }
    const credential = storeAccessKey(newKey)
    const token = createSession(credential)
    setAuthCookie(req, res, token)
    sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
    return true
  }

  clearAuthCookie(req, res)
  sendJson(res, { success: true })
  return true
}

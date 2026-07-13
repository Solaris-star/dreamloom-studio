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
  auth
}) {
  if (!isAuthRoute(path)) return false

  if (path === '/api/auth/status') {
    const status = auth.getAuthenticatedSession(req)
    sendJson(res, { success: true, ...status })
    return true
  }

  if (path === '/api/auth/login') {
    if (!auth.isSecureAuthRequest(req)) {
      sendJson(res, { success: false, message: '远程登录必须使用 HTTPS' }, 426)
      return true
    }
    const loginLimit = auth.checkLoginAllowed(req)
    if (!loginLimit.allowed) {
      sendJson(
        res,
        { success: false, message: `尝试次数过多，请在 ${loginLimit.retryAfterSeconds} 秒后重试` },
        429
      )
      return true
    }
    const password = auth.getBookshelfPassword()
    if (!password) {
      sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
      return true
    }
    if (!auth.passwordsMatch(body?.password, password)) {
      auth.recordLoginFailure(req)
      sendJson(res, { success: false, message: '密码错误' }, 401)
      return true
    }
    auth.clearLoginFailures(req)
    const credential = auth.normalizeStoredCredential(body?.password, password)
    const token = auth.createSession(credential)
    auth.setAuthCookie(req, res, token)
    sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
    return true
  }

  if (path === '/api/auth/access-key') {
    const storedCredential = auth.getBookshelfPassword()
    const status = auth.getAuthenticatedSession(req)
    if (storedCredential && !status.authenticated) {
      sendJson(res, { success: false, message: '需要先登录' }, 401)
      return true
    }
    if (storedCredential && !auth.passwordsMatch(body?.currentKey, storedCredential)) {
      sendJson(res, { success: false, message: '原密钥错误' }, 401)
      return true
    }
    const newKey = String(body?.newKey || '')
    if (!newKey) {
      auth.clearAccessKey()
      auth.clearAuthCookie(req, res)
      sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
      return true
    }
    if (newKey.length < 8 || newKey.length > 128 || /\s/.test(newKey)) {
      sendJson(res, { success: false, message: '密钥长度须为 8-128 位，且不可包含空格' }, 400)
      return true
    }
    const credential = auth.storeAccessKey(newKey)
    const token = auth.createSession(credential)
    auth.setAuthCookie(req, res, token)
    sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
    return true
  }

  auth.clearAuthCookie(req, res)
  sendJson(res, { success: true })
  return true
}

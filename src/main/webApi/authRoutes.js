const ROUTES = new Set(['/api/auth/status', '/api/auth/login', '/api/auth/logout'])

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
  createSession,
  setAuthCookie,
  clearAuthCookie
}) {
  if (!isAuthRoute(path)) return false

  if (path === '/api/auth/status') {
    const auth = getAuthenticatedSession(req)
    const password = getBookshelfPassword()
    const hint = password
      ? password.length <= 4
        ? '****'
        : `${password.slice(0, 2)}****${password.slice(-2)}`
      : ''
    sendJson(res, { success: true, ...auth, hint })
    return true
  }

  if (path === '/api/auth/login') {
    const password = getBookshelfPassword()
    if (!password) {
      sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
      return true
    }
    if (!passwordsMatch(body?.password, password)) {
      sendJson(res, { success: false, message: '密码错误' }, 401)
      return true
    }
    const token = createSession(password)
    setAuthCookie(res, token)
    sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
    return true
  }

  clearAuthCookie(req, res)
  sendJson(res, { success: true })
  return true
}

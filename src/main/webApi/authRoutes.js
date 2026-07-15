const ROUTES = new Set([
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/access-key'
])

export function isAuthRoute(path) {
  return ROUTES.has(path)
}

function publicErrorMessage(error, fallback = '请求失败') {
  if (!error) return fallback
  if (error.expose === true && error.message) return String(error.message)
  if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 429) {
    return String(error.message || fallback)
  }
  const message = String(error.message || '')
  if (/redis|ioredis|ECONNREFUSED|ENOTFOUND|absolute|\/Users\/|\/home\/|token|password|secret/i.test(message)) {
    return fallback
  }
  if (error.statusCode && error.statusCode < 500 && message) return message
  return fallback
}

export async function handleAuthRoute({
  path,
  body,
  req,
  res,
  sendJson,
  auth
}) {
  if (!isAuthRoute(path)) return false

  if (path === '/api/auth/status') {
    const status = await auth.getAuthenticatedSession(req)
    sendJson(res, { success: true, ...status })
    return true
  }

  if (path === '/api/auth/login') {
    if (!auth.isSecureAuthRequest(req)) {
      sendJson(res, { success: false, message: '远程登录必须使用 HTTPS' }, 426)
      return true
    }
    const loginLimit = await auth.checkLoginAllowed(req)
    if (!loginLimit.allowed) {
      sendJson(
        res,
        { success: false, message: `尝试次数过多，请在 ${loginLimit.retryAfterSeconds} 秒后重试` },
        429
      )
      return true
    }

    try {
      const password = await auth.getBookshelfPassword()
      if (!password) {
        const openEnabled = typeof auth.isOpenAuthEnabled === 'function' ? auth.isOpenAuthEnabled() : false
        if (openEnabled) {
          const status = await auth.getAuthenticatedSession(req)
          if (status.authenticated && !status.passwordConfigured) {
            sendJson(res, { success: true, authenticated: true, passwordConfigured: false })
            return true
          }
        }
        sendJson(
          res,
          {
            success: false,
            message: '未配置认证密钥，请先设置书架密码',
            authenticated: false,
            passwordConfigured: false
          },
          503
        )
        return true
      }

      if (!auth.passwordsMatch(body?.password, password)) {
        await auth.recordLoginFailure(req)
        sendJson(res, { success: false, message: '密码错误' }, 401)
        return true
      }

      await auth.clearLoginFailures(req)
      const credential = await auth.normalizeStoredCredential(body?.password, password)
      const token = await auth.createSession(credential)
      auth.setAuthCookie(req, res, token)
      sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
      return true
    } catch (error) {
      sendJson(
        res,
        { success: false, message: publicErrorMessage(error, '登录失败，请稍后重试') },
        error.statusCode || 500
      )
      return true
    }
  }

  if (path === '/api/auth/access-key') {
    try {
      const storedCredential = await auth.getBookshelfPassword()
      const status = await auth.getAuthenticatedSession(req)
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
        await auth.clearAccessKey()
        await auth.clearAuthCookie(req, res)
        const openEnabled = typeof auth.isOpenAuthEnabled === 'function' ? auth.isOpenAuthEnabled() : false
        sendJson(res, {
          success: true,
          authenticated: openEnabled,
          passwordConfigured: false
        })
        return true
      }
      if (newKey.length < 8 || newKey.length > 128 || /\s/.test(newKey)) {
        sendJson(res, { success: false, message: '密钥长度须为 8-128 位，且不可包含空格' }, 400)
        return true
      }
      const credential = await auth.storeAccessKey(newKey)
      const token = await auth.createSession(credential)
      auth.setAuthCookie(req, res, token)
      sendJson(res, { success: true, authenticated: true, passwordConfigured: true })
      return true
    } catch (error) {
      sendJson(
        res,
        { success: false, message: publicErrorMessage(error, '更新密钥失败') },
        error.statusCode || 400
      )
      return true
    }
  }

  await auth.clearAuthCookie(req, res)
  sendJson(res, { success: true })
  return true
}

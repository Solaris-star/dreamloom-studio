const ROUTES = new Set([
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/access-key',
  '/api/auth/keys',
  '/api/auth/keys/create',
  '/api/auth/keys/revoke'
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

async function requireAdmin(auth, req, res, sendJson) {
  const status = await auth.getAuthenticatedSession(req)
  if (!status.authenticated) {
    sendJson(res, { success: false, message: '需要书架密码认证' }, 401)
    return null
  }
  if (!status.canManageKeys) {
    sendJson(res, { success: false, message: '仅管理员可管理密钥' }, 403)
    return null
  }
  return status
}

export async function handleAuthRoute({ path, body, req, res, sendJson, auth }) {
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
      sendJson(res, { success: false, message: `尝试次数过多，请在 ${loginLimit.retryAfterSeconds} 秒后重试` }, 429)
      return true
    }

    const keys = await auth.listPublicAccessKeys()
    if (!keys.length) {
      const openEnabled = typeof auth.isOpenAuthEnabled === 'function' ? auth.isOpenAuthEnabled() : false
      if (openEnabled) {
        const status = await auth.getAuthenticatedSession(req)
        if (status.authenticated && !status.passwordConfigured) {
          sendJson(res, {
            success: true,
            authenticated: true,
            passwordConfigured: false,
            role: 'admin',
            keyId: 'admin',
            ownerId: null,
            canManageKeys: true
          })
          return true
        }
      }
      sendJson(res, {
        success: false,
        message: '未配置认证密钥，请先设置书架密码',
        passwordConfigured: false,
        authenticated: false
      }, 503)
      return true
    }

    try {
      const matched = await auth.findMatchingKey(body?.password)
      if (!matched) {
        await auth.recordLoginFailure(req)
        sendJson(res, { success: false, message: '密码错误' }, 401)
        return true
      }

      let sessionKey = matched
      if (matched.role === 'admin' && !String(matched.credential).startsWith('scrypt$v1$')) {
        await auth.normalizeStoredCredential(body?.password, matched.credential)
        sessionKey = (await auth.findMatchingKey(body?.password)) || matched
      }

      await auth.clearLoginFailures(req)
      const token = await auth.createSession(sessionKey)
      auth.setAuthCookie(req, res, token)
      const status = await auth.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${encodeURIComponent(token)}` },
        socket: req.socket
      })
      sendJson(res, {
        success: true,
        authenticated: true,
        passwordConfigured: true,
        role: status.role || sessionKey.role,
        keyId: status.keyId || sessionKey.id,
        ownerId: status.ownerId ?? (sessionKey.role === 'guest' ? sessionKey.id : null),
        canManageKeys: (status.role || sessionKey.role) === 'admin',
        label: status.label || sessionKey.label
      })
      return true
    } catch (error) {
      sendJson(res, { success: false, message: publicErrorMessage(error, '登录失败，请稍后重试') }, error.statusCode || 500)
      return true
    }
  }

  if (path === '/api/auth/access-key') {
    const status = await auth.getAuthenticatedSession(req)
    const passwordConfigured = (await auth.listPublicAccessKeys()).length > 0
    if (passwordConfigured && !status.authenticated) {
      sendJson(res, { success: false, message: '需要先登录' }, 401)
      return true
    }
    if (passwordConfigured && !status.canManageKeys) {
      sendJson(res, { success: false, message: '仅管理员可修改管理员密钥' }, 403)
      return true
    }

    try {
      const result = await auth.updateAdminKey({ currentKey: body?.currentKey, newKey: body?.newKey })
      if (!result.passwordConfigured) {
        await auth.clearAuthCookie(req, res)
        const openEnabled = typeof auth.isOpenAuthEnabled === 'function' ? auth.isOpenAuthEnabled() : false
        sendJson(res, openEnabled ? {
          success: true, authenticated: true, passwordConfigured: false, role: 'admin', keyId: 'admin', ownerId: null, canManageKeys: true
        } : {
          success: true, authenticated: false, passwordConfigured: false, role: null, keyId: null, ownerId: null, canManageKeys: false
        })
        return true
      }
      const admin = await auth.findMatchingKey(body?.newKey)
      const token = await auth.createSession(admin)
      auth.setAuthCookie(req, res, token)
      sendJson(res, {
        success: true, authenticated: true, passwordConfigured: true, role: 'admin', keyId: 'admin', ownerId: null, canManageKeys: true,
        label: admin?.label || '管理员密钥'
      })
      return true
    } catch (error) {
      sendJson(res, { success: false, message: publicErrorMessage(error, '更新密钥失败') }, error.statusCode || 400)
      return true
    }
  }

  if (path === '/api/auth/keys') {
    const admin = await requireAdmin(auth, req, res, sendJson)
    if (!admin) return true
    sendJson(res, { success: true, keys: await auth.listPublicAccessKeys(), me: admin })
    return true
  }

  if (path === '/api/auth/keys/create') {
    const admin = await requireAdmin(auth, req, res, sendJson)
    if (!admin) return true
    try {
      const plainKey = String(body?.plainKey || auth.generateGuestPlainKey())
      const created = await auth.createGuestKey({ label: body?.label, plainKey, createdBy: admin.keyId || 'admin' })
      sendJson(res, {
        success: true, key: created.key, plainKey: created.plainKey,
        message: '访客密钥已创建，请立即保存明文密钥（只显示一次）'
      })
      return true
    } catch (error) {
      sendJson(res, { success: false, message: publicErrorMessage(error, '创建访客密钥失败') }, error.statusCode || 400)
      return true
    }
  }

  if (path === '/api/auth/keys/revoke') {
    const admin = await requireAdmin(auth, req, res, sendJson)
    if (!admin) return true
    try {
      await auth.revokeAccessKey(body?.id || body?.keyId)
      sendJson(res, { success: true, keys: await auth.listPublicAccessKeys() })
      return true
    } catch (error) {
      sendJson(res, { success: false, message: publicErrorMessage(error, '删除密钥失败') }, error.statusCode || 400)
      return true
    }
  }

  await auth.clearAuthCookie(req, res)
  sendJson(res, { success: true })
  return true
}

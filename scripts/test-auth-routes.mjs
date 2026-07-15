import assert from 'node:assert/strict'
import { handleAuthRoute, isAuthRoute } from '../src/main/webApi/authRoutes.js'

const responses = []
const cookies = []
const cleared = []
let configuredPassword = ''
let authenticated = false
let openAuthEnabled = false

const auth = {
  getAuthenticatedSession: async () => ({
    authenticated: (!configuredPassword && openAuthEnabled) || authenticated,
    passwordConfigured: Boolean(configuredPassword)
  }),
  getBookshelfPassword: async () => configuredPassword,
  passwordsMatch: (actual, expected) => actual === expected,
  storeAccessKey: async (key) => {
    configuredPassword = `stored:${key}`
    return configuredPassword
  },
  clearAccessKey: async () => {
    configuredPassword = ''
  },
  normalizeStoredCredential: async (_key, credential) => credential,
  isSecureAuthRequest: () => true,
  isOpenAuthEnabled: () => openAuthEnabled,
  checkLoginAllowed: async () => ({ allowed: true, retryAfterSeconds: 0 }),
  recordLoginFailure: async () => {},
  clearLoginFailures: async () => {},
  createSession: async (password) => `token:${password}`,
  setAuthCookie: (_req, _res, token) => cookies.push(token),
  clearAuthCookie: async (req, res) => cleared.push([req, res])
}
const common = {
  req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
  res: {},
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  auth
}

for (const path of ['/api/auth/status', '/api/auth/login', '/api/auth/logout', '/api/auth/access-key']) {
  assert.equal(isAuthRoute(path), true)
}
assert.equal(isAuthRoute('/api/books/list'), false)
assert.equal(await handleAuthRoute({ ...common, path: '/api/books/list' }), false)

openAuthEnabled = false
configuredPassword = ''
authenticated = false
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: false,
  passwordConfigured: false
})

openAuthEnabled = true
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: true,
  passwordConfigured: false
})

await handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  auth: { ...auth, isSecureAuthRequest: () => false },
  body: { password: 'test1234' }
})
assert.deepEqual(responses.at(-1), [
  { success: false, message: '远程登录必须使用 HTTPS' },
  426
])

openAuthEnabled = false
configuredPassword = ''
await handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.equal(responses.at(-1)[1], 503)
assert.equal(responses.at(-1)[0].authenticated, false)

openAuthEnabled = true
await handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: true,
  passwordConfigured: false
})

configuredPassword = 'test1234'
authenticated = false
openAuthEnabled = false
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: false,
  passwordConfigured: true
})

authenticated = true
await handleAuthRoute({
  ...common,
  path: '/api/auth/access-key',
  body: { currentKey: 'test1234', newKey: 'newKey1234' }
})
assert.equal(configuredPassword, 'stored:newKey1234')
assert.equal(cookies.at(-1), 'token:stored:newKey1234')

configuredPassword = 'test1234'
const cookieCountBeforeFailedLogin = cookies.length
await handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  body: { password: 'wrong' }
})
assert.deepEqual(responses.at(-1), [{ success: false, message: '密码错误' }, 401])
assert.equal(cookies.length, cookieCountBeforeFailedLogin)

await handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  body: { password: 'test1234' }
})
assert.equal(cookies.at(-1), 'token:test1234')
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: true,
  passwordConfigured: true
})

await handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  body: { password: 'test1234' },
  auth: {
    ...auth,
    createSession: async () => {
      const error = new Error('创建会话失败：共享会话存储不可用')
      error.statusCode = 503
      error.expose = true
      throw error
    }
  }
})
assert.equal(responses.at(-1)[1], 503)
assert.doesNotMatch(JSON.stringify(responses.at(-1)[0]), /redis:\/\/|secret-host/i)

await handleAuthRoute({ ...common, path: '/api/auth/logout' })
assert.equal(cleared.length, 1)
assert.deepEqual(responses.at(-1)[0], { success: true })

console.log('认证路由测试通过')

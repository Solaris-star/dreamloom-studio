import assert from 'node:assert/strict'
import { handleAuthRoute, isAuthRoute } from '../src/main/webApi/authRoutes.js'

const responses = []
const cookies = []
const cleared = []
let configuredPassword = ''
let authenticated = false

const common = {
  req: { headers: {} },
  res: {},
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  getAuthenticatedSession: () => ({
    authenticated: !configuredPassword || authenticated,
    passwordConfigured: Boolean(configuredPassword)
  }),
  getBookshelfPassword: () => configuredPassword,
  passwordsMatch: (actual, expected) => actual === expected,
  storeAccessKey: (key) => {
    configuredPassword = `stored:${key}`
    return configuredPassword
  },
  clearAccessKey: () => {
    configuredPassword = ''
  },
  normalizeStoredCredential: (_key, credential) => credential,
  isSecureAuthRequest: () => true,
  checkLoginAllowed: () => ({ allowed: true, retryAfterSeconds: 0 }),
  recordLoginFailure: () => {},
  clearLoginFailures: () => {},
  createSession: (password) => `token:${password}`,
  setAuthCookie: (_req, _res, token) => cookies.push(token),
  clearAuthCookie: (req, res) => cleared.push([req, res])
}

for (const path of ['/api/auth/status', '/api/auth/login', '/api/auth/logout', '/api/auth/access-key']) {
  assert.equal(isAuthRoute(path), true)
}
assert.equal(isAuthRoute('/api/books/list'), false)
assert.equal(handleAuthRoute({ ...common, path: '/api/books/list' }), false)

handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: true,
  passwordConfigured: false
})

handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  isSecureAuthRequest: () => false,
  body: { password: 'test1234' }
})
assert.deepEqual(responses.at(-1), [
  { success: false, message: '远程登录必须使用 HTTPS' },
  426
])

handleAuthRoute({
  ...common,
  req: { headers: { 'x-forwarded-proto': 'https' }, socket: { remoteAddress: '203.0.113.8' } },
  path: '/api/auth/login',
  isSecureAuthRequest: () => false,
  body: { password: 'test1234' }
})
assert.equal(responses.at(-1)[1], 426)

configuredPassword = 'test1234'
handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: false,
  passwordConfigured: true
})

authenticated = true
handleAuthRoute({
  ...common,
  path: '/api/auth/access-key',
  body: { currentKey: 'test1234', newKey: 'newKey1234' }
})
assert.equal(configuredPassword, 'stored:newKey1234')
assert.equal(cookies.at(-1), 'token:stored:newKey1234')

configuredPassword = ''
handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.deepEqual(responses.at(-1), [
  { success: true, authenticated: true, passwordConfigured: false },
  undefined
])

configuredPassword = 'test1234'
const cookieCountBeforeFailedLogin = cookies.length
handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  body: { password: 'wrong' }
})
assert.deepEqual(responses.at(-1), [{ success: false, message: '密码错误' }, 401])
assert.equal(cookies.length, cookieCountBeforeFailedLogin)

handleAuthRoute({
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

handleAuthRoute({ ...common, path: '/api/auth/logout' })
assert.equal(cleared.length, 1)
assert.deepEqual(responses.at(-1)[0], { success: true })

console.log('认证路由测试通过')

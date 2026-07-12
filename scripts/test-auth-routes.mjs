import assert from 'node:assert/strict'
import { handleAuthRoute, isAuthRoute } from '../src/main/webApi/authRoutes.js'

const responses = []
const cookies = []
const cleared = []
let configuredPassword = ''

const common = {
  req: { headers: {} },
  res: {},
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  getAuthenticatedSession: () => ({
    authenticated: !configuredPassword,
    passwordConfigured: Boolean(configuredPassword)
  }),
  getBookshelfPassword: () => configuredPassword,
  passwordsMatch: (actual, expected) => actual === expected,
  createSession: (password) => `token:${password}`,
  setAuthCookie: (_res, token) => cookies.push(token),
  clearAuthCookie: (req, res) => cleared.push([req, res])
}

for (const path of ['/api/auth/status', '/api/auth/login', '/api/auth/logout']) {
  assert.equal(isAuthRoute(path), true)
}
assert.equal(isAuthRoute('/api/books/list'), false)
assert.equal(handleAuthRoute({ ...common, path: '/api/books/list' }), false)

handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  authenticated: true,
  passwordConfigured: false,
  hint: ''
})

configuredPassword = 'test1234'
handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.equal(responses.at(-1)[0].hint, 'te****34')

configuredPassword = '1234'
handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.equal(responses.at(-1)[0].hint, '****')

configuredPassword = ''
handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.deepEqual(responses.at(-1), [
  { success: true, authenticated: true, passwordConfigured: false },
  undefined
])

configuredPassword = 'test1234'
handleAuthRoute({
  ...common,
  path: '/api/auth/login',
  body: { password: 'wrong' }
})
assert.deepEqual(responses.at(-1), [{ success: false, message: '密码错误' }, 401])
assert.equal(cookies.length, 0)

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

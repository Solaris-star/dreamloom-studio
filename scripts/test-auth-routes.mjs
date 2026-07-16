import assert from 'node:assert/strict'
import { handleAuthRoute, isAuthRoute } from '../src/main/webApi/authRoutes.js'

const responses = []
const cookies = []
const cleared = []
let configuredPassword = ''
let authenticated = false
let role = 'admin'
let keyId = 'admin'
let openAuthEnabled = false
const guestKeys = []

const auth = {
  getAuthenticatedSession: async () => ({
    authenticated: (!configuredPassword && openAuthEnabled) || authenticated,
    passwordConfigured: Boolean(configuredPassword),
    role: !configuredPassword && openAuthEnabled ? 'admin' : role,
    keyId: !configuredPassword && openAuthEnabled ? 'admin' : keyId,
    ownerId: role === 'guest' ? keyId : null,
    canManageKeys: (!configuredPassword && openAuthEnabled) || role === 'admin',
    label: role === 'guest' ? '访客' : '管理员密钥'
  }),
  getBookshelfPassword: async () => configuredPassword,
  passwordsMatch: (actual, expected) => actual === expected,
  storeAccessKey: async (key) => { configuredPassword = `stored:${key}`; return configuredPassword },
  clearAccessKey: async () => { configuredPassword = ''; guestKeys.length = 0 },
  normalizeStoredCredential: async (_key, credential) => credential,
  isSecureAuthRequest: () => true,
  isOpenAuthEnabled: () => openAuthEnabled,
  checkLoginAllowed: async () => ({ allowed: true, retryAfterSeconds: 0 }),
  recordLoginFailure: async () => {},
  clearLoginFailures: async () => {},
  createSession: async (key) => `token:${key.id || key}`,
  setAuthCookie: (_req, _res, token) => cookies.push(token),
  clearAuthCookie: async (req, res) => cleared.push([req, res]),
  listPublicAccessKeys: async () => {
    const keys = []
    if (configuredPassword) keys.push({ id: 'admin', role: 'admin', label: '管理员密钥', createdAt: 't0' })
    return keys.concat(guestKeys)
  },
  findMatchingKey: async (password) => {
    if (configuredPassword && (password === configuredPassword || password === 'test1234' || configuredPassword === `stored:${password}`)) {
      return { id: 'admin', role: 'admin', label: '管理员密钥', credential: configuredPassword }
    }
    const guest = guestKeys.find((item) => item.plain === password)
    if (guest) return { id: guest.id, role: 'guest', label: guest.label, credential: guest.plain }
    return null
  },
  createGuestKey: async ({ label, plainKey }) => {
    const item = { id: `guest_${guestKeys.length + 1}`, role: 'guest', label: label || '访客密钥', plain: plainKey || 'guest-auto-key' }
    guestKeys.push(item)
    return { key: { id: item.id, role: item.role, label: item.label }, plainKey: item.plain }
  },
  revokeAccessKey: async (id) => {
    const index = guestKeys.findIndex((item) => item.id === id)
    if (index === -1) throw new Error('密钥不存在')
    guestKeys.splice(index, 1)
    return true
  },
  updateAdminKey: async ({ currentKey, newKey }) => {
    if (configuredPassword && currentKey !== 'test1234' && currentKey !== configuredPassword) {
      const error = new Error('原密钥错误'); error.statusCode = 401; throw error
    }
    if (!newKey) { configuredPassword = ''; return { passwordConfigured: false } }
    configuredPassword = `stored:${newKey}`
    return { passwordConfigured: true }
  },
  generateGuestPlainKey: () => 'guest-auto-key'
}
const common = {
  req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
  res: {},
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  auth
}

for (const path of ['/api/auth/status','/api/auth/login','/api/auth/logout','/api/auth/access-key','/api/auth/keys','/api/auth/keys/create','/api/auth/keys/revoke']) {
  assert.equal(isAuthRoute(path), true)
}
assert.equal(isAuthRoute('/api/books/list'), false)
assert.equal(await handleAuthRoute({ ...common, path: '/api/books/list' }), false)

openAuthEnabled = false
configuredPassword = ''
authenticated = false
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.equal(responses.at(-1)[0].authenticated, false)

openAuthEnabled = true
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.equal(responses.at(-1)[0].authenticated, true)

await handleAuthRoute({ ...common, path: '/api/auth/login', auth: { ...auth, isSecureAuthRequest: () => false }, body: { password: 'test1234' } })
assert.deepEqual(responses.at(-1), [{ success: false, message: '远程登录必须使用 HTTPS' }, 426])

openAuthEnabled = false
configuredPassword = ''
await handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.equal(responses.at(-1)[1], 503)

openAuthEnabled = true
await handleAuthRoute({ ...common, path: '/api/auth/login', body: {} })
assert.equal(responses.at(-1)[0].authenticated, true)

configuredPassword = 'test1234'
authenticated = false
openAuthEnabled = false
await handleAuthRoute({ ...common, path: '/api/auth/status' })
assert.equal(responses.at(-1)[0].authenticated, false)

authenticated = true
await handleAuthRoute({ ...common, path: '/api/auth/access-key', body: { currentKey: 'test1234', newKey: 'newKey1234' } })
assert.equal(configuredPassword, 'stored:newKey1234')
assert.equal(cookies.at(-1), 'token:admin')

configuredPassword = 'test1234'
const cookieCountBeforeFailedLogin = cookies.length
await handleAuthRoute({ ...common, path: '/api/auth/login', body: { password: 'wrong' } })
assert.deepEqual(responses.at(-1), [{ success: false, message: '密码错误' }, 401])
assert.equal(cookies.length, cookieCountBeforeFailedLogin)

await handleAuthRoute({ ...common, path: '/api/auth/login', body: { password: 'test1234' } })
assert.equal(cookies.at(-1), 'token:admin')
assert.equal(responses.at(-1)[0].role, 'admin')

authenticated = true
role = 'admin'
await handleAuthRoute({ ...common, path: '/api/auth/keys/create', body: { label: '访客乙', plainKey: 'guest-key-1' } })
assert.equal(responses.at(-1)[0].plainKey, 'guest-key-1')
assert.equal(guestKeys.length, 1)

await handleAuthRoute({ ...common, path: '/api/auth/keys' })
assert.equal(responses.at(-1)[0].keys.length, 2)

role = 'guest'
keyId = 'guest_1'
await handleAuthRoute({ ...common, path: '/api/auth/keys/create', body: { label: '非法' } })
assert.equal(responses.at(-1)[1], 403)

role = 'admin'
keyId = 'admin'
await handleAuthRoute({ ...common, path: '/api/auth/keys/revoke', body: { id: 'guest_1' } })
assert.equal(guestKeys.length, 0)

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
assert.doesNotMatch(JSON.stringify(responses.at(-1)[0]), /10\.0\.0\.5|redis:\/\//i)

await handleAuthRoute({ ...common, path: '/api/auth/logout' })
assert.equal(cleared.length, 1)
assert.deepEqual(responses.at(-1)[0], { success: true })

console.log('认证路由测试通过')

import assert from 'node:assert/strict'
import { createWebAuthService } from '../src/main/services/webAuthService.js'

const store = new Map()
let time = 1_000_000
let randomSeed = 0
const service = createWebAuthService({
  storeGet: (key) => store.get(key),
  storeSet: (key, value) => store.set(key, value),
  storeDelete: (key) => store.delete(key),
  now: () => time,
  random: (size) => Buffer.alloc(size, ++randomSeed)
})

const localRequest = { headers: {}, socket: { remoteAddress: '127.0.0.1' } }
assert.deepEqual(service.getAuthenticatedSession(localRequest), {
  authenticated: true,
  passwordConfigured: false
})
assert.equal(service.isSecureAuthRequest(localRequest), true)
assert.equal(
  service.isSecureAuthRequest({
    headers: {},
    socket: { remoteAddress: '203.0.113.8' }
  }),
  false
)

const credential = service.storeAccessKey('test-password')
assert.match(credential, /^scrypt\$v1\$/)
assert.equal(service.passwordsMatch('test-password', credential), true)
assert.equal(service.passwordsMatch('wrong-password', credential), false)
assert.equal(service.passwordsMatch('plain', 'plain'), true)
assert.equal(service.passwordsMatch('plain', 'other'), false)

const token = service.createSession(credential)
const authenticatedRequest = {
  headers: { cookie: `other=value; dreamloom_session=${token}` },
  socket: { remoteAddress: '127.0.0.1' }
}
assert.deepEqual(service.getAuthenticatedSession(authenticatedRequest), {
  authenticated: true,
  passwordConfigured: true
})

time += 12 * 60 * 60 * 1000 + 1
assert.deepEqual(service.getAuthenticatedSession(authenticatedRequest), {
  authenticated: false,
  passwordConfigured: true
})

const remoteRequest = { headers: {}, socket: { remoteAddress: '203.0.113.9' } }
for (let index = 0; index < 5; index += 1) service.recordLoginFailure(remoteRequest)
assert.deepEqual(service.checkLoginAllowed(remoteRequest), {
  allowed: false,
  retryAfterSeconds: 900
})
service.clearLoginFailures(remoteRequest)
assert.deepEqual(service.checkLoginAllowed(remoteRequest), {
  allowed: true,
  retryAfterSeconds: 0
})

const headers = new Map()
service.setAuthCookie(localRequest, { setHeader: (key, value) => headers.set(key, value) }, 'token')
assert.match(headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict/)
service.clearAuthCookie(
  authenticatedRequest,
  { setHeader: (key, value) => headers.set(key, value) }
)
assert.match(headers.get('Set-Cookie'), /Max-Age=0/)

service.clearAccessKey()
assert.equal(store.has('bookshelfPassword'), false)

console.log('Web 认证服务测试通过')

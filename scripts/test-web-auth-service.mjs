import assert from 'node:assert/strict'
import {
  createAuthStateStoreFromEnv,
  createMemoryAuthStateStore,
  createRedisAuthStateStore,
  createWebAuthService
} from '../src/main/services/webAuthService.js'

function createService(options = {}) {
  const store = options.store || new Map()
  let time = options.time ?? 1_000_000
  let randomSeed = options.randomSeed ?? 0
  const stateStore = options.stateStore || createMemoryAuthStateStore({ now: () => time })
  const service = createWebAuthService({
    storeGet: (key) => store.get(key),
    storeSet: (key, value) => store.set(key, value),
    storeDelete: (key) => store.delete(key),
    now: () => time,
    random: (size) => Buffer.alloc(size, ++randomSeed),
    stateStore,
    allowOpenAuth: options.allowOpenAuth ?? false,
    productionMode: options.productionMode ?? false,
    trustProxy: options.trustProxy ?? false,
    redisUrl: options.redisUrl,
    env: options.env || {}
  })
  return {
    store,
    stateStore,
    service,
    advance(ms) {
      time += ms
    }
  }
}

{
  const { service } = createService({ allowOpenAuth: false })
  const session = await service.getAuthenticatedSession({
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  })
  assert.deepEqual(session, { authenticated: false, passwordConfigured: false })
  assert.equal(service.isSecureAuthRequest({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), true)
  assert.equal(
    service.isSecureAuthRequest({ headers: {}, socket: { remoteAddress: '203.0.113.8' } }),
    false
  )
}

{
  const { service } = createService({ allowOpenAuth: true, productionMode: false })
  assert.deepEqual(
    await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
    { authenticated: true, passwordConfigured: false }
  )
}

{
  const { service } = createService({ allowOpenAuth: true, productionMode: true })
  assert.deepEqual(
    await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '203.0.113.8' } }),
    { authenticated: false, passwordConfigured: false }
  )
  assert.deepEqual(
    await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
    { authenticated: true, passwordConfigured: false }
  )
}

{
  const ctx = createService()
  const { service, stateStore } = ctx
  const credential = await service.storeAccessKey('test-password')
  assert.match(credential, /^scrypt\$v1\$/)
  assert.equal(service.passwordsMatch('test-password', credential), true)
  assert.equal(service.passwordsMatch('wrong-password', credential), false)
  assert.equal(service.passwordsMatch('plain', 'plain'), true)
  assert.equal(service.passwordsMatch('plain', 'other'), false)

  const token = await service.createSession(credential)
  assert.equal(stateStore._sessions.has(token), false)
  assert.equal(stateStore._sessions.has(service.hashSessionToken(token)), true)

  const authenticatedRequest = {
    headers: { cookie: `other=value; dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  }
  assert.deepEqual(await service.getAuthenticatedSession(authenticatedRequest), {
    authenticated: true,
    passwordConfigured: true
  })

  ctx.advance(12 * 60 * 60 * 1000 + 1)
  assert.deepEqual(await service.getAuthenticatedSession(authenticatedRequest), {
    authenticated: false,
    passwordConfigured: true
  })
}

{
  const { service } = createService()
  await service.storeAccessKey('limit-password')
  const remoteRequest = { headers: {}, socket: { remoteAddress: '203.0.113.9' } }
  for (let index = 0; index < 5; index += 1) await service.recordLoginFailure(remoteRequest)
  assert.deepEqual(await service.checkLoginAllowed(remoteRequest), {
    allowed: false,
    retryAfterSeconds: 900
  })
  await service.clearLoginFailures(remoteRequest)
  assert.deepEqual(await service.checkLoginAllowed(remoteRequest), {
    allowed: true,
    retryAfterSeconds: 0
  })
}

{
  const { service } = createService({ trustProxy: true })
  const headers = new Map()
  service.setAuthCookie(
    { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
    { setHeader: (key, value) => headers.set(key, value) },
    'token'
  )
  assert.match(headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict/)
  assert.doesNotMatch(headers.get('Set-Cookie'), /Secure/)
  service.setAuthCookie(
    { headers: { 'x-forwarded-proto': 'https' }, socket: { remoteAddress: '10.0.0.2' } },
    { setHeader: (key, value) => headers.set(key, value) },
    'token'
  )
  assert.match(headers.get('Set-Cookie'), /Secure/)
  const untrusted = createService({ trustProxy: false }).service
  assert.equal(
    untrusted.isHttpsRequest({
      headers: { 'x-forwarded-proto': 'https' },
      socket: { remoteAddress: '10.0.0.2' }
    }),
    false
  )
}

{
  const ctx = createService()
  const { service } = ctx
  const credential = await service.storeAccessKey('old-secret1')
  const token = await service.createSession(credential)
  const req = {
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  }
  assert.equal((await service.getAuthenticatedSession(req)).authenticated, true)
  await service.storeAccessKey('new-secret1')
  assert.equal((await service.getAuthenticatedSession(req)).authenticated, false)
}

{
  const store = new Map()
  const first = createService({ store, randomSeed: 10 })
  const credential = await first.service.storeAccessKey('restart-pass')
  const token = await first.service.createSession(credential)
  const second = createService({ store, randomSeed: 20 })
  assert.equal(
    (
      await second.service.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${token}` },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).authenticated,
    false
  )
}

{
  const shared = createMemoryAuthStateStore({ now: () => 2_000_000 })
  const store = new Map()
  const a = createService({ store, stateStore: shared, randomSeed: 30, time: 2_000_000 })
  const b = createService({ store, stateStore: shared, randomSeed: 40, time: 2_000_000 })
  const credential = await a.service.storeAccessKey('shared-pass1')
  const token = await a.service.createSession(credential)
  assert.equal(
    (
      await b.service.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${token}` },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).authenticated,
    true
  )
  const headers = new Map()
  await b.service.clearAuthCookie(
    {
      headers: { cookie: `dreamloom_session=${token}` },
      socket: { remoteAddress: '127.0.0.1' }
    },
    { setHeader: (key, value) => headers.set(key, value) }
  )
  assert.match(headers.get('Set-Cookie'), /Max-Age=0/)
  assert.equal(
    (
      await a.service.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${token}` },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).authenticated,
    false
  )
  const remote = { headers: {}, socket: { remoteAddress: '198.51.100.7' } }
  for (let i = 0; i < 5; i += 1) await a.service.recordLoginFailure(remote)
  assert.equal((await b.service.checkLoginAllowed(remote)).allowed, false)
}

{
  class FakeRedis {
    constructor() {
      this.map = new Map()
    }
    async get(key) {
      return this.map.has(key) ? this.map.get(key).value : null
    }
    async set(key, value) {
      this.map.set(key, { value })
      return 'OK'
    }
    async del(key) {
      this.map.delete(key)
      return 1
    }
    async incr(key) {
      const current = Number((await this.get(key)) || 0) + 1
      await this.set(key, String(current))
      return current
    }
  }

  let now = 3_000_000
  const redis = new FakeRedis()
  const redisStore = createRedisAuthStateStore({ redis, now: () => now })
  const store = new Map()
  const svc = createWebAuthService({
    storeGet: (key) => store.get(key),
    storeSet: (key, value) => store.set(key, value),
    storeDelete: (key) => store.delete(key),
    now: () => now,
    random: (size) => Buffer.alloc(size, 7),
    stateStore: redisStore,
    allowOpenAuth: false
  })
  const credential = await svc.storeAccessKey('redis-pass01')
  const token = await svc.createSession(credential)
  assert.equal(svc.getStateStoreKind(), 'redis')
  for (const entry of redis.map.values()) {
    assert.doesNotMatch(String(entry.value), new RegExp(token))
  }
  assert.equal(
    (
      await svc.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${token}` },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).authenticated,
    true
  )
  now += 12 * 60 * 60 * 1000 + 1
  assert.equal(
    (
      await svc.getAuthenticatedSession({
        headers: { cookie: `dreamloom_session=${token}` },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).authenticated,
    false
  )
}

{
  const fallback = await createAuthStateStoreFromEnv({
    redisUrl: 'redis://127.0.0.1:1',
    redisFactory: async () => {
      throw new Error('connect ECONNREFUSED redis://secret-host:6379')
    }
  })
  assert.equal(fallback.kind, 'memory')

  const store = new Map()
  const strict = createWebAuthService({
    storeGet: (key) => store.get(key),
    storeSet: (key, value) => store.set(key, value),
    storeDelete: (key) => store.delete(key),
    stateStore: createMemoryAuthStateStore(),
    redisUrl: 'redis://127.0.0.1:6379',
    productionMode: true,
    env: { NOVEL_AUTH_REQUIRE_REDIS: 'true' }
  })
  const credential = await strict.storeAccessKey('need-redis1')
  await assert.rejects(() => strict.createSession(credential), /共享会话存储不可用/)
}

{
  const { service, store } = createService()
  await service.storeAccessKey('admin-pass1')
  await service.clearAccessKey()
  assert.equal(store.has('bookshelfPassword'), false)
}

console.log('Web 认证服务测试通过')

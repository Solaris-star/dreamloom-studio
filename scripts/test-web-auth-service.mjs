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
    advance(ms) { time += ms },
    setTime(value) { time = value }
  }
}

{
  const { service } = createService({ allowOpenAuth: false })
  const openSession = await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })
  assert.equal(openSession.authenticated, false)
  assert.equal(openSession.passwordConfigured, false)
}

{
  const { service } = createService({ allowOpenAuth: true, productionMode: false })
  const openSession = await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })
  assert.equal(openSession.authenticated, true)
  assert.equal(openSession.passwordConfigured, false)
}

{
  const { service } = createService({ allowOpenAuth: true, productionMode: true })
  assert.equal((await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '203.0.113.8' } })).authenticated, false)
  assert.equal((await service.getAuthenticatedSession({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).authenticated, true)
}

{
  const ctx = createService()
  const { service, stateStore } = ctx
  const credential = await service.storeAccessKey('test-password')
  assert.match(credential, /^scrypt\$v1\$/)
  assert.equal(service.passwordsMatch('test-password', credential), true)
  assert.equal(service.passwordsMatch('wrong-password', credential), false)
  const adminKey = await service.findMatchingKey('test-password')
  const token = await service.createSession(adminKey)
  assert.equal(stateStore._sessions.has(token), false)
  assert.equal(stateStore._sessions.has(service.hashSessionToken(token)), true)
  const adminSession = await service.getAuthenticatedSession({
    headers: { cookie: `other=value; dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })
  assert.equal(adminSession.authenticated, true)
  assert.equal(adminSession.role, 'admin')
  const guestCreated = await service.createGuestKey({ label: '访客甲', plainKey: 'guest-password' })
  assert.equal(guestCreated.key.role, 'guest')
  const guestKey = await service.findMatchingKey('guest-password')
  const guestToken = await service.createSession(guestKey)
  const guestSession = await service.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${guestToken}` },
    socket: { remoteAddress: '127.0.0.1' }
  })
  assert.equal(guestSession.role, 'guest')
  assert.equal(guestSession.canManageKeys, false)
  ctx.advance(12 * 60 * 60 * 1000 + 1)
  assert.equal((await service.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, false)
}

{
  const { service } = createService()
  await service.storeAccessKey('limit-password')
  const remoteRequest = { headers: {}, socket: { remoteAddress: '203.0.113.9' } }
  for (let index = 0; index < 5; index += 1) await service.recordLoginFailure(remoteRequest)
  assert.deepEqual(await service.checkLoginAllowed(remoteRequest), { allowed: false, retryAfterSeconds: 900 })
  await service.clearLoginFailures(remoteRequest)
  assert.deepEqual(await service.checkLoginAllowed(remoteRequest), { allowed: true, retryAfterSeconds: 0 })
}

{
  const { service } = createService({ trustProxy: true })
  const headers = new Map()
  service.setAuthCookie({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, { setHeader: (k, v) => headers.set(k, v) }, 'token')
  assert.match(headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict/)
  service.setAuthCookie({ headers: { 'x-forwarded-proto': 'https' }, socket: { remoteAddress: '10.0.0.2' } }, { setHeader: (k, v) => headers.set(k, v) }, 'token')
  assert.match(headers.get('Set-Cookie'), /Secure/)
  const untrusted = createService({ trustProxy: false }).service
  assert.equal(untrusted.isHttpsRequest({ headers: { 'x-forwarded-proto': 'https' }, socket: { remoteAddress: '10.0.0.2' } }), false)
}

{
  const ctx = createService()
  const { service } = ctx
  await service.storeAccessKey('old-secret1')
  const admin = await service.findMatchingKey('old-secret1')
  const token = await service.createSession(admin)
  const req = { headers: { cookie: `dreamloom_session=${token}` }, socket: { remoteAddress: '127.0.0.1' } }
  assert.equal((await service.getAuthenticatedSession(req)).authenticated, true)
  await service.updateAdminKey({ currentKey: 'old-secret1', newKey: 'new-secret1' })
  assert.equal((await service.getAuthenticatedSession(req)).authenticated, false)
}

{
  const store = new Map()
  const first = createService({ store, randomSeed: 10 })
  await first.service.storeAccessKey('restart-pass')
  const admin = await first.service.findMatchingKey('restart-pass')
  const token = await first.service.createSession(admin)
  const second = createService({ store, randomSeed: 20 })
  assert.equal((await second.service.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, false)
}

{
  const shared = createMemoryAuthStateStore({ now: () => 2_000_000 })
  const store = new Map()
  const a = createService({ store, stateStore: shared, randomSeed: 30, time: 2_000_000 })
  const b = createService({ store, stateStore: shared, randomSeed: 40, time: 2_000_000 })
  await a.service.storeAccessKey('shared-pass1')
  const admin = await a.service.findMatchingKey('shared-pass1')
  const token = await a.service.createSession(admin)
  assert.equal((await b.service.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, true)
  const headers = new Map()
  await b.service.clearAuthCookie({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  }, { setHeader: (k, v) => headers.set(k, v) })
  assert.match(headers.get('Set-Cookie'), /Max-Age=0/)
  assert.equal((await a.service.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, false)
  const remote = { headers: {}, socket: { remoteAddress: '198.51.100.7' } }
  for (let i = 0; i < 5; i += 1) await a.service.recordLoginFailure(remote)
  assert.equal((await b.service.checkLoginAllowed(remote)).allowed, false)
}

{
  class FakeRedis {
    constructor() { this.map = new Map(); this.sets = new Map() }
    async get(key) { return this.map.has(key) ? this.map.get(key).value : null }
    async set(key, value) { this.map.set(key, { value }); return 'OK' }
    async del(key) { this.map.delete(key); this.sets.delete(key); return 1 }
    async incr(key) { const current = Number((await this.get(key)) || 0) + 1; await this.set(key, String(current)); return current }
    async sadd(key, member) { const set = this.sets.get(key) || new Set(); set.add(member); this.sets.set(key, set); return 1 }
    async srem(key, member) { const set = this.sets.get(key); if (!set) return 0; set.delete(member); return 1 }
    async smembers(key) { return [...(this.sets.get(key) || [])] }
    async expire() { return 1 }
    multi() {
      const ops = []
      const api = {
        set: (...args) => { ops.push(['set', args]); return api },
        del: (...args) => { ops.push(['del', args]); return api },
        sadd: (...args) => { ops.push(['sadd', args]); return api },
        srem: (...args) => { ops.push(['srem', args]); return api },
        expire: (...args) => { ops.push(['expire', args]); return api },
        exec: async () => { for (const [name, args] of ops) await this[name](...args); return ops.map(() => [null, 'OK']) }
      }
      return api
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
  await svc.storeAccessKey('redis-pass01')
  const admin = await svc.findMatchingKey('redis-pass01')
  const token = await svc.createSession(admin)
  assert.equal(svc.getStateStoreKind(), 'redis')
  for (const entry of redis.map.values()) assert.doesNotMatch(String(entry.value), new RegExp(token))
  assert.equal((await svc.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, true)
  now += 12 * 60 * 60 * 1000 + 1
  assert.equal((await svc.getAuthenticatedSession({
    headers: { cookie: `dreamloom_session=${token}` },
    socket: { remoteAddress: '127.0.0.1' }
  })).authenticated, false)
}

{
  const fallback = await createAuthStateStoreFromEnv({
    redisUrl: 'redis://127.0.0.1:1',
    redisFactory: async () => { throw new Error('connect ECONNREFUSED redis://secret-host:6379') }
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
  await strict.storeAccessKey('need-redis1')
  const admin = await strict.findMatchingKey('need-redis1')
  await assert.rejects(() => strict.createSession(admin), /共享会话存储不可用/)
}

{
  const { service } = createService({ randomSeed: 90 })
  await service.storeAccessKey('admin-pass1')
  const guest = await service.createGuestKey({ label: '访客', plainKey: 'guest-pass01' })
  await service.revokeAccessKey(guest.key.id)
  assert.equal(await service.findMatchingKey('guest-pass01'), null)
  await service.clearAccessKey()
  assert.equal((await service.listPublicAccessKeys()).length, 0)
}

console.log('Web 认证服务测试通过')

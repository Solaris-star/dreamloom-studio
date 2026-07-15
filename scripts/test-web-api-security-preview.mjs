import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import { join } from 'node:path'
import { createWebServerPlugins } from '../vite.web.plugins.mjs'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-web-api-security-'))
const originalCwd = process.cwd()
const originalLimit = process.env.NOVEL_MAX_REQUEST_BODY_BYTES
const originalAllowOpen = process.env.NOVEL_ALLOW_OPEN_AUTH
const originalAuthRedis = process.env.NOVEL_AUTH_REDIS
const originalRedisUrl = process.env.REDIS_URL
const originalScheduler = process.env.MARKET_TREND_SCHEDULER
const originalAgentWs = process.env.AGENT_TASK_WS_ENABLED
let server

function listen(handler) {
  return new Promise((resolve, reject) => {
    const instance = http.createServer(handler)
    instance.once('error', reject)
    instance.listen(0, '127.0.0.1', () => resolve(instance))
  })
}

function close(instance) {
  return new Promise((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()))
  })
}

function postChunked(baseUrl, path, chunks) {
  const url = new URL(path, baseUrl)
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked'
        }
      },
      (response) => {
        const responseChunks = []
        response.on('data', (chunk) => responseChunks.push(chunk))
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: Buffer.concat(responseChunks).toString('utf8')
          })
        })
      }
    )
    request.once('error', reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

try {
  process.chdir(root)
  process.env.NOVEL_MAX_REQUEST_BODY_BYTES = '128'
  process.env.NOVEL_AUTH_REDIS = 'false'
  delete process.env.REDIS_URL
  process.env.NOVEL_ALLOW_OPEN_AUTH = 'false'
  process.env.MARKET_TREND_SCHEDULER = '0'
  // 本用例只测 HTTP 鉴权/限流，不需要进度 WebSocket；避免 open handle 挂住进程
  process.env.AGENT_TASK_WS_ENABLED = 'false'

  const webPlugin = createWebServerPlugins().find((plugin) => plugin.name === 'web-api-middleware')
  assert.equal(typeof webPlugin.configureServer, 'function')
  assert.equal(typeof webPlugin.configurePreviewServer, 'function')

  let middleware
  webPlugin.configurePreviewServer({
    middlewares: {
      use(handler) {
        middleware = handler
      }
    }
  })
  assert.equal(typeof middleware, 'function')

  server = await listen((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404
      res.end()
    })
  )
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  let response = await fetch(`${baseUrl}/api/auth/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).authenticated, false)

  response = await fetch(`${baseUrl}/api/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  assert.equal(response.status, 401)

  fs.writeFileSync(
    join(root, '.store.json'),
    JSON.stringify({ bookshelfPassword: 'test1234' }),
    'utf8'
  )

  response = await fetch(`${baseUrl}/api/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  assert.equal(response.status, 401)

  response = await fetch(`${baseUrl}/api/not-a-real-route`)
  assert.equal(response.status, 401)

  response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' })
  })
  assert.equal(response.status, 401)

  response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test1234' })
  })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /dreamloom_session=/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Max-Age=43200/)
  const migratedStore = JSON.parse(fs.readFileSync(join(root, '.store.json'), 'utf8'))
  assert.match(migratedStore.bookshelfPassword, /^scrypt\$v1\$/)
  assert.doesNotMatch(fs.readFileSync(join(root, '.store.json'), 'utf8'), /test1234/)

  response = await fetch(`${baseUrl}/api/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}'
  })
  assert.equal(response.status, 200)

  response = await fetch(`${baseUrl}/api/auth/access-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ currentKey: 'test1234', newKey: 'newSecret123' })
  })
  assert.equal(response.status, 200)
  const updatedCookie = response.headers.get('set-cookie')
  const updatedStoreText = fs.readFileSync(join(root, '.store.json'), 'utf8')
  assert.match(JSON.parse(updatedStoreText).bookshelfPassword, /^scrypt\$v1\$/)
  assert.doesNotMatch(updatedStoreText, /newSecret123/)

  response = await fetch(`${baseUrl}/api/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}'
  })
  assert.equal(response.status, 401)

  response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'x'.repeat(256) })
  })
  assert.equal(response.status, 413)

  const chunkedResponse = await postChunked(baseUrl, '/api/auth/login', [
    'x'.repeat(80),
    'x'.repeat(80)
  ])
  assert.equal(chunkedResponse.status, 413)

  response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{'
  })
  assert.equal(response.status, 400)

  response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: updatedCookie },
    body: '{}'
  })
  assert.equal(response.status, 200)

  response = await fetch(`${baseUrl}/api/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: updatedCookie },
    body: '{}'
  })
  assert.equal(response.status, 401)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    })
    assert.equal(response.status, 401)
  }
  response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'newSecret123' })
  })
  assert.equal(response.status, 429)
} finally {
  if (server) await close(server)
  process.chdir(originalCwd)
  if (originalLimit === undefined) delete process.env.NOVEL_MAX_REQUEST_BODY_BYTES
  else process.env.NOVEL_MAX_REQUEST_BODY_BYTES = originalLimit
  if (originalAllowOpen === undefined) delete process.env.NOVEL_ALLOW_OPEN_AUTH
  else process.env.NOVEL_ALLOW_OPEN_AUTH = originalAllowOpen
  if (originalAuthRedis === undefined) delete process.env.NOVEL_AUTH_REDIS
  else process.env.NOVEL_AUTH_REDIS = originalAuthRedis
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
  if (originalScheduler === undefined) delete process.env.MARKET_TREND_SCHEDULER
  else process.env.MARKET_TREND_SCHEDULER = originalScheduler
  if (originalAgentWs === undefined) delete process.env.AGENT_TASK_WS_ENABLED
  else process.env.AGENT_TASK_WS_ENABLED = originalAgentWs
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web api security and preview tests passed')

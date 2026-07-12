import assert from 'node:assert/strict'
import { requestWebAiProxy, validatePublicAiTarget } from '../src/main/services/webAiProxyService.js'

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }]

await assert.rejects(() => validatePublicAiTarget('not-a-url', publicLookup), /地址无效/)
await assert.rejects(() => validatePublicAiTarget('file:///etc/passwd', publicLookup), /http/)
await assert.rejects(
  () => validatePublicAiTarget('https://user:password@provider.example/v1', publicLookup),
  /http/
)
await assert.rejects(() => validatePublicAiTarget('http://localhost:8080', publicLookup), /内网/)
await assert.rejects(
  () => validatePublicAiTarget('https://provider.example/v1', async () => [
    { address: '192.168.1.8', family: 4 }
  ]),
  /内网/
)
await assert.rejects(
  () => validatePublicAiTarget('https://provider.example/v1', async () => []),
  /内网/
)
await assert.rejects(
  () => validatePublicAiTarget('https://provider.example/v1', async () => [
    { address: '::1', family: 6 }
  ]),
  /内网/
)
await assert.rejects(() => validatePublicAiTarget('http://127.0.0.1/v1'), /内网/)
assert.equal(
  (await validatePublicAiTarget('https://provider.example/v1', publicLookup)).hostname,
  'provider.example'
)

let receivedOptions
const result = await requestWebAiProxy(
  {
    targetUrl: 'https://provider.example/v1/models',
    apiKey: 'secret-key',
    method: 'GET'
  },
  {
    lookup: publicLookup,
    fetch: async (_url, options) => {
      receivedOptions = options
      return new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
  }
)

assert.equal(result.success, true)
assert.equal(result.data.data[0].id, 'model-a')
assert.equal(receivedOptions.headers.Authorization, 'Bearer secret-key')
assert.equal(receivedOptions.body, undefined)

const postResult = await requestWebAiProxy(
  {
    targetUrl: 'https://provider.example/v1/chat',
    method: 'post',
    body: { message: '你好' },
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': 'provider-key',
      Cookie: 'blocked-cookie',
      Host: 'blocked-host'
    }
  },
  {
    lookup: publicLookup,
    fetch: async (_url, options) => {
      receivedOptions = options
      return new Response('plain response', { status: 200 })
    }
  }
)
assert.equal(postResult.data, 'plain response')
assert.equal(receivedOptions.method, 'POST')
assert.equal(receivedOptions.body, JSON.stringify({ message: '你好' }))
assert.equal(receivedOptions.headers['Content-Type'], 'application/json')
assert.equal(receivedOptions.headers['X-Api-Key'], 'provider-key')
assert.equal(receivedOptions.headers.Cookie, undefined)
assert.equal(receivedOptions.headers.Host, undefined)
assert.equal(receivedOptions.redirect, 'error')

const nestedError = await requestWebAiProxy(
  { targetUrl: 'https://provider.example/v1/chat' },
  {
    lookup: publicLookup,
    fetch: async () =>
      new Response(JSON.stringify({ error: { message: '模型不可用' } }), { status: 503 })
  }
)
assert.deepEqual(
  { success: nestedError.success, status: nestedError.status, message: nestedError.message },
  { success: false, status: 503, message: '模型不可用' }
)

const directError = await requestWebAiProxy(
  { targetUrl: 'https://provider.example/v1/chat' },
  {
    lookup: publicLookup,
    fetch: async () => new Response(JSON.stringify({ message: '请求被拒绝' }), { status: 400 })
  }
)
assert.equal(directError.message, '请求被拒绝')

const plainError = await requestWebAiProxy(
  { targetUrl: 'https://provider.example/v1/chat' },
  {
    lookup: publicLookup,
    fetch: async () => new Response('upstream failed', { status: 502 })
  }
)
assert.equal(plainError.message, 'HTTP 502')

const emptyResult = await requestWebAiProxy(
  { targetUrl: 'https://provider.example/v1/chat' },
  {
    lookup: publicLookup,
    fetch: async () => new Response(null, { status: 204 })
  }
)
assert.equal(emptyResult.data, null)

await assert.rejects(
  () =>
    requestWebAiProxy(
      { targetUrl: 'https://provider.example/v1/chat' },
      {
        lookup: publicLookup,
        fetch: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))
      }
    ),
  /响应内容过大/
)

await assert.rejects(
  () =>
    requestWebAiProxy(
      { targetUrl: 'https://provider.example/v1/chat' },
      {
        lookup: publicLookup,
        timeoutMs: 1,
        fetch: async () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        }
      }
    ),
  /请求超时/
)

await assert.rejects(
  () =>
    requestWebAiProxy(
      { targetUrl: 'https://provider.example/v1', method: 'DELETE' },
      { lookup: publicLookup }
    ),
  /GET 或 POST/
)

console.log('web AI proxy service tests passed')

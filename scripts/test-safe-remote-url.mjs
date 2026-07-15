import assert from 'node:assert/strict'
import {
  fetchPublicHttpResource,
  sanitizePublicErrorMessage,
  validatePublicHttpUrl
} from '../src/main/services/safeRemoteUrl.js'

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }]

await assert.rejects(() => validatePublicHttpUrl('not-a-url', { lookup: publicLookup }), /无效/)
await assert.rejects(
  () => validatePublicHttpUrl('file:///etc/passwd', { lookup: publicLookup }),
  /http/
)
await assert.rejects(
  () => validatePublicHttpUrl('https://user:pass@cdn.example/a.png', { lookup: publicLookup }),
  /http/
)
await assert.rejects(() => validatePublicHttpUrl('http://localhost/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://127.0.0.1/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://[::1]/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://192.168.1.8/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://10.0.0.8/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://169.254.1.1/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://[fe80::1]/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://[fc00::1]/cover.png'), /内网/)
await assert.rejects(() => validatePublicHttpUrl('http://[::ffff:127.0.0.1]/cover.png'), /内网/)
await assert.rejects(
  () =>
    validatePublicHttpUrl('https://cdn.example/a.png', {
      lookup: async () => [{ address: '10.0.0.1' }]
    }),
  /内网/
)
await assert.rejects(
  () =>
    validatePublicHttpUrl('https://cdn.example/a.png', {
      lookup: async () => [
        { address: '203.0.113.10' },
        { address: '192.168.0.2' }
      ]
    }),
  /内网/
)

const allowed = await validatePublicHttpUrl('https://cdn.example/a.png', { lookup: publicLookup })
assert.equal(allowed.hostname, 'cdn.example')

let fetchCalls = 0
const ok = await fetchPublicHttpResource('https://cdn.example/a.png', {
  lookup: publicLookup,
  maxBytes: 1024,
  fetchImpl: async (url, options) => {
    fetchCalls += 1
    assert.equal(String(url), 'https://cdn.example/a.png')
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'GET')
    return new Response(Buffer.from('hello-image'), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Content-Length': '11' }
    })
  }
})
assert.equal(ok.buffer.toString(), 'hello-image')
assert.equal(fetchCalls, 1)

await assert.rejects(
  () =>
    fetchPublicHttpResource('https://cdn.example/a.png', {
      lookup: publicLookup,
      maxBytes: 8,
      fetchImpl: async () =>
        new Response(Buffer.from('0123456789'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' }
        })
    }),
  /不能超过/
)

await assert.rejects(
  () =>
    fetchPublicHttpResource('https://cdn.example/a.png', {
      lookup: publicLookup,
      maxBytes: 100,
      fetchImpl: async () =>
        new Response(Buffer.from('x'), {
          status: 200,
          headers: { 'Content-Length': '101' }
        })
    }),
  /不能超过/
)

await assert.rejects(
  () =>
    fetchPublicHttpResource('http://127.0.0.1/secret.png', {
      fetchImpl: async () => {
        throw new Error('should not fetch private hosts')
      }
    }),
  /内网/
)

await assert.rejects(
  () =>
    fetchPublicHttpResource('https://cdn.example/a.png', {
      lookup: publicLookup,
      timeoutMs: 1,
      fetchImpl: async () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
    }),
  /超时/
)

const sanitized = sanitizePublicErrorMessage(
  new Error(
    "ENOENT: no such file or directory, open '/Users/solaris/secret/store.json'\n    at Object.openSync"
  ),
  '失败'
)
assert.equal(sanitized.includes('/Users/solaris'), false)
assert.equal(sanitized.includes('at Object.openSync'), false)
assert.match(sanitized, /\[path\]|ENOENT/)

const secretMasked = sanitizePublicErrorMessage(
  new Error('Authorization: Bearer super-secret-token'),
  '请求失败'
)
assert.equal(secretMasked, '请求失败')

console.log('safe remote url tests passed')

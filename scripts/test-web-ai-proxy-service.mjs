import assert from 'node:assert/strict'
import { requestWebAiProxy, validatePublicAiTarget } from '../src/main/services/webAiProxyService.js'

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }]

await assert.rejects(() => validatePublicAiTarget('file:///etc/passwd', publicLookup), /http/)
await assert.rejects(() => validatePublicAiTarget('http://localhost:8080', publicLookup), /内网/)
await assert.rejects(
  () => validatePublicAiTarget('https://provider.example/v1', async () => [
    { address: '192.168.1.8', family: 4 }
  ]),
  /内网/
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

await assert.rejects(
  () =>
    requestWebAiProxy(
      { targetUrl: 'https://provider.example/v1', method: 'DELETE' },
      { lookup: publicLookup }
    ),
  /GET 或 POST/
)

console.log('web AI proxy service tests passed')

import assert from 'node:assert/strict'

const store = new Map()
const requests = []

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload })
  let body
  if (url === '/api/store/get') {
    body = { success: true, key: payload.key, value: store.get(payload.key) }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else {
    body = { success: true, data: { data: [{ id: 'model-a' }] } }
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/aiProvider.js')
const providers = [
  {
    id: 'text-a',
    name: '文本服务',
    category: 'text',
    baseUrl: 'https://example.com',
    apiKeys: ['secret']
  },
  {
    id: 'image-a',
    name: '图片服务',
    category: 'image',
    baseUrl: 'https://example.com',
    apiKeys: ['secret'],
    models: ['image-model']
  }
]

await service.saveAiProviders(providers)
assert.deepEqual((await service.getAiProviders()).providers, providers)
assert.equal((await service.getActiveTextProvider()).providerId, 'text-a')
assert.equal((await service.getActiveImageProvider()).providerId, 'image-a')

await service.setActiveTextProvider('text-a')
assert.equal(store.get('aiProviders.activeTextId'), 'text-a')
await assert.rejects(() => service.setActiveTextProvider('missing'), /文本 Provider 不存在/)

assert.deepEqual((await service.listAiProviderModels(providers[0])).models, ['model-a'])
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/models')
assert.deepEqual((await service.listAiProviderModels(providers[1])).models, ['image-model'])

await service.testAiProviderModel(providers[0], 'model-a')
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/chat/completions')

const added = await service.addAiProvider({
  id: 'text-b',
  category: 'text',
  baseUrl: 'https://example.com',
  apiKeys: ['secret']
})
assert.equal(added.provider.id, 'text-b')
await service.deleteAiProvider('text-b')
await assert.rejects(() => service.deleteAiProvider('missing'), /Provider not found/)

await service.addEmbeddingProvider({
  id: 'embedding-a',
  name: '向量服务',
  baseUrl: 'https://embedding.example.com',
  apiKey: 'embedding-secret',
  model: 'embedding-model',
  dimension: 1024
})
assert.equal((await service.listEmbeddingProviders()).providers[0].dimensions, 1024)
await service.setActiveEmbeddingProvider('embedding-a', true)
assert.equal((await service.listEmbeddingProviders()).providers[0].active, true)

await service.validateEmbeddingProvider(
  (await service.listEmbeddingProviders()).providers[0]
)
assert.equal(requests.at(-1).payload.targetUrl, 'https://embedding.example.com/v1/embeddings')
assert.equal(requests.at(-1).payload.body.dimensions, 1024)

assert.deepEqual(
  (
    await service.listEmbeddingProviderModels({
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret'
    })
  ).models,
  ['model-a']
)
await service.deleteEmbeddingProvider('embedding-a')
await assert.rejects(
  () => service.setActiveEmbeddingProvider('embedding-a', true),
  /未找到 Embedding Provider/
)
await assert.rejects(
  () => service.addEmbeddingProvider({ name: '配置不完整' }),
  /Embedding API 地址/
)

console.log('Web AI Provider 服务测试通过')

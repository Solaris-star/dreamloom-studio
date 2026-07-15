import assert from 'node:assert/strict'

const store = new Map()
const requests = []
const storeGetOverrides = new Map()
const proxyResponses = []

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload })
  let body
  let status = 200
  if (url === '/api/store/get') {
    const value = storeGetOverrides.has(payload.key)
      ? storeGetOverrides.get(payload.key)
      : store.get(payload.key)
    body = { success: true, key: payload.key, value }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else if (proxyResponses.length) {
    const response = proxyResponses.shift()
    body = response.body
    status = response.status || 200
  } else {
    body = { success: true, data: { data: [{ id: 'model-a' }] } }
  }
  return new Response(JSON.stringify(body), {
    status,
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
await assert.rejects(() => service.saveAiProviders(null), /接口返回格式不正确/)
storeGetOverrides.set('aiProviders', {})
await assert.rejects(() => service.getAiProviders(), /接口返回格式不正确/)
storeGetOverrides.delete('aiProviders')

assert.equal((await service.getActiveTextProvider()).providerId, 'text-a')
assert.equal((await service.getActiveImageProvider()).providerId, 'image-a')

await service.setActiveTextProvider('text-a')
assert.equal(store.get('aiProviders.activeTextId'), 'text-a')
await assert.rejects(() => service.setActiveTextProvider('missing'), /文本 AI 服务不存在/)
assert.equal((await service.setActiveTextProvider('')).providerId, '')
assert.equal(store.get('aiProviders.activeTextId'), '')

await service.setActiveImageProvider('image-a')
assert.equal(store.get('aiProviders.activeImageId'), 'image-a')
await assert.rejects(() => service.setActiveImageProvider('missing'), /图像 AI 服务不存在/)
assert.equal((await service.setActiveImageProvider('')).providerId, '')

store.set('aiProviders.activeTextId', 'image-a')
store.set('aiProviders.activeImageId', 'text-a')
assert.equal((await service.getActiveTextProvider()).providerId, 'text-a')
assert.equal((await service.getActiveImageProvider()).providerId, 'image-a')
storeGetOverrides.set('aiProviders', [])
assert.equal((await service.getActiveTextProvider()).providerId, '')
assert.equal((await service.getActiveImageProvider()).providerId, '')
storeGetOverrides.delete('aiProviders')

assert.deepEqual((await service.listAiProviderModels(providers[0])).models, ['model-a'])
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/models')
assert.deepEqual((await service.listAiProviderModels(providers[1])).models, ['image-model'])
assert.deepEqual(
  (await service.listAiProviderModels({ ...providers[1], models: undefined })).models,
  []
)
await assert.rejects(
  () => service.listAiProviderModels({ category: 'image' }),
  /请先填写接口地址和密钥/
)

proxyResponses.push({ body: { success: true, data: { data: [{ id: '' }, {}] } } })
assert.deepEqual((await service.listAiProviderModels(providers[0])).models, [])
proxyResponses.push({ body: { success: true, data: {} } })
assert.deepEqual((await service.listAiProviderModels(providers[0])).models, [])

const singleKeyProvider = {
  category: 'text',
  baseUrl: 'https://example.com/',
  apiKey: 'single-secret'
}
await service.listAiProviderModels(singleKeyProvider)
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/models')
assert.equal(requests.at(-1).payload.apiKey, 'single-secret')

proxyResponses.push(
  { body: { success: false, message: 'first key failed' } },
  { body: { success: true, data: { data: [{ id: 'retry-model' }] } } }
)
assert.deepEqual(
  (
    await service.listAiProviderModels({
      ...singleKeyProvider,
      apiKey: undefined,
      apiKeys: ['bad-key', 'good-key']
    })
  ).models,
  ['retry-model']
)
assert.equal(requests.at(-1).payload.apiKey, 'good-key')

proxyResponses.push(
  { body: { success: false, message: 'key one failed' } },
  { body: { success: false, message: 'key two failed' } }
)
await assert.rejects(
  () =>
    service.listAiProviderModels({
      ...singleKeyProvider,
      apiKey: undefined,
      apiKeys: ['bad-key-1', 'bad-key-2']
    }),
  /key two failed/
)
await assert.rejects(() => service.listAiProviderModels({}), /请先填写接口地址和密钥/)

await service.testAiProviderModel(providers[0], 'model-a')
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/chat/completions')
await service.testAiProviderModel(providers[1], 'image-model')
assert.equal(requests.at(-1).payload.targetUrl, 'https://example.com/v1/images/generations')
await assert.rejects(() => service.testAiProviderModel(providers[0], ''), /请指定模型名称/)
assert.deepEqual((await service.validateAiProvider(providers[0])).models, ['model-a'])
assert.deepEqual(await service.getAiProvidersByCategory('image'), [providers[1]])

const added = await service.addAiProvider({
  id: 'text-b',
  category: 'text',
  baseUrl: 'https://example.com',
  apiKeys: ['secret']
})
assert.equal(added.provider.id, 'text-b')
const generated = await service.addAiProvider({
  category: 'text',
  baseUrl: 'https://example.com',
  apiKeys: ['secret']
})
assert.match(generated.provider.id, /^[0-9a-f-]{36}$/i)
const updated = await service.updateAiProvider({ id: 'text-b', name: '更新后的服务' })
assert.equal(updated.provider.name, '更新后的服务')
assert.equal(typeof updated.provider.updatedAt, 'number')
await assert.rejects(
  () => service.updateAiProvider({ id: 'missing' }),
  /未找到该 AI 服务/
)
await service.deleteAiProvider('text-b')
await assert.rejects(() => service.deleteAiProvider('missing'), /未找到该 AI 服务/)

await service.addEmbeddingProvider({
  id: 'embedding-a',
  name: '向量服务',
  baseUrl: 'https://embedding.example.com',
  apiKey: 'embedding-secret',
  model: 'embedding-model',
  dimension: 1024
})
assert.equal((await service.listEmbeddingProviders()).providers[0].dimensions, 1024)
await service.addEmbeddingProvider({
  id: 'embedding-b',
  name: '兼容字段服务',
  baseUrl: 'https://embedding.example.com/',
  apiKey: 'embedding-secret',
  modelName: 'embedding-model-b',
  dimensions: -1
})
const embeddingProviders = (await service.listEmbeddingProviders()).providers
assert.equal(embeddingProviders[1].model, 'embedding-model-b')
assert.equal('dimension' in embeddingProviders[1], false)
assert.equal('dimensions' in embeddingProviders[1], false)

await service.setActiveEmbeddingProvider('embedding-a', true)
assert.equal((await service.listEmbeddingProviders()).providers[0].active, true)
await service.setActiveEmbeddingProvider('embedding-a', false)
assert.equal(
  (await service.listEmbeddingProviders()).providers.some((provider) => provider.active),
  false
)

await service.validateEmbeddingProvider(
  (await service.listEmbeddingProviders()).providers[0]
)
assert.equal(requests.at(-1).payload.targetUrl, 'https://embedding.example.com/v1/embeddings')
assert.equal(requests.at(-1).payload.body.dimensions, 1024)
await service.validateEmbeddingProvider({
  name: '无维度服务',
  baseUrl: 'https://embedding.example.com/',
  apiKey: 'embedding-secret',
  model: 'embedding-model'
})
assert.equal('dimensions' in requests.at(-1).payload.body, false)

assert.deepEqual(
  (
    await service.listEmbeddingProviderModels({
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret'
    })
  ).models,
  ['model-a']
)
proxyResponses.push({ body: { success: true, data: { data: [{ id: '' }, {}] } } })
assert.deepEqual(
  (
    await service.listEmbeddingProviderModels({
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret'
    })
  ).models,
  []
)
proxyResponses.push({ body: { success: true, data: {} } })
assert.deepEqual(
  (
    await service.listEmbeddingProviderModels({
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret'
    })
  ).models,
  []
)
await assert.rejects(
  () => service.listEmbeddingProviderModels({}),
  /请先填写接口地址和密钥/
)

await service.deleteEmbeddingProvider('embedding-a')
await assert.rejects(
  () => service.deleteEmbeddingProvider('missing'),
  /未找到向量服务/
)
await assert.rejects(
  () => service.setActiveEmbeddingProvider('embedding-a', true),
  /未找到向量服务/
)
await assert.rejects(
  () => service.addEmbeddingProvider({ name: '配置不完整' }),
  /向量接口地址/
)
await assert.rejects(
  () =>
    service.addEmbeddingProvider({
      name: '缺少 Key',
      baseUrl: 'https://embedding.example.com',
      model: 'embedding-model'
    }),
  /向量密钥/
)
await assert.rejects(
  () =>
    service.addEmbeddingProvider({
      name: '缺少模型',
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret'
    }),
  /向量模型名称/
)
await assert.rejects(
  () =>
    service.addEmbeddingProvider({
      baseUrl: 'https://embedding.example.com',
      apiKey: 'embedding-secret',
      model: 'embedding-model'
    }),
  /服务名称/
)
storeGetOverrides.set('embeddingProviders', {})
await assert.rejects(() => service.listEmbeddingProviders(), /接口返回格式不正确/)
storeGetOverrides.delete('embeddingProviders')

console.log('Web AI Provider 服务测试通过')

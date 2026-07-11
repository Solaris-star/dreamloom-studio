import assert from 'node:assert/strict'

const requests = []
const store = new Map()
let nextResponse = null

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, method: options.method || 'GET', payload })

  let body
  if (nextResponse) {
    body = nextResponse
    nextResponse = null
  } else if (url === '/api/store/get') {
    body = { success: true, key: payload.key, value: store.get(payload.key) }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else {
    body = { success: true, localPath: 'generated/test.png', imageUrl: '/image/test.png' }
  }

  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const imageAi = await import('../src/renderer/src/service/imageAi.js')
const imageGeneration = await import('../src/renderer/src/service/tongyiwanxiang.js')

store.set('aiProviders', [
  {
    id: 'image-ready',
    name: '可用图片服务',
    category: 'image',
    baseUrl: 'https://example.com',
    apiKeys: ['secret']
  },
  { id: 'missing-key', category: 'image', baseUrl: 'https://example.com', apiKeys: [] },
  { id: 'text-provider', category: 'text', baseUrl: 'https://example.com', apiKeys: ['secret'] }
])
assert.deepEqual(await imageAi.listConfiguredImageProviders(), {
  success: true,
  providers: ['image-ready'],
  providerLabels: { 'image-ready': '可用图片服务' }
})

await imageAi.setImageAiLastProvider(' image-ready ')
assert.equal(store.get('imageAi.lastProvider'), 'image-ready')
assert.deepEqual(await imageAi.getImageAiLastProvider(), {
  success: true,
  provider: 'image-ready'
})

await imageAi.setDoubaoConfig({
  apiKey: ' key ',
  baseUrl: ' https://example.com ',
  model: ' image-model '
})
assert.deepEqual(await imageAi.getDoubaoConfig(), {
  success: true,
  apiKey: 'key',
  baseUrl: 'https://example.com',
  model: 'image-model',
  configured: true,
  source: 'store'
})

await imageGeneration.generateAICover({
  bookName: '测试作品',
  titlePrompt: '标题',
  authorPrompt: '作者',
  backgroundPrompt: '背景',
  imageProvider: 'image-ready'
})
assert.deepEqual(requests.at(-1), {
  url: '/api/ai/image-task',
  method: 'POST',
  payload: {
    bookName: '测试作品',
    titlePrompt: '标题',
    authorPrompt: '作者',
    backgroundPrompt: '背景',
    imageProvider: 'image-ready',
    feature: 'ai_cover',
    title: '封面生成',
    prompt: '标题\n作者\n背景',
    size: '1024x1024',
    providerId: 'image-ready'
  }
})

await imageGeneration.generateAICharacterImage({
  bookName: '测试作品',
  description: '人物描述'
})
assert.equal(requests.at(-1).payload.feature, 'ai_character_image')
assert.equal(requests.at(-1).payload.prompt, '人物描述')

await imageGeneration.generateAISceneImage({
  bookName: '测试作品',
  description: '场景描述'
})
assert.equal(requests.at(-1).payload.feature, 'ai_scene_image')
assert.equal(requests.at(-1).payload.prompt, '场景描述')

nextResponse = { success: true }
await assert.rejects(
  () => imageGeneration.confirmAICover({ chosenPath: 'temp.png' }),
  /接口没有返回图片路径/
)

nextResponse = { success: true, key: 'wrong-key', value: [] }
await assert.rejects(() => imageAi.listConfiguredImageProviders(), /读取图像 AI 设置失败/)

store.set('aiProviders', { invalid: true })
await assert.rejects(() => imageAi.listConfiguredImageProviders(), /设置格式不正确/)

console.log('Web 图片 AI 服务测试通过')

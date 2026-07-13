import assert from 'node:assert/strict'

const requests = []
const store = new Map()
let textContent = ''
let responseOverride = null
let proxyResponse = { success: true, data: { data: [{ id: 'deepseek-chat' }] } }

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload })
  let body
  if (responseOverride) {
    body = responseOverride
    responseOverride = null
  } else if (url === '/api/store/get') {
    body = { success: true, key: payload.key, value: store.get(payload.key) }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else if (url === '/api/ai/text-task') {
    body = {
      success: true,
      content: textContent,
      model: 'test-model',
      providerId: 'test-provider'
    }
  } else {
    body = proxyResponse
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/deepseek.js')

await service.setDeepSeekApiKey(' secret ')
assert.equal(store.get('deepseek.apiKey'), 'secret')
assert.equal((await service.getDeepSeekApiKey()).configured, true)
assert.deepEqual(await service.setDeepSeekApiKey(null), {
  success: true,
  configured: false,
  source: ''
})
assert.equal((await service.getDeepSeekApiKey()).source, '')
responseOverride = { success: false }
await assert.rejects(() => service.getDeepSeekApiKey(), /请求失败/)
responseOverride = { success: true, key: 'wrong-key' }
await assert.rejects(() => service.getDeepSeekApiKey(), /读取 DeepSeek 设置失败/)
responseOverride = { success: false }
await assert.rejects(() => service.setDeepSeekApiKey('secret'), /请求失败/)
responseOverride = { success: true, key: 'wrong-key' }
await assert.rejects(() => service.setDeepSeekApiKey('secret'), /保存 DeepSeek 设置失败/)

textContent = '1. 林清\n林清\n- 周远\nEnglish\n张'
assert.deepEqual((await service.generateNamesWithAI({ type: 'cn', count: 3 })).names, [
  '林清',
  '周远'
])
assert.equal(requests.at(-1).payload.feature, 'name_generator')
textContent = '赵云\n诸葛亮'
const detailedNames = await service.generateNamesWithAI({
  type: '古风',
  surname: '赵',
  gender: '男',
  nameLength: 2,
  middleChar: '云',
  count: 100,
  providerId: 'provider-a',
  model: 'model-a'
})
assert.deepEqual(detailedNames.names, ['赵云', '诸葛亮'])
assert.match(requests.at(-1).payload.content, /姓氏：赵/)
assert.match(requests.at(-1).payload.content, /数量：50/)
assert.equal(requests.at(-1).payload.providerId, 'provider-a')
assert.equal(requests.at(-1).payload.model, 'model-a')

textContent = '王明'
await service.generateNamesWithAI({ count: 0 })
assert.match(requests.at(-1).payload.content, /数量：24/)
responseOverride = { success: false, message: '模型不可用' }
await assert.rejects(() => service.generateNamesWithAI(), /模型不可用/)
responseOverride = { success: true, content: 42 }
await assert.rejects(() => service.generateNamesWithAI(), /AI 起名失败/)
textContent = 'English\n张\n1'
await assert.rejects(() => service.generateNamesWithAI(), /没有返回可用名称/)

textContent = '画面描述：雨夜中的旧城街道'
assert.equal(
  (await service.refineSceneVisualPromptWithAI('雨夜追逐')).content,
  '雨夜中的旧城街道'
)
assert.equal(requests.at(-1).payload.feature, 'scene_visual_prompt')

await assert.rejects(() => service.refineSceneVisualPromptWithAI(''), /节选内容为空/)
textContent = '描述：'
await assert.rejects(() => service.refineSceneVisualPromptWithAI('正文'), /AI 返回结果为空/)
responseOverride = { success: true, content: '' }
await assert.rejects(
  () => service.refineSceneVisualPromptWithAI('正文'),
  /场景图画面描述失败/
)

await assert.rejects(() => service.validateDeepSeekApiKey(), /请先保存 API Key/)
await service.setDeepSeekApiKey('secret')
proxyResponse = {
  success: true,
  data: { data: [{ id: 'deepseek-chat' }, {}, { id: 'deepseek-reasoner' }] }
}
assert.deepEqual((await service.validateDeepSeekApiKey()).models, [
  'deepseek-chat',
  'deepseek-reasoner'
])
proxyResponse = { success: true, data: {} }
assert.deepEqual((await service.validateDeepSeekApiKey()).models, [])

console.log('Web DeepSeek 服务测试通过')

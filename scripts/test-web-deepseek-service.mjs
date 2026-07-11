import assert from 'node:assert/strict'

const requests = []
const store = new Map()
let textContent = ''

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload })
  let body
  if (url === '/api/store/get') {
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
    body = { success: true, data: { data: [{ id: 'deepseek-chat' }] } }
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

textContent = '1. 林清\n林清\n- 周远\nEnglish\n张'
assert.deepEqual((await service.generateNamesWithAI({ type: 'cn', count: 3 })).names, [
  '林清',
  '周远'
])
assert.equal(requests.at(-1).payload.feature, 'name_generator')

textContent = '画面描述：雨夜中的旧城街道'
assert.equal(
  (await service.refineSceneVisualPromptWithAI('雨夜追逐')).content,
  '雨夜中的旧城街道'
)
assert.equal(requests.at(-1).payload.feature, 'scene_visual_prompt')

await assert.rejects(() => service.refineSceneVisualPromptWithAI(''), /节选内容为空/)
assert.deepEqual((await service.validateDeepSeekApiKey()).models, ['deepseek-chat'])

console.log('Web DeepSeek 服务测试通过')

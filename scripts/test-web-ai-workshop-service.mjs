import assert from 'node:assert/strict'

const responses = new Map()
const requests = []

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload, signal: options.signal })
  const body = responses.get(url)
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/aiWorkshop.js')

responses.set('/api/ai/text-task', { success: true, content: ' 正文 ' })
assert.equal((await service.runAiTextTask({ content: '原文' })).content, '正文')

responses.set('/api/ai/image-task', { success: true, imageUrl: ' https://image.test/a.png ' })
assert.equal((await service.runAiImageTask({ prompt: '场景' })).imageUrl, 'https://image.test/a.png')

responses.set('/api/ai/image-task', { success: true, base64: ' image-data ' })
assert.equal((await service.runAiImageTask({ prompt: '人物' })).base64, 'image-data')

responses.set('/api/ai/image-task', { success: true, output: ' generated-image ' })
assert.equal((await service.runAiImageTask({ prompt: '封面' })).output, 'generated-image')

responses.set('/api/ai/chat', { success: true, content: ' 回答 ' })
assert.equal((await service.sendAiChat({ message: '问题' })).content, '回答')
assert.equal(requests.slice(0, 5).every((item) => item.signal instanceof AbortSignal), true)

responses.set('/api/ai/history', { success: true, items: [{ id: 'history-a' }] })
assert.equal((await service.listAiHistory({ type: 'text' })).items[0].id, 'history-a')

responses.set('/api/prompts/list', { success: true, presets: [{ id: 'preset-a' }] })
assert.equal((await service.listPromptPresets()).presets[0].id, 'preset-a')

responses.set('/api/prompts/create', { success: true, preset: { id: 'preset-b' } })
assert.equal((await service.createPromptPreset({ name: '模板' })).preset.id, 'preset-b')

responses.set('/api/prompts/update', { success: true, preset: { id: 'preset-b', name: '新模板' } })
assert.equal((await service.updatePromptPreset({ id: 'preset-b' })).preset.name, '新模板')

responses.set('/api/prompts/delete', { success: true, presetId: 'preset-b' })
assert.equal((await service.deletePromptPreset({ presetId: 'preset-b' })).presetId, 'preset-b')

responses.set('/api/prompts/import', { success: true, presets: [], count: 0 })
assert.equal((await service.importPromptPresets({ jsonString: '[]' })).count, 0)

responses.set('/api/prompts/export', { success: true, jsonString: '[]' })
assert.equal((await service.exportPromptPresets()).jsonString, '[]')

assert.deepEqual(
  requests.map((item) => item.url),
  [
    '/api/ai/text-task',
    '/api/ai/image-task',
    '/api/ai/image-task',
    '/api/ai/image-task',
    '/api/ai/chat',
    '/api/ai/history',
    '/api/prompts/list',
    '/api/prompts/create',
    '/api/prompts/update',
    '/api/prompts/delete',
    '/api/prompts/import',
    '/api/prompts/export'
  ]
)

responses.set('/api/ai/text-task', { success: true, content: '   ' })
await assert.rejects(() => service.runAiTextTask(), /没有返回正文内容/)

responses.set('/api/ai/text-task', { success: false, error: '生成被拒绝' })
await assert.rejects(() => service.runAiTextTask(), /生成被拒绝/)

responses.set('/api/ai/image-task', { success: true, imageUrl: ' ', base64: null, output: {} })
await assert.rejects(() => service.runAiImageTask(), /没有返回图片数据/)

responses.set('/api/ai/chat', { success: true, content: null })
await assert.rejects(() => service.sendAiChat(), /没有返回正文内容/)

responses.set('/api/ai/history', { success: false, message: '历史不可用' })
await assert.rejects(() => service.listAiHistory(), /历史不可用/)

responses.set('/api/ai/history', { success: true, items: null })
await assert.rejects(() => service.listAiHistory(), /返回格式异常/)

responses.set('/api/prompts/create', { success: true, preset: [] })
await assert.rejects(() => service.createPromptPreset(), /没有返回模板记录/)

responses.set('/api/prompts/update', { success: false, error: '更新被拒绝' })
await assert.rejects(() => service.updatePromptPreset(), /更新被拒绝/)

responses.set('/api/prompts/delete', { success: true, presetId: 'another-preset' })
await assert.rejects(
  () => service.deletePromptPreset({ presetId: 'preset-b' }),
  /模板 ID 不匹配/
)

responses.set('/api/prompts/delete', { success: true, presetId: ' ' })
await assert.rejects(() => service.deletePromptPreset(), /模板 ID 不匹配/)

responses.set('/api/prompts/list', { success: false, message: '读取失败' })
await assert.rejects(() => service.listPromptPresets(), /读取失败/)

responses.set('/api/prompts/list', { success: true, presets: {} })
await assert.rejects(() => service.listPromptPresets(), /返回格式不正确/)

responses.set('/api/prompts/import', { success: true, presets: {}, count: 1 })
await assert.rejects(() => service.importPromptPresets(), /返回格式不正确/)

responses.set('/api/prompts/import', { success: true, presets: [], count: 'unknown' })
await assert.rejects(() => service.importPromptPresets(), /返回格式不正确/)

responses.set('/api/prompts/export', { success: true, jsonString: null })
await assert.rejects(() => service.exportPromptPresets(), /返回格式不正确/)

console.log('Web AI 工坊服务测试通过')

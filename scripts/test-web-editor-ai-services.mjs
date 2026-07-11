import assert from 'node:assert/strict'

const requests = []
let aiResponse = { success: true, content: '返回正文', model: 'writer-model', providerId: 'provider-a' }

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  requests.push({ url, payload })
  let data
  if (url === '/api/store/get') {
    data =
      payload.key === 'editorModelDefaults'
        ? { success: true, key: payload.key, value: { writing: 'provider-a::writer-model' } }
        : { success: true, key: payload.key, value: 'provider-a' }
  } else if (url === '/api/ai/text-task') {
    data = aiResponse
  } else {
    data = { success: false, message: `未模拟接口：${url}` }
  }
  return new Response(JSON.stringify(data), {
    status: data.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const { refineSettingWithAI } = await import('../src/renderer/src/service/settingAi.js')
const { continueWriteWithAI, polishTextWithAI } = await import(
  '../src/renderer/src/service/editorText.js'
)

const setting = await refineSettingWithAI({
  sourceContent: '旧设定',
  settingName: '灵脉',
  userInstruction: '补充限制'
})
assert.equal(setting.content, '返回正文')
assert.equal(requests.at(-1).url, '/api/ai/text-task')
assert.equal(requests.at(-1).payload.feature, 'setting_refine')
assert.match(requests.at(-1).payload.instruction, /设定名称：灵脉/)
assert.equal(requests.at(-1).payload.providerId, 'provider-a')
assert.equal(requests.at(-1).payload.modelName, 'writer-model')

aiResponse = { success: true, content: '新增内容', model: 'writer-model' }
const continued = await continueWriteWithAI({ text: '已有正文' })
assert.equal(continued.maxAddWords, 800)
assert.equal(continued.wordCount, 4)
assert.equal(requests.at(-1).payload.maxTokens, 1600)
assert.match(requests.at(-1).payload.instruction, /800 字以内/)

aiResponse = { success: true, content: '润色正文' }
const polished = await polishTextWithAI('原文')
assert.equal(polished.content, '润色正文')
assert.equal(polished.inputWordCount, 2)
assert.equal(requests.at(-1).payload.task, 'polish')

await assert.rejects(() => polishTextWithAI('  '), /请先输入或选择/)

aiResponse = { success: true, content: '超'.repeat(121) }
await assert.rejects(
  () => continueWriteWithAI({ text: '原文', maxAddWords: 100 }),
  /AI 续写失败/
)

aiResponse = { success: true, content: '' }
await assert.rejects(() => refineSettingWithAI({ sourceContent: '设定' }), /AI 返回结果为空/)

console.log('Web 编辑器 AI 服务测试通过')

import assert from 'node:assert/strict'
import settingAiService from '../src/main/services/settingAi.js'

function createTextProvider(response) {
  const calls = []
  return {
    calls,
    provider: {
      async chat(options) {
        calls.push(options)
        return {
          content: typeof response === 'function' ? response(options) : response
        }
      }
    }
  }
}

{
  const fake = createTextProvider('  灵脉每隔百年苏醒一次。  ')
  const result = await settingAiService.refineSetting(
    {
      settingName: '灵脉',
      sourceContent: '灵脉会苏醒。',
      userInstruction: '补充时间限制'
    },
    fake.provider
  )

  assert.deepEqual(result, { content: '灵脉每隔百年苏醒一次。' })
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].temperature, 0.6)
  assert.equal(fake.calls[0].max_tokens, 5000)
  assert.match(fake.calls[0].requestId, /^setting_refine_\d+$/)
  assert.match(fake.calls[0].messages[0].content, /只输出最终设定正文/)
  assert.match(fake.calls[0].messages[1].content, /设定名称：灵脉/)
  assert.match(fake.calls[0].messages[1].content, /完善要求：补充时间限制/)
  assert.match(fake.calls[0].messages[1].content, /灵脉会苏醒。/)
}

{
  const fake = createTextProvider('默认设定正文')
  await settingAiService.refineSetting(
    {
      settingName: '  ',
      sourceContent: null,
      userInstruction: ''
    },
    fake.provider
  )

  const userMessage = fake.calls[0].messages[1].content
  assert.match(userMessage, /设定名称：未命名设定/)
  assert.match(userMessage, /完善要求：无（请自行补足内容）/)
  assert.match(userMessage, /原始设定内容：\n（空）/)
}

await assert.rejects(
  () => settingAiService.refineSetting({ settingName: '灵脉' }, null),
  /文本 AI 服务不可用/
)

await assert.rejects(
  () => settingAiService.refineSetting({}, createTextProvider('   ').provider),
  /AI 返回结果为空，请重试/
)

console.log('setting ai tests passed')

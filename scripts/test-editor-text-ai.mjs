import assert from 'node:assert/strict'
import editorTextAiService from '../src/main/services/editorTextAi.js'

function fakeTextProvider(handler) {
  const calls = []
  return {
    calls,
    provider: {
      async chat(options = {}) {
        calls.push(options)
        const content = handler(options, calls.length)
        return {
          success: true,
          content,
          usage: { total_tokens: 12 },
          model: options.model || 'fake-model',
          providerId: 'fake-provider'
        }
      }
    }
  }
}

{
  const fake = fakeTextProvider(() => '1. 李青云\n2. 王明月\nAkira\n佐藤花子\n')
  const result = await editorTextAiService.generateNames(
    { type: 'cn', surname: '李', gender: '男', count: 4, model: 'name-model' },
    fake.provider
  )
  assert.deepEqual(result.names, ['李青云', '王明月', '佐藤花子'])
  assert.equal(result.model, 'name-model')
  assert.equal(result.providerId, 'fake-provider')
  assert.equal(fake.calls[0].temperature, 0.9)
  assert.equal(fake.calls[0].model, 'name-model')
  assert.equal(fake.calls[0].messages[0].role, 'system')
}

{
  const fake = fakeTextProvider(() => '润色后的正文')
  const result = await editorTextAiService.polishChapter({ text: '原文' }, fake.provider)
  assert.equal(result.content, '润色后的正文')
  assert.equal(fake.calls[0].max_tokens, 8000)
}

{
  const fake = fakeTextProvider(() => '新增段落')
  const result = await editorTextAiService.continueChapter(
    { text: '已有正文', prompt: '加一点悬念', maxAddWords: 300 },
    fake.provider
  )
  assert.equal(result.content, '新增段落')
  assert.equal(fake.calls[0].max_tokens, 600)
  assert.match(fake.calls[0].messages[1].content, /加一点悬念/)
}

{
  const fake = fakeTextProvider(() => '画面描述：月色下的长街')
  const result = await editorTextAiService.sceneVisualPromptFromExcerpt(
    { text: '她走过长街。' },
    fake.provider
  )
  assert.equal(result.content, '月色下的长街')
  assert.equal(fake.calls[0].max_tokens, 512)
}

await assert.rejects(
  () => editorTextAiService.polishChapter({ text: '' }, fakeTextProvider(() => '').provider),
  /不能为空/
)

await assert.rejects(
  () =>
    editorTextAiService.continueChapter(
      { text: '已有正文', maxAddWords: 0 },
      fakeTextProvider(() => '').provider
    ),
  /可续写字数不足/
)

console.log('editor text ai tests passed')

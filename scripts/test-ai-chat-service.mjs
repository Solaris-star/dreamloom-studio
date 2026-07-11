import assert from 'node:assert/strict'
import { sendChatMessage } from '../src/main/services/aiChatService.js'

{
  const calls = []
  const result = await sendChatMessage({
    messages: [
      { role: 'user', content: '前面的无关消息' },
      { role: 'user', content: '帮我分析这一段冲突' }
    ],
    chapterContent: '主角在城门前遇到旧敌。',
    systemPreset: {
      systemPrompt: '只讨论小说创作。',
      modelParams: { temperature: 0.4, maxTokens: 900, topP: 0.8 }
    },
    textProvider: {
      async chat(options) {
        calls.push(options)
        return {
          content: '这段冲突需要补充双方当下的明确目标。',
          usage: { total_tokens: 20 },
          model: 'chat-model',
          providerId: 'chat-provider'
        }
      }
    }
  })

  assert.equal(result.success, true)
  assert.equal(result.providerId, 'chat-provider')
  assert.equal(result.model, 'chat-model')
  assert.match(result.content, /明确目标/)
  assert.equal(calls[0].temperature, 0.4)
  assert.equal(calls[0].max_tokens, 900)
  assert.equal(calls[0].topP, 0.8)
  assert.equal(calls[0].messages[0].role, 'system')
  assert.match(calls[0].messages[0].content, /只讨论小说创作/)
}

await assert.rejects(
  () =>
    sendChatMessage({
      messages: [{ role: 'user', content: '继续' }],
      textProvider: { async chat() { return { content: '   ', images: [] } } }
    }),
  /AI 返回内容为空/
)

await assert.rejects(
  () =>
    sendChatMessage({
      messages: [{ role: 'user', content: '   ' }],
      textProvider: { async chat() { return { content: '不应调用' } } }
    }),
  /请输入要发送的消息/
)

await assert.rejects(
  () => sendChatMessage({ messages: [{ role: 'user', content: '继续' }] }),
  /文本 AI 服务不可用/
)

console.log('ai chat service tests passed')

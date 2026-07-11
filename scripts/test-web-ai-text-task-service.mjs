import assert from 'node:assert/strict'
import {
  buildWebAiTextTaskMessages,
  runWebAiTextTask
} from '../src/main/services/webAiTextTaskService.js'

assert.deepEqual(
  buildWebAiTextTaskMessages({
    systemPrompt: '系统要求',
    instruction: '只返回正文',
    content: '原始正文'
  }),
  [
    { role: 'system', content: '系统要求\n\n只返回正文' },
    { role: 'user', content: '原始正文' }
  ]
)

assert.deepEqual(
  buildWebAiTextTaskMessages({
    messages: [
      { role: 'system', content: '规则' },
      { role: 'user', content: '问题' },
      { role: 'tool', content: '补充' },
      { role: 'assistant', content: '   ' }
    ]
  }),
  [
    { role: 'system', content: '规则' },
    { role: 'user', content: '问题' },
    { role: 'user', content: '补充' }
  ]
)

assert.throws(() => buildWebAiTextTaskMessages({ content: '  ' }), /内容不能为空/)

let receivedOptions = null
const successful = await runWebAiTextTask(
  {},
  {
    content: '正文',
    instruction: '润色',
    providerId: 'provider-1',
    modelName: 'model-1',
    maxTokens: 500
  },
  {
    chat: async (_store, options) => {
      receivedOptions = options
      return {
        success: true,
        content: '润色后的正文',
        providerId: 'provider-1',
        model: 'model-1',
        usage: { total_tokens: 12 }
      }
    }
  }
)
assert.equal(successful.success, true)
assert.equal(successful.content, '润色后的正文')
assert.deepEqual(successful.usage, { total_tokens: 12 })
assert.equal(receivedOptions.providerId, 'provider-1')
assert.equal(receivedOptions.modelName, 'model-1')
assert.equal(receivedOptions.maxTokens, 500)
assert.equal(receivedOptions.messages[0].role, 'system')
assert.equal(receivedOptions.signal instanceof AbortSignal, true)

const empty = await runWebAiTextTask(
  {},
  { content: '正文' },
  { chat: async () => ({ success: true, content: '   ' }) }
)
assert.deepEqual(empty, { success: false, message: 'AI 返回内容为空，请重试' })

const rejected = await runWebAiTextTask(
  {},
  { content: '正文' },
  { chat: async () => ({ success: false, message: '模型不可用' }) }
)
assert.deepEqual(rejected, { success: false, message: '模型不可用' })

const missingProvider = await runWebAiTextTask(
  {},
  { content: '正文' },
  {
    chat: async () => {
      throw new Error('请先配置文本 AI 服务')
    }
  }
)
assert.deepEqual(missingProvider, { success: false, message: '请先配置文本 AI 服务' })

const timedOut = await runWebAiTextTask(
  {},
  { content: '正文', timeoutMs: 1 },
  {
    chat: async (_store, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true }
        )
      })
  }
)
assert.equal(timedOut.success, false)
assert.match(timedOut.message, /请求超时/)

const invalid = await runWebAiTextTask({}, { content: '  ' }, { chat: async () => ({}) })
assert.deepEqual(invalid, { success: false, message: 'AI 文本任务内容不能为空' })

console.log('web AI text task service tests passed')

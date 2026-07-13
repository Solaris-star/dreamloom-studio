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

assert.deepEqual(
  buildWebAiTextTaskMessages({
    messages: [null, { role: 'assistant', content: null }],
    text: '旧字段正文'
  }),
  [{ role: 'user', content: '旧字段正文' }]
)

assert.equal(
  buildWebAiTextTaskMessages({
    messages: Array.from({ length: 101 }, (_, index) => ({
      role: 'user',
      content: `消息 ${index + 1}`
    }))
  }).length,
  100
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

const legacyFields = await runWebAiTextTask(
  {},
  { content: '正文', max_tokens: 320, timeoutMs: Number.POSITIVE_INFINITY },
  {
    chat: async (_store, options) => {
      assert.equal(options.maxTokens, 320)
      assert.equal(options.timeoutMs, 180000)
      return { text: '旧字段结果', usage: null }
    }
  }
)
assert.deepEqual(legacyFields, {
  success: true,
  content: '旧字段结果',
  providerId: '',
  model: '',
  usage: {}
})

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

const rejectedWithError = await runWebAiTextTask(
  {},
  { content: '正文' },
  { chat: async () => ({ success: false, error: '模型连接失败' }) }
)
assert.deepEqual(rejectedWithError, { success: false, message: '模型连接失败' })

const rejectedWithoutMessage = await runWebAiTextTask(
  {},
  { content: '正文' },
  { chat: async () => ({ success: false }) }
)
assert.deepEqual(rejectedWithoutMessage, { success: false, message: 'AI 文本请求失败' })

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

const emptyError = await runWebAiTextTask(
  {},
  { content: '正文', timeoutMs: 999999 },
  {
    chat: async (_store, options) => {
      assert.equal(options.timeoutMs, 300000)
      throw {}
    }
  }
)
assert.deepEqual(emptyError, { success: false, message: 'AI 文本请求失败' })

const aborted = await runWebAiTextTask(
  {},
  { content: '正文', timeoutMs: -1 },
  {
    chat: async (_store, options) => {
      assert.equal(options.timeoutMs, 180000)
      throw Object.assign(new Error('用户停止请求'), { name: 'AbortError' })
    }
  }
)
assert.deepEqual(aborted, { success: false, message: '用户停止请求' })

const abortedWithoutMessage = await runWebAiTextTask(
  {},
  { content: '正文' },
  {
    chat: async () => {
      throw { name: 'AbortError' }
    }
  }
)
assert.deepEqual(abortedWithoutMessage, { success: false, message: 'AI 请求已停止' })

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

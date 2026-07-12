import assert from 'node:assert/strict'
import { handleAiChatRoute, isAiChatRoute } from '../src/main/webApi/aiChatRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  store: { name: 'store' },
  createProvider: (store, payload) => {
    calls.push(['provider', store, payload])
    return { service: { name: 'provider' } }
  },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  },
  sendChat: async (payload) => {
    calls.push(['chat', payload])
    return { success: true, content: '回复' }
  }
}

assert.equal(isAiChatRoute('/api/ai/chat'), true)
assert.equal(isAiChatRoute('/api/ai/text-task'), false)
assert.equal(await handleAiChatRoute({ ...common, path: '/api/ai/text-task' }), false)

await handleAiChatRoute({
  ...common,
  path: '/api/ai/chat',
  body: { bookName: '作品', messages: [{ role: 'user', content: '继续' }] }
})
assert.deepEqual(responses.at(-1), [{ success: true, content: '回复' }, 200])
assert.equal(calls.find((call) => call[0] === 'path')[3].ensure, true)
assert.equal(calls.find((call) => call[0] === 'chat')[1].bookPath, 'D:\\books\\作品')
assert.deepEqual(calls.find((call) => call[0] === 'chat')[1].textProvider, {
  name: 'provider'
})

calls.length = 0
await handleAiChatRoute({
  ...common,
  path: '/api/ai/chat',
  body: { messages: [{ role: 'user', content: '没有书籍上下文' }] }
})
assert.equal(calls.some((call) => call[0] === 'path'), false)
assert.equal(calls.find((call) => call[0] === 'chat')[1].bookPath, '')

await handleAiChatRoute({
  ...common,
  path: '/api/ai/chat',
  sendChat: async () => ({ success: false, message: 'AI 服务不可用' })
})
assert.deepEqual(responses.at(-1), [{ success: false, message: 'AI 服务不可用' }, 502])

await assert.rejects(
  () =>
    handleAiChatRoute({
      ...common,
      path: '/api/ai/chat',
      body: { bookPath: '..\\其他目录' },
      resolveBookPath: () => {
        throw Object.assign(new Error('书籍路径超出数据目录'), { statusCode: 400 })
      }
    }),
  /书籍路径超出数据目录/
)

console.log('AI 对话路由测试通过')

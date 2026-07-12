import assert from 'node:assert/strict'
import { handleAiTextRoute, isAiTextRoute } from '../src/main/webApi/aiTextRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  store: { name: 'store' },
  readHistory: () => [
    { id: 'a', feature: 'polish' },
    { id: 'b', feature: 'continue' }
  ],
  runTextTask: async (store, payload) => {
    calls.push(['text', store, payload])
    return { success: true, content: '结果' }
  },
  requestProxy: async (payload) => {
    calls.push(['proxy', payload])
    return { success: false, message: '服务不可用' }
  },
  getProgressServerInfo: () => ({ success: true, url: 'ws://localhost' }),
  createProvider: (store, payload) => {
    calls.push(['provider', store, payload])
    return { service: { name: 'provider' } }
  },
  generateBookIdeas: async (payload, service) => {
    calls.push(['ideas', payload, service])
    return { success: true, plans: [{ title: '新书' }] }
  },
  generateChapter: async (payload, service) => {
    calls.push(['chapter', payload, service])
    return { content: '章节正文' }
  },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  }
}

for (const path of [
  '/api/ai/history',
  '/api/ai/text-task',
  '/api/ai-proxy',
  '/api/editor-agent/progress-server',
  '/api/ai/book-ideas',
  '/api/ai/generate-chapter-from-outline'
]) {
  assert.equal(isAiTextRoute(path), true)
}
assert.equal(await handleAiTextRoute({ ...common, path: '/api/books/list' }), false)

await handleAiTextRoute({
  ...common,
  path: '/api/ai/history',
  body: { feature: 'polish' }
})
assert.deepEqual(responses.at(-1)[0].items, [{ id: 'a', feature: 'polish' }])

await handleAiTextRoute({ ...common, path: '/api/ai/text-task', body: { content: '正文' } })
assert.equal(responses.at(-1)[1], 200)
assert.equal(calls.at(-1)[0], 'text')

await handleAiTextRoute({
  ...common,
  path: '/api/ai/text-task',
  runTextTask: async () => ({ success: false, message: '超时' })
})
assert.equal(responses.at(-1)[1], 502)

await handleAiTextRoute({ ...common, path: '/api/ai-proxy' })
assert.equal(responses.at(-1)[1], 502)

await handleAiTextRoute({ ...common, path: '/api/editor-agent/progress-server' })
assert.equal(responses.at(-1)[1], 200)

await handleAiTextRoute({
  ...common,
  path: '/api/editor-agent/progress-server',
  getProgressServerInfo: () => ({ success: false, message: '未启动' })
})
assert.equal(responses.at(-1)[1], 503)

await handleAiTextRoute({ ...common, path: '/api/ai/book-ideas', body: { idea: '新书' } })
assert.equal(responses.at(-1)[0].plans[0].title, '新书')

await handleAiTextRoute({
  ...common,
  path: '/api/ai/generate-chapter-from-outline',
  body: { bookName: '作品', outlineContent: '章纲', targetWords: 1800 }
})
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  content: '章节正文',
  targetWords: 1800
})
assert.equal(calls.find((call) => call[0] === 'path')[3].ensure, true)
assert.equal(calls.find((call) => call[0] === 'chapter')[1].bookPath, 'D:\\books\\作品')

console.log('AI 文本路由测试通过')

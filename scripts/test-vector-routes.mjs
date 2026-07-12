import assert from 'node:assert/strict'
import { handleVectorRoute, isVectorRoute } from '../src/main/webApi/vectorRoutes.js'

const calls = []
const responses = []
const service = {
  async search(...args) {
    calls.push(['search', ...args])
    return [{ id: 'chunk-1' }]
  },
  async getStats(...args) {
    calls.push(['stats', ...args])
    return { totalRows: 2, sources: ['source-1'] }
  },
  async deleteBySource(...args) {
    calls.push(['delete', ...args])
    return { deleted: 2 }
  }
}
const resolveCalls = []
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  sanitizeText: (value) => String(value || '').trim(),
  resolveBookPath: (...args) => {
    resolveCalls.push(args)
    return 'D:/books/长夜'
  },
  service
}

for (const path of ['/api/vector/search', '/api/vector/stats', '/api/vector/delete-source']) {
  assert.equal(isVectorRoute(path), true)
}
assert.equal(isVectorRoute('/api/market/trends'), false)
assert.equal(
  await handleVectorRoute({ ...common, path: '/api/market/trends', body: {} }),
  false
)
assert.equal(resolveCalls.length, 0)

const searchBody = {
  bookName: '长夜',
  queryText: '  主角身世  ',
  embeddingConfig: { model: 'embedding-model' },
  limit: '8',
  filter: "sourceBookName = '长夜'"
}
await handleVectorRoute({
  ...common,
  path: '/api/vector/search',
  body: searchBody
})
assert.deepEqual(resolveCalls.at(-1), [searchBody, 'D:/books', { ensure: true }])
assert.deepEqual(calls.at(-1), [
  'search',
  'D:/books/长夜',
  '主角身世',
  searchBody.embeddingConfig,
  { limit: 8, filter: searchBody.filter }
])
assert.deepEqual(responses.at(-1), {
  success: true,
  items: [{ id: 'chunk-1' }]
})

await handleVectorRoute({
  ...common,
  path: '/api/vector/stats',
  body: { bookName: '长夜' }
})
assert.deepEqual(calls.at(-1), ['stats', 'D:/books/长夜'])
assert.deepEqual(responses.at(-1), {
  success: true,
  totalRows: 2,
  sources: ['source-1']
})

await handleVectorRoute({
  ...common,
  path: '/api/vector/delete-source',
  body: { bookName: '长夜', sourceExtractionId: ' source-1 ' }
})
assert.deepEqual(calls.at(-1), ['delete', 'D:/books/长夜', 'source-1'])
assert.deepEqual(responses.at(-1), { success: true, deleted: 2 })

for (const [body, message] of [
  [{ bookName: '长夜', embeddingConfig: {} }, '搜索内容不能为空'],
  [{ bookName: '长夜', query: '测试' }, '缺少 Embedding 配置'],
  [{ bookName: '长夜', query: '测试', embeddingConfig: [] }, '缺少 Embedding 配置']
]) {
  const callCount = calls.length
  await assert.rejects(
    handleVectorRoute({ ...common, path: '/api/vector/search', body }),
    (error) => error.statusCode === 400 && error.message === message
  )
  assert.equal(calls.length, callCount)
}

const callCount = calls.length
await assert.rejects(
  handleVectorRoute({
    ...common,
    path: '/api/vector/delete-source',
    body: { bookName: '长夜', sourceExtractionId: '   ' }
  }),
  (error) => error.statusCode === 400 && error.message === '缺少来源 ID'
)
assert.equal(calls.length, callCount)

const pathError = Object.assign(new Error('书籍路径越界'), { statusCode: 400 })
await assert.rejects(
  handleVectorRoute({
    ...common,
    path: '/api/vector/stats',
    body: { bookPath: 'D:/outside' },
    resolveBookPath: () => {
      throw pathError
    }
  }),
  pathError
)

console.log('向量路由测试通过')

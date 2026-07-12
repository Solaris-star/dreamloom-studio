import assert from 'node:assert/strict'
import {
  handleExtractionRoute,
  isExtractionRoute
} from '../src/main/webApi/extractionRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  sanitizeText: (value) => String(value || '').trim(),
  store: { name: 'store' },
  dimensions: ['characters', 'settings'],
  dimensionLabels: { characters: '人物' },
  tasks: {
    create: (store, payload) => {
      calls.push(['create', store, payload])
      return { success: true, jobId: 'job-1' }
    },
    progress: (jobId) => {
      calls.push(['progress', jobId])
      return { success: true, jobId }
    }
  },
  service: {
    listExtractions: (bookPath) => ({ success: true, extractions: [bookPath] }),
    getExtraction: (bookPath, id, payload) => ({ success: true, bookPath, id, payload }),
    getExtractionResultPage: (bookPath, id, payload) => ({
      success: true,
      bookPath,
      id,
      payload
    }),
    deleteExtraction: async (bookPath, id) => ({ success: true, bookPath, id }),
    searchKnowledge: async (bookPath, options, embeddingConfig) => {
      calls.push(['search', bookPath, options, embeddingConfig])
      return [{ id: 'result-1' }]
    }
  },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  }
}

for (const path of [
  '/api/extraction/dimensions',
  '/api/extraction/create',
  '/api/extraction/progress',
  '/api/extraction/list',
  '/api/extraction/get',
  '/api/extraction/result-page',
  '/api/extraction/delete',
  '/api/extraction/search'
]) {
  assert.equal(isExtractionRoute(path), true)
}
assert.equal(await handleExtractionRoute({ ...common, path: '/api/books/list' }), false)

await handleExtractionRoute({ ...common, path: '/api/extraction/dimensions' })
assert.deepEqual(responses.at(-1)[0], [
  { key: 'characters', label: '人物' },
  { key: 'settings', label: 'settings' }
])

await handleExtractionRoute({
  ...common,
  path: '/api/extraction/create',
  body: { bookName: '作品' }
})
assert.equal(responses.at(-1)[1], 202)
assert.equal(calls.at(-1)[0], 'create')
assert.equal(calls.at(-1)[1], common.store)
assert.equal(calls.at(-1)[2].bookPath, 'D:\\books\\作品')
assert.equal(calls.find((call) => call[0] === 'path')[3].ensure, false)

await handleExtractionRoute({
  ...common,
  path: '/api/extraction/create',
  tasks: { ...common.tasks, create: () => ({ success: false, message: '任务已存在' }) }
})
assert.equal(responses.at(-1)[1], 409)

await handleExtractionRoute({
  ...common,
  path: '/api/extraction/progress',
  body: { jobId: 'job-1' }
})
assert.deepEqual(responses.at(-1)[0], { success: true, jobId: 'job-1' })

for (const path of [
  '/api/extraction/list',
  '/api/extraction/get',
  '/api/extraction/result-page',
  '/api/extraction/delete'
]) {
  await handleExtractionRoute({
    ...common,
    path,
    body: { bookName: '作品', extractionId: 'ext-1' }
  })
  assert.equal(calls.filter((call) => call[0] === 'path').at(-1)[3].ensure, true)
  assert.equal(responses.at(-1)[0].success, true)
}

await assert.rejects(
  handleExtractionRoute({
    ...common,
    path: '/api/extraction/search',
    body: { bookName: '作品', query: '  ' }
  }),
  (error) => error.message === '搜索内容不能为空' && error.statusCode === 400
)

await handleExtractionRoute({
  ...common,
  path: '/api/extraction/search',
  body: {
    bookName: '作品',
    keyword: '主角',
    dimensions: ['characters'],
    topK: 5,
    embeddingConfig: { provider: 'local' }
  }
})
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  items: [{ id: 'result-1' }]
})
assert.deepEqual(calls.at(-1), [
  'search',
  'D:\\books\\作品',
  { query: '主角', dimensions: ['characters'], topK: 5 },
  { provider: 'local' }
])

console.log('拆书路由测试通过')

import assert from 'node:assert/strict'
import {
  handleNovelDownloadRoute,
  isNovelDownloadRoute
} from '../src/main/webApi/novelDownloadRoutes.js'
import { assertSourceUrl } from '../src/main/services/novelDownloader.js'

const responses = []
const sendJson = (_res, payload, status = 200) => responses.push({ payload, status })
const sanitizeText = (value) => String(value || '').trim()
const calls = []
const service = {
  getBookSources: () => [
    { id: 'source-a', name: '书源 A' },
    { id: 'source-b', name: '书源 B' }
  ],
  search: async (keyword, sourceId) => {
    calls.push(['search', keyword, sourceId])
    if (sourceId === 'source-b') throw new Error('连接失败')
    return [{ title: '作品', sourceId }]
  },
  getChapterList: async (...args) => {
    calls.push(['getChapterList', ...args])
    return [{ title: '第一章', url: 'https://example.com/1' }]
  },
  getChapterContent: async (url, sourceId) => {
    calls.push(['getChapterContent', url, sourceId])
    if (url.endsWith('/2')) throw new Error('正文不存在')
    return '正文'
  }
}
const common = { res: {}, sendJson, sanitizeText, service }

for (const path of [
  '/api/novel/sources',
  '/api/novel/search',
  '/api/novel/chapters',
  '/api/novel/book-info',
  '/api/novel/download'
]) {
  assert.equal(isNovelDownloadRoute(path), true)
}
assert.equal(isNovelDownloadRoute('/api/books/list'), false)
assert.equal(
  await handleNovelDownloadRoute({ ...common, path: '/api/books/list', body: {} }),
  false
)

await handleNovelDownloadRoute({ ...common, path: '/api/novel/sources', body: {} })
assert.equal(responses.at(-1).payload.length, 2)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/search',
  body: { keyword: ' 作品 ', sourceId: 'all' }
})
assert.deepEqual(calls.slice(-2), [
  ['search', '作品', 'source-a'],
  ['search', '作品', 'source-b']
])
assert.equal(responses.at(-1).payload.list.length, 1)
assert.deepEqual(responses.at(-1).payload.sourceErrors, ['书源 B: 连接失败'])

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/search',
  body: { keyword: '  ' }
})
assert.deepEqual(responses.at(-1).payload, { success: true, list: [], sourceErrors: [] })

await assert.rejects(
  handleNovelDownloadRoute({
    ...common,
    path: '/api/novel/search',
    body: { keyword: '作品', sourceId: 'missing' }
  }),
  (error) => error.statusCode === 400 && /未知书源/.test(error.message)
)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/chapters',
  body: { bookUrl: ' https://example.com/book ', sourceId: 'source-a' }
})
assert.deepEqual(calls.at(-1), [
  'getChapterList',
  'https://example.com/book',
  'source-a'
])

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/book-info',
  body: {}
})
assert.equal(responses.at(-1).status, 501)
assert.equal(responses.at(-1).payload.success, false)

await assert.rejects(
  handleNovelDownloadRoute({
    ...common,
    path: '/api/novel/download',
    body: { chapterList: [], sourceId: 'source-a' }
  }),
  (error) => error.statusCode === 400
)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/download',
  body: {
    sourceId: 'source-a',
    chapterList: [
      { title: '第一章', url: 'https://example.com/1' },
      { title: '第二章', url: 'https://example.com/2' }
    ]
  }
})
assert.equal(responses.at(-1).payload.success, true)
assert.equal(responses.at(-1).payload.chapters[1].failed, true)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/download',
  body: {
    sourceId: 'source-a',
    chapterList: [{ title: '第二章', url: 'https://example.com/2' }]
  }
})
assert.equal(responses.at(-1).payload.success, false)
assert.equal(responses.at(-1).payload.message, '所有章节下载失败')

assert.match(assertSourceUrl('https://www.shuhaige.net/book/1', 'shuhaige'), /shuhaige/)
assert.throws(
  () => assertSourceUrl('http://127.0.0.1/private', 'shuhaige'),
  (error) => error.statusCode === 400 && /不匹配/.test(error.message)
)
assert.throws(
  () => assertSourceUrl('file:///etc/passwd', 'shuhaige'),
  (error) => error.statusCode === 400 && /协议/.test(error.message)
)

console.log('小说下载路由测试通过')

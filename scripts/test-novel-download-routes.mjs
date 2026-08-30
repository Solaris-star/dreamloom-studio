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
// 并发搜索 + 章节数探测并行，calls 顺序不再确定，断言调用集合
const searchCalls = calls.filter((c) => c[0] === 'search').map((c) => c.join('|')).sort()
assert.deepEqual(searchCalls, ['search|作品|source-a', 'search|作品|source-b'])
assert.equal(responses.at(-1).payload.list.length, 1)
// 书源池模式：结果携带 sourceName、章节数探测结果
const pooled = responses.at(-1).payload.list[0]
assert.equal(pooled.sourceName, '书源 A')
assert.equal(pooled.chapterCount, 1)
assert.deepEqual(responses.at(-1).payload.sourceErrors, ['书源 B: 连接失败'])

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/search',
  body: { keyword: '  ' }
})
assert.deepEqual(responses.at(-1).payload, { success: true, list: [], sourceErrors: [] })

await assert.rejects(() => handleNovelDownloadRoute({
    ...common,
    path: '/api/novel/search',
    body: { keyword: '作品', sourceId: 'missing' }
  }),
  (error) => error.statusCode === 400 && /未知书源/.test(error.message)
)

// --- 排序专测：相关性优先，同档按章节数降序 ---
{
  const sortedResponses = []
  const sortedSendJson = (_res, payload, status = 200) =>
    sortedResponses.push({ payload, status })
  const multiService = {
    ...service,
    search: async (keyword, sourceId) => {
      if (sourceId === 'source-a') {
        return [
          { title: '作品外传', author: '别人', sourceId },
          { title: '作品', author: '作者甲', sourceId }
        ]
      }
      return [
        { title: '作品', author: '作者甲', sourceId },
        { title: '作品合集', author: '作者甲', sourceId }
      ]
    },
    getChapterList: async (url, sourceId) => {
      if (String(url).includes('waidan')) return new Array(30).fill({ title: 'x', url: 'y' })
      if (String(url).includes('heji')) return new Array(200).fill({ title: 'x', url: 'y' })
      return new Array(80).fill({ title: 'x', url: 'y' })
    }
  }
  // 让不同候选走不同 URL，才能区分章节数
  multiService.search = async (keyword, sourceId) => {
    if (sourceId === 'source-a') {
      return [
        { title: '作品外传', author: '别人', url: 'https://e.com/waidan', sourceId },
        { title: '作品', author: '作者甲', url: 'https://e.com/zhupin', sourceId }
      ]
    }
    return [
      { title: '作品', author: '作者甲', url: 'https://e.com/zhupin2', sourceId },
      { title: '作品合集', author: '作者甲', url: 'https://e.com/heji', sourceId }
    ]
  }
  await handleNovelDownloadRoute({
    res: {},
    sendJson: sortedSendJson,
    sanitizeText,
    service: multiService,
    path: '/api/novel/search',
    body: { keyword: '作品', sourceId: 'all' }
  })
  const titles = sortedResponses.at(-1).payload.list.map((row) => row.title)
  // 精确匹配「作品」排最前；同为包含匹配时 200 章的「作品合集」排在「作品外传」(30章) 前
  assert.deepEqual(titles, ['作品', '作品合集', '作品外传'])
  const counts = sortedResponses.at(-1).payload.list.map((row) => row.chapterCount)
  assert.deepEqual(counts, [80, 200, 30])
  // 去重合并：同书两源收录，保留 1 条并记录 sourceCandidates
  assert.equal(sortedResponses.at(-1).payload.list[0].sourceCandidates, 2)
}

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

await assert.rejects(() => handleNovelDownloadRoute({
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

// async job: start + progress
const jobService = {
  start: ({ chapterList, sourceId }) => {
    calls.push(['start', chapterList.length, sourceId])
    return { success: true, status: 'queued', jobId: 'job-1', total: chapterList.length }
  },
  progress: (jobId) => {
    calls.push(['progress', jobId])
    return {
      success: true,
      jobId,
      status: 'completed',
      current: 1,
      total: 1,
      percent: 100,
      failed: 0,
      done: true,
      chapters: [{ title: '第一章', content: '正文', failed: false, error: '' }]
    }
  },
  cancel: (jobId) => {
    calls.push(['cancel', jobId])
    return { success: true, jobId, status: 'cancelling' }
  }
}

assert.equal(isNovelDownloadRoute('/api/novel/download/start'), true)
assert.equal(isNovelDownloadRoute('/api/novel/download/progress'), true)
assert.equal(isNovelDownloadRoute('/api/novel/download/cancel'), true)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/download/start',
  body: {
    sourceId: 'source-a',
    chapterList: [{ title: '第一章', url: 'https://example.com/1' }]
  },
  jobService
})
assert.equal(responses.at(-1).status, 202)
assert.equal(responses.at(-1).payload.jobId, 'job-1')
assert.deepEqual(calls.at(-1), ['start', 1, 'source-a'])

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/download/progress',
  body: { jobId: 'job-1' },
  jobService
})
assert.equal(responses.at(-1).payload.done, true)
assert.equal(responses.at(-1).payload.chapters.length, 1)

await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/download/cancel',
  body: { jobId: 'job-1' },
  jobService
})
assert.equal(responses.at(-1).payload.success, true)

// default search is all sources
calls.length = 0
await handleNovelDownloadRoute({
  ...common,
  path: '/api/novel/search',
  body: { keyword: '作品' }
})
const defaultSearchCalls = calls.filter((c) => c[0] === 'search').map((c) => c.join('|')).sort()
assert.deepEqual(defaultSearchCalls, ['search|作品|source-a', 'search|作品|source-b'])
// 书源池模式：sourceName 显式返回（前端展示用）
assert.equal(responses.at(-1).payload.list[0].sourceName, '书源 A')

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

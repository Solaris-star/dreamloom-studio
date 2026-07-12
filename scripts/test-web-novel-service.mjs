import assert from 'node:assert/strict'

const requests = []
const responses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  requests.push({ url, payload })
  const body = responses.get(url) ?? { success: false, message: `未设置响应：${url}` }
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/novel.js')

responses.set('/api/novel/sources', [{ id: 'source-a', name: '书源 A' }])
assert.deepEqual(await service.getNovelSources(), [{ id: 'source-a', name: '书源 A' }])

responses.set('/api/novel/sources', {
  sources: [{ id: ' source-b ', name: ' 书源 B ', enabled: true }]
})
assert.deepEqual(await service.getNovelSources(), [
  { id: 'source-b', name: '书源 B', enabled: true }
])

responses.set('/api/novel/search', {
  success: true,
  list: [{ title: '作品' }],
  sourceErrors: null
})
assert.equal((await service.searchNovel('作品', 'source-a')).list.length, 1)
assert.deepEqual((await service.searchNovel('作品', 'source-a')).sourceErrors, [])
assert.deepEqual(requests.at(-1), {
  url: '/api/novel/search',
  payload: { keyword: '作品', sourceId: 'source-a' }
})

responses.set('/api/novel/chapters', {
  success: true,
  chapters: [{ title: '第一章', url: 'https://example.com/1' }]
})
assert.equal(
  (await service.getNovelChapterList('https://example.com/book', 'source-a')).chapters.length,
  1
)

responses.set('/api/novel/book-info', { success: true, info: { title: '作品' } })
assert.equal(
  (await service.getNovelBookInfo('https://example.com/book', 'source-a')).info.title,
  '作品'
)

responses.set('/api/novel/download', {
  success: true,
  chapters: [{ title: '第一章', content: '正文' }]
})
assert.equal(
  (
    await service.downloadNovelChapters(
      [{ title: '第一章', url: 'https://example.com/1' }, null],
      'source-a'
    )
  ).chapters[0].content,
  '正文'
)
assert.deepEqual(requests.at(-1).payload.chapterList, [
  { title: '第一章', url: 'https://example.com/1' },
  { title: '第2章', url: '' }
])

responses.set('/api/novel/download', {
  success: true,
  chapters: [{ title: '单章', content: ' 单章正文 ' }]
})
assert.equal(
  (await service.downloadNovelChapter('https://example.com/one', 'source-a')).content,
  ' 单章正文 '
)

responses.set('/api/novel/download', {
  success: true,
  chapters: [{ title: '失败章', failed: true, error: '来源不可用' }]
})
await assert.rejects(
  () => service.downloadNovelChapter('https://example.com/failed', 'source-a'),
  /来源不可用/
)

responses.set('/api/novel/sources', [{ id: '', name: '错误书源' }])
await assert.rejects(() => service.getNovelSources(), /书源格式不正确/)

responses.set('/api/novel/sources', { sources: {} })
await assert.rejects(() => service.getNovelSources(), /接口返回格式不正确/)

responses.set('/api/novel/search', { success: false, message: '搜索服务不可用' })
await assert.rejects(() => service.searchNovel('作品'), /搜索服务不可用/)

responses.set('/api/novel/search', { success: true, list: {}, sourceErrors: [] })
await assert.rejects(() => service.searchNovel('作品'), /接口返回格式不正确/)

responses.set('/api/novel/search', { success: true, list: [], sourceErrors: {} })
await assert.rejects(() => service.searchNovel('作品'), /接口返回格式不正确/)

responses.set('/api/novel/chapters', { success: false, error: '目录读取失败' })
await assert.rejects(
  () => service.getNovelChapterList('https://example.com/book', 'source-a'),
  /目录读取失败/
)

responses.set('/api/novel/chapters', { success: true, chapters: null })
await assert.rejects(
  () => service.getNovelChapterList('https://example.com/book', 'source-a'),
  /接口返回格式不正确/
)

responses.set('/api/novel/book-info', { success: true, info: [] })
await assert.rejects(
  () => service.getNovelBookInfo('https://example.com/book', 'source-a'),
  /接口返回格式不正确/
)

responses.set('/api/novel/download', { success: false, error: '批量下载失败' })
await assert.rejects(() => service.downloadNovelChapters([], 'source-a'), /批量下载失败/)

responses.set('/api/novel/download', { success: true, chapters: null })
await assert.rejects(() => service.downloadNovelChapters([], 'source-a'), /接口返回格式不正确/)

assert.deepEqual(service.normalizeDownloadedChapters(null), [])
assert.deepEqual(
  service.normalizeDownloadedChapters([
    null,
    { title: '失败', content: '正文', failed: true },
    { title: '空章', content: ' ' },
    { title: ' 第一章 ', content: ' 正文一 ' },
    { content: '正文二' }
  ]),
  [
    { title: '第一章', content: '正文一' },
    { title: '第2章', content: '正文二' }
  ]
)

assert.equal(service.uniqueDownloadedBookName('作品', []), '作品')
assert.equal(
  service.uniqueDownloadedBookName('作品', [{ name: '作品' }, { folderName: '作品_2' }]),
  '作品_3'
)
assert.equal(service.uniqueDownloadedBookName('作品:/?*', [{ id: '其他作品' }]), '作品____')

await assert.rejects(
  () => service.exportDownloadedNovelTextFile({ title: '作品', content: '正文' }),
  /当前浏览器不支持文件下载/
)

const clicked = []
globalThis.document = {
  body: {
    appendChild(anchor) {
      clicked.push(anchor)
    }
  },
  createElement() {
    return {
      style: {},
      click() {
        this.clicked = true
      },
      remove() {
        this.removed = true
      }
    }
  }
}
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = () => {}
const exportResult = await service.exportDownloadedNovelTextFile({
  title: '作品:一',
  content: '正文'
})
assert.deepEqual(exportResult, { success: true, fileName: '作品_一.txt' })
assert.equal(clicked[0].download, '作品_一.txt')
assert.equal(clicked[0].clicked, true)
assert.equal(clicked[0].removed, true)
URL.createObjectURL = originalCreateObjectURL
URL.revokeObjectURL = originalRevokeObjectURL

console.log('Web 小说下载服务测试通过')

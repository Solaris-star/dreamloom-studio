import novelDownloader from '../services/novelDownloader.js'

const NOVEL_ROUTES = new Set([
  '/api/novel/sources',
  '/api/novel/search',
  '/api/novel/chapters',
  '/api/novel/book-info',
  '/api/novel/download'
])

export function isNovelDownloadRoute(path) {
  return NOVEL_ROUTES.has(path)
}

export async function handleNovelDownloadRoute({
  path,
  body,
  res,
  sendJson,
  sanitizeText,
  service = novelDownloader
}) {
  if (!isNovelDownloadRoute(path)) return false

  const payload = body || {}
  if (path === '/api/novel/sources') {
    sendJson(res, service.getBookSources())
    return true
  }

  if (path === '/api/novel/book-info') {
    sendJson(res, { success: false, message: '当前书源不提供书籍详情' }, 501)
    return true
  }

  if (path === '/api/novel/search') {
    const keyword = sanitizeText(payload.keyword)
    const sourceId = sanitizeText(payload.sourceId)
    if (!keyword) {
      sendJson(res, { success: true, list: [], sourceErrors: [] })
      return true
    }
    const sources = service.getBookSources()
    const searchSources =
      sourceId === 'all'
        ? sources
        : sources.filter((source) => source.id === (sourceId || sources[0]?.id))
    if (!searchSources.length) {
      throw Object.assign(new Error(`未知书源: ${sourceId}`), { statusCode: 400 })
    }
    const list = []
    const sourceErrors = []
    for (const source of searchSources) {
      try {
        const rows = await service.search(keyword, source.id)
        list.push(
          ...rows.map((row) => ({
            ...row,
            sourceName: row.sourceName || source.name
          }))
        )
      } catch (error) {
        sourceErrors.push(`${source.name}: ${error?.message || '搜索失败'}`)
      }
    }
    sendJson(res, {
      success: true,
      list,
      sourceErrors,
      message: list.length ? '' : sourceErrors[0] || '没有找到相关小说'
    })
    return true
  }

  const sourceId = sanitizeText(payload.sourceId)
  if (path === '/api/novel/chapters') {
    const chapters = await service.getChapterList(sanitizeText(payload.bookUrl), sourceId)
    sendJson(res, { success: true, chapters })
    return true
  }

  const chapterList = Array.isArray(payload.chapterList) ? payload.chapterList : []
  if (!chapterList.length) {
    throw Object.assign(new Error('请选择需要下载的章节'), { statusCode: 400 })
  }
  const chapters = []
  for (const chapter of chapterList) {
    const title = sanitizeText(chapter?.title) || '正文'
    try {
      const content = await service.getChapterContent(sanitizeText(chapter?.url), sourceId)
      chapters.push({ title, content, failed: false, error: '' })
    } catch (error) {
      chapters.push({
        title,
        content: '',
        failed: true,
        error: error?.message || '下载失败'
      })
    }
  }
  sendJson(res, {
    success: chapters.some((chapter) => !chapter.failed),
    chapters,
    message: chapters.every((chapter) => chapter.failed) ? '所有章节下载失败' : ''
  })
  return true
}

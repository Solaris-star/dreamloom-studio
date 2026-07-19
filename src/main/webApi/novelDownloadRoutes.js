import novelDownloader from '../services/novelDownloader.js'
import { createNovelDownloadJobService } from '../services/novelDownloadJobService.js'

const NOVEL_ROUTES = new Set([
  '/api/novel/sources',
  '/api/novel/search',
  '/api/novel/chapters',
  '/api/novel/book-info',
  '/api/novel/download',
  '/api/novel/download/start',
  '/api/novel/download/progress',
  '/api/novel/download/cancel'
])

const defaultJobService = createNovelDownloadJobService({ downloader: novelDownloader })

export function isNovelDownloadRoute(path) {
  return NOVEL_ROUTES.has(path)
}

export async function handleNovelDownloadRoute({
  path,
  body,
  res,
  sendJson,
  sanitizeText,
  service = novelDownloader,
  jobService = defaultJobService
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
    // 默认全源聚合；前端不再选手源
    const sourceId = sanitizeText(payload.sourceId) || 'all'
    if (!keyword) {
      sendJson(res, { success: true, list: [], sourceErrors: [] })
      return true
    }
    const sources = service.getBookSources()
    const searchSources =
      sourceId === 'all' ? sources : sources.filter((source) => source.id === sourceId)
    if (!searchSources.length) {
      throw Object.assign(new Error(`未知书源: ${sourceId}`), { statusCode: 400 })
    }
    const list = []
    const sourceErrors = []
    // 并行搜各源，加速
    await Promise.all(
      searchSources.map(async (source) => {
        try {
          const rows = await service.search(keyword, source.id)
          for (const row of rows || []) {
            list.push({
              ...row,
              // 保留 sourceId 供下载，不暴露 sourceName
              sourceId: row.sourceId || source.id
            })
          }
        } catch (error) {
          sourceErrors.push(`${source.name}: ${error?.message || '搜索失败'}`)
        }
      })
    )
    // 按 title+author 去重，保留第一条（先返回的源）
    const seen = new Set()
    const deduped = []
    for (const row of list) {
      const key = `${String(row.title || '').trim()}::${String(row.author || '').trim()}`
      if (seen.has(key)) continue
      seen.add(key)
      const { sourceName, ...rest } = row
      deduped.push(rest)
    }
    sendJson(res, {
      success: true,
      list: deduped,
      sourceErrors,
      message: deduped.length ? '' : sourceErrors[0] || '没有找到相关小说'
    })
    return true
  }

  if (path === '/api/novel/download/start') {
    const sourceId = sanitizeText(payload.sourceId)
    const chapterList = Array.isArray(payload.chapterList) ? payload.chapterList : []
    const result = jobService.start({ chapterList, sourceId })
    sendJson(res, result, 202)
    return true
  }

  if (path === '/api/novel/download/progress') {
    sendJson(res, jobService.progress(sanitizeText(payload.jobId)))
    return true
  }

  if (path === '/api/novel/download/cancel') {
    sendJson(res, jobService.cancel(sanitizeText(payload.jobId), payload.reason))
    return true
  }

  const sourceId = sanitizeText(payload.sourceId)
  if (path === '/api/novel/chapters') {
    const chapters = await service.getChapterList(sanitizeText(payload.bookUrl), sourceId)
    sendJson(res, { success: true, chapters })
    return true
  }

  // 兼容旧同步下载接口（短章节仍可用）；长书请走 /download/start
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

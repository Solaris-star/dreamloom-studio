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

/**
 * 搜索结果相关性打分：整串精确 > 整串包含 > 分词命中 > 其他。
 * 长书名（如「两界·从玻璃珠换神功开始无敌」）按 ·：等分隔符切词，
 * 逐词命中加分，避免整串匹配不到时全部落到 0 分档。
 */
function relevanceScore(row, keyword) {
  const title = String(row?.title || '').trim()
  const author = String(row?.author || '').trim()
  const kw = String(keyword || '').trim()
  if (!kw) return 0
  if (title === kw) return 1000
  let score = 0
  if (title.includes(kw)) score += 100
  if (author === kw) score += 200
  else if (author.includes(kw)) score += 40
  const tokens = kw
    .split(/[·：:，,。.！!？?\s、()（）\-—]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
  for (const token of tokens) {
    if (title.includes(token)) score += 10
    if (author.includes(token)) score += 5
  }
  return score
}

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
    // 书源池模式：全部书源并发聚合搜索，前端不再提供书源选择
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
              sourceId: row.sourceId || source.id,
              sourceName: row.sourceName || source.name
            })
          }
        } catch (error) {
          sourceErrors.push(`${source.name}: ${error?.message || '搜索失败'}`)
        }
      })
    )
    // 按 title+author 去重：同书多源时保留第一章节数最多的候选（内容最全）
    const groups = new Map()
    for (const row of list) {
      const key = `${String(row.title || '').trim()}::${String(row.author || '').trim()}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
    const deduped = [...groups.values()].map((candidates) => ({
      ...candidates[0],
      sourceCandidates: candidates.length
    }))
    // 对头部候选并发探测章节数（字数规模代理），失败不影响主流程
    const PROBE_LIMIT = 12
    const PROBE_TIMEOUT_MS = 12_000
    const probeTargets = deduped.slice(0, PROBE_LIMIT)
    await Promise.allSettled(
      probeTargets.map(async (row) => {
        const chapters = await Promise.race([
          service.getChapterList(row.url, row.sourceId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS)
          )
        ])
        row.chapterCount = Array.isArray(chapters) ? chapters.length : 0
      })
    )
    for (const row of deduped) {
      if (!Number.isFinite(row.chapterCount)) row.chapterCount = 0
    }
    // 排序：相关性优先，相关性同档按章节数（字数规模）降序
    deduped.sort((a, b) => {
      const scoreGap = relevanceScore(b, keyword) - relevanceScore(a, keyword)
      if (scoreGap !== 0) return scoreGap
      return (b.chapterCount || 0) - (a.chapterCount || 0)
    })
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

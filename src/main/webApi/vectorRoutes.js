import vectorService from '../services/vectorService.js'

const ROUTES = new Set([
  '/api/vector/search',
  '/api/vector/stats',
  '/api/vector/delete-source'
])

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

export function isVectorRoute(path) {
  return ROUTES.has(path)
}

export async function handleVectorRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  sanitizeText,
  resolveBookPath,
  service = vectorService
}) {
  if (!isVectorRoute(path)) return false

  const payload = body || {}
  const bookPath = resolveBookPath(payload, booksDir, { ensure: true })
  let result
  if (path === '/api/vector/search') {
    const query = sanitizeText(payload.query || payload.queryText)
    if (!query) throw badRequest('搜索内容不能为空')
    if (
      !payload.embeddingConfig ||
      typeof payload.embeddingConfig !== 'object' ||
      Array.isArray(payload.embeddingConfig)
    ) {
      throw badRequest('缺少 Embedding 配置')
    }
    result = {
      success: true,
      items: await service.search(bookPath, query, payload.embeddingConfig, {
        limit: Number(payload.limit) || 5,
        filter: payload.filter
      })
    }
  } else if (path === '/api/vector/stats') {
    result = { success: true, ...(await service.getStats(bookPath)) }
  } else {
    const sourceExtractionId = sanitizeText(payload.sourceExtractionId)
    if (!sourceExtractionId) throw badRequest('缺少来源 ID')
    result = {
      success: true,
      ...(await service.deleteBySource(bookPath, sourceExtractionId))
    }
  }

  sendJson(res, result)
  return true
}

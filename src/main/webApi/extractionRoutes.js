const ROUTES = new Set([
  '/api/extraction/dimensions',
  '/api/extraction/create',
  '/api/extraction/progress',
  '/api/extraction/list',
  '/api/extraction/get',
  '/api/extraction/result-page',
  '/api/extraction/delete',
  '/api/extraction/search'
])

export function isExtractionRoute(path) {
  return ROUTES.has(path)
}

export async function handleExtractionRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  sanitizeText,
  store,
  dimensions,
  dimensionLabels,
  tasks,
  service,
  resolveBookPath
}) {
  if (!isExtractionRoute(path)) return false
  const payload = body || {}

  if (path === '/api/extraction/dimensions') {
    sendJson(
      res,
      dimensions.map((key) => ({
        key,
        label: dimensionLabels[key] || key
      }))
    )
    return true
  }

  if (path === '/api/extraction/progress') {
    sendJson(res, tasks.progress(payload.jobId))
    return true
  }

  const bookPath = resolveBookPath(payload, booksDir, {
    ensure: path !== '/api/extraction/create'
  })

  if (path === '/api/extraction/create') {
    const result = tasks.create(store, { ...payload, bookPath })
    sendJson(res, result, result.success ? 202 : 409)
  } else if (path === '/api/extraction/list') {
    sendJson(res, service.listExtractions(bookPath))
  } else if (path === '/api/extraction/get') {
    sendJson(res, service.getExtraction(bookPath, payload.extractionId || payload.id, payload))
  } else if (path === '/api/extraction/result-page') {
    sendJson(
      res,
      service.getExtractionResultPage(bookPath, payload.extractionId || payload.id, payload)
    )
  } else if (path === '/api/extraction/delete') {
    sendJson(res, await service.deleteExtraction(bookPath, payload.extractionId || payload.id))
  } else {
    const query = sanitizeText(payload.query || payload.keyword)
    if (!query) {
      throw Object.assign(new Error('搜索内容不能为空'), { statusCode: 400 })
    }
    const items = await service.searchKnowledge(
      bookPath,
      {
        query,
        dimensions: payload.dimensions,
        topK: payload.topK
      },
      payload.embeddingConfig || null
    )
    sendJson(res, { success: true, items })
  }

  return true
}

const ROUTES = new Set([
  '/api/ai/history',
  '/api/ai/text-task',
  '/api/ai-proxy',
  '/api/editor-agent/progress-server',
  '/api/ai/book-ideas',
  '/api/ai/generate-chapter-from-outline'
])

export function isAiTextRoute(path) {
  return ROUTES.has(path)
}

export async function handleAiTextRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  store,
  readHistory,
  runTextTask,
  requestProxy,
  getProgressServerInfo,
  createProvider,
  generateBookIdeas,
  generateChapter,
  resolveBookPath
}) {
  if (!isAiTextRoute(path)) return false
  const payload = body || {}

  if (path === '/api/ai/history') {
    const rows = readHistory('读取 AI 历史')
    const feature = typeof payload.feature === 'string' ? payload.feature.trim() : ''
    sendJson(res, {
      success: true,
      items: rows.filter((row) => !feature || row.feature === feature)
    })
    return true
  }

  if (path === '/api/ai/text-task') {
    const result = await runTextTask(store, payload)
    sendJson(res, result, result?.success === true ? 200 : 502)
    return true
  }

  if (path === '/api/ai-proxy') {
    const result = await requestProxy(payload)
    sendJson(res, result, result?.success === true ? 200 : 502)
    return true
  }

  if (path === '/api/editor-agent/progress-server') {
    const result = getProgressServerInfo()
    sendJson(res, result, result?.success === false ? 503 : 200)
    return true
  }

  const provider = createProvider(store, payload)
  if (path === '/api/ai/book-ideas') {
    const result = await generateBookIdeas(payload, provider.service)
    sendJson(res, result, result?.success === false ? 502 : 200)
    return true
  }

  const bookPath = resolveBookPath(payload, booksDir, { ensure: true })
  const result = await generateChapter({ ...payload, bookPath }, provider.service)
  sendJson(res, {
    success: true,
    content: result.content,
    targetWords: Number(payload.targetWords) || 2000
  })
  return true
}

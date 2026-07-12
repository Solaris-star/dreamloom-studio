const ROUTES = new Set([
  '/api/knowledge/ai-task',
  '/api/knowledge/create-topic-from-ai'
])

export function isKnowledgeAiRoute(path) {
  return ROUTES.has(path)
}

export async function handleKnowledgeAiRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  sanitizeText,
  store,
  createProvider,
  aiService,
  knowledge
}) {
  if (!isKnowledgeAiRoute(path)) return false
  const payload = body || {}

  if (path === '/api/knowledge/ai-task') {
    const provider = createProvider(store, payload)
    sendJson(res, await aiService.runTask(payload, provider.service))
    return true
  }

  const sourceItem =
    payload.sourceItem && typeof payload.sourceItem === 'object' && !Array.isArray(payload.sourceItem)
      ? payload.sourceItem
      : {}
  const aiResult =
    payload.aiResult && typeof payload.aiResult === 'object' && !Array.isArray(payload.aiResult)
      ? payload.aiResult
      : {}
  sendJson(
    res,
    knowledge.createTopicCardFromAiResult(
      booksDir,
      sourceItem,
      aiResult,
      sanitizeText(payload.rawOutput)
    )
  )
  return true
}

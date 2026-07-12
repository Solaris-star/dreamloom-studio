import knowledgeBaseService from '../services/knowledgeBaseService.js'

const ROUTES = new Set([
  '/api/knowledge/list',
  '/api/knowledge/get',
  '/api/knowledge/create',
  '/api/knowledge/update',
  '/api/knowledge/delete',
  '/api/knowledge/search',
  '/api/knowledge/favorite',
  '/api/knowledge/archive',
  '/api/knowledge/link',
  '/api/knowledge/convert-topic-to-book'
])

export function isKnowledgeRoute(path) {
  return ROUTES.has(path)
}

export function handleKnowledgeRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  knowledge = knowledgeBaseService
}) {
  if (!isKnowledgeRoute(path)) return false

  const payload = body || {}
  let result
  let statusCode
  if (path === '/api/knowledge/list') {
    result = { success: true, items: knowledge.listKnowledgeItems(booksDir, payload) }
  } else if (path === '/api/knowledge/get') {
    const item = knowledge.getKnowledgeItem(booksDir, payload.id)
    result = item ? { success: true, item } : { success: false, message: '素材不存在' }
    statusCode = item ? 200 : 404
  } else if (path === '/api/knowledge/create') {
    result = knowledge.createKnowledgeItem(booksDir, payload)
  } else if (path === '/api/knowledge/update') {
    result = knowledge.updateKnowledgeItem(booksDir, payload.id, payload.patch || {})
  } else if (path === '/api/knowledge/delete') {
    result = knowledge.deleteKnowledgeItem(booksDir, payload.id)
  } else if (path === '/api/knowledge/search') {
    result = {
      success: true,
      items: knowledge.searchKnowledgeItems(booksDir, payload.keyword, payload.filter || {})
    }
  } else if (path === '/api/knowledge/favorite') {
    result = knowledge.favoriteKnowledgeItem(booksDir, payload.id, payload.favorite)
  } else if (path === '/api/knowledge/archive') {
    result = knowledge.archiveKnowledgeItem(booksDir, payload.id)
  } else if (path === '/api/knowledge/link') {
    result = knowledge.linkKnowledgeItems(booksDir, payload.sourceId, payload.targetIds || [])
  } else {
    result = knowledge.convertTopicCardToBook(booksDir, payload.topicCardId)
  }

  sendJson(res, result, statusCode)
  return true
}

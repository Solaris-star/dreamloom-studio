import marketService from '../services/marketService.js'

const LIST_ROUTES = new Map([
  ['/api/market/hotspots', 'listHotspots'],
  ['/api/market/activities', 'listActivities'],
  ['/api/market/hot-topics', 'listHotTopics'],
  ['/api/market/opportunities', 'listMarketOpportunities']
])

const DIRECT_ROUTES = new Map([
  ['/api/market/hotspots/create', 'createHotspot'],
  ['/api/market/activities/create', 'createActivity'],
  ['/api/market/refresh', 'refreshMarketTrends'],
  ['/api/market/keyword-combination', 'getMarketKeywordCombination'],
  ['/api/market/save-inspiration', 'saveInsightToKnowledge'],
  ['/api/market/generate-outline', 'generateOutlineFromInsight'],
  ['/api/market/apply-to-current-book', 'applyInsightToBook'],
  ['/api/market/create-book-from-insight', 'createBookFromInsight']
])

const SUMMARY_ROUTES = new Map([
  ['/api/market/dashboard', 'getMarketDashboard'],
  ['/api/market/overview', 'getMarketOverview'],
  ['/api/market/hot-rank', 'getMarketHotRank'],
  ['/api/market/keyword-cloud', 'getMarketKeywordCloud'],
  ['/api/market/activities-board', 'getMarketActivities']
])

const MARKET_ROUTES = new Set([
  ...LIST_ROUTES.keys(),
  ...DIRECT_ROUTES.keys(),
  ...SUMMARY_ROUTES.keys(),
  '/api/market/hotspots/update',
  '/api/market/hotspots/save-to-knowledge',
  '/api/market/hotspots/create-topic-card',
  '/api/market/activities/update',
  '/api/market/activities/save-to-knowledge',
  '/api/market/activities/create-topic-card',
  '/api/market/trends',
  '/api/market/source-status'
])

export function isMarketRoute(path) {
  return MARKET_ROUTES.has(path)
}

export async function handleMarketRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  service = marketService
}) {
  if (!isMarketRoute(path)) return false

  const payload = body || {}
  let result
  if (LIST_ROUTES.has(path)) {
    result = { success: true, items: await service[LIST_ROUTES.get(path)](booksDir, payload) }
  } else if (DIRECT_ROUTES.has(path)) {
    result = await service[DIRECT_ROUTES.get(path)](booksDir, payload)
  } else if (SUMMARY_ROUTES.has(path)) {
    result = {
      success: true,
      ...(await service[SUMMARY_ROUTES.get(path)](booksDir, payload))
    }
  } else if (path === '/api/market/hotspots/update') {
    result = await service.updateHotspot(booksDir, payload.id, payload.patch || {})
  } else if (path === '/api/market/hotspots/save-to-knowledge') {
    result = await service.saveHotspotToKnowledge(booksDir, payload.id)
  } else if (path === '/api/market/hotspots/create-topic-card') {
    result = await service.createTopicCardFromHotspot(booksDir, payload.id)
  } else if (path === '/api/market/activities/update') {
    result = await service.updateActivity(booksDir, payload.id, payload.patch || {})
  } else if (path === '/api/market/activities/save-to-knowledge') {
    result = await service.saveActivityToKnowledge(booksDir, payload.id)
  } else if (path === '/api/market/activities/create-topic-card') {
    result = await service.createTopicCardFromActivity(booksDir, payload.id)
  } else if (path === '/api/market/trends') {
    result = payload.keyword
      ? { success: true, data: await service.getTrendRecord(booksDir, payload.keyword) }
      : { success: true, items: await service.listTrendRecords(booksDir, payload) }
  } else {
    result = { success: true, items: await service.listSourceStatus(booksDir) }
  }

  sendJson(res, result)
  return true
}

import { postJson } from './webHttpClient.js'

const marketApi = {
  listMarketHotspots: (filter) => postJson('/api/market/hotspots', filter),
  createMarketHotspot: (input) => postJson('/api/market/hotspots/create', input),
  updateMarketHotspot: (id, patch) => postJson('/api/market/hotspots/update', { id, patch }),
  saveMarketHotspotToKnowledge: (id) =>
    postJson('/api/market/hotspots/save-to-knowledge', { id }),
  createTopicCardFromMarketHotspot: (id) =>
    postJson('/api/market/hotspots/create-topic-card', { id }),
  listMarketActivities: (filter) => postJson('/api/market/activities', filter),
  createMarketActivity: (input) => postJson('/api/market/activities/create', input),
  updateMarketActivity: (id, patch) => postJson('/api/market/activities/update', { id, patch }),
  saveMarketActivityToKnowledge: (id) =>
    postJson('/api/market/activities/save-to-knowledge', { id }),
  createTopicCardFromMarketActivity: (id) =>
    postJson('/api/market/activities/create-topic-card', { id }),
  refreshMarketTrends: (payload) =>
    postJson('/api/market/refresh', payload, { timeoutMs: 120_000 }),
  listMarketHotTopics: (filter) => postJson('/api/market/hot-topics', filter),
  getMarketTrend: (keyword) => postJson('/api/market/trends', { keyword }),
  listMarketTrends: (filter) => postJson('/api/market/trends', filter),
  listMarketSourceStatus: () => postJson('/api/market/source-status', {}),
  listMarketOpportunities: (payload) => postJson('/api/market/opportunities', payload),
  getMarketDashboard: (payload) => postJson('/api/market/dashboard', payload),
  getMarketOverview: (payload) => postJson('/api/market/overview', payload),
  getMarketHotRank: (payload) => postJson('/api/market/hot-rank', payload),
  getMarketKeywordCloud: (payload) => postJson('/api/market/keyword-cloud', payload),
  getMarketKeywordCombination: (payload) =>
    postJson('/api/market/keyword-combination', payload),
  getMarketActivitiesBoard: (payload) => postJson('/api/market/activities-board', payload),
  saveMarketInspiration: (payload) => postJson('/api/market/save-inspiration', payload),
  generateMarketOutline: (payload) => postJson('/api/market/generate-outline', payload),
  applyMarketInsightToCurrentBook: (payload) =>
    postJson('/api/market/apply-to-current-book', payload),
  createBookFromMarketInsight: (payload) =>
    postJson('/api/market/create-book-from-insight', payload)
}

function getMarketApi(name) {
  const api = marketApi[name]
  if (typeof api !== 'function') throw new Error(`市场灵感接口不存在：${name}`)
  return api
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function requireMarketSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireArrayField(result, fieldName, fallback) {
  if (!Array.isArray(result?.[fieldName])) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
}

function requireObjectField(result, fieldName, fallback) {
  if (!isObject(result?.[fieldName])) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
}

function requireItemResult(result, fallback = '操作失败') {
  const ok = requireMarketSuccess(result, fallback)
  if (!isObject(ok.item)) {
    throw new Error(`${fallback}：接口没有返回条目`)
  }
  return ok
}

function requireListResult(result, fallback = '读取失败') {
  const ok = requireMarketSuccess(result, fallback)
  requireArrayField(ok, 'items', fallback)
  return ok
}

function requireKnowledgeResult(result, fallback = '保存失败') {
  const ok = requireMarketSuccess(result, fallback)
  if (!isObject(ok.item) && !isObject(ok.knowledgeItem) && ok.duplicate !== true) {
    throw new Error(`${fallback}：接口没有返回素材条目`)
  }
  return ok
}

function requireTopicCardResult(result, fallback = '保存选题卡失败') {
  const ok = requireMarketSuccess(result, fallback)
  if (!isObject(ok.item) && !isObject(ok.topicCard) && ok.duplicate !== true) {
    throw new Error(`${fallback}：接口没有返回选题卡`)
  }
  return ok
}

function requireRefreshResult(result) {
  const ok = requireMarketSuccess(result, '真实采集失败，请检查来源状态')
  if (
    !Array.isArray(ok.results) ||
    !ok.results.some((item) => item?.success === true) ||
    !isObject(ok.hotspotSync)
  ) {
    throw new Error('真实采集失败：接口没有返回采集结果')
  }
  return ok
}

function requireTrendRecordResult(result) {
  const ok = requireMarketSuccess(result, '趋势读取失败')
  requireObjectField(ok, 'data', '趋势读取失败')
  return ok
}

function requireDashboardResult(result) {
  const ok = requireMarketSuccess(result, '市场概览读取失败')
  requireArrayField(ok, 'sourceStatus', '市场概览读取失败')
  requireArrayField(ok, 'topOpportunities', '市场概览读取失败')
  requireArrayField(ok, 'recentTrends', '市场概览读取失败')
  return ok
}

function requireOverviewResult(result) {
  const ok = requireMarketSuccess(result, '市场方向读取失败')
  requireArrayField(ok, 'writableDirections', '市场方向读取失败')
  requireArrayField(ok, 'genreDistribution', '市场方向读取失败')
  requireArrayField(ok, 'inspirationExpress', '市场方向读取失败')
  requireObjectField(ok, 'opportunityIndex', '市场方向读取失败')
  return ok
}

function requireHotRankResult(result) {
  const ok = requireMarketSuccess(result, '热榜读取失败')
  requireArrayField(ok, 'sources', '热榜读取失败')
  requireArrayField(ok, 'items', '热榜读取失败')
  return ok
}

function requireKeywordCloudResult(result) {
  const ok = requireMarketSuccess(result, '关键词读取失败')
  requireArrayField(ok, 'keywordClusters', '关键词读取失败')
  requireArrayField(ok, 'popularCombinations', '关键词读取失败')
  return ok
}

function requireKeywordCombinationResult(result) {
  const ok = requireMarketSuccess(result, '组合生成失败')
  requireObjectField(ok, 'detail', '组合生成失败')
  return ok
}

function requireActivitiesBoardResult(result) {
  const ok = requireMarketSuccess(result, '活动读取失败')
  requireArrayField(ok, 'activities', '活动读取失败')
  return ok
}

function requireOutlineResult(result) {
  const ok = requireMarketSuccess(result, '生成失败')
  requireObjectField(ok, 'outline', '生成失败')
  if (ok.item !== undefined && !isObject(ok.item)) {
    throw new Error('生成失败：接口返回格式不正确')
  }
  return ok
}

function requireBookResult(result) {
  const ok = requireMarketSuccess(result, '新建作品失败')
  if (
    typeof ok.bookName !== 'string' ||
    !ok.bookName.trim() ||
    typeof ok.bookId !== 'string' ||
    !ok.bookId.trim()
  ) {
    throw new Error('新建作品失败：接口没有返回作品信息')
  }
  return ok
}

export async function listMarketHotspots(filter = {}) {
  return requireListResult(await getMarketApi('listMarketHotspots')(filter), '热点读取失败')
}

export async function createMarketHotspot(input = {}) {
  return requireItemResult(await getMarketApi('createMarketHotspot')(input), '创建热点失败')
}

export async function updateMarketHotspot(id, patch = {}) {
  return requireItemResult(
    await getMarketApi('updateMarketHotspot')(id, patch),
    '更新热点失败'
  )
}

export async function saveMarketHotspotToKnowledge(id) {
  return requireKnowledgeResult(
    await getMarketApi('saveMarketHotspotToKnowledge')(id),
    '保存失败'
  )
}

export async function createTopicCardFromMarketHotspot(id) {
  return requireTopicCardResult(await getMarketApi('createTopicCardFromMarketHotspot')(id))
}

export async function listMarketActivities(filter = {}) {
  return requireListResult(await getMarketApi('listMarketActivities')(filter), '活动读取失败')
}

export async function createMarketActivity(input = {}) {
  return requireItemResult(await getMarketApi('createMarketActivity')(input), '创建活动失败')
}

export async function updateMarketActivity(id, patch = {}) {
  return requireItemResult(
    await getMarketApi('updateMarketActivity')(id, patch),
    '更新活动失败'
  )
}

export async function saveMarketActivityToKnowledge(id) {
  return requireKnowledgeResult(
    await getMarketApi('saveMarketActivityToKnowledge')(id),
    '保存失败'
  )
}

export async function createTopicCardFromMarketActivity(id) {
  return requireTopicCardResult(await getMarketApi('createTopicCardFromMarketActivity')(id))
}

export async function refreshMarketTrends(payload = {}) {
  return requireRefreshResult(await getMarketApi('refreshMarketTrends')(payload))
}

export async function listMarketHotTopics(filter = {}) {
  return requireListResult(await getMarketApi('listMarketHotTopics')(filter), '热词读取失败')
}

export async function getMarketTrend(keyword) {
  return requireTrendRecordResult(await getMarketApi('getMarketTrend')(keyword))
}

export async function listMarketTrends(filter = {}) {
  return requireListResult(await getMarketApi('listMarketTrends')(filter), '趋势读取失败')
}

export async function listMarketSourceStatus() {
  return requireListResult(await getMarketApi('listMarketSourceStatus')(), '来源状态读取失败')
}

export async function listMarketOpportunities(payload = {}) {
  return requireListResult(
    await getMarketApi('listMarketOpportunities')(payload),
    '机会建议读取失败'
  )
}

export async function getMarketDashboard(payload = {}) {
  return requireDashboardResult(await getMarketApi('getMarketDashboard')(payload))
}

export async function getMarketOverview(payload = {}) {
  return requireOverviewResult(await getMarketApi('getMarketOverview')(payload))
}

export async function getMarketHotRank(payload = {}) {
  return requireHotRankResult(await getMarketApi('getMarketHotRank')(payload))
}

export async function getMarketKeywordCloud(payload = {}) {
  return requireKeywordCloudResult(await getMarketApi('getMarketKeywordCloud')(payload))
}

export async function getMarketKeywordCombination(payload = {}) {
  return requireKeywordCombinationResult(
    await getMarketApi('getMarketKeywordCombination')(payload)
  )
}

export async function getMarketActivitiesBoard(payload = {}) {
  return requireActivitiesBoardResult(await getMarketApi('getMarketActivitiesBoard')(payload))
}

export async function saveMarketInspiration(payload = {}) {
  return requireKnowledgeResult(
    await getMarketApi('saveMarketInspiration')(payload),
    '保存失败'
  )
}

export async function generateMarketOutline(payload = {}) {
  return requireOutlineResult(await getMarketApi('generateMarketOutline')(payload))
}

export async function applyMarketInsightToCurrentBook(payload = {}) {
  return requireKnowledgeResult(
    await getMarketApi('applyMarketInsightToCurrentBook')(payload),
    '带入失败'
  )
}

export async function createBookFromMarketInsight(payload = {}) {
  return requireBookResult(await getMarketApi('createBookFromMarketInsight')(payload))
}

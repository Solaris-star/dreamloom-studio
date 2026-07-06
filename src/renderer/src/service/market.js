function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持市场灵感接口：${name}`)
  }
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
  if (!Array.isArray(ok.results) || !ok.results.some((item) => item?.success === true) || !isObject(ok.hotspotSync)) {
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
  if (typeof ok.bookName !== 'string' || !ok.bookName.trim() || typeof ok.bookId !== 'string' || !ok.bookId.trim()) {
    throw new Error('新建作品失败：接口没有返回作品信息')
  }
  return ok
}

export async function listMarketHotspots(filter = {}) {
  return requireListResult(await ensureElectronApi('listMarketHotspots')(filter), '热点读取失败')
}

export async function createMarketHotspot(input = {}) {
  return requireItemResult(await ensureElectronApi('createMarketHotspot')(input), '创建热点失败')
}

export async function updateMarketHotspot(id, patch = {}) {
  return requireItemResult(await ensureElectronApi('updateMarketHotspot')(id, patch), '更新热点失败')
}

export async function saveMarketHotspotToKnowledge(id) {
  return requireKnowledgeResult(await ensureElectronApi('saveMarketHotspotToKnowledge')(id), '保存失败')
}

export async function createTopicCardFromMarketHotspot(id) {
  return requireTopicCardResult(await ensureElectronApi('createTopicCardFromMarketHotspot')(id))
}

export async function listMarketActivities(filter = {}) {
  return requireListResult(await ensureElectronApi('listMarketActivities')(filter), '活动读取失败')
}

export async function createMarketActivity(input = {}) {
  return requireItemResult(await ensureElectronApi('createMarketActivity')(input), '创建活动失败')
}

export async function updateMarketActivity(id, patch = {}) {
  return requireItemResult(await ensureElectronApi('updateMarketActivity')(id, patch), '更新活动失败')
}

export async function saveMarketActivityToKnowledge(id) {
  return requireKnowledgeResult(await ensureElectronApi('saveMarketActivityToKnowledge')(id), '保存失败')
}

export async function createTopicCardFromMarketActivity(id) {
  return requireTopicCardResult(await ensureElectronApi('createTopicCardFromMarketActivity')(id))
}

export async function refreshMarketTrends(payload = {}) {
  return requireRefreshResult(await ensureElectronApi('refreshMarketTrends')(payload))
}

export async function listMarketHotTopics(filter = {}) {
  return requireListResult(await ensureElectronApi('listMarketHotTopics')(filter), '热词读取失败')
}

export async function getMarketTrend(keyword) {
  return requireTrendRecordResult(await ensureElectronApi('getMarketTrend')(keyword))
}

export async function listMarketTrends(filter = {}) {
  return requireListResult(await ensureElectronApi('listMarketTrends')(filter), '趋势读取失败')
}

export async function listMarketSourceStatus() {
  return requireListResult(await ensureElectronApi('listMarketSourceStatus')(), '来源状态读取失败')
}

export async function listMarketOpportunities(payload = {}) {
  return requireListResult(await ensureElectronApi('listMarketOpportunities')(payload), '机会建议读取失败')
}

export async function getMarketDashboard(payload = {}) {
  return requireDashboardResult(await ensureElectronApi('getMarketDashboard')(payload))
}

export async function getMarketOverview(payload = {}) {
  return requireOverviewResult(await ensureElectronApi('getMarketOverview')(payload))
}

export async function getMarketHotRank(payload = {}) {
  return requireHotRankResult(await ensureElectronApi('getMarketHotRank')(payload))
}

export async function getMarketKeywordCloud(payload = {}) {
  return requireKeywordCloudResult(await ensureElectronApi('getMarketKeywordCloud')(payload))
}

export async function getMarketKeywordCombination(payload = {}) {
  return requireKeywordCombinationResult(await ensureElectronApi('getMarketKeywordCombination')(payload))
}

export async function getMarketActivitiesBoard(payload = {}) {
  return requireActivitiesBoardResult(await ensureElectronApi('getMarketActivitiesBoard')(payload))
}

export async function saveMarketInspiration(payload = {}) {
  return requireKnowledgeResult(await ensureElectronApi('saveMarketInspiration')(payload), '保存失败')
}

export async function generateMarketOutline(payload = {}) {
  return requireOutlineResult(await ensureElectronApi('generateMarketOutline')(payload))
}

export async function applyMarketInsightToCurrentBook(payload = {}) {
  return requireKnowledgeResult(await ensureElectronApi('applyMarketInsightToCurrentBook')(payload), '带入失败')
}

export async function createBookFromMarketInsight(payload = {}) {
  return requireBookResult(await ensureElectronApi('createBookFromMarketInsight')(payload))
}

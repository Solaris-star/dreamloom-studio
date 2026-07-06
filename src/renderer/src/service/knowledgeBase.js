function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持知识库接口：${name}`)
  }
  return api
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

export function requireKnowledgeSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireKnowledgeItemShape(item, fallback) {
  if (!isObject(item) || !isNonEmptyString(item.id)) {
    throw new Error(`${fallback}：接口没有返回有效素材`)
  }
  return item
}

export function requireKnowledgeListResult(result, fallback = '加载创作库失败') {
  const ok = requireKnowledgeSuccess(result, fallback)
  if (!Array.isArray(ok.items)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  ok.items.forEach((item) => requireKnowledgeItemShape(item, fallback))
  return ok
}

export function requireKnowledgeItemResult(result, fallback = '保存失败') {
  const ok = requireKnowledgeSuccess(result, fallback)
  requireKnowledgeItemShape(ok.item, fallback)
  return ok
}

export function requireKnowledgeDeleteResult(result, expectedId = '') {
  const ok = requireKnowledgeSuccess(result, '删除失败')
  if (!isNonEmptyString(ok.deletedId)) {
    throw new Error('删除失败：接口没有返回删除 ID')
  }
  if (expectedId && ok.deletedId !== expectedId) {
    throw new Error('删除失败：接口返回的素材不匹配')
  }
  return ok
}

export function requireTopicCardBookResult(result) {
  const ok = requireKnowledgeSuccess(result, '转书失败')
  requireKnowledgeItemShape(ok.item, '转书失败')
  if (!isObject(ok.book) || !isNonEmptyString(ok.book.name)) {
    throw new Error('转书失败：接口没有返回作品')
  }
  return ok
}

export function requireKnowledgeAiTaskResult(result, fallback = 'AI 生成失败') {
  const ok = requireKnowledgeSuccess(result, fallback)
  const raw = String(ok.raw || ok.content || '').trim()
  if (!raw) {
    throw new Error(`${fallback}：接口没有返回生成内容`)
  }
  if (!isObject(ok.parsed)) {
    throw new Error(`${fallback}：接口没有返回可编辑 JSON`)
  }
  return { ...ok, raw }
}

export async function listKnowledgeItems(filter = {}) {
  return requireKnowledgeListResult(
    await ensureElectronApi('listKnowledgeItems')(filter),
    '加载创作库失败'
  )
}

export async function getKnowledgeItem(id) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('getKnowledgeItem')(id),
    '读取素材失败'
  )
}

export async function runKnowledgeAiTask(payload) {
  return requireKnowledgeAiTaskResult(await ensureElectronApi('runKnowledgeAiTask')(payload))
}

export async function createKnowledgeItem(input) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('createKnowledgeItem')(input),
    '保存失败'
  )
}

export async function updateKnowledgeItem(id, patch) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('updateKnowledgeItem')(id, patch),
    '保存失败'
  )
}

export async function deleteKnowledgeItem(id) {
  return requireKnowledgeDeleteResult(await ensureElectronApi('deleteKnowledgeItem')(id), id)
}

export async function searchKnowledgeItems(keyword, filter = {}) {
  return requireKnowledgeListResult(
    await ensureElectronApi('searchKnowledgeItems')(keyword, filter),
    '搜索素材失败'
  )
}

export async function favoriteKnowledgeItem(id, favorite) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('favoriteKnowledgeItem')(id, favorite),
    '更新收藏失败'
  )
}

export async function archiveKnowledgeItem(id) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('archiveKnowledgeItem')(id),
    '归档失败'
  )
}

export async function linkKnowledgeItems(sourceId, targetIds) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('linkKnowledgeItems')(sourceId, targetIds),
    '关联素材失败'
  )
}

export async function convertTopicCardToBook(topicCardId) {
  return requireTopicCardBookResult(await ensureElectronApi('convertTopicCardToBook')(topicCardId))
}

export async function createTopicCardFromAi(payload) {
  return requireKnowledgeItemResult(
    await ensureElectronApi('createTopicCardFromAi')(payload),
    '保存选题卡失败'
  )
}

export function buildMarketHotspotItem(hotspot = {}) {
  const keyword = hotspot.keyword || hotspot.title || ''
  return {
    type: 'market_hotspot',
    title: keyword || '未命名热点',
    summary: hotspot.summary || '',
    tags: hotspot.tags || hotspot.relatedKeywords || [],
    genreTags: hotspot.categories || [],
    platformTags: hotspot.platforms || [],
    sourceType: 'market',
    sourceName: hotspot.sourceName || '',
    sourceUrl: hotspot.sourceUrl || hotspot.url || '',
    sourceIds: hotspot.id ? [hotspot.id] : [],
    favorite: true,
    status: 'active',
    metadata: {
      marketHotspot: {
        keyword,
        heatScore: hotspot.heatScore,
        growthScore: hotspot.growthScore,
        competitionScore: hotspot.competitionScore,
        opportunityScore: hotspot.opportunityScore,
        platforms: hotspot.platforms || [],
        categories: hotspot.categories || [],
        relatedKeywords: hotspot.relatedKeywords || [],
        sampleTitles: hotspot.sampleTitles || [],
        sampleIntros: hotspot.sampleIntros || [],
        capturedAt: hotspot.capturedAt || new Date().toISOString()
      }
    }
  }
}

export function buildWriterActivityItem(activity = {}) {
  return {
    type: 'writer_activity',
    title: activity.title || '未命名活动',
    summary: activity.summary || '',
    tags: activity.tags || [],
    genreTags: activity.categories || [],
    platformTags: activity.platform ? [activity.platform] : [],
    sourceType: 'writer_activity',
    sourceName: activity.platform || '',
    sourceUrl: activity.url || activity.sourceUrl || '',
    sourceIds: activity.id ? [activity.id] : [],
    favorite: true,
    status: 'active',
    metadata: {
      writerActivity: {
        platform: activity.platform || '',
        activityType: activity.activityType || 'other',
        categories: activity.categories || [],
        targetAudience: activity.targetAudience || [],
        rewardSummary: activity.rewardSummary || '',
        requirementSummary: activity.requirementSummary || '',
        startDate: activity.startDate || '',
        endDate: activity.endDate || '',
        status: activity.status || 'unknown',
        reminderEnabled: Boolean(activity.reminderEnabled),
        reminderTime: activity.reminderTime || ''
      }
    }
  }
}

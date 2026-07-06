import { join } from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import knowledgeBaseService, { calculateWriterActivityStatus } from './knowledgeBaseService.js'
import marketTrendService from './marketTrendService.js'
import { nowIso, writeJson } from './webJsonRepository.js'

const MARKET_DIR = 'market'
const HOTSPOTS_FILE = 'hotspots.json'
const ACTIVITIES_FILE = 'activities.json'
const WRITING_PLANS_FILE = 'writing-plans.json'

const TREND_SOURCE_LABELS = {
  weibo: '微博热搜',
  baidu: '百度热搜',
  aggregated: '全网热榜',
  ikun: '聚合热搜',
  twitter: 'Twitter/X 趋势',
  google_trend: 'Google Trends'
}

const TREND_SOURCE_PLATFORMS = {
  weibo: '微博',
  baidu: '百度',
  aggregated: '全网',
  ikun: '聚合',
  twitter: 'X',
  google_trend: 'Google'
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item != null) : []
}

function asStringArray(value) {
  return asArray(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback
}

function normalizeChannel(value = 'all') {
  return ['all', 'male', 'female'].includes(value) ? value : 'all'
}

function typeFromGenre(genre = '') {
  const text = String(genre || '')
  if (/玄幻|仙侠|修真/.test(text)) return { type: 'xuanhua', typeName: '玄幻' }
  if (/都市|现实|情感|娱乐|商业/.test(text)) return { type: 'dushi', typeName: '都市' }
  if (/科幻|末世|科技/.test(text)) return { type: 'kehuan', typeName: '科幻' }
  if (/悬疑|推理|灵异/.test(text)) return { type: 'xuanyi', typeName: '悬疑' }
  if (/古言|宫斗|历史|权谋/.test(text)) return { type: 'lishi', typeName: '历史' }
  return { type: 'xuanhua', typeName: genre || '玄幻' }
}

function asInsight(value = {}) {
  return {
    id: String(value.id || '').trim(),
    title: String(value.title || value.originalTitle || '未命名灵感').trim(),
    originalTitle: String(value.originalTitle || '').trim(),
    source: String(value.source || value.rawPayload?.platform || '市场灵感').trim(),
    sourceType: String(value.sourceType || value.rawPayload?.sourceType || 'hot_search').trim(),
    channel: normalizeChannel(value.channel || 'all'),
    genre: String(value.genre || '').trim(),
    tags: asStringArray(value.tags),
    heatScore: asNumber(value.heatScore, 60),
    growthScore: asNumber(value.growthScore, 50),
    opportunityScore: asNumber(value.opportunityScore, 60),
    summary: String(value.summary || '').trim(),
    readerEmotion: asStringArray(value.readerEmotion),
    storyPotential: String(value.storyPotential || '').trim(),
    conflict: String(value.conflict || '').trim(),
    hook: String(value.hook || '').trim(),
    bookTitleIdeas: asStringArray(value.bookTitleIdeas),
    loglineIdeas: asStringArray(value.loglineIdeas),
    openingIdeas: asStringArray(value.openingIdeas),
    rawIds: asStringArray(value.rawIds),
    rawPayload: value.rawPayload && typeof value.rawPayload === 'object' ? value.rawPayload : {}
  }
}

function findInsight(booksDir, id, channel = 'all') {
  const dashboard = marketTrendService.getMarketDashboard(booksDir, { channel, limit: 120 })
  const pools = [
    ...(dashboard.insights || []),
    ...(dashboard.overview?.writableDirections || []),
    ...(dashboard.hotRank?.items || [])
  ]
  return pools.find((item) => item.id === id) || pools[0] || null
}

function insightToKnowledgeItem(insightInput) {
  const insight = asInsight(insightInput)
  return {
    type: 'topic_card',
    title: insight.title,
    summary: insight.loglineIdeas[0] || insight.summary || insight.hook,
    content: [
      `来源：${insight.source}`,
      `原始信号：${insight.originalTitle}`,
      `核心冲突：${insight.conflict}`,
      `开篇钩子：${insight.hook}`
    ].filter(Boolean).join('\n'),
    tags: insight.tags,
    genreTags: [insight.genre, ...insight.tags].filter(Boolean),
    platformTags: [insight.source].filter(Boolean),
    sourceType: 'market',
    sourceName: insight.source || '市场灵感',
    sourceUrl: insight.rawPayload?.url || '',
    sourceIds: insight.rawIds,
    favorite: true,
    status: 'draft',
    metadata: {
      marketInsight: insight,
      topicCard: {
        oneLineHook: insight.loglineIdeas[0] || insight.hook,
        protagonist: insight.channel === 'male' ? '背负压力但掌握关键能力的男主' : insight.channel === 'female' ? '被轻视但清醒果断的女主' : '被卷入事件的普通人',
        goldenFinger: /系统|科技|芯片|创业/.test(insight.tags.join(' ') + insight.genre) ? '未来信息或系统提示' : '',
        worldSetting: insight.genre,
        coreConflict: insight.conflict,
        openingHook: insight.hook,
        sellingPoints: [insight.storyPotential, ...insight.readerEmotion].filter(Boolean).slice(0, 5),
        riskNotes: ['保留抽象情绪和结构，不复述真实新闻人物。'],
        platformSuggestions: [insight.source].filter(Boolean),
        monetizationPath: insight.channel === 'female' ? 'short_drama' : 'subscription',
        targetLength: insight.channel === 'male' ? 'long' : 'medium',
        marketHeatScore: insight.heatScore,
        originalityScore: Math.max(55, 100 - insight.riskPenalty || 72),
        commercialPotentialScore: insight.opportunityScore,
        writingDifficultyScore: Math.max(35, 100 - insight.opportunityScore),
        generatedFrom: {
          type: 'market_hotspot',
          ids: insight.rawIds
        }
      }
    }
  }
}

function buildOutlineDraft(insightInput) {
  const insight = asInsight(insightInput)
  const titles = insight.bookTitleIdeas.length ? insight.bookTitleIdeas : [insight.title]
  const mainCharacter = insight.channel === 'male' ? '男主：背负债务或误解，拥有快速学习与破局能力。' : insight.channel === 'female' ? '女主：被关系和资源压迫，但有清晰目标和反击手段。' : '主角：被公共事件卷入，从旁观者变成破局者。'
  return {
    generator: 'template',
    generatorLabel: '规则模板',
    titles,
    channel: insight.channel,
    genre: insight.genre,
    tags: insight.tags,
    logline: insight.loglineIdeas[0] || insight.summary || insight.hook,
    coreSellingPoint: insight.storyPotential || insight.conflict,
    protagonist: mainCharacter,
    supportingCharacters: [
      '对手：掌握资源，推动主角进入强冲突。',
      '盟友：一开始立场模糊，后续成为关键帮助。',
      '观察者：代表读者视角，见证主角翻盘。'
    ],
    worldview: `以“${insight.genre || '现实'}”为主要背景，保留公开热点中的情绪，不使用真实人物和具体事件。`,
    mainConflict: insight.conflict,
    antagonist: '来自家庭、资本、组织或舆论的复合阻力。',
    emotionalHook: insight.readerEmotion.join('、') || '反击、反转、共情',
    volumes: [
      {
        title: '第一卷：危机入局',
        summary: '主角在开篇危机中失去原有位置，同时得到翻盘线索。',
        chapters: Array.from({ length: 4 }).map((_, index) => ({
          title: `第 ${index + 1} 章`,
          summary: index === 0 ? insight.hook : '围绕危机扩大、盟友登场和对手施压推进。',
          hook: index === 3 ? '主角发现真正的幕后规则。' : '留下下一章反转。'
        }))
      },
      {
        title: '第二卷：反击成形',
        summary: '主角利用新能力或新资源建立优势，并开始公开反击。',
        chapters: Array.from({ length: 3 }).map((_, index) => ({
          title: `第 ${index + 5} 章`,
          summary: '主角在一次次试探中拿到关键证据或资源。',
          hook: index === 2 ? '对手提前出手，主角被迫亮出底牌。' : '新冲突继续升级。'
        }))
      },
      {
        title: '第三卷：翻盘验证',
        summary: '主角完成第一次大反转，证明这个题材可以继续扩写。',
        chapters: Array.from({ length: 3 }).map((_, index) => ({
          title: `第 ${index + 8} 章`,
          summary: '主角将个人冲突转成更大的关系或行业冲突。',
          hook: index === 2 ? '更大的对手浮出水面。' : '反击继续扩大。'
        }))
      }
    ],
    openingDirection: insight.openingIdeas[0] || insight.hook,
    createdAt: nowIso()
  }
}

function getMarketPath(booksDir, fileName) {
  if (!booksDir) throw new Error('请先设置书籍目录')
  return join(booksDir, MARKET_DIR, fileName)
}

function readRows(booksDir, fileName) {
  const filePath = getMarketPath(booksDir, fileName)
  if (!fs.existsSync(filePath)) return []
  let data
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '{"items":[]}')
  } catch (error) {
    throw new Error(`市场数据读取失败：${fileName}：${error.message}`)
  }
  if (Array.isArray(data)) return data.filter((item) => item != null)
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
    return data.items.filter((item) => item != null)
  }
  throw new Error(`市场数据格式异常：${fileName}，已停止读取`)
}

function writeRows(booksDir, fileName, items) {
  if (!Array.isArray(items)) {
    throw new Error(`市场数据格式异常：${fileName}，已停止写入以免覆盖原始记录`)
  }
  writeJson(getMarketPath(booksDir, fileName), {
    version: 1,
    updatedAt: nowIso(),
    items
  })
}

function includesText(row, keyword) {
  const text = [
    row.title,
    row.keyword,
    row.summary,
    row.platform,
    row.sourceName,
    ...asStringArray(row.platforms),
    ...asStringArray(row.categories),
    ...asStringArray(row.relatedKeywords),
    ...asStringArray(row.tags)
  ]
    .join(' ')
    .toLowerCase()
  return text.includes(String(keyword || '').trim().toLowerCase())
}

function matchesFilter(row, filter = {}) {
  if (filter.keyword && !includesText(row, filter.keyword)) return false
  if (filter.platform && !asStringArray(row.platforms || [row.platform]).includes(filter.platform)) return false
  if (filter.category && !asStringArray(row.categories).includes(filter.category)) return false
  if (filter.status && row.status !== filter.status) return false
  return true
}

function sortRows(rows, sortBy = 'updatedAt') {
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (sortBy === 'heat') return Number(b.heatScore || 0) - Number(a.heatScore || 0)
    if (sortBy === 'opportunity') return Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0)
    if (sortBy === 'endDate') return new Date(a.endDate || 0) - new Date(b.endDate || 0)
    if (sortBy === 'createdAt') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  })
  return sorted
}

function normalizeHotspot(raw = {}) {
  const createdAt = raw.createdAt || nowIso()
  const updatedAt = raw.updatedAt || createdAt
  const keyword = String(raw.keyword || raw.title || '').trim()
  return {
    id: String(raw.id || `market_hotspot_${randomUUID()}`),
    keyword,
    title: String(raw.title || keyword || '未命名热点').trim(),
    summary: String(raw.summary || '').trim(),
    sourceName: String(raw.sourceName || '').trim(),
    sourceUrl: String(raw.sourceUrl || raw.url || '').trim(),
    platforms: asStringArray(raw.platforms),
    categories: asStringArray(raw.categories),
    relatedKeywords: asStringArray(raw.relatedKeywords),
    sourceTitles: asStringArray(raw.sourceTitles),
    sourceIntros: asStringArray(raw.sourceIntros),
    tags: asStringArray(raw.tags),
    heatScore: asNumber(raw.heatScore),
    growthScore: asNumber(raw.growthScore),
    competitionScore: asNumber(raw.competitionScore),
    opportunityScore: asNumber(raw.opportunityScore),
    capturedAt: raw.capturedAt || createdAt,
    trendTopicId: String(raw.trendTopicId || '').trim(),
    trendSource: String(raw.trendSource || '').trim(),
    extra: raw.extra && typeof raw.extra === 'object' ? raw.extra : {},
    knowledgeItemId: raw.knowledgeItemId || '',
    topicCardId: raw.topicCardId || '',
    createdAt,
    updatedAt
  }
}

function normalizeActivity(raw = {}) {
  const createdAt = raw.createdAt || nowIso()
  const updatedAt = raw.updatedAt || createdAt
  const activity = {
    id: String(raw.id || `market_activity_${randomUUID()}`),
    title: String(raw.title || '未命名活动').trim(),
    platform: String(raw.platform || '').trim(),
    activityType: String(raw.activityType || 'other').trim(),
    summary: String(raw.summary || '').trim(),
    rewardSummary: String(raw.rewardSummary || '').trim(),
    requirementSummary: String(raw.requirementSummary || '').trim(),
    sourceUrl: String(raw.sourceUrl || raw.url || '').trim(),
    categories: asStringArray(raw.categories),
    targetAudience: asStringArray(raw.targetAudience),
    tags: asStringArray(raw.tags),
    startDate: raw.startDate || '',
    endDate: raw.endDate || '',
    reminderEnabled: Boolean(raw.reminderEnabled),
    reminderTime: raw.reminderTime || '',
    knowledgeItemId: raw.knowledgeItemId || '',
    topicCardId: raw.topicCardId || '',
    createdAt,
    updatedAt
  }
  return {
    ...activity,
    status: calculateWriterActivityStatus(activity)
  }
}

function mergeRows(rows, updated) {
  return rows.map((row) => (row.id === updated.id ? updated : row))
}

function normalizeTrendKeyword(value) {
  return String(value || '').trim().toLowerCase()
}

function inferTrendCategory(keyword) {
  const text = String(keyword || '')
  if (/小说|网文|短篇|连载|男频|女频|玄幻|都市|言情|悬疑|科幻|重生|穿越/.test(text)) return '小说'
  if (/电影|电视剧|综艺|演员|明星|票房|院线|影视/.test(text)) return '影视'
  if (/游戏|电竞|二游|手游|主机/.test(text)) return '游戏'
  if (/AI|机器人|芯片|科技|手机|互联网/.test(text)) return '科技'
  if (/高考|考研|就业|职场|教育/.test(text)) return '现实'
  return ''
}

function trendTopicToHotspot(topic = {}) {
  const keyword = String(topic.keyword || topic.title || '').trim()
  const sourceName = TREND_SOURCE_LABELS[topic.source] || topic.extra?.sourceLabel || topic.source || '公开热榜'
  const platform = topic.extra?.platform || TREND_SOURCE_PLATFORMS[topic.source] || sourceName
  const category = topic.extra?.category || inferTrendCategory(keyword)
  const heatScore = asNumber(topic.normalizedHeat || topic.heatIndex || 60, 60)
  const rank = Number(topic.extra?.rank || 0)
  return {
    keyword,
    title: topic.title || keyword,
    summary: `${sourceName}采集到的公开热词。热度指数：${topic.heatIndex || heatScore}。`,
    sourceName,
    sourceUrl: topic.url || '',
    platforms: [platform].filter(Boolean),
    categories: [category].filter(Boolean),
    relatedKeywords: [keyword].filter(Boolean),
    sourceTitles: [],
    sourceIntros: [],
    tags: ['自动采集', sourceName].filter(Boolean),
    heatScore,
    growthScore: Math.max(35, Math.min(100, heatScore + (rank > 0 && rank <= 10 ? 8 : 0))),
    competitionScore: Math.max(20, Math.min(85, Math.round(heatScore * 0.72))),
    opportunityScore: Math.max(30, Math.min(100, Math.round(heatScore * 0.75 + 12))),
    capturedAt: topic.capturedAt || nowIso(),
    trendTopicId: topic.id || '',
    trendSource: topic.source || '',
    extra: topic.extra || {}
  }
}

export function upsertHotspotsFromTrends(booksDir, topics = []) {
  const rows = readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot)
  const nextRows = [...rows]
  const now = nowIso()
  let inserted = 0
  let updated = 0

  for (const topic of topics) {
    const input = trendTopicToHotspot(topic)
    if (!input.keyword) continue
    const trendKey = normalizeTrendKeyword(`${input.trendSource}:${input.keyword}`)
    const index = nextRows.findIndex((row) => {
      const rowTrendKey = normalizeTrendKeyword(`${row.trendSource || ''}:${row.keyword}`)
      const sameTrendTopic = input.trendTopicId && row.trendTopicId === input.trendTopicId
      const sameSourceKeyword = rowTrendKey === trendKey
      const sameSourceNameKeyword =
        normalizeTrendKeyword(row.sourceName) === normalizeTrendKeyword(input.sourceName) &&
        normalizeTrendKeyword(row.keyword) === normalizeTrendKeyword(input.keyword)
      return sameTrendTopic || sameSourceKeyword || sameSourceNameKeyword
    })
    if (index >= 0) {
      nextRows[index] = normalizeHotspot({
        ...nextRows[index],
        ...input,
        id: nextRows[index].id,
        knowledgeItemId: nextRows[index].knowledgeItemId,
        topicCardId: nextRows[index].topicCardId,
        createdAt: nextRows[index].createdAt,
        updatedAt: now
      })
      updated += 1
    } else {
      nextRows.unshift(normalizeHotspot({ ...input, createdAt: now, updatedAt: now }))
      inserted += 1
    }
  }

  writeRows(booksDir, HOTSPOTS_FILE, sortRows(nextRows, 'updatedAt').slice(0, 500))
  return { success: true, inserted, updated, items: nextRows }
}

function hotspotToKnowledgeItem(hotspot) {
  return {
    type: 'market_hotspot',
    title: hotspot.title || hotspot.keyword || '未命名热点',
    summary: hotspot.summary,
    tags: hotspot.tags.length ? hotspot.tags : hotspot.relatedKeywords,
    genreTags: hotspot.categories,
    platformTags: hotspot.platforms,
    sourceType: 'market',
    sourceName: hotspot.sourceName || '市场灵感',
    sourceUrl: hotspot.sourceUrl,
    sourceIds: [hotspot.id],
    favorite: true,
    status: 'active',
    metadata: {
      marketHotspot: {
        keyword: hotspot.keyword,
        heatScore: hotspot.heatScore,
        growthScore: hotspot.growthScore,
        competitionScore: hotspot.competitionScore,
        opportunityScore: hotspot.opportunityScore,
        platforms: hotspot.platforms,
        categories: hotspot.categories,
        relatedKeywords: hotspot.relatedKeywords,
        sourceTitles: hotspot.sourceTitles,
        sourceIntros: hotspot.sourceIntros,
        capturedAt: hotspot.capturedAt
      }
    }
  }
}

function activityToKnowledgeItem(activity) {
  return {
    type: 'writer_activity',
    title: activity.title || '未命名活动',
    summary: activity.summary,
    tags: activity.tags,
    genreTags: activity.categories,
    platformTags: activity.platform ? [activity.platform] : [],
    sourceType: 'writer_activity',
    sourceName: activity.platform || '市场灵感',
    sourceUrl: activity.sourceUrl,
    sourceIds: [activity.id],
    favorite: true,
    status: 'active',
    metadata: {
      writerActivity: {
        platform: activity.platform,
        activityType: activity.activityType,
        categories: activity.categories,
        targetAudience: activity.targetAudience,
        rewardSummary: activity.rewardSummary,
        requirementSummary: activity.requirementSummary,
        startDate: activity.startDate,
        endDate: activity.endDate,
        status: activity.status,
        reminderEnabled: activity.reminderEnabled,
        reminderTime: activity.reminderTime
      }
    }
  }
}

function hotspotToTopicCard(hotspot) {
  const title = `${hotspot.keyword || hotspot.title || '市场热点'}选题`
  return {
    type: 'topic_card',
    title,
    summary: hotspot.summary || `${hotspot.keyword || hotspot.title} 可以作为新书方向。`,
    tags: hotspot.relatedKeywords,
    genreTags: hotspot.categories,
    platformTags: hotspot.platforms,
    sourceType: 'market',
    sourceName: hotspot.sourceName || '市场灵感',
    sourceUrl: hotspot.sourceUrl,
    sourceIds: [`topic_from_${hotspot.id}`],
    relatedKnowledgeIds: hotspot.knowledgeItemId ? [hotspot.knowledgeItemId] : [],
    favorite: true,
    status: 'draft',
    metadata: {
      topicCard: {
        oneLineHook: hotspot.summary || `${hotspot.keyword || hotspot.title} 方向的新故事。`,
        protagonist: '',
        goldenFinger: '',
        worldSetting: '',
        coreConflict: '',
        openingHook: '',
        sellingPoints: hotspot.relatedKeywords,
        riskNotes: hotspot.competitionScore >= 70 ? ['同类作品较多，需要强化人物和开篇差异。'] : [],
        platformSuggestions: hotspot.platforms,
        monetizationPath: 'unknown',
        targetLength: 'unknown',
        marketHeatScore: hotspot.heatScore,
        originalityScore: Math.max(0, 100 - hotspot.competitionScore),
        commercialPotentialScore: hotspot.opportunityScore,
        writingDifficultyScore: Math.max(20, hotspot.competitionScore),
        generatedFrom: {
          type: 'market_hotspot',
          ids: [hotspot.id]
        }
      }
    }
  }
}

function activityToTopicCard(activity) {
  const title = `${activity.title || '作家活动'}选题`
  return {
    type: 'topic_card',
    title,
    summary: activity.summary || activity.requirementSummary,
    tags: activity.tags,
    genreTags: activity.categories,
    platformTags: activity.platform ? [activity.platform] : [],
    sourceType: 'writer_activity',
    sourceName: activity.platform || '市场灵感',
    sourceUrl: activity.sourceUrl,
    sourceIds: [`topic_from_${activity.id}`],
    relatedActivityIds: activity.knowledgeItemId ? [activity.knowledgeItemId] : [],
    favorite: true,
    status: 'draft',
    metadata: {
      topicCard: {
        oneLineHook: activity.summary || activity.requirementSummary || `${activity.title} 对应的原创选题。`,
        protagonist: '',
        goldenFinger: '',
        worldSetting: '',
        coreConflict: activity.requirementSummary || '',
        openingHook: '',
        sellingPoints: [activity.rewardSummary, activity.requirementSummary].filter(Boolean),
        riskNotes: activity.status === 'ending_soon' ? ['活动快截止了，适合短篇或已有存稿改造。'] : [],
        platformSuggestions: activity.platform ? [activity.platform] : [],
        monetizationPath: 'unknown',
        targetLength: 'unknown',
        marketHeatScore: activity.status === 'active' || activity.status === 'ending_soon' ? 70 : 45,
        originalityScore: 60,
        commercialPotentialScore: activity.rewardSummary ? 72 : 55,
        writingDifficultyScore: activity.status === 'ending_soon' ? 72 : 55,
        generatedFrom: {
          type: 'writer_activity',
          ids: [activity.id]
        }
      }
    }
  }
}

export function listHotspots(booksDir, filter = {}) {
  return sortRows(
    readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot).filter((row) => matchesFilter(row, filter)),
    filter.sortBy
  )
}

export function createHotspot(booksDir, input = {}) {
  const rows = readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot)
  const item = normalizeHotspot(input)
  writeRows(booksDir, HOTSPOTS_FILE, [item, ...rows])
  return { success: true, item }
}

export function updateHotspot(booksDir, id, patch = {}) {
  const rows = readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot)
  const existing = rows.find((row) => row.id === id)
  if (!existing) return { success: false, message: '热点不存在' }
  const item = normalizeHotspot({
    ...existing,
    ...patch,
    id,
    createdAt: existing.createdAt,
    updatedAt: nowIso()
  })
  writeRows(booksDir, HOTSPOTS_FILE, mergeRows(rows, item))
  return { success: true, item }
}

export function saveHotspotToKnowledge(booksDir, id) {
  const rows = readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot)
  const hotspot = rows.find((row) => row.id === id)
  if (!hotspot) return { success: false, message: '热点不存在' }
  const result = knowledgeBaseService.createKnowledgeItem(booksDir, hotspotToKnowledgeItem(hotspot))
  const item = normalizeHotspot({
    ...hotspot,
    knowledgeItemId: result.item?.id || hotspot.knowledgeItemId,
    updatedAt: nowIso()
  })
  writeRows(booksDir, HOTSPOTS_FILE, mergeRows(rows, item))
  return { success: true, item, knowledgeItem: result.item, duplicate: result.duplicate }
}

export function createTopicCardFromHotspot(booksDir, id) {
  const rows = readRows(booksDir, HOTSPOTS_FILE).map(normalizeHotspot)
  const hotspot = rows.find((row) => row.id === id)
  if (!hotspot) return { success: false, message: '热点不存在' }
  const result = knowledgeBaseService.createKnowledgeItem(booksDir, hotspotToTopicCard(hotspot))
  const item = normalizeHotspot({
    ...hotspot,
    topicCardId: result.item?.id || hotspot.topicCardId,
    updatedAt: nowIso()
  })
  writeRows(booksDir, HOTSPOTS_FILE, mergeRows(rows, item))
  return { success: true, item, topicCard: result.item, duplicate: result.duplicate }
}

export function listActivities(booksDir, filter = {}) {
  return sortRows(
    readRows(booksDir, ACTIVITIES_FILE).map(normalizeActivity).filter((row) => matchesFilter(row, filter)),
    filter.sortBy
  )
}

export function createActivity(booksDir, input = {}) {
  const rows = readRows(booksDir, ACTIVITIES_FILE).map(normalizeActivity)
  const item = normalizeActivity(input)
  writeRows(booksDir, ACTIVITIES_FILE, [item, ...rows])
  return { success: true, item }
}

export function updateActivity(booksDir, id, patch = {}) {
  const rows = readRows(booksDir, ACTIVITIES_FILE).map(normalizeActivity)
  const existing = rows.find((row) => row.id === id)
  if (!existing) return { success: false, message: '活动不存在' }
  const item = normalizeActivity({
    ...existing,
    ...patch,
    id,
    createdAt: existing.createdAt,
    updatedAt: nowIso()
  })
  writeRows(booksDir, ACTIVITIES_FILE, mergeRows(rows, item))
  return { success: true, item }
}

export function saveActivityToKnowledge(booksDir, id) {
  const rows = readRows(booksDir, ACTIVITIES_FILE).map(normalizeActivity)
  const activity = rows.find((row) => row.id === id)
  if (!activity) return { success: false, message: '活动不存在' }
  const result = knowledgeBaseService.createKnowledgeItem(booksDir, activityToKnowledgeItem(activity))
  const item = normalizeActivity({
    ...activity,
    knowledgeItemId: result.item?.id || activity.knowledgeItemId,
    updatedAt: nowIso()
  })
  writeRows(booksDir, ACTIVITIES_FILE, mergeRows(rows, item))
  return { success: true, item, knowledgeItem: result.item, duplicate: result.duplicate }
}

export function createTopicCardFromActivity(booksDir, id) {
  const rows = readRows(booksDir, ACTIVITIES_FILE).map(normalizeActivity)
  const activity = rows.find((row) => row.id === id)
  if (!activity) return { success: false, message: '活动不存在' }
  const result = knowledgeBaseService.createKnowledgeItem(booksDir, activityToTopicCard(activity))
  const item = normalizeActivity({
    ...activity,
    topicCardId: result.item?.id || activity.topicCardId,
    updatedAt: nowIso()
  })
  writeRows(booksDir, ACTIVITIES_FILE, mergeRows(rows, item))
  return { success: true, item, topicCard: result.item, duplicate: result.duplicate }
}

export async function refreshMarketTrends(booksDir, options = {}) {
  const result = await marketTrendService.refreshHotTopics(booksDir, options)
  const syncResult = upsertHotspotsFromTrends(booksDir, result.topics || [])
  return {
    ...result,
    hotspotSync: {
      inserted: syncResult.inserted,
      updated: syncResult.updated
    }
  }
}

export function listHotTopics(booksDir, filter = {}) {
  return marketTrendService.listHotTopics(booksDir, filter)
}

export function getTrendRecord(booksDir, keyword) {
  return marketTrendService.getTrendRecord(booksDir, keyword)
}

export function listTrendRecords(booksDir, filter = {}) {
  return marketTrendService.listTrendRecords(booksDir, filter)
}

export function listSourceStatus(booksDir) {
  return marketTrendService.listSourceStatus(booksDir)
}

export function pruneMarketSourceCache(booksDir, options = {}) {
  return marketTrendService.pruneSourceCache(booksDir, options)
}

export function getMarketDashboard(booksDir, filter = {}) {
  return marketTrendService.getMarketDashboard(booksDir, filter)
}

export function getMarketOverview(booksDir, filter = {}) {
  return marketTrendService.buildMarketOverview(booksDir, filter)
}

export function getMarketHotRank(booksDir, filter = {}) {
  return marketTrendService.buildHotRank(booksDir, filter)
}

export function getMarketKeywordCloud(booksDir, filter = {}) {
  return marketTrendService.buildKeywordCloud(booksDir, filter)
}

export function getMarketKeywordCombination(booksDir, input = {}) {
  return {
    success: true,
    detail: marketTrendService.combinationDetailFromKeywords(
      booksDir,
      asStringArray(input.keywords),
      input.channel || 'all'
    )
  }
}

export function getMarketActivities(booksDir, filter = {}) {
  return marketTrendService.buildActivities(booksDir, filter)
}

export function saveInsightToKnowledge(booksDir, input = {}) {
  const insight = input.insight || findInsight(booksDir, input.insightId, input.channel || 'all')
  if (!insight) return { success: false, message: '灵感不存在' }
  return knowledgeBaseService.createKnowledgeItem(booksDir, insightToKnowledgeItem(insight))
}

export function generateOutlineFromInsight(booksDir, input = {}) {
  const insight = input.insight || findInsight(booksDir, input.insightId, input.channel || 'all')
  if (!insight) return { success: false, message: '灵感不存在' }
  const outline = buildOutlineDraft(insight)
  if (input.mode === 'save_only') {
    const rows = readRows(booksDir, WRITING_PLANS_FILE)
    const item = {
      id: `writing_plan_${randomUUID()}`,
      insightId: input.insightId || insight.id,
      title: outline.titles[0] || insight.title,
      outline,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    writeRows(booksDir, WRITING_PLANS_FILE, [item, ...rows].slice(0, 100))
    return { success: true, outline, item }
  }
  return { success: true, outline }
}

export function applyInsightToBook(booksDir, input = {}) {
  const insight = input.insight || findInsight(booksDir, input.insightId, input.channel || 'all')
  const bookName = String(input.bookId || input.bookName || '').trim()
  if (!insight) return { success: false, message: '灵感不存在' }
  if (!bookName) return { success: false, message: '请选择作品' }
  const sectionName = {
    book_setting: '作品设定',
    characters: '人物设定',
    worldview: '世界观',
    conflict: '剧情冲突',
    chapter_ideas: '章节灵感'
  }[input.targetSection] || '章节灵感'
  const result = knowledgeBaseService.createKnowledgeItem(booksDir, {
    type: input.targetSection === 'characters' ? 'character_setting' : input.targetSection === 'worldview' || input.targetSection === 'book_setting' ? 'world_setting' : 'plot_fragment',
    title: `${insight.title}（${sectionName}）`,
    summary: insight.hook,
    content: [
      `该灵感来自市场灵感 / 来源：${insight.source} / 生成时间：${nowIso()}`,
      `题材：${insight.genre}`,
      `核心冲突：${insight.conflict}`,
      `开篇方向：${insight.hook}`
    ].join('\n'),
    tags: insight.tags,
    genreTags: [insight.genre].filter(Boolean),
    platformTags: [insight.source].filter(Boolean),
    sourceType: 'market',
    sourceName: insight.source || '市场灵感',
    relatedBookIds: [bookName],
    favorite: true,
    status: 'active',
    metadata: {
      marketInsight: insight,
      targetSection: input.targetSection || 'chapter_ideas'
    }
  })
  return { ...result, bookName }
}

export function createBookFromInsight(booksDir, input = {}) {
  const insight = input.insight || findInsight(booksDir, input.insightId, input.channel || 'all')
  if (!insight) return { success: false, message: '灵感不存在' }
  const title = String(input.selectedTitle || insight.bookTitleIdeas?.[0] || insight.title || '市场灵感新书').trim()
  const safeName = title.replace(/[\\/:*?"<>|]/g, '_')
  const bookName = uniqueMarketBookName(booksDir, safeName)
  const bookPath = join(booksDir, bookName)
  const typeInfo = typeFromGenre(insight.genre)
  const outline = buildOutlineDraft({ ...insight, title: bookName })
  writeMarketBookFiles(bookPath, {
    id: String(Date.now()) + Math.floor(Math.random() * 10000).toString(),
    name: bookName,
    type: typeInfo.type,
    typeName: typeInfo.typeName,
    targetCount: insight.channel === 'male' ? 800000 : 300000,
    totalWords: 0,
    intro: insight.loglineIdeas?.[0] || insight.summary || insight.hook,
    sourceType: 'market_insight',
    marketInsightId: insight.id,
    channel: insight.channel,
    tags: insight.tags,
    password: null,
    coverColor: '#22345c',
    coverUrl: null,
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString()
  }, outline, insight)
  const saved = saveInsightToKnowledge(booksDir, { insight })
  if (saved?.item?.id) {
    knowledgeBaseService.updateKnowledgeItem(booksDir, saved.item.id, {
      status: 'converted_to_book',
      relatedBookIds: [bookName]
    })
  }
  return { success: true, bookName, bookId: bookName, outline, knowledgeItem: saved?.item || null }
}

function uniqueMarketBookName(booksDir, baseName) {
  let candidate = baseName || '市场灵感新书'
  let index = 2
  while (fs.existsSync(join(booksDir, candidate))) {
    candidate = `${baseName || '市场灵感新书'} ${index}`
    index += 1
  }
  return candidate
}

function writeMarketBookFiles(bookPath, meta, outline, insight) {
  fs.mkdirSync(join(bookPath, '正文', '正文'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '大纲'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '设定'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '人物'), { recursive: true })
  writeJson(join(bookPath, 'mazi.json'), meta)
  writeJson(join(bookPath, 'outlines.json'), outline)
  writeJson(join(bookPath, 'settings.json'), {
    worldview: outline.worldview,
    mainConflict: outline.mainConflict,
    source: {
      name: '市场灵感',
      insightId: insight.id,
      generatedAt: nowIso()
    }
  })
  writeJson(join(bookPath, 'characters.json'), [
    {
      id: randomUUID(),
      name: insight.channel === 'female' ? '女主' : '主角',
      identity: outline.protagonist,
      goal: outline.mainConflict,
      personality: insight.readerEmotion?.join('、') || ''
    }
  ])
  const firstChapter = `${outline.openingDirection}\n\n（这里是基于市场灵感生成的开篇方向草稿，请继续改写成正式正文。）`
  fs.writeFileSync(join(bookPath, '正文', '正文', '第1章.txt'), firstChapter, 'utf-8')
}

export function listMarketOpportunities(booksDir, filter = {}) {
  return marketTrendService.buildRuleOpportunities(booksDir, filter)
}

export async function generateMarketOpportunities(booksDir, options = {}) {
  return marketTrendService.generateOpportunitiesWithLLM(booksDir, options)
}

export function startMarketTrendScheduler(getBooksDir, options = {}) {
  return marketTrendService.startScheduler(getBooksDir, options)
}

export function stopMarketTrendScheduler() {
  return marketTrendService.stopScheduler()
}

export default {
  listHotspots,
  createHotspot,
  updateHotspot,
  upsertHotspotsFromTrends,
  saveHotspotToKnowledge,
  createTopicCardFromHotspot,
  listActivities,
  createActivity,
  updateActivity,
  saveActivityToKnowledge,
  createTopicCardFromActivity,
  refreshMarketTrends,
  listHotTopics,
  getTrendRecord,
  listTrendRecords,
  listSourceStatus,
  pruneMarketSourceCache,
  getMarketDashboard,
  getMarketOverview,
  getMarketHotRank,
  getMarketKeywordCloud,
  getMarketKeywordCombination,
  getMarketActivities,
  saveInsightToKnowledge,
  generateOutlineFromInsight,
  applyInsightToBook,
  createBookFromInsight,
  listMarketOpportunities,
  generateMarketOpportunities,
  startMarketTrendScheduler,
  stopMarketTrendScheduler
}

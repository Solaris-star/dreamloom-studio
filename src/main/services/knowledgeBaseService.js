import fs from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const KNOWLEDGE_DIR = 'knowledge-base'
const ITEMS_FILE = 'items.json'

export const KNOWLEDGE_ITEM_TYPES = [
  'note',
  'book_analysis',
  'market_hotspot',
  'writer_activity',
  'topic_card',
  'world_setting',
  'character_setting',
  'plot_fragment',
  'setting',
  'foreshadowing',
  'prompt_template'
]

export const KNOWLEDGE_SOURCE_TYPES = [
  'manual',
  'market',
  'writer_activity',
  'book_analysis',
  'ai_generated',
  'imported',
  'system'
]

export const KNOWLEDGE_STATUSES = [
  'draft',
  'active',
  'archived',
  'converted_to_book',
  'discarded'
]

function isSupersededExtraction(record = {}) {
  return record.lifecycleStatus === 'superseded' || record.superseded === true
}

function isFinishedExtraction(record = {}) {
  return ['completed', 'partial', 'failed'].includes(record.status)
}

function extractionKnowledgeIds(extraction = {}) {
  if (!extraction?.id) return []
  const ids = [`kb_ext_${extraction.id}`]
  let index = 0
  for (const [dimension, value] of Object.entries(extraction.results || {})) {
    const extractedItems = extractionResultItems(value)
    for (let itemIndex = 0; itemIndex < extractedItems.length; itemIndex += 1) {
      const effectiveDimension = extractedItems[itemIndex]?._dimension || dimension
      ids.push(`kb_ext_${extraction.id}_${effectiveDimension}_${index}`)
      index += 1
    }
  }
  return ids
}

function nowIso() {
  return new Date().toISOString()
}

function safeName(value, fallback = '未命名') {
  const name = String(value || fallback).trim() || fallback
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

function readJson(filePath, fallback, label = 'JSON 文件') {
  if (!fs.existsSync(filePath)) return fallback
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    return parsed == null ? fallback : parsed
  } catch (error) {
    throw new Error(`${label}读取失败：${error.message}`)
  }
}

function writeJson(filePath, data) {
  const dir = join(filePath, '..')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item != null) : []
}

function asStringArray(value) {
  return asArray(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeType(type) {
  return KNOWLEDGE_ITEM_TYPES.includes(type) ? type : 'note'
}

function normalizeSourceType(sourceType) {
  return KNOWLEDGE_SOURCE_TYPES.includes(sourceType) ? sourceType : 'manual'
}

function normalizeStatus(status) {
  return KNOWLEDGE_STATUSES.includes(status) ? status : 'active'
}

export function calculateWriterActivityStatus(activity, baseDate = new Date()) {
  const startTime = activity?.startDate ? new Date(activity.startDate).getTime() : NaN
  const endTime = activity?.endDate ? new Date(activity.endDate).getTime() : NaN
  const current = baseDate.getTime()

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 'unknown'
  if (current < startTime) return 'upcoming'
  if (current <= endTime) {
    const daysLeft = (endTime - current) / (24 * 60 * 60 * 1000)
    return daysLeft <= 7 ? 'ending_soon' : 'active'
  }
  return 'ended'
}

function normalizeMetadata(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {}
  if (metadata.topicCard) {
    metadata.topicCard = {
      oneLineHook: '',
      monetizationPath: 'unknown',
      targetLength: 'unknown',
      ...metadata.topicCard,
      sellingPoints: asStringArray(metadata.topicCard.sellingPoints),
      riskNotes: asStringArray(metadata.topicCard.riskNotes),
      platformSuggestions: asStringArray(metadata.topicCard.platformSuggestions)
    }
  }
  if (metadata.marketHotspot) {
    metadata.marketHotspot = {
      keyword: '',
      capturedAt: item?.createdAt || nowIso(),
      ...metadata.marketHotspot,
      platforms: asStringArray(metadata.marketHotspot.platforms),
      categories: asStringArray(metadata.marketHotspot.categories),
      relatedKeywords: asStringArray(metadata.marketHotspot.relatedKeywords),
      sampleTitles: asStringArray(metadata.marketHotspot.sampleTitles),
      sampleIntros: asStringArray(metadata.marketHotspot.sampleIntros)
    }
  }
  if (metadata.writerActivity) {
    metadata.writerActivity = {
      platform: '',
      activityType: 'other',
      status: 'unknown',
      ...metadata.writerActivity,
      categories: asStringArray(metadata.writerActivity.categories),
      targetAudience: asStringArray(metadata.writerActivity.targetAudience)
    }
    metadata.writerActivity.status = calculateWriterActivityStatus(metadata.writerActivity)
  }
  if (metadata.bookAnalysis) {
    metadata.bookAnalysis = {
      ...metadata.bookAnalysis,
      hooks: asStringArray(metadata.bookAnalysis.hooks),
      sellingPoints: asStringArray(metadata.bookAnalysis.sellingPoints),
      conflictPatterns: asStringArray(metadata.bookAnalysis.conflictPatterns),
      chapterPatterns: asStringArray(metadata.bookAnalysis.chapterPatterns),
      reusableTechniques: asStringArray(metadata.bookAnalysis.reusableTechniques),
      riskNotes: asStringArray(metadata.bookAnalysis.riskNotes)
    }
  }
  return metadata
}

export function normalizeKnowledgeItem(raw = {}) {
  const createdAt = raw.createdAt || nowIso()
  const updatedAt = raw.updatedAt || createdAt
  const type = normalizeType(raw.type)
  const item = {
    id: String(raw.id || `kb_${randomUUID()}`),
    type,
    title: String(raw.title || raw.name || '未命名资产').trim() || '未命名资产',
    summary: String(raw.summary || '').trim(),
    content: String(raw.content || '').trim(),
    tags: asStringArray(raw.tags),
    genreTags: asStringArray(raw.genreTags),
    platformTags: asStringArray(raw.platformTags),
    sourceType: normalizeSourceType(raw.sourceType),
    sourceName: String(raw.sourceName || '').trim(),
    sourceUrl: String(raw.sourceUrl || '').trim(),
    sourceIds: asStringArray(raw.sourceIds),
    relatedBookIds: asStringArray(raw.relatedBookIds),
    relatedChapterIds: asStringArray(raw.relatedChapterIds),
    relatedKnowledgeIds: asStringArray(raw.relatedKnowledgeIds),
    relatedActivityIds: asStringArray(raw.relatedActivityIds),
    favorite: Boolean(raw.favorite),
    status: normalizeStatus(raw.status),
    metadata: normalizeMetadata({ ...raw, type, createdAt }),
    createdAt,
    updatedAt,
    lastUsedAt: raw.lastUsedAt || ''
  }
  if (item.type === 'writer_activity' && item.metadata.writerActivity) {
    item.metadata.writerActivity.status = calculateWriterActivityStatus(item.metadata.writerActivity)
  }
  return item
}

function getKnowledgeRoot(booksDir) {
  if (!booksDir) throw new Error('请先设置书籍目录')
  return join(booksDir, KNOWLEDGE_DIR)
}

function getItemsPath(booksDir) {
  return join(getKnowledgeRoot(booksDir), ITEMS_FILE)
}

function readItems(booksDir) {
  const data = readJson(getItemsPath(booksDir), { items: [] }, '知识库条目')
  let rows
  if (Array.isArray(data)) {
    rows = data
  } else if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
    rows = data.items
  } else {
    throw new Error('知识库条目格式异常，已停止读取知识库')
  }
  return rows.map(normalizeKnowledgeItem)
}

function writeItems(booksDir, items) {
  if (!Array.isArray(items)) {
    throw new Error('知识库条目格式异常，已停止写入以免覆盖原始记录')
  }
  writeJson(getItemsPath(booksDir), {
    version: 1,
    updatedAt: nowIso(),
    items: items.map(normalizeKnowledgeItem)
  })
}

function getBookDirNames(booksDir) {
  if (!booksDir || !fs.existsSync(booksDir)) return []
  return fs
    .readdirSync(booksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(join(booksDir, entry.name, 'mazi.json')))
    .map((entry) => entry.name)
}

function summarizeExtraction(extraction) {
  const results = extraction?.results || {}
  const counts = Object.entries(results)
    .map(([key, value]) => {
      const label = value?.label || dimensionLabel(key)
      return `${label}: ${extractionResultCount(value)}`
    })
    .join('，')
  return counts ? `拆书维度已完成：${counts}` : '拆书知识已保存，可作为选题卡的参考素材。'
}

function dimensionLabel(key) {
  const map = {
    narrative: '文风叙事',
    plot: '情节设计',
    character: '人物塑造',
    novelFeatures: '小说特点',
    emotion: '读者情绪',
    humor: '热梗搞笑',
    chapterOutline: '章节大纲',
    storyAssets: '作品资料',
    characterSetting: '角色设定',
    relationship: '人物关系',
    worldbuilding: '世界观',
    goldenFinger: '金手指',
    powerSystem: '力量体系',
    timeline: '时间线',
    locationFaction: '地点势力',
    foreshadowing: '伏笔线索'
  }
  return map[key] || key || '拆书'
}

function toPlainText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join('；')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !String(key).startsWith('_'))
      .map(([key, val]) => `${key}：${toPlainText(val)}`)
      .filter((line) => line.trim())
      .join('；')
  }
  return ''
}

function extractionResultGroups(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.groups)) return value.groups
  if (Array.isArray(value?.items)) {
    return [{ groupTitle: value.label || '拆书结果', items: value.items }]
  }
  return []
}

function extractionResultItems(value) {
  if (Array.isArray(value?.items)) return value.items
  return extractionResultGroups(value).flatMap((group) =>
    asArray(group?.items).map((item) => ({
      ...item,
      _group: item?._group || group?.groupTitle || '',
      _chapterRange: item?._chapterRange || group?.chapterRange || ''
    }))
  )
}

function extractionResultCount(value) {
  if (Number.isFinite(Number(value?.count))) return Number(value.count)
  return extractionResultItems(value).length
}

function titleFromExtractedItem(item, dimension, index) {
  const candidates = [
    item?.name,
    item?.title,
    item?.point,
    item?.character,
    item?.role,
    item?.source && item?.target ? `${item.source} ↔ ${item.target}` : '',
    item?.event,
    item?.rule,
    item?.system,
    item?.ability,
    item?.kind,
    item?.location,
    item?.faction,
    item?.hook,
    item?.events,
    item?.function
  ]
  const title = candidates.map((value) => String(value || '').trim()).find(Boolean)
  if (title) return title.slice(0, 60)
  return `${dimensionLabel(dimension)} ${index + 1}`
}

function knowledgeTypeFromDimension(dimension, item = {}) {
  if (dimension === 'character' || dimension === 'characterSetting') return 'character_setting'
  if (dimension === 'novelFeatures' || dimension === 'worldbuilding' || dimension === 'goldenFinger' || dimension === 'powerSystem') return 'world_setting'
  if (dimension === 'relationship' || dimension === 'timeline' || dimension === 'locationFaction') return 'setting'
  if (dimension === 'foreshadowing') return 'foreshadowing'
  if (dimension === 'plot') {
    const text = toPlainText(item)
    if (/伏笔|线索|回收/.test(text)) return 'foreshadowing'
    return 'plot_fragment'
  }
  if (dimension === 'chapterOutline') return 'plot_fragment'
  return 'book_analysis'
}

function buildKnowledgeFromExtractionItem({ extraction, bookName, dimension, item, index }) {
  const content = item?._text || toPlainText(item)
  if (!content) return null
  const effectiveDimension = item?._dimension || dimension
  const title = titleFromExtractedItem(item, effectiveDimension, index)
  const type = knowledgeTypeFromDimension(effectiveDimension, item)
  const chapterRange = item?._chapterRange || ''
  return normalizeKnowledgeItem({
    id: `kb_ext_${extraction.id}_${effectiveDimension}_${index}`,
    type,
    title,
    summary: content.slice(0, 180),
    content,
    tags: [dimensionLabel(effectiveDimension), effectiveDimension, chapterRange].filter(Boolean),
    sourceType: 'book_analysis',
    sourceName: extraction.sourceBookName || bookName,
    sourceUrl: extraction.sourceUrl || '',
    sourceIds: [extraction.id],
    relatedBookIds: [bookName],
    favorite: false,
    status: extraction.status === 'failed' ? 'draft' : 'active',
    metadata: {
      legacyExtractionId: extraction.id,
      legacyBookName: bookName,
      extractionItemId: item?._id || '',
      dimension: effectiveDimension,
      sourceDimension: dimension,
      dimensionLabel: dimensionLabel(effectiveDimension),
      group: item?._group || '',
      chapterRange,
      usage: 'reference',
      assetStatus: 'pending_review',
      sourceKind: 'ai_extracted'
    },
    createdAt: extraction.createdAt || nowIso(),
    updatedAt: extraction.updatedAt || extraction.createdAt || nowIso()
  })
}

function migrateExtractions(booksDir, items) {
  const existingIds = new Set(items.flatMap((item) => item.sourceIds || []))
  const existingMigrated = new Set(items.map((item) => item.metadata?.legacyExtractionId).filter(Boolean))
  const existingExtractionItems = new Set(items.map((item) => item.metadata?.extractionItemId).filter(Boolean))
  const nextItems = [...items]
  let changed = false

  for (const bookName of getBookDirNames(booksDir)) {
    const bookPath = join(booksDir, bookName)
    const extractionPath = join(bookPath, 'knowledge', 'extractions.json')
    const data = readJson(extractionPath, { extractions: [] }, `${bookName} 拆书记录`)
    let records
    if (Array.isArray(data)) {
      records = data
    } else if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.extractions)) {
      records = data.extractions
    } else {
      throw new Error(`${bookName} 拆书记录格式异常，已停止迁移拆书知识`)
    }
    const supersededKnowledgeIds = new Set(records.filter(isSupersededExtraction).flatMap(extractionKnowledgeIds))

    if (supersededKnowledgeIds.size) {
      for (let i = 0; i < nextItems.length; i += 1) {
        const item = nextItems[i]
        if (!supersededKnowledgeIds.has(item.id) || item.status === 'discarded') continue
        nextItems[i] = normalizeKnowledgeItem({
          ...item,
          status: 'discarded',
          metadata: {
            ...(item.metadata || {}),
            assetStatus: 'superseded',
            supersededByExtraction: records.find((record) =>
              Array.isArray(record.replacedExtractionIds) &&
              record.replacedExtractionIds.includes(item.metadata?.legacyExtractionId)
            )?.id || ''
          },
          updatedAt: nowIso()
        })
        changed = true
      }
    }

    for (const extraction of records) {
      if (!extraction?.id) continue
      if (isSupersededExtraction(extraction)) continue
      if (!isFinishedExtraction(extraction)) continue
      const hasOverview = existingIds.has(extraction.id) || existingMigrated.has(extraction.id)
      const dimensions = Array.isArray(extraction.dimensions)
        ? asStringArray(extraction.dimensions)
        : Object.keys(extraction.dimensions || {}).filter(Boolean)
      if (!hasOverview) {
        nextItems.push(
          normalizeKnowledgeItem({
            id: `kb_ext_${extraction.id}`,
            type: 'book_analysis',
            title: `${extraction.sourceBookName || bookName} 拆书知识`,
            summary: summarizeExtraction(extraction),
            content: JSON.stringify(extraction.results || {}, null, 2),
            tags: dimensions.map(dimensionLabel),
            sourceType: 'book_analysis',
            sourceName: extraction.sourceBookName || bookName,
            sourceUrl: extraction.sourceUrl || '',
            sourceIds: [extraction.id],
            relatedBookIds: [bookName],
            favorite: false,
            status: extraction.status === 'failed' ? 'draft' : 'active',
            metadata: {
              legacyExtractionId: extraction.id,
              legacyBookName: bookName,
              usage: 'reference',
              assetStatus: extraction.status === 'failed' ? 'failed' : 'pending_review',
              stats: extraction.stats || {},
              bookAnalysis: {
                bookTitle: extraction.sourceBookName || bookName,
                sourceType: extraction.sourceType === 'online' ? 'public_metadata' : 'user_imported',
                reusableTechniques: dimensions.map((dim) => `${dimensionLabel(dim)}结果`),
                riskNotes: ['仅参考创作方法，不照搬原作人物、剧情和专有设定。']
              }
            },
            createdAt: extraction.createdAt || nowIso(),
            updatedAt: extraction.updatedAt || extraction.createdAt || nowIso()
          })
        )
        changed = true
      }

      let itemIndex = 0
      for (const [dimension, value] of Object.entries(extraction.results || {})) {
        const extractedItems = extractionResultItems(value)
        for (const item of extractedItems) {
          const itemId = item?._id || `${extraction.id}_${dimension}_${itemIndex}`
          if (existingExtractionItems.has(itemId)) {
            itemIndex += 1
            continue
          }
          const knowledgeItem = buildKnowledgeFromExtractionItem({
            extraction,
            bookName,
            dimension,
            item: { ...item, _id: itemId },
            index: itemIndex
          })
          if (knowledgeItem) {
            nextItems.push(knowledgeItem)
            existingExtractionItems.add(itemId)
            changed = true
          }
          itemIndex += 1
        }
      }
    }
  }

  if (changed) writeItems(booksDir, nextItems)
  return nextItems
}

function matchesText(item, keyword) {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return true
  const haystack = [
    item.title,
    item.summary,
    item.content,
    item.sourceName,
    ...item.tags,
    ...item.genreTags,
    ...item.platformTags
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(q)
}

function intersects(itemValues, filterValues) {
  const filters = asStringArray(filterValues)
  if (!filters.length) return true
  const values = asStringArray(itemValues)
  return filters.some((value) => values.includes(value))
}

function inDateRange(value, range) {
  if (!range?.from && !range?.to) return true
  const time = value ? new Date(value).getTime() : 0
  if (!Number.isFinite(time)) return false
  if (range.from && time < new Date(range.from).getTime()) return false
  if (range.to && time > new Date(range.to).getTime()) return false
  return true
}

function filterItems(items, filter = {}) {
  return items.filter((item) => {
    if (filter.type && item.type !== filter.type) return false
    if (filter.types?.length && !filter.types.includes(item.type)) return false
    if (filter.sourceType && item.sourceType !== filter.sourceType) return false
    if (filter.favorite !== undefined && item.favorite !== Boolean(filter.favorite)) return false
    if (filter.status && item.status !== filter.status) return false
    if (filter.relatedBookId && !item.relatedBookIds.includes(filter.relatedBookId)) return false
    if (!intersects(item.tags, filter.tags)) return false
    if (!intersects(item.genreTags, filter.genreTags)) return false
    if (!intersects(item.platformTags, filter.platformTags)) return false
    if (!inDateRange(item.createdAt, filter.createdAtRange)) return false
    if (!inDateRange(item.updatedAt, filter.updatedAtRange)) return false
    if (!matchesText(item, filter.keyword)) return false
    return true
  })
}

function scoreOf(item, key) {
  const topic = item.metadata?.topicCard || {}
  const market = item.metadata?.marketHotspot || {}
  if (key === 'heat') return Number(topic.marketHeatScore ?? market.heatScore ?? 0)
  if (key === 'commercial') return Number(topic.commercialPotentialScore ?? market.opportunityScore ?? 0)
  return 0
}

function sortItems(items, sortBy = 'updatedAt') {
  const sorted = [...items]
  sorted.sort((a, b) => {
    if (sortBy === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt)
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    if (sortBy === 'heat') return scoreOf(b, 'heat') - scoreOf(a, 'heat')
    if (sortBy === 'commercial') return scoreOf(b, 'commercial') - scoreOf(a, 'commercial')
    if (sortBy === 'lastUsedAt') return new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0)
    return new Date(b.updatedAt) - new Date(a.updatedAt)
  })
  return sorted
}

function findDuplicate(items, input) {
  const sourceIds = asStringArray(input.sourceIds)
  const sourceUrl = String(input.sourceUrl || '').trim()
  const title = String(input.title || '').trim()
  const sourceName = String(input.sourceName || '').trim()
  return items.find((item) => {
    if (sourceUrl && item.sourceUrl && item.sourceUrl === sourceUrl) return true
    if (sourceIds.length && item.sourceIds.some((id) => sourceIds.includes(id))) return true
    if (title && sourceName && item.title === title && item.sourceName === sourceName) return true
    return false
  })
}

function mergeDuplicate(existing, input) {
  const metadata = {
    ...(existing.metadata || {}),
    ...(input.metadata || {})
  }
  if (existing.metadata?.marketHotspot || input.metadata?.marketHotspot) {
    metadata.marketHotspot = {
      ...(existing.metadata?.marketHotspot || {}),
      ...(input.metadata?.marketHotspot || {})
    }
  }
  if (existing.metadata?.writerActivity || input.metadata?.writerActivity) {
    metadata.writerActivity = {
      ...(existing.metadata?.writerActivity || {}),
      ...(input.metadata?.writerActivity || {})
    }
  }
  return normalizeKnowledgeItem({
    ...existing,
    ...input,
    id: existing.id,
    title: existing.title || input.title,
    summary: input.summary || existing.summary,
    content: input.content || existing.content,
    tags: Array.from(new Set([...existing.tags, ...asStringArray(input.tags)])),
    genreTags: Array.from(new Set([...existing.genreTags, ...asStringArray(input.genreTags)])),
    platformTags: Array.from(new Set([...existing.platformTags, ...asStringArray(input.platformTags)])),
    sourceIds: Array.from(new Set([...existing.sourceIds, ...asStringArray(input.sourceIds)])),
    relatedKnowledgeIds: Array.from(
      new Set([...existing.relatedKnowledgeIds, ...asStringArray(input.relatedKnowledgeIds)])
    ),
    favorite: existing.favorite || Boolean(input.favorite),
    metadata,
    createdAt: existing.createdAt,
    updatedAt: nowIso()
  })
}

function uniqueBookName(booksDir, rawTitle) {
  const base = safeName(rawTitle, '新书').slice(0, 15) || '新书'
  if (!fs.existsSync(join(booksDir, base))) return base
  for (let i = 2; i < 1000; i += 1) {
    const suffix = String(i)
    const candidate = `${base.slice(0, Math.max(1, 15 - suffix.length))}${suffix}`
    if (!fs.existsSync(join(booksDir, candidate))) return candidate
  }
  return `新书${Date.now()}`.slice(0, 15)
}

function typeFromGenre(genreTags) {
  const first = asStringArray(genreTags)[0] || '玄幻'
  const mapping = {
    玄幻: ['xuanhua', '玄幻（通用）'],
    奇幻: ['qihuan', '奇幻（通用）'],
    武侠: ['wuxia', '武侠（通用）'],
    仙侠: ['xianxia', '仙侠（通用）'],
    都市: ['dushi', '都市（通用）'],
    现实: ['xianshi', '现实（通用）'],
    言情: ['yanqing', '言情（通用）'],
    科幻: ['kehuan', '科幻（通用）'],
    悬疑: ['xuanyi', '悬疑（通用）'],
    历史: ['lishi', '历史（通用）'],
    游戏: ['youxi', '游戏（通用）'],
    体育: ['tiyu', '体育（通用）']
  }
  const hit = Object.entries(mapping).find(([key]) => first.includes(key))
  return hit ? { type: hit[1][0], typeName: hit[1][1] } : { type: 'xuanhua', typeName: first || '玄幻' }
}

function buildSettingsFromTopic(item) {
  const topic = item.metadata?.topicCard || {}
  const items = [
    ['一句话卖点', topic.oneLineHook || item.summary],
    ['主角设定', topic.protagonist],
    ['金手指', topic.goldenFinger],
    ['世界观', topic.worldSetting],
    ['核心冲突', topic.coreConflict],
    ['开篇钩子', topic.openingHook],
    ['爽点设计', asStringArray(topic.sellingPoints).join('\n')],
    ['风险提醒', asStringArray(topic.riskNotes).join('\n')]
  ]
    .filter(([, introduction]) => String(introduction || '').trim())
    .map(([name, introduction]) => ({ id: randomUUID(), name, introduction }))

  return {
    categories: [
      {
        id: randomUUID(),
        name: '选题卡设定',
        introduction: `由知识库选题卡「${item.title}」转入。`,
        children: [],
        items
      }
    ]
  }
}

function buildOutlinesFromTopic(item) {
  const topic = item.metadata?.topicCard || {}
  const outline = item.metadata?.aiOutputs?.outline?.parsed
  if (outline?.volumeOutlines?.length) {
    return {
      content: outline.title || item.title,
      children: outline.volumeOutlines.map((volume) => ({
        id: randomUUID(),
        title: volume.title || '未命名卷',
        content: volume.summary || '',
        children: asArray(volume.chapters).map((chapter) => ({
          id: randomUUID(),
          title: chapter.title || '未命名章节',
          content: [chapter.summary, chapter.hook ? `章末钩子：${chapter.hook}` : '']
            .filter(Boolean)
            .join('\n'),
          children: []
        }))
      }))
    }
  }
  const golden = item.metadata?.aiOutputs?.goldenChapters?.parsed
  const chapters = ['chapter1', 'chapter2', 'chapter3']
    .map((key, index) => golden?.[key] && ({
      id: randomUUID(),
      title: golden[key].title || `第${index + 1}章`,
      content: [
        golden[key].summary,
        golden[key].openingHook ? `开篇钩子：${golden[key].openingHook}` : '',
        golden[key].conflict ? `核心冲突：${golden[key].conflict}` : '',
        golden[key].endingHook ? `章末钩子：${golden[key].endingHook}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      children: []
    }))
    .filter(Boolean)

  return {
    content: [topic.oneLineHook || item.summary, topic.coreConflict ? `核心冲突：${topic.coreConflict}` : '']
      .filter(Boolean)
      .join('\n\n'),
    children: chapters
  }
}

function buildCharactersFromTopic(item) {
  const generated = item.metadata?.aiOutputs?.characters?.parsed?.characters
  if (Array.isArray(generated) && generated.length) {
    return generated.map((character) => ({
      id: randomUUID(),
      name: character.name || character.role || '未命名角色',
      identity: character.identity || character.role || '',
      personality: character.personality || '',
      goal: character.goal || '',
      secret: character.secret || '',
      relationship: character.relationshipToProtagonist || '',
      growthArc: character.growthArc || ''
    }))
  }
  const protagonist = item.metadata?.topicCard?.protagonist
  return protagonist
    ? [{ id: randomUUID(), name: '主角', identity: protagonist, personality: '', goal: '', secret: '' }]
    : []
}

class KnowledgeBaseService {
  listKnowledgeItems(booksDir, filter = {}) {
    const items = migrateExtractions(booksDir, readItems(booksDir))
    return sortItems(filterItems(items, filter), filter.sortBy)
  }

  searchKnowledgeItems(booksDir, keyword, filter = {}) {
    return this.listKnowledgeItems(booksDir, { ...filter, keyword })
  }

  getKnowledgeItem(booksDir, id) {
    return this.listKnowledgeItems(booksDir).find((item) => item.id === id) || null
  }

  createKnowledgeItem(booksDir, input = {}) {
    const items = readItems(booksDir)
    const normalized = normalizeKnowledgeItem({
      ...input,
      id: input.id || `kb_${randomUUID()}`,
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso()
    })
    const duplicate = findDuplicate(items, normalized)
    if (duplicate) {
      const updated = mergeDuplicate(duplicate, normalized)
      const nextItems = items.map((item) => (item.id === duplicate.id ? updated : item))
      writeItems(booksDir, nextItems)
      return { success: true, item: updated, duplicate: true }
    }
    const nextItems = [normalized, ...items]
    writeItems(booksDir, nextItems)
    return { success: true, item: normalized, duplicate: false }
  }

  updateKnowledgeItem(booksDir, id, patch = {}) {
    const items = readItems(booksDir)
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return { success: false, message: '知识条目不存在' }
    const updated = normalizeKnowledgeItem({
      ...items[index],
      ...patch,
      id,
      createdAt: items[index].createdAt,
      updatedAt: nowIso()
    })
    items[index] = updated
    writeItems(booksDir, items)
    return { success: true, item: updated }
  }

  deleteKnowledgeItem(booksDir, id) {
    const items = readItems(booksDir)
    const nextItems = items.filter((item) => item.id !== id)
    if (nextItems.length === items.length) return { success: false, message: '知识条目不存在' }
    writeItems(booksDir, nextItems)
    return { success: true, deletedId: id }
  }

  discardExtractionKnowledgeItems(booksDir, extractionId, patch = {}) {
    if (!extractionId) return { success: false, message: '缺少拆书任务 ID' }
    const items = readItems(booksDir)
    let changed = 0
    const nextItems = items.map((item) => {
      const related =
        item.metadata?.legacyExtractionId === extractionId ||
        item.sourceIds.includes(extractionId)
      if (!related) return item
      changed += 1
      return normalizeKnowledgeItem({
        ...item,
        status: 'discarded',
        metadata: {
          ...(item.metadata || {}),
          assetStatus: 'superseded',
          discardReason: patch.reason || 'extraction_deleted',
          discardedByExtractionDelete: extractionId,
          discardedAt: nowIso()
        },
        updatedAt: nowIso()
      })
    })
    if (changed) writeItems(booksDir, nextItems)
    return { success: true, updated: changed }
  }

  favoriteKnowledgeItem(booksDir, id, favorite) {
    return this.updateKnowledgeItem(booksDir, id, { favorite: Boolean(favorite) })
  }

  archiveKnowledgeItem(booksDir, id) {
    return this.updateKnowledgeItem(booksDir, id, { status: 'archived' })
  }

  linkKnowledgeItems(booksDir, sourceId, targetIds = []) {
    const items = readItems(booksDir)
    const source = items.find((item) => item.id === sourceId)
    if (!source) return { success: false, message: '源知识条目不存在' }
    const linked = Array.from(new Set([...source.relatedKnowledgeIds, ...asStringArray(targetIds)]))
    return this.updateKnowledgeItem(booksDir, sourceId, { relatedKnowledgeIds: linked })
  }

  createTopicCardFromAiResult(booksDir, sourceItem, aiResult = {}, rawOutput = '') {
    const title = String(aiResult.title || '未命名选题卡').trim()
    const item = {
      type: 'topic_card',
      title,
      summary: aiResult.oneLineHook || '',
      content: rawOutput || '',
      tags: asStringArray(aiResult.genreTags),
      genreTags: asStringArray(aiResult.genreTags),
      platformTags: asStringArray(aiResult.platformSuggestions),
      sourceType: sourceItem?.type === 'book_analysis' ? 'book_analysis' : 'ai_generated',
      sourceName: sourceItem?.title || 'AI 生成',
      sourceUrl: sourceItem?.sourceUrl || '',
      relatedKnowledgeIds: sourceItem?.id ? [sourceItem.id] : [],
      relatedActivityIds: sourceItem?.type === 'writer_activity' ? [sourceItem.id] : [],
      favorite: true,
      status: 'draft',
      metadata: {
        topicCard: {
          oneLineHook: aiResult.oneLineHook || '',
          protagonist: aiResult.protagonist || '',
          goldenFinger: aiResult.goldenFinger || '',
          worldSetting: aiResult.worldSetting || '',
          coreConflict: aiResult.coreConflict || '',
          openingHook: aiResult.openingHook || '',
          sellingPoints: asStringArray(aiResult.sellingPoints),
          riskNotes: asStringArray(aiResult.riskNotes),
          platformSuggestions: asStringArray(aiResult.platformSuggestions),
          monetizationPath: aiResult.monetizationPath || 'unknown',
          targetLength: aiResult.targetLength || 'unknown',
          marketHeatScore: Number(aiResult.marketHeatScore || 0),
          originalityScore: Number(aiResult.originalityScore || 0),
          commercialPotentialScore: Number(aiResult.commercialPotentialScore || 0),
          writingDifficultyScore: Number(aiResult.writingDifficultyScore || 0),
          generatedFrom: sourceItem
            ? {
                type: sourceItem.type,
                ids: [sourceItem.id]
              }
            : { type: 'manual', ids: [] }
        },
        aiRawOutput: rawOutput,
        borrowedTechniques: asStringArray(aiResult.borrowedTechniques),
        differentiation: asStringArray(aiResult.differentiation)
      }
    }
    return this.createKnowledgeItem(booksDir, item)
  }

  convertTopicCardToBook(booksDir, topicCardId) {
    const items = readItems(booksDir)
    const item = items.find((entry) => entry.id === topicCardId)
    if (!item || item.type !== 'topic_card') {
      return { success: false, message: '请选择有效的选题卡' }
    }

    const bookName = uniqueBookName(booksDir, item.title)
    const bookPath = join(booksDir, bookName)
    fs.mkdirSync(bookPath, { recursive: true })
    fs.mkdirSync(join(bookPath, '正文', '正文'), { recursive: true })
    fs.mkdirSync(join(bookPath, '笔记', '大纲'), { recursive: true })
    fs.mkdirSync(join(bookPath, '笔记', '设定'), { recursive: true })
    fs.mkdirSync(join(bookPath, '笔记', '人物'), { recursive: true })
    fs.writeFileSync(join(bookPath, '正文', '正文', '第1章.txt'), '', 'utf-8')

    const topic = item.metadata?.topicCard || {}
    const typeInfo = typeFromGenre(item.genreTags)
    const meta = {
      id: String(Date.now()) + Math.floor(Math.random() * 10000).toString(),
      name: bookName,
      type: typeInfo.type,
      typeName: typeInfo.typeName,
      targetCount: topic.targetLength === 'short' ? 80000 : topic.targetLength === 'long' ? 1000000 : 300000,
      intro: topic.oneLineHook || item.summary || '',
      password: null,
      coverColor: '#22345c',
      coverUrl: null,
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString()
    }
    writeJson(join(bookPath, 'mazi.json'), meta)
    writeJson(join(bookPath, 'settings.json'), buildSettingsFromTopic(item))
    writeJson(join(bookPath, 'outlines.json'), buildOutlinesFromTopic(item))
    writeJson(join(bookPath, 'characters.json'), buildCharactersFromTopic(item))

    const relatedBookIds = Array.from(new Set([...item.relatedBookIds, bookName]))
    const update = this.updateKnowledgeItem(booksDir, topicCardId, {
      status: 'converted_to_book',
      relatedBookIds,
      lastUsedAt: nowIso(),
      metadata: {
        ...item.metadata,
        convertedBook: {
          bookName,
          bookId: meta.id,
          convertedAt: nowIso()
        }
      }
    })

    return { success: true, book: { ...meta, folderName: bookName }, item: update.item }
  }
}

export default new KnowledgeBaseService()

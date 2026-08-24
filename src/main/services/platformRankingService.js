import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { readJson, updateJson, nowIso } from './webJsonRepository.js'

const MARKET_DIR = 'market'
const CACHE_FILE = 'platform-rankings.json'
const DEFAULT_TIMEOUT_MS = 8_000
const CACHE_FRESH_MS = 30 * 60 * 1000
const CACHE_STALE_MS = 24 * 60 * 60 * 1000

export const QIDIAN_RANK_TYPES = Object.freeze([
  {
    key: 'yuepiao',
    endpoint: 'yuepiaolist',
    label: '月票榜',
    description: '读者月票支持排行',
    pageUrl: 'https://www.qidian.com/rank/yuepiao/'
  },
  {
    key: 'hotsales',
    endpoint: 'hotsaleslist',
    label: '畅销榜',
    description: '付费阅读热度排行',
    pageUrl: 'https://www.qidian.com/rank/hotsales/'
  },
  {
    key: 'readindex',
    endpoint: 'readindexlist',
    label: '阅读指数榜',
    description: '近期综合阅读指数排行',
    pageUrl: 'https://www.qidian.com/rank/readindex/'
  },
  {
    key: 'newfans',
    endpoint: 'newfanslist',
    label: '书友榜',
    description: '近期书友关注排行',
    pageUrl: 'https://www.qidian.com/rank/newfans/'
  },
  {
    key: 'recommend',
    endpoint: 'reclist',
    label: '推荐榜',
    description: '读者推荐票排行',
    pageUrl: 'https://www.qidian.com/rank/recom/'
  },
  {
    key: 'newbook',
    endpoint: 'newbooklist',
    label: '新书榜',
    description: '起点新书排行',
    pageUrl: 'https://www.qidian.com/rank/newbook/'
  },
  {
    key: 'newauthor',
    endpoint: 'newauthorlist',
    label: '新人榜',
    description: '新人作者作品排行',
    pageUrl: 'https://www.qidian.com/rank/newauthor/'
  },
  {
    key: 'update',
    endpoint: 'updatelist',
    label: '更新榜',
    description: '近期作品更新排行',
    pageUrl: 'https://www.qidian.com/rank/vipup/'
  }
])

function rankingCachePath(booksDir) {
  return join(booksDir, MARKET_DIR, CACHE_FILE)
}

function normalizeChannel(value) {
  return value === 'female' ? 'female' : 'male'
}

function channelGender(value) {
  return normalizeChannel(value) === 'female' ? 'female' : 'male'
}

function resolveRankType(value) {
  return QIDIAN_RANK_TYPES.find((item) => item.key === value) || QIDIAN_RANK_TYPES[0]
}

function createCsrfToken() {
  return randomBytes(30).toString('base64url').slice(0, 40)
}

function clampPage(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? Math.min(page, 50) : 1
}

function clampCategory(value) {
  const category = Number(value)
  return Number.isInteger(category) ? category : -1
}

function normalizeQidianRecord(row = {}, index = 0, context = {}) {
  const bid = String(row.bid || '').trim()
  const title = String(row.bName || '').trim()
  if (!bid || !title) return null
  const category = String(row.cat || '').trim()
  const subCategory = String(row.subCat || '').trim()
  const rank = Number(row.rankNum || index + 1)
  const rankType = context.rankType || resolveRankType()
  const channel = normalizeChannel(context.channel)
  const sourceLabel = `起点 · ${rankType.label}`
  const description = String(row.desc || '').trim()
  return {
    id: `qidian_${rankType.key}_${channel}_${bid}`,
    platform: 'qidian',
    source: sourceLabel,
    sourceLabel,
    sourceType: 'novel_rank',
    sourceUrl: rankType.pageUrl,
    rankType: rankType.key,
    rankLabel: rankType.label,
    rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
    rankMetric: String(row.rankCnt || '').trim(),
    rawTitle: title,
    title,
    author: String(row.bAuth || '').trim(),
    intro: description,
    summary: description,
    transferablePlot: description,
    readerPleasure: '',
    category,
    subCategory,
    genre: subCategory || category || '未分类',
    writableTypes: [category, subCategory].filter(Boolean),
    tags: [category, subCategory].filter(Boolean),
    wordCount: String(row.cnt || '').trim(),
    channel,
    channelLabel: channel === 'female' ? '女频' : '男频',
    url: `https://www.qidian.com/book/${bid}/`,
    bookId: bid,
    heatScore: null,
    growthScore: null,
    opportunityScore: null,
    contentKind: 'live',
    contentKindLabel: '起点实时榜单',
    isExample: false,
    isLive: true
  }
}

export function normalizeQidianRecords(records, context = {}) {
  if (!Array.isArray(records)) return []
  return records.map((row, index) => normalizeQidianRecord(row, index, context)).filter(Boolean)
}

export async function fetchQidianRanking(options = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持网络请求')

  const rankType = resolveRankType(options.rankType)
  const channel = normalizeChannel(options.channel)
  const csrfToken = createCsrfToken()
  const endpoint = new URL(`https://m.qidian.com/majax/rank/${rankType.endpoint}`)
  endpoint.searchParams.set('_csrfToken', csrfToken)
  endpoint.searchParams.set('gender', channelGender(channel))
  endpoint.searchParams.set('pageNum', String(clampPage(options.pageNum)))
  endpoint.searchParams.set('catId', String(clampCategory(options.categoryId)))

  const controller = new AbortController()
  const timeoutMs = Math.max(
    1_000,
    Math.min(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 15_000)
  )
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Cookie: `_csrfToken=${csrfToken}`,
        Referer: rankType.pageUrl,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
      }
    })
    if (!response.ok) throw new Error(`起点接口返回 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.code !== 0 || !Array.isArray(payload?.data?.records)) {
      throw new Error(payload?.msg ? `起点接口返回：${payload.msg}` : '起点接口返回格式不正确')
    }
    const items = normalizeQidianRecords(payload.data.records, { rankType, channel })
    if (!items.length) throw new Error('起点接口暂未返回榜单作品')
    return {
      success: true,
      platform: 'qidian',
      rankType: rankType.key,
      rankLabel: rankType.label,
      channel,
      sourceUrl: rankType.pageUrl,
      fetchedAt: nowIso(),
      latencyMs: Date.now() - startedAt,
      total: Number(payload.data.total || items.length),
      pageNum: Number(payload.data.pageNum || clampPage(options.pageNum)),
      items
    }
  } catch (error) {
    if (error?.name === 'AbortError')
      throw new Error(`起点榜单请求超时（${timeoutMs} ms）`, { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function cacheKey(filter = {}) {
  return `qidian:${resolveRankType(filter.rankType).key}:${normalizeChannel(filter.channel)}:${clampCategory(filter.categoryId)}:${clampPage(filter.pageNum)}`
}

function cacheAgeMs(entry) {
  const timestamp = Date.parse(entry?.fetchedAt || '')
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : Number.POSITIVE_INFINITY
}

function responseFromEntry(entry, mode = 'live', message = '') {
  const items = (entry?.items || []).map((item) => ({
    ...item,
    contentKind: mode === 'live' ? 'live' : mode,
    contentKindLabel:
      mode === 'live' ? '起点实时榜单' : mode === 'stale' ? '起点过期缓存' : '起点缓存榜单',
    isLive: mode === 'live',
    isStale: mode === 'stale'
  }))
  const rankType = resolveRankType(entry?.rankType)
  return {
    success: true,
    platform: 'qidian',
    channel: entry?.channel || 'male',
    rankTypes: QIDIAN_RANK_TYPES,
    selectedRankType: rankType.key,
    rankLabel: rankType.label,
    sourceUrl: entry?.sourceUrl || rankType.pageUrl,
    fetchedAt: entry?.fetchedAt || '',
    latencyMs: entry?.latencyMs || 0,
    total: entry?.total || items.length,
    sources: [
      {
        source: 'qidian',
        label: '起点中文网',
        count: items.length,
        status: mode === 'live' ? 'success' : mode,
        lastSuccessAt: entry?.fetchedAt || ''
      }
    ],
    items,
    selectedItem: items[0] || null,
    dataMode: mode,
    message,
    emptyState: items.length
      ? { reason: 'ok', title: '', description: '', offline: false }
      : {
          reason: 'empty',
          title: '起点榜单暂不可用',
          description: message || '起点暂未返回榜单数据，请稍后重试。',
          offline: false
        }
  }
}

export async function buildPlatformHotRank(booksDir, filter = {}, dependencies = {}) {
  const key = cacheKey(filter)
  const path = rankingCachePath(booksDir)
  const cache = await readJson(path, {})
  const cached = cache?.[key]
  if (!filter.force && cached && cacheAgeMs(cached) <= CACHE_FRESH_MS) {
    return responseFromEntry(cached, 'cached')
  }

  if (filter.offline) {
    if (cached?.items?.length) {
      const mode = cacheAgeMs(cached) <= CACHE_STALE_MS ? 'cached' : 'stale'
      return responseFromEntry(cached, mode, '当前离线，已展示起点缓存榜单。')
    }
    const rankType = resolveRankType(filter.rankType)
    return responseFromEntry(
      {
        platform: 'qidian',
        channel: normalizeChannel(filter.channel),
        rankType: rankType.key,
        sourceUrl: rankType.pageUrl,
        items: []
      },
      'empty',
      '当前离线，无法读取起点实时榜单。'
    )
  }

  try {
    const fresh = await fetchQidianRanking(filter, dependencies)
    await updateJson(path, (current = {}) => ({ ...current, [key]: fresh }), {})
    return responseFromEntry(fresh, 'live')
  } catch (error) {
    if (cached?.items?.length) {
      const mode = cacheAgeMs(cached) <= CACHE_STALE_MS ? 'cached' : 'stale'
      return responseFromEntry(
        cached,
        mode,
        `实时刷新失败，已展示${mode === 'stale' ? '过期' : ''}缓存：${error.message}`
      )
    }
    const rankType = resolveRankType(filter.rankType)
    return responseFromEntry(
      {
        platform: 'qidian',
        channel: normalizeChannel(filter.channel),
        rankType: rankType.key,
        sourceUrl: rankType.pageUrl,
        items: []
      },
      'empty',
      error?.message || '起点榜单加载失败'
    )
  }
}

export default {
  QIDIAN_RANK_TYPES,
  normalizeQidianRecords,
  fetchQidianRanking,
  buildPlatformHotRank
}

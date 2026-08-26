import { nowIso } from './webJsonRepository.js'
import { FANQIE_PUA_MAP } from './fanqiePuaMap.js'

const FANQIE_API_BASE = 'https://fanqienovel.com/api/rank/category/list'
const FANQIE_PAGE_BASE = 'https://fanqienovel.com/rank'
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_LIMIT = 30

// 番茄只有「热门榜」一种算法(rank_list_type=3),语义等价物是分类。
// 每个分类绑定频道(gender: 1=男频 / 0=女频),key 全局唯一。
export const FANQIE_RANK_TYPES = Object.freeze([
  // ── 男频 (gender=1) ──
  { key: 'fq_xuanhuan', categoryId: 258, gender: 1, label: '传统玄幻', description: '玄幻热血大作排行' },
  { key: 'fq_dushi', categoryId: 261, gender: 1, label: '都市日常', description: '都市生活题材排行' },
  { key: 'fq_qihuan', categoryId: 1141, gender: 1, label: '西方奇幻', description: '西幻魔法世界排行' },
  { key: 'fq_xianxia', categoryId: 1140, gender: 1, label: '东方仙侠', description: '修仙问道题材排行' },
  { key: 'fq_kehuan', categoryId: 8, gender: 1, label: '科幻末世', description: '科幻末日题材排行' },
  { key: 'fq_lishi', categoryId: 273, gender: 1, label: '历史古代', description: '历史古代题材排行' },
  { key: 'fq_xuanyi', categoryId: 539, gender: 1, label: '悬疑脑洞', description: '悬疑脑洞题材排行' },
  { key: 'fq_gaowu', categoryId: 1014, gender: 1, label: '都市高武', description: '都市高武题材排行' },
  // ── 女频 (gender=0) ──
  { key: 'fq_xuanhuan_yq', categoryId: 248, gender: 0, label: '玄幻言情', description: '玄幻言情题材排行' },
  { key: 'fq_gufeng', categoryId: 1139, gender: 0, label: '古风世情', description: '古风世情题材排行' },
  { key: 'fq_gongdou', categoryId: 246, gender: 0, label: '宫斗宅斗', description: '宫斗宅斗题材排行' },
  { key: 'fq_kuaichuan', categoryId: 24, gender: 0, label: '快穿', description: '快穿穿越题材排行' },
  { key: 'fq_niandai', categoryId: 79, gender: 0, label: '年代', description: '年代文题材排行' },
  { key: 'fq_haomen', categoryId: 748, gender: 0, label: '豪门总裁', description: '豪门总裁题材排行' },
  { key: 'fq_xianyan', categoryId: 267, gender: 0, label: '现言脑洞', description: '现代言情脑洞排行' },
  { key: 'fq_tianchong', categoryId: 749, gender: 0, label: '青春甜宠', description: '青春甜宠题材排行' }
])

function normalizeChannel(value) {
  return value === 'female' ? 'female' : 'male'
}

function channelToGender(channel) {
  return normalizeChannel(channel) === 'female' ? 0 : 1
}

export function fanqieRankTypesForChannel(channel) {
  const gender = channelToGender(channel)
  return FANQIE_RANK_TYPES.filter((item) => item.gender === gender)
}

function resolveFanqieRankType(value, channel) {
  const candidates = fanqieRankTypesForChannel(channel)
  return candidates.find((item) => item.key === value) || candidates[0]
}

// 将番茄 PUA 私用区码点查表还原为真实字符。
export function decodeFanqieText(text) {
  if (!text) return ''
  let out = ''
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    if (code >= 0xe000 && code <= 0xf8ff) {
      out += FANQIE_PUA_MAP[`0x${code.toString(16)}`] || ch
    } else {
      out += ch
    }
  }
  return out
}

function formatFanqieCount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`
  if (num >= 10_000) return `${(num / 10_000).toFixed(1).replace(/\.0$/, '')}万`
  return String(Math.round(num))
}

function formatFanqieWordCount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 10_000) return `${(num / 10_000).toFixed(1).replace(/\.0$/, '')}万字`
  return `${Math.round(num)}字`
}

function normalizeFanqieRecord(row = {}, index = 0, context = {}) {
  const bookId = String(row.bookId || '').trim()
  const title = decodeFanqieText(row.bookName).trim()
  if (!bookId || !title) return null
  const rankType = context.rankType || resolveFanqieRankType(null, context.channel)
  const channel = normalizeChannel(context.channel)
  const sourceLabel = `番茄 · ${rankType.label}`
  const intro = decodeFanqieText(row.abstract).trim()
  const rank = Number(row.currentPos || index + 1)
  const readMetric = formatFanqieCount(row.read_count)
  return {
    id: `fanqie_${rankType.key}_${channel}_${bookId}`,
    platform: 'fanqie',
    source: sourceLabel,
    sourceLabel,
    sourceType: 'novel_rank',
    sourceUrl: FANQIE_PAGE_BASE,
    rankType: rankType.key,
    rankLabel: rankType.label,
    rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
    rankMetric: readMetric ? `${readMetric}阅读` : '',
    rawTitle: title,
    title,
    author: decodeFanqieText(row.author).trim(),
    intro,
    summary: intro,
    transferablePlot: intro,
    readerPleasure: '',
    category: rankType.label,
    subCategory: '',
    genre: rankType.label,
    writableTypes: [rankType.label].filter(Boolean),
    tags: [rankType.label].filter(Boolean),
    wordCount: formatFanqieWordCount(row.wordNumber),
    channel,
    channelLabel: channel === 'female' ? '女频' : '男频',
    url: `https://fanqienovel.com/page/${bookId}`,
    bookId,
    coverUrl: String(row.thumbUri || '').trim(),
    heatScore: null,
    growthScore: null,
    opportunityScore: null,
    contentKind: 'live',
    contentKindLabel: '番茄实时榜单',
    isExample: false,
    isLive: true
  }
}

export function normalizeFanqieRecords(records, context = {}) {
  if (!Array.isArray(records)) return []
  return records.map((row, index) => normalizeFanqieRecord(row, index, context)).filter(Boolean)
}

function clampOffset(value) {
  const offset = Number(value)
  return Number.isInteger(offset) && offset >= 0 ? Math.min(offset, 90) : 0
}

export async function fetchFanqieRanking(options = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持网络请求')

  const channel = normalizeChannel(options.channel)
  const rankType = resolveFanqieRankType(options.rankType, channel)
  const offset = clampOffset(options.offset)
  const limit = DEFAULT_LIMIT
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS

  const params = new URLSearchParams({
    app_id: '2503',
    rank_list_type: '3',
    offset: String(offset),
    limit: String(limit),
    category_id: String(rankType.categoryId),
    rank_version: '',
    gender: String(channelToGender(channel)),
    rankMold: '2'
  })
  const url = `${FANQIE_API_BASE}?${params.toString()}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    })
    if (!response.ok) throw new Error(`番茄接口返回 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.code !== 0 || !Array.isArray(payload?.data?.book_list)) {
      throw new Error(
        payload?.message && payload.message !== 'success'
          ? `番茄接口返回:${payload.message}`
          : '番茄接口返回格式不正确'
      )
    }
    const items = normalizeFanqieRecords(payload.data.book_list, { rankType, channel })
    if (!items.length) throw new Error('番茄接口暂未返回榜单作品')
    return {
      success: true,
      platform: 'fanqie',
      rankType: rankType.key,
      rankLabel: rankType.label,
      channel,
      sourceUrl: FANQIE_PAGE_BASE,
      fetchedAt: nowIso(),
      latencyMs: Date.now() - startedAt,
      total: Number(payload.data.total_num || items.length),
      offset,
      items
    }
  } catch (error) {
    if (error?.name === 'AbortError')
      throw new Error(`番茄榜单请求超时(${timeoutMs} ms)`, { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export default {
  FANQIE_RANK_TYPES,
  fanqieRankTypesForChannel,
  decodeFanqieText,
  normalizeFanqieRecords,
  fetchFanqieRanking
}

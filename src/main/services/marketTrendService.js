import { join } from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { writeJson, nowIso } from './webJsonRepository.js'

const MARKET_DIR = 'market'
const HOT_TOPICS_FILE = 'hot-topics.json'
const TREND_RECORDS_FILE = 'trend-records.json'
const SOURCE_STATUS_FILE = 'source-status.json'
const SOURCE_CACHE_FILE = 'source-cache.json'
const OPPORTUNITIES_FILE = 'opportunities.json'
const COLLECTION_LOGS_FILE = 'collection-logs.json'

const CACHE_TTL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 8000
const REQUEST_INTERVAL_MS = 800
const REQUEST_RETRY_COUNT = 0
const RETRY_INTERVAL_MS = 500
const MAX_TOPIC_ROWS = 1000
const MAX_SERIES_POINTS = 240
const HOUR_MS = 60 * 60 * 1000

const SOURCE_STALE_AFTER_MS = {
  weibo: 6 * HOUR_MS,
  baidu: 6 * HOUR_MS,
  aggregated: 12 * HOUR_MS,
  ikun: 12 * HOUR_MS,
  dailyhot: 24 * HOUR_MS,
  rsshub: 24 * HOUR_MS,
  qidian: 48 * HOUR_MS,
  jjwxc: 48 * HOUR_MS,
  fanqie: 48 * HOUR_MS,
  qimao: 48 * HOUR_MS
}

const runtimeCache = new Map()
let schedulerTimer = null

const SOURCE_CONFIG = {
  weibo: {
    label: '微博热搜',
    platform: '微博',
    urls: [
      'https://v2.xxapi.cn/api/weibohot',
      'https://v1.nsuuu.com/api/weibohot',
      'https://api.iyuns.com/api/weibohot'
    ],
    intervalMs: 5 * 60 * 1000
  },
  baidu: {
    label: '百度热搜',
    platform: '百度',
    urls: ['https://api.iyuns.com/api/baiduhot'],
    intervalMs: 5 * 60 * 1000
  },
  aggregated: {
    label: '全网热榜',
    platform: '全网',
    urls: ['https://api.hewoyi.com/api/hotlist/all'],
    intervalMs: 15 * 60 * 1000
  },
  ikun: {
    label: '聚合热搜',
    platform: '聚合',
    urls: [
      'https://api.ikunpay.com/api/jhrs?type=weibo',
      'https://api.ikunpay.com/api/jhrs?type=baidu',
      'https://api.ikunpay.com/api/jhrs?type=zhihu',
      'https://api.ikunpay.com/api/jhrs?type=douyin',
      'https://api.ikunpay.com/api/jhrs?type=bilihot'
    ],
    intervalMs: 30 * 60 * 1000
  },
  dailyhot: {
    label: 'DailyHotApi',
    platform: 'DailyHot',
    optional: true,
    getUrls: () => dailyHotUrls(),
    intervalMs: 60 * 60 * 1000
  },
  rsshub: {
    label: 'RSSHub',
    platform: 'RSSHub',
    optional: true,
    getUrls: () => rssHubUrls(),
    intervalMs: 90 * 60 * 1000
  },
  qidian: {
    label: '起点中文网',
    platform: '起点',
    getUrls: () =>
      configuredUrls('MARKET_QIDIAN_URLS', [
        'https://m.qidian.com/rank/yuepiao/',
        'https://m.qidian.com/rank/newbook/'
      ]),
    intervalMs: 12 * 60 * 60 * 1000
  },
  jjwxc: {
    label: '晋江文学城',
    platform: '晋江',
    getUrls: () =>
      configuredUrls('MARKET_JJWXC_URLS', [
        'https://www.jjwxc.net/topten.php?orderstr=1&t=0',
        'https://www.jjwxc.net/topten.php?orderstr=7&t=0'
      ]),
    intervalMs: 12 * 60 * 60 * 1000
  },
  fanqie: {
    label: '番茄小说',
    platform: '番茄',
    getUrls: () =>
      configuredUrls('MARKET_FANQIE_URLS', [
        'https://fanqienovel.com/rank/1_2_257',
        'https://fanqienovel.com/rank/1_2_262',
        'https://fanqienovel.com/rank'
      ]),
    intervalMs: 12 * 60 * 60 * 1000
  },
  qimao: {
    label: '七猫小说',
    platform: '七猫',
    getUrls: () =>
      configuredUrls('MARKET_QIMAO_URLS', [
        'https://www.qimao.com/rank/',
        'https://www.qimao.com/paihang',
        'https://www.qimao.com/activity/current/'
      ]),
    intervalMs: 12 * 60 * 60 * 1000
  }
}

const DEFAULT_SOURCES = [
  'weibo',
  'baidu',
  'aggregated',
  'dailyhot',
  'rsshub',
  'qidian',
  'jjwxc',
  'fanqie',
  'qimao'
]

const CHANNEL_LABELS = {
  all: '通用',
  male: '男频',
  female: '女频'
}

const NOVEL_SIGNAL_RULES = [
  {
    key: 'family_reversal',
    label: '家庭反转',
    genre: '都市情感',
    channels: ['female', 'all'],
    tags: ['现言', '逆袭', '复仇', '家庭'],
    emotions: ['委屈', '反击', '共情'],
    conflicts: ['亲密关系背叛 vs 主角自证', '家族压迫 vs 女性成长'],
    titleIdeas: ['离婚后我靠新品牌翻身', '被全家抛弃后她成了谈判桌主人', '前夫求复合那天我上市了'],
    loglineIdeas: ['被嘲到谷底的女主，在离婚当天得到商业系统，从家庭弃子变成行业新贵。'],
    openingIdeas: ['离婚当天，她被通知三小时内搬出别墅，但手机里多了一个品牌孵化系统。'],
    platforms: ['番茄', '七猫', '短剧'],
    pattern: /夫妻|离婚|婆婆|丈夫|妻子|孩子|亲子|家庭|妈妈|爸爸|爷爷|奶奶|老人|彩礼|婚礼|相亲|出轨/,
    hook: '亲密关系突然翻面，主角在亲情、婚姻和利益里做出反击。'
  },
  {
    key: 'wealth_power',
    label: '财富权力',
    genre: '都市逆袭',
    channels: ['male', 'female', 'all'],
    tags: ['都市', '逆袭', '商业', '隐藏身份'],
    emotions: ['憋屈', '爽感', '翻身'],
    conflicts: ['资本围堵 vs 草根破局', '资源垄断 vs 信息差逆袭'],
    titleIdeas: ['破产后我接管万亿暗线', '小店老板的资本反杀', '被裁那天我绑定产业地图'],
    loglineIdeas: ['普通人被迫进入财富游戏，用信息差和胆识从边缘位置逆风翻盘。'],
    openingIdeas: ['他被公司扫地出门时，旧手机里弹出一份十年后的并购名单。'],
    platforms: ['番茄', '起点', '短剧'],
    pattern: /富豪|老板|公司|股票|美元|资产|债务|破产|豪门|总裁|投资|金融|暴富|中奖/,
    hook: '普通人被卷入财富规则，用信息差或隐藏身份完成逆袭。'
  },
  {
    key: 'public_event',
    label: '现实事件',
    genre: '现实悬疑',
    channels: ['all', 'male'],
    tags: ['悬疑', '现实向', '真相', '反转'],
    emotions: ['疑惑', '紧张', '代入'],
    conflicts: ['公开叙事 vs 私人秘密', '舆论误判 vs 主角追查'],
    titleIdeas: ['直播中断前三秒', '沉默证人', '热搜背后的第七个人'],
    loglineIdeas: ['主角从一条公开热词里发现异常，追查时发现自己也被写进了局里。'],
    openingIdeas: ['直播连线断开的前三秒，他收到一条匿名信息：别相信通报里的第三句话。'],
    platforms: ['七猫', '番茄', '短篇'],
    pattern:
      /官方|警方|通报|失踪|调查|法院|事故|案件|争议|回应|举报|曝光|辟谣|真相|纪委|审计|秘书|官场/,
    hook: '一个公共事件背后藏着私人秘密，主角追查时发现自己也在局中。'
  },
  {
    key: 'entertainment',
    label: '娱乐名利场',
    genre: '娱乐圈',
    channels: ['female', 'all'],
    tags: ['娱乐圈', '反转', '直播', '成长'],
    emotions: ['好奇', '爽感', '共情'],
    conflicts: ['公众人设 vs 真实人生', '资本封杀 vs 主角翻盘'],
    titleIdeas: ['塌房后我成了幕后女王', '全网黑那晚她开了直播', '替身演员杀回顶流榜'],
    loglineIdeas: ['被舆论吞没的女主，借一次直播事故揭开旧局，也重写自己的职业命运。'],
    openingIdeas: ['直播事故后，她被公司连夜开除，却在后台监控里看见了未婚夫的脸。'],
    platforms: ['晋江', '番茄', '短剧'],
    pattern: /明星|演员|电影|电视剧|综艺|票房|演唱会|导演|塌房|粉丝|直播/,
    hook: '公众人设和真实人生相撞，主角借一次危机翻盘。'
  },
  {
    key: 'tech_future',
    label: '科技变量',
    genre: '科幻脑洞',
    channels: ['male', 'all'],
    tags: ['科幻', '系统', '创业', '未来技术'],
    emotions: ['新奇', '紧张', '爽感'],
    conflicts: ['技术突破 vs 资本围剿', '普通人获得未来技术 vs 规则失控'],
    titleIdeas: ['我捡到十年后的芯片', '破产程序员的未来公司', '城市算法觉醒后'],
    loglineIdeas: ['普通人得到未来技术，却必须在资本围堵和伦理代价之间完成一次逆袭。'],
    openingIdeas: ['破产那天，他捡到一块来自十年后的芯片，里面写着明天的事故名单。'],
    platforms: ['起点', '番茄'],
    pattern: /AI|机器人|芯片|航天|火箭|新能源|算法|手机|游戏|科技|量子|无人机|末世/,
    hook: '新技术改变普通人的命运，也带来无法回头的代价。'
  },
  {
    key: 'youth_growth',
    label: '成长压力',
    genre: '青春现实',
    channels: ['female', 'all'],
    tags: ['青春', '校园', '成长', '治愈'],
    emotions: ['遗憾', '共情', '治愈'],
    conflicts: ['家庭期待 vs 自我选择', '考试压力 vs 人生出路'],
    titleIdeas: ['十八岁那年的退路', '她把录取通知藏进旧书里', '毕业前我们重新开始'],
    loglineIdeas: ['年轻人在考试、亲情和未来之间做选择，最终找到属于自己的答案。'],
    openingIdeas: ['高考前夜，她把改志愿的短信删掉，却在旧书里发现母亲藏了十年的信。'],
    platforms: ['晋江', '七猫', '短篇'],
    pattern: /大学|高中|考试|学生|老师|毕业|考研|就业|校园|青春/,
    hook: '年轻人在考试、亲情和未来选择里，找到自己的反击方式。'
  },
  {
    key: 'body_health',
    label: '身体危机',
    genre: '现实治愈',
    channels: ['female', 'all'],
    tags: ['现实向', '治愈', '家庭', '成长'],
    emotions: ['心疼', '共情', '释然'],
    conflicts: ['有限时间 vs 未完成的关系', '病痛真相 vs 家庭隐瞒'],
    titleIdeas: ['她醒来后的三十天', '病房里的第二封信', '把遗憾改写成春天'],
    loglineIdeas: ['一次身体危机让关系重新排序，主角在有限时间里处理爱、隐瞒和选择。'],
    openingIdeas: ['她醒来后第一眼看到的不是家人，而是床头那份被撕掉签名页的手术同意书。'],
    platforms: ['七猫', '番茄', '短篇'],
    pattern: /医院|医生|健康|癌|病房|病痛|手术|身亡|救治|身体危机|老人|怀孕|生育|死亡/,
    hook: '身体危机让关系重新排序，主角在有限时间里完成选择。'
  },
  {
    key: 'power_strategy',
    label: '权力博弈',
    genre: '都市权谋',
    channels: ['male', 'all'],
    tags: ['权谋', '舆论战', '反击爽文', '谈判'],
    emotions: ['压迫', '反击', '爽感'],
    conflicts: ['外部施压 vs 主角破局', '舆论误判 vs 暗中布局'],
    titleIdeas: ['断线前三秒允许反击', '谈判桌下的暗牌', '所有人都误判了他'],
    loglineIdeas: ['被全网误解的谈判专家，在一次直播危机中逆转局势。'],
    openingIdeas: ['直播连线断开的前三秒，他收到了上级发来的密令：允许反击。'],
    platforms: ['起点', '番茄'],
    pattern: /谈判|博弈|封锁|反击|布局|制裁|资源|战略|危机|发布会|权力|青云|仕途/,
    hook: '外部压力逼近时，主角用被误解的身份完成一次公开反击。'
  },
  {
    key: 'rebirth_palace',
    label: '重生宫斗',
    genre: '古言权谋',
    channels: ['female'],
    tags: ['古言', '宫斗', '重生', '复仇'],
    emotions: ['不甘', '隐忍', '翻盘'],
    conflicts: ['前世背叛 vs 今生布局', '身份束缚 vs 权力争夺'],
    titleIdeas: ['重生后我先废了婚约', '宫墙内的第二次开局', '她把凤冠还给仇人'],
    loglineIdeas: ['女主带着前世记忆重回选择前夜，用温柔外表藏住复仇计划。'],
    openingIdeas: ['她再睁眼时，赐婚圣旨还没送到，而害死她的人正在门外笑。'],
    platforms: ['晋江', '七猫'],
    pattern: /古言|宫斗|重生嫡女|皇后|王妃|嫡女|庶女|宅斗|侯府/,
    hook: '前世的失败变成今生的情报，女主在关系网里一步步翻盘。'
  },
  {
    key: 'xianxia_upgrade',
    label: '仙侠升级',
    genre: '玄幻仙侠',
    channels: ['male', 'all'],
    tags: ['玄幻', '仙侠', '升级', '家族', '修真'],
    emotions: ['成长', '爽感', '期待'],
    conflicts: ['弱小家族求生 vs 大势压迫', '凡人资质 vs 修行规则'],
    titleIdeas: ['小族镜中藏仙路', '凡骨家族的成圣路', '被宗门轻视后我改写仙谱'],
    loglineIdeas: ['主角从微末家族出发，在资源稀缺和强敌压迫中建立自己的修行秩序。'],
    openingIdeas: ['家族祠堂坍塌那夜，他在碎裂铜镜里看见了三天后的灭门火光。'],
    platforms: ['起点', '番茄'],
    pattern:
      /玄幻|奇幻|仙侠|修真|武道|成圣|神通|灵异|地下城|龙|诸天|无限|高武|穿越|重生|系统|命格|功力|妖族|宗门|脑洞|霸体|神棺|潜龙/,
    hook: '微末出身遇到修行规则，主角用资源和情报差一步步变强。'
  },
  {
    key: 'historical_strategy',
    label: '历史权谋',
    genre: '历史权谋',
    channels: ['male', 'all'],
    tags: ['历史', '权谋', '战争', '争霸', '穿越'],
    emotions: ['压迫', '热血', '翻盘'],
    conflicts: ['乱世小卒求生 vs 朝堂军阵压迫', '边关危局 vs 主角改写战局'],
    titleIdeas: ['边关小卒的封侯路', '大周武夫从烽火台起家', '乱世第一封刀令'],
    loglineIdeas: ['主角从乱世低处开局，在军阵、朝堂和资源争夺中一步步改写命运。'],
    openingIdeas: ['烽火台失守前夜，他在军册最后一页看见了自己的死期。'],
    platforms: ['起点', '七猫'],
    pattern:
      /边关|兵王|边军|武夫|王朝|争霸|架空历史|历史|将军|朝堂|沙场|烽火|封狼居胥|北伐|东晋|三国|皇朝|小卒/,
    hook: '乱世压力压到小人物身上，主角用胆识和信息一步步夺回主动。'
  },
  {
    key: 'ancient_romance',
    label: '古言关系',
    genre: '古言权谋',
    channels: ['female'],
    tags: ['古言', '权谋', '双强', '先婚后爱', '女性成长'],
    emotions: ['张力', '不甘', '翻盘'],
    conflicts: ['婚约束缚 vs 主角自救', '朝堂规则 vs 女性破局'],
    titleIdeas: ['掌心谋妻之后', '侯府旧局里的新嫁娘', '她把婚约写成战书'],
    loglineIdeas: ['女主被卷入婚约与权力局，在危险关系中拿回选择权。'],
    openingIdeas: ['赐婚圣旨落下时，她正把绑匪的刀按回对方袖中。'],
    platforms: ['晋江', '番茄', '七猫'],
    pattern:
      /古言|权谋|锦衣卫|侯府|县主|公主|王爷|嫁|赐婚|掌心|娇|乱世|谋妻|宅斗|宫廷|甜宠|先婚后爱|双强/,
    hook: '亲密关系和权力规则同时压来，女主先求生，再翻盘。'
  }
]

const HARD_NEWS_PATTERN =
  /中美元首|特朗普|王毅|外交|会晤|关税|总统|国务院|白宫|以军|乌克兰|俄罗斯|战争|导弹|制裁|边境|外交部|大使|联合国|央行|世界杯版权|股票过户|黄仁勋|巴菲特慈善午餐/

const PLATFORM_PROFILES = [
  {
    platform: '起点',
    boardName: '男频长篇方向',
    source: 'qidian',
    channel: 'male',
    genres: ['玄幻', '科幻脑洞', '都市逆袭', '游戏'],
    readerNeed: '升级线清楚，世界规则能长期展开。'
  },
  {
    platform: '番茄',
    boardName: '大众爽感方向',
    source: 'fanqie',
    channel: 'all',
    genres: ['都市逆袭', '家庭反转', '科幻脑洞', '现实悬疑'],
    readerNeed: '开篇冲突快，人物目标直接。'
  },
  {
    platform: '七猫',
    boardName: '现实情绪方向',
    source: 'qimao',
    channel: 'female',
    genres: ['都市情感', '现实悬疑', '现实治愈'],
    readerNeed: '情绪明确，人物关系容易代入。'
  },
  {
    platform: '晋江',
    boardName: '女性向关系方向',
    source: 'jjwxc',
    channel: 'female',
    genres: ['娱乐圈', '青春现实', '都市情感'],
    readerNeed: '人物关系有张力，人设记忆点强。'
  },
  {
    platform: '短剧',
    boardName: '强反转短篇方向',
    source: 'dailyhot',
    channel: 'all',
    genres: ['家庭反转', '都市逆袭', '娱乐圈'],
    readerNeed: '前三分钟有冲突，十分钟内有反转。'
  }
]

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
    throw new Error(`市场趋势数据读取失败：${fileName}：${error.message}`)
  }
  if (Array.isArray(data)) return data.filter((item) => item != null)
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
    return data.items.filter((item) => item != null)
  }
  throw new Error(`市场趋势数据格式异常：${fileName}，已停止读取`)
}

function timeValue(value) {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : 0
}

function staleAfterForSource(source) {
  return SOURCE_STALE_AFTER_MS[source] || 24 * HOUR_MS
}

function sourceCacheTtlMs(source, options = {}) {
  const sourceEnvKey = `MARKET_TREND_${String(source || '').toUpperCase()}_CACHE_TTL_MS`
  const candidates = [
    options.cacheTtlMs,
    process.env[sourceEnvKey],
    process.env.MARKET_TREND_CACHE_TTL_MS,
    CACHE_TTL_MS
  ]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value > 0) return value
  }
  return CACHE_TTL_MS
}

function isFreshSourceCacheRow(row = {}, now = Date.now(), options = {}) {
  if (!row?.source || !SOURCE_CONFIG[row.source] || !row.result?.success) return false
  const createdAt = timeValue(row.createdAt)
  const expiresAt = timeValue(row.expiresAt)
  if (!createdAt) return false
  if (expiresAt) return now < expiresAt
  return now - createdAt < sourceCacheTtlMs(row.source, options)
}

export async function pruneSourceCache(booksDir, options = {}) {
  if (!booksDir || options.persistentCache === false) {
    return { checked: 0, kept: 0, removed: 0, updatedAt: nowIso() }
  }
  const rows = readRows(booksDir, SOURCE_CACHE_FILE)
  const now = Date.now()
  const seen = new Set()
  const sorted = [...rows].sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
  const kept = []
  let removed = 0
  for (const row of sorted) {
    if (!isFreshSourceCacheRow(row, now, options) || seen.has(row.source)) {
      removed += 1
      continue
    }
    seen.add(row.source)
    kept.push(row)
  }
  if (
    removed > 0 ||
    kept.length !== rows.length ||
    kept.some((row, index) => row !== rows[index])
  ) {
    await writeRows(booksDir, SOURCE_CACHE_FILE, kept)
  }
  return { checked: rows.length, kept: kept.length, removed, updatedAt: nowIso() }
}

function sourceStatusValue(row = {}, now = Date.now()) {
  if (!row?.source || row.skipped) return 'empty'
  const successAt = timeValue(row.lastSuccessAt)
  const failureAt = timeValue(row.lastFailureAt)
  if (failureAt && (!successAt || failureAt >= successAt)) return 'error'
  if (successAt && now - successAt > staleAfterForSource(row.source)) return 'stale'
  if (successAt) return 'success'
  if (failureAt) return 'error'
  return 'empty'
}

function enrichSourceStatus(row = {}, now = Date.now()) {
  const successAt = timeValue(row.lastSuccessAt)
  const staleAfterMs = staleAfterForSource(row.source)
  const status = sourceStatusValue(row, now)
  return {
    ...row,
    status,
    isStale: status === 'stale',
    staleAfterMs,
    lastSuccessAgeMs: successAt ? Math.max(0, now - successAt) : 0
  }
}

function strongerSourceStatus(current = 'empty', next = 'empty') {
  const weight = { empty: 0, skipped: 0, success: 1, stale: 2, error: 3 }
  return (weight[next] || 0) > (weight[current] || 0) ? next : current
}

async function writeRows(booksDir, fileName, items, extra = {}) {
  if (!Array.isArray(items)) {
    throw new Error(`市场趋势数据格式异常：${fileName}，已停止写入以免覆盖原始记录`)
  }
  await writeJson(getMarketPath(booksDir, fileName), {
    version: 1,
    updatedAt: nowIso(),
    ...extra,
    items
  })
}

function readSourceCache(booksDir, source, options = {}) {
  if (!booksDir || options.force || options.persistentCache === false) return null
  const rows = readRows(booksDir, SOURCE_CACHE_FILE)
  const row = rows.find((item) => item?.source === source && item?.result?.success)
  if (!row) return null
  if (!isFreshSourceCacheRow(row, Date.now(), options)) return null
  return {
    ...row.result,
    fromCache: true,
    cacheType: 'persistent',
    sourceUrls: row.sourceUrls || row.result?.sourceUrls || [],
    fetchedAt: row.fetchedAt || row.result?.fetchedAt || '',
    cacheCreatedAt: row.createdAt,
    cacheExpiresAt: row.expiresAt,
    latencyMs: 0
  }
}

async function writeSourceCache(booksDir, source, result, options = {}) {
  if (!booksDir || options.persistentCache === false || !result?.success) return
  const now = Date.now()
  const createdAt = new Date(now).toISOString()
  const ttlMs = sourceCacheTtlMs(source, options)
  const rows = readRows(booksDir, SOURCE_CACHE_FILE).filter(
    (item) => item?.source && item.source !== source
  )
  rows.unshift({
    source,
    createdAt,
    expiresAt: new Date(now + ttlMs).toISOString(),
    ttlMs,
    sourceUrls: result.sourceUrls || sourceUrls(source),
    fetchedAt: result.fetchedAt || createdAt,
    result: {
      ...result,
      fromCache: false,
      cacheType: ''
    }
  })
  const knownSources = new Set(Object.keys(SOURCE_CONFIG))
  await writeRows(
    booksDir,
    SOURCE_CACHE_FILE,
    rows.filter((item) => knownSources.has(item.source)).slice(0, knownSources.size)
  )
}

function asText(value) {
  return String(value ?? '').trim()
}

function stripHtml(value) {
  return asText(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanReadableText(value = '') {
  const text = stripHtml(value)
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  return chineseCount >= Math.min(2, text.length) ? text : ''
}

function configuredUrls(envKey, defaults = []) {
  const configured = String(process.env[envKey] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return configured.length ? configured : defaults
}

function cleanBaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function dailyHotUrls() {
  const base = cleanBaseUrl(
    process.env.DAILYHOT_API_BASE_URL || process.env.MARKET_DAILYHOT_API_BASE_URL
  )
  if (!base) return []
  return ['weibo', 'baidu', 'zhihu', 'bilibili', 'douyin'].map((path) => `${base}/${path}`)
}

function rssHubUrls() {
  const base = cleanBaseUrl(process.env.RSSHUB_BASE_URL || process.env.MARKET_RSSHUB_BASE_URL)
  if (!base) return []
  return ['/weibo/search/hot', '/baidu/top', '/zhihu/hotlist', '/bilibili/ranking/0/3'].map(
    (path) => `${base}${path}`
  )
}

function sourceUrls(source) {
  const config = SOURCE_CONFIG[source]
  if (!config) return []
  const urls = typeof config.getUrls === 'function' ? config.getUrls() : config.urls
  return Array.isArray(urls) ? urls.filter(Boolean) : []
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function requestIntervalMs(source, options = {}) {
  const sourceEnvKey = `MARKET_TREND_${String(source || '').toUpperCase()}_REQUEST_INTERVAL_MS`
  return positiveNumber(
    options.requestIntervalMs ??
      process.env[sourceEnvKey] ??
      process.env.MARKET_TREND_REQUEST_INTERVAL_MS,
    REQUEST_INTERVAL_MS
  )
}

function requestRetryCount(source, options = {}) {
  const sourceEnvKey = `MARKET_TREND_${String(source || '').toUpperCase()}_RETRY_COUNT`
  const value = positiveNumber(
    options.requestRetryCount ??
      options.retryCount ??
      process.env[sourceEnvKey] ??
      process.env.MARKET_TREND_RETRY_COUNT,
    REQUEST_RETRY_COUNT
  )
  return Math.min(3, Math.floor(value))
}

function retryIntervalMs(source, options = {}) {
  const sourceEnvKey = `MARKET_TREND_${String(source || '').toUpperCase()}_RETRY_INTERVAL_MS`
  const value = positiveNumber(
    options.requestRetryIntervalMs ??
      options.retryIntervalMs ??
      process.env[sourceEnvKey] ??
      process.env.MARKET_TREND_RETRY_INTERVAL_MS,
    RETRY_INTERVAL_MS
  )
  return Math.min(30 * 1000, Math.floor(value))
}

function wait(ms, options = {}) {
  const duration = positiveNumber(ms, 0)
  if (duration <= 0) return Promise.resolve()
  if (typeof options.waitImpl === 'function') return options.waitImpl(duration)
  return new Promise((resolve) => setTimeout(resolve, duration))
}

function errorTypeFor(error = {}, fallback = '') {
  const message = String(error?.message || fallback || '')
  const name = String(error?.name || '')
  if (/HTTP\s+\d+/i.test(message)) return 'http'
  if (/abort|timeout|timed?\s*out/i.test(`${name} ${message}`)) return 'timeout'
  if (/解析|parse|未解析/.test(message)) return 'parse'
  return 'network'
}

function fetchFailureDetail({
  source,
  url,
  index = 0,
  error,
  message = '',
  errorType = '',
  attempts = 1,
  maxRetryCount = 0
}) {
  const text = String(message || error?.message || '采集失败').trim()
  const retryCount = Math.max(0, Number(attempts || 1) - 1)
  return {
    source,
    url,
    urlIndex: index + 1,
    message: text,
    errorType: errorType || errorTypeFor(error, text),
    retryCount,
    maxRetryCount,
    occurredAt: nowIso()
  }
}

function parseHeat(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const text = asText(value)
  if (!text) return fallback
  const yi = text.match(/([\d.]+)\s*亿/)
  if (yi) return Math.round(Number(yi[1]) * 100000000)
  const wan = text.match(/([\d.]+)\s*万/)
  if (wan) return Math.round(Number(wan[1]) * 10000)
  const clean = text.replace(/[^\d.]/g, '')
  const number = Number(clean)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}

function normalizeHeatScore(heatIndex, rank = 0) {
  const raw = parseHeat(heatIndex, 0)
  if (raw > 0) {
    return Math.max(1, Math.min(100, Math.round(Math.log10(raw + 1) * 16)))
  }
  if (rank > 0) return Math.max(1, 101 - rank)
  return 50
}

function stableTopicId(source, keyword) {
  const safe = `${source}_${keyword}`
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .slice(0, 80)
  return `hot_topic_${safe || randomUUID()}`
}

function normalizeTopic(raw = {}, source, fallback = {}) {
  const keyword = stripHtml(
    raw.keyword ||
      raw.word ||
      raw.name ||
      raw.title ||
      raw.query ||
      raw.hotword ||
      raw.desc ||
      raw.label ||
      fallback.keyword
  )
  if (!keyword) return null

  const title = stripHtml(raw.title || raw.name || raw.word || raw.keyword || keyword)
  const heatIndex =
    raw.heatIndex ??
    raw.hot ??
    raw.heat ??
    raw.hotValue ??
    raw.num ??
    raw.index ??
    raw.score ??
    raw.value ??
    raw.rankValue ??
    fallback.heatIndex
  const url = asText(
    raw.url || raw.link || raw.mobilUrl || raw.mobileUrl || raw.href || raw.sourceUrl
  )
  const rank = Number(raw.rank || raw.index || raw.no || fallback.rank || 0)
  const capturedAt = fallback.capturedAt || nowIso()
  const tags = Array.isArray(raw.tags)
    ? raw.tags
    : Array.isArray(fallback.tags)
      ? fallback.tags
      : []
  const sourceType = raw.sourceType || fallback.sourceType || ''
  const category = cleanReadableText(
    raw.category || raw.cat || raw.genre || fallback.category || ''
  )
  const author = cleanReadableText(raw.author || fallback.author || '')
  const intro = cleanReadableText(raw.intro || raw.summary || fallback.intro || '')
  return {
    id: asText(raw.id) || stableTopicId(source, keyword),
    source,
    keyword,
    title: title || keyword,
    url,
    heatIndex: parseHeat(heatIndex, rank ? Math.max(1, 100 - rank) : 0),
    normalizedHeat: normalizeHeatScore(heatIndex, rank),
    capturedAt,
    extra: {
      rank: Number.isFinite(rank) ? rank : 0,
      rawHeat: heatIndex == null ? '' : heatIndex,
      platform: fallback.platform || SOURCE_CONFIG[source]?.platform || source,
      sourceLabel: fallback.sourceLabel || SOURCE_CONFIG[source]?.label || source,
      category,
      author,
      intro,
      tags,
      sourceType,
      raw
    }
  }
}

function collectCandidateLists(payload, source, context = {}) {
  const lists = []
  const walk = (value, depth = 0, localContext = context) => {
    if (depth > 4 || value == null) return
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === 'object')) {
        lists.push({ rows: value, context: localContext })
      }
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item))
          walk(item, depth + 1, localContext)
      }
      return
    }
    if (typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const nextContext = {
        ...localContext,
        platform: localContext.platform || inferPlatformFromKey(key, source),
        category: localContext.category || inferCategoryFromKey(key)
      }
      if (Array.isArray(child)) {
        lists.push({ rows: child, context: nextContext })
      } else if (child && typeof child === 'object') {
        walk(child, depth + 1, nextContext)
      }
    }
  }
  walk(payload)
  return lists
}

function inferPlatformFromKey(key, source) {
  const lower = String(key || '').toLowerCase()
  const map = {
    weibo: '微博',
    baidu: '百度',
    zhihu: '知乎',
    douyin: '抖音',
    bilibili: 'B站',
    bilihot: 'B站',
    toutiao: '头条',
    hotsearch: SOURCE_CONFIG[source]?.platform || source
  }
  return map[lower] || ''
}

function inferCategoryFromKey(key) {
  const text = String(key || '')
  if (/movie|film|tv|影视|电影|剧/.test(text)) return '影视'
  if (/novel|book|小说|书/.test(text)) return '小说'
  if (/ent|娱乐|明星/.test(text)) return '娱乐'
  return ''
}

function extractTopics(payload, source, capturedAt = nowIso()) {
  const candidates = collectCandidateLists(payload, source)
  const topics = []
  for (const { rows, context } of candidates) {
    rows.forEach((row, index) => {
      if (row == null) return
      if (typeof row === 'string') {
        const topic = normalizeTopic({ keyword: row }, source, {
          ...context,
          rank: index + 1,
          capturedAt
        })
        if (topic) topics.push(topic)
        return
      }
      if (typeof row !== 'object') return
      const topic = normalizeTopic(row, source, {
        ...context,
        rank: index + 1,
        capturedAt
      })
      if (topic) topics.push(topic)
    })
  }
  return dedupeTopics(topics)
}

function dedupeTopics(topics) {
  const map = new Map()
  for (const topic of topics) {
    const key = `${topic.source}:${topic.keyword}`.toLowerCase()
    const existing = map.get(key)
    if (!existing || Number(topic.heatIndex || 0) > Number(existing.heatIndex || 0)) {
      map.set(key, topic)
    }
  }
  return Array.from(map.values())
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
  try {
    let response
    try {
      response = await (options.fetchImpl || fetch)(url, {
        method: 'GET',
        headers: requestHeaders(),
        signal: controller.signal
      })
    } catch (error) {
      if (options.fetchImpl) throw error
      return fetchWithNodeClient(url, options)
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    const text = decodeResponseBuffer(buffer, response.headers?.get?.('content-type') || '', url)
    try {
      return JSON.parse(text)
    } catch {
      return parsePublicPageToPayload(text, url)
    }
  } finally {
    clearTimeout(timer)
  }
}

function requestHeaders() {
  return {
    accept: 'application/json,text/html,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    'user-agent': 'Mozilla/5.0 DreamloomStudio MarketTrendService'
  }
}

function fetchWithNodeClient(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'http:' ? http : https
    const req = client.request(
      target,
      {
        method: 'GET',
        timeout: options.timeoutMs || REQUEST_TIMEOUT_MS,
        insecureHTTPParser: true,
        headers: requestHeaders()
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const status = response.statusCode || 0
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`))
            return
          }
          const buffer = Buffer.concat(chunks)
          const text = decodeResponseBuffer(buffer, response.headers['content-type'] || '', url)
          try {
            resolve(JSON.parse(text))
          } catch {
            resolve(parsePublicPageToPayload(text, url))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.end()
  })
}

function decodeResponseBuffer(buffer, contentType = '', url = '') {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('gb18030') || type.includes('gbk') || /\.jjwxc\.net/.test(url)) {
    return iconv.decode(buffer, 'gb18030')
  }
  return buffer.toString('utf8')
}

function parsePublicPageToPayload(html, url = '') {
  const source = sourceFromUrl(url)
  if (source === 'qidian') return parseQidianPayload(html, url)
  if (source === 'jjwxc') return parseJjwxcPayload(html, url)
  if (source === 'fanqie') return parseFanqiePayload(html, url)
  if (source === 'qimao') return parseQimaoPayload(html, url)
  if (source === 'aggregated') return parseAggregatedPayload(html, url)
  const $ = cheerio.load(String(html || ''))
  const rows = []
  $('script, style, noscript').remove()
  const title = stripHtml($('title').first().text())
  $(
    'a, li, .book-mid-info, .rank-view-list li, .rank-list li, .book-list li, .bookbox, .book-item, article'
  ).each((index, element) => {
    if (rows.length >= 60) return false
    const node = $(element)
    const link = node.is('a') ? node : node.find('a').first()
    const text = stripHtml(node.text())
    const name = stripHtml(
      link.text() || node.find('h2,h3,h4,.bookname,.book-name,.title').first().text()
    )
    const cleanTitle = name || text.split(/[。；\n]/)[0]
    if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.length > 80) return
    if (/登录|注册|充值|下载|客户端|用户协议|隐私|章节|目录|正文|阅读/.test(cleanTitle)) return
    const href = link.attr('href') || ''
    rows.push({
      title: cleanTitle,
      intro: text.slice(0, 160),
      url: href ? new URL(href, url).toString() : url,
      rank: index + 1
    })
  })
  return {
    title,
    data: rows,
    extra: {
      parsedFromPublicPage: true,
      sourceUrl: url
    }
  }
}

function sourceFromUrl(url = '') {
  if (/qidian\.com/.test(url)) return 'qidian'
  if (/jjwxc\.net/.test(url)) return 'jjwxc'
  if (/fanqienovel\.com/.test(url)) return 'fanqie'
  if (/qimao\.com/.test(url)) return 'qimao'
  if (/hewoyi\.com/.test(url)) return 'aggregated'
  return ''
}

function parseAggregatedPayload(html, url = '') {
  try {
    const parsed = JSON.parse(String(html || ''))
    if (parsed?.code && parsed.code !== 200 && !parsed.data) {
      return {
        data: [],
        extra: {
          sourceUrl: url,
          errorMessage: parsed.msg || parsed.message || '接口返回错误'
        }
      }
    }
    return parsed
  } catch {
    return { data: [] }
  }
}

function parseQidianPayload(html, url = '') {
  const text = String(html || '')
  const jsonText = text.match(
    /<script[^>]+id=["']vite-plugin-ssr_pageContext["'][^>]*>([\s\S]*?)<\/script>/i
  )?.[1]
  const rows = []
  if (jsonText) {
    try {
      const context = JSON.parse(jsonText)
      const records = context?.pageContext?.pageProps?.pageData?.records || []
      records.forEach((item, index) => {
        rows.push({
          title: item.bName,
          keyword: item.bName,
          url: item.bid ? `https://m.qidian.com/book/${item.bid}/` : url,
          rank: Number(item.rankNum || index + 1),
          heatIndex: item.rankCnt || '',
          author: item.bAuth || '',
          category: item.cat || item.subCat || '',
          intro: item.desc || '',
          tags: uniqueList([item.cat, item.subCat], 4),
          sourceType: 'novel_rank'
        })
      })
    } catch {
      // 使用下方 HTML 解析兜底。
    }
  }
  if (!rows.length) {
    const $ = cheerio.load(text)
    $('a[href*="/book/"]').each((index, element) => {
      const node = $(element)
      const title = stripHtml(
        node.find('h2,[class*="title"]').first().text() || node.attr('title') || ''
      ).replace(/最新章节在线阅读$/, '')
      if (!isGoodBookTitle(title)) return
      rows.push({
        title,
        keyword: title,
        url: new URL(node.attr('href') || '', url).toString(),
        rank: Number(node.find('[class*="ranking"]').first().text()) || index + 1,
        heatIndex: stripHtml(node.find('[class*="bookTitleR"]').first().text()),
        author: stripHtml(node.find('[class*="subTitle"]').first().text()).split('·')[0] || '',
        category: stripHtml(node.find('[class*="subTitle"]').first().text()).split('·')[1] || '',
        intro: stripHtml(node.find('[class*="bookDesc"]').first().text()),
        sourceType: 'novel_rank'
      })
    })
  }
  return publicPagePayload(text, url, rows)
}

function parseJjwxcPayload(html, url = '') {
  const $ = cheerio.load(String(html || ''))
  const rows = []
  $('a[href*="novelid="]').each((index, element) => {
    const link = $(element)
    const title = stripHtml(link.text()).replace(/^《|》$/g, '')
    if (!isGoodBookTitle(title)) return
    const rowText = stripHtml(link.closest('tr').text())
    const parts = rowText.replace(`《${title}》`, '').split(/\s+/).filter(Boolean)
    const category = rowText.match(/(言情|纯爱|衍生|轻小说)[-－][^\s]+/)?.[0] || ''
    rows.push({
      title,
      keyword: title,
      url: new URL(link.attr('href') || '', url).toString(),
      rank: index + 1,
      author: parts[0] || '',
      category,
      intro: rowText.slice(0, 180),
      tags: parts.filter((part) => /言情|纯爱|古代|现代|完结|连载|架空/.test(part)).slice(0, 4),
      sourceType: 'novel_rank'
    })
  })
  return publicPagePayload($.html(), url, rows)
}

function parseFanqiePayload(html, url = '') {
  const text = String(html || '')
  const rows = []
  const state = extractWindowState(text, 'window.__INITIAL_STATE__=')
  const books = state?.rank?.book_list || []
  const femaleCategories = state?.rank?.rankCategoryTypeList?.female || []
  const maleCategories = state?.rank?.rankCategoryTypeList?.male || []
  const categoryMap = new Map(
    [...femaleCategories, ...maleCategories].map((item) => [String(item.id), item.name])
  )
  ;[
    ...maleCategories.map((item) => ({ ...item, channel: '男频' })),
    ...femaleCategories.map((item) => ({ ...item, channel: '女频' }))
  ].forEach((item, index) => {
    rows.push({
      title: item.name,
      keyword: item.name,
      url: item.id ? `https://fanqienovel.com/rank/1_2_${item.id}` : url,
      rank: index + 1,
      heatIndex: Math.max(1, 120 - index),
      category: item.name,
      intro: `${item.channel}公开榜单分类：${item.name}`,
      tags: extractTagsFromText(item.name),
      sourceType: 'novel_rank'
    })
  })
  books.forEach((item, index) => {
    const category =
      item.category ||
      item.categoryV2 ||
      categoryMap.get(String(item.curent_category_id || item.pos_category_id || '')) ||
      ''
    rows.push({
      title: item.bookName,
      keyword: item.bookName,
      url: item.bookId ? `https://fanqienovel.com/page/${item.bookId}` : url,
      rank: Number(item.currentPos || index + 1),
      heatIndex: item.read_count || item.readCount || item.rankPosDiff || '',
      author: item.author || '',
      category,
      intro: item.abstract || '',
      tags: extractTagsFromText([category, item.abstract].join(' ')),
      sourceType: 'novel_rank'
    })
  })
  return publicPagePayload(text, url, rows)
}

function parseQimaoPayload(html, url = '') {
  const text = String(html || '')
  const $ = cheerio.load(text)
  const rows = []
  const nuxtList = extractQimaoListData(text)
  if (nuxtList.length) {
    nuxtList.forEach((item, index) => {
      const category = item.category2_name || item.category1_name || ''
      rows.push({
        title: item.title,
        keyword: item.title,
        url: item.book_url || (item.book_id ? `https://www.qimao.com/shuku/${item.book_id}/` : url),
        rank: index + 1,
        heatIndex: item.words_num || item.rank_num || '',
        author: item.author || '',
        category,
        intro: item.intro || '',
        tags: extractTagsFromText([category, item.intro].join(' ')),
        sourceType: 'novel_rank'
      })
    })
  }
  $('a[href^="https://www.qimao.com/shuku/"], a[href^="/shuku/"]').each((index, element) => {
    const link = $(element)
    const href = link.attr('href') || ''
    if (!/\/shuku\/\d+\/?$/.test(href)) return
    const title = stripHtml(
      link.find('h3,h4,[class*="title"],[class*="name"]').first().text() || link.text()
    )
    if (!isGoodBookTitle(title) || /^\d+$/.test(title)) return
    const cardText = stripHtml(
      link.closest('li,div[class*="book"],div[class*="item"],section,article').text() || link.text()
    )
    rows.push({
      title,
      keyword: title,
      url: new URL(href, url).toString(),
      rank: index + 1,
      heatIndex: cardText.match(/(\d+(?:\.\d+)?\s*(?:万|亿)?(?:人气|热度|点击|收藏)?)/)?.[1] || '',
      category:
        cardText.match(
          /(玄幻|都市|言情|悬疑|科幻|历史|古言|现言|甜宠|脑洞|总裁|种田|穿越|重生)/
        )?.[1] || '',
      intro: cardText.slice(0, 180),
      tags: extractTagsFromText(cardText),
      sourceType: /activity|征文|活动/.test(url + cardText) ? 'activity' : 'novel_rank'
    })
  })
  if (/\/activity\//.test(url)) {
    $('a[href*="/activity/"], li, article, section').each((index, element) => {
      const node = $(element)
      const text = stripHtml(node.text())
      const title = text.split(/[。；\n]/)[0]
      if (!/征文|活动|福利|投稿|签约|奖励|扶持/.test(text) || !title || title.length > 80) return
      const link = node.is('a') ? node : node.find('a').first()
      rows.push({
        title,
        keyword: title,
        url: link.attr('href') ? new URL(link.attr('href'), url).toString() : url,
        rank: index + 1,
        category: '作者活动',
        intro: text.slice(0, 200),
        tags: ['征文活动', ...extractTagsFromText(text)].slice(0, 6),
        sourceType: 'activity'
      })
    })
  }
  return publicPagePayload(text, url, rows)
}

function extractQimaoListData(text = '') {
  const marker = 'listData:['
  const start = String(text).indexOf(marker)
  if (start < 0) return []
  const arrayStart = start + 'listData:'.length
  let index = arrayStart
  let depth = 0
  let inString = false
  let escaped = false
  for (; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return parseJsLikeArray(text.slice(arrayStart, index + 1))
    }
  }
  return []
}

function parseJsLikeArray(arrayText = '') {
  const rows = []
  const objectTexts = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < arrayText.length; index += 1) {
    const char = arrayText[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) objectTexts.push(arrayText.slice(start, index + 1))
    }
  }
  for (const objectText of objectTexts) {
    const row = {}
    for (const key of [
      'book_id',
      'title',
      'book_url',
      'author',
      'category1_name',
      'category2_name',
      'words_num',
      'intro'
    ]) {
      const match = objectText.match(new RegExp(`${key}:"((?:\\\\.|[^"\\\\])*)"`))
      if (match) row[key] = unescapeJsString(match[1])
    }
    if (row.title) rows.push(row)
  }
  return rows
}

function unescapeJsString(value = '') {
  return String(value)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
}

function extractWindowState(text = '', marker = '') {
  const start = String(text).indexOf(marker)
  if (start < 0) return null
  let index = start + marker.length
  let depth = 0
  let inString = false
  let escaped = false
  for (; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start + marker.length, index + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function publicPagePayload(html = '', url = '', rows = []) {
  const $ = cheerio.load(String(html || ''))
  return {
    title: stripHtml($('title').first().text()),
    data: rows.filter((row) => isGoodBookTitle(row.title)).slice(0, 80),
    extra: {
      parsedFromPublicPage: true,
      sourceUrl: url
    }
  }
}

function isGoodBookTitle(title = '') {
  const text = stripHtml(title)
  if (!text || text.length < 2 || text.length > 80) return false
  if (
    /登录|注册|充值|下载|客户端|用户协议|隐私|章节|目录|正文|阅读|首页|分类|排行榜|帮助中心|作家助手|搜索|提交|举报|联系我们|版权|ICP备/.test(
      text
    )
  )
    return false
  if (/^[\d\s]+$/.test(text)) return false
  if (/[�]{2,}/.test(text)) return false
  if (/[\uE000-\uF8FF]/.test(text)) return false
  return /[\u4e00-\u9fa5]/.test(text)
}

function extractTagsFromText(text = '') {
  const tags = [
    '玄幻',
    '仙侠',
    '都市',
    '言情',
    '古言',
    '现言',
    '悬疑',
    '科幻',
    '历史',
    '脑洞',
    '系统',
    '重生',
    '穿越',
    '甜宠',
    '权谋',
    '宫斗',
    '娱乐圈',
    '种田',
    '末世',
    '灵异',
    '双强',
    '先婚后爱',
    '升级'
  ]
  return tags.filter((tag) => String(text || '').includes(tag)).slice(0, 8)
}

async function fetchSource(source, options = {}, booksDir = '') {
  const config = SOURCE_CONFIG[source]
  if (!config) return { source, success: false, topics: [], message: '未知信源' }
  const urls = sourceUrls(source)
  if (!urls.length) {
    return {
      source,
      success: false,
      skipped: true,
      topics: [],
      message: config.optional ? '未配置，已跳过' : '未配置采集地址',
      latencyMs: 0
    }
  }
  const cacheKey = `source:${source}`
  const cached = runtimeCache.get(cacheKey)
  if (
    !options.force &&
    options.runtimeCache !== false &&
    cached &&
    Date.now() - cached.createdAt < CACHE_TTL_MS
  ) {
    return { ...cached.result, fromCache: true, cacheType: 'memory' }
  }
  const stored = readSourceCache(booksDir, source, options)
  if (stored) {
    runtimeCache.set(cacheKey, { createdAt: Date.now(), result: stored })
    return stored
  }

  const failureDetails = []
  const allTopics = []
  const startedAt = Date.now()
  const requestedUrls = []
  const intervalMs = requestIntervalMs(source, options)
  const retryCount = requestRetryCount(source, options)
  const retryWaitMs = retryIntervalMs(source, options)
  let waitCount = 0
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]
    if (index > 0) {
      waitCount += 1
      await wait(intervalMs, options)
    }
    requestedUrls.push(url)
    let lastError = null
    let attempts = 0
    try {
      let payload
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        attempts = attempt + 1
        if (attempt > 0 && retryWaitMs > 0) {
          waitCount += 1
          await wait(retryWaitMs, options)
        }
        try {
          payload = await fetchJsonWithTimeout(url, options)
          lastError = null
          break
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
      const topics = extractTopics(payload, source, nowIso())
      if (topics.length) {
        allTopics.push(...topics.map((topic) => ({ ...topic, url: topic.url || url })))
        if (!['ikun', 'qidian', 'jjwxc', 'fanqie', 'qimao'].includes(source)) break
      } else {
        failureDetails.push(
          fetchFailureDetail({
            source,
            url,
            index,
            message: '未解析到热词',
            errorType: 'parse',
            attempts,
            maxRetryCount: retryCount
          })
        )
      }
    } catch (error) {
      failureDetails.push(
        fetchFailureDetail({
          source,
          url,
          index,
          error,
          attempts: retryCount + 1,
          maxRetryCount: retryCount
        })
      )
    }
  }

  const errors = failureDetails.map((item) => `${item.url}: ${item.message}`)
  const result = {
    source,
    success: allTopics.length > 0,
    topics: dedupeTopics(allTopics),
    message: allTopics.length ? '' : errors.join('；') || '采集失败',
    failures: failureDetails,
    sourceUrls: requestedUrls,
    fetchedAt: nowIso(),
    requestIntervalMs: intervalMs,
    retryCount,
    retryIntervalMs: retryWaitMs,
    waitCount,
    latencyMs: Date.now() - startedAt
  }
  runtimeCache.set(cacheKey, { createdAt: Date.now(), result })
  await writeSourceCache(booksDir, source, result, options)
  return result
}

function normalizeStoredTopic(raw = {}) {
  const topic = normalizeTopic(raw, raw.source || 'aggregated', {
    capturedAt: raw.capturedAt || raw.updatedAt || raw.createdAt || nowIso()
  })
  return {
    ...(topic || {}),
    ...raw,
    source: raw.source || topic?.source || 'aggregated',
    keyword: raw.keyword || topic?.keyword || '',
    title: raw.title || topic?.title || raw.keyword || '未命名热点',
    url: raw.url || '',
    heatIndex: parseHeat(raw.heatIndex, 0),
    normalizedHeat: Number.isFinite(Number(raw.normalizedHeat))
      ? Math.max(0, Math.min(100, Math.round(Number(raw.normalizedHeat))))
      : normalizeHeatScore(raw.heatIndex),
    capturedAt: raw.capturedAt || nowIso(),
    createdAt: raw.createdAt || raw.capturedAt || nowIso(),
    updatedAt: raw.updatedAt || raw.capturedAt || nowIso(),
    extra: raw.extra && typeof raw.extra === 'object' ? raw.extra : {}
  }
}

async function upsertHotTopics(booksDir, incoming = [], options = {}) {
  const now = nowIso()
  const replaceSources = new Set(
    Array.isArray(options.replaceSources) ? options.replaceSources : []
  )
  const rows = readRows(booksDir, HOT_TOPICS_FILE)
    .map(normalizeStoredTopic)
    .filter((row) => isValidTopic(row))
    .filter((row) => !replaceSources.has(row.source))
  const map = new Map(rows.map((row) => [`${row.source}:${row.keyword}`.toLowerCase(), row]))
  let inserted = 0
  let updated = 0
  for (const raw of incoming) {
    const topic = normalizeStoredTopic(raw)
    if (!topic.keyword) continue
    const key = `${topic.source}:${topic.keyword}`.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      map.set(key, {
        ...existing,
        ...topic,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now
      })
      updated += 1
    } else {
      map.set(key, {
        ...topic,
        id: topic.id || stableTopicId(topic.source, topic.keyword),
        createdAt: now,
        updatedAt: now
      })
      inserted += 1
    }
  }
  const items = Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(b.capturedAt || b.updatedAt || 0) - new Date(a.capturedAt || a.updatedAt || 0)
    )
    .slice(0, MAX_TOPIC_ROWS)
  await writeRows(booksDir, HOT_TOPICS_FILE, items)
  await updateTrendRecords(booksDir, incoming)
  return { inserted, updated, items }
}

function isValidTopic(row = {}) {
  if (!row.keyword || !row.title) return false
  if (!/[\u4e00-\u9fa5]/.test(`${row.keyword}${row.title}`)) return false
  if (
    /登录|注册|充值|下载|客户端|用户协议|隐私|章节|目录|正文|阅读|首页|分类|排行榜|帮助中心|作家助手|搜索|提交|举报|联系我们|版权|ICP备|最近更新 第/.test(
      row.keyword
    )
  ) {
    return false
  }
  if (/[�]{2,}/.test(`${row.keyword}${row.title}`)) return false
  if (/[\uE000-\uF8FF]/.test(`${row.keyword}${row.title}`)) return false
  return true
}

async function updateTrendRecords(booksDir, topics = []) {
  const rows = readRows(booksDir, TREND_RECORDS_FILE)
  const map = new Map(rows.map((row) => [String(row.keyword || '').toLowerCase(), row]))
  for (const topic of topics) {
    const keyword = String(topic.keyword || '').trim()
    if (!keyword) continue
    const key = keyword.toLowerCase()
    const existing = map.get(key) || {
      id: `trend_${randomUUID()}`,
      keyword,
      sources: [],
      trendSeries: [],
      updatedAt: nowIso()
    }
    const point = {
      timestamp: new Date(topic.capturedAt || nowIso()).getTime(),
      value: Number(topic.normalizedHeat || normalizeHeatScore(topic.heatIndex)),
      source: topic.source || 'aggregated'
    }
    const trendSeries = [...(existing.trendSeries || []), point]
      .filter((item) => Number.isFinite(Number(item.timestamp)))
      .slice(-MAX_SERIES_POINTS)
    map.set(key, {
      ...existing,
      keyword,
      sources: Array.from(new Set([...(existing.sources || []), topic.source].filter(Boolean))),
      trendSeries,
      updatedAt: nowIso()
    })
  }
  await writeRows(booksDir, TREND_RECORDS_FILE, Array.from(map.values()).slice(-MAX_TOPIC_ROWS))
}

async function updateSourceStatus(booksDir, results = []) {
  const rows = readRows(booksDir, SOURCE_STATUS_FILE)
  const map = new Map(rows.map((row) => [row.source, row]))
  for (const result of results) {
    const existing = map.get(result.source) || {
      source: result.source,
      label: SOURCE_CONFIG[result.source]?.label || result.source,
      successCount: 0,
      failureCount: 0,
      lastSuccessAt: '',
      lastFailureAt: '',
      lastMessage: '',
      lastLatencyMs: 0,
      updatedAt: ''
    }
    const success = Boolean(result.success)
    map.set(result.source, {
      ...existing,
      label: SOURCE_CONFIG[result.source]?.label || existing.label || result.source,
      successCount: existing.successCount + (success ? 1 : 0),
      failureCount: existing.failureCount + (!success && !result.skipped ? 1 : 0),
      skipped: Boolean(result.skipped),
      lastSuccessAt: success ? nowIso() : existing.lastSuccessAt,
      lastFailureAt: success || result.skipped ? existing.lastFailureAt : nowIso(),
      lastMessage: result.message || (success ? '采集成功' : '采集失败'),
      lastLatencyMs: result.latencyMs || 0,
      lastFailures: Array.isArray(result.failures) ? result.failures.slice(0, 8) : [],
      lastRetryCount: Number(result.retryCount || 0),
      updatedAt: nowIso()
    })
  }
  const items = Object.keys(SOURCE_CONFIG).map((source) => {
    return (
      map.get(source) || {
        source,
        label: SOURCE_CONFIG[source].label,
        successCount: 0,
        failureCount: 0,
        lastSuccessAt: '',
        lastFailureAt: '',
        lastMessage: SOURCE_CONFIG[source].optional ? '未配置时自动跳过' : '尚未采集',
        lastLatencyMs: 0,
        skipped: SOURCE_CONFIG[source].optional && sourceUrls(source).length === 0,
        updatedAt: ''
      }
    )
  })
  await writeRows(booksDir, SOURCE_STATUS_FILE, items)
  return items.map((item) => enrichSourceStatus(item))
}

async function appendCollectionLogs(booksDir, results = []) {
  const rows = readRows(booksDir, COLLECTION_LOGS_FILE)
  const logs = results.map((result) => ({
    id: `market_log_${randomUUID()}`,
    source: result.source,
    status: result.success ? 'success' : result.skipped ? 'skipped' : 'error',
    count: Array.isArray(result.topics) ? result.topics.length : 0,
    message: result.message || '',
    latencyMs: result.latencyMs || 0,
    sourceUrls: Array.isArray(result.sourceUrls) ? result.sourceUrls : sourceUrls(result.source),
    failures: Array.isArray(result.failures) ? result.failures.slice(0, 12) : [],
    fromCache: Boolean(result.fromCache),
    cacheType: result.cacheType || '',
    fetchedAt: result.fetchedAt || '',
    requestIntervalMs: result.requestIntervalMs || 0,
    retryCount: result.retryCount || 0,
    retryIntervalMs: result.retryIntervalMs || 0,
    waitCount: result.waitCount || 0,
    createdAt: nowIso()
  }))
  await writeRows(booksDir, COLLECTION_LOGS_FILE, [...logs, ...rows].slice(0, 500))
  return logs
}

export async function refreshHotTopics(booksDir, options = {}) {
  const cachePrune = await pruneSourceCache(booksDir, options)
  const sources = (
    Array.isArray(options.sources) && options.sources.length ? options.sources : DEFAULT_SOURCES
  )
    .map((source) => String(source || '').trim())
    .filter((source) => SOURCE_CONFIG[source])
  const results = []
  for (const source of sources) {
    results.push(await fetchSource(source, options, booksDir))
  }
  const topics = results.flatMap((result) => result.topics || [])
  const upsert = await upsertHotTopics(booksDir, topics, {
    replaceSources: results.filter((result) => result.success).map((result) => result.source)
  })
  const sourceStatus = await updateSourceStatus(booksDir, results)
  const collectionLogs = await appendCollectionLogs(booksDir, results)
  return {
    success: results.some((result) => result.success),
    sources,
    results,
    topics: upsert.items,
    inserted: upsert.inserted,
    updated: upsert.updated,
    sourceStatus,
    collectionLogs,
    cachePrune,
    message: results.some((result) => result.success)
      ? '热榜已刷新'
      : results
          .map((result) => result.message)
          .filter(Boolean)
          .join('；') || '热榜刷新失败'
  }
}

export function listHotTopics(booksDir, filter = {}) {
  const rows = readRows(booksDir, HOT_TOPICS_FILE).map(normalizeStoredTopic)
  const source = String(filter.source || '').trim()
  const keyword = String(filter.keyword || '')
    .trim()
    .toLowerCase()
  const limit = Math.max(1, Math.min(500, Number(filter.limit || filter.topN || 50)))
  return rows
    .filter(isValidTopic)
    .filter((row) => {
      if (source && source !== 'all' && row.source !== source) return false
      if (!keyword) return true
      return [row.keyword, row.title, row.extra?.platform, row.extra?.sourceLabel]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
    .sort((a, b) => {
      if (filter.sortBy === 'capturedAt') {
        return new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0)
      }
      return Number(b.normalizedHeat || 0) - Number(a.normalizedHeat || 0)
    })
    .slice(0, limit)
}

export function getTrendRecord(booksDir, keyword) {
  const key = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!key) return null
  return (
    readRows(booksDir, TREND_RECORDS_FILE).find(
      (row) => String(row.keyword || '').toLowerCase() === key
    ) || null
  )
}

export function listTrendRecords(booksDir, filter = {}) {
  const limit = Math.max(1, Math.min(100, Number(filter.limit || 20)))
  return readRows(booksDir, TREND_RECORDS_FILE)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, limit)
}

export async function listSourceStatus(booksDir) {
  const rows = readRows(booksDir, SOURCE_STATUS_FILE)
  if (rows.length) return rows.map((row) => enrichSourceStatus(row))
  return await updateSourceStatus(booksDir, [])
}

function trendScoreFor(record) {
  const series = Array.isArray(record?.trendSeries) ? record.trendSeries.slice(-8) : []
  if (series.length < 2) return 50
  const first = Number(series[0].value || 0)
  const last = Number(series.at(-1).value || 0)
  const values = series.map((item) => Number(item.value || 0))
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length
  return Math.max(0, Math.min(100, Math.round(50 + (last - first) * 1.4 - variance * 0.2)))
}

function clampScore(value, fallback = 50) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback
}

function normalizeChannel(value = 'all') {
  return ['all', 'male', 'female'].includes(value) ? value : 'all'
}

function channelMatches(itemChannel, filterChannel = 'all') {
  const channel = normalizeChannel(filterChannel)
  if (channel === 'all') return true
  return itemChannel === channel || itemChannel === 'all'
}

function scoreForChannel(itemChannel, filterChannel = 'all') {
  const channel = normalizeChannel(filterChannel)
  if (channel === 'all') return 80
  if (itemChannel === channel) return 100
  if (itemChannel === 'all') return 86
  return 36
}

function firstByChannel(values = [], fallback = 'all') {
  const list = Array.isArray(values) ? values : []
  if (list.includes(fallback)) return fallback
  return list[0] || fallback
}

function extractRawSourceType(topic = {}) {
  if (topic.extra?.sourceType) return topic.extra.sourceType
  const source = String(topic.source || '')
  if (['qidian', 'jjwxc', 'fanqie', 'qimao'].includes(source)) return 'novel_rank'
  if (source === 'rsshub') return 'rss'
  return 'hot_search'
}

function sourceStatusForTopic(topic = {}, sourceStatus = []) {
  const status = sourceStatus.find((item) => item.source === topic.source)
  if (!status) return 'empty'
  return status.status || sourceStatusValue(status)
}

function rawItemFromTopic(topic = {}, sourceStatus = []) {
  const rank = Number(topic.extra?.rank || 0)
  return {
    id:
      topic.id ||
      stableTopicId(topic.source || 'other', topic.keyword || topic.title || randomUUID()),
    source: topic.source || 'other',
    sourceType: extractRawSourceType(topic),
    title: topic.title || topic.keyword || '未命名热点',
    url: topic.url || '',
    rank,
    heatText: topic.extra?.rawHeat == null ? '' : String(topic.extra.rawHeat),
    heatValue: Number(topic.heatIndex || topic.normalizedHeat || 0),
    category: topic.extra?.category || '',
    author: topic.extra?.author || '',
    intro: topic.extra?.intro || '',
    tags: Array.isArray(topic.tags)
      ? topic.tags
      : Array.isArray(topic.extra?.tags)
        ? topic.extra.tags
        : [],
    platform:
      topic.extra?.platform || SOURCE_CONFIG[topic.source]?.platform || topic.source || '公开来源',
    rawPayload: topic.extra?.raw || topic,
    status: sourceStatusForTopic(topic, sourceStatus),
    fetchedAt: topic.capturedAt || topic.updatedAt || nowIso()
  }
}

function signalForTopic(topic = {}) {
  const text = [
    topic.keyword,
    topic.title,
    topic.extra?.category,
    topic.extra?.intro,
    ...(topic.extra?.tags || []),
    ...(topic.extra?.raw?.tags || [])
  ].join(' ')
  if (HARD_NEWS_PATTERN.test(text)) {
    return {
      signal: null,
      riskPenalty: 28
    }
  }
  const matches = NOVEL_SIGNAL_RULES.filter((rule) => rule.pattern.test(text))
  const signal = matches.sort(
    (a, b) => signalPriority(b, text, topic) - signalPriority(a, text, topic)
  )[0]
  return { signal: signal || null, riskPenalty: signal ? 0 : 30 }
}

function signalPriority(rule, text = '', topic = {}) {
  let score = 10
  const category = `${topic.extra?.category || ''} ${(topic.extra?.tags || []).join(' ')}`
  if (
    rule.key === 'historical_strategy' &&
    /历史|边关|边军|武夫|王朝|争霸|架空|将军|朝堂|沙场|烽火|北伐/.test(`${text} ${category}`)
  )
    score += 60
  if (
    rule.key === 'xianxia_upgrade' &&
    /玄幻|仙侠|修真|高武|神棺|潜龙|霸体|妖族|宗门|神通/.test(`${text} ${category}`)
  )
    score += 45
  if (
    rule.key === 'ancient_romance' &&
    /古言|言情|侯府|王爷|县主|赐婚|先婚后爱|双强|掌心|娇/.test(`${text} ${category}`)
  )
    score += 50
  if (
    rule.key === 'entertainment' &&
    /明星|演员|综艺|导演|票房|演唱会|粉丝|直播|金爵|歌手/.test(text)
  )
    score += 45
  if (rule.key === 'youth_growth' && /大学|高中|考试|学生|老师|毕业|考研|就业|校园|青春/.test(text))
    score += 40
  if (rule.key === 'body_health' && /医院|医生|健康|癌|病房|手术|怀孕|生育|坐月子/.test(text))
    score += 40
  if (rule.key === 'public_event' && /纪委|审计|秘书|官场|调查|案件|通报|真相/.test(text))
    score += 40
  return score
}

function insightTitle(signal, topic, channel) {
  const keyword = topic.keyword || topic.title || ''
  if (topic.extra?.sourceType === 'novel_rank' && keyword && isGoodBookTitle(keyword)) {
    return `${keyword}的可借鉴题材方向`
  }
  const preferred = {
    family_reversal: '被全网嘲的豪门弃妇靠商业系统翻身',
    wealth_power: '破产小老板靠未来订单反杀资本局',
    public_event: '被通报遗漏的证人追出城市真相',
    entertainment: '全网黑女演员靠直播事故翻身',
    tech_future: '破产程序员捡到十年后的芯片',
    youth_growth: '改志愿前夜她发现母亲的旧秘密',
    body_health: '病房醒来后她决定重排人生',
    power_strategy: '被全网误解的谈判专家直播反击',
    rebirth_palace: '重生嫡女先废婚约再夺权',
    xianxia_upgrade: '废柴少年靠禁忌传承逆势成圣',
    historical_strategy: '边关小卒从烽火台逆袭封侯',
    ancient_romance: '被赐婚那天她先赢下一局'
  }
  if (preferred[signal.key]) return preferred[signal.key]
  if (keyword) return `${keyword}衍生原创题材`
  return `${CHANNEL_LABELS[normalizeChannel(channel)]}原创题材方向`
}

function uniqueList(values = [], limit = 6) {
  return Array.from(
    new Set(
      values
        .flat()
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  ).slice(0, limit)
}

function buildBookIdeas(signal, title) {
  return uniqueList(signal.titleIdeas || [title, `${signal.label}之后`, `${signal.genre}新局`], 3)
}

function buildLoglineIdeas(signal, title) {
  return uniqueList(
    [
      ...(signal.loglineIdeas || []),
      `围绕“${title}”，写一个普通人被推入强冲突后反击的原创故事。`,
      `主角从一次误解或危机进入新局，用选择改变命运。`,
      `把公开热点变成虚构人物处境，保留情绪，不复述真实事件。`
    ],
    3
  )
}

function buildOpeningIdeas(signal) {
  return uniqueList(
    [
      ...(signal.openingIdeas || []),
      signal.hook,
      '所有人都以为主角已经输了，只有主角知道真正的证据还没亮出来。'
    ],
    3
  )
}

function buildInsightFromTopic(topic = {}, context = {}) {
  const trendMap = context.trendMap || new Map()
  const sourceStatus = context.sourceStatus || []
  const requestedChannel = normalizeChannel(context.channel || 'all')
  const { signal: matchedSignal, riskPenalty: baseRisk } = signalForTopic(topic)
  if (!matchedSignal) return null
  const signal = matchedSignal
  const channel = firstByChannel(signal.channels || ['all'], requestedChannel)
  const raw = rawItemFromTopic(topic, sourceStatus)
  const trendScore = trendScoreFor(trendMap.get(String(topic.keyword || '').toLowerCase()))
  const heatScore = clampScore(
    topic.normalizedHeat || normalizeHeatScore(topic.heatIndex, topic.extra?.rank),
    60
  )
  const novelizeScore = 88
  const channelFitScore = scoreForChannel(channel, requestedChannel)
  const riskPenalty = Math.max(
    baseRisk,
    HARD_NEWS_PATTERN.test(topic.keyword || topic.title || '') ? 24 : 0
  )
  const opportunityScore = clampScore(
    heatScore * 0.35 +
      trendScore * 0.25 +
      novelizeScore * 0.25 +
      channelFitScore * 0.15 -
      riskPenalty,
    60
  )
  const title = insightTitle(signal, topic, channel)
  const original = topic.title || topic.keyword || ''
  const openingIdeas = buildOpeningIdeas(signal)
  const tags = uniqueList(
    [
      channel === 'male' ? '男频' : channel === 'female' ? '女频' : '通用',
      signal.tags,
      raw.tags,
      signal.label,
      raw.platform
    ],
    8
  )
  return {
    id: `insight_${signal.key}_${String(topic.id || stableTopicId(topic.source || 'other', topic.keyword || title)).replace(/[^\w\u4e00-\u9fa5-]/g, '_')}`,
    rawIds: [raw.id].filter(Boolean),
    title,
    originalTitle: original,
    source: raw.platform || raw.source || '',
    sourceType: raw.sourceType,
    channel,
    channelLabel: CHANNEL_LABELS[channel],
    genre: signal.genre,
    tags,
    heatScore,
    growthScore: trendScore,
    opportunityScore,
    novelizeScore,
    riskPenalty,
    summary:
      raw.sourceType === 'novel_rank'
        ? `${raw.platform || '公开来源'}榜单作品“${original}”提供了${signal.genre}的热门写法，可提炼成原创方向。`
        : `${raw.platform || '公开来源'}出现“${topic.keyword || topic.title}”相关信号，可转成${signal.genre}方向。`,
    suitableWriting: `${signal.label} + ${signal.genre} + ${channel === 'male' ? '升级反击' : channel === 'female' ? '关系反转' : '悬念推进'}`,
    readerEmotion: uniqueList(signal.emotions || ['好奇', '期待', '爽感'], 4),
    storyPotential: raw.intro
      ? `${signal.hook} 参考公开简介中的题材信号：${raw.intro.slice(0, 70)}。`
      : signal.hook,
    conflict: signal.conflicts?.[0] || signal.hook,
    hook: openingIdeas[0],
    bookTitleIdeas: buildBookIdeas(signal, title),
    loglineIdeas: buildLoglineIdeas(signal, title),
    openingIdeas,
    sourceStatus: raw.status,
    sourceSummary: `${raw.platform || raw.source} · ${raw.rank ? `TOP${raw.rank}` : '公开热榜'} · ${raw.heatText || raw.heatValue || heatScore}`,
    createdAt: topic.createdAt || topic.capturedAt || nowIso(),
    updatedAt: topic.updatedAt || topic.capturedAt || nowIso(),
    rawPayload: raw
  }
}

function dedupeInsights(insights = []) {
  const byKey = new Map()
  for (const item of insights) {
    const key =
      item.sourceType === 'novel_rank' || item.sourceType === 'activity'
        ? `${item.channel}:${item.rawPayload?.source || item.source}:${item.originalTitle || item.title}`
        : `${item.channel}:${item.genre}:${item.title}`
    const old = byKey.get(key)
    if (!old || item.opportunityScore > old.opportunityScore) byKey.set(key, item)
  }
  return Array.from(byKey.values())
}

function diversifyInsights(insights = [], limit = 20) {
  const sorted = [...insights].sort((a, b) => b.opportunityScore - a.opportunityScore)
  const picked = []
  const genreCounts = new Map()
  for (const item of sorted) {
    const count = genreCounts.get(item.genre) || 0
    if (count >= 3 && picked.length < Math.min(limit, 8)) continue
    picked.push(item)
    genreCounts.set(item.genre, count + 1)
    if (picked.length >= limit) break
  }
  return picked
}

async function listMarketInsights(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const sourceStatus = await listSourceStatus(booksDir)
  const topics = await listHotTopics(booksDir, { source: filter.source || 'all', limit: 240 })
  const trendMap = new Map(
    (await listTrendRecords(booksDir, { limit: 240 })).map((row) => [
      String(row.keyword || '').toLowerCase(),
      row
    ])
  )
  const insights = topics
    .map((topic) => buildInsightFromTopic(topic, { channel, sourceStatus, trendMap }))
    .filter(Boolean)
  return diversifyInsights(
    dedupeInsights(insights).filter((item) => channelMatches(item.channel, channel)),
    Number(filter.limit || 30)
  )
}

function genreDistribution(insights = []) {
  const total = Math.max(1, insights.length)
  const map = new Map()
  for (const item of insights) {
    map.set(item.genre, (map.get(item.genre) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function opportunityGrade(insights = []) {
  const avg = insights.length
    ? insights.slice(0, 6).reduce((sum, item) => sum + Number(item.opportunityScore || 0), 0) /
      Math.min(6, insights.length)
    : 0
  if (avg >= 84) return 'A+'
  if (avg >= 74) return 'A'
  if (avg >= 62) return 'B'
  return 'C'
}

async function buildMarketOverview(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const directions = await listMarketInsights(booksDir, { ...filter, channel, limit: filter.limit || 24 })
  const sourceStatus = await listSourceStatus(booksDir)
  const selectedInsight = directions[0] || null
  return {
    success: true,
    channel,
    writableDirections: directions,
    opportunityIndex: {
      grade: opportunityGrade(directions),
      score: directions[0]?.opportunityScore || 0,
      summary: directions.length
        ? `${CHANNEL_LABELS[channel]}今日有 ${directions.length} 个可写方向，最高机会分 ${directions[0].opportunityScore}。`
        : '暂无可写方向，建议刷新后再看。'
    },
    genreDistribution: genreDistribution(directions),
    inspirationExpress: directions.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      channel: item.channel,
      genre: item.genre,
      tags: item.tags.slice(0, 4),
      score: item.opportunityScore,
      hook: item.hook,
      sourceStatus: item.sourceStatus
    })),
    selectedInsight,
    sourceStatus,
    lastUpdatedAt:
      directions[0]?.updatedAt ||
      sourceStatus.find((item) => item.lastSuccessAt)?.lastSuccessAt ||
      ''
  }
}

function buildSourceList(insights = [], sourceStatus = [], topics = []) {
  const sourceMap = new Map()
  const ensure = (source, label, status = 'empty') => {
    const old = sourceMap.get(source) || {
      source,
      label,
      count: 0,
      status,
      updatedAt: ''
    }
    sourceMap.set(source, old)
    return old
  }
  for (const status of sourceStatus) {
    ensure(status.source, status.label || status.source, status.status || sourceStatusValue(status))
    const row = sourceMap.get(status.source)
    row.updatedAt = status.lastSuccessAt || status.updatedAt || row.updatedAt
    row.message = status.lastMessage || ''
    row.isStale = Boolean(status.isStale)
    row.staleAfterMs = status.staleAfterMs
  }
  for (const topic of topics) {
    const source = topic.source || 'other'
    const row = ensure(
      source,
      SOURCE_CONFIG[source]?.label || topic.extra?.platform || source,
      sourceStatusForTopic(topic, sourceStatus)
    )
    row.count += 1
    row.updatedAt = topic.updatedAt || topic.capturedAt || row.updatedAt
  }
  for (const insight of insights) {
    const raw = insight.rawPayload || {}
    const source = raw.source || insight.source || 'other'
    const row = ensure(
      source,
      SOURCE_CONFIG[source]?.label || raw.platform || insight.source || source,
      insight.sourceStatus
    )
    if (!topics.length) row.count += 1
    row.status = strongerSourceStatus(row.status, insight.sourceStatus || 'empty')
    row.updatedAt = insight.updatedAt || row.updatedAt
  }
  for (const profile of PLATFORM_PROFILES) {
    const profileStatus = sourceStatus.find((item) => item.source === profile.source)
    const row = ensure(
      profile.source,
      profile.platform,
      profileStatus?.status || sourceStatusValue(profileStatus)
    )
    if (!topics.length)
      row.count += insights.filter((item) => {
        const raw = item.rawPayload || {}
        return raw.source === profile.source || raw.platform === profile.platform
      }).length
    row.message = profileStatus?.lastMessage || row.message || ''
  }
  return Array.from(sourceMap.values()).sort((a, b) => b.count - a.count)
}

async function buildHotRank(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const insights = await listMarketInsights(booksDir, {
    channel,
    source: filter.source || 'all',
    limit: 60
  })
  const sourceStatus = await listSourceStatus(booksDir)
  const source = String(filter.source || 'all')
  const topics = await listHotTopics(booksDir, { limit: 500 })
  const cards = insights
    .filter(
      (item) =>
        source === 'all' ||
        item.rawPayload?.source === source ||
        item.source === source ||
        item.rawPayload?.platform === source
    )
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      rawTitle: item.originalTitle || item.title,
      transferablePlot: item.storyPotential,
      readerPleasure: item.readerEmotion.join('、'),
      writableTypes: [item.genre, ...item.tags].slice(0, 5)
    }))
  return {
    success: true,
    channel,
    sources: buildSourceList(insights, sourceStatus, topics),
    items: cards,
    selectedItem: cards[0] || null,
    sourceStatus
  }
}

const KEYWORD_TYPE_RULES = [
  { type: 'emotion', pattern: /复仇|治愈|爽|遗憾|共情|压抑|反转|委屈|不甘|释然|心疼/ },
  {
    type: 'character',
    pattern: /弃妇|霸总|天才|废柴|主理人|谈判专家|病弱|女主|主角|老板|演员|程序员/
  },
  { type: 'genre', pattern: /豪门|系统|末世|宫斗|直播|娱乐圈|年代|都市|科幻|悬疑|古言|校园|短剧/ },
  { type: 'conflict', pattern: /背叛|封杀|误解|夺权|身份|资源|危机|反击|争夺|破产|离婚/ },
  { type: 'platform', pattern: /微博|百度|番茄|七猫|晋江|起点|短剧|知乎|B站|抖音/ }
]

function keywordType(word = '') {
  return KEYWORD_TYPE_RULES.find((rule) => rule.pattern.test(word))?.type || 'genre'
}

async function buildKeywordClusters(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const insights = await listMarketInsights(booksDir, { channel, limit: 80 })
  const map = new Map()
  for (const insight of insights) {
    for (const word of uniqueList(
      [insight.genre, insight.tags, insight.readerEmotion, insight.rawPayload?.platform],
      12
    )) {
      const old = map.get(word) || {
        id: `kw_${word}`,
        name: word,
        type: keywordType(word),
        heatScore: 0,
        growthScore: 0,
        channel: insight.channel,
        relatedKeywords: [],
        relatedInsightIds: []
      }
      old.heatScore = Math.max(old.heatScore, insight.heatScore)
      old.growthScore = Math.max(old.growthScore, insight.growthScore)
      old.relatedKeywords = uniqueList([...old.relatedKeywords, insight.tags], 8)
      old.relatedInsightIds = uniqueList([...old.relatedInsightIds, insight.id], 12)
      if (old.channel !== insight.channel) old.channel = 'all'
      map.set(word, old)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.heatScore + b.growthScore - (a.heatScore + a.growthScore))
    .slice(0, 36)
}

async function combinationDetailFromKeywords(booksDir, keywords = [], channel = 'all') {
  const normalizedKeywords = uniqueList(keywords, 5)
  const insights = await listMarketInsights(booksDir, { channel, limit: 80 })
  const matched =
    insights.find((item) =>
      normalizedKeywords.some((word) => item.tags.includes(word) || item.genre.includes(word))
    ) || insights[0]
  const title = normalizedKeywords.length
    ? `${normalizedKeywords.join(' + ')}`
    : matched
      ? `${matched.genre} + ${matched.tags.slice(1, 3).join(' + ')}`
      : ''
  if (!matched) {
    return {
      title,
      heatScore: 0,
      growthScore: 0,
      relatedKeywords: normalizedKeywords,
      writableDirections: [],
      recommendedCharacters: [],
      recommendedConflicts: [],
      readerPleasure: [],
      openingExample: '',
      novelizedResult: {
        direction: '',
        conflict: '',
        hook: ''
      },
      sourceInsightId: ''
    }
  }
  const baseTitle = matched.title
  return {
    title,
    heatScore: matched.heatScore,
    growthScore: matched.growthScore,
    relatedKeywords: uniqueList([normalizedKeywords, matched?.tags || []], 8),
    writableDirections: [baseTitle, ...(matched?.bookTitleIdeas || [])].slice(0, 4),
    recommendedCharacters: [
      channel === 'male' ? '背负债务的技术型男主' : '被轻视但清醒的女主',
      '掌握关键资源的对手',
      '表面站队错误的盟友'
    ],
    recommendedConflicts: uniqueList(
      [matched?.conflict, '身份反转引发资源争夺', '公众误解逼出主角反击'],
      4
    ),
    readerPleasure: uniqueList([matched?.readerEmotion || [], '反转', '爽感'], 5),
    openingExample:
      matched?.hook || '离婚当天，她被通知三小时内搬出别墅，但手机里多了一个品牌孵化系统。',
    novelizedResult: {
      direction: baseTitle,
      conflict: matched?.conflict || '前夫家族封杀 vs 女主用新消费品牌逆袭',
      hook: matched?.hook || '离婚当天，她被通知三小时内搬出别墅，但手机里多了一个品牌孵化系统。'
    },
    sourceInsightId: matched?.id || ''
  }
}

async function popularCombinations(booksDir, filter = {}) {
  const insights = await listMarketInsights(booksDir, { channel: filter.channel || 'all', limit: 12 })
  const combinations = []
  for (const [index, item] of insights.slice(0, 6).entries()) {
    const words = [item.genre, ...item.tags.slice(1, 3)]
    const detail = await combinationDetailFromKeywords(booksDir, words, filter.channel || 'all')
    combinations.push({
      id: `combo_${index + 1}`,
      keywords: uniqueList(words, 4),
      title: uniqueList(words, 4).join(' + '),
      heatScore: detail.heatScore,
      growthScore: detail.growthScore,
      direction: detail.novelizedResult.direction,
      trend: [34, 42 + index * 4, 48 + index * 5, 62 + index * 3, detail.growthScore]
    })
  }
  return combinations
}

async function buildKeywordCloud(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const clusters = await buildKeywordClusters(booksDir, { channel })
  const combinations = await popularCombinations(booksDir, { channel })
  const selected = combinations[0]?.keywords || clusters.slice(0, 3).map((item) => item.name)
  return {
    success: true,
    channel,
    keywordClusters: clusters,
    popularCombinations: combinations,
    defaultCombinationDetail: await combinationDetailFromKeywords(booksDir, selected, channel)
  }
}

function activityStatus(deadline) {
  if (!deadline) return 'unknown'
  const end = new Date(deadline).getTime()
  if (!Number.isFinite(end)) return 'unknown'
  const days = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'ended'
  if (days <= 7) return 'ending_soon'
  return 'ongoing'
}

function activityFromTopic(topic = {}, sourceStatus = []) {
  const text = [topic.keyword, topic.title, topic.extra?.intro, topic.extra?.category].join(' ')
  if (
    topic.extra?.sourceType !== 'activity' &&
    !/征稿|征文|投稿|比赛|大赛|扶持计划|作者福利|创作活动|签约政策/.test(text)
  )
    return null
  const title = cleanActivityTitle(topic.title || topic.keyword || '作者活动')
  if (!isUsefulActivityTitle(title, text)) return null
  const platform =
    topic.extra?.platform || SOURCE_CONFIG[topic.source]?.platform || topic.source || '公开来源'
  const rangeMatch = text.match(
    /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+((?:20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?))/
  )
  const deadlineMatch = text.match(/(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}月\d{1,2}日)/)
  const deadline = rangeMatch
    ? normalizeActivityDate(rangeMatch[1])
    : deadlineMatch
      ? normalizeActivityDate(deadlineMatch[1])
      : ''
  const tags = uniqueList([topic.extra?.tags || [], topic.extra?.category, platform], 6)
  const summary = cleanActivitySummary(topic.extra?.intro || text)
  return {
    id: `activity_${String(stableTopicId(topic.source || 'other', `${title}_${deadline || ''}`)).replace(/[^\w\u4e00-\u9fa5-]/g, '_')}`,
    platform,
    title,
    status: activityStatus(deadline),
    channel: inferActivityChannel(text, platform),
    genres: tags,
    tags,
    deadline,
    wordCountRequirement: extractWordCount(text),
    reward: extractReward(text),
    url: topic.url || '',
    summary: summary.slice(0, 180),
    recommendedDirection: buildActivityDirection(text, platform),
    fitScore: clampScore((topic.normalizedHeat || 55) + (/征稿|征文|投稿/.test(text) ? 12 : 0), 60),
    sourceStatus: sourceStatusForTopic(topic, sourceStatus),
    createdAt: topic.createdAt || topic.capturedAt || nowIso(),
    updatedAt: topic.updatedAt || topic.capturedAt || nowIso()
  }
}

function cleanActivityTitle(value = '') {
  return stripHtml(value)
    .replace(
      /\s*活动时间[:：]\s*20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?.*$/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanActivitySummary(value = '') {
  return stripHtml(value)
    .replace(
      /活动时间[:：]\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)(?:\s*活动时间[:：]\s*\1)+/g,
      '活动时间：$1'
    )
    .replace(
      /(活动时间[:：]\s*20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s+20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)\s+\1/g,
      '$1'
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsefulActivityTitle(title = '', text = '') {
  const cleanTitle = stripHtml(title)
  if (!cleanTitle || cleanTitle.length < 6) return false
  if (/^(征文活动|签约政策|作家专区|作者福利|福利政策)$/.test(cleanTitle)) return false
  return /征文|征稿|投稿|比赛|大赛|快闪|扶持|奖励|签约|活动时间|短篇|脑洞|投稿/.test(
    `${cleanTitle} ${text}`
  )
}

function normalizeActivityDate(value = '') {
  const text = String(value || '')
    .replace(/[年月/.]/g, '-')
    .replace(/日/g, '')
  if (/^\d{1,2}-\d{1,2}$/.test(text)) {
    const year = new Date().getFullYear()
    return new Date(`${year}-${text}`).toISOString()
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function inferActivityChannel(text = '', platform = '') {
  if (/女频|言情|晋江|现言|古言|甜宠|女性/.test(`${text} ${platform}`)) return 'female'
  if (/男频|玄幻|起点|升级|系统|都市/.test(`${text} ${platform}`)) return 'male'
  return 'all'
}

function extractWordCount(text = '') {
  const match = String(text).match(
    /(\d+(?:\.\d+)?\s*[万千kK]?\s*[-~至到]\s*\d+(?:\.\d+)?\s*[万千kK]?字|\d+(?:\.\d+)?\s*[万千kK]字)/
  )
  return match ? match[1].replace(/\s+/g, '') : ''
}

function extractReward(text = '') {
  const match = String(text).match(
    /(奖金[^，。；\n]{0,40}|奖励[^，。；\n]{0,40}|扶持[^，。；\n]{0,40}|流量[^，。；\n]{0,40})/
  )
  return match ? match[1] : ''
}

function buildActivityDirection(text = '', platform = '') {
  if (/短剧|IP|改编/.test(text)) return '适合先做强冲突短篇梗概，再扩展分集节奏。'
  if (/征稿|征文|投稿/.test(text))
    return `按 ${platform || '平台'} 公开要求提炼题材、字数和开篇方向。`
  return '请打开来源页确认细则后，再生成投稿方向。'
}

export async function buildRuleOpportunities(booksDir, filter = {}) {
  const limit = Math.max(1, Math.min(50, Number(filter.limit || 10)))
  const topics = await listHotTopics(booksDir, { limit: 200, source: filter.source || 'all' })
  const trendMap = new Map(
    (await listTrendRecords(booksDir, { limit: 200 })).map((row) => [
      String(row.keyword || '').toLowerCase(),
      row
    ])
  )
  const merged = new Map()
  for (const topic of topics) {
    const key = String(topic.keyword || '').toLowerCase()
    const row = merged.get(key) || {
      id: `opportunity_${randomUUID()}`,
      keyword: topic.keyword,
      summary: '',
      heatScore: 0,
      trendScore: 50,
      suggestion: '',
      sources: [],
      createdAt: nowIso()
    }
    row.heatScore = Math.max(row.heatScore, Number(topic.normalizedHeat || 0))
    row.trendScore = trendScoreFor(trendMap.get(key))
    row.sources = Array.from(new Set([...row.sources, topic.source]))
    row.summary = `来自 ${row.sources.join('、')} 的高频热词，当前热度 ${row.heatScore}。`
    row.suggestion = buildSuggestion(topic, row.trendScore)
    merged.set(key, row)
  }
  const rows = Array.from(merged.values())
    .sort((a, b) => b.heatScore + b.trendScore - (a.heatScore + a.trendScore))
    .slice(0, limit)
  await writeRows(booksDir, OPPORTUNITIES_FILE, rows)
  return rows
}

function buildSuggestion(topic, trendScore) {
  const keyword = topic.keyword || topic.title || '热点'
  const platform = topic.extra?.platform || SOURCE_CONFIG[topic.source]?.platform || topic.source
  const signal = matchNovelSignal(keyword)
  if (/短剧|反转|爽|复仇|豪门|重生|穿越/.test(keyword)) {
    return `可围绕“${keyword}”设计强钩子开篇，适合短篇、短剧感或快节奏连载。`
  }
  if (signal) {
    return `${signal.genre}方向：${signal.hook}`
  }
  if (/影视|电影|剧|综艺|明星|演员/.test(keyword)) {
    return `可把“${keyword}”转成娱乐圈、幕后行业或公众事件压力下的人物冲突。`
  }
  if (/AI|机器人|科技|芯片|游戏/.test(keyword)) {
    return `可从“${keyword}”延伸出近未来、职业升级或能力代价相关设定。`
  }
  if (trendScore >= 70) {
    return `“${keyword}”仍在升温，可尽快生成 3 个不同题材方向，先验证开篇吸引力。`
  }
  return `可把“${keyword}”当作人物处境或社会背景使用，避免直接复述新闻事件。来源：${platform}。`
}

function matchNovelSignal(keyword = '') {
  const text = String(keyword || '')
  if (HARD_NEWS_PATTERN.test(text)) return null
  return NOVEL_SIGNAL_RULES.find((rule) => rule.pattern.test(text)) || null
}

function analyzeNovelSignals(topics = []) {
  const map = new Map()
  for (const topic of topics) {
    if (HARD_NEWS_PATTERN.test(topic.keyword || topic.title || '')) continue
    const signal = matchNovelSignal(topic.keyword || topic.title)
    if (!signal) continue
    const row = map.get(signal.key) || {
      key: signal.key,
      label: signal.label,
      genre: signal.genre,
      hook: signal.hook,
      platforms: signal.platforms,
      heatScore: 0,
      count: 0,
      keywords: []
    }
    row.count += 1
    row.heatScore = Math.max(row.heatScore, Number(topic.normalizedHeat || 0))
    row.keywords = [...row.keywords, topic.keyword].filter(Boolean).slice(0, 8)
    map.set(signal.key, row)
  }
  const rows = Array.from(map.values())
    .map((row) => ({
      ...row,
      opportunityScore: Math.max(
        35,
        Math.min(100, Math.round(row.heatScore * 0.72 + row.count * 5))
      )
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
  return rows
}

function buildPlatformRankings(signals = [], topics = []) {
  return PLATFORM_PROFILES.map((profile) => {
    const matched = signals.filter(
      (signal) =>
        profile.genres.includes(signal.genre) || signal.platforms.includes(profile.platform)
    )
    const sourceTopics = topics.filter(
      (item) => item.source === profile.source || item.extra?.platform === profile.platform
    )
    const score = matched.length
      ? Math.max(...matched.map((item) => item.opportunityScore))
      : sourceTopics.length
        ? Math.max(...sourceTopics.map((item) => Number(item.normalizedHeat || 0)))
        : 0
    const keywords = matched.flatMap((item) => item.keywords).slice(0, 6)
    return {
      id: `platform_rank_${profile.platform}`,
      platform: profile.platform,
      boardName: profile.boardName,
      genres: profile.genres,
      readerNeed: profile.readerNeed,
      heatScore: score,
      trend: matched.length ? 'rising' : 'steady',
      keywords: keywords.length
        ? keywords
        : sourceTopics
            .map((item) => item.keyword)
            .filter(Boolean)
            .slice(0, 4),
      suggestion: matched[0]?.hook || profile.readerNeed
    }
  })
    .filter((item) => item.heatScore > 0 || item.keywords.length)
    .sort((a, b) => b.heatScore - a.heatScore)
}

async function buildActivities(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const sourceStatus = await listSourceStatus(booksDir)
  const topics = await listHotTopics(booksDir, { limit: 240 })
  const rows = topics
    .map((topic) => activityFromTopic(topic, sourceStatus))
    .filter(Boolean)
    .filter((item) => channelMatches(item.channel, channel))
    .sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0))
  const selected = rows[0] || null
  return {
    success: true,
    channel,
    activities: rows,
    selectedActivityDetail: selected
      ? {
          ...selected,
          ruleSummary: selected.summary,
          recommendedGenres: selected.categories || selected.genres || [],
          writingSuggestion: selected.recommendedDirection,
          matchedBooks: []
        }
      : null,
    matchedBooks: [],
    sourceStatus
  }
}

function buildAgentBrief(signals = [], rankings = [], activities = []) {
  const top = signals[0]
  if (!top) {
    return {
      title: 'Agent 等待更多小说信号',
      summary: '当前真实数据里还没有足够清楚的小说方向，请刷新或检查平台来源。',
      directions: [],
      actions: ['刷新热榜', '查看平台榜']
    }
  }
  return {
    title: `${top.genre}正在形成可写方向`,
    summary: `从 ${top.keywords.slice(0, 3).join('、')} 等热词看，${top.hook}`,
    directions: [
      {
        title: `${top.label}开篇`,
        hook: top.hook,
        platforms: top.platforms,
        keywords: top.keywords.slice(0, 5)
      },
      {
        title: `${rankings[0]?.platform || '番茄'}适配`,
        hook: rankings[0]?.suggestion || '开篇先给清楚冲突，再给人物选择。',
        platforms: [rankings[0]?.platform || '番茄'],
        keywords: rankings[0]?.keywords || []
      },
      {
        title: '活动投稿',
        hook: activities[0]?.requirementSummary || '把热词转成原创人物处境，不写新闻复述。',
        platforms: [activities[0]?.platform || '短剧'],
        keywords: activities[0]?.keywords || []
      }
    ],
    actions: ['生成选题卡', '引用到创作起笔', '存入知识库']
  }
}

function cleanOpportunityText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLlmOpportunityItems(parsed = [], base = []) {
  const map = new Map(base.map((item) => [cleanOpportunityText(item.keyword), item]))
  const rows = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const keyword = cleanOpportunityText(item.keyword)
    const old = map.get(keyword)
    if (!keyword || !old) continue
    const summary = cleanOpportunityText(item.summary)
    const suggestion = cleanOpportunityText(item.suggestion)
    if (!summary && !suggestion) continue
    rows.push({
      ...old,
      keyword,
      summary: summary || old.summary || '',
      suggestion: suggestion || old.suggestion || '',
      updatedAt: nowIso()
    })
  }
  return rows
}

export async function generateOpportunitiesWithLLM(booksDir, options = {}) {
  const provider = options.provider
  const base = await buildRuleOpportunities(booksDir, { limit: options.limit || 10 })
  if (!provider?.chat) {
    return {
      success: false,
      items: base,
      raw: '',
      fromLLM: false,
      message: '请先配置文本 AI 服务'
    }
  }
  const promptItems = base.map((item) => ({
    keyword: item.keyword,
    heatScore: item.heatScore,
    trendScore: item.trendScore,
    sources: item.sources
  }))
  try {
    const result = await provider.chat({
      messages: [
        {
          role: 'system',
          content:
            '你是中文小说市场观察助手。根据热点词给出简洁、原创、可写作的建议，不要复述原始数据。'
        },
        {
          role: 'user',
          content: `请基于这些热点输出 JSON 数组，每项包含 keyword、summary、suggestion：\n${JSON.stringify(promptItems, null, 2)}`
        }
      ],
      temperature: 0.55,
      max_tokens: 1600,
      requestId: `market_opportunities_${Date.now()}`
    })
    const parsed = parseJsonArray(result.content || '')
    if (!parsed.length) throw new Error('AI 返回内容无法解析')
    const items = normalizeLlmOpportunityItems(parsed, base)
    if (!items.length) throw new Error('AI 返回内容缺少可用机会建议')
    await writeRows(booksDir, OPPORTUNITIES_FILE, items)
    return {
      success: true,
      items,
      raw: result.content || '',
      usage: result.usage || {},
      fromLLM: true,
      providerId: result.providerId || provider.providerId || provider.id || '',
      model: result.model || provider.model || ''
    }
  } catch (error) {
    return {
      success: false,
      items: base,
      raw: '',
      fromLLM: false,
      message: error.message,
      providerId: provider.providerId || provider.id || '',
      model: provider.model || ''
    }
  }
}

function parseJsonArray(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (!match) return []
    try {
      const parsed = JSON.parse(match[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

export async function getMarketDashboard(booksDir, filter = {}) {
  const channel = normalizeChannel(filter.channel || 'all')
  const limit = Number(filter.limit || 30)
  const sourceStatus = await listSourceStatus(booksDir)
  const topics = await listHotTopics(booksDir, { source: filter.source || 'all', limit })
  const hotspots = topics
  const recentTrends = await listTrendRecords(booksDir, { limit: 12 })
  const topOpportunities = await buildRuleOpportunities(booksDir, {
    limit: filter.opportunityLimit || 10
  })
  const insights = await listMarketInsights(booksDir, { channel, source: filter.source || 'all', limit })
  const novelSignals = analyzeNovelSignals(hotspots).filter((item) => {
    const rule = NOVEL_SIGNAL_RULES.find((rule) => rule.key === item.key)
    return channelMatches(firstByChannel(rule?.channels || ['all'], channel), channel)
  })
  const platformRankings = buildPlatformRankings(novelSignals, hotspots)
  const activities = await buildActivities(booksDir, { ...filter, channel })
  const writerActivities = activities.activities || []
  const agentBrief = buildAgentBrief(novelSignals, platformRankings, writerActivities)
  const overview = await buildMarketOverview(booksDir, { ...filter, channel })
  const hotRank = await buildHotRank(booksDir, { ...filter, channel })
  const keywordCloud = await buildKeywordCloud(booksDir, { ...filter, channel })
  const lastUpdatedAt =
    hotspots[0]?.capturedAt ||
    sourceStatus.find((item) => item.lastSuccessAt)?.lastSuccessAt ||
    overview.lastUpdatedAt ||
    ''
  return {
    success: true,
    channel,
    hotspots,
    insights,
    topOpportunities,
    recentTrends,
    sourceStatus,
    novelSignals,
    platformRankings,
    writerActivities,
    agentBrief,
    overview,
    hotRank,
    keywordCloud,
    activities,
    lastUpdatedAt,
    nextRefreshAt: ''
  }
}

export async function startScheduler(getBooksDir, options = {}) {
  stopScheduler()
  const intervalMs = Math.max(
    60 * 1000,
    Number(options.intervalMs || process.env.MARKET_TREND_TICK_MS || 60 * 1000)
  )
  const lastRunAt = new Map()
  const tick = async () => {
    const booksDir = typeof getBooksDir === 'function' ? getBooksDir() : ''
    if (!booksDir) return
    const dueSources = DEFAULT_SOURCES.filter((source) => {
      const last = lastRunAt.get(source) || 0
      return Date.now() - last >= sourceIntervalMs(source)
    })
    if (!dueSources.length) return
    for (const source of dueSources) lastRunAt.set(source, Date.now())
    try {
      await refreshHotTopics(booksDir, { sources: dueSources })
    } catch (error) {
      console.warn('市场热点自动采集失败:', error.message)
    }
  }
  schedulerTimer = setInterval(tick, intervalMs)
  setTimeout(tick, Math.min(5000, intervalMs))
  return schedulerTimer
}

function sourceIntervalMs(source) {
  const envKey = `MARKET_TREND_${String(source || '').toUpperCase()}_MS`
  return Math.max(
    60 * 1000,
    Number(process.env[envKey] || SOURCE_CONFIG[source]?.intervalMs || 5 * 60 * 1000)
  )
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}

export const SOURCE_OPTIONS = Object.keys(SOURCE_CONFIG)

export default {
  SOURCE_OPTIONS,
  refreshHotTopics,
  listHotTopics,
  getTrendRecord,
  listTrendRecords,
  listSourceStatus,
  pruneSourceCache,
  buildRuleOpportunities,
  listMarketInsights,
  buildMarketOverview,
  buildHotRank,
  buildKeywordCloud,
  combinationDetailFromKeywords,
  buildActivities,
  generateOpportunitiesWithLLM,
  getMarketDashboard,
  startScheduler,
  stopScheduler
}

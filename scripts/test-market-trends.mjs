import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import iconv from 'iconv-lite'
import marketService from '../src/main/services/marketService.js'
import marketTrendService from '../src/main/services/marketTrendService.js'

const booksDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-'))

function writeMarketFile(root, fileName, value) {
  const marketDir = join(root, 'market')
  fs.mkdirSync(marketDir, { recursive: true })
  const content = typeof value === 'string' ? value : JSON.stringify(value)
  fs.writeFileSync(join(marketDir, fileName), content, 'utf8')
}

function response(data, ok = true, status = 200) {
  const text = JSON.stringify(data)
  return {
    ok,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    async text() {
      return text
    },
    async arrayBuffer() {
      return Buffer.from(text, 'utf8')
    }
  }
}

const calls = []
const waits = []
const fakeFetch = async (url) => {
  calls.push(url)
  if (url.includes('weibohot')) {
    return response({
      data: [
        { title: 'AI 短剧爆火', hot: '120万', url: 'https://example.com/a' },
        { title: 'AI 短剧爆火', hot: '100万', url: 'https://example.com/a2' }
      ]
    })
  }
  if (url.includes('baiduhot')) {
    return response({
      data: {
        list: [{ word: '重生题材热度上涨', heat: 880000, url: 'https://example.com/b' }]
      }
    })
  }
  return response({ message: 'bad' }, false, 500)
}

const first = await marketService.refreshMarketTrends(booksDir, {
  sources: ['weibo', 'baidu'],
  force: true,
  fetchImpl: fakeFetch,
  requestIntervalMs: 7,
  waitImpl: async (ms) => {
    waits.push(ms)
  }
})

assert.equal(first.success, true)
assert.equal(first.inserted, 2)
assert.equal(first.hotspotSync.inserted, 2)
assert.equal(
  first.results[0].sourceUrls.some((url) => url.includes('weibohot')),
  true
)
assert.equal(Boolean(first.results[0].fetchedAt), true)
assert.equal(first.results[0].requestIntervalMs, 7)
assert.equal(first.results[0].waitCount, 0)
assert.equal(first.collectionLogs[0].sourceUrls.length > 0, true)
assert.equal(first.collectionLogs[0].fromCache, false)
assert.equal(first.collectionLogs[0].requestIntervalMs, 7)
assert.equal(first.collectionLogs[0].waitCount, 0)

const callCountAfterFirst = calls.length
const cached = await marketService.refreshMarketTrends(booksDir, {
  sources: ['weibo'],
  runtimeCache: false,
  fetchImpl: async () => {
    throw new Error('persistent cache was not used')
  }
})

assert.equal(cached.success, true)
assert.equal(cached.results[0].fromCache, true)
assert.equal(cached.results[0].cacheType, 'persistent')
assert.equal(cached.collectionLogs[0].fromCache, true)
assert.equal(cached.collectionLogs[0].cacheType, 'persistent')
assert.equal(
  cached.collectionLogs[0].sourceUrls.some((url) => url.includes('weibohot')),
  true
)
assert.equal(cached.results[0].topics.length, 1)
assert.equal(calls.length, callCountAfterFirst)
assert.deepEqual(waits, [])

const memoryCached = await marketService.refreshMarketTrends(booksDir, {
  sources: ['weibo'],
  fetchImpl: async () => {
    throw new Error('runtime cache was not used')
  }
})
assert.equal(memoryCached.success, true)
assert.equal(memoryCached.results[0].fromCache, true)
assert.equal(memoryCached.results[0].cacheType, 'memory')

const second = await marketService.refreshMarketTrends(booksDir, {
  sources: ['weibo', 'baidu'],
  force: true,
  fetchImpl: fakeFetch
})

assert.equal(second.success, true)
assert.equal(second.inserted, 2)
assert.equal(second.updated, 0)

const topics = marketService.listHotTopics(booksDir, { limit: 10 })
assert.equal(topics.length, 2)
assert.equal(topics[0].keyword.length > 0, true)
assert.equal(
  marketService.listHotTopics(booksDir, {
    source: 'all',
    keyword: '短剧',
    sortBy: 'capturedAt',
    topN: 1
  })[0].keyword,
  'AI 短剧爆火'
)
assert.equal(marketService.listHotTopics(booksDir, { source: 'missing' }).length, 0)

const hotspots = marketService.listHotspots(booksDir, { sortBy: 'heat' })
assert.equal(hotspots.length, 2)
assert.equal(hotspots[0].tags.includes('自动采集'), true)

const trend = marketService.getTrendRecord(booksDir, 'AI 短剧爆火')
assert.equal(Boolean(trend?.trendSeries?.length), true)
assert.equal(marketService.getTrendRecord(booksDir, ' '), null)
assert.equal(marketService.listTrendRecords(booksDir, { limit: 1 }).length, 1)
assert.equal(marketService.listSourceStatus(booksDir).length > 0, true)

const failed = await marketService.refreshMarketTrends(booksDir, {
  sources: ['aggregated'],
  force: true,
  requestRetryCount: 1,
  retryIntervalMs: 5,
  waitImpl: async (ms) => {
    waits.push(ms)
  },
  fetchImpl: async () => response({}, false, 503)
})
assert.equal(failed.success, false)
assert.equal(Array.isArray(failed.topics), true)
assert.equal(failed.results[0].failures[0].errorType, 'http')
assert.equal(failed.results[0].failures[0].retryCount, 1)
assert.equal(failed.collectionLogs[0].failures[0].url.includes('hotlist'), true)
assert.equal(failed.collectionLogs[0].retryCount, 1)
assert.equal(
  failed.sourceStatus.find((item) => item.source === 'aggregated')?.lastFailures[0].errorType,
  'http'
)
assert.equal(waits.includes(5), true)

const parseFailed = await marketService.refreshMarketTrends(booksDir, {
  sources: ['baidu'],
  force: true,
  fetchImpl: async () => response({ data: [] })
})
assert.equal(parseFailed.success, false)
assert.equal(parseFailed.results[0].failures[0].errorType, 'parse')
assert.match(parseFailed.results[0].message, /未解析到热词/)

const timeoutFailed = await marketService.refreshMarketTrends(booksDir, {
  sources: ['baidu'],
  force: true,
  fetchImpl: async () => {
    const error = new Error('request timed out')
    error.name = 'AbortError'
    throw error
  }
})
assert.equal(timeoutFailed.success, false)
assert.equal(timeoutFailed.results[0].failures[0].errorType, 'timeout')

const sourceFormatsDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-sources-'))
const nestedSources = await marketService.refreshMarketTrends(sourceFormatsDir, {
  sources: ['aggregated', 'ikun'],
  force: true,
  requestIntervalMs: 0,
  fetchImpl: async (url) => {
    if (url.includes('hewoyi')) {
      return response({
        code: 200,
        data: {
          movieList: [
            '暑期电影票房刷新纪录',
            {
              name: '悬疑新剧开播',
              hotValue: '2.3亿',
              href: 'https://example.com/movie'
            },
            123,
            null
          ]
        }
      })
    }
    return response({
      data: {
        zhihu: [
          { query: '年轻人开始关注职业小说', score: '6.6万' },
          { label: '都市题材讨论升温', value: 3200 }
        ]
      }
    })
  }
})
assert.equal(nestedSources.success, true)
assert.equal(
  nestedSources.results.find((item) => item.source === 'aggregated')?.topics.length,
  2
)
assert.equal(
  nestedSources.results.find((item) => item.source === 'ikun')?.topics.some(
    (topic) => topic.extra.platform === '知乎'
  ),
  true
)

const skippedOptional = await marketService.refreshMarketTrends(booksDir, {
  sources: ['dailyhot'],
  force: true
})
assert.equal(skippedOptional.success, false)
assert.equal(skippedOptional.results[0].skipped, true)
assert.match(skippedOptional.results[0].message, /未配置/)

const unknownSources = await marketService.refreshMarketTrends(booksDir, {
  sources: ['missing', '', null],
  force: true
})
assert.equal(unknownSources.success, false)
assert.deepEqual(unknownSources.sources, [])
assert.match(unknownSources.message, /刷新失败/)

const cachePruneBooksDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-cache-'))
const pruneSeed = await marketService.refreshMarketTrends(cachePruneBooksDir, {
  sources: ['weibo'],
  force: true,
  fetchImpl: fakeFetch,
  cacheTtlMs: 1
})
assert.equal(pruneSeed.success, true)
await new Promise((resolve) => setTimeout(resolve, 10))
const pruneResult = marketService.pruneMarketSourceCache(cachePruneBooksDir, { cacheTtlMs: 1 })
assert.equal(pruneResult.checked, 1)
assert.equal(pruneResult.removed, 1)
assert.equal(pruneResult.kept, 0)
fs.rmSync(cachePruneBooksDir, { recursive: true, force: true })

const mixedCacheDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-cache-mixed-'))
const now = Date.now()
writeMarketFile(mixedCacheDir, 'source-cache.json', {
  items: [
    {
      source: 'weibo',
      createdAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      result: { success: true }
    },
    {
      source: 'weibo',
      createdAt: new Date(now - 2000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      result: { success: true }
    },
    {
      source: 'missing',
      createdAt: new Date(now).toISOString(),
      result: { success: true }
    },
    {
      source: 'baidu',
      createdAt: '',
      result: { success: true }
    },
    null
  ]
})
const mixedPrune = marketService.pruneMarketSourceCache(mixedCacheDir)
assert.deepEqual(
  { checked: mixedPrune.checked, kept: mixedPrune.kept, removed: mixedPrune.removed },
  { checked: 4, kept: 1, removed: 3 }
)
assert.equal(marketService.pruneMarketSourceCache('', {}).checked, 0)
assert.equal(
  marketService.pruneMarketSourceCache(mixedCacheDir, { persistentCache: false }).checked,
  0
)
fs.rmSync(mixedCacheDir, { recursive: true, force: true })

const qidianHtml = `
  <script id="vite-plugin-ssr_pageContext" type="application/json">
    {"pageContext":{"pageProps":{"pageData":{"records":[
      {"rankCnt":"9.8万月票","bName":"边关小卒","rankNum":1,"cat":"历史","subCat":"架空历史","bid":"1","bAuth":"作者甲","desc":"边关烽火里，小卒从烽火台起家。"},
      {"rankCnt":"7.2万月票","bName":"玄门镜仙","rankNum":2,"cat":"仙侠","subCat":"修真文明","bid":"2","bAuth":"作者乙","desc":"家族修仙，禁忌铜镜，少年求生。"}
    ]}}}}
  </script>
`

const htmlFetch = async (url) => {
  calls.push(url)
  if (url.includes('qidian')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      async arrayBuffer() {
        return Buffer.from(qidianHtml, 'utf8')
      }
    }
  }
  return response({}, false, 500)
}

const htmlResult = await marketService.refreshMarketTrends(booksDir, {
  sources: ['qidian'],
  force: true,
  fetchImpl: htmlFetch
})

assert.equal(htmlResult.success, true)
assert.equal(htmlResult.results[0].topics.length, 2)

const qidianTopics = marketService.listHotTopics(booksDir, { source: 'qidian', limit: 10 })
assert.equal(qidianTopics.length, 2)
assert.equal(qidianTopics[0].extra.category.length > 0, true)

const jjwxcHtml = `
  <html>
    <head><title>晋江文学城作品榜</title></head>
    <body>
      <table>
        <tr><td>作者春山 言情-近代现代 连载</td><td><a href="/onebook.php?novelid=901">《春山来信》</a></td></tr>
        <tr><td>作者秋水 纯爱-架空历史 完结</td><td><a href="/onebook.php?novelid=902">秋水长天</a></td></tr>
        <tr><td><a href="/onebook.php?novelid=903">登录</a></td></tr>
      </table>
    </body>
  </html>
`
const jjwxcResult = await marketService.refreshMarketTrends(sourceFormatsDir, {
  sources: ['jjwxc'],
  force: true,
  requestIntervalMs: 0,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=gb18030' },
    async arrayBuffer() {
      return iconv.encode(jjwxcHtml, 'gb18030')
    }
  })
})
assert.equal(jjwxcResult.success, true)
assert.equal(jjwxcResult.results[0].topics.length, 2)
assert.equal(jjwxcResult.results[0].topics[0].extra.sourceType, 'novel_rank')
assert.equal(
  marketService.listHotTopics(sourceFormatsDir, { source: 'jjwxc' }).some(
    (topic) => topic.keyword === '春山来信'
  ),
  true
)
fs.rmSync(sourceFormatsDir, { recursive: true, force: true })

const fanqieHtml = `
  <html>
    <head><title>番茄小说排行榜</title></head>
    <body>
      <script>
        window.__INITIAL_STATE__={"rank":{"book_list":[
          {"bookName":"逆光短剧师","bookId":"701","currentPos":1,"read_count":"268万","author":"云灯","category":"都市脑洞","abstract":"短剧编剧拿到 AI 剪辑系统，从烂尾项目翻身。"},
          {"bookName":"重生后我在番茄写悬疑","bookId":"702","currentPos":2,"readCount":"96万","author":"木舟","categoryV2":"悬疑","abstract":"女主重生回投稿前夜，发现每本书都在预告真案。"}
        ],"rankCategoryTypeList":{"male":[{"id":257,"name":"都市"}],"female":[{"id":262,"name":"现言"}]}}};
      </script>
    </body>
  </html>
`

const qimaoHtml = `
  <html>
    <head><title>七猫排行榜</title></head>
    <body>
      <script>
        window.__NUXT__={state:{rank:{listData:[
          {book_id:"801",title:"七猫惊雷榜",author:"海声",category1_name:"玄幻",category2_name:"东方玄幻",words_num:"158万字",intro:"边城少年借雷法破局。"},
          {book_id:"802",title:"她在雨夜归来",author:"南桥",category1_name:"现代言情",category2_name:"甜宠",words_num:"88万字",intro:"失踪三年后，她带着真相回到雨夜。"}
        ]}}};
      </script>
      <a href="/shuku/803/"><h3>纸上星河</h3><p>科幻 星际 热度 23万</p></a>
    </body>
  </html>
`

const publicNovelFetch = async (url) => {
  calls.push(url)
  if (url.includes('fanqienovel')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      async arrayBuffer() {
        return Buffer.from(fanqieHtml, 'utf8')
      }
    }
  }
  if (url.includes('qimao')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      async arrayBuffer() {
        return Buffer.from(qimaoHtml, 'utf8')
      }
    }
  }
  return response({}, false, 500)
}

const waitsBeforePublicNovel = waits.length
const publicNovelResult = await marketService.refreshMarketTrends(booksDir, {
  sources: ['fanqie', 'qimao'],
  force: true,
  fetchImpl: publicNovelFetch,
  requestIntervalMs: 11,
  waitImpl: async (ms) => {
    waits.push(ms)
  }
})

assert.equal(publicNovelResult.success, true)
assert.equal(
  publicNovelResult.results.find((item) => item.source === 'fanqie')?.topics.length >= 2,
  true
)
assert.equal(
  publicNovelResult.results.find((item) => item.source === 'qimao')?.topics.length >= 2,
  true
)
assert.equal(
  publicNovelResult.collectionLogs.some(
    (item) => item.source === 'fanqie' && item.sourceUrls.length > 0
  ),
  true
)
assert.equal(
  publicNovelResult.collectionLogs.some(
    (item) => item.source === 'qimao' && item.sourceUrls.length > 0
  ),
  true
)
assert.equal(
  waits.slice(waitsBeforePublicNovel).every((ms) => ms === 11),
  true
)
assert.equal(
  publicNovelResult.collectionLogs.some(
    (item) => item.waitCount > 0 && item.requestIntervalMs === 11
  ),
  true
)

const fanqieTopics = marketService.listHotTopics(booksDir, { source: 'fanqie', limit: 10 })
assert.equal(
  fanqieTopics.some((topic) => topic.keyword === '逆光短剧师'),
  true
)
assert.equal(fanqieTopics.find((topic) => topic.keyword === '逆光短剧师')?.extra.author, '云灯')

const qimaoTopics = marketService.listHotTopics(booksDir, { source: 'qimao', limit: 10 })
assert.equal(
  qimaoTopics.some((topic) => topic.keyword === '七猫惊雷榜'),
  true
)
assert.equal(
  qimaoTopics.find((topic) => topic.keyword === '七猫惊雷榜')?.extra.category,
  '东方玄幻'
)

const maleOverview = marketService.getMarketOverview(booksDir, { channel: 'male', limit: 10 })
assert.equal(maleOverview.writableDirections.length > 0, true)
const dashboard = marketService.getMarketDashboard(booksDir, {
  channel: 'female',
  source: 'all',
  limit: 6,
  opportunityLimit: 2
})
assert.equal(dashboard.success, true)
assert.equal(dashboard.channel, 'female')
assert.equal(Array.isArray(dashboard.insights), true)
assert.equal(Array.isArray(dashboard.sourceStatus), true)
assert.equal(typeof dashboard.keywordCloud, 'object')

const emptyBooksDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-empty-'))
const emptyOverview = marketService.getMarketOverview(emptyBooksDir, { channel: 'all' })
const emptyCloud = marketService.getMarketKeywordCloud(emptyBooksDir, { channel: 'all' })
assert.equal(emptyOverview.writableDirections.length, 0)
assert.equal(emptyCloud.popularCombinations.length, 0)
assert.equal(marketTrendService.listHotTopics(emptyBooksDir).length, 0)
assert.equal(marketTrendService.listTrendRecords(emptyBooksDir).length, 0)
assert.equal(marketTrendService.getTrendRecord(emptyBooksDir, '不存在'), null)
assert.equal(marketTrendService.listSourceStatus(emptyBooksDir).length, 10)
assert.equal(marketTrendService.buildRuleOpportunities(emptyBooksDir).length, 0)
const emptyRank = marketTrendService.buildHotRank(emptyBooksDir, {
  channel: 'invalid-channel'
})
assert.equal(emptyRank.channel, 'all')
assert.equal(emptyRank.items.length, 0)
assert.equal(emptyRank.selectedItem, null)
const emptyCombination = marketTrendService.combinationDetailFromKeywords(
  emptyBooksDir,
  ['悬疑'],
  'male'
)
assert.equal(emptyCombination.title, '悬疑')
assert.equal(emptyCombination.writableDirections.length, 0)
assert.equal(emptyCombination.sourceInsightId, '')
const emptyActivities = marketTrendService.buildActivities(emptyBooksDir, {
  channel: 'female'
})
assert.equal(emptyActivities.activities.length, 0)
assert.equal(emptyActivities.selectedActivityDetail, null)
const emptyDashboard = marketTrendService.getMarketDashboard(emptyBooksDir, {
  channel: 'invalid-channel'
})
assert.equal(emptyDashboard.channel, 'all')
assert.equal(emptyDashboard.agentBrief.directions.length, 0)
assert.equal(emptyDashboard.lastUpdatedAt, '')
fs.rmSync(emptyBooksDir, { recursive: true, force: true })

const scenarioDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-scenarios-'))
const scenarioNow = new Date().toISOString()
const soonDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)
const scenarioTopics = [
  ['weibo', '豪门弃妇离婚后直播复仇', '都市'],
  ['baidu', '破产老板靠股票和投资翻身', '都市'],
  ['aggregated', '警方通报失踪案件真相', '悬疑'],
  ['weibo', '全网黑女演员直播翻盘', '娱乐圈'],
  ['baidu', 'AI 芯片机器人改变游戏行业', '科幻'],
  ['aggregated', '高中学生高考改志愿', '青春'],
  ['weibo', '医院医生手术后重排人生', '现实'],
  ['baidu', '谈判专家面对制裁布局反击', '都市'],
  ['qimao', '重生嫡女回侯府宫斗', '古言'],
  ['qidian', '玄幻宗门废柴修真成圣', '玄幻'],
  ['qidian', '边关小卒在烽火中封侯', '架空历史'],
  ['jjwxc', '赐婚县主与王爷先婚后爱', '古言'],
  ['rsshub', '特朗普与外交部举行会晤', '新闻']
].map(([source, keyword, category], index) => ({
  id: `scenario-${index}`,
  source,
  keyword,
  title: keyword,
  heatIndex: 1000 - index * 20,
  normalizedHeat: 90 - index,
  capturedAt: scenarioNow,
  createdAt: scenarioNow,
  updatedAt: scenarioNow,
  tags: index === 0 ? ['反转', '直播'] : undefined,
  extra: {
    category,
    rank: index + 1,
    rawHeat: `${100 - index}万`,
    author: `作者${index}`,
    intro: `${keyword}的公开作品简介。`,
    platform:
      source === 'qidian'
        ? '起点'
        : source === 'qimao'
          ? '七猫'
          : source === 'jjwxc'
            ? '晋江'
            : '',
    sourceType: ['qidian', 'qimao', 'jjwxc'].includes(source) ? 'novel_rank' : undefined
  }
}))
scenarioTopics.push(
  {
    id: 'activity-ended',
    source: 'fanqie',
    keyword: '短篇征稿活动',
    title: '短篇征稿活动',
    heatIndex: 80,
    normalizedHeat: 80,
    capturedAt: scenarioNow,
    extra: {
      sourceType: 'activity',
      platform: '番茄',
      category: '女频现言',
      tags: ['短篇', '现言'],
      intro: '活动时间：2020-01-01 2020-02-01，征稿 1万-3万字，奖金 5 万元。'
    }
  },
  {
    id: 'activity-soon',
    source: 'qidian',
    keyword: '玄幻投稿比赛',
    title: '玄幻投稿比赛',
    heatIndex: 75,
    normalizedHeat: 75,
    capturedAt: scenarioNow,
    extra: {
      platform: '起点',
      category: '男频玄幻',
      intro: `投稿截止 ${soonDeadline}，要求 5 万字，流量扶持。`
    }
  },
  {
    id: 'activity-unknown',
    source: 'dailyhot',
    keyword: '脑洞创作活动',
    title: '脑洞创作活动',
    heatIndex: 70,
    normalizedHeat: 70,
    capturedAt: scenarioNow,
    extra: {
      platform: '短剧',
      intro: '面向原创作者的脑洞活动，具体日期见来源页。'
    }
  },
  {
    id: 'activity-invalid',
    source: 'dailyhot',
    keyword: '征文活动',
    title: '征文活动',
    heatIndex: 60,
    normalizedHeat: 60,
    capturedAt: scenarioNow,
    extra: { sourceType: 'activity' }
  }
)
writeMarketFile(scenarioDir, 'hot-topics.json', { items: scenarioTopics })
writeMarketFile(scenarioDir, 'trend-records.json', {
  items: scenarioTopics.slice(0, 4).map((topic, index) => ({
    keyword: topic.keyword,
    updatedAt: scenarioNow,
    trendSeries: [
      { timestamp: 1, value: index === 0 ? 90 : 20 },
      { timestamp: 2, value: index === 0 ? 30 : 85 }
    ]
  }))
})
writeMarketFile(scenarioDir, 'source-status.json', {
  items: [
    { source: 'weibo', label: '微博', lastSuccessAt: scenarioNow },
    {
      source: 'baidu',
      label: '百度',
      lastFailureAt: scenarioNow,
      lastMessage: '临时失败'
    },
    { source: 'qidian', label: '起点', lastSuccessAt: '2020-01-01T00:00:00.000Z' },
    { source: 'dailyhot', label: 'DailyHot', skipped: true }
  ]
})

const allInsights = marketTrendService.listMarketInsights(scenarioDir, {
  channel: 'all',
  limit: 50
})
assert.equal(allInsights.length >= 10, true)
assert.equal(allInsights.some((item) => item.genre === '历史权谋'), true)
assert.equal(allInsights.some((item) => item.genre === '古言权谋'), true)
assert.equal(allInsights.some((item) => item.genre === '玄幻仙侠'), true)
assert.equal(allInsights.some((item) => item.originalTitle.includes('特朗普')), false)
assert.equal(
  allInsights.find((item) => item.originalTitle.includes('边关小卒'))?.sourceType,
  'novel_rank'
)

const maleScenario = marketTrendService.buildMarketOverview(scenarioDir, {
  channel: 'male',
  limit: 50
})
const femaleScenario = marketTrendService.buildMarketOverview(scenarioDir, {
  channel: 'female',
  limit: 50
})
assert.equal(maleScenario.writableDirections.some((item) => item.channel === 'male'), true)
assert.equal(femaleScenario.writableDirections.some((item) => item.channel === 'female'), true)
assert.equal(maleScenario.opportunityIndex.score > 0, true)

const sourceRank = marketTrendService.buildHotRank(scenarioDir, {
  channel: 'all',
  source: 'qidian'
})
assert.equal(sourceRank.items.length > 0, true)
assert.equal(sourceRank.items.every((item) => item.rawPayload.source === 'qidian'), true)
assert.equal(sourceRank.sources.some((item) => item.status === 'stale'), true)
assert.equal(sourceRank.sources.some((item) => item.status === 'error'), true)

const scenarioCloud = marketTrendService.buildKeywordCloud(scenarioDir, { channel: 'female' })
assert.equal(scenarioCloud.keywordClusters.length > 0, true)
assert.equal(scenarioCloud.popularCombinations.length > 0, true)
const blankCombination = marketTrendService.combinationDetailFromKeywords(
  scenarioDir,
  [],
  'female'
)
assert.equal(blankCombination.writableDirections.length > 0, true)
const knownCombination = marketTrendService.combinationDetailFromKeywords(
  scenarioDir,
  ['古言', '反转'],
  'female'
)
assert.equal(knownCombination.title, '古言 + 反转')

const scenarioActivities = marketTrendService.buildActivities(scenarioDir, { channel: 'all' })
assert.equal(scenarioActivities.activities.length, 3)
assert.equal(scenarioActivities.activities.some((item) => item.status === 'ended'), true)
assert.equal(scenarioActivities.activities.some((item) => item.status === 'ending_soon'), true)
assert.equal(scenarioActivities.activities.some((item) => item.status === 'unknown'), true)
assert.equal(scenarioActivities.activities.some((item) => item.channel === 'female'), true)
assert.equal(scenarioActivities.activities.some((item) => item.channel === 'male'), true)
assert.equal(scenarioActivities.activities.some((item) => item.wordCountRequirement), true)
assert.equal(scenarioActivities.activities.some((item) => item.reward), true)

const scenarioDashboard = marketTrendService.getMarketDashboard(scenarioDir, {
  channel: 'male',
  source: 'all',
  limit: 50
})
assert.equal(scenarioDashboard.agentBrief.directions.length, 3)
assert.equal(scenarioDashboard.platformRankings.length > 0, true)
assert.equal(scenarioDashboard.novelSignals.length > 0, true)
fs.rmSync(scenarioDir, { recursive: true, force: true })

const fakeTextProvider = {
  id: 'fake-market-provider',
  providerId: 'fake-market-provider',
  model: 'fake-market-model',
  async chat() {
    return {
      content: JSON.stringify([
        {
          keyword: 'AI 短剧爆火',
          summary: '短剧热词和技术话题同时出现，适合做强冲突开篇。',
          suggestion: '设计一个被迫接手失败短剧项目的主角，用技术能力翻盘。'
        }
      ]),
      usage: { total_tokens: 88 },
      providerId: 'fake-market-provider',
      model: 'fake-market-model'
    }
  }
}

const llmOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  limit: 5,
  provider: fakeTextProvider
})
assert.equal(llmOpportunities.success, true)
assert.equal(llmOpportunities.fromLLM, true)
assert.equal(llmOpportunities.providerId, 'fake-market-provider')
assert.equal(llmOpportunities.model, 'fake-market-model')
assert.deepEqual(llmOpportunities.usage, { total_tokens: 88 })
assert.equal(llmOpportunities.items[0].suggestion.includes('翻盘'), true)

const fencedProvider = {
  providerId: 'fenced-provider',
  model: 'fenced-model',
  async chat() {
    return {
      content: `\`\`\`json
{"items":[{"keyword":"AI 短剧爆火","summary":"热度持续。","suggestion":"改写为虚构行业故事。"}]}
\`\`\``
    }
  }
}
const fencedOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  provider: fencedProvider
})
assert.equal(fencedOpportunities.success, true)
assert.equal(fencedOpportunities.items[0].keyword, 'AI 短剧爆火')

const partialProvider = {
  id: 'partial-provider',
  async chat() {
    return {
      content: JSON.stringify({
        items: [
          null,
          [],
          {
            keyword: 'AI 短剧爆火',
            summary: '只返回摘要。'
          },
          {
            keyword: '重生题材热度上涨',
            suggestion: '只返回建议。'
          }
        ]
      })
    }
  }
}
const partialOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  provider: partialProvider
})
assert.equal(partialOpportunities.success, true)
assert.equal(partialOpportunities.providerId, 'partial-provider')
assert.equal(partialOpportunities.items[0].summary, '只返回摘要。')
assert.equal(Boolean(partialOpportunities.items[0].suggestion), true)
assert.equal(partialOpportunities.items[1].suggestion, '只返回建议。')
assert.equal(Boolean(partialOpportunities.items[1].summary), true)

const embeddedArrayProvider = {
  providerId: 'embedded-provider',
  async chat() {
    return {
      content:
        '模型说明：以下为结果。\\n[{"keyword":"AI 短剧爆火","summary":"仍有讨论。","suggestion":"设计原创人物冲突。"}]\\n结束。'
    }
  }
}
assert.equal(
  (
    await marketService.generateMarketOpportunities(booksDir, {
      provider: embeddedArrayProvider
    })
  ).success,
  true
)

const unparsableProvider = {
  providerId: 'unparsable-provider',
  async chat() {
    return { content: '没有可解析的 JSON 数据' }
  }
}
const unparsableOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  provider: unparsableProvider
})
assert.equal(unparsableOpportunities.success, false)
assert.match(unparsableOpportunities.message, /无法解析/)

const malformedArrayProvider = {
  providerId: 'malformed-array-provider',
  async chat() {
    return { content: '说明：[{"keyword":}] 结束' }
  }
}
const malformedArrayOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  provider: malformedArrayProvider
})
assert.equal(malformedArrayOpportunities.success, false)
assert.match(malformedArrayOpportunities.message, /无法解析/)

const badTextProvider = {
  id: 'bad-market-provider',
  providerId: 'bad-market-provider',
  model: 'bad-market-model',
  async chat() {
    return {
      content: JSON.stringify([
        {
          keyword: '不存在的热词',
          summary: '看起来像建议，但没有对应真实来源。',
          suggestion: '这条不应该写入机会列表。'
        },
        {
          keyword: 'AI 短剧爆火',
          summary: '   ',
          suggestion: ''
        }
      ]),
      providerId: 'bad-market-provider',
      model: 'bad-market-model'
    }
  }
}

const badLlmOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  limit: 5,
  provider: badTextProvider
})
assert.equal(badLlmOpportunities.success, false)
assert.equal(badLlmOpportunities.fromLLM, false)
assert.match(badLlmOpportunities.message, /缺少可用机会建议/)
assert.equal(badLlmOpportunities.providerId, 'bad-market-provider')
assert.equal(badLlmOpportunities.items.length > 0, true)

const throwingProvider = {
  providerId: 'throwing-provider',
  async chat() {
    throw new Error('测试模型不可用')
  }
}
const throwingOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  provider: throwingProvider
})
assert.equal(throwingOpportunities.success, false)
assert.match(throwingOpportunities.message, /测试模型不可用/)
assert.equal(throwingOpportunities.items.length > 0, true)

const missingProviderOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  limit: 5
})
assert.equal(missingProviderOpportunities.success, false)
assert.equal(missingProviderOpportunities.fromLLM, false)
assert.match(missingProviderOpportunities.message, /文本 AI 服务/)

const legacyRowsDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-legacy-'))
writeMarketFile(legacyRowsDir, 'hot-topics.json', [
  null,
  {
    source: 'weibo',
    keyword: '旧格式小说热词',
    title: '旧格式小说热词',
    heatIndex: '2.5万',
    capturedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    source: 'weibo',
    keyword: '登录',
    title: '登录',
    heatIndex: 20
  },
  {
    source: 'weibo',
    keyword: 'plain-ascii',
    title: 'plain-ascii',
    heatIndex: 20
  }
])
assert.equal(marketService.listHotTopics(legacyRowsDir).length, 1)
assert.equal(marketService.listHotTopics(legacyRowsDir)[0].heatIndex, 25_000)

writeMarketFile(legacyRowsDir, 'source-status.json', {
  items: [
    {
      source: 'weibo',
      lastSuccessAt: '2020-01-01T00:00:00.000Z',
      lastFailureAt: ''
    },
    {
      source: 'baidu',
      lastSuccessAt: '2026-07-01T00:00:00.000Z',
      lastFailureAt: '2026-07-02T00:00:00.000Z'
    },
    { source: 'dailyhot', skipped: true }
  ]
})
const legacyStatuses = marketService.listSourceStatus(legacyRowsDir)
assert.equal(legacyStatuses.find((item) => item.source === 'weibo')?.status, 'stale')
assert.equal(legacyStatuses.find((item) => item.source === 'baidu')?.status, 'error')
assert.equal(legacyStatuses.find((item) => item.source === 'dailyhot')?.status, 'empty')

writeMarketFile(legacyRowsDir, 'trend-records.json', {
  items: [
    {
      keyword: '旧格式小说热词',
      updatedAt: '2026-07-02T00:00:00.000Z',
      trendSeries: [
        { timestamp: 1, value: 20 },
        { timestamp: 2, value: 80 }
      ]
    }
  ]
})
assert.equal(marketService.listMarketOpportunities(legacyRowsDir)[0].trendScore > 50, true)

writeMarketFile(legacyRowsDir, 'hot-topics.json', { invalid: true })
assert.throws(() => marketService.listHotTopics(legacyRowsDir), /市场趋势数据格式异常/)
writeMarketFile(legacyRowsDir, 'hot-topics.json', '{broken')
assert.throws(() => marketService.listHotTopics(legacyRowsDir), /市场趋势数据读取失败/)
assert.throws(() => marketService.listHotTopics(''), /请先设置书籍目录/)
fs.rmSync(legacyRowsDir, { recursive: true, force: true })

marketTrendService.stopScheduler()
fs.rmSync(booksDir, { recursive: true, force: true })
console.log('market trend tests passed')

import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import marketService from '../src/main/services/marketService.js'

const booksDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-'))

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
assert.equal(first.results[0].sourceUrls.some((url) => url.includes('weibohot')), true)
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
assert.equal(cached.collectionLogs[0].sourceUrls.some((url) => url.includes('weibohot')), true)
assert.equal(cached.results[0].topics.length, 1)
assert.equal(calls.length, callCountAfterFirst)
assert.deepEqual(waits, [])

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

const hotspots = marketService.listHotspots(booksDir, { sortBy: 'heat' })
assert.equal(hotspots.length, 2)
assert.equal(hotspots[0].tags.includes('自动采集'), true)

const trend = marketService.getTrendRecord(booksDir, 'AI 短剧爆火')
assert.equal(Boolean(trend?.trendSeries?.length), true)

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
assert.equal(failed.sourceStatus.find((item) => item.source === 'aggregated')?.lastFailures[0].errorType, 'http')
assert.equal(waits.includes(5), true)

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
assert.equal(publicNovelResult.results.find((item) => item.source === 'fanqie')?.topics.length >= 2, true)
assert.equal(publicNovelResult.results.find((item) => item.source === 'qimao')?.topics.length >= 2, true)
assert.equal(publicNovelResult.collectionLogs.some((item) => item.source === 'fanqie' && item.sourceUrls.length > 0), true)
assert.equal(publicNovelResult.collectionLogs.some((item) => item.source === 'qimao' && item.sourceUrls.length > 0), true)
assert.equal(waits.slice(waitsBeforePublicNovel).every((ms) => ms === 11), true)
assert.equal(publicNovelResult.collectionLogs.some((item) => item.waitCount > 0 && item.requestIntervalMs === 11), true)

const fanqieTopics = marketService.listHotTopics(booksDir, { source: 'fanqie', limit: 10 })
assert.equal(fanqieTopics.some((topic) => topic.keyword === '逆光短剧师'), true)
assert.equal(fanqieTopics.find((topic) => topic.keyword === '逆光短剧师')?.extra.author, '云灯')

const qimaoTopics = marketService.listHotTopics(booksDir, { source: 'qimao', limit: 10 })
assert.equal(qimaoTopics.some((topic) => topic.keyword === '七猫惊雷榜'), true)
assert.equal(qimaoTopics.find((topic) => topic.keyword === '七猫惊雷榜')?.extra.category, '东方玄幻')

const maleOverview = marketService.getMarketOverview(booksDir, { channel: 'male', limit: 10 })
assert.equal(maleOverview.writableDirections.length > 0, true)

const emptyBooksDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-empty-'))
const emptyOverview = marketService.getMarketOverview(emptyBooksDir, { channel: 'all' })
const emptyCloud = marketService.getMarketKeywordCloud(emptyBooksDir, { channel: 'all' })
assert.equal(emptyOverview.writableDirections.length, 0)
assert.equal(emptyCloud.popularCombinations.length, 0)
fs.rmSync(emptyBooksDir, { recursive: true, force: true })

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

const missingProviderOpportunities = await marketService.generateMarketOpportunities(booksDir, {
  limit: 5
})
assert.equal(missingProviderOpportunities.success, false)
assert.equal(missingProviderOpportunities.fromLLM, false)
assert.match(missingProviderOpportunities.message, /文本 AI 服务/)

fs.rmSync(booksDir, { recursive: true, force: true })
console.log('market trend tests passed')

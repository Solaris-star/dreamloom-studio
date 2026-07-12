import assert from 'node:assert/strict'
import { handleMarketRoute, isMarketRoute } from '../src/main/webApi/marketRoutes.js'

const listCases = [
  ['/api/market/hotspots', 'listHotspots'],
  ['/api/market/activities', 'listActivities'],
  ['/api/market/hot-topics', 'listHotTopics'],
  ['/api/market/opportunities', 'listMarketOpportunities']
]
const directCases = [
  ['/api/market/hotspots/create', 'createHotspot'],
  ['/api/market/activities/create', 'createActivity'],
  ['/api/market/refresh', 'refreshMarketTrends'],
  ['/api/market/keyword-combination', 'getMarketKeywordCombination'],
  ['/api/market/save-inspiration', 'saveInsightToKnowledge'],
  ['/api/market/generate-outline', 'generateOutlineFromInsight'],
  ['/api/market/apply-to-current-book', 'applyInsightToBook'],
  ['/api/market/create-book-from-insight', 'createBookFromInsight']
]
const summaryCases = [
  ['/api/market/dashboard', 'getMarketDashboard'],
  ['/api/market/overview', 'getMarketOverview'],
  ['/api/market/hot-rank', 'getMarketHotRank'],
  ['/api/market/keyword-cloud', 'getMarketKeywordCloud'],
  ['/api/market/activities-board', 'getMarketActivities']
]

const calls = []
const responses = []
const service = new Proxy(
  {},
  {
    get: (_target, method) => async (...args) => {
      calls.push([method, ...args])
      return { method, value: method }
    }
  }
)
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  service
}
const payload = { id: 'item-1', patch: { title: '新标题' }, keyword: '仙侠' }

for (const [path, method] of listCases) {
  assert.equal(isMarketRoute(path), true)
  await handleMarketRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, 'D:/books', payload])
  assert.deepEqual(responses.at(-1), {
    success: true,
    items: { method, value: method }
  })
}

for (const [path, method] of directCases) {
  await handleMarketRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, 'D:/books', payload])
  assert.deepEqual(responses.at(-1), { method, value: method })
}

for (const [path, method] of summaryCases) {
  await handleMarketRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, 'D:/books', payload])
  assert.deepEqual(responses.at(-1), { success: true, method, value: method })
}

const idCases = [
  ['/api/market/hotspots/save-to-knowledge', 'saveHotspotToKnowledge'],
  ['/api/market/hotspots/create-topic-card', 'createTopicCardFromHotspot'],
  ['/api/market/activities/save-to-knowledge', 'saveActivityToKnowledge'],
  ['/api/market/activities/create-topic-card', 'createTopicCardFromActivity']
]
for (const [path, method] of idCases) {
  await handleMarketRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, 'D:/books', 'item-1'])
}

await handleMarketRoute({ ...common, path: '/api/market/hotspots/update', body: payload })
assert.deepEqual(calls.at(-1), ['updateHotspot', 'D:/books', 'item-1', payload.patch])
await handleMarketRoute({ ...common, path: '/api/market/activities/update', body: payload })
assert.deepEqual(calls.at(-1), ['updateActivity', 'D:/books', 'item-1', payload.patch])

await handleMarketRoute({ ...common, path: '/api/market/trends', body: payload })
assert.deepEqual(calls.at(-1), ['getTrendRecord', 'D:/books', '仙侠'])
assert.deepEqual(responses.at(-1), {
  success: true,
  data: { method: 'getTrendRecord', value: 'getTrendRecord' }
})
await handleMarketRoute({ ...common, path: '/api/market/trends', body: {} })
assert.deepEqual(calls.at(-1), ['listTrendRecords', 'D:/books', {}])
assert.deepEqual(responses.at(-1), {
  success: true,
  items: { method: 'listTrendRecords', value: 'listTrendRecords' }
})

await handleMarketRoute({ ...common, path: '/api/market/source-status', body: payload })
assert.deepEqual(calls.at(-1), ['listSourceStatus', 'D:/books'])
assert.deepEqual(responses.at(-1), {
  success: true,
  items: { method: 'listSourceStatus', value: 'listSourceStatus' }
})

assert.equal(isMarketRoute('/api/vector/search'), false)
assert.equal(
  await handleMarketRoute({ ...common, path: '/api/vector/search', body: payload }),
  false
)

const expectedError = new Error('刷新失败')
await assert.rejects(
  handleMarketRoute({
    ...common,
    path: '/api/market/refresh',
    body: payload,
    service: {
      refreshMarketTrends: async () => {
        throw expectedError
      }
    }
  }),
  expectedError
)

console.log('市场路由测试通过')

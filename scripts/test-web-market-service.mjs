import assert from 'node:assert/strict'

const requests = []
let responseData = { success: true }

globalThis.fetch = async (url, options = {}) => {
  requests.push({
    url,
    payload: JSON.parse(options.body || '{}'),
    signal: options.signal
  })
  return new Response(JSON.stringify(responseData), {
    status: responseData.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const market = await import('../src/renderer/src/service/market.js')

responseData = { success: true, items: [{ id: 'hotspot-1' }] }
assert.equal((await market.listMarketHotspots()).items.length, 1)
assert.deepEqual(
  { url: requests.at(-1).url, payload: requests.at(-1).payload },
  { url: '/api/market/hotspots', payload: {} }
)

responseData = { success: true, item: { id: 'hotspot-1', title: '新标题' } }
await market.updateMarketHotspot('hotspot-1', { title: '新标题' })
assert.deepEqual(
  { url: requests.at(-1).url, payload: requests.at(-1).payload },
  {
    url: '/api/market/hotspots/update',
    payload: { id: 'hotspot-1', patch: { title: '新标题' } }
  }
)

responseData = { success: true, data: { keyword: '仙侠' } }
await market.getMarketTrend('仙侠')
assert.deepEqual(
  { url: requests.at(-1).url, payload: requests.at(-1).payload },
  { url: '/api/market/trends', payload: { keyword: '仙侠' } }
)

responseData = {
  success: true,
  results: [{ source: 'qidian', success: true }],
  hotspotSync: { created: 1, updated: 0 }
}
await market.refreshMarketTrends({ sources: ['qidian'] })
assert.equal(requests.at(-1).url, '/api/market/refresh')
assert.deepEqual(requests.at(-1).payload, { sources: ['qidian'] })
assert.ok(requests.at(-1).signal instanceof AbortSignal)

responseData = {
  success: true,
  sourceStatus: [],
  topOpportunities: []
}
await assert.rejects(() => market.getMarketDashboard(), /接口返回格式不正确/)

responseData = {
  success: true,
  results: [{ source: 'qidian', success: false }],
  hotspotSync: { created: 0, updated: 0 }
}
await assert.rejects(() => market.refreshMarketTrends(), /没有返回采集结果/)

responseData = { success: true, bookName: '', bookId: 'book-1' }
await assert.rejects(() => market.createBookFromMarketInsight({ title: '测试' }), /没有返回作品信息/)

responseData = { success: true, bookName: '新作品', bookId: '' }
await assert.rejects(() => market.createBookFromMarketInsight({ title: '测试' }), /没有返回作品信息/)

console.log('Web 市场服务测试通过')

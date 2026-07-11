import assert from 'node:assert/strict'

const requests = []
const responses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  requests.push({ url, payload })
  const handler = responses.get(url)
  const data = typeof handler === 'function' ? handler(payload) : handler
  const body = data || { success: false, message: `未设置测试响应：${url}` }
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const { statisticsService } = await import('../src/renderer/src/service/statisticsService.js')

responses.set('/api/analytics/overview', {
  success: true,
  data: { totalWords: 10, bookStats: [] }
})
assert.equal((await statisticsService.getOverview('month', 'book-1')).totalWords, 10)
assert.deepEqual(requests.at(-1), {
  url: '/api/analytics/overview',
  payload: { timeRange: 'month', bookId: 'book-1' }
})

responses.set('/api/analytics/daily-words', ({ bookId }) => ({
  success: true,
  items:
    bookId === '作品目录'
      ? []
      : [{ date: '2026-07-12', words: 120, addWords: 140, deleteWords: 20 }]
}))
responses.set('/api/books/list', {
  success: true,
  books: [{ id: 'book-1', name: '作品名', folderName: '作品目录' }]
})
const dailyStats = await statisticsService.getAllBooksDailyStats()
assert.equal(dailyStats['作品目录']['2026-07-12'].netWords, 120)
assert.deepEqual(
  requests
    .filter((request) => request.url === '/api/analytics/daily-words')
    .slice(-2)
    .map((request) => request.payload.bookId),
  ['作品目录', '作品名']
)

responses.set('/api/goals/list', { success: true, items: [{ id: 'goal-1' }] })
assert.equal((await statisticsService.getGoals())[0].id, 'goal-1')

responses.set('/api/goals/create', { success: true, item: { id: 'goal-2' }, items: [] })
assert.equal((await statisticsService.createGoal({ title: '日更' })).item.id, 'goal-2')
assert.deepEqual(requests.at(-1), {
  url: '/api/goals/create',
  payload: { title: '日更' }
})

responses.set('/api/goals/update', ({ id }) => ({
  success: true,
  item: { id },
  items: [{ id }]
}))
assert.equal((await statisticsService.updateGoal('goal-2', { targetValue: 2000 })).item.id, 'goal-2')
assert.deepEqual(requests.at(-1), {
  url: '/api/goals/update',
  payload: { id: 'goal-2', patch: { targetValue: 2000 } }
})

responses.set('/api/goals/delete', ({ id }) => ({ success: true, id, items: [] }))
assert.equal((await statisticsService.deleteGoal('goal-2')).id, 'goal-2')

let storedAiLogs = []
responses.set('/api/store/get', ({ key }) => ({
  success: true,
  key,
  value: key === 'stats:ai_logs' ? storedAiLogs : []
}))
responses.set('/api/store/set', ({ key, value }) => {
  if (key === 'stats:ai_logs') storedAiLogs = value
  return { success: true, key }
})
await statisticsService.recordAiUsage({ feature: 'chat', totalTokens: 12 })
assert.equal(storedAiLogs[0].success, false)
await statisticsService.recordAiUsage({ feature: 'chat', totalTokens: 8, success: true })
assert.equal(storedAiLogs[1].success, true)

responses.set('/api/analytics/overview', {
  success: true,
  data: { totalWords: 10 }
})
await assert.rejects(() => statisticsService.getOverview(), /书籍字数统计接口返回格式异常/)

responses.set('/api/store/get', {
  success: true,
  key: 'stats:word_logs',
  value: { broken: true }
})
await assert.rejects(() => statisticsService.getWordLogs(), /字数日志格式异常/)

responses.set('/api/goals/update', {
  success: true,
  item: { id: 'wrong-goal' },
  items: []
})
await assert.rejects(
  () => statisticsService.updateGoal('goal-2', { targetValue: 3000 }),
  /返回目标不匹配/
)

console.log('Web 统计服务测试通过')

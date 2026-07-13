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
await statisticsService.recordAiUsage({
  feature: 'rewrite',
  usage: {
    prompt_tokens: 100,
    output_tokens: 40,
    image_requests: 2
  },
  inputPricePerMillionTokens: 10,
  outputPricePerMillionTokens: 20,
  imagePricePerRequest: 0.5,
  error: new Error('模型失败')
})
assert.equal(storedAiLogs[2].promptTokens, 100)
assert.equal(storedAiLogs[2].completionTokens, 40)
assert.equal(storedAiLogs[2].totalTokens, 140)
assert.equal(storedAiLogs[2].imageRequests, 2)
assert.equal(storedAiLogs[2].estimatedCost, 1.0018)
assert.equal(storedAiLogs[2].error, 'Error: 模型失败')

responses.set('/api/analytics/daily-words', {
  success: true,
  items: [
    { date: '2026-07-11', delta: -8 },
    { date: '2026-07-12', count: 30 }
  ]
})
assert.deepEqual(await statisticsService.getTrendData(2, 'all'), [
  { date: '2026-07-11', delta: -8, words: -8 },
  { date: '2026-07-12', delta: 30, words: 30 }
])

responses.set('/api/analytics/writing-habit', {
  success: true,
  data: {
    heatmap: [
      { date: '2026-07-11', words: 18 },
      { date: '2026-07-12', count: 25 }
    ]
  }
})
assert.deepEqual(await statisticsService.getHeatmapData(2), [
  { date: '2026-07-11', count: 18 },
  { date: '2026-07-12', count: 25 }
])

const today = new Date()
const todayKey = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0')
].join('-')
responses.set('/api/analytics/daily-words', {
  success: true,
  items: [{ date: todayKey, addWords: 55, deleteWords: 5, totalWords: 500 }]
})
const bookDailyStats = await statisticsService.getBookDailyStats('作品名')
assert.equal(bookDailyStats.todayAddWords, 55)
assert.equal(bookDailyStats.data[todayKey].netWords, 0)

responses.set('/api/goals/create', {
  success: true,
  item: { id: 'goal-save-new', title: '新目标' }
})
assert.equal((await statisticsService.saveGoal({ title: '新目标' })).id, 'goal-save-new')
responses.set('/api/goals/update', {
  success: true,
  item: { id: 'goal-save-existing', targetValue: 3000 }
})
assert.equal(
  (await statisticsService.saveGoal({ id: 'goal-save-existing', targetValue: 3000 })).targetValue,
  3000
)

responses.set('/api/analytics/token-stats', {
  success: true,
  data: { byFeature: [{ feature: 'chat' }] }
})
assert.deepEqual(await statisticsService.getTokenStats(), {
  byFeature: [{ feature: 'chat' }],
  byModel: [],
  daily: []
})
responses.set('/api/analytics/session-stats', {
  success: true,
  data: { sessions: [{ id: 'session-1' }] }
})
assert.equal((await statisticsService.getSessionStats()).sessions[0].id, 'session-1')
responses.set('/api/analytics/weekly-report', {
  success: true,
  data: { period: { start: '2026-07-06', end: '2026-07-12' }, daily: [] }
})
assert.equal((await statisticsService.getWeeklyReport()).period.start, '2026-07-06')
responses.set('/api/analytics/monthly-report', {
  success: true,
  data: { period: { start: '2026-07-01', end: '2026-07-31' }, daily: [] }
})
assert.equal((await statisticsService.getMonthlyReport()).period.end, '2026-07-31')

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

responses.set('/api/analytics/overview', {
  success: false,
  message: '统计服务暂不可用'
})
await assert.rejects(() => statisticsService.getOverview(), /统计服务暂不可用/)

responses.set('/api/books/list', {
  success: true,
  books: [{ id: '', name: '', folderName: '' }]
})
await assert.rejects(() => statisticsService.getAllBooksDailyStats(), /作品列表接口返回格式异常/)
await assert.rejects(() => statisticsService.getBookDailyStats('  '), /缺少作品名/)

responses.set('/api/analytics/daily-words', {
  success: true,
  items: [{ words: 10 }]
})
await assert.rejects(() => statisticsService.getTrendData(), /每日写作统计接口返回格式异常/)

responses.set('/api/analytics/writing-habit', {
  success: true,
  data: { heatmap: [{ count: 10 }] }
})
await assert.rejects(() => statisticsService.getHeatmapData(), /写作习惯接口返回格式异常/)

responses.set('/api/store/get', {
  success: false,
  key: 'stats:word_logs',
  message: '字数日志读取失败'
})
await assert.rejects(() => statisticsService.getWordLogs(), /字数日志读取失败/)

responses.set('/api/store/get', {
  success: true,
  key: 'stats:word_logs',
  value: []
})
responses.set('/api/store/set', {
  success: true,
  key: 'wrong-key'
})
await assert.rejects(
  () =>
    statisticsService.recordWordCount({
      bookId: 'book-1',
      chapterId: 'chapter-1',
      wordCount: 100,
      delta: 10
    }),
  /接口返回的设置项不匹配/
)

const requestCountBeforeZeroDelta = requests.length
await statisticsService.recordWordCount({
  bookId: 'book-1',
  chapterId: 'chapter-1',
  wordCount: 100,
  delta: 0
})
assert.equal(requests.length, requestCountBeforeZeroDelta)

responses.set('/api/goals/create', {
  success: true,
  item: null
})
await assert.rejects(() => statisticsService.createGoal({ title: '日更' }), /接口返回格式异常/)

responses.set('/api/goals/delete', {
  success: true,
  id: 'goal-2',
  items: [{ id: 'goal-2' }]
})
await assert.rejects(() => statisticsService.deleteGoal('goal-2'), /目标仍在列表中/)

responses.set('/api/goals/delete', {
  success: true,
  id: 'wrong-goal',
  items: []
})
await assert.rejects(() => statisticsService.deleteGoal('goal-2'), /返回目标不匹配/)

responses.set('/api/analytics/token-stats', {
  success: true,
  data: { byFeature: [], byModel: {}, daily: [] }
})
await assert.rejects(() => statisticsService.getTokenStats(), /AI 模型用量接口返回格式异常/)

responses.set('/api/analytics/session-stats', {
  success: true,
  data: { sessions: null }
})
await assert.rejects(
  () => statisticsService.getSessionStats(),
  /写作会话列表接口返回格式异常/
)

responses.set('/api/analytics/weekly-report', {
  success: true,
  data: { period: null, daily: [] }
})
await assert.rejects(() => statisticsService.getWeeklyReport(), /周报周期接口返回格式异常/)

assert.deepEqual(statisticsService.calculateStreak([]), { current: 0, max: 0 })
assert.equal(
  statisticsService.calculateStreak([
    { date: '2026-07-09' },
    { date: '2026-07-10' },
    { date: '2026-07-12' }
  ]).max,
  2
)
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
const yesterdayKey = [
  yesterday.getFullYear(),
  String(yesterday.getMonth() + 1).padStart(2, '0'),
  String(yesterday.getDate()).padStart(2, '0')
].join('-')
assert.deepEqual(statisticsService.calculateStreak([{ date: todayKey }]), { current: 1, max: 1 })
assert.deepEqual(statisticsService.calculateStreak([{ date: yesterdayKey }]), {
  current: 1,
  max: 1
})

console.log('Web 统计服务测试通过')

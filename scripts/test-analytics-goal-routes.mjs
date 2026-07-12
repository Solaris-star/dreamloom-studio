import assert from 'node:assert/strict'
import {
  handleAnalyticsGoalRoute,
  isAnalyticsGoalRoute
} from '../src/main/webApi/analyticsGoalRoutes.js'

const responses = []
const calls = []
const analytics = {
  getOverview: (...args) => (calls.push(['overview', ...args]), { totalWords: 12 }),
  getDailyWords: (...args) => (calls.push(['daily', ...args]), [{ words: 12 }])
}
const goals = {
  listGoals: (...args) => (calls.push(['list', ...args]), [{ id: 'g1' }]),
  createGoal: (...args) => (calls.push(['create', ...args]), { success: true, id: 'g2' }),
  updateGoal: (...args) => (calls.push(['update', ...args]), { success: true }),
  deleteGoal: (...args) => (calls.push(['delete', ...args]), { success: true })
}
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  analytics,
  goals
}

assert.equal(isAnalyticsGoalRoute('/api/analytics/overview'), true)
assert.equal(isAnalyticsGoalRoute('/api/goals/create'), true)
assert.equal(isAnalyticsGoalRoute('/api/books/list'), false)

assert.equal(
  handleAnalyticsGoalRoute({
    ...common,
    path: '/api/analytics/overview',
    body: { bookName: '测试书' }
  }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({
    ...common,
    path: '/api/analytics/daily-words',
    body: {}
  }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({ ...common, path: '/api/goals/list', body: {} }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({
    ...common,
    path: '/api/goals/create',
    body: { title: '每日写作' }
  }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({
    ...common,
    path: '/api/goals/update',
    body: { id: 'g1', patch: { target: 2000 } }
  }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({
    ...common,
    path: '/api/goals/delete',
    body: { id: 'g1' }
  }),
  true
)
assert.equal(
  handleAnalyticsGoalRoute({ ...common, path: '/api/books/list', body: {} }),
  false
)

assert.deepEqual(responses, [
  { success: true, data: { totalWords: 12 } },
  { success: true, items: [{ words: 12 }] },
  { success: true, items: [{ id: 'g1' }] },
  { success: true, id: 'g2' },
  { success: true },
  { success: true }
])
assert.deepEqual(calls, [
  ['overview', 'D:/books', { bookName: '测试书' }],
  ['daily', 'D:/books', {}],
  ['list', 'D:/books'],
  ['create', { title: '每日写作' }, 'D:/books'],
  ['update', 'g1', { target: 2000 }, 'D:/books'],
  ['delete', 'g1', 'D:/books']
])

console.log('统计与写作目标路由测试通过')

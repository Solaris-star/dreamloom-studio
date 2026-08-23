import analyticsService from '../services/analyticsService.js'
import * as goalService from '../services/goalService.js'

const ANALYTICS_ROUTES = new Map([
  ['/api/analytics/overview', ['data', 'getOverview']],
  ['/api/analytics/daily-words', ['items', 'getDailyWords']],
  ['/api/analytics/writing-habit', ['data', 'getWritingHabit']],
  ['/api/analytics/session-stats', ['data', 'getSessionStats']],
  ['/api/analytics/token-stats', ['data', 'getTokenStats']],
  ['/api/analytics/weekly-report', ['data', 'getWeeklyReport']],
  ['/api/analytics/monthly-report', ['data', 'getMonthlyReport']]
])

const GOAL_ROUTES = new Set([
  '/api/goals/list',
  '/api/goals/create',
  '/api/goals/update',
  '/api/goals/delete'
])

export function isAnalyticsGoalRoute(path) {
  return ANALYTICS_ROUTES.has(path) || GOAL_ROUTES.has(path)
}

export async function handleAnalyticsGoalRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  analytics = analyticsService,
  goals = goalService
}) {
  const analyticsRoute = ANALYTICS_ROUTES.get(path)
  if (analyticsRoute) {
    const [resultKey, method] = analyticsRoute
    // 部分 analytics 方法（如 getOverview）是 async：必须 await，
    // 否则 sendJson 会把 Promise 序列化成 {}（首页「写作近况」报错即源于此）。
    const payload = await analytics[method](booksDir, body || {})
    sendJson(res, {
      success: true,
      [resultKey]: payload
    })
    return true
  }

  if (!GOAL_ROUTES.has(path)) return false

  // goalService 的方法全部是 async：必须 await，
  // 否则 sendJson 会把 Promise 序列化成 {}（数据中心「写作目标接口返回格式异常」即源于此）。
  let result
  if (path === '/api/goals/list') {
    result = { success: true, items: await goals.listGoals(booksDir) }
  } else if (path === '/api/goals/create') {
    result = await goals.createGoal(body || {}, booksDir)
  } else if (path === '/api/goals/update') {
    result = await goals.updateGoal(body.id, body.patch || {}, booksDir)
  } else {
    result = await goals.deleteGoal(body.id, booksDir)
  }
  sendJson(res, result)
  return true
}

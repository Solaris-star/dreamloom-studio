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

export function handleAnalyticsGoalRoute({
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
    sendJson(res, {
      success: true,
      [resultKey]: analytics[method](booksDir, body || {})
    })
    return true
  }

  if (!GOAL_ROUTES.has(path)) return false

  let result
  if (path === '/api/goals/list') {
    result = { success: true, items: goals.listGoals(booksDir) }
  } else if (path === '/api/goals/create') {
    result = goals.createGoal(body || {}, booksDir)
  } else if (path === '/api/goals/update') {
    result = goals.updateGoal(body.id, body.patch || {}, booksDir)
  } else {
    result = goals.deleteGoal(body.id, booksDir)
  }
  sendJson(res, result)
  return true
}

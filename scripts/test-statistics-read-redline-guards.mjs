import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const readProjectFile = (filePath) =>
  readFileSync(join(root, filePath), 'utf8').replaceAll('\r\n', '\n')

const statisticsView = readProjectFile('src/renderer/src/views/Statistics/index.vue')
const homeView = readProjectFile('src/renderer/src/views/Home.vue')
const wordCountChart = readProjectFile('src/renderer/src/components/WordCountChart.vue')
const statisticsService = readProjectFile('src/renderer/src/service/statisticsService.js')
const analyticsService = readProjectFile('src/main/services/analyticsService.js')
const aiUsageLogger = readProjectFile('src/main/services/aiUsageLogger.js')
const webShim = readProjectFile('src/renderer/src/service/webElectronShim.js')

for (const expected of [
  "const statisticsReadError = ref('')",
  'const isLoadingStatistics = ref(false)',
  'const isTrendLoading = ref(false)',
  'const isUsageLoading = ref(false)',
  '<div v-if="statisticsReadError" class="statistics-read-error">',
  '@click="retryLoadAllData"',
  '@change="handleTrendDaysChange"',
  '@click="handleRefreshUsage"',
  'statisticsReadError.value = error?.message',
  'bookStats: result.bookStats',
  'byFeature: tokens.byFeature',
  'sessions: sessions.sessions'
]) {
  assert(statisticsView.includes(expected), `统计页面缺少：${expected}`)
}

for (const expected of [
  "import { statisticsService } from '@renderer/service/statisticsService'",
  'const stats = await statisticsService.getAllBooksDailyStats()'
]) {
  assert(wordCountChart.includes(expected), `字数图表缺少：${expected}`)
}

for (const expected of [
  'const result = await statisticsService.getBookDailyStats(book.folderName || book.name)',
  'return { key, words: result.todayAddWords }'
]) {
  assert(homeView.includes(expected), `首页缺少：${expected}`)
}

for (const expected of [
  "import { postJson } from './webHttpClient.js'",
  "postJson('/api/store/get', { key })",
  "postJson('/api/store/set', { key, value })",
  "callWebApi('/api/analytics/overview'",
  "postJson('/api/analytics/daily-words'",
  "callWebApi('/api/goals/list', {}, 'items')",
  "postJson('/api/goals/create', goal)",
  "postJson('/api/goals/update', { id, patch })",
  "postJson('/api/goals/delete', { id })",
  "throw new Error(`${label}格式异常，已停止写入以免覆盖原始记录`)",
  "bookStats: requireArray(overview.bookStats, '书籍字数统计')",
  "byFeature: requireArray(remote.byFeature, 'AI 功能用量')",
  "sessions: requireArray(remote.sessions, '写作会话列表')"
]) {
  assert(statisticsService.includes(expected), `统计服务缺少：${expected}`)
}

for (const forbidden of [
  'window.electron',
  'window.electronStore',
  'requireElectronMethod',
  'callElectronApi'
]) {
  assert(!statisticsService.includes(forbidden), `统计服务不应包含：${forbidden}`)
}

for (const method of [
  'getBookDailyStats:',
  'getAllBooksDailyStats:',
  'getAnalyticsOverview:',
  'getAnalyticsDailyWords:',
  'getAnalyticsWritingHabit:',
  'getAnalyticsSessionStats:',
  'getAnalyticsTokenStats:',
  'getAnalyticsWeeklyReport:',
  'getAnalyticsMonthlyReport:',
  'listWritingGoals:',
  'createWritingGoal:',
  'updateWritingGoal:',
  'deleteWritingGoal:'
]) {
  assert(!webShim.includes(method), `Web shim 不应保留统计方法：${method}`)
}

for (const expected of [
  'throw new Error(`统计本地记录读取失败：${error.message}`)',
  "throw new Error('统计本地记录格式异常，已停止读取统计结果')",
  'success: raw.success === true'
]) {
  assert(analyticsService.includes(expected), `后端统计服务缺少：${expected}`)
}

assert(
  aiUsageLogger.includes("throw new Error('AI 日志格式异常，已停止写入以免覆盖原始记录')"),
  'AI 日志写入必须拒绝损坏的原记录'
)

await import('./test-web-statistics-service.mjs')

console.log('统计读取防线测试通过')

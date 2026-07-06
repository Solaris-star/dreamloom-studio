import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()

function readProjectFile(filePath) {
  return readFileSync(join(root, filePath), 'utf8').replaceAll('\r\n', '\n')
}

function assertIncludes(source, expected, message) {
  assert(source.includes(expected), message)
}

async function assertRejectsWithText(action, text, message) {
  await assert.rejects(action, (error) => {
    assert(String(error?.message || '').includes(text), message)
    return true
  })
}

function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const statisticsView = readProjectFile('src/renderer/src/views/Statistics/index.vue')
const homeView = readProjectFile('src/renderer/src/views/Home.vue')
const wordCountChart = readProjectFile('src/renderer/src/components/WordCountChart.vue')
const statisticsServiceSource = readProjectFile('src/renderer/src/service/statisticsService.js')
const analyticsServiceSource = readProjectFile('src/main/services/analyticsService.js')
const webShim = readProjectFile('src/renderer/src/service/webElectronShim.js')
const aiUsageLoggerSource = readProjectFile('src/main/services/aiUsageLogger.js')

for (const expected of [
  "const statisticsReadError = ref('')",
  "const isLoadingStatistics = ref(false)",
  "const isTrendLoading = ref(false)",
  "const isUsageLoading = ref(false)",
  '<div v-if="statisticsReadError" class="statistics-read-error">',
  '@click="retryLoadAllData"',
  '@change="handleTrendDaysChange"',
  '@click="handleRefreshUsage"',
  'statisticsReadError.value = error?.message',
  "import { readBooksDir } from '../../service/books'",
  'bookList.value = await readBooksDir()',
  'bookStats: result.bookStats',
  'byFeature: tokens.byFeature',
  'sessions: sessions.sessions'
]) {
  assertIncludes(statisticsView, expected, `Statistics view missing ${expected}`)
}

for (const forbidden of [
  'bookStats: result.bookStats || []',
  'byFeature: tokens.byFeature || []',
  'sessions: sessions.sessions || []',
  'window.electron.readBooksDir',
  "ElMessage.error(error?.message || '读取统计数据失败')"
]) {
  assert(!statisticsView.includes(forbidden), `Statistics view must not contain ${forbidden}`)
}

for (const expected of [
  "import { statisticsService } from '@renderer/service/statisticsService'",
  'const stats = await statisticsService.getAllBooksDailyStats()'
]) {
  assertIncludes(wordCountChart, expected, `WordCountChart missing ${expected}`)
}
assert(
  !wordCountChart.includes('window.electron.getAllBooksDailyStats') &&
    !wordCountChart.includes('function requireDailyStatsResult'),
  'WordCountChart must use statistics service for daily stats reads'
)

for (const expected of [
  "import { listChapterTree } from '@renderer/service/editor'",
  'const rows = await listChapterTree(book.folderName || book.name)',
  'const result = await statisticsService.getBookDailyStats(book.folderName || book.name)',
  'return { key, words: result.todayAddWords }'
]) {
  assertIncludes(homeView, expected, `Home view missing ${expected}`)
}
assert(
  !homeView.includes('window.electron.loadChapters') &&
    !homeView.includes('window.electron.getBookDailyStats') &&
    !homeView.includes('function requireChapterTreeRows') &&
    !homeView.includes('function extractTodayAddWords'),
  'Home view must use service-layer chapter and book daily stats reads'
)

for (const expected of [
  'function requireElectronMethod(name',
  'const method = globalThis.window?.electron?.[name]',
  "if (typeof method !== 'function')",
  'const method = requireElectronMethod(name)',
  "const createWritingGoal = requireElectronMethod('createWritingGoal', '写作目标接口不可用')",
  "const updateWritingGoal = requireElectronMethod('updateWritingGoal', '写作目标接口不可用')",
  "const deleteWritingGoal = requireElectronMethod('deleteWritingGoal', '删除目标接口不可用')",
  'result?.success !== true',
  'function requirePlainObject',
  'function requireArray',
  'function requireDailyStatsMap(value, label)',
  'function readStoreArray',
  'async function writeStoreValue(key, value, label)',
  'if (result?.success !== true)',
  'if (result.key !== key)',
  "await writeStoreValue(WORD_LOGS_KEY, limitedLogs, '字数日志')",
  "await writeStoreValue(AI_LOGS_KEY, limitedLogs, 'AI 日志')",
  "throw new Error(`${label}格式异常，已停止写入以免覆盖原始记录`)",
  'success: usage.success === true',
  "bookStats: requireArray(overview.bookStats, '书籍字数统计')",
  "return requireArray(remote, '每日写作统计').map",
  'async getAllBooksDailyStats()',
  "const method = requireElectronMethod('getAllBooksDailyStats', '每日字数统计接口不可用')",
  "return requireDailyStatsMap(result.data, '每日字数统计')",
  'function requireBookDailyStatsResult(result, label)',
  "const data = requirePlainObject(result.data, label)",
  "const todayStats = result.stats?.today || data[localDateKey()]",
  'todayAddWords: toNumber(todayStats.addWords ?? todayStats.netWords, 0)',
  'async getBookDailyStats(bookName)',
  "const method = requireElectronMethod('getBookDailyStats', '书籍每日统计接口不可用')",
  "return requireBookDailyStatsResult(await method(targetBookName), '书籍每日统计')",
  "return requireArray(habit.heatmap, '写作热力图').map",
  "byFeature: requireArray(remote.byFeature, 'AI 功能用量')",
  "sessions: requireArray(remote.sessions, '写作会话列表')",
  "daily: requireArray(remote.daily, '周报每日统计')",
  "daily: requireArray(remote.daily, '月报每日统计')",
  "throw new Error(`${label}接口返回目标不匹配`)",
  "throw new Error(`${label}后目标仍在列表中`)",
  "return requireGoalWriteResult(result, '更新目标', { requireItem: true, expectedId: id })",
  "return requireGoalWriteResult(result, '删除目标', { expectedId: id, requireDeletedId: true })"
]) {
  assertIncludes(statisticsServiceSource, expected, `Statistics service missing ${expected}`)
}

for (const forbidden of [
  'if (!window.electron?.createWritingGoal || !window.electron?.updateWritingGoal)',
  'if (!window.electron?.createWritingGoal) throw new Error',
  'if (!window.electron?.updateWritingGoal) throw new Error',
  'if (!window.electron?.deleteWritingGoal) throw new Error',
  'const result = await window.electron.createWritingGoal(goal)',
  'const result = await window.electron.updateWritingGoal(id, patch)',
  'const result = await window.electron.deleteWritingGoal(id)',
  'return (await window.electronStore.get(WORD_LOGS_KEY)) || []',
  'return (await window.electronStore.get(AI_LOGS_KEY)) || []',
  'await window.electronStore.set(WORD_LOGS_KEY, limitedLogs)',
  'await window.electronStore.set(AI_LOGS_KEY, limitedLogs)',
  'success: usage.success !== false'
]) {
  assert(!statisticsServiceSource.includes(forbidden), `Statistics service must not contain ${forbidden}`)
}

for (const expected of [
  'function readStoreArray(key, label)',
  'throw new Error(`统计本地记录读取失败：${error.message}`)',
  "throw new Error('统计本地记录格式异常，已停止读取统计结果')",
  'throw new Error(`${label}格式异常，已停止读取统计结果以免掩盖原始记录问题`)',
  "return readStoreArray(WORD_LOGS_KEY, '字数日志')",
  "return readStoreArray(AI_LOGS_KEY, 'AI 日志')",
  'success: raw.success === true'
]) {
  assertIncludes(analyticsServiceSource, expected, `Analytics service missing ${expected}`)
}
assert(
  !analyticsServiceSource.includes('success: raw.success !== false'),
  'Analytics service must not count missing AI success as a successful call'
)

for (const forbidden of [
  'function asArray(value)',
  'asArray(storeGet(WORD_LOGS_KEY, []))',
  'asArray(storeGet(AI_LOGS_KEY, []))'
]) {
  assert(!analyticsServiceSource.includes(forbidden), `Analytics service must not contain ${forbidden}`)
}

assertIncludes(
  aiUsageLoggerSource,
  "throw new Error('AI 日志格式异常，已停止写入以免覆盖原始记录')",
  'AI usage logger should reject malformed stored logs before writing'
)
assert(
  !aiUsageLoggerSource.includes('const logs = Array.isArray(current) ? current : []'),
  'AI usage logger must not turn malformed stored logs into an empty list'
)

assertIncludes(
  webShim,
  "if (data?.success !== true) {\n        throw new Error(data?.message || '读取本地设置失败')",
  'Web electron store shim should reject failed store reads'
)

const { statisticsService } = await import('../src/renderer/src/service/statisticsService.js')
const { appendAiUsageLog } = await import('../src/main/services/aiUsageLogger.js')

async function withTempWorkdir(callback) {
  const originalCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'analytics-redline-'))
  try {
    process.chdir(dir)
    mkdirSync('books', { recursive: true })
    await callback(dir)
  } finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
}

function installWindow({ electron = {}, storeGet = () => [], storeSet = (key) => ({ success: true, key }) } = {}) {
  globalThis.window = {
    electron,
    electronStore: {
      get: async (key) => storeGet(key),
      set: async (key, value) => storeSet(key, value)
    }
  }
}

function installHappyStatisticsWindow(overrides = {}) {
  installWindow({
    electron: {
      getAnalyticsOverview: async () => ({
        success: true,
        data: { totalWords: 1, todayWords: 1, monthWords: 1, streakDays: 1, maxStreakDays: 1, bookStats: [] }
      }),
      getAnalyticsDailyWords: async () => ({ success: true, items: [{ date: '2026-06-08', words: 100 }] }),
      getAnalyticsWritingHabit: async () => ({ success: true, data: { heatmap: [{ date: '2026-06-08', count: 100 }] } }),
      getAllBooksDailyStats: async () => ({
        success: true,
        data: { BookA: { '2026-06-08': { netWords: 100 } } }
      }),
      getBookDailyStats: async () => ({
        success: true,
        data: { [localDateKey()]: { addWords: 120 } }
      }),
      getAnalyticsTokenStats: async () => ({
        success: true,
        data: { totalTokens: 10, promptTokens: 4, completionTokens: 6, totalCalls: 1, byFeature: [], byModel: [], daily: [] }
      }),
      getAnalyticsSessionStats: async () => ({ success: true, data: { sessionCount: 1, sessions: [] } }),
      getAnalyticsWeeklyReport: async () => ({
        success: true,
        data: { period: { label: '2026-06-08 至 2026-06-14' }, daily: [], summary: '' }
      }),
      getAnalyticsMonthlyReport: async () => ({
        success: true,
        data: { period: { label: '2026-06' }, daily: [], summary: '' }
      }),
      listWritingGoals: async () => ({ success: true, items: [] }),
      createWritingGoal: async () => ({ success: true, item: { id: 'goal-created' }, items: [] }),
      updateWritingGoal: async (id) => ({ success: true, item: { id }, items: [] }),
      deleteWritingGoal: async (id) => ({ success: true, id, item: { id }, items: [] }),
      ...overrides
    }
  })
}

installHappyStatisticsWindow()
assert.equal((await statisticsService.getOverview()).bookStats.length, 0)
assert.equal((await statisticsService.getTrendData()).length, 1)
assert.equal((await statisticsService.getHeatmapData()).length, 1)
assert.equal((await statisticsService.getAllBooksDailyStats()).BookA['2026-06-08'].netWords, 100)
assert.equal((await statisticsService.getBookDailyStats('BookA')).todayAddWords, 120)
assert.equal((await statisticsService.getTokenStats()).byFeature.length, 0)
assert.equal((await statisticsService.getSessionStats()).sessions.length, 0)
assert.equal((await statisticsService.getWeeklyReport()).daily.length, 0)
assert.equal((await statisticsService.getMonthlyReport()).daily.length, 0)
assert.equal((await statisticsService.getGoals()).length, 0)
assert.equal((await statisticsService.createGoal({ title: '目标', targetValue: 1000 })).item.id, 'goal-created')
assert.equal((await statisticsService.updateGoal('goal-1', { title: '目标', targetValue: 1000 })).item.id, 'goal-1')
assert.equal((await statisticsService.deleteGoal('goal-1')).id, 'goal-1')

installHappyStatisticsWindow({
  getAnalyticsOverview: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.getOverview(),
  '统计接口不可用：getAnalyticsOverview',
  'statistics service should reject non-function analytics APIs'
)

installHappyStatisticsWindow({
  getAllBooksDailyStats: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.getAllBooksDailyStats(),
  '每日字数统计接口不可用',
  'daily stats should reject non-function IPC methods'
)

installHappyStatisticsWindow({
  getAllBooksDailyStats: async () => ({ success: true, data: [] })
})
await assertRejectsWithText(
  () => statisticsService.getAllBooksDailyStats(),
  '每日字数统计接口返回格式异常',
  'daily stats should reject malformed root payload'
)

installHappyStatisticsWindow({
  getAllBooksDailyStats: async () => ({ success: true, data: { BookA: [] } })
})
await assertRejectsWithText(
  () => statisticsService.getAllBooksDailyStats(),
  '每日字数统计接口返回格式异常：BookA',
  'daily stats should reject malformed book stats payload'
)

installHappyStatisticsWindow({
  getBookDailyStats: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.getBookDailyStats('BookA'),
  '书籍每日统计接口不可用',
  'book daily stats should reject non-function IPC methods'
)

await assertRejectsWithText(
  () => statisticsService.getBookDailyStats(''),
  '读取书籍每日统计失败：缺少作品名',
  'book daily stats should reject missing book name'
)

installHappyStatisticsWindow({
  getBookDailyStats: async () => ({ success: true })
})
await assertRejectsWithText(
  () => statisticsService.getBookDailyStats('BookA'),
  '书籍每日统计接口返回格式异常',
  'book daily stats should reject missing data payload'
)

installHappyStatisticsWindow({
  getBookDailyStats: async () => ({ success: true, data: [] })
})
await assertRejectsWithText(
  () => statisticsService.getBookDailyStats('BookA'),
  '书籍每日统计接口返回格式异常',
  'book daily stats should reject malformed data payload'
)

installHappyStatisticsWindow({
  getBookDailyStats: async () => ({ success: true, data: { [localDateKey()]: [] } })
})
await assertRejectsWithText(
  () => statisticsService.getBookDailyStats('BookA'),
  '书籍每日统计接口返回格式异常',
  'book daily stats should reject malformed today payload'
)

installHappyStatisticsWindow({
  createWritingGoal: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.createGoal({ title: '目标', targetValue: 1000 }),
  '创建目标接口不可用',
  'goal create should reject non-function IPC methods'
)

installHappyStatisticsWindow({
  updateWritingGoal: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.updateGoal('goal-1', { title: '目标', targetValue: 1000 }),
  '更新目标接口不可用',
  'goal update should reject non-function IPC methods'
)

installHappyStatisticsWindow({
  deleteWritingGoal: { success: true }
})
await assertRejectsWithText(
  () => statisticsService.deleteGoal('goal-1'),
  '删除目标接口不可用',
  'goal delete should reject non-function IPC methods'
)

installHappyStatisticsWindow({
  createWritingGoal: async () => ({ success: true, item: {}, items: [] })
})
await assertRejectsWithText(
  () => statisticsService.createGoal({ title: '目标', targetValue: 1000 }),
  '创建目标接口返回格式异常',
  'goal create should reject missing item id'
)

installHappyStatisticsWindow({
  updateWritingGoal: async () => ({ success: true, item: { id: 'wrong-goal' }, items: [] })
})
await assertRejectsWithText(
  () => statisticsService.updateGoal('goal-1', { title: '目标', targetValue: 1000 }),
  '更新目标接口返回目标不匹配',
  'goal update should reject mismatched item id'
)

installHappyStatisticsWindow({
  deleteWritingGoal: async () => ({ success: true, items: [] })
})
await assertRejectsWithText(
  () => statisticsService.deleteGoal('goal-1'),
  '删除目标接口返回格式异常',
  'goal delete should reject missing deleted id'
)

installHappyStatisticsWindow({
  deleteWritingGoal: async () => ({ success: true, id: 'wrong-goal', items: [] })
})
await assertRejectsWithText(
  () => statisticsService.deleteGoal('goal-1'),
  '删除目标接口返回目标不匹配',
  'goal delete should reject mismatched deleted id'
)

installHappyStatisticsWindow({
  deleteWritingGoal: async (id) => ({ success: true, id, items: [{ id }] })
})
await assertRejectsWithText(
  () => statisticsService.deleteGoal('goal-1'),
  '删除目标后目标仍在列表中',
  'goal delete should reject a result list that still contains the deleted goal'
)

installHappyStatisticsWindow({
  getAnalyticsOverview: async () => ({ success: true, data: { totalWords: 1 } })
})
await assertRejectsWithText(
  () => statisticsService.getOverview(),
  '书籍字数统计接口返回格式异常',
  'overview should reject missing bookStats'
)

installHappyStatisticsWindow({
  getAnalyticsDailyWords: async () => ({ success: true, items: [{}] })
})
await assertRejectsWithText(
  () => statisticsService.getTrendData(),
  '每日写作统计接口返回格式异常',
  'daily words should reject missing date'
)

installHappyStatisticsWindow({
  getAnalyticsTokenStats: async () => ({ success: true, data: { byFeature: {} } })
})
await assertRejectsWithText(
  () => statisticsService.getTokenStats(),
  'AI 功能用量接口返回格式异常',
  'token stats should reject malformed byFeature'
)

installHappyStatisticsWindow({
  getAnalyticsSessionStats: async () => ({ success: true, data: { sessionCount: 1 } })
})
await assertRejectsWithText(
  () => statisticsService.getSessionStats(),
  '写作会话列表接口返回格式异常',
  'session stats should reject missing sessions'
)

installHappyStatisticsWindow({
  getAnalyticsWeeklyReport: async () => ({ success: true, data: { period: {} } })
})
await assertRejectsWithText(
  () => statisticsService.getWeeklyReport(),
  '周报每日统计接口返回格式异常',
  'weekly report should reject missing daily rows'
)

installHappyStatisticsWindow({
  getAnalyticsMonthlyReport: async () => ({ data: { period: {}, daily: [] } })
})
await assertRejectsWithText(
  () => statisticsService.getMonthlyReport(),
  '统计接口返回格式异常：getAnalyticsMonthlyReport',
  'statistics APIs should require explicit success'
)

installWindow({ storeGet: () => ({ broken: true }) })
await assertRejectsWithText(
  () => statisticsService.getWordLogs(),
  '字数日志格式异常',
  'word logs should reject malformed stored value'
)

installWindow({ storeGet: () => ({ broken: true }) })
await assertRejectsWithText(
  () => statisticsService.recordAiUsage({ feature: 'ai_chat', totalTokens: 1 }),
  'AI 日志格式异常',
  'AI usage writes should stop before overwriting malformed logs'
)

let writtenAiLogs = []
installWindow({
  storeGet: (key) => (key === 'stats:ai_logs' ? writtenAiLogs : []),
  electron: {}
})
globalThis.window.electronStore.set = async (key, value) => {
  if (key === 'stats:ai_logs') writtenAiLogs = value
  return { success: true, key }
}
await statisticsService.recordAiUsage({ feature: 'missing-success', totalTokens: 1 })
await statisticsService.recordAiUsage({ feature: 'explicit-success', totalTokens: 1, success: true })
assert.equal(writtenAiLogs[0].success, false, 'renderer AI usage logs should not treat missing success as successful')
assert.equal(writtenAiLogs[1].success, true, 'renderer AI usage logs should keep explicit success')

installWindow({
  storeGet: () => [],
  storeSet: () => ({})
})
await assertRejectsWithText(
  () => statisticsService.recordWordCount({ bookId: 'b1', chapterId: 'c1', wordCount: 10, delta: 10 }),
  '字数日志写入失败',
  'word log writes should reject empty store write results'
)

installWindow({
  storeGet: () => [],
  storeSet: () => ({ success: true, key: 'wrong-key' })
})
await assertRejectsWithText(
  () => statisticsService.recordAiUsage({ feature: 'bad-store-key', totalTokens: 1 }),
  'AI 日志写入失败：接口返回的设置项不匹配',
  'AI usage writes should reject mismatched store write keys'
)

assert.throws(
  () => appendAiUsageLog({ get: () => ({ broken: true }), set: () => assert.fail('set should not be called') }, {}),
  /AI 日志格式异常/,
  'main process AI usage logger should reject malformed stored logs before writing'
)

await withTempWorkdir(async (dir) => {
  const { default: analyticsService } = await import(`../src/main/services/analyticsService.js?bad-word-${Date.now()}`)
  writeFileSync(join(dir, '.store.json'), JSON.stringify({ 'stats:word_logs': { broken: true } }), 'utf8')
  assert.throws(
    () => analyticsService.getDailyWords(join(dir, 'books'), {}),
    /字数日志格式异常/,
    'main process analytics should reject malformed word logs before reporting empty stats'
  )
})

await withTempWorkdir(async (dir) => {
  const { default: analyticsService } = await import(`../src/main/services/analyticsService.js?bad-json-${Date.now()}`)
  writeFileSync(join(dir, '.store.json'), '{"stats:word_logs":', 'utf8')
  assert.throws(
    () => analyticsService.getDailyWords(join(dir, 'books'), {}),
    /统计本地记录读取失败/,
    'main process analytics should reject broken store JSON before reporting empty stats'
  )
})

await withTempWorkdir(async (dir) => {
  const { default: analyticsService } = await import(`../src/main/services/analyticsService.js?bad-ai-${Date.now()}`)
  writeFileSync(join(dir, '.store.json'), JSON.stringify({ 'stats:ai_logs': { broken: true } }), 'utf8')
  assert.throws(
    () => analyticsService.getTokenStats(join(dir, 'books'), {}),
    /AI 日志格式异常/,
    'main process analytics should reject malformed AI logs before reporting empty stats'
  )
})

await withTempWorkdir(async (dir) => {
  const { default: analyticsService } = await import(`../src/main/services/analyticsService.js?ai-success-${Date.now()}`)
  writeFileSync(
    join(dir, '.store.json'),
    JSON.stringify({
      'stats:ai_logs': [
        { feature: 'explicit-ok', createdAt: Date.now(), totalTokens: 9, success: true },
        { feature: 'missing-success', createdAt: Date.now(), totalTokens: 7 }
      ]
    }),
    'utf8'
  )
  const stats = analyticsService.getTokenStats(join(dir, 'books'), {})
  assert.equal(stats.successfulCalls, 1, 'only explicit success should count as a successful AI call')
  assert.equal(stats.failedCalls, 1, 'missing success should count as a failed AI call')
})

console.log('statistics read redline guard tests passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

const homeView = readProjectFile('src/renderer/src/views/Home.vue')
const wordCountChart = readProjectFile('src/renderer/src/components/WordCountChart.vue')
const webShim = readProjectFile('src/renderer/src/service/webElectronShim.js')

for (const expected of [
  "import { listChapterTree } from '@renderer/service/editor'",
  'const statsError = ref(\'\')',
  'const statsLoading = ref(false)',
  'const recentBooksLoading = ref(false)',
  'const bookDailyStatsErrors = ref({})',
  'const bookChapterLoadErrors = ref({})',
  'const recentBooksReadError = computed(() => {',
  '<div v-if="statsError" class="small-error status-error">',
  '@click="loadStats"',
  '<div v-if="recentBooksReadError" class="small-error list-error">',
  '@click="loadRecentBookDetails"',
  'await Promise.allSettled([loadKnowledge(), loadPromptPresets(), loadMarketData(), loadTextProviders()])',
  'await loadBooks()',
  'await Promise.allSettled([loadStats(), loadRecentBookDetails()])',
  'const rows = await listChapterTree(book.folderName || book.name)',
  'const result = await statisticsService.getBookDailyStats(book.folderName || book.name)',
  'return { key, words: result.todayAddWords }',
  'function todayBookWordsText(book)',
  "if (bookDailyStatsErrors.value[key]) return '今日新增读取失败'",
  "if (bookChapterLoadErrors.value[key]) return '章节读取失败'"
]) {
  assertIncludes(homeView, expected, `Home view missing ${expected}`)
}

for (const forbidden of [
  'window.electron.loadChapters',
  'window.electron.getBookDailyStats',
  'rows.slice(0, 3).map(loadBookChapters)',
  'Promise.allSettled([loadBooks(), loadKnowledge(), loadPromptPresets(), loadMarketData(), loadStats(), loadTextProviders()])'
]) {
  assert(!homeView.includes(forbidden), `Home view must not contain ${forbidden}`)
}

for (const expected of [
  "import { statisticsService } from '@renderer/service/statisticsService'",
  "const chartError = ref('')",
  "const chartLoading = ref(false)",
  'const stats = await statisticsService.getAllBooksDailyStats()',
  "chartError.value = error?.message || t('wordCountChart.fetchFailed')",
  '<div v-if="chartError" class="chart-error" role="alert">',
  '@click="updateChartData"'
]) {
  assertIncludes(wordCountChart, expected, `WordCountChart missing ${expected}`)
}

for (const forbidden of [
  'window.electron.getAllBooksDailyStats',
  'function requireDailyStatsResult'
]) {
  assert(!wordCountChart.includes(forbidden), `WordCountChart must not contain ${forbidden}`)
}

const normalizeDailyRowsBlock = webShim.slice(
  webShim.indexOf('function normalizeDailyRows'),
  webShim.indexOf('function rowsToDailyStats')
)
const loadChaptersBlock = webShim.slice(
  webShim.indexOf('loadChapters: async'),
  webShim.indexOf('readChapter:', webShim.indexOf('loadChapters: async'))
)

for (const expected of [
  "if (result?.success !== true)",
  "throw new Error(result?.message || '读取每日写作统计失败')",
  'if (!Array.isArray(result.items))',
  "throw new Error('读取每日写作统计失败：接口返回格式不正确')"
]) {
  assertIncludes(normalizeDailyRowsBlock, expected, `Web shim daily guard missing ${expected}`)
}

for (const expected of [
  "throw new Error(data?.message || '读取章节失败')",
  "if (data?.success !== true)",
  "if (!Array.isArray(data?.chapters))",
  'return data',
  "throw new Error('读取章节失败：接口返回格式不正确')"
]) {
  assertIncludes(loadChaptersBlock, expected, `Web shim chapter guard missing ${expected}`)
}

assert(!normalizeDailyRowsBlock.includes(': []'), 'Web shim daily guard must not turn malformed rows into an empty list')
assert(!normalizeDailyRowsBlock.includes('if (result?.success === false)'), 'Web shim daily guard must not accept weak success')
assert(!normalizeDailyRowsBlock.includes('Array.isArray(result)'), 'Web shim daily guard must not accept bare arrays')
assert(!normalizeDailyRowsBlock.includes('Array.isArray(result?.data)'), 'Web shim daily guard must not accept data arrays')
assert(!loadChaptersBlock.includes('return Array.isArray(data) ? data : []'), 'Web shim chapters must not turn malformed rows into an empty list')
assert(!loadChaptersBlock.includes('if (Array.isArray(data)) return data'), 'Web shim chapters must not accept bare arrays')
assert(!loadChaptersBlock.includes('if (Array.isArray(data?.data)) return data.data'), 'Web shim chapters must not accept data arrays')
assert(!loadChaptersBlock.includes('if (Array.isArray(data?.items)) return data.items'), 'Web shim chapters must not accept items arrays')

const { installWebElectronShim } = await import('../src/renderer/src/service/webElectronShim.js')

function makeResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  }
}

function installWindowWithFetch(fetchImpl) {
  globalThis.fetch = fetchImpl
  globalThis.window = {
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    }
  }
  installWebElectronShim()
  return globalThis.window.electron
}

let electron = installWindowWithFetch(async () => makeResponse({ success: true, chapters: [{ name: '第一卷', children: [] }] }))
assert.equal((await electron.loadChapters('测试书')).chapters.length, 1)

electron = installWindowWithFetch(async () => makeResponse({ success: false, message: '章节接口失败' }))
await assertRejectsWithText(
  () => electron.loadChapters('测试书'),
  '章节接口失败',
  'Web loadChapters should reject failed responses'
)

electron = installWindowWithFetch(async () => makeResponse([{ name: '第一卷', children: [] }]))
await assertRejectsWithText(
  () => electron.loadChapters('测试书'),
  '读取章节失败',
  'Web loadChapters should reject bare arrays'
)

electron = installWindowWithFetch(async () => makeResponse({ success: true, data: [] }))
await assertRejectsWithText(
  () => electron.loadChapters('测试书'),
  '读取章节失败：接口返回格式不正确',
  'Web loadChapters should reject malformed responses'
)

electron = installWindowWithFetch(async () => makeResponse({ success: true, items: [{ date: '2026-06-08', words: 100 }] }))
assert.equal((await electron.getDailyWordCount()).items.length, 1)

electron = installWindowWithFetch(async () => makeResponse({ success: true, data: {} }))
await assertRejectsWithText(
  () => electron.getDailyWordCount(),
  '读取每日写作统计失败：接口返回格式不正确',
  'Web daily stats should reject malformed responses'
)

console.log('home read redline guard tests passed')

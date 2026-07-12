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

const homeView = readProjectFile('src/renderer/src/views/Home.vue')
const wordCountChart = readProjectFile('src/renderer/src/components/WordCountChart.vue')

for (const expected of [
  "import { listChapterTree } from '@renderer/service/editor'",
  "const statsError = ref('')",
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
  'const chartLoading = ref(false)',
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

console.log('home read redline guard tests passed')

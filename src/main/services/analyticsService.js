import fs from 'node:fs'
import { join, resolve } from 'node:path'
import { readJson } from './webJsonRepository.js'

const STORE_FILE = resolve('.store.json')
const WORD_LOGS_KEY = 'stats:word_logs'
const AI_LOGS_KEY = 'stats:ai_logs'
const ONE_DAY = 24 * 60 * 60 * 1000
const SESSION_GAP_MS = 30 * 60 * 1000
const DEFAULT_INPUT_COST_PER_1M = 1
const DEFAULT_OUTPUT_COST_PER_1M = 3

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return {}
  let store
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8') || '{}')
  } catch (error) {
    throw new Error(`统计本地记录读取失败：${error.message}`)
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('统计本地记录格式异常，已停止读取统计结果')
  }
  return store
}

function storeGet(key, fallback) {
  const store = readStore()
  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback
}

function readStoreArray(key, label) {
  const value = storeGet(key, undefined)
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error(`${label}格式异常，已停止读取统计结果以免掩盖原始记录问题`)
  }
  return value.filter((item) => item != null)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function toDateKey(value = new Date()) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`)
}

function addDays(dateKey, days) {
  const date = dateFromKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

function getDateRange({ days = 30, startDate = '', endDate = '' } = {}) {
  const end = endDate ? toDateKey(endDate) : toDateKey()
  let start = startDate ? toDateKey(startDate) : ''
  if (!start) {
    const startDateObject = dateFromKey(end)
    startDateObject.setDate(startDateObject.getDate() - Math.max(1, Number(days) || 30) + 1)
    start = toDateKey(startDateObject)
  }

  const result = []
  let cursor = start
  while (cursor && cursor <= end && result.length < 1200) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}

function isBookMatch(value, filter) {
  if (!filter) return true
  return String(value || '') === String(filter)
}

function matchBookLog(log, filter) {
  if (!filter) return true
  return isBookMatch(log.bookId, filter) || isBookMatch(log.bookName, filter)
}

function normalizeWordLog(raw = {}) {
  const date = toDateKey(raw.date || raw.createdAt || raw.updatedAt)
  const createdAt = asNumber(raw.createdAt, date ? dateFromKey(date).getTime() : Date.now())
  const delta = asNumber(raw.delta ?? raw.wordDelta ?? raw.count, 0)
  return {
    id: String(raw.id || ''),
    bookId: String(raw.bookId || raw.bookName || ''),
    chapterId: String(raw.chapterId || raw.chapterName || ''),
    date,
    wordCount: asNumber(raw.wordCount, 0),
    delta,
    positiveWords: Math.max(0, delta),
    createdAt
  }
}

function getWordLogs(params = {}) {
  const bookId = String(params.bookId || params.bookName || params.book || '').trim()
  return readStoreArray(WORD_LOGS_KEY, '字数日志')
    .map(normalizeWordLog)
    .filter((log) => log.date && matchBookLog(log, bookId))
}

function normalizeAiUsage(raw = {}) {
  const usage = raw.usage && typeof raw.usage === 'object' ? raw.usage : {}
  const promptTokens = asNumber(
    raw.promptTokens ?? raw.prompt_tokens ?? raw.inputTokens ?? raw.input_tokens ??
      usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens,
    0
  )
  const completionTokens = asNumber(
    raw.completionTokens ?? raw.completion_tokens ?? raw.outputTokens ?? raw.output_tokens ??
      usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens,
    0
  )
  const totalTokens = asNumber(
    raw.totalTokens ?? raw.total_tokens ?? usage.totalTokens ?? usage.total_tokens,
    promptTokens + completionTokens
  )
  const logCost = asNumber(raw.cost ?? raw.estimatedCost ?? raw.estimated_cost, Number.NaN)
  const estimatedCost = Number.isFinite(logCost)
    ? logCost
    : (promptTokens / 1_000_000) * DEFAULT_INPUT_COST_PER_1M +
      (completionTokens / 1_000_000) * DEFAULT_OUTPUT_COST_PER_1M

  return {
    id: String(raw.id || ''),
    bookId: String(raw.bookId || raw.bookName || ''),
    feature: String(raw.feature || raw.task || 'ai'),
    providerId: String(raw.providerId || ''),
    model: String(raw.model || raw.modelName || ''),
    date: toDateKey(raw.date || raw.createdAt || raw.updatedAt),
    createdAt: asNumber(raw.createdAt, Date.now()),
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    success: raw.success === true
  }
}

function getAiLogs(params = {}) {
  const bookId = String(params.bookId || params.bookName || params.book || '').trim()
  return readStoreArray(AI_LOGS_KEY, 'AI 日志')
    .map(normalizeAiUsage)
    .filter((log) => log.date && matchBookLog(log, bookId))
}

function countTextWords(text) {
  return String(text || '').replace(/[\s\n\r\t]/g, '').length
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function collectTxtFiles(dirPath, result = []) {
  if (!dirPath || !fs.existsSync(dirPath)) return result
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of entries) {
    const target = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      collectTxtFiles(target, result)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      result.push(target)
    }
  }
  return result
}

function readBooks(booksDir) {
  if (!booksDir || !fs.existsSync(booksDir)) return []
  let entries = []
  try {
    entries = fs.readdirSync(booksDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const bookPath = join(booksDir, entry.name)
      const meta = readJson(join(bookPath, 'mazi.json'), null)
      if (!meta || typeof meta !== 'object') return null
      return {
        id: String(meta.id || entry.name),
        name: String(meta.name || entry.name),
        folderName: entry.name,
        path: bookPath,
        meta
      }
    })
    .filter(Boolean)
}

function isDownloadedBook(book) {
  const meta = book?.meta || {}
  return (
    meta.sourceType === 'downloadedNovel' ||
    meta.sourceType === 'novelDownload' ||
    meta.downloaded === true ||
    meta.importedFrom === 'novelDownload' ||
    meta.source === 'novelDownload' ||
    String(meta.intro || '').trim() === '从网络下载'
  )
}

function readBookWordStats(booksDir, params = {}) {
  const bookFilter = String(params.bookId || params.bookName || params.book || '').trim()
  const books = readBooks(booksDir).filter((book) => {
    if (!bookFilter) return true
    return [book.id, book.name, book.folderName].some((value) => String(value) === bookFilter)
  })

  return books.map((book) => {
    const roots = [join(book.path, '正文'), join(book.path, 'volumes')]
    const files = Array.from(new Set(roots.flatMap((root) => collectTxtFiles(root))))
    let totalWords = 0
    for (const filePath of files) {
      totalWords += countTextWords(safeReadText(filePath))
    }
    return {
      id: book.id,
      name: book.name,
      folderName: book.folderName,
      totalWords: isDownloadedBook(book) ? 0 : totalWords,
      rawTotalWords: totalWords,
      sourceType: book.meta?.sourceType || '',
      excludedFromWritingStats: isDownloadedBook(book),
      chapterCount: files.length
    }
  })
}

function summarizeDailyLogs(logs, dates) {
  const grouped = new Map()
  for (const date of dates) {
    grouped.set(date, {
      date,
      delta: 0,
      words: 0,
      count: 0,
      entries: 0
    })
  }

  for (const log of logs) {
    if (!grouped.has(log.date)) continue
    const row = grouped.get(log.date)
    row.delta += log.delta
    row.words += log.positiveWords
    row.count += log.positiveWords
    row.entries += 1
  }
  return Array.from(grouped.values())
}

export function calculateStreakFromLogs(logs) {
  const dates = Array.from(
    new Set(
      logs
        .filter((log) => log.positiveWords > 0)
        .map((log) => log.date)
        .filter(Boolean)
    )
  ).sort()
  if (!dates.length) return { current: 0, max: 0 }

  let max = 1
  let running = 1
  const streakByDate = new Map([[dates[0], 1]])

  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((dateFromKey(dates[i]) - dateFromKey(dates[i - 1])) / ONE_DAY)
    running = diff === 1 ? running + 1 : 1
    max = Math.max(max, running)
    streakByDate.set(dates[i], running)
  }

  const today = toDateKey()
  const yesterday = addDays(today, -1)
  const latest = dates[dates.length - 1]
  const current = latest === today || latest === yesterday ? streakByDate.get(latest) || 0 : 0
  return { current, max }
}

function summarizeTokenRows(rows) {
  const byFeatureMap = new Map()
  const byModelMap = new Map()
  const dailyMap = new Map()

  const totals = rows.reduce(
    (acc, row) => {
      acc.promptTokens += row.promptTokens
      acc.completionTokens += row.completionTokens
      acc.totalTokens += row.totalTokens
      acc.totalCost += row.estimatedCost
      acc.totalCalls += 1
      if (row.success) acc.successfulCalls += 1
      else acc.failedCalls += 1

      const featureKey = row.feature || 'ai'
      const feature = byFeatureMap.get(featureKey) || {
        feature: featureKey,
        calls: 0,
        totalTokens: 0,
        estimatedCost: 0
      }
      feature.calls += 1
      feature.totalTokens += row.totalTokens
      feature.estimatedCost += row.estimatedCost
      byFeatureMap.set(featureKey, feature)

      const modelKey = row.model || 'unknown'
      const model = byModelMap.get(modelKey) || {
        model: modelKey,
        calls: 0,
        totalTokens: 0,
        estimatedCost: 0
      }
      model.calls += 1
      model.totalTokens += row.totalTokens
      model.estimatedCost += row.estimatedCost
      byModelMap.set(modelKey, model)

      const daily = dailyMap.get(row.date) || {
        date: row.date,
        calls: 0,
        totalTokens: 0,
        estimatedCost: 0
      }
      daily.calls += 1
      daily.totalTokens += row.totalTokens
      daily.estimatedCost += row.estimatedCost
      dailyMap.set(row.date, daily)

      return acc
    },
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0
    }
  )

  return {
    ...totals,
    totalCost: Number(totals.totalCost.toFixed(6)),
    byFeature: Array.from(byFeatureMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    byModel: Array.from(byModelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }
}

export function getDailyWords(booksDir, params = {}) {
  const dates = getDateRange(params)
  const logs = getWordLogs(params)
  return summarizeDailyLogs(logs, dates)
}

export function getTokenStats(booksDir, params = {}) {
  const rows = getAiLogs(params).filter((row) => {
    if (!params.startDate && !params.endDate) return true
    const start = params.startDate ? toDateKey(params.startDate) : '0000-00-00'
    const end = params.endDate ? toDateKey(params.endDate) : '9999-99-99'
    return row.date >= start && row.date <= end
  })
  return summarizeTokenRows(rows)
}

export function getOverview(booksDir, params = {}) {
  const bookStats = readBookWordStats(booksDir, params)
  const totalWords = bookStats.reduce((sum, book) => sum + book.totalWords, 0)
  const chapterCount = bookStats.reduce((sum, book) => sum + book.chapterCount, 0)
  const today = toDateKey()
  const monthStart = toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const wordLogs = getWordLogs(params)
  const tokenStats = getTokenStats(booksDir, params)
  const streak = calculateStreakFromLogs(wordLogs)

  const todayWords = wordLogs
    .filter((log) => log.date === today)
    .reduce((sum, log) => sum + log.positiveWords, 0)
  const monthWords = wordLogs
    .filter((log) => log.date >= monthStart && log.date <= today)
    .reduce((sum, log) => sum + log.positiveWords, 0)

  return {
    totalWords,
    todayWords,
    monthWords,
    streakDays: streak.current,
    maxStreakDays: streak.max,
    totalAiTokens: tokenStats.totalTokens,
    totalAiCost: tokenStats.totalCost,
    totalAiCalls: tokenStats.totalCalls,
    promptTokens: tokenStats.promptTokens,
    completionTokens: tokenStats.completionTokens,
    bookCount: bookStats.length,
    chapterCount,
    bookStats,
    updatedAt: new Date().toISOString()
  }
}

export function getWritingHabit(booksDir, params = {}) {
  const days = Number(params.days || 365)
  const daily = getDailyWords(booksDir, { ...params, days })
  const logs = getWordLogs(params).filter((log) => log.positiveWords > 0)
  const streak = calculateStreakFromLogs(logs)
  const weekday = Array.from({ length: 7 }, (_, index) => ({
    weekday: index,
    words: 0,
    entries: 0
  }))
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    words: 0,
    entries: 0
  }))

  for (const log of logs) {
    const date = new Date(log.createdAt)
    if (!Number.isNaN(date.getTime())) {
      const weekdayRow = weekday[date.getDay()]
      weekdayRow.words += log.positiveWords
      weekdayRow.entries += 1
      const hourRow = hours[date.getHours()]
      hourRow.words += log.positiveWords
      hourRow.entries += 1
    }
  }

  const activeDays = daily.filter((row) => row.words > 0).length
  const bestDay = daily.reduce((best, row) => (row.words > best.words ? row : best), {
    date: '',
    words: 0
  })

  return {
    heatmap: daily.map((row) => ({ date: row.date, count: row.words, words: row.words })),
    activeDays,
    streakDays: streak.current,
    maxStreakDays: streak.max,
    bestDay,
    weekday,
    hours
  }
}

export function getSessionStats(booksDir, params = {}) {
  const logs = getWordLogs(params)
    .filter((log) => log.positiveWords > 0)
    .sort((a, b) => a.createdAt - b.createdAt)

  const sessions = []
  for (const log of logs) {
    const last = sessions[sessions.length - 1]
    if (!last || log.createdAt - last.endAt > SESSION_GAP_MS) {
      sessions.push({
        id: `session_${log.createdAt}`,
        startAt: log.createdAt,
        endAt: log.createdAt,
        date: log.date,
        words: log.positiveWords,
        entries: 1
      })
    } else {
      last.endAt = log.createdAt
      last.words += log.positiveWords
      last.entries += 1
    }
  }

  const rows = sessions.map((session) => ({
    ...session,
    durationMinutes: Math.max(1, Math.round((session.endAt - session.startAt) / 60000) + 1)
  }))
  const totalWords = rows.reduce((sum, row) => sum + row.words, 0)
  const totalMinutes = rows.reduce((sum, row) => sum + row.durationMinutes, 0)
  const longest = rows.reduce((best, row) => (row.durationMinutes > best.durationMinutes ? row : best), {
    durationMinutes: 0
  })

  return {
    sessionCount: rows.length,
    totalWords,
    totalMinutes,
    avgWords: rows.length ? Math.round(totalWords / rows.length) : 0,
    avgMinutes: rows.length ? Math.round(totalMinutes / rows.length) : 0,
    longestSessionMinutes: longest.durationMinutes || 0,
    sessions: rows.slice(-20).reverse()
  }
}

function getReportRange(type, dateValue) {
  const base = dateValue ? new Date(dateValue) : new Date()
  if (type === 'month') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1)
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return { startDate: toDateKey(start), endDate: toDateKey(end) }
  }

  const start = new Date(base)
  const day = start.getDay() || 7
  start.setDate(start.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { startDate: toDateKey(start), endDate: toDateKey(end) }
}

function buildReport(booksDir, params = {}, type = 'week') {
  const range = getReportRange(type, params.date)
  const daily = getDailyWords(booksDir, { ...params, ...range })
  const tokenStats = getTokenStats(booksDir, { ...params, ...range })
  const totalWords = daily.reduce((sum, row) => sum + row.words, 0)
  const activeDays = daily.filter((row) => row.words > 0).length
  const bestDay = daily.reduce((best, row) => (row.words > best.words ? row : best), {
    date: '',
    words: 0
  })
  const dailyAverage = activeDays ? Math.round(totalWords / activeDays) : 0
  const label = type === 'month'
    ? `${range.startDate.slice(0, 7)}`
    : `${range.startDate} 至 ${range.endDate}`

  const summaryParts = []
  summaryParts.push(`本${type === 'month' ? '月' : '周'}新增 ${totalWords.toLocaleString()} 字`)
  summaryParts.push(`写作 ${activeDays} 天`)
  if (bestDay.words > 0) {
    summaryParts.push(`${bestDay.date} 最多，写了 ${bestDay.words.toLocaleString()} 字`)
  }
  if (tokenStats.totalTokens > 0) {
    summaryParts.push(`AI 使用 ${tokenStats.totalTokens.toLocaleString()} tokens`)
  }

  return {
    type,
    period: {
      ...range,
      label
    },
    totalWords,
    activeDays,
    dailyAverage,
    bestDay,
    totalTokens: tokenStats.totalTokens,
    totalCost: tokenStats.totalCost,
    aiCalls: tokenStats.totalCalls,
    daily,
    summary: summaryParts.join('，')
  }
}

export function getWeeklyReport(booksDir, params = {}) {
  return buildReport(booksDir, params, 'week')
}

export function getMonthlyReport(booksDir, params = {}) {
  return buildReport(booksDir, params, 'month')
}

export default {
  getOverview,
  getDailyWords,
  getWritingHabit,
  getSessionStats,
  getTokenStats,
  getWeeklyReport,
  getMonthlyReport
}

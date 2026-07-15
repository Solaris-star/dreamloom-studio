import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

const originalCwd = process.cwd()
const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-analytics-'))
const booksDir = join(rootDir, 'books')
const storeFile = join(rootDir, '.store.json')

function writeJson(filePath, value) {
  fs.mkdirSync(join(filePath, '..'), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function createBook(folderName, meta, chapters) {
  const bookDir = join(booksDir, folderName)
  writeJson(join(bookDir, 'mazi.json'), meta)
  for (const [relativePath, content] of Object.entries(chapters)) {
    const filePath = join(bookDir, relativePath)
    fs.mkdirSync(join(filePath, '..'), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }
}

try {
  process.chdir(rootDir)
  const analytics = await import('../src/main/services/analyticsService.js')

  assert.equal(analytics.toDateKey('2026-07-12T10:00:00.000Z'), '2026-07-12')
  assert.equal(analytics.toDateKey('not-a-date'), '')
  assert.deepEqual(analytics.calculateStreakFromLogs([]), { current: 0, max: 0 })
  assert.equal(
    analytics.calculateStreakFromLogs([
      { date: '2026-01-01', positiveWords: 10 },
      { date: '2026-01-02', positiveWords: 20 },
      { date: '2026-01-04', positiveWords: 30 },
      { date: '2026-01-05', positiveWords: 0 }
    ]).max,
    2
  )

  createBook(
    '作品目录',
    { id: 'book-1', name: '作品一' },
    {
      '正文/第一章.txt': '一 二\n三',
      'volumes/第二章.txt': '四五',
      '正文/忽略.md': '不计入'
    }
  )
  createBook(
    '下载作品',
    { id: 'download-1', name: '下载作品', sourceType: 'downloadedNovel' },
    { '正文/第一章.txt': '这些字只计入原始字数' }
  )
  fs.mkdirSync(join(booksDir, '损坏作品'), { recursive: true })
  fs.writeFileSync(join(booksDir, '损坏作品', 'mazi.json'), '{broken', 'utf-8')

  writeJson(storeFile, {
    'stats:word_logs': [
      {
        id: 'word-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        date: '2026-07-01',
        delta: 120,
        createdAt: new Date('2026-07-01T09:00:00').getTime()
      },
      {
        id: 'word-2',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        date: '2026-07-01',
        delta: -20,
        createdAt: new Date('2026-07-01T09:20:00').getTime()
      },
      {
        id: 'word-3',
        bookId: 'book-1',
        chapterId: 'chapter-2',
        date: '2026-07-02',
        count: 80,
        createdAt: new Date('2026-07-02T11:00:00').getTime()
      },
      {
        id: 'word-other',
        bookId: 'other-book',
        date: '2026-07-02',
        delta: 999,
        createdAt: new Date('2026-07-02T12:00:00').getTime()
      }
    ],
    'stats:ai_logs': [
      {
        id: 'ai-1',
        bookId: 'book-1',
        feature: '续写',
        model: 'model-a',
        date: '2026-07-01',
        promptTokens: 100,
        completionTokens: 50,
        success: true
      },
      {
        id: 'ai-2',
        bookId: 'book-1',
        task: '润色',
        modelName: 'model-b',
        date: '2026-07-02',
        usage: { input_tokens: 200, output_tokens: 100 },
        estimatedCost: 0.25,
        success: false
      }
    ]
  })

  const daily = await analytics.getDailyWords(booksDir, {
    bookId: 'book-1',
    startDate: '2026-07-01',
    endDate: '2026-07-03'
  })
  assert.deepEqual(
    daily.map(({ date, words, entries }) => ({ date, words, entries })),
    [
      { date: '2026-07-01', words: 120, entries: 2 },
      { date: '2026-07-02', words: 80, entries: 1 },
      { date: '2026-07-03', words: 0, entries: 0 }
    ]
  )

  const tokens = await analytics.getTokenStats(booksDir, {
    bookId: 'book-1',
    startDate: '2026-07-01',
    endDate: '2026-07-01'
  })
  assert.equal(tokens.promptTokens, 100)
  assert.equal(tokens.completionTokens, 50)
  assert.equal(tokens.totalTokens, 150)
  assert.equal(tokens.totalCalls, 1)
  assert.equal(tokens.successfulCalls, 1)
  assert.equal(tokens.totalCost, 0.00025)
  assert.equal(tokens.byFeature[0].feature, '续写')

  const overview = await analytics.getOverview(booksDir, {})
  assert.equal(overview.bookCount, 2)
  assert.equal(overview.totalWords, 5)
  assert.equal(overview.chapterCount, 3)
  assert.equal(overview.bookStats.find((book) => book.id === 'download-1').totalWords, 0)
  assert.equal(
    overview.bookStats.find((book) => book.id === 'download-1').excludedFromWritingStats,
    true
  )

  const habit = await analytics.getWritingHabit(booksDir, {
    bookId: 'book-1',
    startDate: '2026-07-01',
    endDate: '2026-07-03'
  })
  assert.equal(habit.activeDays, 2)
  assert.equal(habit.bestDay.words, 120)
  assert.equal(habit.weekday.reduce((sum, row) => sum + row.words, 0), 200)

  const sessions = await analytics.getSessionStats(booksDir, { bookId: 'book-1' })
  assert.equal(sessions.sessionCount, 2)
  assert.equal(sessions.totalWords, 200)
  assert.equal(sessions.sessions.at(-1).entries, 1)

  const weekly = await analytics.getWeeklyReport(booksDir, {
    bookId: 'book-1',
    date: '2026-07-02'
  })
  assert.equal(weekly.type, 'week')
  assert.equal(weekly.totalWords, 200)
  assert.match(weekly.summary, /本周新增 200 字/)
  assert.match(weekly.summary, /AI 使用 450 tokens/)

  const monthly = await analytics.getMonthlyReport(booksDir, {
    bookId: 'book-1',
    date: '2026-07-15'
  })
  assert.equal(monthly.type, 'month')
  assert.equal(monthly.period.label, '2026-07')
  assert.equal(monthly.activeDays, 2)

  writeJson(storeFile, { 'stats:word_logs': { invalid: true } })
  assert.throws(
    () => analytics.getDailyWords(booksDir, { days: 1 }),
    /字数日志格式异常/
  )

  fs.writeFileSync(storeFile, '{broken', 'utf-8')
  assert.throws(() => analytics.getTokenStats(booksDir), /统计本地记录读取失败/)

  writeJson(storeFile, [])
  await assert.rejects(() => analytics.getOverview(booksDir), /统计本地记录格式异常/)
} finally {
  process.chdir(originalCwd)
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('后端统计服务测试通过')

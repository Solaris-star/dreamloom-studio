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

const goalServiceSource = readProjectFile('src/main/services/goalService.js')
const statisticsServiceSource = readProjectFile('src/renderer/src/service/statisticsService.js')

for (const expected of [
  'throw new Error(`写作目标本地记录读取失败：${error.message}`)',
  "throw new Error('写作目标本地记录格式异常，已停止读取写作目标')",
  "throw new Error('写作目标列表格式异常，已停止读取写作目标以免掩盖原始记录问题')",
  "throw new Error('写作目标列表格式异常，已停止写入以免覆盖原始记录')",
  'function readGoalsRows()',
  'function requireGoalRows(goals)',
  'return readGoalsRows().map(normalizeGoal)',
  'storeSet(GOALS_KEY, requireGoalRows(goals).map(normalizeGoal))',
  'const deletedGoal = goals.find((goal) => goal.id === id)',
  'return { success: true, id: deletedGoal.id, item: calculateProgress(deletedGoal, booksDir), items: listGoals(booksDir) }'
]) {
  assertIncludes(goalServiceSource, expected, `goal service missing ${expected}`)
}

for (const forbidden of [
  'const store = readJson(STORE_FILE, {})',
  "return store && typeof store === 'object' ? store : {}",
  'function asArray(value)',
  'asArray(storeGet(GOALS_KEY, []))',
  'storeSet(GOALS_KEY, asArray(goals).map(normalizeGoal))'
]) {
  assert(!goalServiceSource.includes(forbidden), `goal service must not contain ${forbidden}`)
}

for (const expected of [
  'result?.success !== true',
  "throw new Error('写作目标接口返回格式异常')",
  'throw new Error(result?.message || `${label}失败`)',
  'requireArray(result.items, `${label}列表`)',
  'throw new Error(`${label}接口返回目标不匹配`)',
  'throw new Error(`${label}后目标仍在列表中`)',
  "return requireGoalWriteResult(result, '删除目标', { expectedId: id, requireDeletedId: true })"
]) {
  assertIncludes(statisticsServiceSource, expected, `statistics goal client missing ${expected}`)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'goal-redline-'))
const originalCwd = process.cwd()

try {
  process.chdir(tempRoot)
  mkdirSync('books', { recursive: true })
  const goalService = await import(`../src/main/services/goalService.js?goal-redline-${Date.now()}`)

  writeFileSync('.store.json', '{"stats:goals":', 'utf8')
  assert.throws(
    () => goalService.listGoals(join(tempRoot, 'books')),
    /写作目标本地记录读取失败/,
    'goal reads should reject broken store JSON'
  )
  assert.equal(readFileSync('.store.json', 'utf8'), '{"stats:goals":')

  writeFileSync('.store.json', JSON.stringify(['broken-root']), 'utf8')
  assert.throws(
    () => goalService.listGoals(join(tempRoot, 'books')),
    /写作目标本地记录格式异常/,
    'goal reads should reject a non-object store root'
  )
  assert.throws(
    () => goalService.createGoal({ title: '本月目标', targetValue: 1000 }, join(tempRoot, 'books')),
    /写作目标本地记录格式异常/,
    'goal writes should stop when store root is malformed'
  )
  assert.equal(readFileSync('.store.json', 'utf8'), JSON.stringify(['broken-root']))

  writeFileSync('.store.json', JSON.stringify({ 'stats:goals': { broken: true } }), 'utf8')
  assert.throws(
    () => goalService.listGoals(join(tempRoot, 'books')),
    /写作目标列表格式异常/,
    'goal reads should reject a malformed stored goal list'
  )
  assert.throws(
    () => goalService.createGoal({ title: '本月目标', targetValue: 1000 }, join(tempRoot, 'books')),
    /写作目标列表格式异常/,
    'goal writes should stop when the stored goal list is malformed'
  )
  assert.equal(
    readFileSync('.store.json', 'utf8'),
    JSON.stringify({ 'stats:goals': { broken: true } })
  )

  writeFileSync('.store.json', JSON.stringify({}), 'utf8')
  writeFileSync(
    '.store.json',
    JSON.stringify({
      'stats:word_logs': [
        {
          id: 'word-today',
          bookId: 'book-1',
          date: new Date().toISOString().slice(0, 10),
          delta: 300,
          createdAt: Date.now()
        },
        {
          id: 'word-range',
          bookId: 'book-1',
          date: '2026-07-01',
          delta: 200,
          createdAt: new Date('2026-07-01T09:00:00').getTime()
        }
      ]
    }),
    'utf8'
  )
  const createResult = goalService.createGoal(
    {
      id: 'goal-range',
      title: '本月目标',
      type: 'range',
      bookId: 'book-1',
      targetValue: 1000,
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    },
    join(tempRoot, 'books')
  )
  assert.equal(createResult.success, true)
  assert.equal(createResult.item.title, '本月目标')
  assert.equal(createResult.item.currentValue, 500)
  assert.equal(createResult.item.percent, 50)
  assert.equal(createResult.item.remaining, 500)
  assert.equal(Array.isArray(JSON.parse(readFileSync('.store.json', 'utf8'))['stats:goals']), true)

  const dailyResult = goalService.createGoal(
    {
      id: 'goal-daily',
      title: '今日目标',
      type: 'daily',
      bookId: 'book-1',
      targetValue: 300
    },
    join(tempRoot, 'books')
  )
  assert.equal(dailyResult.success, true)
  assert.equal(dailyResult.item.currentValue, 300)
  assert.equal(dailyResult.item.percent, 100)
  assert.equal(dailyResult.item.status, 'completed')

  const totalResult = goalService.createGoal(
    {
      id: 'goal-total',
      title: '全书目标',
      type: 'total',
      bookId: 'book-1',
      targetValue: 1000
    },
    join(tempRoot, 'books')
  )
  assert.equal(totalResult.success, true)
  assert.equal(totalResult.item.currentValue, 0)
  assert.equal(totalResult.item.percent, 0)

  assert.deepEqual(
    goalService.createGoal({ title: '', targetValue: 1000 }, join(tempRoot, 'books')),
    { success: false, message: '目标名称不能为空' }
  )
  assert.deepEqual(
    goalService.createGoal({ title: '无效目标', targetValue: 0 }, join(tempRoot, 'books')),
    { success: false, message: '目标字数必须大于 0' }
  )
  assert.deepEqual(
    goalService.updateGoal('missing', { targetValue: 2000 }, join(tempRoot, 'books')),
    { success: false, message: '目标不存在' }
  )
  assert.deepEqual(
    goalService.updateGoal('goal-range', { title: '   ' }, join(tempRoot, 'books')),
    { success: false, message: '目标名称不能为空' }
  )
  assert.deepEqual(
    goalService.updateGoal('goal-range', { targetValue: 0 }, join(tempRoot, 'books')),
    { success: false, message: '目标字数必须大于 0' }
  )

  const updateResult = goalService.updateGoal(
    'goal-range',
    { title: '调整后的目标', targetValue: 400 },
    join(tempRoot, 'books')
  )
  assert.equal(updateResult.success, true)
  assert.equal(updateResult.item.id, 'goal-range')
  assert.equal(updateResult.item.title, '调整后的目标')
  assert.equal(updateResult.item.percent, 100)
  assert.equal(updateResult.item.targetValue, 400)

  const listedGoals = goalService.listGoals(join(tempRoot, 'books'))
  assert.equal(listedGoals.length, 3)
  assert.equal(listedGoals.at(-1).status, 'completed')

  assert.deepEqual(goalService.deleteGoal('missing', join(tempRoot, 'books')), {
    success: false,
    message: '目标不存在'
  })
  const deleteResult = goalService.deleteGoal(createResult.item.id, join(tempRoot, 'books'))
  assert.equal(deleteResult.success, true)
  assert.equal(deleteResult.id, createResult.item.id)
  assert.equal(deleteResult.item.id, createResult.item.id)
  assert.equal(
    deleteResult.items.some((goal) => goal.id === createResult.item.id),
    false,
    'delete result should not keep the deleted goal in returned items'
  )
} finally {
  process.chdir(originalCwd)
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('goal read redline guard tests passed')

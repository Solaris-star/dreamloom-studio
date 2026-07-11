import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { resolve } from 'node:path'
import { writeJson } from './webJsonRepository.js'
import { getOverview, getDailyWords, toDateKey } from './analyticsService.js'

const STORE_FILE = resolve('.store.json')
const GOALS_KEY = 'stats:goals'

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return {}
  let store
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8') || '{}')
  } catch (error) {
    throw new Error(`写作目标本地记录读取失败：${error.message}`)
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('写作目标本地记录格式异常，已停止读取写作目标')
  }
  return store
}

function writeStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('写作目标本地记录格式异常，已停止写入以免覆盖原始记录')
  }
  writeJson(STORE_FILE, store)
}

function storeGet(key, fallback) {
  const store = readStore()
  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback
}

function storeSet(key, value) {
  const store = readStore()
  store[key] = value
  writeStore(store)
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readGoalsRows() {
  const value = storeGet(GOALS_KEY, undefined)
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error('写作目标列表格式异常，已停止读取写作目标以免掩盖原始记录问题')
  }
  return value.filter((item) => item != null)
}

function requireGoalRows(goals) {
  if (!Array.isArray(goals)) {
    throw new Error('写作目标列表格式异常，已停止写入以免覆盖原始记录')
  }
  return goals.filter((item) => item != null)
}

function normalizeGoal(raw = {}) {
  const now = new Date().toISOString()
  const createdAt = raw.createdAt || now
  const targetValue = Math.max(
    0,
    Math.round(asNumber(raw.targetValue ?? raw.targetWords ?? raw.target, 0))
  )
  const type = String(raw.type || 'range').trim() || 'range'
  const title = String(
    raw.title || raw.name || (type === 'daily' ? '每日写作目标' : '写作目标')
  ).trim()

  return {
    id: String(raw.id || `goal_${randomUUID()}`),
    title,
    type,
    bookId: String(raw.bookId || raw.bookName || ''),
    targetValue,
    startDate: raw.startDate ? toDateKey(raw.startDate) : toDateKey(createdAt),
    endDate: raw.endDate ? toDateKey(raw.endDate) : '',
    status: String(raw.status || 'active'),
    note: String(raw.note || ''),
    createdAt,
    updatedAt: raw.updatedAt || createdAt
  }
}

function readGoals() {
  return readGoalsRows().map(normalizeGoal)
}

function writeGoals(goals) {
  storeSet(GOALS_KEY, requireGoalRows(goals).map(normalizeGoal))
}

export function calculateProgress(goalInput, booksDir = '') {
  const goal = normalizeGoal(goalInput)
  let currentValue = 0

  if (goal.type === 'daily') {
    const todayRows = getDailyWords(booksDir, {
      bookId: goal.bookId,
      startDate: toDateKey(),
      endDate: toDateKey()
    })
    currentValue = todayRows.reduce((sum, row) => sum + row.words, 0)
  } else if (goal.type === 'total') {
    currentValue = getOverview(booksDir, { bookId: goal.bookId }).totalWords
  } else {
    const rows = getDailyWords(booksDir, {
      bookId: goal.bookId,
      startDate: goal.startDate,
      endDate: goal.endDate || toDateKey()
    })
    currentValue = rows.reduce((sum, row) => sum + row.words, 0)
  }

  const percent =
    goal.targetValue > 0 ? Math.min(100, Math.round((currentValue / goal.targetValue) * 100)) : 0
  const remaining = Math.max(0, goal.targetValue - currentValue)
  const today = toDateKey()
  const overdue = Boolean(goal.endDate && goal.endDate < today && percent < 100)
  const computedStatus =
    percent >= 100 ? 'completed' : overdue ? 'overdue' : goal.status || 'active'

  return {
    ...goal,
    currentValue,
    percent,
    remaining,
    overdue,
    status: computedStatus
  }
}

export function listGoals(booksDir = '') {
  return readGoals()
    .map((goal) => calculateProgress(goal, booksDir))
    .sort((a, b) => {
      const statusWeight = { active: 0, overdue: 1, completed: 2, paused: 3 }
      const aw = statusWeight[a.status] ?? 0
      const bw = statusWeight[b.status] ?? 0
      if (aw !== bw) return aw - bw
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    })
}

export function createGoal(input = {}, booksDir = '') {
  const goal = normalizeGoal({
    ...input,
    id: input.id || `goal_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  if (!goal.title) return { success: false, message: '目标名称不能为空' }
  if (!goal.targetValue) return { success: false, message: '目标字数必须大于 0' }
  const goals = readGoals()
  goals.unshift(goal)
  writeGoals(goals)
  return { success: true, item: calculateProgress(goal, booksDir), items: listGoals(booksDir) }
}

export function updateGoal(id, patch = {}, booksDir = '') {
  const goals = readGoals()
  const index = goals.findIndex((goal) => goal.id === id)
  if (index === -1) return { success: false, message: '目标不存在' }

  const updated = normalizeGoal({
    ...goals[index],
    ...patch,
    id: goals[index].id,
    createdAt: goals[index].createdAt,
    updatedAt: new Date().toISOString()
  })
  if (!updated.targetValue) return { success: false, message: '目标字数必须大于 0' }
  goals[index] = updated
  writeGoals(goals)
  return { success: true, item: calculateProgress(updated, booksDir), items: listGoals(booksDir) }
}

export function deleteGoal(id, booksDir = '') {
  const goals = readGoals()
  const deletedGoal = goals.find((goal) => goal.id === id)
  const nextGoals = goals.filter((goal) => goal.id !== id)
  if (nextGoals.length === goals.length) return { success: false, message: '目标不存在' }
  writeGoals(nextGoals)
  return { success: true, id: deletedGoal.id, item: calculateProgress(deletedGoal, booksDir), items: listGoals(booksDir) }
}

export default {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  calculateProgress
}

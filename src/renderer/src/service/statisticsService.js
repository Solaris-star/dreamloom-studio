/**
 * 数据统计服务
 * 处理写作字数记录、AI 使用记录、写作目标等统计逻辑
 */

function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
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

const WORD_LOGS_KEY = 'stats:word_logs'
const AI_LOGS_KEY = 'stats:ai_logs'

function requireElectronMethod(name, fallback = `统计接口不可用：${name}`) {
  const method = globalThis.window?.electron?.[name]
  if (typeof method !== 'function') {
    throw new Error(fallback)
  }
  return method
}

async function callElectronApi(name, payload) {
  try {
    const method = requireElectronMethod(name)
    const result = await method(payload)
    if (result?.success === false) {
      throw new Error(result.message || '统计接口调用失败')
    }
    if (result?.success !== true) {
      throw new Error(`统计接口返回格式异常：${name}`)
    }
    if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data
    if (Object.prototype.hasOwnProperty.call(result, 'items')) return result.items
    throw new Error(`统计接口返回格式异常：${name}`)
  } catch (error) {
    console.warn(`[StatisticsService] ${name} failed`, error)
    throw error
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label}接口返回格式异常`)
  }
  return value
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label}接口返回格式异常`)
  }
  return value
}

function requireOptionalArray(value, label) {
  if (value === undefined) return []
  return requireArray(value, label)
}

function requireDailyStatsMap(value, label) {
  const rows = requirePlainObject(value, label)
  for (const [bookName, stats] of Object.entries(rows)) {
    if (!isPlainObject(stats)) {
      throw new Error(`${label}接口返回格式异常：${bookName || '-'}`)
    }
  }
  return rows
}

function requireBookDailyStatsResult(result, label) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || `${label}读取失败`)
  }
  const data = requirePlainObject(result.data, label)
  const todayStats = result.stats?.today || data[localDateKey()]
  if (todayStats == null) {
    return {
      data,
      todayAddWords: 0
    }
  }
  if (!isPlainObject(todayStats)) {
    throw new Error(`${label}接口返回格式异常`)
  }
  return {
    data,
    todayAddWords: toNumber(todayStats.addWords ?? todayStats.netWords, 0)
  }
}

async function readStoreArray(key, label) {
  if (!window.electronStore?.get) {
    throw new Error('统计日志存储接口不可用')
  }
  const value = await window.electronStore.get(key)
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error(`${label}格式异常，已停止写入以免覆盖原始记录`)
  }
  return value
}

async function writeStoreValue(key, value, label) {
  if (typeof window.electronStore?.set !== 'function') {
    throw new Error('统计日志存储接口不可用')
  }
  const result = await window.electronStore.set(key, value)
  if (result?.success !== true) {
    throw new Error(result?.message || `${label}写入失败`)
  }
  if (result.key !== key) {
    throw new Error(`${label}写入失败：接口返回的设置项不匹配`)
  }
  return result
}

function requireGoalWriteResult(
  result,
  label,
  { requireItem = false, expectedId = '', requireDeletedId = false } = {}
) {
  if (result?.success !== true) {
    throw new Error(result?.message || `${label}失败`)
  }
  let item = null
  if (requireItem && !isPlainObject(result.item)) {
    throw new Error(`${label}接口返回格式异常`)
  }
  if (requireItem) {
    item = result.item
    if (!String(item.id || '')) {
      throw new Error(`${label}接口返回格式异常`)
    }
    if (expectedId && String(item.id) !== String(expectedId)) {
      throw new Error(`${label}接口返回目标不匹配`)
    }
  }
  if (requireDeletedId) {
    const deletedId = String(
      result.id || result.deletedId || result.goalId || result.item?.id || ''
    )
    if (!deletedId) {
      throw new Error(`${label}接口返回格式异常`)
    }
    if (expectedId && deletedId !== String(expectedId)) {
      throw new Error(`${label}接口返回目标不匹配`)
    }
  }
  if (result.items !== undefined) {
    const items = requireArray(result.items, `${label}列表`)
    if (
      requireDeletedId &&
      expectedId &&
      items.some((goal) => String(goal?.id || '') === String(expectedId))
    ) {
      throw new Error(`${label}后目标仍在列表中`)
    }
  }
  return result
}

function normalizeBookId(bookId) {
  return bookId && bookId !== 'all' ? bookId : ''
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeAiUsageLog(usage = {}) {
  const rawUsage = usage.usage && typeof usage.usage === 'object' ? usage.usage : {}
  const promptTokens = toNumber(
    usage.promptTokens ??
      usage.prompt_tokens ??
      usage.inputTokens ??
      usage.input_tokens ??
      rawUsage.promptTokens ??
      rawUsage.prompt_tokens ??
      rawUsage.input_tokens,
    0
  )
  const completionTokens = toNumber(
    usage.completionTokens ??
      usage.completion_tokens ??
      usage.outputTokens ??
      usage.output_tokens ??
      rawUsage.completionTokens ??
      rawUsage.completion_tokens ??
      rawUsage.output_tokens,
    0
  )
  const totalTokens = toNumber(
    usage.totalTokens ?? usage.total_tokens ?? rawUsage.totalTokens ?? rawUsage.total_tokens,
    promptTokens + completionTokens
  )
  const imageRequests = toNumber(
    usage.imageRequests ??
      usage.image_requests ??
      rawUsage.imageRequests ??
      rawUsage.image_requests,
    0
  )
  const inputPrice = toNumber(usage.inputPricePerMillionTokens, 0)
  const outputPrice = toNumber(usage.outputPricePerMillionTokens, 0)
  const imagePrice = toNumber(usage.imagePricePerRequest, 0)
  const explicitCost = toNumber(usage.estimatedCost ?? usage.cost, Number.NaN)
  const estimatedCost = Number.isFinite(explicitCost)
    ? explicitCost
    : (promptTokens / 1_000_000) * inputPrice +
      (completionTokens / 1_000_000) * outputPrice +
      imageRequests * imagePrice

  return {
    ...usage,
    promptTokens,
    completionTokens,
    totalTokens,
    imageRequests,
    estimatedCost,
    success: usage.success === true,
    error: usage.error ? String(usage.error) : ''
  }
}

class StatisticsService {
  /**
   * 记录字数变化
   * @param {Object} data
   */
  async recordWordCount({ bookId, chapterId, wordCount, delta }) {
    if (delta === 0) return

    const logs = await this.getWordLogs()
    const now = new Date()
    const dateStr = localDateKey(now)

    const newLog = {
      id: uuidv4(),
      bookId,
      chapterId,
      date: dateStr,
      wordCount,
      delta,
      createdAt: Date.now()
    }

    logs.push(newLog)

    // 限制记录数量，防止无限增长
    const limitedLogs = logs.slice(-10000)
    await writeStoreValue(WORD_LOGS_KEY, limitedLogs, '字数日志')
  }

  /**
   * 记录 AI 使用情况
   * @param {Object} data
   */
  async recordAiUsage(usage) {
    const logs = await this.getAiLogs()
    const newLog = {
      id: uuidv4(),
      ...normalizeAiUsageLog(usage),
      createdAt: Date.now()
    }
    logs.push(newLog)
    const limitedLogs = logs.slice(-5000)
    await writeStoreValue(AI_LOGS_KEY, limitedLogs, 'AI 日志')
  }

  /**
   * 获取字数记录
   */
  async getWordLogs() {
    return readStoreArray(WORD_LOGS_KEY, '字数日志')
  }

  /**
   * 获取 AI 日志
   */
  async getAiLogs() {
    return readStoreArray(AI_LOGS_KEY, 'AI 日志')
  }

  async getOverview(timeRange = 'all', bookId = null) {
    const remote = await callElectronApi('getAnalyticsOverview', {
      timeRange,
      bookId: normalizeBookId(bookId)
    })
    const overview = requirePlainObject(remote, '统计概览')
    return {
      ...overview,
      bookStats: requireArray(overview.bookStats, '书籍字数统计'),
      source: overview.source || 'local-analytics'
    }
  }

  /**
   * 计算连续写作天数
   */
  calculateStreak(logs) {
    if (!logs.length) return { current: 0, max: 0 }

    const dates = Array.from(new Set(logs.map((l) => l.date))).sort()
    if (!dates.length) return { current: 0, max: 0 }

    let maxStreak = 0
    let currentStreak = 0
    let lastDate = null

    const oneDay = 24 * 60 * 60 * 1000

    for (const dateStr of dates) {
      const currentDate = new Date(dateStr)
      if (lastDate) {
        const diff = (currentDate - lastDate) / oneDay
        if (diff === 1) {
          currentStreak++
        } else if (diff > 1) {
          maxStreak = Math.max(maxStreak, currentStreak)
          currentStreak = 1
        }
      } else {
        currentStreak = 1
      }
      lastDate = currentDate
    }
    maxStreak = Math.max(maxStreak, currentStreak)

    // 检查今天是否在连续中
    const today = localDateKey()
    const yesterday = localDateKey(Date.now() - oneDay)

    const hasToday = dates.includes(today)
    const hasYesterday = dates.includes(yesterday)

    let current = 0
    if (hasToday) {
      current = currentStreak
    } else if (hasYesterday) {
      // 虽然今天还没写，但昨天写了，连续还没断（如果算到昨天的话）
      // 这里根据需求定义，通常认为今天没写就算断了，或者允许到今天结束
      current = currentStreak
    }

    return { current, max: maxStreak }
  }

  /**
   * 获取趋势图数据
   */
  async getTrendData(days = 30, bookId = null) {
    const remote = await callElectronApi('getAnalyticsDailyWords', {
      days,
      bookId: normalizeBookId(bookId)
    })
    return requireArray(remote, '每日写作统计').map((item) => {
      const row = requirePlainObject(item, '每日写作统计条目')
      const date = String(row.date || '')
      if (!date) throw new Error('每日写作统计接口返回格式异常')
      return {
        date,
        delta: row.delta ?? row.words ?? row.count ?? 0,
        words: row.words ?? row.count ?? row.delta ?? 0
      }
    })
  }

  /**
   * 获取热力图数据
   */
  async getHeatmapData(days = 365, bookId = null) {
    const remote = await callElectronApi('getAnalyticsWritingHabit', {
      days,
      bookId: normalizeBookId(bookId)
    })
    const habit = requirePlainObject(remote, '写作习惯')
    return requireArray(habit.heatmap, '写作热力图').map((item) => {
      const row = requirePlainObject(item, '写作热力图条目')
      const date = String(row.date || '')
      if (!date) throw new Error('写作习惯接口返回格式异常')
      return {
        date,
        count: row.count ?? row.words ?? 0
      }
    })
  }

  async getAllBooksDailyStats() {
    const method = requireElectronMethod('getAllBooksDailyStats', '每日字数统计接口不可用')
    const result = await method()
    if (result?.success !== true) {
      throw new Error(result?.message || result?.error || '读取每日字数统计失败')
    }
    return requireDailyStatsMap(result.data, '每日字数统计')
  }

  async getBookDailyStats(bookName) {
    const targetBookName = String(bookName || '').trim()
    if (!targetBookName) {
      throw new Error('读取书籍每日统计失败：缺少作品名')
    }
    const method = requireElectronMethod('getBookDailyStats', '书籍每日统计接口不可用')
    return requireBookDailyStatsResult(await method(targetBookName), '书籍每日统计')
  }

  /**
   * 获取目标
   */
  async getGoals() {
    const remote = await callElectronApi('listWritingGoals', {})
    if (Array.isArray(remote)) return remote
    throw new Error('写作目标接口返回格式异常')
  }

  /**
   * 保存目标
   */
  async saveGoal(goal) {
    const createWritingGoal = requireElectronMethod('createWritingGoal', '写作目标接口不可用')
    const updateWritingGoal = requireElectronMethod('updateWritingGoal', '写作目标接口不可用')
    const result = goal.id ? await updateWritingGoal(goal.id, goal) : await createWritingGoal(goal)
    return requireGoalWriteResult(result, '保存目标', {
      requireItem: true,
      expectedId: goal.id || ''
    }).item
  }

  async createGoal(goal) {
    const createWritingGoal = requireElectronMethod('createWritingGoal', '创建目标接口不可用')
    const result = await createWritingGoal(goal)
    return requireGoalWriteResult(result, '创建目标', {
      requireItem: true,
      expectedId: goal?.id || ''
    })
  }

  async updateGoal(id, patch) {
    const updateWritingGoal = requireElectronMethod('updateWritingGoal', '更新目标接口不可用')
    const result = await updateWritingGoal(id, patch)
    return requireGoalWriteResult(result, '更新目标', { requireItem: true, expectedId: id })
  }

  async deleteGoal(id) {
    const deleteWritingGoal = requireElectronMethod('deleteWritingGoal', '删除目标接口不可用')
    const result = await deleteWritingGoal(id)
    return requireGoalWriteResult(result, '删除目标', { expectedId: id, requireDeletedId: true })
  }

  async getTokenStats(params = {}) {
    const remote = requirePlainObject(
      await callElectronApi('getAnalyticsTokenStats', params),
      'AI 使用统计'
    )
    return {
      ...remote,
      byFeature: requireArray(remote.byFeature, 'AI 功能用量'),
      byModel: requireOptionalArray(remote.byModel, 'AI 模型用量'),
      daily: requireOptionalArray(remote.daily, 'AI 每日用量')
    }
  }

  async getSessionStats(params = {}) {
    const remote = requirePlainObject(
      await callElectronApi('getAnalyticsSessionStats', params),
      '写作会话统计'
    )
    return {
      ...remote,
      sessions: requireArray(remote.sessions, '写作会话列表')
    }
  }

  async getWeeklyReport(params = {}) {
    const remote = requirePlainObject(
      await callElectronApi('getAnalyticsWeeklyReport', params),
      '周报'
    )
    requirePlainObject(remote.period, '周报周期')
    return {
      ...remote,
      daily: requireArray(remote.daily, '周报每日统计')
    }
  }

  async getMonthlyReport(params = {}) {
    const remote = requirePlainObject(
      await callElectronApi('getAnalyticsMonthlyReport', params),
      '月报'
    )
    requirePlainObject(remote.period, '月报周期')
    return {
      ...remote,
      daily: requireArray(remote.daily, '月报每日统计')
    }
  }
}

export const statisticsService = new StatisticsService()

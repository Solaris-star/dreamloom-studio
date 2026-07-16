import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const TASK_DIR = '.editor-agent'
const TASK_FILE = 'tasks.json'
const MAX_TASKS = 200
const MAX_EVENTS = 80
const MAX_TEXT_LENGTH = 1200
const taskProgressEmitter = new EventEmitter()

taskProgressEmitter.setMaxListeners(200)

function nowIso() {
  return new Date().toISOString()
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    return data == null ? fallback : data
  } catch (error) {
    throw new Error(`读取 Agent 任务记录失败：${error.message}`)
  }
}

function safeWriteJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  // 原子写，避免并发 enqueue 时 tasks.json 拼接损坏
  const payload = JSON.stringify(data, null, 2)
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  )
  try {
    fs.writeFileSync(temporaryPath, payload, 'utf-8')
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // keep original write error
    }
    throw error
  }
}

function truncate(value, max = MAX_TEXT_LENGTH) {
  const text = cleanText(String(value || ''))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}...`
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function textArray(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : []
}

function skillRecord(input = {}) {
  const outputMode = cleanText(input.outputMode) || 'preview'
  return {
    skillId: cleanText(input.skillId),
    skillKey: cleanText(input.skillKey),
    outputMode,
    canWriteChapter: input.canWriteChapter === true && outputMode === 'chapter_write',
    inputScopes: textArray(input.inputScopes),
    requiredContext: textArray(input.requiredContext),
    references: textArray(input.references)
  }
}

function taskStorePath(bookPath) {
  return join(bookPath, TASK_DIR, TASK_FILE)
}

function readTaskRows(bookPath) {
  try {
    const data = safeReadJson(taskStorePath(bookPath), { tasks: [] })
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.tasks)) {
      return data.tasks
    }
    throw new Error('读取 Agent 任务记录失败：本地记录格式不正确')
  } catch (error) {
    // 损坏文件时隔离并重建，避免整本书 Agent 队列永久不可用
    const filePath = taskStorePath(bookPath)
    if (fs.existsSync(filePath)) {
      // 同一毫秒内多次损坏时避免 .broken.<ts> 撞名导致 rename 失败
      const brokenPath = `${filePath}.broken.${Date.now()}.${Math.random().toString(16).slice(2)}`
      try {
        fs.renameSync(filePath, brokenPath)
      } catch {
        // ignore quarantine failure
      }
    }
    writeTaskRows(bookPath, [])
    if (String(error?.message || '').includes('读取 Agent 任务记录失败')) {
      // rethrow parse errors after quarantine so caller sees first failure once
    }
    return []
  }
}

function writeTaskRows(bookPath, rows) {
  safeWriteJson(taskStorePath(bookPath), { tasks: rows.slice(0, MAX_TASKS) })
}

function emitAgentTaskProgress(bookPath, task, patch = {}) {
  const hasNewEvent = normalizeArray(patch.events).length > 0
  taskProgressEmitter.emit('progress', {
    type: 'agent_task_updated',
    bookPath,
    bookName: task.bookName,
    bookId: task.bookId,
    taskId: task.id,
    chapterId: task.chapterId,
    generationId: task.generationId,
    sourceGenerationId: task.sourceGenerationId,
    repairGenerationId: task.repairGenerationId,
    writeTaskId: task.writeTaskId,
    skillId: task.skillId,
    skillKey: task.skillKey,
    outputMode: task.outputMode,
    canWriteChapter: task.canWriteChapter,
    inputScopes: task.inputScopes,
    requiredContext: task.requiredContext,
    references: task.references,
    updatedAt: task.updatedAt,
    task,
    event: hasNewEvent ? task.events.at(-1) || null : null
  })
}

function eventRecord(input = {}) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : undefined
  const bookContext =
    input.bookContext && typeof input.bookContext === 'object' ? input.bookContext : undefined
  const taskMemory =
    input.taskMemory && typeof input.taskMemory === 'object' ? input.taskMemory : undefined
  const sourceCount = Number.isFinite(Number(input.sourceCount))
    ? Number(input.sourceCount)
    : Number.isFinite(Number(bookContext?.sourceCount))
      ? Number(bookContext.sourceCount)
      : undefined
  const contextChars = Number.isFinite(Number(input.contextChars))
    ? Number(input.contextChars)
    : Number.isFinite(Number(bookContext?.contextChars))
      ? Number(bookContext.contextChars)
      : Number.isFinite(Number(taskMemory?.contextChars))
        ? Number(taskMemory.contextChars)
        : undefined
  const sources = Array.isArray(input.sources)
    ? input.sources
    : Array.isArray(bookContext?.sources)
      ? bookContext.sources
      : Array.isArray(taskMemory?.sources)
        ? taskMemory.sources
        : undefined

  return {
    id: input.id || randomUUID(),
    type: cleanText(input.type) || 'event',
    role: cleanText(input.role),
    title: cleanText(input.title),
    status: cleanText(input.status) || 'done',
    content: truncate(input.content || input.summary || '', 900),
    startedAt: cleanText(input.startedAt),
    finishedAt: cleanText(input.finishedAt) || nowIso(),
    modelUsed: cleanText(input.modelUsed),
    usage: input.usage && typeof input.usage === 'object' ? input.usage : {},
    generationId: cleanText(input.generationId),
    sourceGenerationId: cleanText(input.sourceGenerationId),
    repairGenerationId: cleanText(input.repairGenerationId),
    writeTaskId: cleanText(input.writeTaskId),
    ...skillRecord(input),
    checkId: cleanText(input.checkId),
    issueCount: Number.isFinite(Number(input.issueCount)) ? Number(input.issueCount) : undefined,
    taskCount: Number.isFinite(Number(input.taskCount))
      ? Number(input.taskCount)
      : Number.isFinite(Number(taskMemory?.taskCount))
        ? Number(taskMemory.taskCount)
        : undefined,
    eventCount: Number.isFinite(Number(input.eventCount))
      ? Number(input.eventCount)
      : Number.isFinite(Number(taskMemory?.eventCount))
        ? Number(taskMemory.eventCount)
        : undefined,
    chunkCount: Number.isFinite(Number(input.chunkCount)) ? Number(input.chunkCount) : undefined,
    wordCount: Number.isFinite(Number(input.wordCount)) ? Number(input.wordCount) : undefined,
    applyAction: cleanText(input.applyAction),
    queueName: cleanText(input.queueName),
    jobId: cleanText(input.jobId),
    metadata,
    taskMemory,
    bookContext,
    sourceCount,
    contextChars,
    sources
  }
}

function normalizeStepEvent(step = {}) {
  return eventRecord({
    id: step.id,
    type: step.stage || 'agent_step',
    role: step.role,
    title: step.title,
    status: step.status || 'done',
    content: step.content,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    modelUsed: step.modelUsed,
    usage: step.usage,
    metadata: step.metadata,
    taskMemory: step.taskMemory,
    taskCount: step.taskCount,
    eventCount: step.eventCount,
    bookContext: step.bookContext,
    sourceCount: step.sourceCount,
    contextChars: step.contextChars,
    sources: step.sources,
    checkId: step.checkId,
    issueCount: step.issueCount,
    ...skillRecord(step)
  })
}

function normalizeTask(bookPath, input = {}) {
  const createdAt = cleanText(input.createdAt) || nowIso()
  const events = normalizeArray(input.events).map(eventRecord)
  return {
    id: input.id || randomUUID(),
    createdAt,
    updatedAt: cleanText(input.updatedAt) || createdAt,
    finishedAt: cleanText(input.finishedAt),
    status: cleanText(input.status) || 'running',
    bookName: cleanText(input.bookName) || basename(bookPath),
    bookPath,
    bookId: cleanText(input.bookId),
    chapterId: cleanText(input.chapterId),
    sessionId: cleanText(input.sessionId),
    generationId: cleanText(input.generationId),
    sourceGenerationId: cleanText(input.sourceGenerationId),
    repairGenerationId: cleanText(input.repairGenerationId),
    writeTaskId: cleanText(input.writeTaskId),
    ...skillRecord(input),
    title: cleanText(input.title),
    type: cleanText(input.type) || 'custom',
    agentMode: cleanText(input.agentMode) || 'writing',
    modelId: cleanText(input.modelId),
    modelUsed: cleanText(input.modelUsed),
    usage: input.usage && typeof input.usage === 'object' ? input.usage : {},
    queueName: cleanText(input.queueName),
    jobId: cleanText(input.jobId),
    executionMode: cleanText(input.executionMode),
    applyAction: cleanText(input.applyAction),
    issueCount: Number.isFinite(Number(input.issueCount)) ? Number(input.issueCount) : 0,
    review: input.review && typeof input.review === 'object' ? input.review : null,
    error: cleanText(input.error),
    resultPreview: truncate(input.resultPreview || input.result || '', 900),
    promptPreview: truncate(input.promptPreview || input.prompt || input.instruction || '', 700),
    events: events.slice(-MAX_EVENTS)
  }
}

function upsertTask(bookPath, patch = {}) {
  if (!bookPath || !fs.existsSync(bookPath))
    throw new Error('作品目录不存在，无法写入 Agent 任务记录')
  const rows = readTaskRows(bookPath)
  const now = nowIso()
  const current = rows.find((item) => item.id === patch.id) || {}
  const mergedEvents = [
    ...normalizeArray(current.events),
    ...normalizeArray(patch.events).map(eventRecord)
  ].slice(-MAX_EVENTS)
  const next = normalizeTask(bookPath, {
    ...current,
    ...patch,
    events: mergedEvents,
    createdAt: current.createdAt || patch.createdAt || now,
    updatedAt: now
  })
  writeTaskRows(bookPath, [next, ...rows.filter((item) => item.id !== next.id)])
  emitAgentTaskProgress(bookPath, next, patch)
  return next
}

export function createAgentTask(bookPath, input = {}) {
  return upsertTask(bookPath, {
    ...input,
    status: input.status || 'running',
    events: [
      {
        type: 'task_started',
        role: 'system',
        title: '任务开始',
        status: 'running',
        content: input.instruction || input.prompt || ''
      }
    ]
  })
}

export function completeAgentTask(bookPath, taskId, generation = {}) {
  const steps = normalizeArray(generation.agentSteps).map(normalizeStepEvent)
  return upsertTask(bookPath, {
    id: taskId,
    status: generation.review?.passed === false ? 'review_failed' : 'generated',
    finishedAt: nowIso(),
    generationId: generation.id || '',
    ...skillRecord(generation),
    modelUsed: generation.modelUsed || '',
    usage: generation.usage || {},
    review: generation.review || null,
    resultPreview: generation.result || '',
    events: [
      ...steps,
      eventRecord({
        type: 'generation_saved',
        role: 'system',
        title: '生成记录已保存',
        status: 'done',
        content: generation.result || '',
        modelUsed: generation.modelUsed || ''
      })
    ]
  })
}

export function failAgentTask(bookPath, taskId, error, input = {}) {
  return upsertTask(bookPath, {
    id: taskId,
    ...input,
    status: 'failed',
    finishedAt: nowIso(),
    error: error?.message || String(error || '任务失败'),
    events: [
      {
        type: 'task_failed',
        role: 'system',
        title: '任务失败',
        status: 'failed',
        content: error?.message || String(error || '任务失败')
      }
    ]
  })
}

export function cancelAgentTask(bookPath, taskId, input = {}) {
  return upsertTask(bookPath, {
    id: taskId,
    ...input,
    status: 'cancelled',
    finishedAt: nowIso(),
    events: [
      {
        type: 'task_cancelled',
        role: 'system',
        title: '任务已停止',
        status: 'cancelled',
        content: input.content || '用户停止生成。'
      }
    ]
  })
}

export function recordAgentTaskApplication(bookPath, input = {}) {
  const status = input.status || 'applied'
  return upsertTask(bookPath, {
    id: input.taskId,
    generationId: input.generationId || '',
    ...skillRecord(input),
    status,
    finishedAt: nowIso(),
    applyAction: input.applyAction || '',
    events: [
      {
        type: 'generation_applied',
        role: 'system',
        title: '结果应用',
        status,
        content: input.content || '',
        ...skillRecord(input),
        applyAction: input.applyAction || ''
      }
    ]
  })
}

export function recordAgentTaskStream(bookPath, input = {}) {
  return upsertTask(bookPath, {
    id: input.taskId,
    generationId: input.generationId || '',
    ...skillRecord(input),
    status: input.status === 'done' ? 'streamed' : 'running',
    events: [
      {
        type: input.type || 'writer_stream',
        role: input.role || 'writer',
        title: input.title || 'Writer 流式写作',
        status: input.status || 'running',
        content: input.content || '',
        generationId: input.generationId || '',
        ...skillRecord(input),
        modelUsed: input.modelUsed || '',
        usage: input.usage || {},
        chunkCount: input.chunkCount,
        wordCount: input.wordCount
      }
    ]
  })
}

export function recordAgentTaskConsistency(bookPath, input = {}) {
  const issueCount = Number.isFinite(Number(input.issueCount)) ? Number(input.issueCount) : 0
  return upsertTask(bookPath, {
    id: input.taskId,
    generationId: input.generationId || '',
    ...skillRecord(input),
    issueCount,
    status: issueCount > 0 ? 'needs_review' : 'checked',
    events: [
      {
        type: 'consistency_check',
        role: 'checker',
        title: input.title || '一致性检查',
        status: issueCount > 0 ? 'needs_review' : 'done',
        content: input.summary || '',
        ...skillRecord(input),
        checkId: input.checkId || '',
        issueCount,
        applyAction: input.applyAction || ''
      }
    ]
  })
}

export function recordAgentTaskRepair(bookPath, input = {}) {
  const steps = normalizeArray(input.steps).map(normalizeStepEvent)
  const review = input.review && typeof input.review === 'object' ? input.review : null
  const status = input.status || (review?.passed === false ? 'repair_review_failed' : 'repaired')
  return upsertTask(bookPath, {
    id: input.taskId,
    generationId: input.sourceGenerationId || input.generationId || '',
    sourceGenerationId: input.sourceGenerationId || '',
    repairGenerationId: input.repairGenerationId || '',
    ...skillRecord(input),
    issueCount: Number.isFinite(Number(input.issueCount)) ? Number(input.issueCount) : 0,
    status,
    finishedAt: nowIso(),
    review,
    resultPreview: input.result || '',
    events: [
      ...steps,
      eventRecord({
        type: 'repair_saved',
        role: 'system',
        title: '返修稿已保存',
        status,
        content: input.result || '',
        generationId: input.sourceGenerationId || input.generationId || '',
        repairGenerationId: input.repairGenerationId || '',
        ...skillRecord(input),
        checkId: input.checkId || '',
        issueCount: input.issueCount
      })
    ]
  })
}

export function recordAgentTaskRepairFailure(bookPath, input = {}, error) {
  return upsertTask(bookPath, {
    id: input.taskId,
    generationId: input.sourceGenerationId || input.generationId || '',
    sourceGenerationId: input.sourceGenerationId || '',
    ...skillRecord(input),
    status: 'repair_failed',
    error: error?.message || String(error || '返修失败'),
    events: [
      {
        type: 'repair_failed',
        role: 'system',
        title: '返修失败',
        status: 'failed',
        content: error?.message || String(error || '返修失败'),
        ...skillRecord(input),
        checkId: input.checkId || '',
        issueCount: input.issueCount
      }
    ]
  })
}

export function recordAgentTaskQueueEvent(bookPath, input = {}) {
  const status = cleanText(input.status) || 'queued'
  const eventType = cleanText(input.eventType) || `queue_${status}`
  return upsertTask(bookPath, {
    id: input.taskId,
    bookName: input.bookName || '',
    bookId: input.bookId || '',
    chapterId: input.chapterId || '',
    generationId: input.generationId || '',
    repairGenerationId: input.repairGenerationId || '',
    writeTaskId: input.writeTaskId || '',
    ...skillRecord(input),
    title: input.title || '队列写作任务',
    type: input.type || 'cli_write_queue',
    agentMode: input.agentMode || 'writing',
    modelId: input.modelId || '',
    queueName: input.queueName || '',
    jobId: input.jobId || '',
    executionMode: input.executionMode || '',
    status,
    events: [
      {
        type: eventType,
        role: 'queue',
        title: input.eventTitle || input.title || '队列事件',
        status,
        content: input.content || '',
        generationId: input.generationId || '',
        repairGenerationId: input.repairGenerationId || '',
        writeTaskId: input.writeTaskId || '',
        ...skillRecord(input),
        queueName: input.queueName || '',
        jobId: input.jobId || ''
      }
    ]
  })
}

export function listAgentTasks(bookPath, filter = {}) {
  if (!bookPath || !fs.existsSync(bookPath))
    throw new Error('作品目录不存在，无法读取 Agent 任务记录')
  const id = cleanText(filter.id || filter.taskId)
  const generationId = cleanText(filter.generationId)
  const chapterId = cleanText(filter.chapterId)
  const status = cleanText(filter.status)
  const type = cleanText(filter.type)
  const agentMode = cleanText(filter.agentMode)
  const limit = Number(filter.limit)
  const tasks = readTaskRows(bookPath).filter((item) => {
    if (id && item.id !== id) return false
    if (generationId && item.generationId !== generationId) return false
    if (chapterId && item.chapterId !== chapterId) return false
    if (status && item.status !== status) return false
    if (type && item.type !== type) return false
    if (agentMode && item.agentMode !== agentMode) return false
    return true
  })
  return {
    success: true,
    tasks: Number.isFinite(limit) && limit > 0 ? tasks.slice(0, limit) : tasks
  }
}

export function onAgentTaskProgress(listener) {
  if (typeof listener !== 'function') return () => {}
  taskProgressEmitter.on('progress', listener)
  return () => taskProgressEmitter.off('progress', listener)
}

export default {
  createAgentTask,
  completeAgentTask,
  cancelAgentTask,
  failAgentTask,
  recordAgentTaskApplication,
  recordAgentTaskStream,
  recordAgentTaskConsistency,
  recordAgentTaskRepair,
  recordAgentTaskRepairFailure,
  recordAgentTaskQueueEvent,
  listAgentTasks,
  onAgentTaskProgress
}

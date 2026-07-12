import { Queue, Worker } from 'bullmq'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  cancelAgentTask,
  createAgentTask,
  failAgentTask,
  recordAgentTaskConsistency,
  recordAgentTaskQueueEvent
} from './editorAgentTaskService.js'
import { runConsistencyCheck } from './consistencyCheckService.js'
import { loadEnvFile } from './envConfig.js'
import { createTextProvider } from './textGenerationRouter.js'
import { repairNovelChapter, writeNovelChapter } from './novelCliService.js'
import { runWritingSkill } from './writingAgentRunner.js'

const DEFAULT_QUEUE_NAME = 'novel-agent-writing'
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0'
const DEFAULT_ATTEMPTS = 1
const DEFAULT_BACKOFF_DELAY_MS = 3000
const DEFAULT_CANCEL_POLL_INTERVAL_MS = 1000
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 3000
const QUEUE_CANCEL_MESSAGE = '队列任务已请求停止'
const activeQueues = new Map()
const activeWorkers = new Map()
const activeJobControllers = new Map()

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
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

function skillRecordWithFallback(input = {}) {
  const skill = skillRecord(input)
  if (
    skill.skillId ||
    skill.skillKey ||
    skill.outputMode !== 'preview' ||
    skill.canWriteChapter ||
    skill.inputScopes.length ||
    skill.requiredContext.length ||
    skill.references.length
  ) {
    return skill
  }
  return {
    skillId: cleanText(input.skillId || input.skill || input.key || input.type),
    skillKey: cleanText(input.skillKey || input.skill || input.key || input.type),
    outputMode: cleanText(input.outputMode) || 'preview',
    canWriteChapter:
      input.canWriteChapter === true && cleanText(input.outputMode) === 'chapter_write',
    inputScopes: textArray(input.inputScopes),
    requiredContext: textArray(input.requiredContext),
    references: textArray(input.references)
  }
}

function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function numberFromInput(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function integerFromInput(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function nonNegativeIntegerFromInput(value, fallback = 0) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function redisUrlFromInput(options = {}) {
  return cleanText(options.redisUrl || process.env.REDIS_URL) || DEFAULT_REDIS_URL
}

function queueNameFromInput(options = {}) {
  return cleanText(options.queueName || process.env.AGENT_TASK_QUEUE_NAME) || DEFAULT_QUEUE_NAME
}

function queueKey(queueName, redisUrl) {
  return `${queueName}|${redisUrl}`
}

function redisConnectionOptions(options = {}, { blocking = false } = {}) {
  const connectTimeout = integerFromInput(
    options.redisConnectTimeoutMs || process.env.AGENT_TASK_QUEUE_REDIS_CONNECT_TIMEOUT_MS,
    DEFAULT_REDIS_CONNECT_TIMEOUT_MS
  )
  return {
    url: redisUrlFromInput(options),
    connectTimeout,
    enableOfflineQueue: false,
    lazyConnect: false,
    maxRetriesPerRequest: blocking ? null : 1,
    retryStrategy(times) {
      return times <= 1 ? Math.min(500 * times, connectTimeout) : null
    }
  }
}

function activeJobKey(queueName, jobId, redisUrl = '') {
  return `${queueName || DEFAULT_QUEUE_NAME}|${redisUrl || DEFAULT_REDIS_URL}|${jobId || ''}`
}

export function normalizeAgentTaskQueueProgress(progress = {}) {
  if (!progress || typeof progress !== 'object') return null
  const event = progress.event && typeof progress.event === 'object' ? progress.event : null
  const task = progress.task && typeof progress.task === 'object' ? progress.task : null
  if (!event || !task?.id) return null
  return {
    type: 'agent_task_updated',
    bookPath: cleanText(progress.bookPath),
    bookName: cleanText(progress.bookName) || cleanText(task.bookName),
    bookId: cleanText(progress.bookId) || cleanText(task.bookId),
    taskId: cleanText(progress.taskId) || cleanText(task.id),
    chapterId: cleanText(progress.chapterId) || cleanText(task.chapterId),
    generationId: cleanText(progress.generationId) || cleanText(task.generationId),
    sourceGenerationId:
      cleanText(progress.sourceGenerationId) || cleanText(task.sourceGenerationId),
    repairGenerationId:
      cleanText(progress.repairGenerationId) || cleanText(task.repairGenerationId),
    writeTaskId: cleanText(progress.writeTaskId) || cleanText(task.writeTaskId),
    updatedAt:
      cleanText(progress.updatedAt) || cleanText(task.updatedAt) || new Date().toISOString(),
    task,
    event
  }
}

function requireQueueEnabled(options = {}) {
  const enabled = options.enabled ?? boolFromEnv(process.env.AGENT_TASK_QUEUE_ENABLED, false)
  if (!enabled) {
    throw new Error('真实任务队列未启用，请设置 AGENT_TASK_QUEUE_ENABLED=true 并配置 REDIS_URL')
  }
}

function queueOptions(options = {}) {
  const attempts = integerFromInput(
    options.attempts || process.env.AGENT_TASK_QUEUE_ATTEMPTS,
    DEFAULT_ATTEMPTS
  )
  const backoffDelay = integerFromInput(
    options.backoffDelayMs || process.env.AGENT_TASK_QUEUE_BACKOFF_MS,
    DEFAULT_BACKOFF_DELAY_MS
  )
  return {
    connection: redisConnectionOptions(options),
    defaultJobOptions: {
      attempts,
      removeOnComplete: options.removeOnComplete ?? false,
      removeOnFail: options.removeOnFail ?? false,
      backoff: {
        type: 'exponential',
        delay: backoffDelay
      }
    }
  }
}

function queueJobRetryOptions(input = {}, options = {}) {
  const attempts = integerFromInput(
    input.attempts || options.attempts || process.env.AGENT_TASK_QUEUE_ATTEMPTS,
    DEFAULT_ATTEMPTS
  )
  const backoffDelay = integerFromInput(
    input.backoffDelayMs || options.backoffDelayMs || process.env.AGENT_TASK_QUEUE_BACKOFF_MS,
    DEFAULT_BACKOFF_DELAY_MS
  )
  return {
    attempts,
    backoff: {
      type: 'exponential',
      delay: backoffDelay
    }
  }
}

function retryText(job = {}) {
  const attempts = integerFromInput(job.opts?.attempts, DEFAULT_ATTEMPTS)
  const attemptsMade = nonNegativeIntegerFromInput(job.attemptsMade, 0)
  const failedAttempt = Math.max(1, attemptsMade)
  const nextAttempt = Math.min(failedAttempt + 1, attempts)
  return `第 ${failedAttempt} 次执行失败，准备第 ${nextAttempt} 次执行，共 ${attempts} 次。`
}

function shouldRetryFailedJob(job = {}) {
  const attempts = integerFromInput(job.opts?.attempts, DEFAULT_ATTEMPTS)
  const attemptsMade = nonNegativeIntegerFromInput(job.attemptsMade, 0)
  const failedAttempt = Math.max(1, attemptsMade)
  return failedAttempt < attempts
}

function normalizeQueueJobTypes(value) {
  const fallback = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused']
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const items = raw.map((item) => cleanText(item)).filter(Boolean)
  return items.length ? Array.from(new Set(items)) : fallback
}

function queueJobPublicData(job = {}, state = '') {
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    attempts: job.opts?.attempts || DEFAULT_ATTEMPTS,
    backoff: job.opts?.backoff || null,
    failedReason: job.failedReason || '',
    data: job.data,
    returnvalue: job.returnvalue || null,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn
  }
}

export function buildQueueRetryEvent(job = {}, error = null) {
  if (!shouldRetryFailedJob(job)) return null
  return {
    status: 'retrying',
    eventType: 'queue_retrying',
    eventTitle: '队列准备重试',
    content: `${retryText(job)}失败原因：${error?.message || String(error || '队列执行失败')}`
  }
}

function createQueue(options = {}) {
  const redisUrl = redisUrlFromInput(options)
  const queueName = queueNameFromInput(options)
  const key = queueKey(queueName, redisUrl)
  const existing = activeQueues.get(key)
  if (existing) return existing
  const queue = new Queue(queueName, queueOptions({ ...options, redisUrl, queueName }))
  activeQueues.set(key, queue)
  return queue
}

export async function ensureQueueJobIdAvailable(queue, jobId) {
  const id = cleanText(jobId)
  if (!id) return
  const existing = await queue.getJob(id)
  if (existing) {
    const state = await existing.getState().catch(() => 'unknown')
    throw new Error(`队列任务 ID 已存在，当前状态：${state}`)
  }
}

function cleanQueueInput(input = {}) {
  const booksDir = cleanText(input.booksDir || process.env.NOVEL_BOOKS_DIR)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume)
  const chapterName = cleanText(input.chapterName || input.chapter)
  const prompt = cleanText(input.prompt || input.instruction)
  if (!booksDir) throw new Error('缺少书库目录')
  if (!bookName) throw new Error('缺少书籍名称')
  if (!prompt) throw new Error('缺少写作要求')
  return {
    booksDir: resolve(booksDir),
    bookName,
    volumeName,
    chapterName,
    prompt,
    targetWords: input.targetWords,
    autoEdit: Boolean(input.autoEdit),
    ...skillRecordWithFallback(input),
    modelId: cleanText(input.modelId),
    providerId: cleanText(input.providerId),
    model: cleanText(input.model || input.modelName),
    stream: input.stream !== false,
    resume: Boolean(input.resume)
  }
}

function cleanCheckQueueInput(input = {}) {
  const booksDir = cleanText(input.booksDir || process.env.NOVEL_BOOKS_DIR)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume)
  const chapterName = cleanText(input.chapterName || input.chapter || input.chapterTitle)
  const text = cleanText(input.text || input.content || input.chapterText)
  if (!booksDir) throw new Error('缺少书库目录')
  if (!bookName) throw new Error('缺少书籍名称')
  if (!text && (!volumeName || !chapterName)) throw new Error('缺少待检查正文或章节位置')
  return {
    booksDir: resolve(booksDir),
    bookName,
    volumeName,
    chapterName,
    text,
    useLlm: input.useLlm === true || input.aiCheck === true || input.enableLlm === true,
    skipLlm: input.skipLlm === true,
    modelId: cleanText(input.modelId),
    providerId: cleanText(input.providerId),
    model: cleanText(input.model || input.modelName),
    source: cleanText(input.source) || 'queue_consistency_check',
    generationId: cleanText(input.generationId),
    taskType: cleanText(input.taskType) || 'queue_consistency_check',
    applyAction: cleanText(input.applyAction),
    ...skillRecordWithFallback(input),
    envCwd: resolve(cleanText(input.envCwd) || process.cwd())
  }
}

function cleanRepairQueueInput(input = {}) {
  const booksDir = cleanText(input.booksDir || process.env.NOVEL_BOOKS_DIR)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume)
  const chapterName = cleanText(input.chapterName || input.chapter || input.chapterTitle)
  const prompt = cleanText(input.prompt || input.instruction) || '请根据一致性检查结果返修正文。'
  const currentText = cleanText(
    input.currentText || input.currentChapterText || input.text || input.content
  )
  const sourceText = cleanText(input.sourceText || input.sourceResult || input.sourceContent)
  const sourceGenerationId = cleanText(input.sourceGenerationId || input.generationId)
  const issues = Array.isArray(input.issues) ? input.issues : []
  const checkSummary = cleanText(input.checkSummary || input.summary)
  if (!booksDir) throw new Error('缺少书库目录')
  if (!bookName) throw new Error('缺少书籍名称')
  if (!chapterName) throw new Error('缺少章节名称')
  if (!currentText && !sourceText) throw new Error('缺少要返修的正文')
  if (!issues.length && !checkSummary) throw new Error('缺少一致性检查问题，无法返修')
  return {
    booksDir: resolve(booksDir),
    bookName,
    volumeName,
    chapterName,
    prompt,
    currentText,
    sourceText,
    sourceGenerationId,
    checkId: cleanText(input.checkId),
    checkSummary,
    issues,
    targetWords: input.targetWords,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    ...skillRecordWithFallback(input),
    modelId: cleanText(input.modelId),
    providerId: cleanText(input.providerId),
    model: cleanText(input.model || input.modelName),
    stream: input.stream !== false
  }
}

function taskTitle(input = {}) {
  const prefix =
    input.queueTaskType === 'check'
      ? '队列检查'
      : input.queueTaskType === 'repair'
        ? '队列返修'
        : '队列写作'
  return `${prefix} ${input.chapterName || input.chapter || '未命名章节'}`
}

function bookPathFromJobData(data = {}) {
  return resolve(data.booksDir, data.bookName)
}

function taskPatchFromJob(job, status, extra = {}) {
  const data = job.data || {}
  const isCheck = data.queueTaskType === 'check'
  const isRepair = data.queueTaskType === 'repair'
  return {
    taskId: data.taskId,
    bookName: data.bookName,
    bookId: data.bookName,
    chapterId: data.chapterName,
    ...skillRecordWithFallback(data),
    title: taskTitle(data),
    type: isCheck ? 'cli_check_queue' : isRepair ? 'cli_repair_queue' : 'cli_write_queue',
    agentMode: isCheck
      ? 'checking'
      : isRepair
        ? 'repairing'
        : data.autoEdit
          ? 'auto_edit'
          : 'writing',
    modelId: data.modelId || data.providerId || '',
    queueName: job.queueName,
    jobId: job.id,
    executionMode: isCheck ? 'consistency_check' : isRepair ? 'preview' : 'replace_chapter',
    generationId: data.sourceGenerationId || data.generationId || '',
    sourceGenerationId: data.sourceGenerationId || '',
    status,
    ...extra
  }
}

function queueCancelReason(value, fallback = QUEUE_CANCEL_MESSAGE) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value?.message) return value.message
  return fallback
}

function signalCancelReason(signal, fallback = QUEUE_CANCEL_MESSAGE) {
  return queueCancelReason(signal?.reason, fallback)
}

function createQueueCancelError(message = QUEUE_CANCEL_MESSAGE) {
  const error = new Error(message)
  error.name = 'AbortError'
  error.cancelled = true
  error.queueCancelled = true
  return error
}

function isQueueCancelError(error = {}) {
  const message = String(error?.message || '')
  return Boolean(
    error?.queueCancelled ||
      error?.cancelled ||
      error?.name === 'AbortError' ||
      message.includes(QUEUE_CANCEL_MESSAGE) ||
      message.includes('队列任务已停止') ||
      /cancel|abort/i.test(message)
  )
}

function throwIfQueueCancelled(data = {}, signal = null) {
  if (signal?.aborted) throw createQueueCancelError(signalCancelReason(signal))
  if (data?.cancelRequested) throw createQueueCancelError(queueCancelReason(data.cancelReason))
}

function taskMetaFromJob(job, input = {}) {
  const data = job?.data || {}
  const isCheck = data.queueTaskType === 'check'
  const isRepair = data.queueTaskType === 'repair'
  return {
    taskId: cleanText(data.taskId || input.taskId),
    bookName: cleanText(data.bookName || input.bookName),
    bookId: cleanText(data.bookName || input.bookName),
    chapterId: data.chapterName || input.chapterName || '',
    ...skillRecordWithFallback({ ...input, ...data }),
    title: taskTitle(data),
    type: isCheck ? 'cli_check_queue' : isRepair ? 'cli_repair_queue' : 'cli_write_queue',
    agentMode: isCheck
      ? 'checking'
      : isRepair
        ? 'repairing'
        : data.autoEdit
          ? 'auto_edit'
          : 'writing',
    modelId: data.modelId || data.providerId || '',
    queueName: job?.queueName || input.queueName || '',
    jobId: job?.id || input.jobId || '',
    executionMode: isCheck ? 'consistency_check' : isRepair ? 'preview' : 'replace_chapter'
  }
}

async function markQueueTaskCancelling(bookPath, job, reason = QUEUE_CANCEL_MESSAGE) {
  if (!bookPath || !job?.data?.taskId) return
  await recordQueueEventForJob(bookPath, job, 'cancelling', {
    eventType: 'queue_cancelling',
    eventTitle: '正在停止队列任务',
    content: `已向运行中的队列任务发出停止请求：${queueCancelReason(reason)}。`
  })
}

async function markQueueTaskCancelled(bookPath, job, previousState = 'unknown', content = '') {
  if (!bookPath || !job?.data?.taskId) return
  const meta = taskMetaFromJob(job)
  const text = content || `队列任务已停止，停止前状态：${previousState}。`
  await recordQueueEventForJob(bookPath, job, 'cancelled', {
    eventType: 'queue_cancelled',
    eventTitle: '队列任务已停止',
    content: text
  })
  cancelAgentTask(bookPath, meta.taskId, {
    ...meta,
    content: text
  })
}

async function publishQueueProgress(job, bookPath, task) {
  if (!job?.updateProgress || !task?.id) return
  const progress = normalizeAgentTaskQueueProgress({
    bookPath,
    bookName: task.bookName,
    bookId: task.bookId,
    taskId: task.id,
    chapterId: task.chapterId,
    generationId: task.generationId,
    sourceGenerationId: task.sourceGenerationId,
    repairGenerationId: task.repairGenerationId,
    writeTaskId: task.writeTaskId,
    updatedAt: task.updatedAt,
    task,
    event: Array.isArray(task.events) ? task.events.at(-1) : null
  })
  if (!progress) return
  await job.updateProgress(progress)
}

async function recordQueueEventForJob(bookPath, job, status, extra = {}) {
  const task = recordAgentTaskQueueEvent(bookPath, taskPatchFromJob(job, status, extra))
  await publishQueueProgress(job, bookPath, task).catch((error) => {
    console.error(error)
  })
  return task
}

function registerActiveJob(job, controller, options = {}) {
  if (!job?.id) return () => {}
  const key = activeJobKey(job.queueName, job.id, redisUrlFromInput(options))
  activeJobControllers.set(key, { controller, job })
  return () => {
    activeJobControllers.delete(key)
  }
}

async function requestActiveJobCancel(job, reason = QUEUE_CANCEL_MESSAGE, options = {}) {
  const nextData = {
    ...(job.data || {}),
    cancelRequested: true,
    cancelReason: queueCancelReason(reason),
    cancelRequestedAt: new Date().toISOString()
  }
  await job.updateData(nextData)
  job.data = nextData
  const active = activeJobControllers.get(
    activeJobKey(job.queueName, job.id, redisUrlFromInput(options))
  )
  if (active?.controller && !active.controller.signal.aborted) {
    if (active.job) active.job.data = nextData
    active.controller.abort(nextData.cancelReason)
  }
  return nextData
}

function startCancelWatcher(job, controller, queue, intervalMs = DEFAULT_CANCEL_POLL_INTERVAL_MS) {
  if (!job?.id || !queue || !controller) return () => {}
  let closed = false
  let checking = false
  const timer = setInterval(async () => {
    if (closed || checking || controller.signal.aborted) return
    checking = true
    try {
      const freshJob = await queue.getJob(job.id)
      const freshData = freshJob?.data || job.data || {}
      if (freshData.cancelRequested) {
        job.data = freshData
        controller.abort(queueCancelReason(freshData.cancelReason))
      }
    } catch (error) {
      console.error(error)
    } finally {
      checking = false
    }
  }, intervalMs)
  timer.unref?.()
  return () => {
    closed = true
    clearInterval(timer)
  }
}

function assertWriteJob(job = {}) {
  const data = job.data || {}
  if (!data.booksDir || !data.bookName || !data.prompt) {
    throw new Error('队列任务缺少真实写作参数')
  }
}

function assertCheckJob(job = {}) {
  const data = job.data || {}
  if (!data.booksDir || !data.bookName || (!data.text && (!data.volumeName || !data.chapterName))) {
    throw new Error('队列任务缺少真实检查参数')
  }
}

function assertRepairJob(job = {}) {
  const data = job.data || {}
  const hasIssues = Array.isArray(data.issues) && data.issues.length > 0
  if (
    !data.booksDir ||
    !data.bookName ||
    !data.chapterName ||
    (!data.currentText && !data.sourceText) ||
    (!hasIssues && !data.checkSummary)
  ) {
    throw new Error('队列任务缺少真实返修参数')
  }
}

function createCliStore() {
  return {
    get(_key, fallback) {
      return fallback
    },
    set() {}
  }
}

function resolveQueueCheckTextProvider(data = {}) {
  if (data.skipLlm || !data.useLlm) return null
  loadEnvFile(data.envCwd || process.cwd())
  try {
    return createTextProvider(createCliStore(), {
      providerId: data.providerId,
      modelId: data.modelId,
      model: data.model,
      modelName: data.model
    }).service
  } catch (error) {
    throw new Error(
      `${error.message || '请先配置文本 AI 服务'}。请在 .env 中配置 DEEPSEEK_API_KEY，或 CUSTOM_TEXT_*。`
    )
  }
}

async function runWriteJob(job, options = {}) {
  assertWriteJob(job)
  const data = job.data || {}
  const bookPath = bookPathFromJobData(data)
  const controller = new AbortController()
  const unregisterActiveJob = registerActiveJob(job, controller, options)
  const stopCancelWatcher = startCancelWatcher(
    job,
    controller,
    options.queue,
    numberFromInput(
      options.cancelPollIntervalMs || process.env.AGENT_TASK_QUEUE_CANCEL_POLL_MS,
      DEFAULT_CANCEL_POLL_INTERVAL_MS
    )
  )
  try {
    throwIfQueueCancelled(data, controller.signal)
    await recordQueueEventForJob(bookPath, job, 'running', {
      eventType: 'queue_active',
      eventTitle: '队列开始执行',
      content: 'BullMQ worker 已开始执行真实写作任务。'
    })
    const writeInput = {
      booksDir: data.booksDir,
      bookName: data.bookName,
      volumeName: data.volumeName,
      chapterName: data.chapterName,
      prompt: data.prompt,
      targetWords: data.targetWords,
      autoEdit: data.autoEdit,
      ...skillRecordWithFallback(data),
      modelId: data.modelId,
      providerId: data.providerId,
      model: data.model,
      stream: data.stream !== false,
      signal: controller.signal,
      onTaskProgress: async ({ bookPath: progressBookPath, task }) => {
        await publishQueueProgress(job, progressBookPath || bookPath, task)
      }
    }
    const skillIdentifier = cleanText(data.skillId || data.skillKey || data.skill)
    const result = skillIdentifier
      ? await runWritingSkill({
          ...writeInput,
          executionMode: 'replace_chapter',
          outputMode: 'chapter_write'
        })
      : await writeNovelChapter(writeInput)
    throwIfQueueCancelled(job.data || data, controller.signal)
    await recordQueueEventForJob(bookPath, job, 'queue_completed', {
      eventType: 'queue_completed',
      eventTitle: '队列执行完成',
      writeTaskId: result.taskId,
      generationId: result.generationId,
      repairGenerationId: result.repairGenerationId || '',
      content: `已写入 ${result.chapterName}，约 ${result.wordCount} 字。写作任务：${result.taskId}。`
    })
    return {
      success: true,
      taskId: data.taskId,
      writeTaskId: result.taskId,
      generationId: result.generationId,
      repairGenerationId: result.repairGenerationId || '',
      bookName: result.bookName,
      volumeName: result.volumeName,
      chapterName: result.chapterName,
      wordCount: result.wordCount,
      filePath: result.filePath,
      ...skillRecordWithFallback(result.skill || result),
      providerId: result.providerId || '',
      model: result.model || ''
    }
  } catch (error) {
    if (isQueueCancelError(error)) {
      job.discard?.()
      throw createQueueCancelError(error?.message || QUEUE_CANCEL_MESSAGE)
    }
    throw error
  } finally {
    stopCancelWatcher()
    unregisterActiveJob()
  }
}

async function runCheckJob(job, options = {}) {
  assertCheckJob(job)
  const data = job.data || {}
  const bookPath = bookPathFromJobData(data)
  const controller = new AbortController()
  const unregisterActiveJob = registerActiveJob(job, controller, options)
  const stopCancelWatcher = startCancelWatcher(
    job,
    controller,
    options.queue,
    numberFromInput(
      options.cancelPollIntervalMs || process.env.AGENT_TASK_QUEUE_CANCEL_POLL_MS,
      DEFAULT_CANCEL_POLL_INTERVAL_MS
    )
  )
  try {
    throwIfQueueCancelled(data, controller.signal)
    await recordQueueEventForJob(bookPath, job, 'running', {
      eventType: 'queue_active',
      eventTitle: '队列开始执行',
      content: 'BullMQ worker 已开始执行真实一致性检查。'
    })
    const textProvider = resolveQueueCheckTextProvider(data)
    throwIfQueueCancelled(job.data || data, controller.signal)
    const checkResult = await runConsistencyCheck(
      {
        bookPath,
        bookName: data.bookName,
        volumeName: data.volumeName,
        chapterName: data.chapterName,
        text: data.text,
        source: data.source || 'queue_consistency_check',
        generationId: data.generationId || '',
        taskType: data.taskType || 'queue_consistency_check',
        applyAction: data.applyAction || '',
        useLlm: data.useLlm === true,
        skipLlm: data.skipLlm === true,
        signal: controller.signal
      },
      textProvider ? { textProvider, signal: controller.signal } : { signal: controller.signal }
    )
    throwIfQueueCancelled(job.data || data, controller.signal)
    const check = checkResult.check || {}
    const issues = Array.isArray(checkResult.issues) ? checkResult.issues : []
    recordAgentTaskConsistency(bookPath, {
      taskId: data.taskId,
      generationId: data.generationId || '',
      checkId: check.id || '',
      title: '队列一致性检查',
      summary: checkResult.summary,
      issueCount: issues.length,
      applyAction: data.applyAction || '',
      ...skillRecordWithFallback(data)
    })
    await recordQueueEventForJob(bookPath, job, 'queue_completed', {
      eventType: 'queue_completed',
      eventTitle: '队列检查完成',
      generationId: data.generationId || '',
      checkId: check.id || '',
      issueCount: issues.length,
      content: `${checkResult.summary}。检查记录：${check.id || '未记录'}。`
    })
    return {
      success: true,
      taskId: data.taskId,
      checkId: check.id || '',
      issueCount: issues.length,
      summary: checkResult.summary,
      bookName: check.bookName || data.bookName,
      volumeName: check.volumeName || data.volumeName,
      chapterName: check.chapterName || data.chapterName,
      ruleChecked: check.ruleChecked === true,
      llmChecked: check.llmChecked === true,
      providerId: check.providerId || '',
      model: check.model || ''
    }
  } catch (error) {
    if (isQueueCancelError(error)) {
      job.discard?.()
      throw createQueueCancelError(error?.message || QUEUE_CANCEL_MESSAGE)
    }
    throw error
  } finally {
    stopCancelWatcher()
    unregisterActiveJob()
  }
}

async function runRepairJob(job, options = {}) {
  assertRepairJob(job)
  const data = job.data || {}
  const bookPath = bookPathFromJobData(data)
  const controller = new AbortController()
  const unregisterActiveJob = registerActiveJob(job, controller, options)
  const stopCancelWatcher = startCancelWatcher(
    job,
    controller,
    options.queue,
    numberFromInput(
      options.cancelPollIntervalMs || process.env.AGENT_TASK_QUEUE_CANCEL_POLL_MS,
      DEFAULT_CANCEL_POLL_INTERVAL_MS
    )
  )
  try {
    throwIfQueueCancelled(data, controller.signal)
    await recordQueueEventForJob(bookPath, job, 'running', {
      eventType: 'queue_active',
      eventTitle: '队列开始执行',
      content: 'BullMQ worker 已开始执行真实返修任务。'
    })
    const result = await repairNovelChapter({
      booksDir: data.booksDir,
      bookName: data.bookName,
      volumeName: data.volumeName,
      chapterName: data.chapterName,
      prompt: data.prompt,
      currentText: data.currentText,
      sourceText: data.sourceText,
      sourceGenerationId: data.sourceGenerationId,
      checkId: data.checkId,
      checkSummary: data.checkSummary,
      issues: data.issues,
      targetWords: data.targetWords,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      ...skillRecordWithFallback(data),
      modelId: data.modelId,
      providerId: data.providerId,
      model: data.model,
      stream: data.stream !== false,
      taskId: data.taskId,
      taskType: 'cli_repair_queue',
      signal: controller.signal,
      onTaskProgress: async ({ bookPath: progressBookPath, task }) => {
        await publishQueueProgress(job, progressBookPath || bookPath, task)
      }
    })
    throwIfQueueCancelled(job.data || data, controller.signal)
    await recordQueueEventForJob(bookPath, job, 'queue_completed', {
      eventType: 'queue_completed',
      eventTitle: '队列返修完成',
      generationId: data.sourceGenerationId || '',
      sourceGenerationId: data.sourceGenerationId || '',
      repairGenerationId: result.repairGenerationId || '',
      content: `已生成 ${result.chapterName} 的返修稿，约 ${result.wordCount} 字。返修记录：${result.repairGenerationId || '未返回'}。`
    })
    return {
      success: true,
      taskId: data.taskId,
      sourceGenerationId: data.sourceGenerationId || '',
      repairGenerationId: result.repairGenerationId || '',
      reviewPassed: result.reviewPassed === true,
      bookName: result.bookName,
      volumeName: result.volumeName,
      chapterName: result.chapterName,
      wordCount: result.wordCount,
      checkId: result.checkId || data.checkId || '',
      issueCount: result.issueCount || 0,
      ...skillRecordWithFallback(result.skill || result),
      providerId: result.providerId || '',
      model: result.model || ''
    }
  } catch (error) {
    if (isQueueCancelError(error)) {
      job.discard?.()
      throw createQueueCancelError(error?.message || QUEUE_CANCEL_MESSAGE)
    }
    throw error
  } finally {
    stopCancelWatcher()
    unregisterActiveJob()
  }
}

export async function enqueueAgentWriteTask(input = {}, options = {}) {
  requireQueueEnabled(options)
  const queueInput = cleanQueueInput(input)
  const queue = createQueue(options)
  const requestedJobId = cleanText(input.jobId)
  await ensureQueueJobIdAvailable(queue, requestedJobId)
  const bookPath = resolve(queueInput.booksDir, queueInput.bookName)
  const task = createAgentTask(bookPath, {
    bookName: queueInput.bookName || basename(bookPath),
    bookId: queueInput.bookName,
    chapterId: queueInput.chapterName,
    sessionId: `queue:${queueInput.bookName}:${queueInput.chapterName || 'chapter'}`,
    title: taskTitle(queueInput),
    type: 'cli_write_queue',
    agentMode: queueInput.autoEdit ? 'auto_edit' : 'writing',
    skillId: queueInput.skillId,
    ...skillRecordWithFallback(queueInput),
    modelId: queueInput.modelId || queueInput.providerId || '',
    queueName: queue.name,
    jobId: '',
    executionMode: 'replace_chapter',
    instruction: queueInput.prompt
  })
  const jobId = requestedJobId || `write:${task.id}`
  const job = await queue.add(
    'write-chapter',
    {
      ...queueInput,
      queueTaskType: 'write',
      taskId: task.id,
      requestId: randomUUID()
    },
    { jobId, ...queueJobRetryOptions(input, options) }
  )
  job.data = { ...(job.data || {}), jobId: job.id, queueName: queue.name }
  await job.updateData(job.data)
  await recordQueueEventForJob(bookPath, job, 'queued', {
    eventType: 'queue_queued',
    eventTitle: '队列已接收',
    content: '任务已写入 Redis 队列，等待 BullMQ worker 执行。'
  })
  return {
    success: true,
    queueName: queue.name,
    jobId: job.id,
    taskId: task.id,
    status: 'queued',
    bookName: queueInput.bookName,
    chapterName: queueInput.chapterName
  }
}

export async function enqueueAgentCheckTask(input = {}, options = {}) {
  requireQueueEnabled(options)
  const queueInput = cleanCheckQueueInput(input)
  const queue = createQueue(options)
  const requestedJobId = cleanText(input.jobId)
  await ensureQueueJobIdAvailable(queue, requestedJobId)
  const bookPath = resolve(queueInput.booksDir, queueInput.bookName)
  const task = createAgentTask(bookPath, {
    bookName: queueInput.bookName || basename(bookPath),
    bookId: queueInput.bookName,
    chapterId: queueInput.chapterName,
    sessionId: `queue-check:${queueInput.bookName}:${queueInput.chapterName || 'chapter'}`,
    generationId: queueInput.generationId,
    title: taskTitle({ ...queueInput, queueTaskType: 'check' }),
    type: 'cli_check_queue',
    agentMode: 'checking',
    skillId: queueInput.skillId,
    ...skillRecordWithFallback(queueInput),
    modelId: queueInput.modelId || queueInput.providerId || '',
    queueName: queue.name,
    jobId: '',
    executionMode: 'consistency_check',
    instruction: queueInput.text || `${queueInput.volumeName} ${queueInput.chapterName}`
  })
  const jobId = requestedJobId || `check:${task.id}`
  const job = await queue.add(
    'check-chapter',
    {
      ...queueInput,
      queueTaskType: 'check',
      taskId: task.id,
      requestId: randomUUID()
    },
    { jobId, ...queueJobRetryOptions(input, options) }
  )
  job.data = { ...(job.data || {}), jobId: job.id, queueName: queue.name }
  await job.updateData(job.data)
  await recordQueueEventForJob(bookPath, job, 'queued', {
    eventType: 'queue_queued',
    eventTitle: '队列已接收',
    content: '一致性检查任务已写入 Redis 队列，等待 BullMQ worker 执行。'
  })
  return {
    success: true,
    queueName: queue.name,
    jobId: job.id,
    taskId: task.id,
    status: 'queued',
    bookName: queueInput.bookName,
    chapterName: queueInput.chapterName
  }
}

export async function enqueueAgentRepairTask(input = {}, options = {}) {
  requireQueueEnabled(options)
  const queueInput = cleanRepairQueueInput(input)
  const queue = createQueue(options)
  const requestedJobId = cleanText(input.jobId)
  await ensureQueueJobIdAvailable(queue, requestedJobId)
  const bookPath = resolve(queueInput.booksDir, queueInput.bookName)
  const task = createAgentTask(bookPath, {
    bookName: queueInput.bookName || basename(bookPath),
    bookId: queueInput.bookName,
    chapterId: queueInput.chapterName,
    sessionId: `queue-repair:${queueInput.bookName}:${queueInput.chapterName || 'chapter'}`,
    generationId: queueInput.sourceGenerationId,
    sourceGenerationId: queueInput.sourceGenerationId,
    title: taskTitle({ ...queueInput, queueTaskType: 'repair' }),
    type: 'cli_repair_queue',
    agentMode: 'repairing',
    skillId: queueInput.skillId,
    ...skillRecordWithFallback(queueInput),
    modelId: queueInput.modelId || queueInput.providerId || '',
    queueName: queue.name,
    jobId: '',
    executionMode: 'preview',
    instruction: queueInput.prompt
  })
  const jobId = requestedJobId || `repair:${task.id}`
  const job = await queue.add(
    'repair-chapter',
    {
      ...queueInput,
      queueTaskType: 'repair',
      taskId: task.id,
      requestId: randomUUID()
    },
    { jobId, ...queueJobRetryOptions(input, options) }
  )
  job.data = { ...(job.data || {}), jobId: job.id, queueName: queue.name }
  await job.updateData(job.data)
  await recordQueueEventForJob(bookPath, job, 'queued', {
    eventType: 'queue_queued',
    eventTitle: '队列已接收',
    content: '返修任务已写入 Redis 队列，等待 BullMQ worker 执行。'
  })
  return {
    success: true,
    queueName: queue.name,
    jobId: job.id,
    taskId: task.id,
    status: 'queued',
    bookName: queueInput.bookName,
    chapterName: queueInput.chapterName
  }
}

export async function startAgentTaskWorker(options = {}) {
  requireQueueEnabled(options)
  const redisUrl = redisUrlFromInput(options)
  const queueName = queueNameFromInput(options)
  const key = queueKey(queueName, redisUrl)
  const existing = activeWorkers.get(key)
  if (existing) return { success: true, queueName, reused: true }
  const queue = createQueue({ ...options, redisUrl, queueName })
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === 'write-chapter') return runWriteJob(job, { ...options, queue })
      if (job.name === 'check-chapter') return runCheckJob(job, { ...options, queue })
      if (job.name === 'repair-chapter') return runRepairJob(job, { ...options, queue })
      throw new Error(`未知队列任务：${job.name}`)
    },
    {
      connection: redisConnectionOptions({ ...options, redisUrl }, { blocking: true }),
      concurrency: numberFromInput(
        options.concurrency || process.env.AGENT_TASK_QUEUE_CONCURRENCY,
        1
      )
    }
  )
  worker.on('failed', (job, error) => {
    ;(async () => {
      const data = job?.data || {}
      if (!data.booksDir || !data.bookName || !data.taskId) return
      const bookPath = bookPathFromJobData(data)
      try {
        if (isQueueCancelError(error) || data.cancelRequested) {
          await markQueueTaskCancelled(
            bookPath,
            job,
            'active',
            error?.message || data.cancelReason || QUEUE_CANCEL_MESSAGE
          )
          return
        }
        const retryEvent = buildQueueRetryEvent(job, error)
        if (retryEvent) {
          const { status, ...event } = retryEvent
          await recordQueueEventForJob(bookPath, job, status, event)
          return
        }
        await recordQueueEventForJob(bookPath, job, 'queue_failed', {
          eventType: 'queue_failed',
          eventTitle: '队列执行失败',
          content: error?.message || String(error || '队列执行失败')
        })
        failAgentTask(bookPath, data.taskId, error, {
          bookName: data.bookName,
          title: taskTitle(data),
          type:
            data.queueTaskType === 'check'
              ? 'cli_check_queue'
              : data.queueTaskType === 'repair'
                ? 'cli_repair_queue'
                : 'cli_write_queue',
          ...skillRecordWithFallback(data)
        })
      } catch (recordError) {
        console.error(recordError)
      }
    })()
  })
  worker.on('error', (error) => console.error(error))
  activeWorkers.set(key, worker)
  await worker.waitUntilReady()
  return { success: true, queueName, reused: false }
}

export async function getAgentTaskQueueStatus(options = {}) {
  requireQueueEnabled(options)
  const queue = createQueue(options)
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused'
  )
  const localWorkerRunning = activeWorkers.has(queueKey(queue.name, redisUrlFromInput(options)))
  let workerCount = localWorkerRunning ? 1 : 0
  let workers = []
  let workerStatusError = ''
  try {
    workers = await queue.getWorkers()
    workerCount = workers.length
  } catch (error) {
    workerStatusError = error?.message || String(error || '读取 worker 状态失败')
  }
  return {
    success: true,
    queueName: queue.name,
    redisUrl: redisUrlFromInput(options),
    counts,
    workerRunning: workerCount > 0,
    localWorkerRunning,
    workerCount,
    workers,
    workerStatusError
  }
}

export async function getAgentTaskQueueJob(jobId, options = {}) {
  requireQueueEnabled(options)
  const id = cleanText(jobId)
  if (!id) throw new Error('缺少队列任务 ID')
  const queue = createQueue(options)
  const job = await queue.getJob(id)
  if (!job) return { success: true, job: null }
  return {
    success: true,
    job: queueJobPublicData(job, await job.getState())
  }
}

export async function listAgentTaskQueueJobs(options = {}) {
  requireQueueEnabled(options)
  const queue = createQueue(options)
  const limit = Math.min(100, Math.max(1, integerFromInput(options.limit, 20)))
  const types = normalizeQueueJobTypes(options.types)
  const jobs = await queue.getJobs(types, 0, limit - 1, false)
  const items = await Promise.all(
    jobs.filter(Boolean).map(async (job) => queueJobPublicData(job, await job.getState()))
  )
  return {
    success: true,
    queueName: queue.name,
    redisUrl: redisUrlFromInput(options),
    types,
    limit,
    jobs: items
  }
}

export async function cancelAgentTaskQueueJob(input = {}, options = {}) {
  requireQueueEnabled(options)
  const jobId = cleanText(typeof input === 'string' ? input : input.jobId)
  if (!jobId) throw new Error('缺少队列任务 ID')
  const queue = createQueue(options)
  const job = await queue.getJob(jobId)
  if (!job) throw new Error('未找到队列任务')
  const state = await job.getState()
  if (['completed', 'failed'].includes(state))
    throw new Error(`队列任务已经结束，当前状态：${state}`)
  const data = job.data || {}
  const taskId = cleanText(data.taskId || input.taskId)
  const booksDir = cleanText(data.booksDir || input.booksDir)
  const bookName = cleanText(data.bookName || input.bookName)
  const expectedBooksDir = cleanText(input.expectedBooksDir || options.expectedBooksDir)
  const expectedBookName = cleanText(input.expectedBookName || options.expectedBookName)
  if (expectedBooksDir) {
    if (!booksDir) throw new Error('队列任务缺少书库目录，无法确认归属')
    if (resolve(booksDir) !== resolve(expectedBooksDir)) throw new Error('队列任务不属于当前书库')
  }
  if (expectedBookName) {
    if (!bookName) throw new Error('队列任务缺少作品名称，无法确认归属')
    if (bookName !== expectedBookName) throw new Error('队列任务不属于当前作品')
  }
  const bookPath = booksDir && bookName ? resolve(booksDir, bookName) : ''
  if (state === 'active') {
    const reason = cleanText(input.reason || options.reason) || QUEUE_CANCEL_MESSAGE
    await requestActiveJobCancel(job, reason, options)
    if (bookPath && taskId) {
      await markQueueTaskCancelling(bookPath, job, reason)
    }
    return {
      success: true,
      cancelled: false,
      cancellationRequested: true,
      queueName: queue.name,
      jobId,
      taskId,
      previousState: state
    }
  }
  await job.remove({ removeChildren: true })
  const result = {
    success: true,
    cancelled: true,
    queueName: queue.name,
    jobId,
    taskId,
    previousState: state
  }
  if (bookPath && taskId) {
    await markQueueTaskCancelled(
      bookPath,
      job,
      state,
      `已从 Redis 队列移除，停止前状态：${state}。`
    )
  }
  return result
}

export async function retryAgentTaskQueueJob(input = {}, options = {}) {
  requireQueueEnabled(options)
  const jobId = cleanText(typeof input === 'string' ? input : input.jobId)
  if (!jobId) throw new Error('缺少队列任务 ID')
  const queue = createQueue(options)
  const job = await queue.getJob(jobId)
  if (!job) throw new Error('未找到队列任务')
  const state = await job.getState()
  if (state !== 'failed') throw new Error(`只有失败任务可以重试，当前状态：${state}`)

  const data = job.data || {}
  const booksDir = cleanText(data.booksDir || input.booksDir)
  const bookName = cleanText(data.bookName || input.bookName)
  const expectedBooksDir = cleanText(input.expectedBooksDir || options.expectedBooksDir)
  const expectedBookName = cleanText(input.expectedBookName || options.expectedBookName)
  if (expectedBooksDir) {
    if (!booksDir) throw new Error('队列任务缺少书库目录，无法确认归属')
    if (resolve(booksDir) !== resolve(expectedBooksDir)) throw new Error('队列任务不属于当前书库')
  }
  if (expectedBookName) {
    if (!bookName) throw new Error('队列任务缺少作品名称，无法确认归属')
    if (bookName !== expectedBookName) throw new Error('队列任务不属于当前作品')
  }

  await job.retry('failed')
  return {
    success: true,
    retried: true,
    queueName: queue.name,
    jobId,
    taskId: cleanText(data.taskId || input.taskId),
    previousState: state
  }
}

export async function closeAgentTaskQueue(options = {}) {
  const redisUrl = redisUrlFromInput(options)
  const queueName = queueNameFromInput(options)
  const key = queueKey(queueName, redisUrl)
  const worker = activeWorkers.get(key)
  let abortedActiveJobs = 0
  for (const [jobKey, active] of activeJobControllers.entries()) {
    if (!jobKey.startsWith(`${queueName}|${redisUrl}|`)) continue
    active.controller?.abort?.('队列 worker 已关闭')
    activeJobControllers.delete(jobKey)
    abortedActiveJobs += 1
  }
  let closedWorker = false
  if (worker) {
    await worker.close()
    activeWorkers.delete(key)
    closedWorker = true
  }
  const queue = activeQueues.get(key)
  let closedQueue = false
  if (queue) {
    await queue.close()
    activeQueues.delete(key)
    closedQueue = true
  }
  return {
    success: true,
    queueName,
    redisUrl,
    closedWorker,
    closedQueue,
    abortedActiveJobs
  }
}

export default {
  enqueueAgentWriteTask,
  enqueueAgentCheckTask,
  enqueueAgentRepairTask,
  startAgentTaskWorker,
  getAgentTaskQueueStatus,
  getAgentTaskQueueJob,
  listAgentTaskQueueJobs,
  cancelAgentTaskQueueJob,
  retryAgentTaskQueueJob,
  closeAgentTaskQueue
}

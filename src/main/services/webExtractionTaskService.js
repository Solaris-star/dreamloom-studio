import { randomUUID } from 'node:crypto'

const FINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled'])
const MAX_RETAINED_JOBS = 100
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

function nowIso() {
  return new Date().toISOString()
}

function normalizeTimeoutMs(value) {
  const timeout = Number(value)
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.floor(timeout), 1000), 2 * 60 * 60 * 1000)
}

function initialProgress(jobId, bookPath) {
  return {
    jobId,
    extractionId: '',
    bookPath,
    status: 'queued',
    currentStep: '任务已进入等待队列',
    overallPercent: 0,
    progress: {
      totalSubTasks: 0,
      completedSubTasks: 0,
      failedSubTasks: 0,
      percent: 0
    },
    stats: {},
    subTasks: [],
    logs: []
  }
}

function publicFailure(error) {
  return {
    success: false,
    status: 'failed',
    message: String(error?.message || '拆书失败')
  }
}

export class WebExtractionTaskService {
  constructor({ extractionService, createTextProvider, createJobId = randomUUID } = {}) {
    if (!extractionService?.createExtraction) throw new Error('缺少拆书服务')
    if (typeof createTextProvider !== 'function') throw new Error('缺少文本 AI Provider 工厂')
    this.extractionService = extractionService
    this.createTextProvider = createTextProvider
    this.createJobId = createJobId
    this.jobs = new Map()
    this.activeKeys = new Map()
  }

  create(store, options = {}) {
    const bookPath = String(options.bookPath || '').trim()
    if (!bookPath) throw new Error('书籍路径不能为空')
    const activeKey = this.activeKey(options)
    const existingJobId = this.activeKeys.get(activeKey)
    if (existingJobId && !this.jobs.get(existingJobId)?.done) {
      return {
        success: false,
        message: '相同的拆书任务正在运行，请等待当前任务完成',
        jobId: existingJobId
      }
    }

    const jobId = `extraction_${this.createJobId()}`
    const controller = new AbortController()
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs)
    const job = {
      id: jobId,
      activeKey,
      bookPath,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      done: false,
      timeoutMs,
      controller,
      cancelRequested: false,
      progress: initialProgress(jobId, bookPath),
      result: null
    }
    this.jobs.set(jobId, job)
    this.activeKeys.set(activeKey, jobId)
    this.trimJobs()

    queueMicrotask(() => this.runJob(store, job, options))
    return { success: true, status: 'queued', jobId, timeoutMs }
  }

  activeKey(options = {}) {
    const dimensions = Array.isArray(options.dimensions)
      ? [...options.dimensions].map(String).sort().join(',')
      : ''
    return [
      String(options.bookPath || ''),
      String(options.runMode || 'append'),
      dimensions,
      String(options.chapterStart || ''),
      String(options.chapterEnd || ''),
      String(options.chapterLimit || '')
    ].join('|')
  }

  async runJob(store, job, options) {
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      if (!job.controller.signal.aborted) {
        job.controller.abort(`拆书任务超时（${Math.round(job.timeoutMs / 1000)} 秒）`)
      }
    }, job.timeoutMs)
    try {
      const provider = this.createTextProvider(store, options)
      const result = await this.extractionService.createExtraction({
        ...options,
        textProvider: provider.service,
        signal: job.controller.signal,
        onProgress: (progress) => {
          if (job.cancelRequested) return
          job.progress = {
            ...job.progress,
            ...progress,
            jobId: job.id,
            progress: { ...job.progress.progress, ...(progress.progress || {}) }
          }
          job.updatedAt = nowIso()
        }
      })
      if (job.cancelRequested) {
        job.result = { success: false, status: 'cancelled', message: '拆书任务已取消' }
        job.done = true
        job.progress = {
          ...job.progress,
          status: 'cancelled',
          currentStep: '拆书已取消',
          error: job.result.message
        }
        return
      }
      job.result = result
      job.done = true
      job.progress = {
        ...job.progress,
        ...result,
        jobId: job.id,
        extractionId: result.id || result.extractionId || job.progress.extractionId,
        status: result.status || (result.success ? 'completed' : 'failed'),
        currentStep: result.currentStep || (result.success ? '拆书完成' : '拆书失败'),
        overallPercent: result.success ? 100 : job.progress.overallPercent
      }
    } catch (error) {
      if (job.cancelRequested || timedOut || job.controller.signal.aborted) {
        const message = timedOut
          ? `拆书任务超时（${Math.round(job.timeoutMs / 1000)} 秒）`
          : '拆书任务已取消'
        job.result = {
          success: false,
          status: timedOut ? 'failed' : 'cancelled',
          message
        }
        job.done = true
        job.progress = {
          ...job.progress,
          status: timedOut ? 'failed' : 'cancelled',
          currentStep: timedOut ? '拆书超时' : '拆书已取消',
          error: message
        }
        return
      }
      job.result = publicFailure(error)
      job.done = true
      job.progress = {
        ...job.progress,
        status: 'failed',
        currentStep: '拆书失败',
        error: job.result.message
      }
    } finally {
      clearTimeout(timeoutId)
      job.updatedAt = nowIso()
      this.activeKeys.delete(job.activeKey)
    }
  }

  cancel(jobId, reason = '用户取消') {
    const id = String(jobId || '').trim()
    if (!id) throw new Error('缺少拆书任务 ID')
    const job = this.jobs.get(id)
    if (!job) throw new Error('拆书任务不存在或服务已重启')
    if (job.done || FINAL_STATUSES.has(job.progress.status)) {
      return {
        success: true,
        cancelled: false,
        jobId: job.id,
        status: job.progress.status,
        message: '任务已经结束'
      }
    }
    job.cancelRequested = true
    job.controller?.abort?.(reason)
    job.progress = {
      ...job.progress,
      status: 'cancelling',
      currentStep: '正在取消拆书任务'
    }
    job.updatedAt = nowIso()
    return {
      success: true,
      cancelled: false,
      cancellationRequested: true,
      jobId: job.id,
      status: 'cancelling'
    }
  }

  progress(jobId) {
    const id = String(jobId || '').trim()
    if (!id) throw new Error('缺少拆书任务 ID')
    const job = this.jobs.get(id)
    if (!job) throw new Error('拆书任务不存在或服务已重启')
    return {
      success: true,
      jobId: job.id,
      done: job.done || FINAL_STATUSES.has(job.progress.status),
      progress: job.progress,
      result: job.done ? job.result : null,
      failedReason: job.done && job.result?.success === false ? job.result.message : ''
    }
  }

  trimJobs() {
    if (this.jobs.size <= MAX_RETAINED_JOBS) return
    for (const [jobId, job] of this.jobs) {
      if (!job.done) continue
      this.jobs.delete(jobId)
      if (this.jobs.size <= MAX_RETAINED_JOBS) break
    }
  }
}

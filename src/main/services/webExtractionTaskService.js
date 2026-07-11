import { randomUUID } from 'node:crypto'

const FINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled'])
const MAX_RETAINED_JOBS = 100

function nowIso() {
  return new Date().toISOString()
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
    const job = {
      id: jobId,
      activeKey,
      bookPath,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      done: false,
      progress: initialProgress(jobId, bookPath),
      result: null
    }
    this.jobs.set(jobId, job)
    this.activeKeys.set(activeKey, jobId)
    this.trimJobs()

    queueMicrotask(() => this.runJob(store, job, options))
    return { success: true, status: 'queued', jobId }
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
    try {
      const provider = this.createTextProvider(store, options)
      const result = await this.extractionService.createExtraction({
        ...options,
        textProvider: provider.service,
        onProgress: (progress) => {
          job.progress = {
            ...job.progress,
            ...progress,
            jobId: job.id,
            progress: { ...job.progress.progress, ...(progress.progress || {}) }
          }
          job.updatedAt = nowIso()
        }
      })
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
      job.result = publicFailure(error)
      job.done = true
      job.progress = {
        ...job.progress,
        status: 'failed',
        currentStep: '拆书失败',
        error: job.result.message
      }
    } finally {
      job.updatedAt = nowIso()
      this.activeKeys.delete(job.activeKey)
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
      result: job.done ? job.result : null
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

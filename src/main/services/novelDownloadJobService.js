/**
 * 小说章节异步下载任务：start + poll progress，避免长同步请求被前端/隧道超时掐断。
 */
import { randomUUID } from 'node:crypto'

const FINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled'])
const MAX_RETAINED_JOBS = 50
const DEFAULT_CONCURRENCY = 3

function nowIso() {
  return new Date().toISOString()
}

function clampConcurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY
  return Math.min(8, Math.floor(n))
}

export class NovelDownloadJobService {
  constructor({ downloader, createJobId = randomUUID, concurrency = DEFAULT_CONCURRENCY } = {}) {
    if (!downloader?.getChapterContent) throw new Error('缺少小说下载服务')
    this.downloader = downloader
    this.createJobId = createJobId
    this.concurrency = clampConcurrency(concurrency)
    this.jobs = new Map()
  }

  start({ chapterList, sourceId } = {}) {
    const sid = String(sourceId || '').trim()
    if (!sid) {
      throw Object.assign(new Error('缺少书源'), { statusCode: 400 })
    }
    const list = Array.isArray(chapterList) ? chapterList : []
    if (!list.length) {
      throw Object.assign(new Error('请选择需要下载的章节'), { statusCode: 400 })
    }

    const normalized = list.map((chapter, index) => ({
      title: String(chapter?.title || `第${index + 1}章`).trim() || `第${index + 1}章`,
      url: String(chapter?.url || '').trim()
    }))
    if (normalized.some((chapter) => !chapter.url)) {
      throw Object.assign(new Error('章节地址无效'), { statusCode: 400 })
    }

    const jobId = `novel_dl_${this.createJobId()}`
    const job = {
      id: jobId,
      sourceId: sid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      done: false,
      cancelRequested: false,
      status: 'queued',
      current: 0,
      total: normalized.length,
      currentTitle: '',
      failed: 0,
      message: '',
      chapters: new Array(normalized.length),
      chapterList: normalized
    }
    this.jobs.set(jobId, job)
    this.trimJobs()
    queueMicrotask(() => this.runJob(job))
    return {
      success: true,
      status: 'queued',
      jobId,
      total: job.total
    }
  }

  progress(jobId) {
    const job = this.jobs.get(String(jobId || '').trim())
    if (!job) {
      return { success: false, message: '下载任务不存在或已过期' }
    }
    const percent = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0
    const payload = {
      success: true,
      jobId: job.id,
      status: job.status,
      current: job.current,
      total: job.total,
      currentTitle: job.currentTitle,
      percent,
      failed: job.failed,
      message: job.message,
      done: job.done
    }
    if (job.done) {
      payload.chapters = job.chapters.map((chapter, index) => {
        if (chapter) return chapter
        const fallback = job.chapterList[index]
        return {
          title: fallback?.title || `第${index + 1}章`,
          content: '',
          failed: true,
          error: '未下载'
        }
      })
    }
    return payload
  }

  cancel(jobId, reason = '用户取消') {
    const job = this.jobs.get(String(jobId || '').trim())
    if (!job) {
      return { success: false, message: '下载任务不存在或已过期' }
    }
    if (job.done) {
      return {
        success: true,
        jobId: job.id,
        status: job.status,
        message: '任务已结束'
      }
    }
    job.cancelRequested = true
    job.message = String(reason || '用户取消')
    job.updatedAt = nowIso()
    return {
      success: true,
      jobId: job.id,
      status: 'cancelling',
      message: job.message
    }
  }

  async runJob(job) {
    job.status = 'running'
    job.updatedAt = nowIso()
    const list = job.chapterList
    let nextIndex = 0

    const worker = async () => {
      while (true) {
        if (job.cancelRequested) return
        const index = nextIndex
        nextIndex += 1
        if (index >= list.length) return

        const chapter = list[index]
        job.currentTitle = chapter.title
        job.updatedAt = nowIso()
        try {
          const content = await this.downloader.getChapterContent(chapter.url, job.sourceId)
          const text = String(content || '')
          if (!text.trim()) {
            job.chapters[index] = {
              title: chapter.title,
              content: '',
              failed: true,
              error: '正文为空'
            }
            job.failed += 1
          } else {
            job.chapters[index] = {
              title: chapter.title,
              content: text,
              failed: false,
              error: ''
            }
          }
        } catch (error) {
          job.chapters[index] = {
            title: chapter.title,
            content: '',
            failed: true,
            error: error?.message || '下载失败'
          }
          job.failed += 1
        }
        job.current += 1
        job.updatedAt = nowIso()
      }
    }

    try {
      const pool = Array.from({ length: Math.min(this.concurrency, list.length) }, () => worker())
      await Promise.all(pool)

      if (job.cancelRequested) {
        job.status = 'cancelled'
        job.message = job.message || '下载已取消'
        job.done = true
        job.updatedAt = nowIso()
        return
      }

      if (job.failed === job.total) {
        job.status = 'failed'
        job.message = '所有章节下载失败'
      } else if (job.failed > 0) {
        job.status = 'partial'
        job.message = `完成 ${job.total - job.failed}/${job.total} 章，失败 ${job.failed} 章`
      } else {
        job.status = 'completed'
        job.message = ''
      }
      job.done = true
      job.currentTitle = ''
      job.updatedAt = nowIso()
    } catch (error) {
      job.status = 'failed'
      job.message = error?.message || '下载失败'
      job.done = true
      job.updatedAt = nowIso()
    }
  }

  trimJobs() {
    if (this.jobs.size <= MAX_RETAINED_JOBS) return
    const entries = [...this.jobs.entries()].sort((a, b) =>
      String(a[1].createdAt).localeCompare(String(b[1].createdAt))
    )
    while (this.jobs.size > MAX_RETAINED_JOBS && entries.length) {
      const [id, job] = entries.shift()
      if (job.done || FINAL_STATUSES.has(job.status)) {
        this.jobs.delete(id)
      } else {
        break
      }
    }
  }
}

export function createNovelDownloadJobService(options = {}) {
  return new NovelDownloadJobService(options)
}

export default NovelDownloadJobService

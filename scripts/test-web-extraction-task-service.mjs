import assert from 'node:assert/strict'
import { WebExtractionTaskService } from '../src/main/services/webExtractionTaskService.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const run = deferred()
let receivedOptions = null
const extractionService = {
  async createExtraction(options) {
    receivedOptions = options
    options.onProgress({
      extractionId: 'ext-1',
      status: 'running',
      currentStep: '正在分析第一章',
      overallPercent: 25,
      progress: { percent: 25 }
    })
    return run.promise
  }
}
const taskService = new WebExtractionTaskService({
  extractionService,
  createTextProvider: (_store, options) => ({
    providerId: options.providerId,
    service: { chat: async () => ({ content: '[]' }) }
  }),
  createJobId: () => 'job-1'
})

assert.throws(() => taskService.create({}, { bookPath: '   ' }), /书籍路径不能为空/)
assert.equal(taskService.activeKey({ bookPath: 'book' }), 'book|append||||')
assert.equal(
  taskService.activeKey({
    bookPath: 'book',
    runMode: 'replace',
    dimensions: ['timeline', 'characters'],
    chapterStart: 1,
    chapterEnd: 10,
    chapterLimit: 5
  }),
  'book|replace|characters,timeline|1|10|5'
)

const created = taskService.create(
  {},
  {
    bookPath: 'D:\\books\\demo',
    providerId: 'provider-1',
    dimensions: ['characters']
  }
)
assert.deepEqual(created, { success: true, status: 'queued', jobId: 'extraction_job-1' })

await new Promise((resolve) => setImmediate(resolve))
assert.equal(receivedOptions.bookPath, 'D:\\books\\demo')
assert.equal(typeof receivedOptions.textProvider.chat, 'function')
assert.equal(receivedOptions.onProgress instanceof Function, true)

const running = taskService.progress(created.jobId)
assert.equal(running.success, true)
assert.equal(running.done, false)
assert.equal(running.progress.extractionId, 'ext-1')
assert.equal(running.progress.overallPercent, 25)
assert.equal(running.result, null)

const duplicate = taskService.create(
  {},
  {
    bookPath: 'D:\\books\\demo',
    providerId: 'provider-1',
    dimensions: ['characters']
  }
)
assert.equal(duplicate.success, false)
assert.equal(duplicate.jobId, created.jobId)

run.resolve({
  success: true,
  id: 'ext-1',
  status: 'completed',
  currentStep: '拆书完成',
  stats: { totalExtractedCount: 4 }
})
await new Promise((resolve) => setImmediate(resolve))

const completed = taskService.progress(created.jobId)
assert.equal(completed.done, true)
assert.equal(completed.result.success, true)
assert.equal(completed.progress.extractionId, 'ext-1')
assert.equal(completed.progress.overallPercent, 100)

const failedService = new WebExtractionTaskService({
  extractionService: {
    async createExtraction() {
      throw new Error('模型不可用')
    }
  },
  createTextProvider: () => ({ service: { chat: async () => ({}) } }),
  createJobId: () => 'job-2'
})
const failedCreated = failedService.create({}, { bookPath: 'D:\\books\\failed' })
await new Promise((resolve) => setImmediate(resolve))
const failed = failedService.progress(failedCreated.jobId)
assert.equal(failed.done, true)
assert.deepEqual(failed.result, {
  success: false,
  status: 'failed',
  message: '模型不可用'
})
assert.equal(failed.progress.status, 'failed')

const providerFailureService = new WebExtractionTaskService({
  extractionService,
  createTextProvider: () => {
    throw new Error('请先配置文本 AI 服务')
  },
  createJobId: () => 'job-3'
})
const providerFailureCreated = providerFailureService.create({}, { bookPath: 'D:\\books\\provider' })
await new Promise((resolve) => setImmediate(resolve))
assert.equal(providerFailureService.progress(providerFailureCreated.jobId).result.message, '请先配置文本 AI 服务')

const fallbackService = new WebExtractionTaskService({
  extractionService: {
    async createExtraction({ onProgress }) {
      onProgress({ status: 'running' })
      return { success: false, extractionId: 'ext-fallback' }
    }
  },
  createTextProvider: () => ({ service: {} }),
  createJobId: () => 'job-fallback'
})
const fallbackCreated = fallbackService.create({}, { bookPath: 'D:\\books\\fallback' })
await new Promise((resolve) => setImmediate(resolve))
const fallback = fallbackService.progress(fallbackCreated.jobId)
assert.equal(fallback.progress.extractionId, 'ext-fallback')
assert.equal(fallback.progress.status, 'failed')
assert.equal(fallback.progress.currentStep, '拆书失败')
assert.equal(fallback.progress.overallPercent, 0)

const emptyFailureService = new WebExtractionTaskService({
  extractionService: {
    async createExtraction() {
      throw {}
    }
  },
  createTextProvider: () => ({ service: {} }),
  createJobId: () => 'job-empty-failure'
})
const emptyFailureCreated = emptyFailureService.create({}, { bookPath: 'D:\\books\\empty-failure' })
await new Promise((resolve) => setImmediate(resolve))
assert.equal(emptyFailureService.progress(emptyFailureCreated.jobId).result.message, '拆书失败')

const finalStatusService = new WebExtractionTaskService({
  extractionService,
  createTextProvider: () => ({ service: {} }),
  createJobId: () => 'job-final-status'
})
finalStatusService.jobs.set('manual-final', {
  id: 'manual-final',
  done: false,
  progress: { status: 'cancelled' },
  result: null
})
assert.equal(finalStatusService.progress('manual-final').done, true)
assert.equal(finalStatusService.progress('manual-final').result, null)

const trimmingService = new WebExtractionTaskService({
  extractionService,
  createTextProvider: () => ({ service: {} })
})
for (let index = 0; index < 101; index += 1) {
  trimmingService.jobs.set(`job-${index}`, {
    id: `job-${index}`,
    done: index !== 0,
    progress: { status: index === 0 ? 'running' : 'completed' }
  })
}
trimmingService.trimJobs()
assert.equal(trimmingService.jobs.size, 100)
assert.equal(trimmingService.jobs.has('job-0'), true)

assert.throws(() => taskService.progress(''), /缺少拆书任务 ID/)
assert.throws(() => taskService.progress('missing'), /不存在或服务已重启/)
assert.throws(
  () =>
    new WebExtractionTaskService({
      extractionService: {},
      createTextProvider: () => ({})
    }),
  /缺少拆书服务/
)
assert.throws(
  () =>
    new WebExtractionTaskService({
      extractionService,
      createTextProvider: null
    }),
  /缺少文本 AI Provider 工厂/
)

console.log('web extraction task service tests passed')

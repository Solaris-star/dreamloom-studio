import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  assertRedisAvailable,
  closeAllAgentTaskQueues,
  closeAgentTaskQueue,
  enqueueAgentWriteTask,
  getAgentTaskQueueStatus,
  isAcceptingAgentTaskJobs,
  resolveProviderConcurrency,
  resolveProviderTimeoutMs,
  startAgentTaskWorker,
  stopAcceptingAgentTaskJobs
} from '../src/main/services/agentTaskQueueService.js'
import {
  startAgentTaskProgressServer,
  stopAgentTaskProgressServer
} from '../src/main/services/agentTaskProgressWebSocket.js'
import { initNovelProject } from '../src/main/services/novelCliService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-runtime-'))
const booksDir = join(rootDir, 'books')
const bookName = '运行时队列书'
const redisUrl = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15'
const queueName = `agent-runtime-${Date.now()}`

assert.equal(resolveProviderConcurrency('env:deepseek', { providerConcurrency: { 'env:deepseek': 3 } }), 3)
assert.equal(resolveProviderConcurrency('missing', { defaultProviderConcurrency: 2 }), 2)
assert.equal(
  resolveProviderTimeoutMs('env:deepseek', { providerTimeoutMs: { 'env:deepseek': 12000 } }),
  12000
)
assert.equal(resolveProviderTimeoutMs('missing', { jobTimeoutMs: 45000 }), 45000)

const previousEnabled = process.env.AGENT_TASK_QUEUE_ENABLED
const previousProviderConcurrency = process.env.AGENT_TASK_QUEUE_PROVIDER_CONCURRENCY
const previousProviderTimeout = process.env.AGENT_TASK_QUEUE_PROVIDER_TIMEOUT_MS

try {
  process.env.AGENT_TASK_QUEUE_ENABLED = 'true'
  process.env.AGENT_TASK_QUEUE_PROVIDER_CONCURRENCY = 'env:deepseek=2,custom=4'
  process.env.AGENT_TASK_QUEUE_PROVIDER_TIMEOUT_MS = 'env:deepseek=11111'
  assert.equal(resolveProviderConcurrency('env:deepseek'), 2)
  assert.equal(resolveProviderConcurrency('custom'), 4)
  assert.equal(resolveProviderTimeoutMs('env:deepseek'), 11111)

  await initNovelProject({ booksDir, bookName, intro: '运行时验证' })

  await assert.rejects(
    () =>
      assertRedisAvailable({
        enabled: true,
        redisUrl: 'redis://127.0.0.1:1',
        redisConnectTimeoutMs: 300
      }),
    /Redis 不可用|ECONNREFUSED|连接/
  )

  await assertRedisAvailable({
    enabled: true,
    redisUrl,
    redisConnectTimeoutMs: 2000
  })

  const worker = await startAgentTaskWorker({
    enabled: true,
    redisUrl,
    queueName,
    concurrency: 2,
    jobTimeoutMs: 60000
  })
  assert.equal(worker.success, true)
  assert.equal(worker.queueName, queueName)
  assert.equal(worker.concurrency, 2)

  const status = await getAgentTaskQueueStatus({ enabled: true, redisUrl, queueName })
  assert.equal(status.success, true)
  assert.equal(status.acceptingNewJobs, true)
  assert.equal(status.workerRunning, true)

  const enqueued = await enqueueAgentWriteTask(
    {
      booksDir,
      bookName,
      volumeName: '第一卷',
      chapterName: `运行时章-${Date.now()}`,
      prompt: '只写一句测试正文。',
      providerId: 'env:deepseek',
      attempts: 1
    },
    { enabled: true, redisUrl, queueName }
  )
  assert.equal(enqueued.success, true)
  assert.equal(enqueued.status, 'queued')
  assert.ok(enqueued.jobId)
  assert.equal(enqueued.jobId.includes(':'), false)

  await stopAcceptingAgentTaskJobs()
  assert.equal(isAcceptingAgentTaskJobs(), false)
  await assert.rejects(
    () =>
      enqueueAgentWriteTask(
        {
          booksDir,
          bookName,
          volumeName: '第一卷',
          chapterName: '停机后章节',
          prompt: '不应入队'
        },
        { enabled: true, redisUrl, queueName }
      ),
    /停止接收新任务/
  )

  const server = await startAgentTaskProgressServer({
    host: '127.0.0.1',
    port: 0,
    listenQueueProgress: false
  })
  assert.equal(server.success, true)
  assert.match(server.url, /token=/)

  const closed = await closeAgentTaskQueue({ redisUrl, queueName })
  assert.equal(closed.success, true)
  assert.equal(closed.closedWorker, true)
  assert.equal(closed.closedQueue, true)
  assert.equal(closed.acceptingNewJobs, false)

  const allClosed = await closeAllAgentTaskQueues({ redisUrl, queueName })
  assert.equal(allClosed.success, true)
  await stopAgentTaskProgressServer()
} finally {
  if (previousEnabled === undefined) delete process.env.AGENT_TASK_QUEUE_ENABLED
  else process.env.AGENT_TASK_QUEUE_ENABLED = previousEnabled
  if (previousProviderConcurrency === undefined) {
    delete process.env.AGENT_TASK_QUEUE_PROVIDER_CONCURRENCY
  } else {
    process.env.AGENT_TASK_QUEUE_PROVIDER_CONCURRENCY = previousProviderConcurrency
  }
  if (previousProviderTimeout === undefined) delete process.env.AGENT_TASK_QUEUE_PROVIDER_TIMEOUT_MS
  else process.env.AGENT_TASK_QUEUE_PROVIDER_TIMEOUT_MS = previousProviderTimeout
  await closeAllAgentTaskQueues({ redisUrl, queueName }).catch(() => {})
  await stopAgentTaskProgressServer().catch(() => {})
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('agent task queue runtime tests passed')

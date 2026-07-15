#!/usr/bin/env node
/**
 * Production BullMQ worker entry.
 * Web process only enqueues jobs; this process executes them.
 */
import {
  closeAgentTaskQueue,
  startAgentTaskWorker
} from '../src/main/services/agentTaskQueueService.js'

const enabled = String(process.env.AGENT_TASK_QUEUE_ENABLED || '').trim().toLowerCase()
if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
  console.error(
    '[start-worker] AGENT_TASK_QUEUE_ENABLED 未开启。生产 worker 需要 AGENT_TASK_QUEUE_ENABLED=true 与 REDIS_URL。'
  )
  process.exit(1)
}

if (!String(process.env.REDIS_URL || '').trim()) {
  console.error('[start-worker] 缺少 REDIS_URL')
  process.exit(1)
}

let shuttingDown = false

function log(...args) {
  console.log('[start-worker]', ...args)
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  log('shutting down on', signal)
  try {
    // Prefer newer graceful API if queue agent merged it.
    const mod = await import('../src/main/services/agentTaskQueueService.js')
    if (typeof mod.shutdownAgentTaskWorker === 'function') {
      await mod.shutdownAgentTaskWorker({ waitMs: Number(process.env.WORKER_SHUTDOWN_WAIT_MS || 20000) })
    } else if (typeof mod.closeAgentTaskQueue === 'function') {
      await mod.closeAgentTaskQueue()
    }
  } catch (error) {
    console.warn('[start-worker] close failed:', error?.message || error)
  }
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(error)
      process.exit(1)
    })
  })
}

const result = await startAgentTaskWorker({
  concurrency: process.env.AGENT_TASK_QUEUE_CONCURRENCY,
  queueName: process.env.AGENT_TASK_QUEUE_NAME,
  redisUrl: process.env.REDIS_URL
})
log('worker ready', result)

// Keep process alive while BullMQ worker runs.
await new Promise(() => {})

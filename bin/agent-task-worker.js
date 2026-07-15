#!/usr/bin/env node
import {
  closeAllAgentTaskQueues,
  startAgentTaskWorker,
  stopAcceptingAgentTaskJobs
} from '../src/main/services/agentTaskQueueService.js'
import {
  startAgentTaskQueueProgressListener,
  stopAgentTaskProgressServer
} from '../src/main/services/agentTaskProgressWebSocket.js'
import { loadEnvFile } from '../src/main/services/envConfig.js'

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIG' + 'TERM']

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2)
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    if (inlineValue !== undefined) {
      options[key] = inlineValue
      continue
    }
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
      continue
    }
    options[key] = next
    index += 1
  }
  return options
}

function workerOptions(cli = {}) {
  return {
    enabled: true,
    queueName: cleanText(cli.queueName || process.env.AGENT_TASK_QUEUE_NAME),
    redisUrl: cleanText(cli.redisUrl || process.env.REDIS_URL),
    concurrency: cli.concurrency || process.env.AGENT_TASK_QUEUE_CONCURRENCY,
    attempts: cli.attempts || process.env.AGENT_TASK_QUEUE_ATTEMPTS,
    backoffDelayMs: cli.backoffDelayMs || process.env.AGENT_TASK_QUEUE_BACKOFF_MS,
    jobTimeoutMs: cli.jobTimeoutMs || process.env.AGENT_TASK_QUEUE_JOB_TIMEOUT_MS,
    lockDurationMs: cli.lockDurationMs || process.env.AGENT_TASK_QUEUE_LOCK_DURATION_MS
  }
}

async function main() {
  loadEnvFile(process.cwd())
  if (!boolFromEnv(process.env.AGENT_TASK_QUEUE_ENABLED, false)) {
    process.env.AGENT_TASK_QUEUE_ENABLED = 'true'
  }

  const cli = parseArgs(process.argv.slice(2))
  const options = workerOptions(cli)
  const worker = await startAgentTaskWorker(options)
  const progress = await startAgentTaskQueueProgressListener({
    ...options,
    enabled: true
  }).catch((error) => {
    console.warn('[agent-worker] queue progress listener failed:', error?.message || error)
    return { success: false, enabled: false, message: error?.message || String(error) }
  })

  console.log(
    JSON.stringify(
      {
        success: true,
        role: 'worker',
        queueName: worker.queueName,
        reused: worker.reused === true,
        concurrency: worker.concurrency,
        lockDurationMs: worker.lockDurationMs,
        progressListener: progress
      },
      null,
      2
    )
  )

  let shuttingDown = false
  async function shutdown(signalName) {
    if (shuttingDown) return
    shuttingDown = true
    console.error(`[agent-worker] received ${signalName}, shutting down...`)
    try {
      await stopAcceptingAgentTaskJobs()
      await closeAllAgentTaskQueues(options)
      await stopAgentTaskProgressServer({ closeQueueProgress: true })
      console.error('[agent-worker] shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error('[agent-worker] shutdown failed:', error?.message || error)
      process.exit(1)
    }
  }

  for (const signalName of SHUTDOWN_SIGNALS) {
    process.once(signalName, () => {
      shutdown(signalName)
    })
  }

  await new Promise(() => {})
}

main().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})

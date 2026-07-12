import * as agentTaskQueueService from '../services/agentTaskQueueService.js'

const ROUTES = new Set([
  '/api/editor-agent/queue-status',
  '/api/editor-agent/queue-jobs',
  '/api/editor-agent/queue-job',
  '/api/editor-agent/queue-cancel',
  '/api/editor-agent/queue-retry',
  '/api/editor-agent/queue-write',
  '/api/editor-agent/queue-repair'
])

function unavailableMessage(error) {
  return error?.message || '任务队列未启用，请配置 Redis 后再使用'
}

function emptyQueueStatus(error = null) {
  return {
    success: true,
    queueName: 'novel-agent-writing',
    redisUrl: '',
    counts: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0
    },
    workerRunning: false,
    localWorkerRunning: false,
    workerCount: 0,
    workers: [],
    workerStatusError: unavailableMessage(error)
  }
}

function emptyQueueJobs(payload = {}, error = null) {
  return {
    success: true,
    queueName: 'novel-agent-writing',
    redisUrl: '',
    types: payload.types ? [payload.types].flat().filter(Boolean) : [],
    limit: Number(payload.limit || 20),
    jobs: [],
    message: unavailableMessage(error)
  }
}

export function isAgentQueueRoute(path) {
  return ROUTES.has(path)
}

export async function handleAgentQueueRoute({
  path,
  body,
  res,
  sendJson,
  queue = agentTaskQueueService
}) {
  if (!isAgentQueueRoute(path)) return false

  const payload = body || {}
  try {
    let result
    if (path === '/api/editor-agent/queue-status') {
      result = await queue.getAgentTaskQueueStatus(payload)
    } else if (path === '/api/editor-agent/queue-jobs') {
      result = await queue.listAgentTaskQueueJobs(payload)
    } else if (path === '/api/editor-agent/queue-job') {
      result = await queue.getAgentTaskQueueJob(payload.jobId, payload)
    } else if (path === '/api/editor-agent/queue-cancel') {
      result = await queue.cancelAgentTaskQueueJob(payload, payload)
    } else if (path === '/api/editor-agent/queue-retry') {
      result = await queue.retryAgentTaskQueueJob(payload, payload)
    } else if (path === '/api/editor-agent/queue-write') {
      result = await queue.enqueueAgentWriteTask(payload, payload)
    } else {
      result = await queue.enqueueAgentRepairTask(payload, payload)
    }
    sendJson(res, result)
  } catch (error) {
    let fallback
    if (path === '/api/editor-agent/queue-status') {
      fallback = emptyQueueStatus(error)
    } else if (path === '/api/editor-agent/queue-jobs') {
      fallback = emptyQueueJobs(payload, error)
    } else if (path === '/api/editor-agent/queue-job') {
      fallback = { success: true, job: null, message: unavailableMessage(error) }
    } else {
      fallback = { success: false, message: unavailableMessage(error) }
    }
    sendJson(res, fallback)
  }
  return true
}

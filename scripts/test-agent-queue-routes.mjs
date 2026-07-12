import assert from 'node:assert/strict'
import {
  handleAgentQueueRoute,
  isAgentQueueRoute
} from '../src/main/webApi/agentQueueRoutes.js'

const calls = []
const responses = []
const queue = {
  getAgentTaskQueueStatus: (...args) => (calls.push(['status', ...args]), { success: true }),
  listAgentTaskQueueJobs: (...args) => (
    calls.push(['jobs', ...args]),
    { success: true, jobs: [] }
  ),
  getAgentTaskQueueJob: (...args) => (
    calls.push(['job', ...args]),
    { success: true, job: { id: 'j1' } }
  ),
  cancelAgentTaskQueueJob: (...args) => (
    calls.push(['cancel', ...args]),
    { success: true }
  ),
  retryAgentTaskQueueJob: (...args) => (
    calls.push(['retry', ...args]),
    { success: true }
  ),
  enqueueAgentWriteTask: (...args) => (
    calls.push(['write', ...args]),
    { success: true, jobId: 'j1' }
  ),
  enqueueAgentRepairTask: (...args) => (
    calls.push(['repair', ...args]),
    { success: true, jobId: 'j2' }
  )
}
const common = {
  res: {},
  sendJson: (_res, payload) => responses.push(payload),
  queue
}
const cases = [
  ['/api/editor-agent/queue-status', {}],
  ['/api/editor-agent/queue-jobs', { types: ['waiting'], limit: 5 }],
  ['/api/editor-agent/queue-job', { jobId: 'j1' }],
  ['/api/editor-agent/queue-cancel', { jobId: 'j1' }],
  ['/api/editor-agent/queue-retry', { jobId: 'j1' }],
  ['/api/editor-agent/queue-write', { taskId: 't1' }],
  ['/api/editor-agent/queue-repair', { taskId: 't2' }]
]

for (const [path, body] of cases) {
  assert.equal(isAgentQueueRoute(path), true)
  assert.equal(await handleAgentQueueRoute({ ...common, path, body }), true)
}
assert.equal(isAgentQueueRoute('/api/editor-agent/tasks'), false)
assert.equal(
  await handleAgentQueueRoute({ ...common, path: '/api/editor-agent/tasks', body: {} }),
  false
)
assert.deepEqual(calls, [
  ['status', {}],
  ['jobs', { types: ['waiting'], limit: 5 }],
  ['job', 'j1', { jobId: 'j1' }],
  ['cancel', { jobId: 'j1' }, { jobId: 'j1' }],
  ['retry', { jobId: 'j1' }, { jobId: 'j1' }],
  ['write', { taskId: 't1' }, { taskId: 't1' }],
  ['repair', { taskId: 't2' }, { taskId: 't2' }]
])

function reject() {
  throw new Error('Redis 不可用')
}
const failed = {
  getAgentTaskQueueStatus: reject,
  listAgentTaskQueueJobs: reject,
  getAgentTaskQueueJob: reject,
  cancelAgentTaskQueueJob: reject,
  retryAgentTaskQueueJob: reject,
  enqueueAgentWriteTask: reject,
  enqueueAgentRepairTask: reject
}
const fallbackResponses = []
for (const [path, body] of cases) {
  assert.equal(
    await handleAgentQueueRoute({
      path,
      body,
      res: {},
      sendJson: (_res, payload) => fallbackResponses.push(payload),
      queue: failed
    }),
    true
  )
}
assert.equal(fallbackResponses[0].success, true)
assert.equal(fallbackResponses[0].workerStatusError, 'Redis 不可用')
assert.deepEqual(fallbackResponses[1].types, ['waiting'])
assert.equal(fallbackResponses[1].limit, 5)
assert.deepEqual(fallbackResponses[1].jobs, [])
assert.deepEqual(fallbackResponses[2], {
  success: true,
  job: null,
  message: 'Redis 不可用'
})
for (const response of fallbackResponses.slice(3)) {
  assert.deepEqual(response, { success: false, message: 'Redis 不可用' })
}

console.log('任务队列路由测试通过')

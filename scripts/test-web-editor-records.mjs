import assert from 'node:assert/strict'

const store = new Map([
  ['editorGenerations', [{ id: 'generation-1', bookId: 'book-1', status: 'generated' }]]
])
const apiResponses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  let data
  if (url === '/api/store/get') {
    data = {
      success: true,
      key: payload.key,
      value: store.has(payload.key) ? store.get(payload.key) : payload.defaultValue
    }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    data = { success: true, key: payload.key, value: payload.value }
  } else if (apiResponses.has(url)) {
    const response = apiResponses.get(url)
    data = typeof response === 'function' ? response(payload) : response
  } else {
    data = { success: false, message: `未模拟接口：${url}` }
  }
  return new Response(JSON.stringify(data), {
    status: data.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const {
  appendAgentMessage,
  cancelAgentGeneration,
  cancelAgentQueueJob,
  createEditorSnapshot,
  deleteEditorSnapshot,
  enqueueAgentRepairTask,
  enqueueAgentWriteTask,
  generateAgentPreview,
  getAgentQueueJob,
  getAgentQueueStatus,
  getAgentProgressServer,
  listAgentHistory,
  listAgentMessages,
  listAgentQueueJobs,
  listAgentTasks,
  listEditorMaterials,
  listEditorSnapshots,
  markGenerationApplied,
  openEditorSession,
  repairAgentResult,
  saveEditorMaterial,
  retryAgentQueueJob,
  updateEditorSessionContext,
  updateModelDefaults
} = await import('../src/renderer/src/service/editor.js')

const defaults = await updateModelDefaults({
  task: 'writing',
  modelId: 'provider-a::writer-model'
})
assert.equal(defaults.providerId, 'provider-a')
assert.equal(store.get('editorModelDefaults').writing, 'provider-a::writer-model')
assert.equal(store.get('aiProviders.activeTextId'), 'provider-a')

const opened = await openEditorSession({ bookId: 'book-1', chapterId: 'chapter-1' })
assert.equal(opened.session.id, 'editor_session:book-1')
assert.equal(store.get('lastActiveBookId'), 'book-1')

const updated = await updateEditorSessionContext(opened.session.id, { includeCharacters: true })
assert.equal(updated.session.contextOptions.includeCharacters, true)

const savedMessage = await appendAgentMessage(opened.session.id, {
  role: 'user',
  content: '继续写'
})
assert.equal(savedMessage.message.sessionId, opened.session.id)
assert.equal((await listAgentMessages(opened.session.id)).messages.length, 1)

const marked = await markGenerationApplied('generation-1', 'replace')
assert.equal(marked.generation.status, 'applied')
assert.equal((await listAgentHistory('book-1')).items[0].status, 'applied')
assert.deepEqual(await markGenerationApplied('', 'replace'), {
  success: false,
  message: '缺少生成记录 ID'
})
await assert.rejects(() => markGenerationApplied('missing', 'replace'), /未找到生成记录/)
await assert.rejects(() => generateAgentPreview(), /单次 Agent 生成已停用/)
await assert.rejects(() => repairAgentResult(), /单次 Agent 返修已停用/)
await assert.rejects(() => cancelAgentGeneration(), /请在写作队列中停止任务/)

const savedMaterial = await saveEditorMaterial({
  bookId: 'book-1',
  chapterId: 'chapter-1',
  content: '素材'
})
assert.equal(savedMaterial.material.source, 'editor_agent')
assert.equal(
  (await listEditorMaterials({ bookId: 'book-1', chapterId: 'chapter-1' })).materials.length,
  1
)
assert.equal((await listEditorMaterials({ bookId: 'book-2' })).materials.length, 0)

store.set('editorMessages', {})
await assert.rejects(() => listAgentMessages(opened.session.id), /本地记录格式不正确/)

apiResponses.set('/api/editor-agent/queue-write', {
  success: true,
  jobId: 'write:task-1',
  taskId: 'task-1'
})
assert.equal((await enqueueAgentWriteTask({ bookName: '作品' })).jobId, 'write:task-1')
apiResponses.set('/api/editor-agent/queue-write', { success: true, jobId: 'write:missing-task' })
await assert.rejects(() => enqueueAgentWriteTask({ bookName: '作品' }), /接口返回格式不正确/)

apiResponses.set('/api/editor-agent/queue-repair', {
  success: true,
  jobId: 'repair:task-1',
  taskId: 'task-1'
})
assert.equal((await enqueueAgentRepairTask({ taskId: 'task-1' })).jobId, 'repair:task-1')
apiResponses.set('/api/editor-agent/queue-repair', {
  success: true,
  jobId: '',
  taskId: 'task-1'
})
await assert.rejects(
  () => enqueueAgentRepairTask({ taskId: 'task-1' }),
  /接口返回格式不正确/
)

apiResponses.set('/api/editor-agent/queue-status', {
  success: true,
  queueName: 'novel-agent-writing',
  counts: { waiting: 0, active: 1 }
})
assert.equal((await getAgentQueueStatus()).counts.active, 1)
apiResponses.set('/api/editor-agent/queue-status', { success: true, queueName: '' })
await assert.rejects(() => getAgentQueueStatus(), /接口返回格式不正确/)

apiResponses.set('/api/editor-agent/queue-job', { success: true, job: null })
assert.equal((await getAgentQueueJob('missing')).job, null)
apiResponses.set('/api/editor-agent/queue-job', { success: true })
await assert.rejects(() => getAgentQueueJob('missing'), /接口返回格式不正确/)

apiResponses.set('/api/editor-agent/queue-jobs', {
  success: true,
  jobs: [{ id: 'write:task-1', state: 'active' }]
})
assert.equal((await listAgentQueueJobs()).jobs.length, 1)
apiResponses.set('/api/editor-agent/queue-jobs', { success: true, jobs: null })
await assert.rejects(() => listAgentQueueJobs(), /接口返回格式不正确/)

apiResponses.set('/api/editor-agent/queue-cancel', {
  success: true,
  jobId: 'write:task-1',
  cancellationRequested: true
})
assert.equal(
  (await cancelAgentQueueJob({ jobId: 'write:task-1' })).cancellationRequested,
  true
)
apiResponses.set('/api/editor-agent/queue-cancel', {
  success: true,
  jobId: 'write:another-task',
  cancelled: true
})
await assert.rejects(
  () => cancelAgentQueueJob({ jobId: 'write:task-1' }),
  /接口返回的任务不匹配/
)
apiResponses.set('/api/editor-agent/queue-cancel', {
  success: true,
  jobId: 'write:task-1',
  cancelled: false,
  cancellationRequested: false
})
await assert.rejects(
  () => cancelAgentQueueJob({ jobId: 'write:task-1' }),
  /接口返回格式不正确/
)

apiResponses.set('/api/editor-agent/queue-retry', {
  success: true,
  jobId: 'write:task-1',
  retried: true
})
assert.equal((await retryAgentQueueJob({ jobId: 'write:task-1' })).retried, true)
apiResponses.set('/api/editor-agent/queue-retry', {
  success: true,
  jobId: 'write:another-task',
  retried: true
})
await assert.rejects(
  () => retryAgentQueueJob({ jobId: 'write:task-1' }),
  /接口返回的任务不匹配/
)
apiResponses.set('/api/editor-agent/queue-retry', {
  success: true,
  jobId: 'write:task-1',
  retried: false
})
await assert.rejects(
  () => retryAgentQueueJob({ jobId: 'write:task-1' }),
  /接口返回格式不正确/
)

apiResponses.set('/api/editor-agent/queue-jobs', {
  success: true,
  jobs: [{ id: 'write:task-1' }]
})
assert.equal((await listAgentTasks()).tasks.length, 1)
apiResponses.set('/api/editor-agent/queue-jobs', {
  success: true,
  jobs: null
})
await assert.rejects(() => listAgentTasks(), /接口返回格式不正确/)

apiResponses.set('/api/editor-agent/progress-server', {
  success: true,
  enabled: true,
  host: '127.0.0.1',
  port: 8787,
  path: '/agent-progress',
  url: 'ws://127.0.0.1:8787'
})
assert.equal((await getAgentProgressServer()).enabled, true)
apiResponses.set('/api/editor-agent/progress-server', {
  success: true,
  enabled: true,
  host: '127.0.0.1',
  port: 8787,
  path: '/agent-progress',
  url: ''
})
await assert.rejects(() => getAgentProgressServer(), /没有返回 WebSocket 地址/)

apiResponses.set('/api/editor-snapshots/create', {
  success: true,
  snapshot: { id: 'snapshot-1', chapterId: 'chapter-1' }
})
assert.equal(
  (await createEditorSnapshot({ chapterId: 'chapter-1' })).snapshot.id,
  'snapshot-1'
)
apiResponses.set('/api/editor-snapshots/create', {
  success: true,
  snapshot: null
})
await assert.rejects(
  () => createEditorSnapshot({ chapterId: 'chapter-1' }),
  /接口返回格式不正确/
)
apiResponses.set('/api/editor-snapshots/list', {
  success: true,
  snapshots: [{ id: 'snapshot-1', chapterId: 'chapter-1' }]
})
assert.equal((await listEditorSnapshots({ chapterId: 'chapter-1' })).snapshots.length, 1)
apiResponses.set('/api/editor-snapshots/list', {
  success: true,
  snapshots: {}
})
await assert.rejects(() => listEditorSnapshots(), /接口返回格式不正确/)
apiResponses.set('/api/editor-snapshots/delete', (payload) => ({
  success: true,
  snapshotId: payload.snapshotId
}))
assert.equal((await deleteEditorSnapshot('snapshot-1')).snapshotId, 'snapshot-1')
apiResponses.set('/api/editor-snapshots/delete', {
  success: true,
  snapshotId: 'snapshot-2'
})
await assert.rejects(() => deleteEditorSnapshot('snapshot-1'), /删除编辑器快照失败/)

store.set('editorMaterials', {})
await assert.rejects(() => listEditorMaterials(), /本地记录格式不正确/)

console.log('Web 编辑器记录服务测试通过')

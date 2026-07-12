import assert from 'node:assert/strict'
import {
  buildAgentTaskProgressUrl,
  upsertAgentTaskProgressItem,
  useAgentTaskProgressSocket
} from '../src/renderer/src/composables/useAgentTaskProgressSocket.js'

const url = new URL(
  buildAgentTaskProgressUrl(
    {
      bookName: '风雪试剑',
      bookId: 'book-001',
      chapterId: '第一章',
      taskId: '',
      generationId: 'gen-001'
    },
    {
      baseUrl: 'ws://127.0.0.1:8787/agent-tasks'
    }
  )
)

assert.equal(url.protocol, 'ws:')
assert.equal(url.host, '127.0.0.1:8787')
assert.equal(url.pathname, '/agent-tasks')
assert.equal(url.searchParams.get('bookName'), '风雪试剑')
assert.equal(url.searchParams.get('bookId'), 'book-001')
assert.equal(url.searchParams.get('chapterId'), '第一章')
assert.equal(url.searchParams.get('generationId'), 'gen-001')
assert.equal(url.searchParams.has('taskId'), false)

const olderTask = {
  id: 'task-older',
  title: '旧任务',
  updatedAt: '2026-06-07T01:00:00.000Z'
}
const activeTask = {
  id: 'task-active',
  title: '写作任务',
  status: 'running',
  updatedAt: '2026-06-07T02:00:00.000Z',
  events: [{ type: 'task_started' }]
}
const nextTask = {
  ...activeTask,
  status: 'generated',
  updatedAt: '2026-06-07T03:00:00.000Z',
  events: [...activeTask.events, { type: 'generation_saved' }]
}

const inserted = upsertAgentTaskProgressItem([olderTask], activeTask)
assert.deepEqual(
  inserted.map((item) => item.id),
  ['task-active', 'task-older']
)

const updated = upsertAgentTaskProgressItem(inserted, nextTask)
assert.equal(updated.length, 2)
assert.equal(updated[0].id, 'task-active')
assert.equal(updated[0].status, 'generated')
assert.equal(updated[0].events.at(-1).type, 'generation_saved')

const ignored = upsertAgentTaskProgressItem(updated, { title: '缺少 ID' })
assert.equal(ignored, updated)

async function withWindow(windowValue, action) {
  const previousWindow = globalThis.window
  globalThis.window = windowValue
  try {
    return await action()
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }
}

await withWindow(
  {
    WebSocket: class {
      constructor() {
        throw new Error('不应连接缺少 url 的进度服务')
      }
    },
    location: { hostname: '127.0.0.1', protocol: 'http:' },
    setTimeout,
    clearTimeout
  },
  async () => {
    const progressSocket = useAgentTaskProgressSocket({
      getServerInfo: async () => {
        throw new Error('读取 Agent 进度服务状态失败：接口没有返回 WebSocket 地址')
      }
    })
    progressSocket.connect({ bookName: '风雪试剑' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(progressSocket.status.value, 'unavailable')
    assert.equal(progressSocket.error.value.includes('WebSocket 地址'), true)
    assert.equal(progressSocket.currentUrl.value, '')
  }
)

await withWindow(
  {
    WebSocket: class {
      constructor(url) {
        this.url = url
        this.readyState = 0
      }
      close() {}
    },
    location: { hostname: '127.0.0.1', protocol: 'http:' },
    setTimeout,
    clearTimeout
  },
  async () => {
    const progressSocket = useAgentTaskProgressSocket({
      getServerInfo: async () => ({
        success: true,
        host: '127.0.0.1',
        port: 8787,
        path: '/agent-tasks',
        url: 'ws://127.0.0.1:8787/agent-tasks'
      })
    })
    progressSocket.connect({ bookName: '风雪试剑', taskId: 'task-1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(
      progressSocket.currentUrl.value.startsWith('ws://127.0.0.1:8787/agent-tasks'),
      true
    )
    assert.equal(progressSocket.currentUrl.value.includes('bookName='), true)
    progressSocket.disconnect()
  }
)

console.log('agent task progress client tests passed')

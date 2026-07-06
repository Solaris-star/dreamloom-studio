import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildAgentTaskProgressUrl,
  useAgentTaskProgressSocket
} from '../src/renderer/src/composables/useAgentTaskProgressSocket.js'
import {
  startAgentTaskProgressServer,
  stopAgentTaskProgressServer
} from '../src/main/services/agentTaskProgressWebSocket.js'

const rootDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(rootDir, '..')
const indexHtml = fs.readFileSync(join(projectRoot, 'src/renderer/index.html'), 'utf-8')

assert.match(indexHtml, /connect-src/)
assert.match(indexHtml, /ws:\/\/127\.0\.0\.1:\*/)
assert.match(indexHtml, /ws:\/\/localhost:\*/)

const progressUrl = new URL(buildAgentTaskProgressUrl(
  {
    bookName: '风雪试剑',
    bookId: 'book-001',
    chapterId: '第一章',
    generationId: 'gen-001'
  },
  {
    baseUrl: 'ws://127.0.0.1:8788/agent-tasks'
  }
))

assert.equal(progressUrl.protocol, 'ws:')
assert.equal(progressUrl.host, '127.0.0.1:8788')
assert.equal(progressUrl.pathname, '/agent-tasks')
assert.equal(progressUrl.searchParams.get('bookName'), '风雪试剑')
assert.equal(progressUrl.searchParams.get('bookId'), 'book-001')
assert.equal(progressUrl.searchParams.get('chapterId'), '第一章')
assert.equal(progressUrl.searchParams.get('generationId'), 'gen-001')

global.window = {
  WebSocket: function UnexpectedWebSocket() {
    throw new Error('不应在进度服务不可用时创建 WebSocket')
  },
  clearTimeout,
  setTimeout,
  electron: {
    getEditorAgentProgressServer: async () => ({
      success: false,
      message: 'Web 预览没有启动 Agent 进度服务'
    })
  }
}

const progressSocket = useAgentTaskProgressSocket()
progressSocket.connect({ bookName: '风雪试剑' })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(progressSocket.status.value, 'unavailable')
assert.equal(progressSocket.error.value, 'Web 预览没有启动 Agent 进度服务')
assert.equal(progressSocket.currentUrl.value, '')

function listenOnFreePort() {
  return new Promise((resolve, reject) => {
    const blocker = net.createServer()
    blocker.once('error', reject)
    blocker.listen(0, '127.0.0.1', () => {
      resolve({
        blocker,
        port: blocker.address().port
      })
    })
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

const { blocker, port } = await listenOnFreePort()

try {
  const info = await startAgentTaskProgressServer({
    host: '127.0.0.1',
    port,
    fallbackAttempts: 3,
    listenQueueProgress: false
  })

  assert.equal(info.success, true)
  assert.equal(info.requestedPort, port)
  assert.notEqual(info.port, port)
  assert.equal(info.fallbackUsed, true)
  assert.match(info.message, /已改用/)
  assert.match(info.url, /^ws:\/\/127\.0\.0\.1:\d+\/agent-tasks$/)
} finally {
  await closeServer(blocker)
  await stopAgentTaskProgressServer({ closeQueueProgress: false })
}

console.log('agent task progress url and csp tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  createAgentTask,
  recordAgentTaskStream
} from '../src/main/services/editorAgentTaskService.js'
import {
  broadcastAgentTaskProgress,
  getAgentTaskProgressServerInfo,
  startAgentTaskQueueProgressListener,
  startAgentTaskProgressServer,
  stopAgentTaskProgressServer
} from '../src/main/services/agentTaskProgressWebSocket.js'

function encodeClientTextFrame(text) {
  const data = Buffer.from(text, 'utf-8')
  const mask = randomBytes(4)
  const header =
    data.length < 126
      ? Buffer.from([0x81, 0x80 | data.length])
      : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 0xff])
  const masked = Buffer.from(data.map((byte, index) => byte ^ mask[index % 4]))
  return Buffer.concat([header, mask, masked])
}

function readFrames(buffer, onMessage) {
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    let length = second & 0x7f
    let headerLength = 2
    if (length === 126) {
      if (offset + 4 > buffer.length) break
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(offset + 2))
      headerLength = 10
    }
    const frameEnd = offset + headerLength + length
    if (frameEnd > buffer.length) break
    const payload = buffer.subarray(offset + headerLength, frameEnd)
    if (opcode === 0x1) onMessage(JSON.parse(payload.toString('utf-8')))
    offset = frameEnd
  }
  return buffer.subarray(offset)
}

async function connectWebSocket({ port, path }) {
  const socket = net.createConnection({ host: '127.0.0.1', port })
  const key = randomBytes(16).toString('base64')
  const messages = []
  let pending = Buffer.alloc(0)
  let connected = false
  let handshake = ''

  const ready = new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '\r\n'
        ].join('\r\n')
      )
    })
    socket.on('data', (chunk) => {
      if (!connected) {
        handshake += chunk.toString('binary')
        const index = handshake.indexOf('\r\n\r\n')
        if (index === -1) return
        const headers = handshake.slice(0, index)
        assert.match(headers, /101 Switching Protocols/)
        connected = true
        const rest = Buffer.from(handshake.slice(index + 4), 'binary')
        if (rest.length) pending = readFrames(rest, (message) => messages.push(message))
        resolve()
        return
      }
      pending = readFrames(Buffer.concat([pending, chunk]), (message) => messages.push(message))
    })
  })

  await ready
  return {
    socket,
    messages,
    send(text) {
      socket.write(encodeClientTextFrame(text))
    },
    close() {
      socket.end()
    }
  }
}

async function rejectedWebSocket({ port, path }) {
  const socket = net.createConnection({ host: '127.0.0.1', port })
  const response = await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      )
    })
    socket.once('data', (chunk) => resolve(chunk.toString('utf8')))
  })
  socket.destroy()
  return response
}

async function rawUpgradeResponse({ port, path, headers = [] }) {
  const socket = net.createConnection({ host: '127.0.0.1', port })
  const response = await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          ...headers,
          '\r\n'
        ].join('\r\n')
      )
    })
    socket.once('data', (chunk) => resolve(chunk.toString('utf8')))
  })
  socket.destroy()
  return response
}

async function waitForMessage(messages, predicate, timeoutMs = 3000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const found = messages.find(predicate)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('等待 WebSocket 任务事件超时')
}

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-ws-'))
const bookPath = join(rootDir, '寒灯写剑')

try {
  fs.mkdirSync(bookPath, { recursive: true })
  const beforeStart = getAgentTaskProgressServerInfo({ host: '127.0.0.1', port: 0 })
  assert.equal(beforeStart.success, false)
  assert.equal(beforeStart.message, 'Agent 任务进度服务尚未启动')
  assert.deepEqual(await startAgentTaskQueueProgressListener({ enabled: false }), {
    success: true,
    enabled: false
  })

  const server = await startAgentTaskProgressServer({ host: '127.0.0.1', port: 0 })
  assert.equal(server.success, true)
  assert.equal(server.path, '/agent-tasks')
  const reusedServer = await startAgentTaskProgressServer({
    host: '127.0.0.1',
    port: server.port,
    listenQueueProgress: false
  })
  assert.equal(reusedServer.port, server.port)
  assert.equal(reusedServer.clientCount, 0)
  assert.equal(
    getAgentTaskProgressServerInfo({ host: '127.0.0.1', port: server.port }).success,
    true
  )
  assert.match(await rejectedWebSocket({ port: server.port, path: server.path }), /401 Unauthorized/)
  assert.match(
    await rejectedWebSocket({ port: server.port, path: `${server.path}?token=wrong` }),
    /401 Unauthorized/
  )

  const serverUrl = new URL(server.url)
  assert.match(
    await rejectedWebSocket({
      port: server.port,
      path: `${server.path}?token=${serverUrl.searchParams.get('token')}`
    }),
    /403 Forbidden/
  )
  assert.match(
    await rejectedWebSocket({
      port: server.port,
      path: `/wrong-path?token=${serverUrl.searchParams.get('token')}`
    }),
    /404 Not Found/
  )
  assert.match(
    await rawUpgradeResponse({
      port: server.port,
      path: `${server.path}?token=${serverUrl.searchParams.get('token')}&bookName=${encodeURIComponent('寒灯写剑')}`
    }),
    /400 Bad Request/
  )
  serverUrl.searchParams.set('bookName', '寒灯写剑')
  const client = await connectWebSocket({
    port: server.port,
    path: `${serverUrl.pathname}${serverUrl.search}`
  })
  await waitForMessage(client.messages, (message) => message.type === 'agent_task_ws_ready')

  const task = createAgentTask(bookPath, {
    bookName: '寒灯写剑',
    bookId: '寒灯写剑',
    chapterId: '第一章',
    title: '流式写作',
    type: 'write',
    agentMode: 'writing',
    instruction: '写一个真实任务事件。'
  })

  const started = await waitForMessage(
    client.messages,
    (message) => message.type === 'agent_task_updated' && message.taskId === task.id
  )
  assert.equal(started.bookPath, bookPath)
  assert.equal(started.event.type, 'task_started')
  assert.equal(started.task.status, 'running')

  recordAgentTaskStream(bookPath, {
    taskId: task.id,
    generationId: 'gen_ws_001',
    status: 'running',
    content: '寒灯下第一行正文。',
    chunkCount: 1,
    wordCount: 9,
    modelUsed: 'test-stream-model'
  })

  const streamed = await waitForMessage(
    client.messages,
    (message) =>
      message.type === 'agent_task_updated' &&
      message.taskId === task.id &&
      message.event?.type === 'writer_stream'
  )
  assert.equal(streamed.generationId, 'gen_ws_001')
  assert.equal(streamed.event.content, '寒灯下第一行正文。')
  assert.equal(streamed.event.modelUsed, 'test-stream-model')

  assert.equal(
    broadcastAgentTaskProgress({
      type: 'agent_task_updated',
      bookName: '另一部作品',
      taskId: 'filtered-out'
    }),
    0
  )
  const longContent = '长'.repeat(200)
  assert.equal(
    broadcastAgentTaskProgress({
      type: 'agent_task_updated',
      bookName: '寒灯写剑',
      taskId: 'manual-long-frame',
      content: longContent
    }),
    1
  )
  const longFrame = await waitForMessage(
    client.messages,
    (message) => message.taskId === 'manual-long-frame'
  )
  assert.equal(longFrame.content, longContent)

  client.send(JSON.stringify({ type: 'client_ping' }))
  client.close()
  const unrelatedStop = await stopAgentTaskProgressServer({
    host: '127.0.0.1',
    port: server.port === 65535 ? 65534 : server.port + 1,
    closeQueueProgress: false
  })
  assert.equal(unrelatedStop.stoppedServerCount, 0)
  assert.equal(unrelatedStop.closeQueueProgress, false)
} finally {
  const stopResult = await stopAgentTaskProgressServer()
  assert.equal(stopResult.success, true)
  assert.equal(stopResult.stoppedServerCount, 1)
  assert.equal(stopResult.closeQueueProgress, true)
  assert.equal(typeof stopResult.closedClientCount, 'number')
  assert.equal(typeof stopResult.closedQueueProgressListeners, 'number')
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('agent task progress websocket tests passed')

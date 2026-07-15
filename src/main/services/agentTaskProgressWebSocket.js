import http from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { QueueEvents } from 'bullmq'
import { onAgentTaskProgress } from './editorAgentTaskService.js'
import { normalizeAgentTaskQueueProgress } from './agentTaskQueueService.js'

const DEFAULT_PORT = 8787
const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_FALLBACK_PORTS = 5
const DEFAULT_QUEUE_NAME = 'novel-agent-writing'
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0'
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const PING_INTERVAL_MS = 30000
const CLOSE_NORMAL = Buffer.from([0x88, 0x00])
const activeServers = new Map()
const activeQueueProgressListeners = new Map()

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePort(value, fallback = DEFAULT_PORT) {
  const port = Number(value)
  if (Number.isInteger(port) && port >= 0 && port <= 65535) return port
  return fallback
}

function normalizeFallbackAttempts(value, fallback = DEFAULT_FALLBACK_PORTS) {
  const count = Number(value)
  if (Number.isInteger(count) && count >= 0 && count <= 50) return count
  return fallback
}

function candidatePorts(port, attempts = DEFAULT_FALLBACK_PORTS) {
  if (port === 0) return [0]
  const ports = [port]
  for (let index = 1; index <= attempts; index += 1) {
    const nextPort = port + index
    if (nextPort <= 65535) ports.push(nextPort)
  }
  return ports
}

function serverKey(host, port) {
  return `${host}:${port}`
}

function boolFromEnv(value, fallback = false) {
  if (value == null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function redisUrlFromInput(options = {}) {
  return cleanText(options.redisUrl || process.env.REDIS_URL) || DEFAULT_REDIS_URL
}

function queueNameFromInput(options = {}) {
  return cleanText(options.queueName || process.env.AGENT_TASK_QUEUE_NAME) || DEFAULT_QUEUE_NAME
}

function queueProgressKey(queueName, redisUrl) {
  return `${queueName}|${redisUrl}`
}

function parseRequestUrl(requestUrl = '') {
  try {
    return new URL(requestUrl || '/', 'http://127.0.0.1')
  } catch {
    return new URL('/', 'http://127.0.0.1')
  }
}

function isWebSocketUpgrade(req) {
  const upgrade = cleanText(req.headers.upgrade).toLowerCase()
  const connection = cleanText(req.headers.connection).toLowerCase()
  return (
    upgrade === 'websocket' &&
    connection
      .split(',')
      .map((item) => item.trim())
      .includes('upgrade')
  )
}

function acceptKey(key = '') {
  return createHash('sha1').update(`${key}${WS_GUID}`).digest('base64')
}

function tokensMatch(actual, expected) {
  const actualBuffer = Buffer.from(cleanText(actual))
  const expectedBuffer = Buffer.from(cleanText(expected))
  return (
    actualBuffer.length === expectedBuffer.length &&
    actualBuffer.length > 0 &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

function encodeTextFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload), 'utf-8')
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data])
  if (data.length <= 0xffff) {
    const header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(data.length, 2)
    return Buffer.concat([header, data])
  }
  const header = Buffer.alloc(10)
  header[0] = 0x81
  header[1] = 127
  header.writeBigUInt64BE(BigInt(data.length), 2)
  return Buffer.concat([header, data])
}

function encodePongFrame(payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload.slice(0, 125) : Buffer.alloc(0)
  return Buffer.concat([Buffer.from([0x8a, data.length]), data])
}

function parseClientFrames(buffer, onFrame) {
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = (second & 0x80) === 0x80
    let length = second & 0x7f
    let headerLength = 2
    if (length === 126) {
      if (offset + 4 > buffer.length) break
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break
      const bigLength = buffer.readBigUInt64BE(offset + 2)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return buffer.subarray(offset)
      length = Number(bigLength)
      headerLength = 10
    }
    const maskLength = masked ? 4 : 0
    const frameEnd = offset + headerLength + maskLength + length
    if (frameEnd > buffer.length) break
    let payload = buffer.subarray(offset + headerLength + maskLength, frameEnd)
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4)
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]))
    }
    onFrame({ opcode, payload })
    offset = frameEnd
  }
  return buffer.subarray(offset)
}

function filterFromUrl(url) {
  return {
    bookName: cleanText(url.searchParams.get('bookName')),
    bookPath: cleanText(url.searchParams.get('bookPath')),
    bookId: cleanText(url.searchParams.get('bookId')),
    taskId: cleanText(url.searchParams.get('taskId') || url.searchParams.get('id')),
    chapterId: cleanText(url.searchParams.get('chapterId')),
    generationId: cleanText(url.searchParams.get('generationId')),
    sourceGenerationId: cleanText(url.searchParams.get('sourceGenerationId')),
    repairGenerationId: cleanText(url.searchParams.get('repairGenerationId'))
  }
}

function hasBookScope(filter = {}) {
  return Boolean(
    cleanText(filter.bookName) ||
      cleanText(filter.bookPath) ||
      cleanText(filter.bookId) ||
      cleanText(filter.taskId)
  )
}

function readCookieToken(req) {
  const cookieHeader = cleanText(req.headers?.cookie)
  if (!cookieHeader) return ''
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === 'dreamloom_session') {
      try {
        return decodeURIComponent(rest.join('=') || '')
      } catch {
        return rest.join('=') || ''
      }
    }
  }
  return ''
}

function eventMatchesFilter(payload = {}, filter = {}) {
  const task = payload.task || {}
  for (const key of Object.keys(filter)) {
    const expected = filter[key]
    if (!expected) continue
    const actual = cleanText(payload[key] || task[key])
    if (actual !== expected) return false
  }
  return true
}

function sendSocketJson(socket, payload) {
  if (!socket || socket.destroyed || !socket.writable) return false
  socket.write(encodeTextFrame(payload))
  return true
}

function registerSocket(controller, socket, filter, auth = null) {
  const client = {
    id: randomBytes(8).toString('hex'),
    socket,
    filter,
    auth,
    lastPongAt: Date.now(),
    connectedAt: new Date().toISOString(),
    pending: Buffer.alloc(0)
  }
  controller.clients.add(client)
  sendSocketJson(socket, {
    type: 'agent_task_ws_ready',
    clientId: client.id,
    filters: filter,
    connectedAt: client.connectedAt
  })

  socket.on('data', (chunk) => {
    client.pending = parseClientFrames(
      Buffer.concat([client.pending, chunk]),
      ({ opcode, payload }) => {
        if (opcode === 0x8) {
          socket.end(CLOSE_NORMAL)
        } else if (opcode === 0x9 && socket.writable) {
          socket.write(encodePongFrame(payload))
        } else if (opcode === 0xa) {
          client.lastPongAt = Date.now()
        }
      }
    )
  })
  socket.on('close', () => controller.clients.delete(client))
  socket.on('error', () => controller.clients.delete(client))
}


function authorizeUpgrade(controller, req, url, filter) {
  const queryToken = cleanText(url.searchParams.get('token'))
  const cookieToken = readCookieToken(req)
  const headerAuth = cleanText(req.headers.authorization)
  const bearer = headerAuth.toLowerCase().startsWith('bearer ')
    ? cleanText(headerAuth.slice(7))
    : ''

  if (tokensMatch(queryToken, controller.accessToken) || tokensMatch(bearer, controller.accessToken)) {
    if (!hasBookScope(filter)) {
      return { ok: false, status: 403, message: '必须指定 bookName/bookId/bookPath/taskId 才能订阅任务进度' }
    }
    return { ok: true, auth: { mode: 'accessToken', role: 'admin' } }
  }

  if (typeof controller.authorizeClient === 'function') {
    const result = controller.authorizeClient({
      req,
      url,
      filter,
      queryToken,
      cookieToken,
      bearer
    })
    if (result?.ok) {
      if (!hasBookScope(filter)) {
        return { ok: false, status: 403, message: '必须指定 bookName/bookId/bookPath/taskId 才能订阅任务进度' }
      }
      return { ok: true, auth: result.auth || { mode: 'session' } }
    }
    return {
      ok: false,
      status: result?.status || 401,
      message: result?.message || 'Unauthorized'
    }
  }

  return { ok: false, status: 401, message: 'Unauthorized' }
}

function attachUpgradeHandler(controller, req, socket) {
  const url = parseRequestUrl(req.url)
  if (url.pathname !== controller.path || !isWebSocketUpgrade(req)) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  const filter = filterFromUrl(url)
  const authResult = authorizeUpgrade(controller, req, url, filter)
  if (!authResult.ok) {
    const status = authResult.status || 401
    const label = status === 403 ? 'Forbidden' : 'Unauthorized'
    socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
    return
  }

  const key = cleanText(req.headers['sec-websocket-key'])
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      '\r\n'
    ].join('\r\n')
  )
  socket.setNoDelay(true)
  registerSocket(controller, socket, filter, authResult.auth)
}

function createController(options = {}) {
  const host = cleanText(options.host || process.env.AGENT_TASK_WS_HOST) || DEFAULT_HOST
  const port = normalizePort(options.port ?? process.env.AGENT_TASK_WS_PORT, DEFAULT_PORT)
  const path = cleanText(options.path || process.env.AGENT_TASK_WS_PATH) || '/agent-tasks'
  const key = serverKey(host, port)
  const server = http.createServer((_, res) => {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        success: false,
        message: 'agent task progress websocket is available at /agent-tasks'
      })
    )
  })
  const controller = {
    key,
    host,
    port,
    actualPort: port,
    path,
    accessToken: cleanText(options.accessToken) || randomBytes(32).toString('hex'),
    authorizeClient: typeof options.authorizeClient === 'function' ? options.authorizeClient : null,
    server,
    clients: new Set(),
    unsubscribe: null,
    pingTimer: null,
    started: false,
    starting: null
  }

  server.on('upgrade', (req, socket) => attachUpgradeHandler(controller, req, socket))
  return controller
}

function controllerInfo(controller) {
  const fallbackUsed = controller.requestedPort !== controller.actualPort
  return {
    success: true,
    host: controller.host,
    requestedPort: controller.requestedPort ?? controller.port,
    port: controller.actualPort,
    path: controller.path,
    clientCount: controller.clients.size,
    fallbackUsed,
    message: fallbackUsed
      ? `默认端口 ${controller.requestedPort} 被占用，已改用 ${controller.actualPort}`
      : '',
    url: `ws://${controller.host === '0.0.0.0' ? '127.0.0.1' : controller.host}:${controller.actualPort}${controller.path}?token=${encodeURIComponent(controller.accessToken)}`
  }
}

export async function startAgentTaskQueueProgressListener(options = {}) {
  const enabled = options.enabled ?? boolFromEnv(process.env.AGENT_TASK_QUEUE_ENABLED, false)
  if (!enabled) return { success: true, enabled: false }

  const redisUrl = redisUrlFromInput(options)
  const queueName = queueNameFromInput(options)
  const key = queueProgressKey(queueName, redisUrl)
  const existing = activeQueueProgressListeners.get(key)
  if (existing) return { success: true, enabled: true, queueName, reused: true }

  const queueEvents = new QueueEvents(queueName, { connection: { url: redisUrl } })
  queueEvents.on('progress', ({ data }) => {
    const payload = normalizeAgentTaskQueueProgress(data)
    if (payload) broadcastAgentTaskProgress(payload)
  })
  queueEvents.on('error', (error) => {
    console.error(error)
  })
  activeQueueProgressListeners.set(key, queueEvents)
  await queueEvents.waitUntilReady()
  return { success: true, enabled: true, queueName, reused: false }
}

export async function startAgentTaskProgressServer(options = {}) {
  const host = cleanText(options.host || process.env.AGENT_TASK_WS_HOST) || DEFAULT_HOST
  const port = normalizePort(options.port ?? process.env.AGENT_TASK_WS_PORT, DEFAULT_PORT)
  const fallbackAttempts = normalizeFallbackAttempts(
    options.fallbackAttempts ?? process.env.AGENT_TASK_WS_FALLBACK_PORTS,
    DEFAULT_FALLBACK_PORTS
  )
  const existing = Array.from(activeServers.values()).find(
    (item) => item.host === host && (item.requestedPort === port || item.actualPort === port)
  )
  if (existing?.started) return controllerInfo(existing)
  if (existing?.starting) return existing.starting

  const startOnPort = async (candidatePort) => {
    const key = serverKey(host, candidatePort)
    const controller = createController({ ...options, host, port: candidatePort })
    controller.requestedPort = port
    activeServers.set(key, controller)
    controller.unsubscribe = onAgentTaskProgress((payload) => broadcastAgentTaskProgress(payload))
    controller.pingTimer = setInterval(() => {
      const now = Date.now()
      for (const client of controller.clients) {
        if (client.socket.destroyed || !client.socket.writable) {
          controller.clients.delete(client)
          continue
        }
        if (now - (client.lastPongAt || now) > PING_INTERVAL_MS * 3) {
          try {
            client.socket.end(CLOSE_NORMAL)
          } catch {
            // ignore close errors
          }
          controller.clients.delete(client)
          continue
        }
        client.socket.write(Buffer.from([0x89, 0x00]))
      }
    }, PING_INTERVAL_MS)
    controller.pingTimer.unref?.()

    controller.starting = new Promise((resolve, reject) => {
      controller.server.once('error', (error) => {
        controller.unsubscribe?.()
        clearInterval(controller.pingTimer)
        activeServers.delete(key)
        reject(error)
      })
      controller.server.listen(candidatePort, host, () => {
        controller.started = true
        controller.actualPort = controller.server.address()?.port || candidatePort
        controller.key = serverKey(host, controller.actualPort)
        if (controller.key !== key) {
          activeServers.delete(key)
          activeServers.set(controller.key, controller)
        }
        resolve(controllerInfo(controller))
      })
    })
    return controller.starting
  }

  const startup = (async () => {
    let lastError = null
    for (const candidatePort of candidatePorts(port, fallbackAttempts)) {
      try {
        return await startOnPort(candidatePort)
      } catch (error) {
        lastError = error
        if (error?.code !== 'EADDRINUSE' || candidatePort === 0) throw error
        console.warn(
          `Agent task progress websocket port ${candidatePort} is in use, trying next port.`
        )
      }
    }
    throw lastError
  })()
  if (options.listenQueueProgress !== false) {
    startAgentTaskQueueProgressListener(options).catch((error) => {
      console.warn('Agent task queue progress listener failed:', error?.message || error)
    })
  }
  return startup
}

export function getAgentTaskProgressServerInfo(options = {}) {
  const host = cleanText(options.host || process.env.AGENT_TASK_WS_HOST) || DEFAULT_HOST
  const port = normalizePort(options.port ?? process.env.AGENT_TASK_WS_PORT, DEFAULT_PORT)
  const controller =
    activeServers.get(serverKey(host, port)) ||
    Array.from(activeServers.values()).find(
      (item) => item.host === host && (item.requestedPort === port || item.actualPort === port)
    )
  if (!controller?.started) {
    return {
      success: false,
      host,
      requestedPort: port,
      port,
      path: cleanText(options.path || process.env.AGENT_TASK_WS_PATH) || '/agent-tasks',
      message: 'Agent 任务进度服务尚未启动'
    }
  }
  return controllerInfo(controller)
}

export function broadcastAgentTaskProgress(payload = {}) {
  let delivered = 0
  for (const controller of activeServers.values()) {
    if (!controller.started) continue
    for (const client of controller.clients) {
      if (!eventMatchesFilter(payload, client.filter)) continue
      if (sendSocketJson(client.socket, payload)) delivered += 1
    }
  }
  return delivered
}

export async function stopAgentTaskProgressServer(options = {}) {
  const host = cleanText(options.host || process.env.AGENT_TASK_WS_HOST) || DEFAULT_HOST
  const hasPort = options.port != null
  const controllers = hasPort
    ? [
        activeServers.get(
          serverKey(
            host,
            normalizePort(options.port ?? process.env.AGENT_TASK_WS_PORT, DEFAULT_PORT)
          )
        )
      ].filter(Boolean)
    : Array.from(activeServers.values())
  const stoppedServers = controllers.map((controller) => ({
    host: controller.host,
    port: controller.port,
    key: controller.key,
    clientCount: controller.clients.size,
    started: controller.started
  }))

  await Promise.all(
    controllers.map(
      (controller) =>
        new Promise((resolve) => {
          controller.unsubscribe?.()
          clearInterval(controller.pingTimer)
          for (const client of controller.clients) {
            if (!client.socket.destroyed) client.socket.end(CLOSE_NORMAL)
          }
          controller.clients.clear()
          activeServers.delete(controller.key)
          if (!controller.started) {
            resolve()
            return
          }
          controller.server.close(() => {
            controller.started = false
            resolve()
          })
        })
    )
  )

  const closeQueueProgress = options.closeQueueProgress !== false
  let closedQueueProgressListeners = 0
  if (closeQueueProgress) {
    await Promise.all(
      Array.from(activeQueueProgressListeners.entries()).map(async ([key, queueEvents]) => {
        activeQueueProgressListeners.delete(key)
        closedQueueProgressListeners += 1
        await queueEvents.close().catch(() => {})
      })
    )
  }
  return {
    success: true,
    host,
    port: hasPort
      ? normalizePort(options.port ?? process.env.AGENT_TASK_WS_PORT, DEFAULT_PORT)
      : null,
    stoppedServers,
    stoppedServerCount: stoppedServers.length,
    closedClientCount: stoppedServers.reduce((total, item) => total + item.clientCount, 0),
    closeQueueProgress,
    closedQueueProgressListeners
  }
}

export default {
  startAgentTaskProgressServer,
  startAgentTaskQueueProgressListener,
  getAgentTaskProgressServerInfo,
  stopAgentTaskProgressServer,
  broadcastAgentTaskProgress
}

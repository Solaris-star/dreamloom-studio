import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { getAgentProgressServer } from '../service/editor.js'

const DEFAULT_PORT = '8787'
const DEFAULT_PATH = '/agent-tasks'
const RECONNECT_BASE_DELAY_MS = 800
const RECONNECT_MAX_DELAY_MS = 8000
const FILTER_KEYS = [
  'bookName',
  'bookPath',
  'bookId',
  'taskId',
  'chapterId',
  'generationId',
  'sourceGenerationId',
  'repairGenerationId'
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function runtimeEnv() {
  return import.meta.env || {}
}

function inferWsHost() {
  if (typeof window === 'undefined') return '127.0.0.1'
  return cleanText(window.location?.hostname) || '127.0.0.1'
}

function inferWsProtocol() {
  if (typeof window === 'undefined') return 'ws'
  return window.location?.protocol === 'https:' ? 'wss' : 'ws'
}

function normalizeBaseUrl(options = {}) {
  const env = runtimeEnv()
  const configuredUrl = cleanText(options.baseUrl || env.VITE_AGENT_TASK_WS_URL)
  if (configuredUrl) return configuredUrl
  const protocol =
    cleanText(options.protocol || env.VITE_AGENT_TASK_WS_PROTOCOL) || inferWsProtocol()
  const host = cleanText(options.host || env.VITE_AGENT_TASK_WS_HOST) || inferWsHost()
  const port = cleanText(options.port || env.VITE_AGENT_TASK_WS_PORT) || DEFAULT_PORT
  return `${protocol}://${host}:${port}${cleanText(options.path || env.VITE_AGENT_TASK_WS_PATH) || DEFAULT_PATH}`
}

export function buildAgentTaskProgressUrl(filters = {}, options = {}) {
  const url = new URL(normalizeBaseUrl(options))
  if (url.pathname === '/' || !url.pathname) {
    url.pathname = cleanText(options.path || runtimeEnv().VITE_AGENT_TASK_WS_PATH) || DEFAULT_PATH
  }
  for (const key of FILTER_KEYS) {
    const value = cleanText(filters[key])
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export function upsertAgentTaskProgressItem(rows = [], task = {}) {
  if (!task?.id) return rows
  const nextRows = [task, ...rows.filter((item) => item?.id !== task.id)]
  return nextRows.sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
    return rightTime - leftTime
  })
}

export function useAgentTaskProgressSocket(options = {}) {
  const status = ref('idle')
  const error = ref('')
  const lastMessageAt = ref('')
  const currentUrl = ref('')
  const serverInfo = ref(null)
  const lastCloseReason = ref('')
  const reconnectAttemptCount = ref(0)
  const nextReconnectAt = ref('')
  let socket = null
  let reconnectTimer = null
  let reconnectAttempt = 0
  let manualClose = false
  let latestFilters = {}
  let connectToken = 0

  function clearReconnectTimer() {
    if (!reconnectTimer) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
    nextReconnectAt.value = ''
  }

  function closeSocket() {
    if (!socket) return
    const closing = socket
    socket = null
    closing.onopen = null
    closing.onmessage = null
    closing.onerror = null
    closing.onclose = null
    if (closing.readyState === WebSocket.OPEN || closing.readyState === WebSocket.CONNECTING) {
      closing.close()
    }
  }

  function scheduleReconnect() {
    if (manualClose || typeof window === 'undefined') return
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectAttemptCount.value = reconnectAttempt
    status.value = 'reconnecting'
    nextReconnectAt.value = new Date(Date.now() + delay).toISOString()
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      // 断线后重新拉一次 progress-server，拿到最新 token / 端口
      serverInfo.value = null
      connect(latestFilters)
    }, delay)
  }

  async function resolveServerInfo() {
    const resolver =
      options.getServerInfo || (typeof window !== 'undefined' ? getAgentProgressServer : null)
    if (typeof resolver !== 'function') return null
    try {
      const info = await resolver()
      serverInfo.value = info || null
      if (info?.success === false && info?.message) {
        error.value = info.message
      }
      return info
    } catch (resolveError) {
      const message = resolveError?.message || '读取 Agent 进度服务状态失败'
      serverInfo.value = { success: false, message }
      error.value = message
      return serverInfo.value
    }
  }

  function openSocket(filters = {}, baseUrl = '') {
    const url = buildAgentTaskProgressUrl(filters, {
      ...options,
      baseUrl: baseUrl || options.baseUrl
    })
    currentUrl.value = url

    try {
      socket = new window.WebSocket(url)
    } catch (createError) {
      error.value = createError?.message || '连接任务进度失败'
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      reconnectAttempt = 0
      reconnectAttemptCount.value = 0
      nextReconnectAt.value = ''
      lastCloseReason.value = ''
      status.value = 'connected'
      error.value =
        serverInfo.value?.fallbackUsed && serverInfo.value?.message ? serverInfo.value.message : ''
    }
    socket.onmessage = handleMessage
    socket.onerror = () => {
      error.value = '任务进度连接异常'
    }
    socket.onclose = (event) => {
      socket = null
      const code = event?.code ? `code ${event.code}` : ''
      const reason = cleanText(event?.reason)
      lastCloseReason.value = [code, reason].filter(Boolean).join('，') || '连接已断开'
      if (manualClose) {
        status.value = 'idle'
        return
      }
      scheduleReconnect()
    }
  }

  function handleMessage(rawEvent) {
    let payload = null
    try {
      payload = JSON.parse(rawEvent?.data || '{}')
    } catch {
      return
    }
    lastMessageAt.value = new Date().toISOString()
    options.onMessage?.(payload)
    if (payload.type === 'agent_task_updated') {
      options.onTask?.(payload.task, payload)
    }
  }

  function connect(filters = {}) {
    const token = connectToken + 1
    connectToken = token
    latestFilters = { ...filters }
    clearReconnectTimer()
    manualClose = false

    if (
      !cleanText(
        latestFilters.bookName ||
          latestFilters.bookPath ||
          latestFilters.bookId ||
          latestFilters.taskId
      )
    ) {
      disconnect()
      return
    }
    if (typeof window === 'undefined' || typeof window.WebSocket !== 'function') {
      status.value = 'unsupported'
      error.value = '当前环境没有可用的 WebSocket'
      return
    }

    closeSocket()
    status.value = 'connecting'
    lastCloseReason.value = ''
    if (!serverInfo.value?.fallbackUsed) error.value = ''

    resolveServerInfo().then((info) => {
      if (manualClose || token !== connectToken) return
      const baseUrl = cleanText(info?.url)
      if (info?.success === false && info?.message && !baseUrl) {
        status.value = 'unavailable'
        currentUrl.value = ''
        return
      }
      openSocket(latestFilters, baseUrl)
    })
  }

  function disconnect() {
    manualClose = true
    connectToken += 1
    clearReconnectTimer()
    closeSocket()
    status.value = 'idle'
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(disconnect)
  }

  return {
    status,
    error,
    lastMessageAt,
    currentUrl,
    serverInfo,
    lastCloseReason,
    reconnectAttemptCount,
    nextReconnectAt,
    connect,
    disconnect
  }
}

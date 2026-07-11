const DEFAULT_TIMEOUT_MS = 15_000

function createTimeoutError(timeoutMs) {
  const error = new Error(`保存请求超时（${timeoutMs} ms）`)
  error.code = 'SAVE_TIMEOUT'
  return error
}

export function createEditorSaveQueue({
  persist,
  onStatusChange = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  let requestSequence = 0
  let running = false
  let activeEntry = null
  const pendingByKey = new Map()
  const pendingOrder = []
  const flushWaiters = new Set()

  function report(status, details = {}) {
    try {
      onStatusChange({ status, ...details })
    } catch (error) {
      console.error('保存状态回调失败:', error)
    }
  }

  function hasPending(filePath) {
    if (filePath) {
      return activeEntry?.snapshot.filePath === filePath || pendingByKey.has(filePath)
    }
    return Boolean(activeEntry) || pendingByKey.size > 0
  }

  function settleFlushWaiters() {
    for (const waiter of flushWaiters) {
      if (!hasPending(waiter.filePath)) {
        flushWaiters.delete(waiter)
        waiter.resolve()
      }
    }
  }

  function flush(filePath) {
    if (!hasPending(filePath)) return Promise.resolve()
    return new Promise((resolve) => {
      flushWaiters.add({ filePath, resolve })
    })
  }

  async function persistWithTimeout(snapshot) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return persist(snapshot)
    let timer
    try {
      return await Promise.race([
        persist(snapshot),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async function drain() {
    if (running) return
    running = true
    try {
      while (pendingOrder.length > 0) {
        const key = pendingOrder.shift()
        const entry = pendingByKey.get(key)
        if (!entry) continue
        pendingByKey.delete(key)
        activeEntry = entry
        report('saving', { requestId: entry.snapshot.requestId, filePath: key })
        try {
          const result = await persistWithTimeout(entry.snapshot)
          if (!result?.success) {
            throw new Error(result?.message || '保存失败')
          }
          report('saved', {
            requestId: entry.snapshot.requestId,
            filePath: key,
            savedAt: Date.now()
          })
          entry.resolve(result)
        } catch (error) {
          report(error?.offline ? 'offline' : 'error', {
            requestId: entry.snapshot.requestId,
            filePath: key,
            error
          })
          entry.resolve({ success: false, message: error?.message || '保存失败', error })
        } finally {
          activeEntry = null
          settleFlushWaiters()
        }
      }
    } finally {
      activeEntry = null
      running = false
      settleFlushWaiters()
    }
  }

  function enqueue(snapshot) {
    if (!snapshot?.filePath) {
      return Promise.resolve({ success: false, message: '缺少保存文件路径' })
    }
    const requestId = ++requestSequence
    const immutableSnapshot = Object.freeze({ ...snapshot, requestId })
    const key = immutableSnapshot.filePath
    return new Promise((resolve) => {
      const previous = pendingByKey.get(key)
      if (previous) {
        previous.resolve({ success: false, superseded: true, message: '已由更新内容替代' })
      } else {
        pendingOrder.push(key)
      }
      pendingByKey.set(key, { snapshot: immutableSnapshot, resolve })
      void drain()
    })
  }

  return { enqueue, flush, hasPending }
}

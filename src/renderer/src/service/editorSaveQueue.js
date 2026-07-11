export function createEditorSaveQueue({ persist, onStatusChange = () => {} }) {
  let requestSequence = 0
  let running = false
  const pendingByKey = new Map()
  const pendingOrder = []

  function report(status, details = {}) {
    onStatusChange({ status, ...details })
  }

  async function drain() {
    if (running) return
    running = true
    while (pendingOrder.length > 0) {
      const key = pendingOrder.shift()
      const entry = pendingByKey.get(key)
      if (!entry) continue
      pendingByKey.delete(key)
      report('saving', { requestId: entry.snapshot.requestId, filePath: key })
      try {
        const result = await persist(entry.snapshot)
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
      }
    }
    running = false
  }

  function enqueue(snapshot) {
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

  return { enqueue }
}

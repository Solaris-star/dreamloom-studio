import assert from 'node:assert/strict'
import { createEditorSaveQueue } from '../src/renderer/src/service/editorSaveQueue.js'

const calls = []
let releaseFirst
const firstGate = new Promise((resolve) => {
  releaseFirst = resolve
})
const statuses = []
const queue = createEditorSaveQueue({
  async persist(snapshot) {
    calls.push(snapshot)
    if (snapshot.content === 'first') await firstGate
    return { success: true }
  },
  onStatusChange(state) {
    statuses.push(state.status)
  }
})

const first = queue.enqueue({ filePath: 'a', content: 'first' })
const stale = queue.enqueue({ filePath: 'a', content: 'stale' })
const latest = queue.enqueue({ filePath: 'a', content: 'latest' })
assert.equal((await stale).superseded, true)
releaseFirst()
assert.equal((await first).success, true)
assert.equal((await latest).success, true)
assert.deepEqual(calls.map((item) => item.content), ['first', 'latest'])
assert.ok(calls[0].requestId < calls[1].requestId)
assert.deepEqual(statuses, ['saving', 'saving', 'saving', 'saved'])

const failedQueue = createEditorSaveQueue({
  async persist() {
    return { success: false, message: '磁盘不可写' }
  }
})
const failed = await failedQueue.enqueue({ filePath: 'b', content: 'text' })
assert.equal(failed.success, false)
assert.equal(failed.message, '磁盘不可写')

const multiFileCalls = []
let releaseMultiFile
const multiFileGate = new Promise((resolve) => {
  releaseMultiFile = resolve
})
const multiFileQueue = createEditorSaveQueue({
  async persist(snapshot) {
    multiFileCalls.push(snapshot.filePath)
    if (snapshot.filePath === 'chapter-a') await multiFileGate
    return { success: true }
  }
})
const chapterA = multiFileQueue.enqueue({ filePath: 'chapter-a', content: 'A' })
const chapterB = multiFileQueue.enqueue({ filePath: 'chapter-b', content: 'B' })
assert.equal(multiFileQueue.hasPending('chapter-a'), true)
assert.equal(multiFileQueue.hasPending('chapter-b'), true)
let chapterBFlushed = false
const flushChapterB = multiFileQueue.flush('chapter-b').then(() => {
  chapterBFlushed = true
})
await Promise.resolve()
assert.equal(chapterBFlushed, false)
releaseMultiFile()
await Promise.all([chapterA, chapterB, flushChapterB])
assert.deepEqual(multiFileCalls, ['chapter-a', 'chapter-b'])
assert.equal(multiFileQueue.hasPending(), false)

const callbackErrors = []
const originalConsoleError = console.error
console.error = (...args) => callbackErrors.push(args)
try {
  const callbackQueue = createEditorSaveQueue({
    async persist() {
      return { success: true }
    },
    onStatusChange() {
      throw new Error('界面已卸载')
    }
  })
  assert.equal((await callbackQueue.enqueue({ filePath: 'callback', content: 'text' })).success, true)
  await callbackQueue.flush()
  assert.equal(callbackQueue.hasPending(), false)
  assert.equal(callbackErrors.length, 2)
} finally {
  console.error = originalConsoleError
}

const timeoutQueue = createEditorSaveQueue({
  persist: () => new Promise(() => {}),
  timeoutMs: 10
})
const timedOut = await timeoutQueue.enqueue({ filePath: 'timeout', content: 'text' })
assert.equal(timedOut.success, false)
assert.equal(timedOut.error.code, 'SAVE_TIMEOUT')
assert.match(timedOut.message, /保存请求超时/)

const offlineStatuses = []
const offlineQueue = createEditorSaveQueue({
  async persist() {
    throw new TypeError('Failed to fetch')
  },
  onStatusChange(state) {
    offlineStatuses.push(state.status)
  }
})
const offline = await offlineQueue.enqueue({ filePath: 'offline', content: 'text' })
assert.equal(offline.success, false)
assert.deepEqual(offlineStatuses, ['saving', 'offline'])

const invalid = await queue.enqueue({ filePath: '', content: 'text' })
assert.equal(invalid.success, false)
assert.match(invalid.message, /文件路径/)

console.log('editor save queue tests passed')

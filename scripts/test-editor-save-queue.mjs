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
assert.deepEqual(statuses, ['saving', 'saved', 'saving', 'saved'])

const failedQueue = createEditorSaveQueue({
  async persist() {
    return { success: false, message: '磁盘不可写' }
  }
})
const failed = await failedQueue.enqueue({ filePath: 'b', content: 'text' })
assert.equal(failed.success, false)
assert.equal(failed.message, '磁盘不可写')

console.log('editor save queue tests passed')

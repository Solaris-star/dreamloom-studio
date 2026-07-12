import assert from 'node:assert/strict'

const requests = []
let responseData = { success: true }

globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, payload: JSON.parse(options.body || '{}') })
  return new Response(JSON.stringify(responseData), {
    status: responseData.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const snapshots = await import('../src/renderer/src/service/settingSnapshot.js')

responseData = {
  success: true,
  snapshots: [
    { id: 'snapshot-1', timestamp: '2026-07-12', trigger: 'auto' },
    null
  ]
}
assert.deepEqual(await snapshots.listSettingSnapshots('D:/books/a'), [
  {
    id: 'snapshot-1',
    timestamp: '2026-07-12',
    createdAt: '2026-07-12',
    trigger: 'auto',
    triggerType: 'auto'
  }
])
assert.deepEqual(requests.at(-1), {
  url: '/api/setting-snapshots/list',
  payload: { bookPath: 'D:/books/a' }
})

responseData = {
  success: true,
  snapshot: { id: 'snapshot-2', createdAt: '2026-07-12', triggerType: 'manual' }
}
assert.equal((await snapshots.createSettingSnapshot({ name: '版本一' })).id, 'snapshot-2')
assert.equal((await snapshots.restoreSettingSnapshot({ snapshotId: 'snapshot-2' })).id, 'snapshot-2')

responseData = {
  success: true,
  added: [{ path: '人物/甲' }],
  removed: [],
  modified: []
}
assert.deepEqual((await snapshots.diffSettingSnapshots()).summary, {
  added: [{ path: '人物/甲' }],
  removed: [],
  modified: []
})

responseData = { success: true, snapshotId: 'snapshot-2' }
assert.equal((await snapshots.deleteSettingSnapshot({ snapshotId: 'snapshot-2' })).snapshotId, 'snapshot-2')

responseData = { success: false, message: '快照不存在' }
await assert.rejects(() => snapshots.listSettingSnapshots('D:/books/a'), /快照不存在/)
responseData = { success: true, snapshot: null }
await assert.rejects(() => snapshots.createSettingSnapshot(), /操作失败/)
responseData = { success: true, added: [], removed: null, modified: [] }
await assert.rejects(() => snapshots.diffSettingSnapshots(), /对比失败/)
responseData = { success: true, snapshotId: 'wrong' }
await assert.rejects(
  () => snapshots.deleteSettingSnapshot({ snapshotId: 'snapshot-2' }),
  /操作失败/
)

console.log('Web 设定快照服务测试通过')

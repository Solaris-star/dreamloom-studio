import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createSnapshot,
  deleteSnapshot,
  diffSnapshots,
  listSnapshots,
  restoreSnapshot
} from '../src/main/services/settingSnapshotService.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-setting-snapshots-'))
const settingsPath = path.join(root, 'settings.json')

try {
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ categories: [{ name: '世界', introduction: '旧设定', items: [] }] }),
    'utf8'
  )
  const first = createSnapshot(root, { name: '初始版本' })

  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ categories: [{ name: '世界', introduction: '新设定', items: [] }] }),
    'utf8'
  )
  const second = createSnapshot(root, { name: '修改版本' })

  assert.equal(listSnapshots(root).length, 2)
  assert.deepEqual(diffSnapshots(root, first.id, second.id).modified, [
    { path: '世界', type: 'category', introduction: '新设定' }
  ])

  assert.equal(restoreSnapshot(root, first.id).id, first.id)
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).categories[0].introduction, '旧设定')
  assert.equal(restoreSnapshot(root, 'missing'), null)

  assert.equal(deleteSnapshot(root, second.id), true)
  assert.equal(deleteSnapshot(root, second.id), false)
  assert.equal(listSnapshots(root).length, 1)

  console.log('设定快照服务测试通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

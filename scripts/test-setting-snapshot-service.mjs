import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createSnapshot,
  deleteSnapshot,
  diffSnapshots,
  flattenSettingsData,
  listSnapshots,
  restoreSnapshot,
  restoreSnapshotWithBackup
} from '../src/main/services/settingSnapshotService.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-setting-snapshots-'))
const settingsPath = path.join(root, 'settings.json')

try {
  assert.deepEqual(listSnapshots(root), [])
  assert.deepEqual(flattenSettingsData(), [])
  assert.deepEqual(flattenSettingsData({ categories: 'invalid' }), [])
  assert.deepEqual(
    flattenSettingsData({
      categories: [
        {
          name: '',
          children: 'invalid',
          items: [null, { name: '' }, { name: '人物', introduction: ' 主角 ' }]
        }
      ]
    }),
    [
      { path: '未分类', type: 'category', introduction: '' },
      { path: '未分类 / 人物', type: 'item', introduction: '主角' }
    ]
  )

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
  assert.equal(diffSnapshots(root, first.id, 'missing'), null)
  assert.deepEqual(diffSnapshots(root, first.id, second.id).modified, [
    { path: '世界', type: 'category', introduction: '新设定' }
  ])

  const restored = restoreSnapshotWithBackup(root, first.id)
  assert.equal(restored.snapshot.id, first.id)
  assert.equal(restored.backup.name, '恢复前备份')
  assert.equal(restored.backup.trigger, 'before_restore')
  assert.equal(restored.backup.data.categories[0].introduction, '新设定')
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).categories[0].introduction, '旧设定')
  assert.equal(restoreSnapshot(root, first.id).id, first.id)
  assert.equal(restoreSnapshot(root, 'missing'), null)
  assert.equal(restoreSnapshotWithBackup(root, 'missing'), null)

  assert.equal(deleteSnapshot(root, second.id), true)
  assert.equal(deleteSnapshot(root, second.id), false)
  assert.equal(listSnapshots(root).length, 2)

  fs.writeFileSync(settingsPath, '{bad json', 'utf8')
  const fallbackSnapshot = createSnapshot(root)
  assert.equal(fallbackSnapshot.name, '快照 3')
  assert.deepEqual(fallbackSnapshot.data, { categories: [] })

  fs.writeFileSync(settingsPath, JSON.stringify({ categories: [] }), 'utf8')
  for (let index = 0; index < 50; index += 1) {
    createSnapshot(root, { name: `批量快照 ${index}` })
  }
  const limitedSnapshots = listSnapshots(root)
  assert.equal(limitedSnapshots.length, 50)
  assert.equal(limitedSnapshots.some((item) => item.id === first.id), false)

  const diffRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-setting-diff-'))
  try {
    fs.writeFileSync(
      path.join(diffRoot, 'settings.json'),
      JSON.stringify({
        categories: [
          {
            name: '人物',
            introduction: '旧分类',
            children: [{ name: '配角', introduction: '', items: [] }],
            items: [{ name: '主角', introduction: '旧介绍' }]
          }
        ]
      }),
      'utf8'
    )
    const before = createSnapshot(diffRoot, { name: '修改前' })
    fs.writeFileSync(
      path.join(diffRoot, 'settings.json'),
      JSON.stringify({
        categories: [
          {
            name: '人物',
            introduction: '旧分类',
            items: [{ name: '主角', introduction: '新介绍' }, { name: '反派', introduction: '' }]
          }
        ]
      }),
      'utf8'
    )
    const after = createSnapshot(diffRoot, { name: '修改后' })
    const differences = diffSnapshots(diffRoot, before.id, after.id)
    assert.deepEqual(differences.added, [
      { path: '人物 / 反派', type: 'item', introduction: '' }
    ])
    assert.deepEqual(differences.removed, [
      { path: '人物 / 配角', type: 'category', introduction: '' }
    ])
    assert.deepEqual(differences.modified, [
      { path: '人物 / 主角', type: 'item', introduction: '新介绍' }
    ])
  } finally {
    fs.rmSync(diffRoot, { recursive: true, force: true })
  }

  const missingRoot = path.join(root, '不存在', '子目录')
  assert.throws(() => createSnapshot(missingRoot), /设定快照保存失败/)

  const restoreFailureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-setting-failure-'))
  try {
    fs.writeFileSync(
      path.join(restoreFailureRoot, 'settings.json'),
      JSON.stringify({ categories: [] }),
      'utf8'
    )
    const snapshot = createSnapshot(restoreFailureRoot)
    fs.rmSync(path.join(restoreFailureRoot, 'settings.json'))
    fs.mkdirSync(path.join(restoreFailureRoot, 'settings.json'))
    assert.throws(
      () => restoreSnapshot(restoreFailureRoot, snapshot.id),
      /设定恢复写入失败/
    )
  } finally {
    fs.rmSync(restoreFailureRoot, { recursive: true, force: true })
  }

  console.log('设定快照服务测试通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

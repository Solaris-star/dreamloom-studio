import fs from 'fs'
import { join } from 'path'

const MAX_SNAPSHOTS = 50

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

function flattenSettingsData(data) {
  const categories = Array.isArray(data?.categories) ? data.categories : []
  const out = []

  function traverse(nodes, pathParts = []) {
    if (!Array.isArray(nodes)) return

    for (const category of nodes) {
      const categoryName = String(category?.name || '').trim() || '未分类'
      const currentPath = [...pathParts, categoryName]
      const introduction = String(category?.introduction || '').trim()

      out.push({
        path: currentPath.join(' / '),
        type: 'category',
        introduction
      })

      traverse(category?.children, currentPath)

      const items = Array.isArray(category?.items) ? category.items : []
      for (const item of items) {
        const name = String(item?.name || '').trim()
        if (!name) continue
        out.push({
          path: [...currentPath, name].join(' / '),
          type: 'item',
          introduction: String(item?.introduction || '').trim()
        })
      }
    }
  }

  traverse(categories)
  return out
}

function getSnapshotFilePath(bookPath) {
  return join(bookPath, 'setting_snapshots.json')
}

function loadSnapshots(bookPath) {
  return safeReadJson(getSnapshotFilePath(bookPath), [])
}

function saveSnapshots(bookPath, snapshots) {
  return safeWriteJson(getSnapshotFilePath(bookPath), snapshots)
}

function assertSaved(saved, message) {
  if (!saved) {
    throw new Error(message)
  }
}

function listSnapshots(bookPath) {
  return loadSnapshots(bookPath)
}

function createSnapshot(bookPath, { name, trigger = 'manual' } = {}) {
  const snapshots = loadSnapshots(bookPath)
  const settings = safeReadJson(join(bookPath, 'settings.json'), { categories: [] })

  const snapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name || `快照 ${snapshots.length + 1}`,
    timestamp: new Date().toISOString(),
    trigger,
    data: settings
  }

  snapshots.push(snapshot)

  if (snapshots.length > MAX_SNAPSHOTS) {
    const excess = snapshots.length - MAX_SNAPSHOTS
    snapshots.splice(0, excess)
  }

  assertSaved(saveSnapshots(bookPath, snapshots), '设定快照保存失败')
  return snapshot
}

function restoreSnapshot(bookPath, snapshotId) {
  const snapshots = loadSnapshots(bookPath)
  const snapshot = snapshots.find((s) => s.id === snapshotId)
  if (!snapshot) return null

  assertSaved(safeWriteJson(join(bookPath, 'settings.json'), snapshot.data), '设定恢复写入失败')
  return snapshot
}

function restoreSnapshotWithBackup(bookPath, snapshotId) {
  const snapshots = loadSnapshots(bookPath)
  const snapshot = snapshots.find((item) => item.id === snapshotId)
  if (!snapshot) return null

  const backup = createSnapshot(bookPath, {
    name: '恢复前备份',
    trigger: 'before_restore'
  })
  assertSaved(safeWriteJson(join(bookPath, 'settings.json'), snapshot.data), '设定恢复写入失败')
  return { snapshot, backup }
}

function deleteSnapshot(bookPath, snapshotId) {
  const snapshots = loadSnapshots(bookPath)
  const index = snapshots.findIndex((s) => s.id === snapshotId)
  if (index === -1) return false

  snapshots.splice(index, 1)
  assertSaved(saveSnapshots(bookPath, snapshots), '设定快照删除失败')
  return true
}

function diffSnapshots(bookPath, snapshotIdA, snapshotIdB) {
  const snapshots = loadSnapshots(bookPath)
  const snapA = snapshots.find((s) => s.id === snapshotIdA)
  const snapB = snapshots.find((s) => s.id === snapshotIdB)
  if (!snapA || !snapB) return null

  const flatA = flattenSettingsData(snapA.data)
  const flatB = flattenSettingsData(snapB.data)

  const mapA = new Map(flatA.map((item) => [item.path, item]))
  const mapB = new Map(flatB.map((item) => [item.path, item]))

  const added = []
  const removed = []
  const modified = []

  for (const [path, itemB] of mapB) {
    if (!mapA.has(path)) {
      added.push({ path, type: itemB.type, introduction: itemB.introduction })
    } else {
      const itemA = mapA.get(path)
      if (itemA.introduction !== itemB.introduction || itemA.type !== itemB.type) {
        modified.push({ path, type: itemB.type, introduction: itemB.introduction })
      }
    }
  }

  for (const [path, itemA] of mapA) {
    if (!mapB.has(path)) {
      removed.push({ path, type: itemA.type, introduction: itemA.introduction })
    }
  }

  return { added, removed, modified }
}

export {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  restoreSnapshotWithBackup,
  deleteSnapshot,
  diffSnapshots,
  flattenSettingsData
}

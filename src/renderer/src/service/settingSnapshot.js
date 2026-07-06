function requireSettingSnapshotApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持设定快照接口：${name}`)
  }
  return api
}

function createSettingSnapshotError(result, fallback = '操作失败') {
  return new Error(result?.message || fallback)
}

function normalizeSettingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.id) {
    return null
  }
  const createdAt = snapshot.createdAt || snapshot.timestamp || ''
  const triggerType = snapshot.triggerType || snapshot.trigger || 'manual'
  return {
    ...snapshot,
    createdAt,
    timestamp: createdAt,
    triggerType,
    trigger: triggerType
  }
}

function requireSnapshotListResult(result, fallback = '读取快照失败') {
  if (result?.success !== true || !Array.isArray(result.snapshots)) {
    throw createSettingSnapshotError(result, fallback)
  }

  return result.snapshots
    .map((snapshot) => normalizeSettingSnapshot(snapshot))
    .filter(Boolean)
}

function requireSettingSnapshotSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw createSettingSnapshotError(result, fallback)
  }
  return result
}

function requireSettingSnapshotResult(result, fallback = '操作失败') {
  requireSettingSnapshotSuccess(result, fallback)
  const snapshot = normalizeSettingSnapshot(result.snapshot)
  if (!snapshot) {
    throw new Error(fallback)
  }
  return snapshot
}

function requireSettingSnapshotDiffResult(result, fallback = '对比失败') {
  requireSettingSnapshotSuccess(result, fallback)
  if (!Array.isArray(result.added) || !Array.isArray(result.removed) || !Array.isArray(result.modified)) {
    throw new Error(fallback)
  }
  return {
    added: result.added,
    removed: result.removed,
    modified: result.modified,
    summary: result.summary || {
      added: result.added,
      removed: result.removed,
      modified: result.modified
    }
  }
}

function requireDeleteSettingSnapshotResult(result, expectedSnapshotId, fallback = '操作失败') {
  requireSettingSnapshotSuccess(result, fallback)
  if (result.snapshotId !== expectedSnapshotId) {
    throw new Error(fallback)
  }
  return result
}

export async function listSettingSnapshots(bookPath, fallback = '读取快照失败') {
  const res = await requireSettingSnapshotApi('listSettingSnapshots')(bookPath)
  return requireSnapshotListResult(res, fallback)
}

export async function createSettingSnapshot(payload = {}, fallback = '操作失败') {
  const res = await requireSettingSnapshotApi('createSettingSnapshot')(payload)
  return requireSettingSnapshotResult(res, fallback)
}

export async function restoreSettingSnapshot(payload = {}, fallback = '操作失败') {
  const res = await requireSettingSnapshotApi('restoreSettingSnapshot')(payload)
  return requireSettingSnapshotResult(res, fallback)
}

export async function deleteSettingSnapshot(payload = {}, fallback = '操作失败') {
  const res = await requireSettingSnapshotApi('deleteSettingSnapshot')(payload)
  return requireDeleteSettingSnapshotResult(res, payload.snapshotId, fallback)
}

export async function diffSettingSnapshots(payload = {}, fallback = '对比失败') {
  const res = await requireSettingSnapshotApi('diffSettingSnapshots')(payload)
  return requireSettingSnapshotDiffResult(res, fallback)
}

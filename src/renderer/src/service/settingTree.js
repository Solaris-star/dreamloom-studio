function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持设定树接口：${name}`)
  }
  return api
}

function createSettingTreeError(result, fallback = '操作失败') {
  return new Error(result?.message || fallback)
}

function isSettingTreeNode(node) {
  return Boolean(node && typeof node === 'object' && String(node.name || '').trim())
}

function requireSettingTreeSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw createSettingTreeError(result, fallback)
  }
  return result
}

function requireSettingTreeResult(result, fallback = '生成失败') {
  const ok = requireSettingTreeSuccess(result, fallback)
  if (!Array.isArray(ok.tree) || !ok.tree.some(isSettingTreeNode)) {
    throw new Error(fallback)
  }
  return ok.tree
}

function requireSettingTreeNodeResult(result, fallback = '重新生成失败') {
  const ok = requireSettingTreeSuccess(result, fallback)
  if (!isSettingTreeNode(ok.node)) {
    throw new Error(fallback)
  }
  return ok.node
}

function requireSettingTreeApplyResult(result, fallback = '应用失败') {
  const ok = requireSettingTreeSuccess(result, fallback)
  if (!String(ok.settingsPath || ok.documentPath || ok.path || '').trim()) {
    throw new Error(fallback)
  }
  if (!Number.isFinite(Number(ok.categoryCount))) {
    throw new Error(fallback)
  }
  if (!ok.snapshot || typeof ok.snapshot !== 'object' || !String(ok.snapshot.id || '').trim()) {
    throw new Error(fallback)
  }
  return ok
}

export async function generateSettingTree(payload, fallback) {
  return requireSettingTreeResult(await ensureElectronApi('generateSettingTree')(payload), fallback)
}

export async function regenerateSettingNode(payload, fallback) {
  return requireSettingTreeNodeResult(
    await ensureElectronApi('regenerateSettingNode')(payload),
    fallback
  )
}

export async function applySettingTree(payload, fallback) {
  return requireSettingTreeApplyResult(
    await ensureElectronApi('applySettingTree')(payload),
    fallback
  )
}

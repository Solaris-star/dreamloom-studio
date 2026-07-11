import { postJson } from './webHttpClient.js'

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
  return requireSettingTreeResult(
    await postJson('/api/setting-tree/generate', payload, { timeoutMs: 120_000 }),
    fallback
  )
}

export async function regenerateSettingNode(payload, fallback) {
  return requireSettingTreeNodeResult(
    await postJson('/api/setting-tree/regenerate-node', payload, { timeoutMs: 120_000 }),
    fallback
  )
}

export async function applySettingTree(payload, fallback) {
  return requireSettingTreeApplyResult(
    await postJson('/api/setting-tree/apply', payload, { timeoutMs: 60_000 }),
    fallback
  )
}

import fs from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const ROUTES = new Set([
  '/api/fs/list',
  '/api/store/get',
  '/api/store/set',
  '/api/store/delete'
])
const BLOCKED_STORE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

function requireStoreKey(value) {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!key) throw httpError('设置项名称不能为空', 400)
  if (key.length > 128) throw httpError('设置项名称过长', 400)
  if (BLOCKED_STORE_KEYS.has(key)) throw httpError('不允许使用该设置项名称', 400)
  return key
}

function isPathInside(parent, child) {
  const relation = relative(parent, child)
  return relation === '' || (relation && !relation.startsWith('..') && !isAbsolute(relation))
}

function listDirectories(requestedDir, allowedRoot, fileSystem) {
  if (!requestedDir || !isAbsolute(requestedDir)) {
    throw httpError('目录路径必须是绝对路径', 400)
  }

  let realDir
  let realRoot
  try {
    realDir = fileSystem.realpathSync(requestedDir)
    realRoot = fileSystem.realpathSync(allowedRoot)
  } catch {
    throw httpError('目录不存在或无法访问', 404)
  }
  if (!isPathInside(realRoot, realDir)) {
    throw httpError('只能浏览书库目录范围', 403)
  }
  if (!fileSystem.statSync(realDir).isDirectory()) {
    throw httpError('所选路径不是目录', 400)
  }

  const dirs = fileSystem
    .readdirSync(realDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  return { success: true, path: realDir, root: realRoot, dirs }
}

export function isWebUtilityRoute(path) {
  return ROUTES.has(path)
}

export async function handleWebUtilityRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  storeGet,
  storeSet,
  storeDelete,
  fileSystem = fs
}) {
  if (!isWebUtilityRoute(path)) return false
  const payload = body || {}

  if (path === '/api/fs/list') {
    sendJson(res, listDirectories(String(payload.dir || ''), resolve(booksDir, '..'), fileSystem))
    return true
  }

  const key = requireStoreKey(payload.key)
  if (path === '/api/store/get') {
    sendJson(res, { success: true, key, value: await storeGet(key) })
  } else if (path === '/api/store/set') {
    if ((await storeSet(key, payload.value)) !== true) throw new Error('保存本地设置失败')
    sendJson(res, { success: true, key })
  } else {
    if ((await storeDelete(key)) !== true) throw new Error('删除本地设置失败')
    sendJson(res, { success: true, key })
  }
  return true
}

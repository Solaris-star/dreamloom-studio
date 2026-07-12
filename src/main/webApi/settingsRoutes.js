import fs from 'node:fs'
import { join, resolve } from 'node:path'

const ROUTES = new Set([
  '/api/settings/storage-stats',
  '/api/settings/clear-trash',
  '/api/settings/export',
  '/api/settings/import'
])
const BLOCKED_STORE_KEYS = new Set([
  'password',
  'secrets',
  '__proto__',
  'prototype',
  'constructor'
])

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function fileSize(filePath, fileSystem) {
  try {
    const stats = fileSystem.statSync(filePath)
    return stats.isFile() ? stats.size : 0
  } catch {
    return 0
  }
}

function dirSize(dirPath, fileSystem) {
  try {
    const stats = fileSystem.statSync(dirPath)
    if (stats.isFile()) return stats.size
    if (!stats.isDirectory()) return 0
    return fileSystem.readdirSync(dirPath, { withFileTypes: true }).reduce((total, entry) => {
      if (entry.isSymbolicLink()) return total
      const entryPath = join(dirPath, entry.name)
      if (entry.isDirectory()) return total + dirSize(entryPath, fileSystem)
      if (entry.isFile()) return total + fileSize(entryPath, fileSystem)
      return total
    }, 0)
  } catch {
    return 0
  }
}

function parseImportPayload(payload) {
  if (!payload.jsonString) return payload
  try {
    return JSON.parse(String(payload.jsonString))
  } catch {
    throw badRequest('导入设置失败：JSON 格式不正确')
  }
}

function validateImportPayload(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !payload.settings ||
    typeof payload.settings !== 'object' ||
    Array.isArray(payload.settings)
  ) {
    throw badRequest('导入设置失败：备份格式不正确')
  }
  return payload
}

export function isSettingsRoute(path) {
  return ROUTES.has(path)
}

export function handleSettingsRoute({
  path,
  body,
  res,
  booksDir,
  storeFile = resolve('.store.json'),
  sendJson,
  readStore,
  setStoreValue,
  isPathInside,
  fileSystem = fs,
  now = () => new Date()
}) {
  if (!isSettingsRoute(path)) return false

  if (path === '/api/settings/storage-stats') {
    sendJson(res, {
      success: true,
      booksDir,
      booksSize: dirSize(booksDir, fileSystem),
      storeSize: fileSize(storeFile, fileSystem),
      trashSize: dirSize(join(booksDir, 'assets-trash'), fileSystem)
    })
    return true
  }

  if (path === '/api/settings/clear-trash') {
    const trashDir = resolve(booksDir, 'assets-trash')
    if (!isPathInside(resolve(booksDir), trashDir)) {
      throw new Error('回收站目录不在当前书库内')
    }
    const bytesBefore = dirSize(trashDir, fileSystem)
    fileSystem.rmSync(trashDir, { recursive: true, force: true })
    sendJson(res, {
      success: true,
      bytesBefore,
      bytesAfter: dirSize(trashDir, fileSystem)
    })
    return true
  }

  if (path === '/api/settings/export') {
    const exportedAt = now().toISOString()
    sendJson(res, {
      success: true,
      fileName: `zhimeng-settings-${exportedAt.slice(0, 10)}.json`,
      content: JSON.stringify(
        {
          version: 1,
          exportedAt,
          settings: readStore()
        },
        null,
        2
      )
    })
    return true
  }

  const importPayload = validateImportPayload(parseImportPayload(body || {}))
  let count = 0
  for (const key of Object.keys(importPayload.settings)) {
    if (BLOCKED_STORE_KEYS.has(key)) continue
    setStoreValue(key, importPayload.settings[key])
    count += 1
  }
  sendJson(res, { success: true, count })
  return true
}

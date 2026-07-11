import { postJson } from './webHttpClient.js'

function requireSuccess(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || fallback)
  }
  return result
}

export async function getStorageStats() {
  const result = requireSuccess(
    await postJson('/api/settings/storage-stats', {}),
    '读取存储统计失败'
  )
  for (const field of ['booksSize', 'storeSize', 'trashSize']) {
    if (typeof result[field] !== 'number' || result[field] < 0) {
      throw new Error('读取存储统计失败：接口返回格式不正确')
    }
  }
  if (result.booksDir != null && typeof result.booksDir !== 'string') {
    throw new Error('读取存储统计失败：书库目录格式不正确')
  }
  return result
}

export async function clearAssetTrash() {
  const result = requireSuccess(
    await postJson('/api/settings/clear-trash', {}),
    '清理回收站失败'
  )
  if (
    typeof result.bytesBefore !== 'number' ||
    result.bytesBefore < 0 ||
    typeof result.bytesAfter !== 'number' ||
    result.bytesAfter < 0
  ) {
    throw new Error('清理回收站失败：接口返回格式不正确')
  }
  return result
}

export async function exportAppSettings() {
  const result = requireSuccess(
    await postJson('/api/settings/export', {}),
    '导出设置失败'
  )
  if (typeof result.fileName !== 'string' || !result.fileName.endsWith('.json')) {
    throw new Error('导出设置失败：接口没有返回 JSON 文件名')
  }
  if (typeof result.content !== 'string' || !result.content.trim()) {
    throw new Error('导出设置失败：接口没有返回设置内容')
  }
  let parsed
  try {
    parsed = JSON.parse(result.content)
  } catch {
    throw new Error('导出设置失败：接口返回内容不是 JSON')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !parsed.settings ||
    typeof parsed.settings !== 'object' ||
    Array.isArray(parsed.settings)
  ) {
    throw new Error('导出设置失败：接口返回备份格式不正确')
  }
  return result
}

export async function importAppSettings(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('导入设置失败：文件内容为空')
  }
  const result = requireSuccess(
    await postJson('/api/settings/import', { jsonString }),
    '导入设置失败'
  )
  if (!Number.isInteger(result.count) || result.count < 0) {
    throw new Error('导入设置失败：接口没有返回导入数量')
  }
  return result
}

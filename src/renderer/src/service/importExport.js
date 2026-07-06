function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持导入导出接口：${name}`)
  }
  return api
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

export function requireImportExportSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireStringField(result, fieldName, fallback) {
  if (!isNonEmptyString(result?.[fieldName])) {
    throw new Error(`${fallback}：接口没有返回 ${fieldName}`)
  }
}

function requireDatabaseSyncResult(result, fallback) {
  if (result.databaseSync?.success !== true) {
    throw new Error(`${fallback}：${result.databaseSync?.message || '数据库没有记录本次结果'}`)
  }
  return result
}

function requireExportRecordResult(result, fallback) {
  if (result.databaseSync?.success === false) {
    throw new Error(`${fallback}：${result.databaseSync?.message || '数据库没有记录导出结果'}`)
  }
  if (!isNonEmptyString(result.exportRecordId) && !isObject(result.exportRecord)) {
    throw new Error(`${fallback}：数据库没有记录导出结果`)
  }
  return result
}

export function requirePreviewResult(result) {
  const ok = requireImportExportSuccess(result, '预览失败')
  if (!isObject(ok.preview) || !Array.isArray(ok.preview.chapters)) {
    throw new Error('预览失败：接口没有返回章节预览')
  }
  return ok
}

export function requireImportedBookResult(result) {
  const ok = requireImportExportSuccess(result, '导入失败')
  requireStringField(ok, 'bookName', '导入失败')
  requireStringField(ok, 'bookPath', '导入失败')
  return requireDatabaseSyncResult(ok, '导入失败')
}

export function requireDownloadResult(result, fallback = '导出失败') {
  const ok = requireImportExportSuccess(result, fallback)
  requireStringField(ok, 'fileName', fallback)
  if (!isNonEmptyString(ok.downloadBase64) && typeof ok.content !== 'string') {
    throw new Error(`${fallback}：接口没有返回可下载内容`)
  }
  return requireExportRecordResult(ok, fallback)
}

export function requireBackupResult(result) {
  const ok = requireImportExportSuccess(result, '备份失败')
  requireStringField(ok, 'fileName', '备份失败')
  requireStringField(ok, 'downloadBase64', '备份失败')
  return requireDatabaseSyncResult(ok, '备份失败')
}

export function requireInspectResult(result) {
  const ok = requireImportExportSuccess(result, '检查失败')
  if (!isObject(ok.summary)) {
    throw new Error('检查失败：接口没有返回备份结构')
  }
  return ok
}

export function requireRestoreResult(result) {
  const ok = requireImportExportSuccess(result, '恢复失败')
  if (ok.mode === 'library') {
    if (!Array.isArray(ok.restoredBooks)) {
      throw new Error('恢复失败：接口没有返回恢复书籍')
    }
  } else if (!isNonEmptyString(ok.targetDir)) {
    throw new Error('恢复失败：接口没有返回恢复目录')
  }
  return requireDatabaseSyncResult(ok, '恢复失败')
}

export function requireTaskListResult(result) {
  const ok = requireImportExportSuccess(result, '加载任务记录失败')
  if (!Array.isArray(ok.items)) {
    throw new Error('加载任务记录失败：接口没有返回任务列表')
  }
  return ok
}

export async function previewImportBook(payload = {}) {
  return requirePreviewResult(await ensureElectronApi('previewImportBook')(payload))
}

export async function importBookFromFile(payload = {}) {
  return requireImportedBookResult(await ensureElectronApi('importBookFromFile')(payload))
}

export async function exportBookFile(payload = {}) {
  return requireDownloadResult(await ensureElectronApi('exportBookFile')(payload), '导出失败')
}

export async function createLibraryBackup(payload = {}) {
  return requireBackupResult(await ensureElectronApi('createLibraryBackup')(payload))
}

export async function inspectLibraryBackup(payload = {}) {
  return requireInspectResult(await ensureElectronApi('inspectLibraryBackup')(payload))
}

export async function restoreLibraryBackup(payload = {}) {
  return requireRestoreResult(await ensureElectronApi('restoreLibraryBackup')(payload))
}

export async function listImportExportTasks() {
  return requireTaskListResult(await ensureElectronApi('listImportExportTasks')())
}

export function downloadTextFile(fileName, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content || ''], { type: mimeType })
  downloadBlob(fileName, blob)
}

export function downloadBase64File(fileName, base64, mimeType = 'application/octet-stream') {
  const binary = atob(base64 || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  downloadBlob(fileName, new Blob([bytes], { type: mimeType }))
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'download'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

import { postJson } from './webHttpClient.js'

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
  if (!isObject(ok.task) || ok.task.type !== 'import') {
    throw new Error('导入失败：接口没有返回导入任务记录')
  }
  return ok
}

export function requireDownloadResult(result, fallback = '导出失败') {
  const ok = requireImportExportSuccess(result, fallback)
  requireStringField(ok, 'fileName', fallback)
  if (!isNonEmptyString(ok.downloadBase64) && typeof ok.content !== 'string') {
    throw new Error(`${fallback}：接口没有返回可下载内容`)
  }
  if (!isObject(ok.task) || ok.task.type !== 'export') {
    throw new Error(`${fallback}：接口没有返回导出任务记录`)
  }
  return ok
}

export function requireBackupResult(result) {
  const ok = requireImportExportSuccess(result, '备份失败')
  requireStringField(ok, 'fileName', '备份失败')
  requireStringField(ok, 'downloadBase64', '备份失败')
  if (!isObject(ok.task) || ok.task.type !== 'backup') {
    throw new Error('备份失败：接口没有返回备份任务记录')
  }
  return ok
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
  if (!isObject(ok.task) || ok.task.type !== 'restore') {
    throw new Error('恢复失败：接口没有返回恢复任务记录')
  }
  return ok
}

export function requireTaskListResult(result) {
  const ok = requireImportExportSuccess(result, '加载任务记录失败')
  if (!Array.isArray(ok.items)) {
    throw new Error('加载任务记录失败：接口没有返回任务列表')
  }
  return ok
}

export async function previewImportBook(payload = {}, options = {}) {
  // 大书（25MB 级）payload 可达数十 MB，服务端解析需 15s+；默认 20s 会被顶爆
  return requirePreviewResult(
    await postJson('/api/import/preview', payload, {
      timeoutMs: 120_000,
      ...(options.onUploadProgress ? { onUploadProgress: options.onUploadProgress } : {})
    })
  )
}

export async function importBookFromFile(payload = {}, options = {}) {
  // 大书（千章/百万字）payload 可达数 MB，弱网上传慢；后端实际写入仅需数百毫秒
  return requireImportedBookResult(
    await postJson('/api/import/book', payload, {
      timeoutMs: 300_000,
      ...(options.onUploadProgress ? { onUploadProgress: options.onUploadProgress } : {})
    })
  )
}

export async function exportBookFile(payload = {}) {
  return requireDownloadResult(
    await postJson('/api/export/book', payload, { timeoutMs: 60_000 }),
    '导出失败'
  )
}

export async function createLibraryBackup(payload = {}) {
  return requireBackupResult(await postJson('/api/backup/create', payload, { timeoutMs: 120_000 }))
}

export async function inspectLibraryBackup(payload = {}) {
  return requireInspectResult(
    await postJson('/api/backup/inspect', payload, { timeoutMs: 60_000 })
  )
}

export async function restoreLibraryBackup(payload = {}) {
  return requireRestoreResult(
    await postJson('/api/backup/restore', payload, { timeoutMs: 120_000 })
  )
}

export async function listImportExportTasks() {
  return requireTaskListResult(await postJson('/api/import-export/tasks', {}))
}

// ===== PDF 书籍（原始文件 + outline 目录）=====

export function requirePdfOutlineResult(result) {
  const ok = requireImportExportSuccess(result, 'PDF 目录加载失败')
  if (!Array.isArray(ok.outline)) {
    throw new Error('PDF 目录加载失败：接口没有返回目录数据')
  }
  return ok
}

/**
 * 获取 PDF 书籍目录（书签树 + 页码）。
 * 后端兼容 POST body / GET query，这里用 POST JSON 与其他导入接口一致。
 */
export async function getPdfOutline(bookName) {
  return requirePdfOutlineResult(await postJson('/api/pdf/outline', { bookName }))
}

/** PDF 原始文件下载地址（pdfjs 以 url 方式按需 Range 拉取）。 */
export function buildPdfFileUrl(bookName) {
  return `/api/pdf/file?bookName=${encodeURIComponent(String(bookName || ''))}`
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

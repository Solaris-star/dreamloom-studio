import * as importExportService from '../services/importExportService.js'
import { getPdfFilePath, getPdfOutline } from '../services/importExportService.js'
import fs from 'node:fs'

const ROUTES = new Map([
  ['/api/import/preview', 'previewImport'],
  ['/api/import/book', 'importBook'],
  ['/api/export/book', 'exportBook'],
  ['/api/backup/create', 'createBackup'],
  ['/api/backup/inspect', 'inspectBackup'],
  ['/api/backup/restore', 'restoreBackup'],
  ['/api/import-export/tasks', 'listTasks']
])

const PDF_ROUTES = new Set([
  '/api/pdf/outline',
  '/api/pdf/file',
  '/api/pdf/page'
])

export function isImportExportRoute(path) {
  return ROUTES.has(path) || PDF_ROUTES.has(path)
}

export async function handleImportExportRoute({
  path,
  req,
  body,
  res,
  booksDir,
  sendJson,
  authSession = null,
  service = importExportService
}) {
  // PDF 专用路由
  if (PDF_ROUTES.has(path)) {
    return handlePdfRoute({ path, req, body, res, booksDir, sendJson, authSession })
  }

  const method = ROUTES.get(path)
  if (!method) return false

  const session = authSession || { role: 'admin', canManageKeys: true }
  const isGuest = session.role === 'guest'
  if (isGuest && ['/api/backup/create', '/api/backup/restore', '/api/backup/inspect'].includes(path)) {
    sendJson(res, { success: false, message: '访客无权执行备份/恢复操作' }, 403)
    return true
  }

  const payload = { ...(body || {}) }
  if (path === '/api/import/book' && isGuest) {
    payload.ownerId = session.ownerId || session.keyId
  }

  try {
    const result =
      path === '/api/import-export/tasks'
        ? await service[method](booksDir)
        : await service[method](booksDir, payload)
    sendJson(res, result)
  } catch (error) {
    sendJson(
      res,
      { success: false, message: error?.message || '请求失败' },
      error?.statusCode || 500
    )
  }
  return true
}

/**
 * PDF 专用路由：
 * - /api/pdf/outline  获取目录树 + 页数
 * - /api/pdf/file     下载原始 PDF 文件（流式）
 * - /api/pdf/page     单页渲染（透传 PDF 原始字节，前端用 pdfjs 渲染）
 */
function handlePdfRoute({ path, req, body, res, booksDir, sendJson, authSession }) {
  const bookName = (body?.bookName || (req && typeof req.url === 'string' ? new URL(req.url, 'http://x').searchParams.get('bookName') : '') || '').trim()
  if (!bookName) {
    sendJson(res, { success: false, message: '书籍名称不能为空' }, 400)
    return true
  }

  try {
    if (path === '/api/pdf/outline') {
      const result = getPdfOutline(booksDir, bookName)
      sendJson(res, result)
      return true
    }

    if (path === '/api/pdf/file') {
      const pdfPath = getPdfFilePath(booksDir, bookName)
      if (!pdfPath) {
        sendJson(res, { success: false, message: 'PDF 文件不存在' }, 404)
        return true
      }
      const stat = fs.statSync(pdfPath)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', stat.size)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      const stream = fs.createReadStream(pdfPath)
      stream.pipe(res)
      return true
    }

    if (path === '/api/pdf/page') {
      // 透传整个 PDF 文件，前端用 pdfjs 自行分页渲染
      const pdfPath = getPdfFilePath(booksDir, bookName)
      if (!pdfPath) {
        sendJson(res, { success: false, message: 'PDF 文件不存在' }, 404)
        return true
      }
      const stat = fs.statSync(pdfPath)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', stat.size)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      const stream = fs.createReadStream(pdfPath)
      stream.pipe(res)
      return true
    }
  } catch (error) {
    sendJson(res, { success: false, message: error?.message || 'PDF 读取失败' }, 500)
    return true
  }

  return false
}

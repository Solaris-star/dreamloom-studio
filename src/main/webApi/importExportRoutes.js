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
 * - /api/pdf/file     下载原始 PDF 文件（流式，支持 HTTP Range → pdfjs 按需分块加载）
 * - /api/pdf/page     单页渲染（透传 PDF 原始字节，前端用 pdfjs 渲染）
 */

/**
 * 流式返回 PDF 文件，支持 Range 请求（206）。
 * pdfjs 的 rangeChunkSize 默认 64KB：无 Range 支持时前端只能全量下载才能渲染，
 * 大 PDF（10MB+）在弱网下就是「一直加载中」。这里按规范实现单段 Range，
 * 让 pdfjs 只拉目录 + 当前页附近的数据块。
 */
function streamPdfResponse(req, res, pdfPath) {
  const stat = fs.statSync(pdfPath)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Accept-Ranges', 'bytes')

  const rangeHeader = String(req?.headers?.range || '')
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  let start = 0
  let end = stat.size - 1
  let partial = false

  if (match && (match[1] !== '' || match[2] !== '')) {
    if (match[1] === '') {
      // suffix range: bytes=-N → 最后 N 字节
      const suffix = Number(match[2])
      start = Math.max(0, stat.size - suffix)
    } else {
      start = Number(match[1])
      if (match[2] !== '') end = Math.min(stat.size - 1, Number(match[2]))
    }
    if (start > end || start >= stat.size) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${stat.size}`)
      res.end()
      return
    }
    partial = true
  }

  const length = end - start + 1
  res.setHeader('Content-Length', length)
  if (partial) {
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  }
  const stream = fs.createReadStream(pdfPath, partial ? { start, end } : {})
  stream.pipe(res)
}

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

    if (path === '/api/pdf/file' || path === '/api/pdf/page') {
      const pdfPath = getPdfFilePath(booksDir, bookName)
      if (!pdfPath) {
        sendJson(res, { success: false, message: 'PDF 文件不存在' }, 404)
        return true
      }
      streamPdfResponse(req, res, pdfPath)
      return true
    }
  } catch (error) {
    sendJson(res, { success: false, message: error?.message || 'PDF 读取失败' }, 500)
    return true
  }

  return false
}

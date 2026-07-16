import * as importExportService from '../services/importExportService.js'

const ROUTES = new Map([
  ['/api/import/preview', 'previewImport'],
  ['/api/import/book', 'importBook'],
  ['/api/export/book', 'exportBook'],
  ['/api/backup/create', 'createBackup'],
  ['/api/backup/inspect', 'inspectBackup'],
  ['/api/backup/restore', 'restoreBackup'],
  ['/api/import-export/tasks', 'listTasks']
])

export function isImportExportRoute(path) {
  return ROUTES.has(path)
}

export function handleImportExportRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  authSession = null,
  service = importExportService
}) {
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
        ? service[method](booksDir)
        : service[method](booksDir, payload)
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

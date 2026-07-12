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
  service = importExportService
}) {
  const method = ROUTES.get(path)
  if (!method) return false

  const result =
    path === '/api/import-export/tasks'
      ? service[method](booksDir)
      : service[method](booksDir, body || {})
  sendJson(res, result)
  return true
}

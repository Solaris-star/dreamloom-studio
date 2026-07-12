const ROUTES = new Set([
  '/api/workbench-database/snapshot',
  '/api/workbench-database/query'
])

export function isWorkbenchDatabaseRoute(path) {
  return ROUTES.has(path)
}

export function handleWorkbenchDatabaseRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  workbenchDatabaseService
}) {
  if (!isWorkbenchDatabaseRoute(path)) return false

  const payload = body || {}
  const result =
    path === '/api/workbench-database/snapshot'
      ? workbenchDatabaseService.getWorkbenchDatabaseSnapshot(booksDir, payload)
      : workbenchDatabaseService.queryWorkbenchDatabase(booksDir, payload)

  sendJson(res, result)
  return true
}

export const WORKBENCH_DATABASE_ROUTE_CONTRACTS = Object.freeze({
  '/api/workbench-database/snapshot': 'POST',
  '/api/workbench-database/query': 'POST'
})

const ROUTES = new Set(Object.keys(WORKBENCH_DATABASE_ROUTE_CONTRACTS))

export function isWorkbenchDatabaseRoute(path) {
  return ROUTES.has(path)
}

export function handleWorkbenchDatabaseRoute({
  path,
  req,
  body,
  res,
  booksDir,
  sendJson,
  workbenchDatabaseService
}) {
  if (!isWorkbenchDatabaseRoute(path)) return false
  if (req?.method !== WORKBENCH_DATABASE_ROUTE_CONTRACTS[path]) {
    sendJson(res, { success: false, message: '请求方法不受支持' }, 405)
    return true
  }

  const payload = body || {}
  const result =
    path === '/api/workbench-database/snapshot'
      ? workbenchDatabaseService.getWorkbenchDatabaseSnapshot(booksDir, payload)
      : workbenchDatabaseService.queryWorkbenchDatabase(booksDir, payload)

  sendJson(res, result)
  return true
}

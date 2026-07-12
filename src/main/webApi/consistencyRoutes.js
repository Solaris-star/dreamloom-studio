const ROUTES = new Set(['/api/consistency/check', '/api/consistency/list'])

export function isConsistencyRoute(path) {
  return ROUTES.has(path)
}

export async function handleConsistencyRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  store,
  createProvider,
  resolveBookPath,
  runCheck,
  listChecks
}) {
  if (!isConsistencyRoute(path)) return false
  const payload = body || {}
  const bookPath = resolveBookPath(payload, booksDir, { ensure: true })

  if (path === '/api/consistency/list') {
    sendJson(res, listChecks({ ...payload, bookPath }))
    return true
  }

  const wantsLlm =
    payload.useLlm === true || payload.aiCheck === true || payload.enableLlm === true
  const provider = wantsLlm ? createProvider(store, payload) : null
  sendJson(
    res,
    await runCheck(
      { ...payload, bookPath },
      { textProvider: provider?.service }
    )
  )
  return true
}

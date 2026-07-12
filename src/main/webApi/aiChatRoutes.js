const ROUTES = new Set(['/api/ai/chat'])

export function isAiChatRoute(path) {
  return ROUTES.has(path)
}

export async function handleAiChatRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  store,
  createProvider,
  resolveBookPath,
  sendChat
}) {
  if (!isAiChatRoute(path)) return false
  const payload = body || {}
  const provider = createProvider(store, payload)
  const bookPath =
    payload.bookPath || payload.bookName
      ? resolveBookPath(payload, booksDir, { ensure: true })
      : ''
  const result = await sendChat({
    ...payload,
    bookPath,
    textProvider: provider.service
  })
  sendJson(res, result, result?.success === false ? 502 : 200)
  return true
}

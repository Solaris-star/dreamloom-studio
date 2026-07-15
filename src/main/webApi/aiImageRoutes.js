const ROUTES = new Set([
  '/api/ai/image-task',
  '/api/ai/cover/confirm',
  '/api/ai/cover/discard',
  '/api/ai/character/confirm',
  '/api/ai/character/discard'
])

const ACTIONS = {
  '/api/ai/cover/confirm': { feature: 'ai_cover', action: 'confirm' },
  '/api/ai/cover/discard': { feature: 'ai_cover', action: 'discard' },
  '/api/ai/character/confirm': { feature: 'ai_character_image', action: 'confirm' },
  '/api/ai/character/discard': { feature: 'ai_character_image', action: 'discard' }
}

export function isAiImageRoute(path) {
  return ROUTES.has(path)
}

export async function handleAiImageRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  store,
  resolveBookPath,
  generateImage,
  saveImage,
  confirmImage,
  discardImages,
  toImageUrl
}) {
  if (!isAiImageRoute(path)) return false
  const payload = body || {}
  const bookPath = resolveBookPath(payload, booksDir, { ensure: true })

  if (path === '/api/ai/image-task') {
    const imageResult = await generateImage(store, payload)
    const saved = await saveImage(bookPath, payload, imageResult)
    sendJson(res, {
      ...saved,
      imageUrl: toImageUrl(bookPath, saved.localPath)
    })
    return true
  }

  const route = ACTIONS[path]
  const safePayload = { ...payload, feature: route.feature }
  if (route.action === 'discard') {
    sendJson(res, discardImages(bookPath, safePayload))
    return true
  }

  const confirmed = await confirmImage(bookPath, safePayload)
  sendJson(res, {
    ...confirmed,
    imageUrl: toImageUrl(bookPath, confirmed.localPath)
  })
  return true
}

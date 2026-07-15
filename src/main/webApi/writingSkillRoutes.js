const ROUTES = new Set([
  '/api/editor-agent/writing-skills',
  '/api/editor-agent/run-writing-skill'
])

function publicErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  const cleaned = String(message || '执行失败')
    .replace(
      /([A-Za-z]:)?[\\/](?:Users|home|tmp|var|opt|private|root|Windows|Program Files)[^\s'"`]*/gi,
      '[path]'
    )
    .replace(/(?:\/Users\/[^\s'"`]+|\/home\/[^\s'"`]+|\/tmp\/[^\s'"`]+)/g, '[path]')
    .replace(/\s+at\s+\S+.*/g, '')
    .replace(/\n[\s\S]*$/, '')
    .trim()
    .slice(0, 300)
  return cleaned || '执行失败'
}

export function isWritingSkillRoute(path) {
  return ROUTES.has(path)
}

export async function handleWritingSkillRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  listSkills,
  runSkill
}) {
  if (!isWritingSkillRoute(path)) return false

  if (path === '/api/editor-agent/writing-skills') {
    sendJson(res, listSkills())
    return true
  }

  try {
    sendJson(
      res,
      await runSkill({
        ...(body || {}),
        booksDir
      })
    )
  } catch (error) {
    sendJson(res, {
      success: false,
      message: publicErrorMessage(error)
    })
  }
  return true
}

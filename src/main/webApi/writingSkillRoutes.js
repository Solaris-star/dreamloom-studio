const ROUTES = new Set([
  '/api/editor-agent/writing-skills',
  '/api/editor-agent/run-writing-skill'
])

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
      message: error instanceof Error ? error.message : String(error)
    })
  }
  return true
}

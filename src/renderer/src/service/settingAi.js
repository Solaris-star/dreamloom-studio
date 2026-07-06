function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持设定 AI 接口：${name}`)
  }
  return api
}

function requireRefinedSettingResult(result, fallback = 'AI 改写失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文`)
  }
  return { ...result, content }
}

export async function refineSettingWithAI(payload, fallback) {
  return requireRefinedSettingResult(
    await ensureElectronApi('refineSettingWithAI')(payload),
    fallback
  )
}

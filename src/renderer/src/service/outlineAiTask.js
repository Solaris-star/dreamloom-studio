function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持大纲 AI 接口：${name}`)
  }
  return api
}

function requireOutlineAiTaskResult(result, expectedTaskType, fallback = 'AI 请求失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }

  if (expectedTaskType === 'refine') {
    const content = String(result.content || '').trim()
    if (!content) {
      throw new Error(`${fallback}：接口没有返回正文`)
    }
    return { ...result, content }
  }

  if (expectedTaskType === 'split') {
    const rawText = String(result.rawText || result.content || '').trim()
    if (!rawText) {
      throw new Error(`${fallback}：接口没有返回切分草稿`)
    }
    const items = Array.isArray(result.items) ? result.items : []
    return { ...result, rawText, items }
  }

  throw new Error(fallback)
}

export async function runOutlineAiTask(payload, expectedTaskType, fallback) {
  return requireOutlineAiTaskResult(
    await ensureElectronApi('runOutlineAiTask')(payload),
    expectedTaskType,
    fallback
  )
}

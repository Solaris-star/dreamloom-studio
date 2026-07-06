function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持编辑器 AI 接口：${name}`)
  }
  return api
}

function requireAiTextResult(result, fallback = 'AI 生成失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文`)
  }
  if (!Number.isFinite(Number(result.wordCount)) || Number(result.wordCount) <= 0) {
    throw new Error(`${fallback}：接口没有返回有效字数`)
  }
  return { ...result, content }
}

function requireContinueAiResult(result, maxAddWords, fallback = 'AI 续写失败') {
  const ok = requireAiTextResult(result, fallback)
  const returnedMax = Number(ok.maxAddWords)
  if (!Number.isFinite(returnedMax) || returnedMax <= 0) {
    throw new Error(`${fallback}：接口没有返回可续写字数`)
  }
  if (Math.abs(returnedMax - Number(maxAddWords || 0)) > 0) {
    throw new Error(`${fallback}：接口返回的可续写字数不匹配`)
  }
  if (Number(ok.wordCount) > Math.floor(Number(maxAddWords || 0) * 1.2)) {
    throw new Error(fallback)
  }
  return ok
}

export async function continueWriteWithAI(payload, options = {}) {
  return requireContinueAiResult(
    await ensureElectronApi('continueWriteWithAI')(payload),
    options.maxAddWords,
    options.fallback || 'AI 续写失败'
  )
}

export async function polishTextWithAI(text, fallback = 'AI 润色失败') {
  return requireAiTextResult(await ensureElectronApi('polishTextWithAI')(text), fallback)
}

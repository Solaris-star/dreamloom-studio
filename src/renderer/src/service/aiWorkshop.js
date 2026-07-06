function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持 AI 工坊接口：${name}`)
  }
  return api
}

function requireAiWorkshopSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireAiTextTaskResult(result, fallback = '生成失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  const content = typeof ok.content === 'string' ? ok.content.trim() : ''
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文内容`)
  }
  return { ...ok, content }
}

function requireAiImageTaskResult(result, fallback = '图片生成失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  const imageUrl = typeof ok.imageUrl === 'string' ? ok.imageUrl.trim() : ''
  const base64 = typeof ok.base64 === 'string' ? ok.base64.trim() : ''
  const output = typeof ok.output === 'string' ? ok.output.trim() : ''
  if (!imageUrl && !base64 && !output) {
    throw new Error(`${fallback}：接口没有返回图片数据`)
  }
  return { ...ok, imageUrl, base64, output }
}

function requireAiChatResult(result, fallback = 'AI 对话失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  const content = typeof ok.content === 'string' ? ok.content.trim() : ''
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文内容`)
  }
  return { ...ok, content }
}

function requirePromptPresetListResult(result, fallback = '读取 Prompt 模板失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  if (!Array.isArray(ok.presets)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requirePromptPresetResult(result, fallback = '保存 Prompt 模板失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  if (!ok.preset || typeof ok.preset !== 'object' || Array.isArray(ok.preset)) {
    throw new Error(`${fallback}：接口没有返回模板记录`)
  }
  return ok
}

function requirePromptPresetDeleteResult(result, expectedId = '', fallback = '删除 Prompt 模板失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  const presetId = String(ok.presetId || '').trim()
  if (!presetId || (expectedId && presetId !== String(expectedId))) {
    throw new Error(`${fallback}：接口返回的模板 ID 不匹配`)
  }
  return ok
}

function requirePromptPresetImportResult(result, fallback = '导入 Prompt 模板失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  if (!Array.isArray(ok.presets) || !Number.isFinite(Number(ok.count))) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requirePromptPresetExportResult(result, fallback = '导出 Prompt 模板失败') {
  const ok = requireAiWorkshopSuccess(result, fallback)
  if (typeof ok.jsonString !== 'string') {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

export async function runAiTextTask(payload = {}) {
  return requireAiTextTaskResult(await ensureElectronApi('runAiTextTask')(payload))
}

export async function runAiImageTask(payload = {}) {
  return requireAiImageTaskResult(await ensureElectronApi('runAiImageTask')(payload))
}

export async function sendAiChat(payload = {}) {
  return requireAiChatResult(await ensureElectronApi('aiChatSend')(payload))
}

export async function listAiHistory(filter = {}) {
  const result = await ensureElectronApi('listAiHistory')(filter)
  if (result?.success !== true) {
    throw new Error(result?.message || '读取生成历史失败')
  }
  if (!Array.isArray(result.items)) {
    throw new Error('生成历史返回格式异常')
  }
  return result
}

export async function listPromptPresets(payload = {}) {
  return requirePromptPresetListResult(await ensureElectronApi('listPromptPresets')(payload))
}

export async function createPromptPreset(payload = {}) {
  return requirePromptPresetResult(await ensureElectronApi('createPromptPreset')(payload))
}

export async function updatePromptPreset(payload = {}) {
  return requirePromptPresetResult(await ensureElectronApi('updatePromptPreset')(payload), '更新 Prompt 模板失败')
}

export async function deletePromptPreset(payload = {}) {
  return requirePromptPresetDeleteResult(
    await ensureElectronApi('deletePromptPreset')(payload),
    payload?.presetId || payload?.id || '',
    '删除 Prompt 模板失败'
  )
}

export async function importPromptPresets(payload = {}) {
  return requirePromptPresetImportResult(await ensureElectronApi('importPromptPresets')(payload))
}

export async function exportPromptPresets(payload = {}) {
  return requirePromptPresetExportResult(await ensureElectronApi('exportPromptPresets')(payload))
}

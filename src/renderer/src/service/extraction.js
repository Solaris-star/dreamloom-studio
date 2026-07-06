function ensureElectronApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持拆书接口：${name}`)
  }
  return api
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requireSuccessResult(result, fallback = '拆书失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

export async function getExtractionDimensions() {
  const result = await ensureElectronApi('getExtractionDimensions')()
  if (!Array.isArray(result)) {
    throw new Error('读取拆书维度失败：接口返回格式不正确')
  }
  for (const dimension of result) {
    if (!isPlainObject(dimension) || !String(dimension.key || '').trim()) {
      throw new Error('读取拆书维度失败：接口返回格式不正确')
    }
  }
  return result
}

export async function createExtraction(payload = {}) {
  const result = await ensureElectronApi('createExtraction')(payload)
  return requireStartedExtractionResult(result)
}

export async function listExtractions(bookPath) {
  const result = await ensureElectronApi('listExtractions')(bookPath)
  const ok = requireSuccessResult(result, '读取拆书任务失败')
  if (!Array.isArray(ok.extractions)) {
    throw new Error('读取拆书任务失败：接口返回格式不正确')
  }
  return ok
}

export async function getExtractionProgress(jobIdOrPayload) {
  const result = await ensureElectronApi('getExtractionProgress')(jobIdOrPayload)
  return requireExtractionProgressResponse(result)
}

export async function getExtractionResultPage(payload = {}) {
  const result = await ensureElectronApi('getExtractionResultPage')(payload)
  return requireExtractionResultPageResult(result)
}

export async function deleteExtraction(payload = {}) {
  const result = await ensureElectronApi('deleteExtraction')(payload)
  return requireSuccessResult(result, '删除拆书任务失败')
}

export function canReadExtractionProgress() {
  return typeof globalThis.window?.electron?.getExtractionProgress === 'function'
}

export function requireStartedExtractionResult(result, fallback = '拆书失败') {
  const ok = requireSuccessResult(result, fallback)
  const status = String(ok.status || '').toLowerCase()
  if (['failed', 'cancelled'].includes(status)) {
    throw new Error(ok.message || ok.error || fallback)
  }
  const jobId = String(ok.jobId || '').trim()
  const extractionId = String(ok.id || ok.extractionId || '').trim()
  if (!jobId && !extractionId) {
    throw new Error(`${fallback}：接口没有返回任务 ID 或拆书记录 ID`)
  }
  return ok
}

export function requireCompletedExtractionResult(result, fallback = '拆书失败') {
  const ok = requireSuccessResult(result, fallback)
  const status = String(ok.status || '').toLowerCase()
  if (['failed', 'cancelled'].includes(status)) {
    throw new Error(ok.message || ok.error || fallback)
  }
  const extractionId = String(ok.id || ok.extractionId || '').trim()
  if (!extractionId) {
    throw new Error(`${fallback}：接口没有返回拆书记录 ID`)
  }
  return ok
}

export function requireExtractionProgressResponse(response, fallback = '读取拆书进度失败') {
  const ok = requireSuccessResult(response, fallback)
  if (typeof ok.done !== 'boolean') {
    throw new Error(`${fallback}：接口没有返回任务状态`)
  }
  if (!isPlainObject(ok.progress)) {
    throw new Error(`${fallback}：接口没有返回进度详情`)
  }
  if (ok.done) {
    const finalResult = ok.result || ok.progress
    requireCompletedExtractionResult(finalResult, '拆书失败')
  }
  return ok
}

export function requireExtractionResultPageResult(result, fallback = '读取拆书结果失败') {
  const ok = requireSuccessResult(result, fallback)
  if (
    !Array.isArray(ok.items) ||
    !Number.isFinite(Number(ok.total)) ||
    !Number.isFinite(Number(ok.page)) ||
    !Number.isFinite(Number(ok.pageSize))
  ) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

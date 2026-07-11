/**
 * AI Provider 管理前端服务
 */

function requireAiProviderApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持 AI Provider 接口：${name}`)
  }
  return api
}

function requireAiProviderSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireAiProviderListResult(result, fallback = '读取 Provider 失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!Array.isArray(ok.providers)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderResult(result, fallback = '保存 Provider 失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!ok.provider || typeof ok.provider !== 'object' || !ok.provider.id) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderValidationResult(result, fallback = '验证 Provider 失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (typeof ok.isValid !== 'boolean') {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  if (ok.models != null && !Array.isArray(ok.models)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderModelsResult(result, fallback = '读取模型列表失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!Array.isArray(ok.models)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderTestResult(result, fallback = '测试模型失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (ok.message != null && typeof ok.message !== 'string') {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireEmbeddingProviderListResult(result, fallback = '读取 Embedding Provider 失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!Array.isArray(ok.providers)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireEmbeddingProviderModelsResult(result, fallback = '读取模型列表失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!Array.isArray(ok.models)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireEmbeddingProviderValidationResult(
  result,
  fallback = '验证 Embedding Provider 失败'
) {
  const ok = requireAiProviderSuccess(result, fallback)
  if (typeof ok.isValid !== 'boolean') {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  if (ok.models != null && !Array.isArray(ok.models)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

export async function getAiProviders() {
  return requireAiProviderListResult(await requireAiProviderApi('getAiProviders')())
}

export async function saveAiProviders(providers) {
  return requireAiProviderListResult(
    await requireAiProviderApi('saveAiProviders')(providers),
    '保存 Provider 失败'
  )
}

export async function addAiProvider(provider) {
  return requireAiProviderResult(
    await requireAiProviderApi('addAiProvider')(provider),
    '新增 Provider 失败'
  )
}

export async function updateAiProvider(provider) {
  return requireAiProviderResult(
    await requireAiProviderApi('updateAiProvider')(provider),
    '更新 Provider 失败'
  )
}

export async function deleteAiProvider(providerId) {
  return requireAiProviderListResult(
    await requireAiProviderApi('deleteAiProvider')(providerId),
    '删除 Provider 失败'
  )
}

export async function validateAiProvider(provider) {
  return requireAiProviderValidationResult(
    await requireAiProviderApi('validateAiProvider')(provider)
  )
}

export async function listAiProviderModels(provider) {
  return requireAiProviderModelsResult(await requireAiProviderApi('listAiProviderModels')(provider))
}

export async function testAiProviderModel(provider, modelName) {
  return requireAiProviderTestResult(
    await requireAiProviderApi('testAiProviderModel')(provider, modelName)
  )
}

export async function getAiProvidersByCategory(category) {
  const res = await getAiProviders()
  return res.providers.filter((p) => p.category === category)
}

export async function getActiveTextProvider() {
  const res = await requireAiProviderApi('getActiveTextProvider')()
  if (res?.success !== true) {
    throw new Error(res?.message || '读取当前文本 Provider 失败')
  }
  if (typeof res.providerId !== 'string') {
    throw new Error('读取当前文本 Provider 失败：接口返回格式不正确')
  }
  return res
}

export async function setActiveTextProvider(providerId) {
  const res = await requireAiProviderApi('setActiveTextProvider')(providerId)
  if (res?.success !== true) {
    throw new Error(res?.message || '保存当前文本 Provider 失败')
  }
  if (typeof res.providerId !== 'string') {
    throw new Error('保存当前文本 Provider 失败：接口返回格式不正确')
  }
  if (res.providerId !== String(providerId || '')) {
    throw new Error('保存当前文本 Provider 失败：返回 Provider 不一致')
  }
  return res
}

export async function getActiveImageProvider() {
  const res = await requireAiProviderApi('getActiveImageProvider')()
  if (res?.success !== true) {
    throw new Error(res?.message || '读取当前图像 Provider 失败')
  }
  if (typeof res.providerId !== 'string') {
    throw new Error('读取当前图像 Provider 失败：接口返回格式不正确')
  }
  return res
}

export async function setActiveImageProvider(providerId) {
  const res = await requireAiProviderApi('setActiveImageProvider')(providerId)
  if (res?.success !== true) {
    throw new Error(res?.message || '保存当前图像 Provider 失败')
  }
  if (typeof res.providerId !== 'string') {
    throw new Error('保存当前图像 Provider 失败：接口返回格式不正确')
  }
  if (res.providerId !== String(providerId || '')) {
    throw new Error('保存当前图像 Provider 失败：返回 Provider 不一致')
  }
  return res
}

export async function listEmbeddingProviders() {
  return requireEmbeddingProviderListResult(await requireAiProviderApi('listEmbeddingProviders')())
}

export async function addEmbeddingProvider(provider) {
  return requireEmbeddingProviderListResult(
    await requireAiProviderApi('addEmbeddingProvider')(provider),
    '保存 Embedding Provider 失败'
  )
}

export async function setActiveEmbeddingProvider(providerId, active) {
  return requireEmbeddingProviderListResult(
    await requireAiProviderApi('setActiveEmbeddingProvider')({ id: providerId, active }),
    '设置 Embedding Provider 失败'
  )
}

export async function deleteEmbeddingProvider(providerId) {
  return requireEmbeddingProviderListResult(
    await requireAiProviderApi('deleteEmbeddingProvider')({ id: providerId }),
    '删除 Embedding Provider 失败'
  )
}

export async function validateEmbeddingProvider(provider) {
  return requireEmbeddingProviderValidationResult(
    await requireAiProviderApi('validateEmbeddingProvider')(provider),
    '验证 Embedding Provider 失败'
  )
}

export async function listEmbeddingProviderModels(provider) {
  return requireEmbeddingProviderModelsResult(
    await requireAiProviderApi('listEmbeddingProviderModels')(provider),
    '读取 Embedding 模型列表失败'
  )
}

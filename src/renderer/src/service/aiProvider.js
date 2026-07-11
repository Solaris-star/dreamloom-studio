import { postJson } from './webHttpClient.js'

function requireEmbeddingApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持 Embedding Provider 接口：${name}`)
  }
  return api
}

async function getStoreValue(key, fallback = null) {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error('读取 Provider 设置失败')
  }
  return result.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true || result.key !== key) {
    throw new Error('保存 Provider 设置失败')
  }
}

async function storedProviders() {
  const providers = await getStoreValue('aiProviders', [])
  if (!Array.isArray(providers)) throw new Error('读取 Provider 失败：接口返回格式不正确')
  return providers
}

function providerKeys(provider = {}) {
  if (Array.isArray(provider.apiKeys) && provider.apiKeys.length) return provider.apiKeys
  return provider.apiKey ? [provider.apiKey] : []
}

async function requestProvider(provider, path, method = 'GET', body) {
  const keys = providerKeys(provider)
  if (!provider?.baseUrl || !keys.length) throw new Error('请先填写 API 地址和 Key')
  let lastError
  for (const apiKey of keys) {
    try {
      return await postJson('/api/ai-proxy', {
        targetUrl: `${String(provider.baseUrl).replace(/\/$/, '')}${path}`,
        apiKey,
        method,
        body
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('所有 Key 均不可用')
}

async function resolveActiveProvider(category) {
  const key = category === 'image' ? 'aiProviders.activeImageId' : 'aiProviders.activeTextId'
  const providers = await storedProviders()
  const storedId = String((await getStoreValue(key, '')) || '').trim()
  const active = providers.find((provider) => provider.id === storedId && provider.category === category)
  return active?.id || providers.find((provider) => provider.category === category)?.id || ''
}

async function saveActiveProvider(category, providerId) {
  const id = String(providerId || '').trim()
  if (id) {
    const providers = await storedProviders()
    if (!providers.some((provider) => provider.id === id && provider.category === category)) {
      throw new Error(category === 'image' ? '图像 Provider 不存在' : '文本 Provider 不存在')
    }
  }
  const key = category === 'image' ? 'aiProviders.activeImageId' : 'aiProviders.activeTextId'
  await setStoreValue(key, id)
  return { success: true, providerId: id }
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
  return { success: true, providers: await storedProviders() }
}

export async function saveAiProviders(providers) {
  if (!Array.isArray(providers)) throw new Error('保存 Provider 失败：接口返回格式不正确')
  await setStoreValue('aiProviders', providers)
  return { success: true, providers }
}

export async function addAiProvider(provider) {
  const providers = await storedProviders()
  const saved = { ...provider, id: provider?.id || crypto.randomUUID(), createdAt: Date.now() }
  providers.push(saved)
  await setStoreValue('aiProviders', providers)
  return { success: true, provider: saved }
}

export async function updateAiProvider(provider) {
  const providers = await storedProviders()
  const index = providers.findIndex((item) => item.id === provider?.id)
  if (index < 0) throw new Error('Provider not found')
  providers[index] = { ...providers[index], ...provider, updatedAt: Date.now() }
  await setStoreValue('aiProviders', providers)
  return { success: true, provider: providers[index] }
}

export async function deleteAiProvider(providerId) {
  const providers = await storedProviders()
  if (!providerId || !providers.some((provider) => provider.id === providerId)) {
    throw new Error('Provider not found')
  }
  const next = providers.filter((provider) => provider.id !== providerId)
  await setStoreValue('aiProviders', next)
  return { success: true, providers: next }
}

export async function validateAiProvider(provider) {
  const models = (await listAiProviderModels(provider)).models
  return { success: true, isValid: true, models }
}

export async function listAiProviderModels(provider) {
  if (provider?.category === 'image') {
    if (!provider.baseUrl || !providerKeys(provider).length) {
      throw new Error('请先填写 API 地址和 Key')
    }
    return { success: true, models: Array.isArray(provider.models) ? provider.models : [] }
  }
  const result = await requestProvider(provider, '/v1/models')
  const models = Array.isArray(result?.data?.data)
    ? result.data.data.map((item) => item.id).filter(Boolean)
    : []
  return { success: true, models }
}

export async function testAiProviderModel(provider, modelName) {
  if (!modelName) throw new Error('请指定模型名称')
  if (provider?.category === 'image') {
    await requestProvider(provider, '/v1/images/generations', 'POST', {
      model: modelName,
      prompt: 'test',
      n: 1,
      size: '256x256'
    })
  } else {
    await requestProvider(provider, '/v1/chat/completions', 'POST', {
      model: modelName,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
      temperature: 0
    })
  }
  return { success: true, message: '模型测试成功' }
}

export async function getAiProvidersByCategory(category) {
  const res = await getAiProviders()
  return res.providers.filter((p) => p.category === category)
}

export async function getActiveTextProvider() {
  return { success: true, providerId: await resolveActiveProvider('text') }
}

export async function setActiveTextProvider(providerId) {
  return saveActiveProvider('text', providerId)
}

export async function getActiveImageProvider() {
  return { success: true, providerId: await resolveActiveProvider('image') }
}

export async function setActiveImageProvider(providerId) {
  return saveActiveProvider('image', providerId)
}

export async function listEmbeddingProviders() {
  return requireEmbeddingProviderListResult(await requireEmbeddingApi('listEmbeddingProviders')())
}

export async function addEmbeddingProvider(provider) {
  return requireEmbeddingProviderListResult(
    await requireEmbeddingApi('addEmbeddingProvider')(provider),
    '保存 Embedding Provider 失败'
  )
}

export async function setActiveEmbeddingProvider(providerId, active) {
  return requireEmbeddingProviderListResult(
    await requireEmbeddingApi('setActiveEmbeddingProvider')({ id: providerId, active }),
    '设置 Embedding Provider 失败'
  )
}

export async function deleteEmbeddingProvider(providerId) {
  return requireEmbeddingProviderListResult(
    await requireEmbeddingApi('deleteEmbeddingProvider')({ id: providerId }),
    '删除 Embedding Provider 失败'
  )
}

export async function validateEmbeddingProvider(provider) {
  return requireEmbeddingProviderValidationResult(
    await requireEmbeddingApi('validateEmbeddingProvider')(provider),
    '验证 Embedding Provider 失败'
  )
}

export async function listEmbeddingProviderModels(provider) {
  return requireEmbeddingProviderModelsResult(
    await requireEmbeddingApi('listEmbeddingProviderModels')(provider),
    '读取 Embedding 模型列表失败'
  )
}

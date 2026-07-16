import { postJson } from './webHttpClient.js'

async function getStoreValue(key, fallback = null) {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error('读取 AI 服务设置失败')
  }
  return result.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true || result.key !== key) {
    throw new Error('保存 AI 服务设置失败')
  }
}

async function storedProviders() {
  const providers = await getStoreValue('aiProviders', [])
  if (!Array.isArray(providers)) throw new Error('读取 AI 服务失败：接口返回格式不正确')
  return providers
}

function providerKeys(provider = {}) {
  if (Array.isArray(provider.apiKeys) && provider.apiKeys.length) return provider.apiKeys
  return provider.apiKey ? [provider.apiKey] : []
}

async function requestProvider(provider, path, method = 'GET', body) {
  const keys = providerKeys(provider)
  if (!provider?.baseUrl || !keys.length) throw new Error('请先填写接口地址和密钥')
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
  throw lastError || new Error('所有密钥均不可用')
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
      throw new Error(category === 'image' ? '图像 AI 服务不存在' : '文本 AI 服务不存在')
    }
  }
  const key = category === 'image' ? 'aiProviders.activeImageId' : 'aiProviders.activeTextId'
  await setStoreValue(key, id)
  return { success: true, providerId: id }
}

function normalizeEmbeddingProvider(provider = {}) {
  const modelName = String(provider.modelName || provider.model || '').trim()
  const dimension = Number(provider.dimension ?? provider.dimensions)
  const { dimension: _dimension, dimensions: _dimensions, ...providerFields } = provider
  const normalized = {
    ...providerFields,
    id: provider.id || crypto.randomUUID(),
    name: String(provider.name || '').trim(),
    baseUrl: String(provider.baseUrl || '').trim(),
    apiKey: String(provider.apiKey || '').trim(),
    model: modelName,
    modelName,
    active: Boolean(provider.active)
  }
  if (Number.isFinite(dimension) && dimension > 0) {
    normalized.dimension = dimension
    normalized.dimensions = dimension
  }
  return normalized
}

async function storedEmbeddingProviders() {
  const providers = await getStoreValue('embeddingProviders', [])
  if (!Array.isArray(providers)) {
    throw new Error('读取向量服务失败：接口返回格式不正确')
  }
  return providers.map(normalizeEmbeddingProvider)
}

function requireEmbeddingConfig(provider, requireName = false) {
  if (requireName && !provider.name) throw new Error('请填写服务名称')
  if (!provider.baseUrl) throw new Error('请填写向量接口地址')
  if (!provider.apiKey) throw new Error('请填写向量密钥')
  if (!provider.modelName) throw new Error('请填写向量模型名称')
}

function requireAiProviderSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireAiProviderListResult(result, fallback = '读取 AI 服务失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!Array.isArray(ok.providers)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderResult(result, fallback = '保存 AI 服务失败') {
  const ok = requireAiProviderSuccess(result, fallback)
  if (!ok.provider || typeof ok.provider !== 'object' || !ok.provider.id) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return ok
}

function requireAiProviderValidationResult(result, fallback = '验证 AI 服务失败') {
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

function requireEmbeddingProviderListResult(result, fallback = '读取向量服务失败') {
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

function requireEmbeddingProviderValidationResult(result, fallback = '验证向量服务失败') {
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
  if (!Array.isArray(providers)) throw new Error('保存 AI 服务失败：接口返回格式不正确')
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
  if (index < 0) throw new Error('未找到该 AI 服务')
  providers[index] = { ...providers[index], ...provider, updatedAt: Date.now() }
  await setStoreValue('aiProviders', providers)
  return { success: true, provider: providers[index] }
}

export async function deleteAiProvider(providerId) {
  const providers = await storedProviders()
  if (!providerId || !providers.some((provider) => provider.id === providerId)) {
    throw new Error('未找到该 AI 服务')
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
      throw new Error('请先填写接口地址和密钥')
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
  return { success: true, providers: await storedEmbeddingProviders() }
}

export async function addEmbeddingProvider(provider) {
  const providers = await storedEmbeddingProviders()
  const saved = normalizeEmbeddingProvider(provider)
  requireEmbeddingConfig(saved, true)
  const next = providers.filter((item) => item.id !== saved.id)
  next.push(saved)
  await setStoreValue('embeddingProviders', next)
  return { success: true, providers: next }
}

export async function setActiveEmbeddingProvider(providerId, active) {
  const providers = await storedEmbeddingProviders()
  if (!providerId || !providers.some((item) => item.id === providerId)) {
    throw new Error('未找到向量服务')
  }
  const next = providers.map((item) => ({
    ...item,
    active: active ? item.id === providerId : false
  }))
  await setStoreValue('embeddingProviders', next)
  return { success: true, providers: next }
}

export async function deleteEmbeddingProvider(providerId) {
  const providers = await storedEmbeddingProviders()
  if (!providerId || !providers.some((item) => item.id === providerId)) {
    throw new Error('未找到向量服务')
  }
  const next = providers.filter((item) => item.id !== providerId)
  await setStoreValue('embeddingProviders', next)
  return { success: true, providers: next }
}

export async function validateEmbeddingProvider(provider) {
  const target = normalizeEmbeddingProvider(provider)
  requireEmbeddingConfig(target)
  const body = { model: target.modelName, input: 'test' }
  if (target.dimensions) body.dimensions = target.dimensions
  await postJson('/api/ai-proxy', {
    targetUrl: `${target.baseUrl.replace(/\/$/, '')}/v1/embeddings`,
    apiKey: target.apiKey,
    method: 'POST',
    body
  })
  return { success: true, isValid: true }
}

export async function listEmbeddingProviderModels(provider) {
  const target = normalizeEmbeddingProvider(provider)
  if (!target.baseUrl || !target.apiKey) throw new Error('请先填写接口地址和密钥')
  const result = await postJson('/api/ai-proxy', {
    targetUrl: `${target.baseUrl.replace(/\/$/, '')}/v1/models`,
    apiKey: target.apiKey,
    method: 'GET'
  })
  const models = Array.isArray(result?.data?.data)
    ? result.data.data.map((item) => item.id).filter(Boolean)
    : []
  return { success: true, models }
}

/**
 * 图像 AI 服务商配置。
 */

import { postJson } from './webHttpClient.js'

async function getStoreValue(key, fallback = null) {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error('读取图像 AI 设置失败')
  }
  return result.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true || result.key !== key) {
    throw new Error('保存图像 AI 设置失败')
  }
  return result
}

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function legacyValidationMessage() {
  return {
    success: false,
    isValid: false,
    message: '请在 AI Provider 中配置并测试图像服务'
  }
}

export async function listConfiguredImageProviders() {
  const providers = await getStoreValue('aiProviders', [])
  if (!Array.isArray(providers)) {
    throw new Error('读取图像 Provider 失败：设置格式不正确')
  }
  const providerLabels = {}
  const configured = providers
    .filter((provider) => {
      const apiKey = provider?.apiKeys?.[0] || provider?.apiKey || ''
      return provider?.category === 'image' && provider.id && provider.baseUrl && apiKey
    })
    .map((provider) => {
      providerLabels[provider.id] = provider.name || provider.id
      return provider.id
    })
  return { success: true, providers: configured, providerLabels }
}

export async function getImageAiLastProvider() {
  return { success: true, provider: await getStoreValue('imageAi.lastProvider', null) }
}

export async function setImageAiLastProvider(provider) {
  const savedProvider = provider ? String(provider).trim() : ''
  await setStoreValue('imageAi.lastProvider', savedProvider)
  return { success: true, provider: savedProvider }
}

export async function setGeminiApiKey(apiKey) {
  const savedApiKey = normalizeSecret(apiKey)
  await setStoreValue('gemini.apiKey', savedApiKey)
  return { success: true, configured: Boolean(savedApiKey), source: savedApiKey ? 'store' : '' }
}

export async function getGeminiApiKey() {
  const apiKey = await getStoreValue('gemini.apiKey', '')
  return {
    success: true,
    apiKey,
    configured: Boolean(String(apiKey || '').trim()),
    source: apiKey ? 'store' : ''
  }
}

export async function validateGeminiApiKey() {
  return legacyValidationMessage()
}

export async function setDoubaoConfig(payload = {}) {
  const config = {
    apiKey: normalizeSecret(payload.apiKey),
    baseUrl: String(payload.baseUrl || '').trim(),
    model: String(payload.model || '').trim()
  }
  await Promise.all([
    setStoreValue('doubao.apiKey', config.apiKey),
    setStoreValue('doubao.baseUrl', config.baseUrl),
    setStoreValue('doubao.model', config.model)
  ])
  return {
    success: true,
    ...config,
    configured: Boolean(config.apiKey && config.baseUrl && config.model),
    source: config.apiKey ? 'store' : ''
  }
}

export async function getDoubaoConfig() {
  const [apiKey, baseUrl, model] = await Promise.all([
    getStoreValue('doubao.apiKey', ''),
    getStoreValue('doubao.baseUrl', ''),
    getStoreValue('doubao.model', '')
  ])
  return {
    success: true,
    apiKey,
    baseUrl,
    model,
    configured: Boolean(apiKey && baseUrl && model),
    source: apiKey ? 'store' : ''
  }
}

export async function validateDoubaoConfig() {
  return legacyValidationMessage()
}

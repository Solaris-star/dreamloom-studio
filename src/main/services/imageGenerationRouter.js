/**
 * 文生图统一入口：按 imageProvider 路由到通义万相 / Gemini Imagen / 豆包 / 自定义图像 API
 */

import tongyiwanxiangService from './tongyiwanxiang.js'
import * as geminiImagen from './geminiImagen.js'
import * as doubaoImage from './doubaoImage.js'
import customImageApiService from './customImageApi.js'
import { PNG } from 'pngjs'
import { getConfiguredStoreValue } from './envConfig.js'

export const IMAGE_PROVIDER_TONGYI = 'tongyi'
export const IMAGE_PROVIDER_GEMINI = 'gemini'
export const IMAGE_PROVIDER_DOUBAO = 'doubao'

export const IMAGE_PROVIDERS = [IMAGE_PROVIDER_TONGYI, IMAGE_PROVIDER_GEMINI, IMAGE_PROVIDER_DOUBAO]

export function normalizeImageProviderId(providerId) {
  const value = String(providerId || '').trim()
  if (!value) return 'tongyi'
  return value.replace(/^env:/, '').replace(/-image$/, '')
}

export function parseImageSize(sizeStr) {
  const value = String(sizeStr || '').trim()
  const match = value.match(/^(\d+)[*x](\d+)$/)
  if (!match) return null
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10)
  }
}

export function readPngDimensions(buffer) {
  try {
    const png = PNG.sync.read(buffer)
    return { width: png.width, height: png.height }
  } catch (e) {
    throw new Error('不是 PNG 图片或者格式损坏')
  }
}

export function validateGeneratedImageSize(buffer, sizeStr) {
  const dims = readPngDimensions(buffer)
  const expected = parseImageSize(sizeStr)
  if (!expected) {
    return {
      width: dims.width,
      height: dims.height,
      expectedWidth: 0,
      expectedHeight: 0,
      valid: true
    }
  }
  const valid = dims.width === expected.width && dims.height === expected.height
  if (!valid) {
    throw new Error(
      `生成图片尺寸不符，期望: ${expected.width}x${expected.height}，实际: ${dims.width}x${dims.height}`
    )
  }
  return {
    width: dims.width,
    height: dims.height,
    expectedWidth: expected.width,
    expectedHeight: expected.height,
    valid: true
  }
}

function getValue(store, key, fallback = '') {
  const envVal = getConfiguredStoreValue(store, key, undefined)
  if (envVal !== undefined) return envVal
  if (store && typeof store.get !== 'function') {
    return store[key] !== undefined ? store[key] : fallback
  }
  return store?.get?.(key, fallback) ?? fallback
}

function storedAiProviders(store) {
  if (!store) return []
  const stored = typeof store.get === 'function' ? store.get('aiProviders') : store.aiProviders
  if (stored === undefined || stored === null) return []
  if (Array.isArray(stored)) return stored
  if (Array.isArray(stored?.providers)) return stored.providers
  throw new Error('读取 Provider 失败：本地配置格式不正确')
}

export function listConfiguredImageProviders(store) {
  const out = []
  const tongyi = getValue(store, 'tongyiwanxiang.apiKey', '')
  if (tongyi && String(tongyi).trim()) out.push(IMAGE_PROVIDER_TONGYI)

  const gemini = getValue(store, 'gemini.apiKey', '')
  if (gemini && String(gemini).trim()) out.push(IMAGE_PROVIDER_GEMINI)

  const doubaoKey = getValue(store, 'doubao.apiKey', '')
  const doubaoModel = getValue(store, 'doubao.model', '')
  if (doubaoKey && String(doubaoKey).trim() && doubaoModel && String(doubaoModel).trim()) {
    out.push(IMAGE_PROVIDER_DOUBAO)
  }

  const customKey = getValue(store, 'customImageApi.apiKey', '')
  if (customKey && String(customKey).trim()) {
    out.push('custom')
  }

  const providers = storedAiProviders(store)
  for (const provider of providers) {
    if (provider.category === 'image' || provider.type === 'image') {
      out.push(provider.id)
    }
  }

  return out
}

export function listConfiguredImageProviderOptions(store) {
  const providers = storedAiProviders(store)
  const providerLabels = {
    tongyi: '通义万相',
    gemini: 'Gemini Imagen',
    doubao: '豆包 AI',
    custom: '自定义图像 API'
  }
  for (const p of providers) {
    if (p.category === 'image' || p.type === 'image') {
      providerLabels[p.id] = p.name || p.id
    }
  }
  return {
    providers: listConfiguredImageProviders(store),
    providerLabels
  }
}

export function resolveImageProviderConfig(store, options = {}) {
  // Validate store's aiProviders array structure
  const providers = storedAiProviders(store)

  const activeImageId =
    typeof store?.get === 'function'
      ? store?.get?.('aiProviders.activeImageId')
      : store?.['aiProviders.activeImageId']
  if (activeImageId !== undefined && activeImageId !== null && typeof activeImageId !== 'string') {
    throw new Error('读取当前图像 Provider 失败：本地配置格式不正确')
  }

  let reqProviderId = options.providerId || options.imageProvider || ''
  if (!reqProviderId) {
    reqProviderId = activeImageId || ''
  }

  const normalizedId = normalizeImageProviderId(reqProviderId)

  if (normalizedId === 'tongyi') {
    const apiKey = getValue(store, 'tongyiwanxiang.apiKey', '')
    return {
      providerId: 'tongyi',
      model: options.model || options.modelName || 'wan2.6-t2i',
      apiKey
    }
  }

  if (normalizedId === 'gemini') {
    const apiKey = getValue(store, 'gemini.apiKey', '')
    return {
      providerId: 'gemini',
      model: options.model || options.modelName || 'imagen-4.0-generate-001',
      apiKey
    }
  }

  if (normalizedId === 'doubao') {
    const apiKey = getValue(store, 'doubao.apiKey', '')
    const model = getValue(store, 'doubao.model', '')
    const baseUrl = getValue(store, 'doubao.baseUrl', '')
    return {
      providerId: 'doubao',
      model: options.model || options.modelName || model,
      baseUrl,
      apiKey
    }
  }

  if (normalizedId === 'custom') {
    const apiKey = getValue(store, 'customImageApi.apiKey', '')
    const model = getValue(store, 'customImageApi.model', '')
    const baseUrl = getValue(store, 'customImageApi.baseUrl', '')
    return {
      providerId: 'custom',
      model: options.model || options.modelName || model,
      baseUrl,
      apiKey
    }
  }

  const found = providers.find((p) => p.id === reqProviderId)
  if (found) {
    const apiKeys = Array.isArray(found.apiKeys) ? found.apiKeys : []
    const apiKey = apiKeys[0] || found.apiKey || ''
    return {
      providerId: found.id,
      model: options.model || options.modelName || found.model || found.models?.[0] || '',
      baseUrl: found.baseUrl || '',
      apiKey
    }
  }

  throw new Error(`不支持的图像服务: ${reqProviderId}`)
}

/**
 * @param {*} store - 本地 store 实例
 * @param {{ imageProvider?: string, prompt: string, size: string, negativePrompt?: string, timeoutMs?: number, signal?: AbortSignal }} options
 * @returns {Promise<Buffer>}
 */
export async function generateImageBuffer(store, options) {
  const config = resolveImageProviderConfig(store, options)
  const { prompt, size, negativePrompt = '', timeoutMs, signal } = options || {}

  if (config.providerId === 'tongyi') {
    await tongyiwanxiangService.initApiKey((key) => store.get(key))
    const imageUrl = await tongyiwanxiangService.generateCover({
      prompt,
      size,
      negativePrompt,
      timeoutMs,
      signal
    })
    const res = await fetch(imageUrl)
    if (!res.ok) {
      throw new Error(`下载生成图片失败: ${res.status} ${res.statusText}`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  if (config.providerId === 'gemini') {
    return geminiImagen.generateImageBuffer({
      apiKey: config.apiKey,
      prompt,
      size,
      negativePrompt
    })
  }

  if (config.providerId === 'doubao') {
    return doubaoImage.generateImageBuffer({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl || undefined,
      prompt,
      size,
      negativePrompt
    })
  }

  // Handle custom image api or custom providers
  customImageApiService.initConfig({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model
  })
  return customImageApiService.generateImageBuffer({
    prompt,
    size,
    negativePrompt,
    timeoutMs: options?.timeoutMs,
    signal: options?.signal
  })
}

export async function generateImageResult(store, options = {}) {
  const config = resolveImageProviderConfig(store, options)
  const buffer = await generateImageBuffer(store, {
    ...options,
    imageProvider: config.providerId,
    model: config.model
  })
  const dims = validateGeneratedImageSize(buffer, options.size)
  return {
    providerId: config.providerId,
    model: config.model || '',
    buffer,
    dimensions: dims
  }
}

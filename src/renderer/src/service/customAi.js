/**
 * 自定义 AI API 前端服务封装
 */

import { postJson } from './webHttpClient.js'
import { getStoreValue, setStoreValue } from './webStore.js'

function requireSuccessResult(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireStringField(result, field, fallback) {
  if (typeof result[field] !== 'string') {
    throw new Error(`${fallback}：接口没有返回 ${field}`)
  }
}

function requireBooleanField(result, field, fallback) {
  if (typeof result[field] !== 'boolean') {
    throw new Error(`${fallback}：接口没有返回 ${field}`)
  }
}

function requireTextConfigResult(result, fallback = '自定义文本 API 配置失败') {
  requireSuccessResult(result, fallback)
  requireStringField(result, 'apiType', fallback)
  requireStringField(result, 'baseUrl', fallback)
  requireStringField(result, 'model', fallback)
  requireBooleanField(result, 'configured', fallback)
  return result
}

function requireImageConfigResult(result, fallback = '自定义图像 API 配置失败') {
  requireSuccessResult(result, fallback)
  requireStringField(result, 'baseUrl', fallback)
  requireStringField(result, 'model', fallback)
  requireBooleanField(result, 'configured', fallback)
  return result
}

function requireValidationResult(result, fallback) {
  requireSuccessResult(result, fallback)
  if (typeof result.isValid !== 'boolean') {
    throw new Error(`${fallback}：接口没有返回验证状态`)
  }
  if (result.message !== undefined && typeof result.message !== 'string') {
    throw new Error(`${fallback}：接口返回的消息格式无效`)
  }
  return result
}

function requireModelListResult(result, fallback = '读取自定义文本模型列表失败') {
  requireSuccessResult(result, fallback)
  if (!Array.isArray(result.models)) {
    throw new Error(`${fallback}：接口没有返回模型数组`)
  }
  return result
}

export async function setCustomTextApiConfig(config) {
  const savedConfig = {
    apiType: config?.apiType || 'openai',
    baseUrl: config?.baseUrl || '',
    model: config?.model || '',
    apiKey: String(config?.apiKey || '')
  }
  await Promise.all([
    setStoreValue('customTextApi.apiType', savedConfig.apiType),
    setStoreValue('customTextApi.baseUrl', savedConfig.baseUrl),
    setStoreValue('customTextApi.model', savedConfig.model),
    setStoreValue('customTextApi.apiKey', savedConfig.apiKey)
  ])
  return requireTextConfigResult(
    {
      success: true,
      ...savedConfig,
      configured: Boolean(
        savedConfig.apiKey.trim() && savedConfig.baseUrl.trim() && savedConfig.model.trim()
      )
    },
    '保存自定义文本 API 配置失败'
  )
}

export async function getCustomTextApiConfig() {
  const [apiType, baseUrl, model, apiKey] = await Promise.all([
    getStoreValue('customTextApi.apiType', 'openai'),
    getStoreValue('customTextApi.baseUrl', ''),
    getStoreValue('customTextApi.model', ''),
    getStoreValue('customTextApi.apiKey', '')
  ])
  return requireTextConfigResult(
    {
      success: true,
      apiType: String(apiType || 'openai'),
      baseUrl: String(baseUrl || ''),
      model: String(model || ''),
      configured: Boolean(String(apiKey || '').trim())
    },
    '读取自定义文本 API 配置失败'
  )
}

export async function validateCustomTextApiConfig(config) {
  const baseUrl = config?.baseUrl || (await getStoreValue('customTextApi.baseUrl', ''))
  const apiKey = config?.apiKey || (await getStoreValue('customTextApi.apiKey', ''))
  if (!baseUrl || !apiKey) {
    throw new Error('请先配置 API 地址和 Key')
  }
  const proxy = await postJson('/api/ai-proxy', {
    targetUrl: `${String(baseUrl).replace(/\/$/, '')}/v1/models`,
    apiKey,
    method: 'GET'
  })
  const result = {
    ...proxy,
    isValid: proxy?.success === true,
    message: proxy?.message || (proxy?.success === true ? '连接成功' : '连接失败')
  }
  return requireValidationResult(result, '验证自定义文本 API 配置失败')
}

export async function listCustomTextApiModels(config) {
  const baseUrl = config?.baseUrl || (await getStoreValue('customTextApi.baseUrl', ''))
  const apiKey = config?.apiKey || (await getStoreValue('customTextApi.apiKey', ''))
  if (!baseUrl || !apiKey) {
    throw new Error('请先配置 API 地址和 Key')
  }
  const proxy = await postJson('/api/ai-proxy', {
    targetUrl: `${String(baseUrl).replace(/\/$/, '')}/v1/models`,
    apiKey,
    method: 'GET'
  })
  const result = {
    ...proxy,
    models: Array.isArray(proxy?.data?.data)
      ? proxy.data.data.map((item) => item?.id).filter(Boolean)
      : []
  }
  return requireModelListResult(result)
}

export async function setCustomImageApiConfig(config) {
  const savedConfig = {
    baseUrl: config?.baseUrl || '',
    model: config?.model || '',
    apiKey: String(config?.apiKey || '')
  }
  await Promise.all([
    setStoreValue('customImageApi.baseUrl', savedConfig.baseUrl),
    setStoreValue('customImageApi.model', savedConfig.model),
    setStoreValue('customImageApi.apiKey', savedConfig.apiKey)
  ])
  return requireImageConfigResult(
    {
      success: true,
      ...savedConfig,
      configured: Boolean(savedConfig.apiKey.trim() && savedConfig.baseUrl.trim())
    },
    '保存自定义图像 API 配置失败'
  )
}

export async function getCustomImageApiConfig() {
  const [baseUrl, model, apiKey] = await Promise.all([
    getStoreValue('customImageApi.baseUrl', ''),
    getStoreValue('customImageApi.model', ''),
    getStoreValue('customImageApi.apiKey', '')
  ])
  return requireImageConfigResult(
    {
      success: true,
      baseUrl: String(baseUrl || ''),
      model: String(model || ''),
      configured: Boolean(String(apiKey || '').trim())
    },
    '读取自定义图像 API 配置失败'
  )
}

export async function validateCustomImageApiConfig() {
  const [baseUrl, model, apiKey] = await Promise.all([
    getStoreValue('customImageApi.baseUrl', ''),
    getStoreValue('customImageApi.model', ''),
    getStoreValue('customImageApi.apiKey', '')
  ])
  if (!baseUrl || !apiKey) {
    throw new Error('请先配置图像 API 地址和 Key')
  }
  const proxy = await postJson('/api/ai-proxy', {
    targetUrl: `${String(baseUrl).replace(/\/$/, '')}/v1/models`,
    apiKey,
    method: 'GET',
    model
  })
  return requireValidationResult(
    {
      ...proxy,
      isValid: proxy?.success === true,
      message: proxy?.message || (proxy?.success === true ? '连接成功' : '连接失败')
    },
    '验证自定义图像 API 配置失败'
  )
}

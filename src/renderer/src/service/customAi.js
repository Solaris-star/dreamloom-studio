/**
 * 自定义 AI API 前端服务封装
 */

function requireCustomAiApi(name) {
  const api = globalThis.window?.electron?.[name]
  if (typeof api !== 'function') {
    throw new Error(`当前环境暂不支持自定义 AI 接口：${name}`)
  }
  return api
}

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
  return requireTextConfigResult(
    await requireCustomAiApi('setCustomTextApiConfig')(config),
    '保存自定义文本 API 配置失败'
  )
}

export async function getCustomTextApiConfig() {
  return requireTextConfigResult(
    await requireCustomAiApi('getCustomTextApiConfig')(),
    '读取自定义文本 API 配置失败'
  )
}

export async function validateCustomTextApiConfig(config) {
  const validateCustomTextApiConfigApi = requireCustomAiApi('validateCustomTextApiConfig')
  const result = config
    ? await validateCustomTextApiConfigApi(config)
    : await validateCustomTextApiConfigApi()
  return requireValidationResult(result, '验证自定义文本 API 配置失败')
}

export async function listCustomTextApiModels(config) {
  const listCustomTextApiModelsApi = requireCustomAiApi('listCustomTextApiModels')
  const result = config
    ? await listCustomTextApiModelsApi(config)
    : await listCustomTextApiModelsApi()
  return requireModelListResult(result)
}

export async function setCustomImageApiConfig(config) {
  return requireImageConfigResult(
    await requireCustomAiApi('setCustomImageApiConfig')(config),
    '保存自定义图像 API 配置失败'
  )
}

export async function getCustomImageApiConfig() {
  return requireImageConfigResult(
    await requireCustomAiApi('getCustomImageApiConfig')(),
    '读取自定义图像 API 配置失败'
  )
}

export async function validateCustomImageApiConfig() {
  return requireValidationResult(
    await requireCustomAiApi('validateCustomImageApiConfig')(),
    '验证自定义图像 API 配置失败'
  )
}

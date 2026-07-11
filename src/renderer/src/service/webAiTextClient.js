import { postJson } from './webHttpClient.js'

function normalizeModelName(modelName = '') {
  const value = String(modelName || '').trim()
  return value === 'default' ? '' : value
}

function splitModelBindingId(modelId = '') {
  const [providerId, ...modelParts] = String(modelId || '')
    .trim()
    .split('::')
  return {
    providerId: String(providerId || '').trim(),
    modelName: normalizeModelName(modelParts.join('::'))
  }
}

async function getStoreValue(key, fallback = '') {
  const data = await postJson('/api/store/get', { key })
  if (data?.success !== true || data.key !== key) {
    throw new Error(data?.message || '读取 Web 设置失败')
  }
  return data.value ?? fallback
}

async function resolveDefaultModel(task = 'writing') {
  const defaults = await getStoreValue('editorModelDefaults', {})
  if (defaults == null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error('读取编辑器模型默认值失败：设置格式不正确')
  }
  const modelId = defaults[task] || defaults.writing || defaults.summary || defaults.chat || ''
  const parsed = splitModelBindingId(modelId)
  if (parsed.providerId) return { modelId, ...parsed }
  return {
    modelId: '',
    providerId: await getStoreValue('aiProviders.activeTextId', ''),
    modelName: ''
  }
}

export async function resolveTextModelPayload(payload = {}, task = 'writing') {
  const defaults = await resolveDefaultModel(task)
  const bound = splitModelBindingId(payload.modelId)
  const rawModelName = String(payload.modelName || '').trim()
  const rawModel = String(payload.model || '').trim()
  const useProviderDefault = rawModelName === 'default' || (!rawModelName && rawModel === 'default')
  return {
    modelId: payload.modelId || defaults.modelId || '',
    providerId:
      payload.providerId || payload.textProviderId || bound.providerId || defaults.providerId || '',
    modelName: useProviderDefault
      ? ''
      : normalizeModelName(payload.modelName) ||
        normalizeModelName(payload.model) ||
        bound.modelName ||
        defaults.modelName ||
        ''
  }
}

export function requireAiTextResponse(response, fallback = 'AI 文本任务失败') {
  const content = String(
    response?.content || response?.result || response?.text || response?.output || ''
  ).trim()
  if (response?.success !== true || !content) {
    throw new Error(response?.message || response?.error || (content ? fallback : 'AI 返回结果为空，请重试'))
  }
  return content
}

export function responseProviderMeta(response = {}, modelPayload = {}) {
  const bound = splitModelBindingId(modelPayload.modelId)
  return {
    providerId: response.providerId || modelPayload.providerId || bound.providerId || '',
    model: response.model || response.modelName || modelPayload.modelName || bound.modelName || ''
  }
}

export async function runWebAiTextTask(payload, request, options = {}) {
  const modelPayload = await resolveTextModelPayload(payload, options.modelTask)
  const response = await postJson(
    '/api/ai/text-task',
    { ...request, ...modelPayload },
    { timeoutMs: options.timeoutMs || 120_000 }
  )
  return {
    response,
    content: requireAiTextResponse(response, options.fallback),
    modelPayload
  }
}

export function countTextWords(value) {
  return String(value || '').replace(/\s/g, '').length
}

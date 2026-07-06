import deepseekService from './deepseek.js'
import { CustomTextApiService } from './customTextApi.js'
import { getConfiguredStoreValue, getEnvAiProviders } from './envConfig.js'

export const TEXT_PROVIDER_LEGACY_DEEPSEEK = 'deepseek'
const TEXT_PROVIDER_ENV_DEEPSEEK = 'env:deepseek'

function configuredValue(store, key, fallback = '') {
  return getConfiguredStoreValue(store, key, fallback)
}

function splitConfigList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function providerCategory(provider = {}) {
  return provider.category || provider.type || ''
}

function providerApiKeys(provider = {}) {
  const keys = Array.isArray(provider.apiKeys) ? provider.apiKeys : []
  const single = provider.apiKey ? [provider.apiKey] : []
  return (keys.length ? keys : single)
    .map((key) => String(key || '').trim())
    .filter(Boolean)
}

function normalizeTextModelName(modelName = '') {
  const value = String(modelName || '').trim()
  return value === 'default' ? '' : value
}

export function splitTextModelId(modelId = '') {
  const value = String(modelId || '').trim()
  if (!value) return { providerId: '', modelName: '' }
  const [providerId, ...modelParts] = value.split('::')
  return {
    providerId: String(providerId || '').trim(),
    modelName: normalizeTextModelName(modelParts.join('::'))
  }
}

function resolveTextProviderSelection(options = {}) {
  const parsed = splitTextModelId(options.modelId)
  const rawModelName = String(options.modelName || '').trim()
  const rawModel = String(options.model || '').trim()
  const normalizedModelName = normalizeTextModelName(options.modelName)
  const normalizedModel = normalizeTextModelName(options.model)
  const useProviderDefault = rawModelName === 'default' || (!rawModelName && rawModel === 'default')
  return {
    providerId: String(options.providerId || options.textProviderId || parsed.providerId || '').trim(),
    modelName: useProviderDefault ? '' : normalizedModelName || normalizedModel || parsed.modelName
  }
}

function isDeepSeekProvider(provider = {}) {
  return (
    provider.id === TEXT_PROVIDER_LEGACY_DEEPSEEK ||
    provider.id === TEXT_PROVIDER_ENV_DEEPSEEK ||
    provider.provider === 'deepseek'
  )
}

function storedAiProviders(store) {
  if (!store?.get) return []
  const stored = store?.get?.('aiProviders', [])
  if (Array.isArray(stored)) return stored
  if (Array.isArray(stored?.providers)) return stored.providers
  throw new Error('读取 Provider 失败：本地配置格式不正确')
}

export function listConfiguredTextProviders(store) {
  const providers = [...storedAiProviders(store), ...getEnvAiProviders()]
  return providers.filter((provider) => providerCategory(provider) === 'text')
}

export function getActiveTextProviderConfig(store, providerId = '') {
  const providers = listConfiguredTextProviders(store)
  const activeId = providerId || store?.get?.('aiProviders.activeTextId', '') || ''
  if (activeId === TEXT_PROVIDER_LEGACY_DEEPSEEK && configuredValue(store, 'deepseek.apiKey', '')) {
    return {
      id: TEXT_PROVIDER_LEGACY_DEEPSEEK,
      category: 'text',
      provider: 'deepseek',
      name: 'DeepSeek',
      model: configuredValue(store, 'deepseek.model', '') || 'deepseek-chat'
    }
  }
  const selected = activeId ? providers.find((provider) => provider.id === activeId) : null
  if (providerId && !selected) {
    throw new Error(`未找到文本 AI Provider: ${providerId}`)
  }
  return selected || providers[0] || null
}

function buildCustomTextService(provider, modelName = '') {
  const service = new CustomTextApiService()
  const apiKeys = providerApiKeys(provider)
  service.initConfig({
    apiType: provider.apiType || 'openai',
    baseUrl: provider.baseUrl || '',
    apiKeys,
    apiKey: apiKeys[0] || '',
    model: modelName || provider.model || provider.models?.[0] || ''
  })
  return service
}

function buildDeepSeekProvider(store, provider = {}, modelName = '') {
  const apiKeys = providerApiKeys(provider)
  const apiKey = apiKeys[0] || configuredValue(store, 'deepseek.apiKey', '')
  if (!apiKey) throw new Error('请先配置 DeepSeek API Key')
  deepseekService.setApiKey(apiKey)
  deepseekService.setBaseUrl(provider.baseUrl || configuredValue(store, 'deepseek.baseUrl', ''))
  const model = modelName || provider.model || configuredValue(store, 'deepseek.model', '') || 'deepseek-chat'
  deepseekService.setModel(model)
  return {
    providerId: provider.id || TEXT_PROVIDER_LEGACY_DEEPSEEK,
    provider,
    model,
    service: withProviderResultMeta(deepseekService, provider.id || TEXT_PROVIDER_LEGACY_DEEPSEEK, model)
  }
}

function withProviderResultMeta(service, providerId, modelName = '') {
  return {
    async chat(options = {}) {
      const requestModel = normalizeTextModelName(options.model ?? options.modelName ?? modelName)
      const maxTokens = options.max_tokens ?? options.maxTokens
      const request = {
        ...options,
        model: requestModel || undefined,
        max_tokens: maxTokens == null ? undefined : maxTokens
      }
      const result = await service.chat(request)
      return {
        ...result,
        providerId: result.providerId || providerId || '',
        model: result.model || request.model || ''
      }
    },
    async streamChat(options = {}) {
      const requestModel = normalizeTextModelName(options.model ?? options.modelName ?? modelName)
      const maxTokens = options.max_tokens ?? options.maxTokens
      const request = {
        ...options,
        model: requestModel || undefined,
        max_tokens: maxTokens == null ? undefined : maxTokens,
        stream: true
      }
      const stream = service.streamChat ? await service.streamChat(request) : await service.chat(request)
      return withStreamResultMeta(stream, providerId, request.model || '')
    },
    rawService: service
  }
}

function withStreamResultMeta(stream, providerId, modelName = '') {
  if (!stream?.[Symbol.asyncIterator]) {
    throw new Error('文本 AI 服务没有返回可读取的流')
  }
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        yield {
          ...chunk,
          content: chunk?.content || '',
          done: Boolean(chunk?.done),
          providerId: chunk?.providerId || providerId || '',
          model: chunk?.model || modelName || '',
          usage: chunk?.usage || {}
        }
      }
    }
  }
}

export function createTextProvider(store, options = {}) {
  const { providerId, modelName } = resolveTextProviderSelection(options)
  const provider = getActiveTextProviderConfig(store, providerId)
  if (!provider) {
    const deepseekKey = configuredValue(store, 'deepseek.apiKey', '')
    if (deepseekKey) {
      return buildDeepSeekProvider(store, { id: TEXT_PROVIDER_LEGACY_DEEPSEEK, apiKeys: [deepseekKey] }, modelName)
    }
    throw new Error('请先配置文本 AI 服务')
  }

  if (isDeepSeekProvider(provider)) {
    return buildDeepSeekProvider(store, provider, modelName)
  }

  const apiKeys = providerApiKeys(provider)
  if (!apiKeys.length || !provider.baseUrl) {
    throw new Error('请先配置文本 AI 服务的 API 地址和 Key')
  }
  return {
    providerId: provider.id || '',
    provider,
    model: modelName || provider.model || provider.models?.[0] || '',
    service: withProviderResultMeta(
      buildCustomTextService(provider, modelName),
      provider.id || '',
      modelName || provider.model || provider.models?.[0] || ''
    )
  }
}

export async function chatWithTextProvider(store, options = {}) {
  const { service, providerId, model } = createTextProvider(store, options)
  const result = await service.chat({
    ...options,
    model: model || undefined
  })
  return {
    ...result,
    providerId: result.providerId || providerId,
    model: result.model || model || ''
  }
}

export function buildLegacyCustomTextProvider(store, payload = {}) {
  const apiKey = configuredValue(store, 'customTextApi.apiKey', '')
  const apiKeys = splitConfigList(apiKey)
  const model = String(payload?.model || payload?.modelName || configuredValue(store, 'customTextApi.model', '') || '').trim()
  const service = new CustomTextApiService()
  service.initConfig({
    apiType: configuredValue(store, 'customTextApi.apiType', 'openai'),
    baseUrl: configuredValue(store, 'customTextApi.baseUrl', ''),
    model,
    apiKey: apiKeys[0] || apiKey,
    apiKeys
  })
  return {
    service: withProviderResultMeta(service, 'custom_text', model),
    model,
    apiKeys,
    baseUrl: configuredValue(store, 'customTextApi.baseUrl', '')
  }
}

import assert from 'node:assert/strict'

const ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'CUSTOM_TEXT_API_KEY',
  'CUSTOM_TEXT_BASE_URL',
  'CUSTOM_TEXT_MODEL',
  'CUSTOM_TEXT_MODELS',
  'CUSTOM_TEXT_API_TYPE'
]

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
}

function fakeStore(values = {}) {
  return {
    get(key, fallback) {
      return Object.hasOwn(values, key) ? values[key] : fallback
    }
  }
}

try {
  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.DEEPSEEK_API_KEY = 'env-deepseek-key'
  process.env.DEEPSEEK_MODEL = 'env-deepseek-model'
  process.env.DEEPSEEK_BASE_URL = 'https://env.deepseek.example/'
  process.env.CUSTOM_TEXT_API_KEY = 'env-text-key-1,env-text-key-2'
  process.env.CUSTOM_TEXT_BASE_URL = 'https://env-text.example'
  process.env.CUSTOM_TEXT_MODEL = 'env-text-model'
  process.env.CUSTOM_TEXT_MODELS = 'env-text-alt,env-text-model'
  process.env.CUSTOM_TEXT_API_TYPE = 'anthropic'

  const router = await import(`../src/main/services/textGenerationRouter.js?case=${Date.now()}`)
  const store = fakeStore({
    aiProviders: [
      {
        id: 'store-text',
        name: 'Store Text',
        category: 'text',
        apiType: 'openai',
        baseUrl: 'https://store-text.example',
        apiKeys: ['store-text-key'],
        model: 'store-text-model',
        models: ['store-text-model', 'store-text-alt']
      },
      {
        id: 'store-image',
        name: 'Store Image',
        category: 'image',
        baseUrl: 'https://store-image.example',
        apiKeys: ['store-image-key'],
        model: 'store-image-model'
      }
    ],
    'aiProviders.activeTextId': 'store-text',
    'customTextApi.apiType': 'openai',
    'customTextApi.baseUrl': 'https://store-legacy-text.example',
    'customTextApi.apiKey': 'store-legacy-key-1,store-legacy-key-2',
    'customTextApi.model': 'store-legacy-model',
    'deepseek.apiKey': 'store-deepseek-key',
    'deepseek.model': 'store-deepseek-model',
    'deepseek.baseUrl': 'https://store.deepseek.example'
  })

  const providers = router.listConfiguredTextProviders(store)
  assert.deepEqual(
    providers.map((provider) => provider.id),
    ['store-text', 'env:deepseek', 'env:custom-text']
  )

  const active = router.getActiveTextProviderConfig(store)
  assert.equal(active.id, 'store-text')

  const defaultProvider = router.createTextProvider(store)
  assert.equal(defaultProvider.providerId, 'store-text')
  assert.equal(defaultProvider.model, 'store-text-model')

  const storeProvider = router.createTextProvider(store, {
    providerId: 'store-text',
    model: 'store-selected-model'
  })
  assert.equal(storeProvider.providerId, 'store-text')
  assert.equal(storeProvider.provider.id, 'store-text')
  assert.equal(storeProvider.model, 'store-selected-model')
  assert.equal(typeof storeProvider.service.chat, 'function')
  assert.equal(storeProvider.service.rawService.baseUrl, 'https://store-text.example')
  assert.equal(storeProvider.service.rawService.model, 'store-selected-model')
  assert.deepEqual(storeProvider.service.rawService.apiKeys, ['store-text-key'])
  let capturedRequest = null
  storeProvider.service.rawService.chat = async (options) => {
    capturedRequest = options
    return { success: true, content: 'ok', usage: {}, model: options.model }
  }
  const chatSignal = new AbortController().signal
  await storeProvider.service.chat({ messages: [], maxTokens: 321, signal: chatSignal })
  assert.equal(capturedRequest.max_tokens, 321)
  assert.equal(capturedRequest.signal, chatSignal)

  let capturedStreamRequest = null
  storeProvider.service.rawService.streamChat = async (options) => {
    capturedStreamRequest = options
    return {
      async *[Symbol.asyncIterator]() {
        yield { content: '甲', done: false }
        yield { content: '乙', done: false, usage: { total_tokens: 8 }, model: options.model }
        yield { content: '', done: true, usage: { total_tokens: 8 }, model: options.model }
      }
    }
  }
  const streamSignal = new AbortController().signal
  const stream = await storeProvider.service.streamChat({
    messages: [],
    maxTokens: 123,
    signal: streamSignal
  })
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.equal(capturedStreamRequest.max_tokens, 123)
  assert.equal(capturedStreamRequest.stream, true)
  assert.equal(capturedStreamRequest.signal, streamSignal)
  assert.equal(chunks.map((chunk) => chunk.content).join(''), '甲乙')
  assert.equal(chunks[0].providerId, 'store-text')
  assert.equal(chunks[1].model, 'store-selected-model')
  assert.equal(chunks[2].done, true)
  assert.deepEqual(chunks[2].usage, { total_tokens: 8 })

  const defaultModelProvider = router.createTextProvider(store, {
    providerId: 'store-text',
    model: ''
  })
  assert.equal(defaultModelProvider.model, 'store-text-model')
  assert.equal(defaultModelProvider.service.rawService.model, 'store-text-model')

  const modelIdProvider = router.createTextProvider(store, {
    modelId: 'store-text::store-text-alt'
  })
  assert.equal(modelIdProvider.providerId, 'store-text')
  assert.equal(modelIdProvider.model, 'store-text-alt')
  assert.equal(modelIdProvider.service.rawService.model, 'store-text-alt')

  const modelIdDefaultProvider = router.createTextProvider(store, {
    modelId: 'store-text::default'
  })
  assert.equal(modelIdDefaultProvider.providerId, 'store-text')
  assert.equal(modelIdDefaultProvider.model, 'store-text-model')
  assert.equal(modelIdDefaultProvider.service.rawService.model, 'store-text-model')

  const explicitSelectionProvider = router.createTextProvider(store, {
    providerId: 'store-text',
    modelName: 'explicit-model',
    modelId: 'env:custom-text::env-text-alt'
  })
  assert.equal(explicitSelectionProvider.providerId, 'store-text')
  assert.equal(explicitSelectionProvider.model, 'explicit-model')
  assert.equal(explicitSelectionProvider.service.rawService.model, 'explicit-model')

  const envTextProvider = router.createTextProvider(store, { providerId: 'env:custom-text' })
  assert.equal(envTextProvider.providerId, 'env:custom-text')
  assert.equal(envTextProvider.model, 'env-text-model')
  assert.equal(envTextProvider.service.rawService.apiType, 'anthropic')
  assert.equal(envTextProvider.service.rawService.baseUrl, 'https://env-text.example')
  assert.deepEqual(envTextProvider.service.rawService.apiKeys, ['env-text-key-1', 'env-text-key-2'])

  const envDeepSeekProvider = router.createTextProvider(store, { providerId: 'env:deepseek' })
  assert.equal(envDeepSeekProvider.providerId, 'env:deepseek')
  assert.equal(envDeepSeekProvider.provider.id, 'env:deepseek')
  assert.equal(envDeepSeekProvider.model, 'env-deepseek-model')
  assert.equal(envDeepSeekProvider.service.rawService.apiKey, 'env-deepseek-key')
  assert.equal(envDeepSeekProvider.service.rawService.baseURL, 'https://env.deepseek.example')
  assert.equal(envDeepSeekProvider.service.rawService.model, 'env-deepseek-model')

  const legacyDeepSeekProvider = router.createTextProvider(store, { providerId: 'deepseek' })
  assert.equal(legacyDeepSeekProvider.providerId, 'deepseek')
  assert.equal(legacyDeepSeekProvider.model, 'env-deepseek-model')
  assert.equal(legacyDeepSeekProvider.service.rawService.baseURL, 'https://env.deepseek.example')

  const legacyCustom = router.buildLegacyCustomTextProvider(store, { model: 'payload-model' })
  assert.equal(legacyCustom.model, 'payload-model')
  assert.equal(legacyCustom.baseUrl, 'https://env-text.example')
  assert.deepEqual(legacyCustom.apiKeys, ['env-text-key-1', 'env-text-key-2'])
  assert.equal(legacyCustom.service.rawService.model, 'payload-model')

  assert.throws(
    () => router.createTextProvider(store, { providerId: 'missing-provider' }),
    /未找到文本 AI Provider/
  )

  const brokenProviderStore = fakeStore({
    aiProviders: { broken: true },
    'deepseek.apiKey': 'store-deepseek-key'
  })
  assert.throws(
    () => router.listConfiguredTextProviders(brokenProviderStore),
    /读取 Provider 失败：本地配置格式不正确/
  )
  assert.throws(
    () => router.createTextProvider(brokenProviderStore),
    /读取 Provider 失败：本地配置格式不正确/
  )
} finally {
  restoreEnv()
}

console.log('text generation router tests passed')

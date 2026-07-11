import assert from 'node:assert/strict'
import { PNG } from 'pngjs'

const ENV_KEYS = [
  'TONGYI_API_KEY',
  'GEMINI_API_KEY',
  'DOUBAO_IMAGE_API_KEY',
  'DOUBAO_IMAGE_BASE_URL',
  'DOUBAO_IMAGE_MODEL',
  'CUSTOM_IMAGE_API_KEY',
  'CUSTOM_IMAGE_BASE_URL',
  'CUSTOM_IMAGE_MODEL'
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

function makePngBuffer(width, height) {
  const png = new PNG({ width, height })
  return PNG.sync.write(png)
}

try {
  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]

  const router = await import(`../src/main/services/imageGenerationRouter.js?case=${Date.now()}`)
  const store = fakeStore({
    'tongyiwanxiang.apiKey': 'store-tongyi-key',
    'gemini.apiKey': 'store-gemini-key',
    'doubao.apiKey': 'store-doubao-key',
    'doubao.baseUrl': 'https://store-doubao.example/api/v3',
    'doubao.model': 'store-doubao-model',
    'customImageApi.apiKey': 'store-custom-image-key',
    'customImageApi.baseUrl': 'https://store-custom-image.example',
    'customImageApi.model': 'store-custom-image-model',
    'aiProviders.activeImageId': 'store-image-provider',
    aiProviders: [
      {
        id: 'store-image-provider',
        name: 'Store Image Provider',
        category: 'image',
        baseUrl: 'https://image-provider.example',
        model: 'image-provider-default-model',
        models: ['image-provider-default-model', 'image-provider-alt-model'],
        apiKeys: ['image-provider-key']
      }
    ]
  })

  assert.equal(router.normalizeImageProviderId(''), 'tongyi')
  assert.equal(router.normalizeImageProviderId('env:custom-image'), 'custom')
  assert.deepEqual(router.parseImageSize('1200*1600'), { width: 1200, height: 1600 })
  assert.deepEqual(router.parseImageSize('600x800'), { width: 600, height: 800 })
  assert.equal(router.parseImageSize('portrait'), null)

  const coverPng = makePngBuffer(1200, 1600)
  assert.deepEqual(router.readPngDimensions(coverPng), { width: 1200, height: 1600 })
  assert.deepEqual(router.validateGeneratedImageSize(coverPng, '1200*1600'), {
    width: 1200,
    height: 1600,
    expectedWidth: 1200,
    expectedHeight: 1600,
    valid: true
  })
  assert.throws(() => router.validateGeneratedImageSize(coverPng, '600x800'), /生成图片尺寸不符/)
  assert.throws(() => router.readPngDimensions(Buffer.from('not a png')), /不是 PNG/)

  assert.deepEqual(router.listConfiguredImageProviders(store), [
    'tongyi',
    'gemini',
    'doubao',
    'custom',
    'store-image-provider'
  ])

  const providerOptions = router.listConfiguredImageProviderOptions(store)
  assert.equal(providerOptions.providerLabels['store-image-provider'], 'Store Image Provider')

  const tongyi = router.resolveImageProviderConfig(store, { imageProvider: 'tongyi' })
  assert.equal(tongyi.providerId, 'tongyi')
  assert.equal(tongyi.model, 'wan2.6-t2i')
  assert.equal(tongyi.apiKey, 'store-tongyi-key')

  const gemini = router.resolveImageProviderConfig(store, { imageProvider: 'gemini' })
  assert.equal(gemini.providerId, 'gemini')
  assert.equal(gemini.model, 'imagen-4.0-generate-001')
  assert.equal(gemini.apiKey, 'store-gemini-key')

  const doubao = router.resolveImageProviderConfig(store, { imageProvider: 'doubao' })
  assert.equal(doubao.providerId, 'doubao')
  assert.equal(doubao.model, 'store-doubao-model')
  assert.equal(doubao.baseUrl, 'https://store-doubao.example/api/v3')

  const custom = router.resolveImageProviderConfig(store, { imageProvider: 'env:custom-image' })
  assert.equal(custom.providerId, 'custom')
  assert.equal(custom.model, 'store-custom-image-model')
  assert.equal(custom.apiKey, 'store-custom-image-key')

  process.env.CUSTOM_IMAGE_API_KEY = 'env-custom-image-key'
  process.env.CUSTOM_IMAGE_BASE_URL = 'https://env-custom-image.example'
  process.env.CUSTOM_IMAGE_MODEL = 'env-custom-image-model'
  process.env.DOUBAO_IMAGE_MODEL = 'env-doubao-model'

  const envCustom = router.resolveImageProviderConfig(store, { imageProvider: 'custom' })
  assert.equal(envCustom.model, 'env-custom-image-model')
  assert.equal(envCustom.baseUrl, 'https://env-custom-image.example')
  assert.equal(envCustom.apiKey, 'env-custom-image-key')

  const envDoubao = router.resolveImageProviderConfig(store, { imageProvider: 'doubao' })
  assert.equal(envDoubao.model, 'env-doubao-model')

  const configuredProvider = router.resolveImageProviderConfig(store, {
    providerId: 'store-image-provider',
    modelName: 'image-provider-alt-model'
  })
  assert.equal(configuredProvider.providerId, 'store-image-provider')
  assert.equal(configuredProvider.model, 'image-provider-alt-model')
  assert.equal(configuredProvider.baseUrl, 'https://image-provider.example')
  assert.equal(configuredProvider.apiKey, 'image-provider-key')

  const activeProvider = router.resolveImageProviderConfig(store, {})
  assert.equal(activeProvider.providerId, 'store-image-provider')

  const plainStoreProvider = router.resolveImageProviderConfig(
    {
      aiProviders: [
        {
          id: 'plain-image-provider',
          category: 'image',
          baseUrl: 'https://plain-image-provider.example',
          model: 'plain-image-model',
          apiKey: 'plain-image-key'
        }
      ]
    },
    { providerId: 'plain-image-provider' }
  )
  assert.equal(plainStoreProvider.providerId, 'plain-image-provider')
  assert.equal(plainStoreProvider.model, 'plain-image-model')

  assert.throws(
    () => router.resolveImageProviderConfig(store, { imageProvider: 'missing-provider' }),
    /不支持的图像服务/
  )

  const brokenProviderStore = fakeStore({
    aiProviders: { broken: true },
    'tongyiwanxiang.apiKey': 'store-tongyi-key'
  })
  assert.throws(
    () => router.listConfiguredImageProviderOptions(brokenProviderStore),
    /读取 Provider 失败：本地配置格式不正确/
  )
  assert.throws(
    () => router.resolveImageProviderConfig(brokenProviderStore, {}),
    /读取 Provider 失败：本地配置格式不正确/
  )
  assert.throws(
    () =>
      router.resolveImageProviderConfig(
        fakeStore({
          aiProviders: [],
          'aiProviders.activeImageId': { id: 'bad-active' },
          'tongyiwanxiang.apiKey': 'store-tongyi-key'
        }),
        {}
      ),
    /读取当前图像 Provider 失败：本地配置格式不正确/
  )

  const customImageApi = (await import(`../src/main/services/customImageApi.js?case=${Date.now()}`))
    .default
  const originalFetch = globalThis.fetch
  const requestedBodies = []
  try {
    let downloadCalled = false
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes('/images/generations')) {
        requestedBodies.push({ url, body: JSON.parse(init.body) })
        return {
          ok: true,
          async json() {
            return {
              data: [
                {
                  url: 'https://image.example/generated.png'
                }
              ]
            }
          }
        }
      }
      downloadCalled = true
      assert.equal(url, 'https://image.example/generated.png')
      return {
        ok: true,
        async arrayBuffer() {
          return makePngBuffer(1200, 1600)
        }
      }
    }

    customImageApi.initConfig({
      apiKey: 'custom-key',
      baseUrl: 'https://custom-image.example/v1',
      model: 'custom-image-model'
    })
    const customBuffer = await customImageApi.generateImageBuffer({
      prompt: 'cover',
      size: '1200*1600'
    })
    assert.ok(Buffer.isBuffer(customBuffer))
    assert.equal(downloadCalled, true)
    assert.deepEqual(requestedBodies[0].body, {
      prompt: 'cover',
      width: 1200,
      height: 1600,
      n: 1,
      model: 'custom-image-model'
    })

    const routedImage = await router.generateImageResult(
      fakeStore({
        'customImageApi.apiKey': 'custom-key',
        'customImageApi.baseUrl': 'https://custom-image.example/v1',
        'customImageApi.model': 'custom-image-model'
      }),
      {
        imageProvider: 'custom',
        prompt: 'cover',
        size: '1200*1600',
        requireSize: true
      }
    )
    assert.equal(routedImage.providerId, 'custom')
    assert.equal(routedImage.dimensions.valid, true)
    assert.equal(routedImage.dimensions.width, 1200)
    assert.equal(routedImage.dimensions.height, 1600)
  } finally {
    globalThis.fetch = originalFetch
  }
} finally {
  restoreEnv()
}

console.log('image generation router tests passed')

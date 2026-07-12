import assert from 'node:assert/strict'
import {
  generateImageBuffer,
  mapTongyiSizeToAspectRatio,
  validateApiKey
} from '../src/main/services/geminiImagen.js'

const originalFetch = globalThis.fetch
const baseOptions = {
  apiKey: 'test-key',
  prompt: 'ancient city in snow',
  size: '1200*1600',
  negativePrompt: 'watermark'
}

function abortablePendingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    const pendingRequest = setTimeout(() => reject(new Error('模拟请求未按时中止')), 100)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(pendingRequest)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

try {
  assert.equal(mapTongyiSizeToAspectRatio('1200*1600'), '3:4')
  assert.equal(mapTongyiSizeToAspectRatio('1600*900'), '16:9')
  assert.equal(mapTongyiSizeToAspectRatio('invalid'), '1:1')

  await assert.rejects(() => generateImageBuffer({ ...baseOptions, apiKey: '' }), /API Key 未设置/)
  await assert.rejects(() => generateImageBuffer({ ...baseOptions, prompt: ' ' }), /提示词不能为空/)

  let request
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return {
      ok: true,
      async json() {
        return {
          predictions: [{ bytesBase64Encoded: Buffer.from('image-content').toString('base64') }]
        }
      }
    }
  }
  assert.equal((await generateImageBuffer(baseOptions)).toString(), 'image-content')
  assert.match(request.url, /imagen-4\.0-generate-001:predict$/)
  assert.equal(request.init.headers['x-goog-api-key'], 'test-key')
  assert.deepEqual(JSON.parse(request.init.body), {
    instances: [{ prompt: 'ancient city in snow. Avoid the following: watermark' }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '3:4',
      imageSize: '1K',
      personGeneration: 'allow_adult'
    }
  })

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    async json() {
      return { error: { message: 'invalid key' } }
    }
  })
  await assert.rejects(() => generateImageBuffer(baseOptions), /invalid key/)

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { predictions: [] }
    }
  })
  await assert.rejects(() => generateImageBuffer(baseOptions), /未返回图片数据/)

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { predictions: [{ bytesBase64Encoded: '' }] }
    }
  })
  await assert.rejects(() => generateImageBuffer(baseOptions), /无法解析图片/)

  globalThis.fetch = abortablePendingFetch
  await assert.rejects(
    () => generateImageBuffer({ ...baseOptions, timeoutMs: 10 }),
    /请求超时（10 ms）/
  )

  const controller = new AbortController()
  const cancelled = generateImageBuffer({ ...baseOptions, signal: controller.signal })
  controller.abort(new DOMException('用户已取消', 'AbortError'))
  await assert.rejects(cancelled, /用户已取消/)

  assert.deepEqual(await validateApiKey(''), {
    isValid: false,
    message: 'API Key 未设置'
  })

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { models: [] }
    }
  })
  assert.deepEqual(await validateApiKey('test-key'), { isValid: true })

  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    async json() {
      return { error: { message: 'permission denied' } }
    }
  })
  assert.deepEqual(await validateApiKey('test-key'), {
    isValid: false,
    message: 'permission denied'
  })

  globalThis.fetch = abortablePendingFetch
  assert.deepEqual(await validateApiKey('test-key', { timeoutMs: 10 }), {
    isValid: false,
    message: '校验超时（10 ms）'
  })
} finally {
  globalThis.fetch = originalFetch
}

console.log('gemini imagen tests passed')

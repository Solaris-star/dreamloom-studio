import assert from 'node:assert/strict'
import {
  generateImageBuffer,
  mapTongyiSizeToDoubaoSize,
  validateConfigNonEmpty
} from '../src/main/services/doubaoImage.js'

const originalFetch = globalThis.fetch
const baseOptions = {
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://doubao.example/api/v3',
  prompt: '雪夜里的古城',
  size: '1200*1600',
  negativePrompt: '水印'
}

try {
  assert.equal(mapTongyiSizeToDoubaoSize('1200*1600'), '1200x1600')
  assert.equal(mapTongyiSizeToDoubaoSize('invalid'), '1024x1024')
  assert.deepEqual(validateConfigNonEmpty('', 'model'), {
    isValid: false,
    message: 'API Key 未设置'
  })
  assert.deepEqual(validateConfigNonEmpty('key', ''), {
    isValid: false,
    message: '模型 ID 未设置'
  })
  assert.deepEqual(validateConfigNonEmpty('key', 'model'), { isValid: true })

  await assert.rejects(() => generateImageBuffer({ ...baseOptions, apiKey: '' }), /API Key 未设置/)
  await assert.rejects(() => generateImageBuffer({ ...baseOptions, model: '' }), /模型 ID 未设置/)
  await assert.rejects(() => generateImageBuffer({ ...baseOptions, prompt: ' ' }), /提示词不能为空/)

  let request
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return {
      ok: true,
      async json() {
        return { data: [{ b64_json: Buffer.from('image-content').toString('base64') }] }
      }
    }
  }
  assert.equal((await generateImageBuffer(baseOptions)).toString(), 'image-content')
  assert.equal(request.url, 'https://doubao.example/api/v3/images/generations')
  assert.equal(request.init.headers.Authorization, 'Bearer test-key')
  assert.deepEqual(JSON.parse(request.init.body), {
    model: 'test-model',
    prompt: '雪夜里的古城，避免：水印',
    n: 1,
    size: '1200x1600',
    response_format: 'b64_json'
  })

  globalThis.fetch = async (url) => {
    if (String(url).includes('/images/generations')) {
      return {
        ok: true,
        async json() {
          return { data: [{ url: 'https://images.example/result.png' }] }
        }
      }
    }
    return {
      ok: true,
      async arrayBuffer() {
        return Buffer.from('downloaded-image')
      }
    }
  }
  assert.equal((await generateImageBuffer(baseOptions)).toString(), 'downloaded-image')

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
      return { data: [{ url: 'file:///private/image.png' }] }
    }
  })
  await assert.rejects(() => generateImageBuffer(baseOptions), /不安全的图片地址/)

  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
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
  await assert.rejects(
    () => generateImageBuffer({ ...baseOptions, timeoutMs: 10 }),
    /请求超时（10 ms）/
  )

  const requestController = new AbortController()
  const cancelledRequest = generateImageBuffer({
    ...baseOptions,
    timeoutMs: 1000,
    signal: requestController.signal
  })
  requestController.abort()
  await assert.rejects(cancelledRequest, (error) => {
    assert.equal(error.name, 'AbortError')
    assert.match(error.message, /图像生成已取消/)
    return true
  })

  let fetchCount = 0
  globalThis.fetch = async (_url, { signal }) => {
    fetchCount += 1
    if (fetchCount === 1) {
      return {
        ok: true,
        async json() {
          return { data: [{ url: 'https://images.example/cancelled.png' }] }
        }
      }
    }
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }
  const downloadController = new AbortController()
  const cancelledDownload = generateImageBuffer({
    ...baseOptions,
    timeoutMs: 1000,
    signal: downloadController.signal
  })
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
  downloadController.abort()
  await assert.rejects(cancelledDownload, /图像生成已取消/)
} finally {
  globalThis.fetch = originalFetch
}

console.log('doubao image tests passed')

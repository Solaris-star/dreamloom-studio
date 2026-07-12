import assert from 'node:assert/strict'
import { TongyiwanxiangService } from '../src/main/services/tongyiwanxiang.js'

const originalFetch = globalThis.fetch

function successfulResponse(image = 'https://image.example/cover.png') {
  return {
    ok: true,
    async json() {
      return {
        output: {
          choices: [{ message: { content: [{ image }] } }]
        }
      }
    }
  }
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
  const service = new TongyiwanxiangService()
  assert.equal(service.getApiKey(), null)
  assert.equal(await service.initApiKey((key) => (key === 'tongyiwanxiang.apiKey' ? 'store-key' : '')), 'store-key')
  assert.equal(service.getApiKey(), 'store-key')
  service.setApiKey('test-key')
  assert.equal(service.getApiKey(), 'test-key')

  const emptyService = new TongyiwanxiangService()
  await assert.rejects(() => emptyService.generateCover({ prompt: 'cover' }), /API Key 未设置/)
  await assert.rejects(() => service.generateCover({ prompt: ' ' }), /提示词不能为空/)

  let request
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return successfulResponse()
  }
  assert.equal(
    await service.generateCover({
      prompt: ' ancient city ',
      size: '1200*1600',
      negativePrompt: 'watermark'
    }),
    'https://image.example/cover.png'
  )
  assert.match(request.url, /multimodal-generation\/generation$/)
  assert.equal(request.init.headers.Authorization, 'Bearer test-key')
  assert.deepEqual(JSON.parse(request.init.body), {
    model: 'wan2.6-t2i',
    input: {
      messages: [{ role: 'user', content: [{ text: 'ancient city' }] }]
    },
    parameters: {
      prompt_extend: true,
      watermark: false,
      n: 1,
      negative_prompt: 'watermark',
      size: '1200*1600'
    }
  })

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    async json() {
      return { code: 'InvalidApiKey', message: 'invalid key' }
    }
  })
  await assert.rejects(() => service.generateCover({ prompt: 'cover' }), /API Key 无效/)

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { output: { choices: [] } }
    }
  })
  await assert.rejects(() => service.generateCover({ prompt: 'cover' }), /未包含生成结果/)

  globalThis.fetch = async () => successfulResponse('not a url')
  await assert.rejects(() => service.generateCover({ prompt: 'cover' }), /无效图片地址/)

  globalThis.fetch = async () => successfulResponse('file:///etc/passwd')
  await assert.rejects(() => service.generateCover({ prompt: 'cover' }), /不安全的图片地址/)

  globalThis.fetch = abortablePendingFetch
  await assert.rejects(
    () => service.generateCover({ prompt: 'cover', timeoutMs: 10 }),
    /请求超时（10 ms）/
  )

  const controller = new AbortController()
  const cancelled = service.generateCover({ prompt: 'cover', signal: controller.signal })
  controller.abort(new DOMException('用户已取消', 'AbortError'))
  await assert.rejects(cancelled, /用户已取消/)

  assert.deepEqual(await emptyService.validateApiKey(), {
    isValid: false,
    message: 'API Key 未设置'
  })
  assert.deepEqual(await service.validateApiKey(), { isValid: true })
} finally {
  globalThis.fetch = originalFetch
}

console.log('tongyiwanxiang tests passed')

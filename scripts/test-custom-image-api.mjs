import assert from 'node:assert/strict'

import { CustomImageApiService } from '../src/main/services/customImageApi.js'

const originalFetch = globalThis.fetch

function jsonResponse(body, status = 200, statusText = '') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' }
  })
}

function abortablePendingRequest(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('aborted', 'AbortError')),
      { once: true }
    )
  })
}

try {
  const service = new CustomImageApiService()
  service.initConfig({
    apiKey: ' test-key ',
    baseUrl: ' https://image.example/v1/ ',
    model: ' image-model '
  })
  assert.equal(service.apiKey, 'test-key')
  assert.equal(service.baseUrl, 'https://image.example/v1/')
  assert.equal(service.model, 'image-model')

  assert.equal(service._buildImageUrl('https://a.example'), 'https://a.example/v1/images/generations')
  assert.equal(service._buildImageUrl('https://a.example/v1'), 'https://a.example/v1/images/generations')
  assert.equal(service._buildImageUrl('https://a.example/v1/images'), 'https://a.example/v1/images/generations')
  assert.equal(
    service._buildImageUrl('https://a.example/v1/images/generations/'),
    'https://a.example/v1/images/generations'
  )
  assert.throws(() => service._buildImageUrl(''), /API 地址未配置/)
  assert.deepEqual(service._parseSize('1200x1600'), { width: 1200, height: 1600 })
  assert.deepEqual(service._parseSize('1200X1600'), { width: 1200, height: 1600 })
  assert.deepEqual(service._parseSize('1200*1600'), { width: 1200, height: 1600 })
  assert.deepEqual(service._parseSize('1200×1600'), { width: 1200, height: 1600 })
  assert.equal(service._parseSize('invalid'), null)
  assert.equal(service._parseSize('0x100'), null)

  let requests = []
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (requests.length === 1) {
      return jsonResponse({
        data: [{ url: 'https://cdn.example/generated.png' }],
        usage: { total_tokens: 3 }
      })
    }
    return new Response(Buffer.from('downloaded-image'))
  }
  assert.equal(
    (
      await service.generateImageBuffer({
        prompt: '封面',
        size: '1200*1600',
        negativePrompt: '水印'
      })
    ).toString(),
    'downloaded-image'
  )
  assert.equal(requests[0].options.signal, requests[1].options.signal)
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    prompt: '封面',
    width: 1200,
    height: 1600,
    n: 1,
    model: 'image-model',
    negative_prompt: '水印'
  })
  assert.equal(service.lastResult.content, 'https://cdn.example/generated.png')
  assert.equal(service.lastResult.usage.imageRequests, 1)

  globalThis.fetch = async () =>
    jsonResponse({ image: { url: 'https://cdn.example/second.png' } })
  let callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    return callCount === 1
      ? jsonResponse({ image: { url: 'https://cdn.example/second.png' } })
      : new Response(Buffer.from('second-image'))
  }
  assert.equal((await service.generateImageBuffer({ prompt: '场景', size: 'square' })).toString(), 'second-image')

  const base64 = Buffer.from('base64-image').toString('base64')
  globalThis.fetch = async () => jsonResponse({ image: { base64 } })
  assert.equal((await service.generateImageBuffer({ prompt: '人物', size: 'portrait' })).toString(), 'base64-image')
  globalThis.fetch = async () => jsonResponse({ data: [{ b64_json: base64 }] })
  assert.equal((await service.generateImageBuffer({ prompt: '人物' })).toString(), 'base64-image')

  service.initConfig({})
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /配置未完成/)
  service.initConfig({
    apiKey: 'test-key',
    baseUrl: 'https://image.example',
    model: 'image-model'
  })
  await assert.rejects(() => service.generateImageBuffer({ prompt: ' ' }), /提示词不能为空/)

  for (const [status, message] of [
    [401, 'invalid key'],
    [403, 'forbidden'],
    [429, 'rate limited'],
    [500, 'server failed']
  ]) {
    globalThis.fetch = async () => jsonResponse({ error: { message } }, status)
    await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), new RegExp(message))
  }

  globalThis.fetch = async () => new Response('not-json')
  await assert.rejects(
    () => service.generateImageBuffer({ prompt: 'test' }),
    /图像生成 API 返回数据解析失败/
  )
  globalThis.fetch = async () => jsonResponse({})
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /无法解析图像响应/)
  globalThis.fetch = async () => jsonResponse({ image: { base64: '!' } })
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /无效的 Base64/)
  globalThis.fetch = async () => jsonResponse({ data: [{ url: 'file:///private/image.png' }] })
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /不安全的图片地址/)
  globalThis.fetch = async () => jsonResponse({ data: [{ url: 'not-a-url' }] })
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /无效的图片地址/)

  callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    return callCount === 1
      ? jsonResponse({ data: [{ url: 'https://cdn.example/failed.png' }] })
      : new Response('', { status: 503 })
  }
  await assert.rejects(() => service.generateImageBuffer({ prompt: 'test' }), /下载生成图片失败: 503/)

  globalThis.fetch = async (_url, { signal }) => abortablePendingRequest(signal)
  await assert.rejects(
    () => service.generateImageBuffer({ prompt: 'test', timeoutMs: 10 }),
    /图像生成请求超时（1 秒）/
  )

  callCount = 0
  globalThis.fetch = async (_url, { signal }) => {
    callCount += 1
    if (callCount === 1) {
      return jsonResponse({ data: [{ url: 'https://cdn.example/slow.png' }] })
    }
    return abortablePendingRequest(signal)
  }
  await assert.rejects(
    () => service.generateImageBuffer({ prompt: 'test', timeoutMs: 10 }),
    /生成图片下载超时（1 秒）/
  )

  const controller = new AbortController()
  globalThis.fetch = async (_url, { signal }) => abortablePendingRequest(signal)
  const cancelledRequest = service.generateImageBuffer({
    prompt: 'test',
    timeoutMs: 1000,
    signal: controller.signal
  })
  controller.abort()
  await assert.rejects(
    () => cancelledRequest,
    (error) => error.name === 'AbortError' && error.cancelled && /已取消/.test(error.message)
  )

  globalThis.fetch = async () => jsonResponse({})
  assert.deepEqual(await service.testModel('model-a'), {
    success: true,
    message: '图像模型测试成功'
  })
  globalThis.fetch = async () => jsonResponse({}, 401, 'Unauthorized')
  assert.deepEqual(await service.testModel('model-a'), {
    success: false,
    message: 'API Key 无效或无权限'
  })
  globalThis.fetch = async () => jsonResponse({ error: { message: 'model unavailable' } }, 500)
  assert.deepEqual(await service.testModel('model-a'), {
    success: false,
    message: 'model unavailable'
  })
  globalThis.fetch = async (_url, { signal }) => abortablePendingRequest(signal)
  assert.match((await service.testModel('model-a', { timeoutMs: 10 })).message, /模型测试超时（1 秒）/)

  globalThis.fetch = async () => jsonResponse({})
  assert.deepEqual(await service.validateApiKey(), { isValid: true })
  for (const [status, message] of [
    [401, 'API Key 无效或已过期'],
    [403, 'API Key 无权限访问'],
    [429, '请求频率过高，请稍后再试']
  ]) {
    globalThis.fetch = async () => jsonResponse({}, status)
    assert.equal((await service.validateApiKey()).message, message)
  }
  globalThis.fetch = async (_url, { signal }) => abortablePendingRequest(signal)
  assert.match(
    (await service.validateApiKey({ timeoutMs: 10 })).message,
    /API Key 验证超时（1 秒）/
  )
} finally {
  globalThis.fetch = originalFetch
}

console.log('custom image API tests passed')

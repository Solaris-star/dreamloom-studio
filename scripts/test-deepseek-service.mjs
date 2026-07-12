import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch
const { default: service } = await import(
  `../src/main/services/deepseek.js?test=${Date.now()}`
)

service.setApiKey('test-key')
service.rateLimit.maxRequests = 100

function pendingFetch(signal) {
  return new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => {}, 5000)
    if (signal.aborted) {
      clearTimeout(keepAlive)
      reject(signal.reason)
      return
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(keepAlive)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

try {
  globalThis.fetch = async (_url, { signal }) => pendingFetch(signal)
  await assert.rejects(
    () =>
      service.chat({
        messages: [],
        requestId: 'timeout',
        timeoutMs: 10
      }),
    /DeepSeek 请求超时（1 秒）/
  )
  assert.equal(service.pendingRequests.has('timeout'), false)

  const controller = new AbortController()
  const cancelled = service.chat({
    messages: [],
    requestId: 'cancelled',
    timeoutMs: 1000,
    signal: controller.signal
  })
  controller.abort()
  await assert.rejects(cancelled, (error) => {
    assert.equal(error.name, 'AbortError')
    assert.equal(error.message, 'DeepSeek 请求已取消')
    return true
  })
  assert.equal(service.pendingRequests.has('cancelled'), false)

  globalThis.fetch = async () =>
    new Response('rate limited', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Content-Type': 'text/plain' }
    })
  await assert.rejects(
    () => service.chat({ messages: [], requestId: 'failed-response' }),
    /请求频率过高/
  )
  assert.equal(service.pendingRequests.has('failed-response'), false)

  globalThis.fetch = async () =>
    Response.json({
      choices: [{ message: { content: '完成' } }],
      usage: { total_tokens: 3 }
    })
  assert.equal(
    (
      await service.chat({
        messages: [],
        requestId: 'success'
      })
    ).content,
    '完成'
  )
  assert.equal(service.pendingRequests.has('success'), false)

  const encoder = new TextEncoder()
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(streamController) {
          streamController.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"正文"}}]}\n')
          )
          streamController.enqueue(encoder.encode('data: [DONE]\n'))
          streamController.close()
        }
      }),
      { status: 200 }
    )
  const stream = await service.chat({
    messages: [],
    requestId: 'stream',
    stream: true
  })
  assert.equal(service.pendingRequests.has('stream'), true)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.equal(chunks[0].content, '正文')
  assert.equal(service.pendingRequests.has('stream'), false)

  const repeatedStream = await service.chat({
    messages: [],
    requestId: 'stream',
    stream: true
  })
  for await (const _chunk of repeatedStream) {
    // 完整读取，确认重复使用 requestId 后仍会正常清理。
  }
  assert.equal(service.pendingRequests.has('stream'), false)
} finally {
  globalThis.fetch = originalFetch
}

console.log('DeepSeek 主服务测试通过')

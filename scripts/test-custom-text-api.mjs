import assert from 'node:assert/strict'

import { CustomTextApiService } from '../src/main/services/customTextApi.js'

const originalFetch = globalThis.fetch

function response(body, status = 200, statusText = '') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function collectStream(stream) {
  const events = []
  for await (const event of stream) events.push(event)
  return events
}

try {
  const service = new CustomTextApiService()
  service.initConfig({
    apiKeys: [' first-key ', '', 'second-key'],
    baseUrl: 'https://text.example/',
    apiType: 'openai',
    model: 'test-model'
  })
  assert.deepEqual(service.apiKeys, ['first-key', 'second-key'])
  assert.equal(service.baseUrl, 'https://text.example/')
  assert.equal(service.model, 'test-model')

  let requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    return response({ data: [{ id: 'model-a' }, { id: '' }, { id: 'model-b' }] })
  }
  assert.deepEqual(await service.listModels(), {
    success: true,
    models: ['model-a', 'model-b']
  })
  assert.equal(requests[0].url, 'https://text.example/v1/models')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer first-key')

  globalThis.fetch = async () => response(['model-c', { id: 'model-d' }])
  assert.deepEqual((await service.listModels()).models, ['model-c', 'model-d'])

  globalThis.fetch = async () => response({ models: ['model-e', { id: 'model-f' }] })
  assert.deepEqual((await service.listModels()).models, ['model-e', 'model-f'])

  service.initConfig({
    apiKeys: ['bad-key', 'good-key'],
    baseUrl: 'https://text.example'
  })
  requests = []
  globalThis.fetch = async (_url, options) => {
    requests.push(options.headers.Authorization)
    return options.headers.Authorization === 'Bearer good-key'
      ? response({ data: [{ id: 'working-model' }] })
      : response({ error: { message: 'invalid key' } }, 401, 'Unauthorized')
  }
  assert.deepEqual(await service.listModels(), {
    success: true,
    models: ['working-model']
  })
  assert.deepEqual(requests, ['Bearer bad-key', 'Bearer good-key'])

  service.initConfig({
    apiKeys: ['bad-key-1', 'bad-key-2'],
    baseUrl: 'https://text.example'
  })
  requests = []
  globalThis.fetch = async (_url, options) => {
    requests.push(options.headers.Authorization)
    return response({}, 403, 'Forbidden')
  }
  assert.deepEqual(await service.listModels(), {
    success: false,
    models: [],
    message: '所有 Key 均无效或无权限'
  })
  assert.deepEqual(requests, ['Bearer bad-key-1', 'Bearer bad-key-2'])

  globalThis.fetch = async () => response({}, 404, 'Not Found')
  assert.match((await service.listModels()).message, /端点不存在/)

  globalThis.fetch = async () => {
    throw new Error('network unavailable')
  }
  assert.equal((await service.listModels()).message, 'network unavailable')

  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true }
      )
    })
  assert.match((await service.listModels(10)).message, /模型列表请求超时（1 秒）/)

  service.initConfig({
    apiKeys: ['openai-key'],
    baseUrl: 'https://openai.example/',
    apiType: 'openai',
    model: 'openai-model'
  })
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return response({
      choices: [{ message: { content: '普通回复' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    })
  }
  assert.deepEqual(
    await service.chat({
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.2,
      max_tokens: 100
    }),
    {
      success: true,
      content: '普通回复',
      images: [],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
      model: 'openai-model',
      providerId: '',
      error: ''
    }
  )
  assert.equal(request.url, 'https://openai.example/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer openai-key')
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'openai-model',
    messages: [{ role: 'user', content: '你好' }],
    temperature: 0.2,
    max_tokens: 100
  })

  service.initConfig({
    apiKeys: ['invalid-key', 'working-key'],
    baseUrl: 'https://openai.example',
    apiType: 'openai',
    model: 'openai-model'
  })
  requests = []
  globalThis.fetch = async (_url, options) => {
    requests.push(options.headers.Authorization)
    if (options.headers.Authorization === 'Bearer invalid-key') {
      return response({ error: { message: 'Invalid API Key' } }, 401, 'Unauthorized')
    }
    return response({ choices: [{ message: { content: '轮换成功' } }] })
  }
  assert.equal((await service.chat({ messages: [] })).content, '轮换成功')
  assert.deepEqual(requests, ['Bearer invalid-key', 'Bearer working-key'])

  service.initConfig({
    apiKey: 'anthropic-key',
    baseUrl: 'https://anthropic.example',
    apiType: 'anthropic',
    model: 'claude-test'
  })
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return response({
      content: [{ text: 'Anthropic 回复' }],
      usage: { input_tokens: 4, output_tokens: 3 }
    })
  }
  assert.equal(
    (
      await service.chat({
        messages: [
          { role: 'system', content: '保持简短' },
          { role: 'user', content: '你好' }
        ]
      })
    ).content,
    'Anthropic 回复'
  )
  assert.equal(request.url, 'https://anthropic.example/v1/messages')
  assert.equal(request.options.headers['x-api-key'], 'anthropic-key')
  const anthropicBody = JSON.parse(request.options.body)
  assert.equal(anthropicBody.model, 'claude-test')
  assert.deepEqual(anthropicBody.messages.slice(0, 2), [
    { role: 'user', content: '系统指令：保持简短' },
    { role: 'user', content: '保持简短' }
  ])

  service.initConfig({
    apiKey: 'stream-key',
    baseUrl: 'https://openai.example',
    apiType: 'openai',
    model: 'stream-model'
  })
  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"choices":[{"delta":{"content":"第一段"}}],"usage":{"prompt_tokens":1}}',
        'data: malformed',
        'data: {"choices":[{"delta":{"content":"第二段"}}],"usage":{"completion_tokens":2}}',
        'data: [DONE]',
        ''
      ].join('\n'),
      { status: 200 }
    )
  assert.deepEqual(await collectStream(await service.streamChat({ messages: [] })), [
    {
      content: '第一段',
      done: false,
      usage: { prompt_tokens: 1 },
      model: 'stream-model',
      providerId: ''
    },
    {
      content: '第二段',
      done: false,
      usage: { completion_tokens: 2 },
      model: 'stream-model',
      providerId: ''
    },
    {
      content: '',
      done: true,
      usage: { completion_tokens: 2 },
      model: 'stream-model',
      providerId: ''
    }
  ])

  service.initConfig({
    apiKey: 'anthropic-stream-key',
    baseUrl: 'https://anthropic.example',
    apiType: 'anthropic',
    model: 'claude-stream'
  })
  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"type":"content_block_delta","delta":{"text":"流式文本"}}',
        'data: {"type":"message_stop","usage":{"output_tokens":2}}',
        ''
      ].join('\n'),
      { status: 200 }
    )
  assert.deepEqual(await collectStream(await service.streamChat({ messages: [] })), [
    {
      content: '流式文本',
      done: false,
      usage: {},
      model: 'claude-stream',
      providerId: ''
    },
    {
      content: '',
      done: true,
      usage: { output_tokens: 2 },
      model: 'claude-stream',
      providerId: ''
    }
  ])

  service.initConfig({
    apiKey: 'cancel-key',
    baseUrl: 'https://openai.example',
    apiType: 'openai',
    model: 'cancel-model'
  })
  const externalController = new AbortController()
  externalController.abort()
  globalThis.fetch = async (_url, { signal }) => {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    throw new Error('取消信号未传入请求')
  }
  await assert.rejects(
    () => service.chat({ signal: externalController.signal }),
    (error) => error.name === 'AbortError' && error.cancelled && error.message === '请求已停止'
  )

  service.initConfig({
    apiKeys: ['test-bad-key', 'test-good-key'],
    baseUrl: 'https://openai.example',
    apiType: 'openai'
  })
  requests = []
  globalThis.fetch = async (_url, options) => {
    requests.push(options.headers.Authorization)
    return options.headers.Authorization === 'Bearer test-good-key'
      ? response({ choices: [{ message: { content: 'ok' } }] })
      : response({ error: { message: 'Invalid Key' } }, 401, 'Unauthorized')
  }
  assert.deepEqual(await service.testModel('test-model'), {
    success: true,
    message: '模型测试成功'
  })
  assert.deepEqual(requests, ['Bearer test-bad-key', 'Bearer test-good-key'])

  service.initConfig({
    apiKey: 'validate-key',
    baseUrl: 'https://openai.example'
  })
  globalThis.fetch = async () => response({ data: [{ id: 'validated-model' }] })
  assert.deepEqual(await service.validateApiKey(), {
    isValid: true,
    models: ['validated-model']
  })

  service.initConfig({})
  await assert.rejects(() => service.chat(), /请先配置 API 地址和 Key/)
  assert.deepEqual(await service.listModels(), {
    success: false,
    models: [],
    message: '配置不完整'
  })
  assert.deepEqual(await service.validateApiKey(), {
    isValid: false,
    message: '请先填写 API 地址和 Key'
  })
} finally {
  globalThis.fetch = originalFetch
}

console.log('custom text API tests passed')

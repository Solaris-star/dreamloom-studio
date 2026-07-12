import assert from 'node:assert/strict'

const store = new Map()
const requests = []
const queuedResponses = []

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : undefined
  requests.push({ url, options, payload })

  if (url === '/api/store/get') {
    return jsonResponse({
      success: true,
      key: payload.key,
      value: store.get(payload.key)
    })
  }
  if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    return jsonResponse({ success: true, key: payload.key })
  }

  const response = queuedResponses.shift()
  assert.ok(response, `没有为 ${url} 准备响应`)
  return jsonResponse(response.data, response.status)
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function queue(data, status = 200) {
  queuedResponses.push({ data, status })
}

function lastRequest() {
  return requests.at(-1)
}

const customAi = await import('../src/renderer/src/service/customAi.js')
const extraction = await import('../src/renderer/src/service/extraction.js')

const savedText = await customAi.setCustomTextApiConfig({
  apiType: 'openai',
  baseUrl: 'https://text.example.com/',
  model: 'text-model',
  apiKey: 'text-secret'
})
assert.equal(savedText.configured, true)
assert.equal(store.get('customTextApi.apiKey'), 'text-secret')
assert.deepEqual(await customAi.getCustomTextApiConfig(), {
  success: true,
  apiType: 'openai',
  baseUrl: 'https://text.example.com/',
  model: 'text-model',
  configured: true
})

queue({ success: true })
assert.equal(
  (
    await customAi.validateCustomTextApiConfig({
      baseUrl: 'https://override.example.com/',
      apiKey: 'override-secret'
    })
  ).isValid,
  true
)
assert.equal(lastRequest().url, '/api/ai-proxy')
assert.deepEqual(lastRequest().payload, {
  targetUrl: 'https://override.example.com/v1/models',
  apiKey: 'override-secret',
  method: 'GET'
})
assert.equal(lastRequest().url.includes('override-secret'), false)

queue({
  success: true,
  data: { data: [{ id: 'model-a' }, {}, { id: 'model-b' }] }
})
assert.deepEqual((await customAi.listCustomTextApiModels({})).models, [
  'model-a',
  'model-b'
])

await customAi.setCustomTextApiConfig({})
await assert.rejects(
  () => customAi.validateCustomTextApiConfig({}),
  /请先配置 API 地址和 Key/
)
await assert.rejects(
  () => customAi.listCustomTextApiModels({}),
  /请先配置 API 地址和 Key/
)

const savedImage = await customAi.setCustomImageApiConfig({
  baseUrl: 'https://image.example.com/',
  model: 'image-model',
  apiKey: 'image-secret'
})
assert.equal(savedImage.configured, true)
assert.deepEqual(await customAi.getCustomImageApiConfig(), {
  success: true,
  baseUrl: 'https://image.example.com/',
  model: 'image-model',
  configured: true
})

queue({ success: true, message: '图像服务可用' })
const imageValidation = await customAi.validateCustomImageApiConfig()
assert.equal(imageValidation.isValid, true)
assert.equal(imageValidation.message, '图像服务可用')
assert.deepEqual(lastRequest().payload, {
  targetUrl: 'https://image.example.com/v1/models',
  apiKey: 'image-secret',
  method: 'GET',
  model: 'image-model'
})

await customAi.setCustomImageApiConfig({})
await assert.rejects(
  () => customAi.validateCustomImageApiConfig(),
  /请先配置图像 API 地址和 Key/
)

queue([{ key: 'plot', label: '剧情' }, { key: 'character', label: '人物' }])
assert.equal((await extraction.getExtractionDimensions()).length, 2)
assert.equal(lastRequest().url, '/api/extraction/dimensions')
assert.equal(lastRequest().options.method, undefined)

queue({ success: true, status: 'queued', jobId: 'job-1' })
assert.equal((await extraction.createExtraction({ bookPath: 'book-a' })).jobId, 'job-1')
assert.equal(lastRequest().url, '/api/extraction/create')
assert.deepEqual(lastRequest().payload, { bookPath: 'book-a' })

queue({ success: true, extractions: [{ id: 'ext-1' }] })
assert.equal((await extraction.listExtractions('book-a')).extractions[0].id, 'ext-1')

queue({
  success: true,
  done: false,
  progress: { status: 'running', percent: 30 }
})
assert.equal((await extraction.getExtractionProgress('job-1')).done, false)
assert.deepEqual(lastRequest().payload, { jobId: 'job-1' })

queue({
  success: true,
  done: true,
  progress: { status: 'completed', extractionId: 'ext-1' },
  result: { success: true, status: 'completed', extractionId: 'ext-1' }
})
assert.equal(
  (
    await extraction.getExtractionProgress({
      bookPath: 'book-a',
      extractionId: 'ext-1'
    })
  ).done,
  true
)

queue({ success: true, items: [{ id: 'item-1' }], total: 1, page: 1, pageSize: 20 })
assert.equal((await extraction.getExtractionResultPage({ extractionId: 'ext-1' })).total, 1)

queue({ success: true })
assert.equal((await extraction.deleteExtraction({ extractionId: 'ext-1' })).success, true)
assert.equal(extraction.canReadExtractionProgress(), true)

for (const [operation, response, expected] of [
  [() => extraction.getExtractionDimensions(), {}, /接口返回格式不正确/],
  [
    () => extraction.getExtractionDimensions(),
    [{ label: '缺少 key' }],
    /接口返回格式不正确/
  ],
  [
    () => extraction.createExtraction(),
    { success: true, status: 'queued' },
    /没有返回任务 ID/
  ],
  [
    () => extraction.createExtraction(),
    { success: true, status: 'failed', jobId: 'job-2', message: '任务失败' },
    /任务失败/
  ],
  [
    () => extraction.listExtractions('book-a'),
    { success: true, extractions: {} },
    /接口返回格式不正确/
  ],
  [
    () => extraction.getExtractionProgress('job-1'),
    { success: true, progress: {} },
    /没有返回任务状态/
  ],
  [
    () => extraction.getExtractionProgress('job-1'),
    { success: true, done: false, progress: [] },
    /没有返回进度详情/
  ],
  [
    () => extraction.getExtractionProgress('job-1'),
    { success: true, done: true, progress: { success: true, status: 'completed' } },
    /没有返回拆书记录 ID/
  ],
  [
    () => extraction.getExtractionResultPage(),
    { success: true, items: [], total: 'invalid', page: 1, pageSize: 20 },
    /接口返回格式不正确/
  ],
  [
    () => extraction.deleteExtraction(),
    { success: false, message: '记录不存在' },
    /记录不存在/
  ]
]) {
  queue(response)
  await assert.rejects(operation, expected)
}

assert.equal(queuedResponses.length, 0)
console.log('Web 自定义 AI 与拆书服务测试通过')

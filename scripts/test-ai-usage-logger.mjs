import assert from 'node:assert/strict'
import {
  AI_LOGS_KEY,
  appendAiUsageLog,
  buildAiUsageLog,
  estimateAiCost,
  normalizeAiUsage,
  sanitizeAiLogValue
} from '../src/main/services/aiUsageLogger.js'

assert.deepEqual(
  normalizeAiUsage({
    input_tokens: '120',
    outputTokens: 30,
    imageCount: '2'
  }),
  {
    promptTokens: 120,
    completionTokens: 30,
    totalTokens: 150,
    imageRequests: 2
  }
)

assert.equal(
  estimateAiCost(
    {
      inputPricePerMillionTokens: 10,
      outputPricePerMillionTokens: 20,
      imagePricePerRequest: 0.5
    },
    {
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
      images: 2
    }
  ),
  21
)
assert.equal(estimateAiCost({}, { estimated_cost: '1.25' }), 1.25)

{
  const sanitized = sanitizeAiLogValue({
    requestId: 'request-1',
    apiKey: 'secret-key',
    nested: {
      prompt: '整章正文',
      sourceContent: '不应记录的正文',
      authorization: 'Bearer real-secret',
      harmless: '保留字段'
    },
    paths: ['D:\\books\\novel\\chapter.txt', '/home/writer/book/chapter.txt']
  })

  assert.equal(sanitized.requestId, 'request-1')
  assert.equal(sanitized.apiKey, '***')
  assert.equal(sanitized.nested.prompt, '***')
  assert.equal(sanitized.nested.sourceContent, '***')
  assert.equal(sanitized.nested.authorization, '***')
  assert.equal(sanitized.nested.harmless, '保留字段')
  assert.deepEqual(sanitized.paths, ['[本地路径]', ' [本地路径]'])
}

{
  const log = buildAiUsageLog({
    bookId: 12,
    feature: 'rewrite',
    provider: {
      id: 'provider-1',
      model: 'model-1',
      inputPricePerMillionTokens: 5,
      apiKey: 'provider-secret'
    },
    usage: {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300
    },
    success: false,
    error: '请求 D:\\books\\secret.txt 失败，Authorization: Bearer abc-secret-value',
    metadata: {
      chapterId: 'chapter-1',
      content: '章节正文',
      token: 'secret-token'
    }
  })

  assert.equal(log.bookId, '12')
  assert.equal(log.providerId, 'provider-1')
  assert.equal(log.model, 'model-1')
  assert.equal(log.totalTokens, 300)
  assert.equal(log.success, false)
  assert.doesNotMatch(log.error, /D:\\books|abc-secret-value/)
  assert.equal(log.metadata.chapterId, 'chapter-1')
  assert.equal(log.metadata.content, '***')
  assert.equal(log.metadata.token, '***')
}

{
  const values = new Map()
  const store = {
    get(key) {
      return values.get(key)
    },
    set(key, value) {
      values.set(key, value)
    }
  }

  const first = appendAiUsageLog(store, { feature: 'clean' })
  assert.equal(values.get(AI_LOGS_KEY).length, 1)
  assert.equal(values.get(AI_LOGS_KEY)[0].id, first.id)

  values.set(AI_LOGS_KEY, Array.from({ length: 5000 }, (_, index) => ({ id: index })))
  appendAiUsageLog(store, { feature: 'rewrite' })
  assert.equal(values.get(AI_LOGS_KEY).length, 5000)
  assert.equal(values.get(AI_LOGS_KEY)[0].id, 1)

  values.set(AI_LOGS_KEY, { corrupted: true })
  assert.throws(
    () => appendAiUsageLog(store, {}),
    /AI 日志格式异常，已停止写入以免覆盖原始记录/
  )
  assert.deepEqual(values.get(AI_LOGS_KEY), { corrupted: true })
}

console.log('ai usage logger tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ExtractionAiService } from '../src/main/services/extractionAi.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-extraction-ai-'))

function createBook(name) {
  const bookPath = path.join(tempRoot, name)
  fs.mkdirSync(bookPath, { recursive: true })
  return bookPath
}

try {
  const service = new ExtractionAiService()
  const bookPath = createBook('success')
  const requests = []
  const progress = []
  const result = await service.createExtraction({
    bookPath,
    sourceBookName: '测试作品',
    sourceText: '第一章 开始\n正文一\n第二章 继续\n正文二',
    dimensions: ['narrative'],
    requestTimeoutMs: 1000,
    onProgress: (event) => progress.push(event),
    textProvider: {
      async chat(options) {
        requests.push(options)
        return {
          content: '```json\n{"knowledge":[{"point":"节奏","detail":"推进稳定"}]}\n```',
          usage: { total_tokens: 5 }
        }
      }
    }
  })
  assert.equal(result.success, true)
  assert.equal(result.status, 'completed')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].timeoutMs, 1000)
  assert.equal(typeof requests[0].requestId, 'string')
  assert.equal(requests[0].signal instanceof AbortSignal, true)
  assert.equal(progress.at(-1).status, 'completed')

  const listed = service.listExtractions(bookPath)
  assert.equal(listed.extractions.length, 1)
  const extractionId = listed.extractions[0].id
  const detail = service.getExtraction(bookPath, extractionId)
  assert.equal(detail.extraction.results.narrative.items[0].point, '节奏')
  const page = service.getExtractionResultPage(bookPath, extractionId, {
    dimension: 'narrative',
    keyword: '稳定'
  })
  assert.equal(page.total, requests.length)
  assert.match(page.items[0].text, /推进稳定/)
  assert.equal(
    service.searchStoredKnowledge(bookPath, { query: '节奏', topK: 2 }).length,
    requests.length
  )

  const deleted = await service.deleteExtraction(bookPath, extractionId)
  assert.equal(deleted.deletedId, extractionId)
  assert.equal(service.listExtractions(bookPath).extractions.length, 0)

  const cancelBookPath = createBook('cancel')
  const controller = new AbortController()
  let receivedSignal = null
  const pending = service.createExtraction({
    bookPath: cancelBookPath,
    sourceText: '第一章 开始\n正文',
    dimensions: ['narrative', 'plot'],
    signal: controller.signal,
    textProvider: {
      chat({ signal }) {
        receivedSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          )
        })
      }
    }
  })
  for (let attempt = 0; attempt < 20 && !receivedSignal; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.ok(receivedSignal)
  controller.abort()
  const cancelled = await pending
  assert.equal(receivedSignal.aborted, true)
  assert.equal(cancelled.success, false)
  assert.equal(cancelled.status, 'failed')
  assert.equal(cancelled.message, '拆书任务已取消')

  const preCancelledController = new AbortController()
  preCancelledController.abort()
  let ignoredSignalRequestCalled = false
  const preCancelled = await service.createExtraction({
    bookPath: createBook('pre-cancel'),
    sourceText: '第一章 开始\n正文',
    dimensions: ['narrative'],
    signal: preCancelledController.signal,
    textProvider: {
      chat() {
        ignoredSignalRequestCalled = true
        return new Promise(() => {})
      }
    }
  })
  assert.equal(preCancelled.success, false)
  assert.equal(preCancelled.message, '拆书任务已取消')
  assert.equal(ignoredSignalRequestCalled, false)

  const chapterBookPath = createBook('chapter-files')
  const volumePath = path.join(chapterBookPath, '正文', '第一卷')
  fs.mkdirSync(volumePath, { recursive: true })
  fs.writeFileSync(path.join(volumePath, '第十章.txt'), '第十章\n后发生的事情', 'utf-8')
  fs.writeFileSync(path.join(volumePath, '第二章.txt'), '第二章\n先发生的事情', 'utf-8')
  const chapterRequests = []
  const chapterResult = await service.createExtraction({
    bookPath: chapterBookPath,
    sourceBookName: '章节文件作品',
    dimensions: ['plot', 'invalid-dimension'],
    chapterStart: 1,
    chapterLimit: 1,
    runMode: 'unknown',
    textProvider: {
      async chat(options) {
        chapterRequests.push(options)
        return {
          content: JSON.stringify({
            knowledge: [{ point: true, detail: 2, tags: ['开端', '冲突'] }]
          }),
          usage: { input_tokens: 3, output_tokens: 4 }
        }
      }
    }
  })
  assert.equal(chapterResult.success, true)
  assert.equal(chapterResult.runMode, 'append')
  assert.equal(chapterResult.chapterScope.selectedChapterCount, 1)
  assert.match(chapterRequests[0].messages[1].content, /第二章/)
  assert.doesNotMatch(chapterRequests[0].messages[1].content, /第十章/)

  const legacyBookPath = createBook('legacy-records')
  const legacyKnowledgePath = path.join(legacyBookPath, 'knowledge')
  fs.mkdirSync(legacyKnowledgePath, { recursive: true })
  fs.writeFileSync(
    path.join(legacyKnowledgePath, 'extractions.json'),
    JSON.stringify([null, { id: 'legacy', status: 'completed', results: {} }]),
    'utf-8'
  )
  assert.equal(service.listExtractions(legacyBookPath).extractions.length, 1)
  assert.equal(service.getExtractionRecord(legacyBookPath, 'legacy').id, 'legacy')

  const malformedBookPath = createBook('malformed-records')
  const malformedKnowledgePath = path.join(malformedBookPath, 'knowledge')
  fs.mkdirSync(malformedKnowledgePath, { recursive: true })
  const malformedRecordPath = path.join(malformedKnowledgePath, 'extractions.json')
  fs.writeFileSync(malformedRecordPath, '{invalid', 'utf-8')
  assert.throws(
    () => service.listExtractions(malformedBookPath),
    /拆书任务记录读取失败/
  )
  fs.writeFileSync(malformedRecordPath, JSON.stringify({ extractions: 'invalid' }), 'utf-8')
  assert.throws(
    () => service.listExtractions(malformedBookPath),
    /拆书任务记录格式异常/
  )

  const emptyResult = await service.createExtraction({
    bookPath: createBook('empty-result'),
    sourceText: '没有章节标题的正文',
    dimensions: ['narrative'],
    textProvider: {
      async chat() {
        return { content: '' }
      }
    }
  })
  assert.equal(emptyResult.success, false)
  assert.match(emptyResult.message, /模型没有返回可用拆书内容/)

  const timeoutResult = await service.createExtraction({
    bookPath: createBook('timeout'),
    sourceText: '第一章\n等待超时',
    dimensions: ['narrative'],
    requestTimeoutMs: 5,
    textProvider: {
      chat() {
        return new Promise(() => {})
      }
    }
  })
  assert.equal(timeoutResult.success, false)
  assert.match(timeoutResult.message, /模型没有返回可用拆书内容/)

  await assert.rejects(
    () =>
      service.createExtraction({
        bookPath: createBook('missing-provider'),
        sourceText: '第一章 正文'
      }),
    /文本 AI 服务不可用/
  )
  await assert.rejects(
    () =>
      service.createExtraction({
        bookPath: '',
        sourceText: '第一章 正文',
        textProvider: { chat() {} }
      }),
    /书籍路径不能为空/
  )
  await assert.rejects(
    () =>
      service.createExtraction({
        bookPath: createBook('invalid-dimensions'),
        sourceText: '第一章 正文',
        dimensions: ['invalid'],
        textProvider: { chat() {} }
      }),
    /未指定有效的提取维度/
  )
  await assert.rejects(
    () =>
      service.createExtraction({
        bookPath: createBook('missing-content'),
        dimensions: ['narrative'],
        textProvider: { chat() {} }
      }),
    /书籍正文目录不存在/
  )
  assert.deepEqual(service.listExtractions(''), { success: true, extractions: [] })
  assert.throws(() => service.getExtraction(bookPath, ''), /参数不完整/)
  assert.throws(() => service.getExtraction(bookPath, 'missing'), /拆书任务不存在/)
  assert.throws(() => service.getExtractionRecord('', extractionId), /参数不完整/)
  assert.throws(() => service.getExtractionRecord(bookPath, 'missing'), /拆书任务不存在/)
  assert.throws(() => service.getExtractionResultPage('', extractionId), /参数不完整/)
  assert.throws(
    () => service.getExtractionResultPage(bookPath, 'missing'),
    /拆书任务不存在/
  )
  await assert.rejects(() => service.deleteExtraction('', extractionId), /参数不完整/)
  await assert.rejects(() => service.deleteExtraction(bookPath, 'missing'), /拆书任务不存在/)
  await assert.rejects(
    () => service.searchKnowledge('', { query: 'test' }),
    /书籍路径和查询内容不能为空/
  )
  assert.deepEqual(
    await service.searchKnowledge(chapterBookPath, {
      query: '开端',
      dimensions: ['plot'],
      topK: 1
    }),
    service.searchStoredKnowledge(chapterBookPath, {
      query: '开端',
      dimensions: ['plot'],
      topK: 1
    })
  )
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('extraction AI tests passed')

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
  assert.deepEqual(service.listExtractions(''), { success: true, extractions: [] })
  assert.throws(() => service.getExtraction(bookPath, ''), /参数不完整/)
  assert.throws(() => service.getExtraction(bookPath, 'missing'), /拆书任务不存在/)
  await assert.rejects(() => service.deleteExtraction(bookPath, 'missing'), /拆书任务不存在/)
  await assert.rejects(
    () => service.searchKnowledge('', { query: 'test' }),
    /书籍路径和查询内容不能为空/
  )
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('extraction AI tests passed')

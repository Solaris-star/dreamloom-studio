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

  const pagingBookPath = createBook('paging-and-search')
  const pagingItems = Array.from({ length: 12 }, (_, index) => ({
    title: index === 0 ? '雪夜开篇' : `条目 ${index + 1}`,
    name: index === 1 ? '林舟' : '',
    point: index === 2 ? '秘密线索' : '',
    character: index === 3 ? '沈月' : '',
    events: index === 4 ? ['相遇', '追踪'] : [],
    detail: index % 2 === 0 ? '北城 风雪' : '南岸 晴空'
  }))
  const pagingResult = await service.createExtraction({
    bookPath: pagingBookPath,
    sourceBookName: '分页作品',
    sourceType: 'online',
    sourceUrl: 'https://example.test/book',
    onlineText: '第一章 开始\n分页测试正文',
    dimensions: ['narrative'],
    textProvider: {
      async chat() {
        return {
          content: `模型说明：${JSON.stringify({ knowledge: pagingItems })}，以上为结果。`
        }
      }
    }
  })
  assert.equal(pagingResult.success, true)
  assert.equal(pagingResult.sourceType, 'online')
  assert.equal(pagingResult.sourceUrl, 'https://example.test/book')
  const pagingId = pagingResult.id
  assert.equal(
    service.getExtraction(pagingBookPath, pagingId, { previewLimit: 0 }).extraction.results
      .narrative.items.length,
    5
  )
  assert.equal(
    service.getExtraction(pagingBookPath, pagingId, { previewLimit: 100 }).extraction.results
      .narrative.items.length,
    12
  )
  assert.equal(
    service.getExtraction(pagingBookPath, pagingId, { previewLimit: 2 }).extraction.results
      .narrative.items.length,
    2
  )
  const secondPage = service.getExtractionResultPage(pagingBookPath, pagingId, {
    dimension: 'missing',
    page: 2,
    pageSize: 5
  })
  assert.equal(secondPage.dimension, 'narrative')
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.items.length, 5)
  assert.equal(
    service.getExtractionResultPage(pagingBookPath, pagingId, {
      page: 0,
      pageSize: 100
    }).pageSize,
    50
  )
  assert.equal(
    service.getExtractionResultPage(pagingBookPath, pagingId, {
      page: 'invalid',
      pageSize: 'invalid',
      keyword: '林舟'
    }).total,
    1
  )
  for (const keyword of ['雪夜开篇', '秘密线索', '沈月', '追踪']) {
    assert.equal(
      service.getExtractionResultPage(pagingBookPath, pagingId, { keyword }).total,
      1
    )
  }
  assert.equal(
    service.getExtractionResultPage(pagingBookPath, pagingId, {
      keyword: '不存在'
    }).total,
    0
  )
  assert.equal(
    service.searchStoredKnowledge(pagingBookPath, {
      query: '',
      dimensions: ['narrative'],
      topK: 'invalid'
    }).length,
    5
  )
  assert.equal(
    service.searchStoredKnowledge(pagingBookPath, {
      query: '北城 风雪',
      dimensions: ['narrative'],
      topK: 2
    }).length,
    2
  )
  assert.equal(
    service.searchStoredKnowledge(pagingBookPath, {
      query: '北城',
      dimensions: ['missing'],
      topK: 2
    }).length,
    0
  )
  assert.ok(
    (
      await service.searchKnowledge(pagingBookPath, {
        query: '北城',
        topK: 1
      })
    ).length >= 1
  )

  const replaceBookPath = createBook('replace-and-fill')
  const firstExtraction = await service.createExtraction({
    bookPath: replaceBookPath,
    sourceBookName: '替换作品',
    sourceText: '第一章 旧稿\n旧正文',
    dimensions: ['narrative'],
    textProvider: {
      async chat() {
        return { content: '[{"point":"旧结果"}]' }
      }
    }
  })
  assert.equal(firstExtraction.success, true)
  await assert.rejects(
    () =>
      service.createExtraction({
        bookPath: replaceBookPath,
        sourceText: '第一章 补拆\n正文',
        dimensions: ['narrative'],
        runMode: 'fillMissing',
        textProvider: {
          async chat() {
            throw new Error('不应调用')
          }
        }
      }),
    /无需补拆/
  )
  const fillMissing = await service.createExtraction({
    bookPath: replaceBookPath,
    sourceText: '第一章 补拆\n正文',
    dimensions: ['narrative', 'plot'],
    runMode: 'fillMissing',
    textProvider: {
      async chat() {
        return { content: '[{"point":"新情节"}]' }
      }
    }
  })
  assert.equal(fillMissing.success, true)
  assert.deepEqual(fillMissing.skippedDimensions, ['narrative'])
  assert.deepEqual(Object.keys(fillMissing.dimensions), ['plot'])

  const replacement = await service.createExtraction({
    bookPath: replaceBookPath,
    sourceText: '第一章 新稿\n新正文',
    dimensions: ['narrative'],
    runMode: 'replace',
    textProvider: {
      async chat() {
        return { content: '[{"point":"替换结果"}]' }
      }
    }
  })
  assert.equal(replacement.success, true)
  assert.equal(replacement.replacedExtractionIds.length, 2)
  const replacedRecords = [
    service.getExtractionRecord(replaceBookPath, firstExtraction.id),
    service.getExtractionRecord(replaceBookPath, fillMissing.id)
  ]
  for (const record of replacedRecords) {
    assert.equal(record.lifecycleStatus, 'superseded')
    assert.equal(record.superseded, true)
    assert.equal(record.supersededBy, replacement.id)
  }
  assert.equal(
    service.searchStoredKnowledge(replaceBookPath, {
      query: '旧结果',
      dimensions: ['narrative']
    }).length,
    0
  )

  const partialBookPath = createBook('partial-groups')
  const partialChapters = Array.from(
    { length: 5 },
    (_, index) => `第${index + 1}章 标题\n第 ${index + 1} 章正文`
  ).join('\n')
  let partialRequestCount = 0
  const partialResult = await service.createExtraction({
    bookPath: partialBookPath,
    sourceText: partialChapters,
    dimensions: ['narrative'],
    chapterStart: -10,
    chapterEnd: 100,
    chapterLimit: 'invalid',
    requestTimeoutMs: 'invalid',
    textProvider: {
      async chat() {
        partialRequestCount += 1
        if (partialRequestCount === 2) throw new Error('第二组失败')
        return { content: '[{"point":"第一组成功"}]' }
      }
    }
  })
  assert.equal(partialRequestCount, 2)
  assert.equal(partialResult.success, true)
  assert.equal(partialResult.status, 'partial')
  assert.equal(partialResult.stats.failedGroups, 1)
  assert.equal(partialResult.chapterScope.selectedChapterCount, 5)

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

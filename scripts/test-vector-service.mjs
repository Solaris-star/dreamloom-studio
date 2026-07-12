import assert from 'node:assert/strict'
import vectorService from '../src/main/services/vectorService.js'

const originalFetch = globalThis.fetch
const originalEmbedText = vectorService.embedText
const originalEnsureTable = vectorService._ensureTable
const originalGetTable = vectorService._getTable

try {
  await assert.rejects(() => vectorService.embedText('正文'), /API Key 未设置/)
  await assert.rejects(
    () => vectorService.embedText('正文', { apiKey: 'key' }),
    /API 地址未设置/
  )
  await assert.rejects(
    () => vectorService.embedText('正文', { apiKey: 'key', baseUrl: 'https://ai.test' }),
    /模型名称未设置/
  )

  {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push([url, options])
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    const result = await vectorService.embedText('测试正文', {
      apiKey: 'secret',
      baseUrl: 'https://ai.test///',
      model: 'embed-model'
    })
    assert.deepEqual(result, [0.1, 0.2])
    assert.equal(calls[0][0], 'https://ai.test/v1/embeddings')
    assert.equal(calls[0][1].headers.Authorization, 'Bearer secret')
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      model: 'embed-model',
      input: '测试正文'
    })
    assert.equal(calls[0][1].signal instanceof AbortSignal, true)
  }

  for (const [status, body, message] of [
    [401, { error: { message: 'raw key error' } }, /API Key 无效或已过期/],
    [429, { error: { message: 'raw limit error' } }, /请求频率过高/],
    [500, { error: { message: '服务暂不可用' } }, /服务暂不可用/]
  ]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(body), {
        status,
        statusText: 'Failed',
        headers: { 'Content-Type': 'application/json' }
      })
    await assert.rejects(
      () =>
        vectorService.embedText('正文', {
          apiKey: 'key',
          baseUrl: 'https://ai.test',
          model: 'model'
        }),
      message
    )
  }

  globalThis.fetch = async () => new Response('not-json', { status: 200 })
  await assert.rejects(
    () =>
      vectorService.embedText('正文', {
        apiKey: 'key',
        baseUrl: 'https://ai.test',
        model: 'model'
      }),
    /返回数据解析失败/
  )

  for (const embedding of [[], ['0.1'], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [{ embedding }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    await assert.rejects(
      () =>
        vectorService.embedText('正文', {
          apiKey: 'key',
          baseUrl: 'https://ai.test',
          model: 'model'
        }),
      /未返回有效的向量数据/
    )
  }

  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
  await assert.rejects(
    () =>
      vectorService.embedText('正文', {
        apiKey: 'key',
        baseUrl: 'https://ai.test',
        model: 'model',
        timeoutMs: 10
      }),
    /请求超时（1 秒）/
  )

  {
    const controller = new AbortController()
    const pending = vectorService.embedText('正文', {
      apiKey: 'key',
      baseUrl: 'https://ai.test',
      model: 'model',
      timeoutMs: 5000,
      signal: controller.signal
    })
    controller.abort()
    await assert.rejects(() => pending, /请求已取消/)
  }

  assert.deepEqual(await vectorService.addChunks('book', [], {}), { added: 0 })

  {
    const added = []
    vectorService.embedText = async (text) => (text === '第一段' ? [0.1, 0.2] : [0.3, 0.4])
    vectorService._ensureTable = async (_bookPath, dimension) => ({
      async add(records) {
        added.push({ dimension, records })
      }
    })
    const result = await vectorService.addChunks(
      'book',
      [
        { id: 'empty', text: ' ' },
        { id: 'one', text: ' 第一段 ', sourceExtractionId: 'source-1' },
        { text: '第二段', sourceBookName: '长夜', chapterRange: '1-2' }
      ],
      {}
    )
    assert.deepEqual(result, { added: 2 })
    assert.equal(added[0].dimension, 2)
    assert.equal(added[0].records[0].text, '第一段')
    assert.equal(added[0].records[0].sourceExtractionId, 'source-1')
    assert.equal(added[0].records[1].sourceBookName, '长夜')
  }

  vectorService.embedText = async (text) => (text === '第一段' ? [0.1, 0.2] : [0.3])
  await assert.rejects(
    () =>
      vectorService.addChunks(
        'book',
        [{ text: '第一段' }, { text: '第二段' }],
        {}
      ),
    /向量维度不一致/
  )

  vectorService._getTable = async () => null
  assert.deepEqual(await vectorService.search('book', '查询', {}), [])
  assert.deepEqual(await vectorService.deleteBySource('book', 'source'), { deleted: 0 })
  assert.deepEqual(await vectorService.getStats('book'), { totalRows: 0, sources: [] })

  {
    const queryCalls = []
    const query = {
      limit(value) {
        queryCalls.push(['limit', value])
        return this
      },
      filter(value) {
        queryCalls.push(['filter', value])
        return this
      },
      async toArray() {
        return [
          {
            id: 'chunk-1',
            text: '命中正文',
            sourceExtractionId: 'source-1',
            sourceBookName: '长夜',
            dimension: '2',
            chapterRange: '1-2',
            createdAt: '2026-07-12T00:00:00.000Z',
            _distance: 0.12,
            ignored: true
          }
        ]
      }
    }
    vectorService.embedText = async () => [0.1, 0.2]
    vectorService._getTable = async () => ({
      search(vector) {
        queryCalls.push(['search', vector])
        return query
      }
    })
    const rows = await vectorService.search('book', '查询', {}, {
      limit: 8,
      filter: "sourceExtractionId = 'source-1'"
    })
    assert.deepEqual(queryCalls, [
      ['search', [0.1, 0.2]],
      ['limit', 8],
      ['filter', "sourceExtractionId = 'source-1'"]
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].text, '命中正文')
    assert.equal('ignored' in rows[0], false)
  }

  {
    const deletes = []
    let countCall = 0
    vectorService._getTable = async () => ({
      async countRows() {
        countCall += 1
        return countCall === 1 ? 5 : 3
      },
      async delete(expression) {
        deletes.push(expression)
      }
    })
    assert.deepEqual(await vectorService.deleteBySource('book', "source'quoted"), { deleted: 2 })
    assert.deepEqual(deletes, ["sourceExtractionId = 'source''quoted'"])
  }

  vectorService._getTable = async () => ({
    async countRows() {
      return 4
    },
    query() {
      return {
        async toArray() {
          return [
            { sourceExtractionId: 'source-1' },
            { sourceExtractionId: 'source-1' },
            { sourceExtractionId: 'source-2' },
            { sourceExtractionId: '__init__' }
          ]
        }
      }
    }
  })
  assert.deepEqual(await vectorService.getStats('book'), {
    totalRows: 4,
    sources: ['source-1', 'source-2']
  })

  vectorService._connections.set('book', { cached: true })
  await vectorService.deleteBook('book')
  assert.equal(vectorService._connections.has('book'), false)
} finally {
  globalThis.fetch = originalFetch
  vectorService.embedText = originalEmbedText
  vectorService._ensureTable = originalEnsureTable
  vectorService._getTable = originalGetTable
}

console.log('vector service tests passed')

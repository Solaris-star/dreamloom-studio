import lancedb from '@lancedb/lancedb'
import { join } from 'path'
import { randomUUID } from 'crypto'

const TABLE_NAME = 'knowledge_chunks'

class VectorService {
  constructor() {
    this._connections = new Map()
  }

  async _getDb(bookPath) {
    if (this._connections.has(bookPath)) {
      return this._connections.get(bookPath)
    }
    const dbDir = join(bookPath, 'knowledge', 'lancedb')
    const db = await lancedb.connect(dbDir)
    this._connections.set(bookPath, db)
    return db
  }

  async _getTable(bookPath) {
    const db = await this._getDb(bookPath)
    const tables = await db.tableNames()
    if (!tables.includes(TABLE_NAME)) {
      return null
    }
    return await db.openTable(TABLE_NAME)
  }

  async _ensureTable(bookPath, dimension) {
    const db = await this._getDb(bookPath)
    const tables = await db.tableNames()
    if (!tables.includes(TABLE_NAME)) {
      const seedRecord = {
        id: randomUUID(),
        vector: new Array(dimension).fill(0),
        text: '',
        sourceExtractionId: '__init__',
        sourceBookName: '',
        dimension: String(dimension),
        chapterRange: '',
        createdAt: new Date().toISOString()
      }
      await db.createTable(TABLE_NAME, [seedRecord])
      const table = await db.openTable(TABLE_NAME)
      await table.delete("sourceExtractionId = '__init__'")
      return table
    }
    return await db.openTable(TABLE_NAME)
  }

  async embedText(text, config = {}) {
    const { apiKey, baseUrl, model } = config
    if (!apiKey) {
      throw new Error('Embedding API Key 未设置')
    }
    if (!baseUrl) {
      throw new Error('Embedding API 地址未设置')
    }
    if (!model) {
      throw new Error('Embedding 模型名称未设置')
    }

    const url = baseUrl.replace(/\/+$/, '') + '/v1/embeddings'

    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: text
        })
      })
    } catch (err) {
      throw new Error(`Embedding API 网络请求失败: ${err.message}`)
    }

    if (!response.ok) {
      let errorMessage = `Embedding API 请求失败: ${response.status} ${response.statusText}`
      try {
        const body = await response.json()
        if (body?.error?.message) {
          errorMessage = body.error.message
        }
      } catch {
        // ignore parse error
      }
      if (response.status === 401) {
        errorMessage = 'Embedding API Key 无效或已过期'
      } else if (response.status === 429) {
        errorMessage = 'Embedding API 请求频率过高，请稍后再试'
      }
      throw new Error(errorMessage)
    }

    let data
    try {
      data = await response.json()
    } catch {
      throw new Error('Embedding API 返回数据解析失败')
    }

    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding API 未返回有效的向量数据')
    }

    return embedding
  }

  async addChunks(bookPath, chunks, embedConfig) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return { added: 0 }
    }

    const records = []
    let dimension = 0

    for (const chunk of chunks) {
      const text = String(chunk.text || '').trim()
      if (!text) continue

      const vector = await this.embedText(text, embedConfig)
      if (!dimension) {
        dimension = vector.length
      }

      records.push({
        id: chunk.id || randomUUID(),
        vector,
        text,
        sourceExtractionId: String(chunk.sourceExtractionId || ''),
        sourceBookName: String(chunk.sourceBookName || ''),
        dimension: String(dimension),
        chapterRange: String(chunk.chapterRange || ''),
        createdAt: new Date().toISOString()
      })
    }

    if (records.length === 0) {
      return { added: 0 }
    }

    const table = await this._ensureTable(bookPath, dimension)
    await table.add(records)

    return { added: records.length }
  }

  async search(bookPath, queryText, embedConfig, options = {}) {
    const { limit = 5, filter } = options

    const table = await this._getTable(bookPath)
    if (!table) {
      return []
    }

    const queryVector = await this.embedText(queryText, embedConfig)

    let query = table.search(queryVector).limit(limit)

    if (filter) {
      query = query.filter(filter)
    }

    const results = await query.toArray()

    return results.map((r) => ({
      id: r.id,
      text: r.text,
      sourceExtractionId: r.sourceExtractionId,
      sourceBookName: r.sourceBookName,
      dimension: r.dimension,
      chapterRange: r.chapterRange,
      createdAt: r.createdAt,
      _distance: r._distance
    }))
  }

  async deleteBySource(bookPath, sourceExtractionId) {
    const table = await this._getTable(bookPath)
    if (!table) {
      return { deleted: 0 }
    }

    const beforeCount = await table.countRows()
    await table.delete(`sourceExtractionId = '${sourceExtractionId.replace(/'/g, "''")}'`)
    const afterCount = await table.countRows()
    return { deleted: Math.max(0, beforeCount - afterCount) }
  }

  async getStats(bookPath) {
    const table = await this._getTable(bookPath)
    if (!table) {
      return { totalRows: 0, sources: [] }
    }

    const totalRows = await table.countRows()

    const allRows = await table.query().toArray()
    const sourceSet = new Set()
    for (const row of allRows) {
      if (row.sourceExtractionId && row.sourceExtractionId !== '__init__') {
        sourceSet.add(row.sourceExtractionId)
      }
    }

    return {
      totalRows,
      sources: Array.from(sourceSet)
    }
  }

  async deleteBook(bookPath) {
    this._connections.delete(bookPath)
  }
}

export default new VectorService()

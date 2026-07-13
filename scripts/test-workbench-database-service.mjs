import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getWorkbenchDatabaseSnapshot,
  queryWorkbenchDatabase
} from '../src/main/services/workbenchDatabaseService.js'

const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-workbench-db-'))

try {
  const snapshot = getWorkbenchDatabaseSnapshot(booksDir)
  assert.equal(snapshot.success, true)
  assert.ok(Array.isArray(snapshot.data.projects))
  assert.ok(Array.isArray(snapshot.data.chapters))
  assert.equal(typeof snapshot.data.dbPath, 'string')

  const query = queryWorkbenchDatabase(booksDir, { resource: 'projects', limit: 1 })
  assert.deepEqual(query, { success: true, resource: 'projects', items: [], total: 0 })
  const clampedLimit = queryWorkbenchDatabase(booksDir, {
    resource: 'chapters',
    limit: 9999,
    id: 'missing'
  })
  assert.deepEqual(clampedLimit, {
    success: true,
    resource: 'chapters',
    items: [],
    total: 0
  })

  assert.throws(
    () => queryWorkbenchDatabase(booksDir),
    /查询资源无效/
  )
  assert.throws(
    () => queryWorkbenchDatabase(booksDir, { resource: 'sqlite_master' }),
    /查询资源无效/
  )
  assert.throws(
    () => queryWorkbenchDatabase(booksDir, { sql: 'DROP TABLE projects' }),
    /查询资源无效/
  )
} finally {
  fs.rmSync(booksDir, { recursive: true, force: true })
}

console.log('创作台数据库接口测试通过')

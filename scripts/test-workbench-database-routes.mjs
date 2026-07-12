import assert from 'node:assert/strict'
import {
  handleWorkbenchDatabaseRoute,
  isWorkbenchDatabaseRoute
} from '../src/main/webApi/workbenchDatabaseRoutes.js'

const calls = []
const responses = []
const service = {
  getWorkbenchDatabaseSnapshot(booksDir, payload) {
    calls.push(['snapshot', booksDir, payload])
    return { success: true, snapshot: { books: [] } }
  },
  queryWorkbenchDatabase(booksDir, payload) {
    calls.push(['query', booksDir, payload])
    return { success: true, items: [] }
  }
}
const sendJson = (_res, payload) => responses.push(payload)

assert.equal(isWorkbenchDatabaseRoute('/api/workbench-database/snapshot'), true)
assert.equal(isWorkbenchDatabaseRoute('/api/workbench-database/query'), true)
assert.equal(isWorkbenchDatabaseRoute('/api/books/list'), false)

assert.equal(
  handleWorkbenchDatabaseRoute({
    path: '/api/workbench-database/snapshot',
    body: { bookName: '测试书' },
    res: {},
    booksDir: 'D:/books',
    sendJson,
    workbenchDatabaseService: service
  }),
  true
)
assert.equal(
  handleWorkbenchDatabaseRoute({
    path: '/api/workbench-database/query',
    body: { entity: 'chapters' },
    res: {},
    booksDir: 'D:/books',
    sendJson,
    workbenchDatabaseService: service
  }),
  true
)
assert.equal(
  handleWorkbenchDatabaseRoute({
    path: '/api/unknown',
    body: {},
    res: {},
    booksDir: 'D:/books',
    sendJson,
    workbenchDatabaseService: service
  }),
  false
)

assert.deepEqual(calls, [
  ['snapshot', 'D:/books', { bookName: '测试书' }],
  ['query', 'D:/books', { entity: 'chapters' }]
])
assert.deepEqual(responses, [
  { success: true, snapshot: { books: [] } },
  { success: true, items: [] }
])

console.log('创作台数据库路由测试通过')

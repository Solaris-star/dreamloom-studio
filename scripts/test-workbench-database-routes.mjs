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
const sendJson = (_res, payload, statusCode = 200) => responses.push([statusCode, payload])

assert.equal(isWorkbenchDatabaseRoute('/api/workbench-database/snapshot'), true)
assert.equal(isWorkbenchDatabaseRoute('/api/workbench-database/query'), true)
assert.equal(isWorkbenchDatabaseRoute('/api/books/list'), false)

assert.equal(
  handleWorkbenchDatabaseRoute({
    path: '/api/workbench-database/snapshot',
    req: { method: 'POST' },
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
    req: { method: 'POST' },
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
    req: { method: 'GET' },
    body: {},
    res: {},
    booksDir: 'D:/books',
    sendJson,
    workbenchDatabaseService: service
  }),
  false
)
assert.equal(
  handleWorkbenchDatabaseRoute({
    path: '/api/workbench-database/query',
    req: { method: 'GET' },
    body: {},
    res: {},
    booksDir: 'D:/books',
    sendJson,
    workbenchDatabaseService: service
  }),
  true
)

assert.deepEqual(calls, [
  ['snapshot', 'D:/books', { bookName: '测试书' }],
  ['query', 'D:/books', { entity: 'chapters' }]
])
assert.deepEqual(responses, [
  [200, { success: true, snapshot: { books: [] } }],
  [200, { success: true, items: [] }],
  [405, { success: false, message: '请求方法不受支持' }]
])

console.log('创作台数据库路由测试通过')

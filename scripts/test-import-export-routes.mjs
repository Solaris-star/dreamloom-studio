import assert from 'node:assert/strict'
import {
  handleImportExportRoute,
  isImportExportRoute
} from '../src/main/webApi/importExportRoutes.js'

const calls = []
const responses = []
const service = Object.fromEntries(
  [
    'previewImport',
    'importBook',
    'exportBook',
    'createBackup',
    'inspectBackup',
    'restoreBackup',
    'listTasks'
  ].map((method) => [
    method,
    (...args) => {
      calls.push([method, ...args])
      return { success: true, method }
    }
  ])
)
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  service
}
const cases = [
  ['/api/import/preview', 'previewImport', { fileName: '长夜.txt' }],
  ['/api/import/book', 'importBook', { bookName: '长夜' }],
  ['/api/export/book', 'exportBook', { bookName: '长夜', format: 'md' }],
  ['/api/backup/create', 'createBackup', { scope: 'book', bookName: '长夜' }],
  ['/api/backup/inspect', 'inspectBackup', { fileName: 'backup.zip' }],
  ['/api/backup/restore', 'restoreBackup', { fileName: 'backup.zip' }],
  ['/api/import-export/tasks', 'listTasks', undefined]
]

for (const [path, method, body] of cases) {
  assert.equal(isImportExportRoute(path), true)
  assert.equal(handleImportExportRoute({ ...common, path, body }), true)
  assert.deepEqual(responses.at(-1), { success: true, method })
}
assert.equal(isImportExportRoute('/api/books/list'), false)
assert.equal(
  handleImportExportRoute({ ...common, path: '/api/books/list', body: {} }),
  false
)

assert.deepEqual(calls, [
  ['previewImport', 'D:/books', { fileName: '长夜.txt' }],
  ['importBook', 'D:/books', { bookName: '长夜' }],
  ['exportBook', 'D:/books', { bookName: '长夜', format: 'md' }],
  ['createBackup', 'D:/books', { scope: 'book', bookName: '长夜' }],
  ['inspectBackup', 'D:/books', { fileName: 'backup.zip' }],
  ['restoreBackup', 'D:/books', { fileName: 'backup.zip' }],
  ['listTasks', 'D:/books']
])

console.log('导入导出路由测试通过')

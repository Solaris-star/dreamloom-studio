import assert from 'node:assert/strict'
import {
  handleVersionSnapshotRoute,
  isVersionSnapshotRoute
} from '../src/main/webApi/versionSnapshotRoutes.js'

const calls = []
const responses = []
const settings = {
  listSnapshots: (...args) => (calls.push(['setting-list', ...args]), []),
  createSnapshot: (...args) => (
    calls.push(['setting-create', ...args]),
    { id: 'setting-new' }
  ),
  restoreSnapshotWithBackup: (...args) => (
    calls.push(['setting-restore', ...args]),
    { snapshot: { id: 'setting-old' }, backup: { id: 'setting-backup' } }
  ),
  deleteSnapshot: (...args) => (calls.push(['setting-delete', ...args]), true),
  diffSnapshots: (...args) => (calls.push(['setting-diff', ...args]), { added: [] })
}
const chapters = {
  createChapterVersion: (...args) => (
    calls.push(['chapter-create', ...args]),
    { id: 'chapter-new' }
  ),
  listChapterVersions: (...args) => (calls.push(['chapter-list', ...args]), []),
  deleteChapterVersion: (...args) => (calls.push(['chapter-delete', ...args]), true)
}
const resolveBookPath = (payload, booksDir, options) => {
  calls.push(['resolve', payload, booksDir, options])
  return `${booksDir}/${payload.bookName || '当前作品'}`
}
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  resolveBookPath,
  settings,
  chapters
}
const cases = [
  ['/api/setting-snapshots/list', { bookName: '长夜' }],
  ['/api/setting-snapshots/create', { bookName: '长夜', name: '设定一' }],
  ['/api/setting-snapshots/restore', { bookName: '长夜', snapshotId: 'setting-old' }],
  ['/api/setting-snapshots/delete', { bookName: '长夜', snapshotId: 'setting-old' }],
  [
    '/api/setting-snapshots/diff',
    { bookName: '长夜', snapshotIdA: 'setting-a', snapshotIdB: 'setting-b' }
  ],
  ['/api/editor-snapshots/create', { bookId: '长夜', chapterId: 'c1' }],
  ['/api/editor-snapshots/list', { bookId: '长夜', chapterId: 'c1' }],
  ['/api/editor-snapshots/delete', { bookId: '长夜', chapterId: 'c1', snapshotId: 'v1' }]
]

for (const [path, body] of cases) {
  assert.equal(isVersionSnapshotRoute(path), true)
  assert.equal(handleVersionSnapshotRoute({ ...common, path, body }), true)
}
assert.equal(isVersionSnapshotRoute('/api/editor-snapshots/restore'), false)
assert.equal(
  handleVersionSnapshotRoute({ ...common, path: '/api/books/list', body: {} }),
  false
)
assert.deepEqual(responses[2], {
  success: true,
  snapshot: { id: 'setting-old' },
  backup: { id: 'setting-backup' }
})
assert.deepEqual(responses[7], { success: true, snapshotId: 'v1' })

settings.restoreSnapshotWithBackup = () => null
settings.deleteSnapshot = () => false
settings.diffSnapshots = () => null
chapters.deleteChapterVersion = () => false
for (const [path, body] of [cases[2], cases[3], cases[4], cases[7]]) {
  handleVersionSnapshotRoute({ ...common, path, body })
}
assert.deepEqual(
  responses.slice(-4).map((item) => item.success),
  [false, false, false, false]
)

const chapterResolveCall = calls.find(
  ([method, payload]) => method === 'resolve' && payload.bookId === '长夜'
)
assert.equal(chapterResolveCall[1].bookName, '长夜')
assert.deepEqual(chapterResolveCall[3], { ensure: true })

console.log('版本与设定快照路由测试通过')

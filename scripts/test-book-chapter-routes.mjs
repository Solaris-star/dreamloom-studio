import assert from 'node:assert/strict'
import {
  handleBookChapterRoute,
  isBookChapterRoute
} from '../src/main/webApi/bookChapterRoutes.js'

const methods = [
  'readBooksDir',
  'createBook',
  'editBook',
  'deleteBook',
  'createVolume',
  'createChapter',
  'loadChapters',
  'readChapter',
  'saveChapter',
  'checkChapterExists',
  'upsertChapter',
  'editNode',
  'deleteNode',
  'getSortOrder',
  'setSortOrder',
  'getChapterSettings',
  'setChapterTargetWords',
  'updateChapterFormat',
  'reformatChapterNumbers'
]
const calls = []
const responses = []
const service = Object.fromEntries(
  methods.map((method) => [
    method,
    (...args) => {
      calls.push([method, ...args])
      return method === 'getSortOrder' ? 'desc' : { success: true, method }
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
  ['/api/books/dir', {}],
  ['/api/books/list', {}],
  ['/api/books/create', { name: '长夜' }],
  ['/api/books/edit', { name: '长夜新篇' }],
  ['/api/books/delete', { name: '长夜' }],
  ['/api/volumes/create', { bookName: '长夜' }],
  ['/api/chapters/create', { bookName: '长夜', volumeId: '第一卷' }],
  ['/api/chapters/load', { bookName: '长夜' }],
  ['/api/chapters/read', { bookName: '长夜', chapterName: '第一章' }],
  ['/api/chapters/save', { bookName: '长夜', content: '正文' }],
  ['/api/chapters/check-exists', { bookName: '长夜', chapterName: '第一章' }],
  ['/api/chapters/upsert', { bookName: '长夜', content: '正文' }],
  ['/api/nodes/edit', { bookName: '长夜', oldName: '第一章' }],
  ['/api/nodes/delete', { bookName: '长夜', name: '第一章' }],
  ['/api/sort-order/get', { bookName: '长夜' }],
  ['/api/sort-order/set', { bookName: '长夜', order: 'asc' }],
  ['/api/chapter-settings/get', { bookName: '长夜' }],
  ['/api/chapter-settings/target-words', { bookName: '长夜', targetWords: 3000 }],
  ['/api/chapter-format/update', { bookName: '长夜', settings: { suffix: '章' } }],
  ['/api/chapter-numbers/reformat', { bookName: '长夜', volumeName: '第一卷' }]
]

for (const [path, body] of cases) {
  assert.equal(isBookChapterRoute(path), true)
  assert.equal(await handleBookChapterRoute({ ...common, path, body }), true)
}
assert.deepEqual(responses[0], { success: true, booksDir: 'D:/books' })
assert.deepEqual(responses[14], { success: true, order: 'desc' })
assert.equal(isBookChapterRoute('/api/books/set-dir'), false)
assert.equal(
  await handleBookChapterRoute({ ...common, path: '/api/studio/maps/list', body: {} }),
  false
)

assert.deepEqual(calls, [
  ['readBooksDir', 'D:/books'],
  ['createBook', cases[2][1], 'D:/books'],
  ['editBook', cases[3][1], 'D:/books'],
  ['deleteBook', '长夜', 'D:/books'],
  ['createVolume', '长夜', 'D:/books'],
  ['createChapter', cases[6][1], 'D:/books'],
  ['loadChapters', '长夜', 'D:/books'],
  ['readChapter', cases[8][1], 'D:/books'],
  ['saveChapter', cases[9][1], 'D:/books'],
  ['checkChapterExists', cases[10][1], 'D:/books'],
  ['upsertChapter', cases[11][1], 'D:/books'],
  ['editNode', cases[12][1], 'D:/books'],
  ['deleteNode', cases[13][1], 'D:/books'],
  ['getSortOrder', '长夜'],
  ['setSortOrder', cases[15][1]],
  ['getChapterSettings', '长夜'],
  ['setChapterTargetWords', cases[17][1]],
  ['updateChapterFormat', cases[18][1], 'D:/books'],
  ['reformatChapterNumbers', cases[19][1], 'D:/books']
])

console.log('书籍与章节路由测试通过')

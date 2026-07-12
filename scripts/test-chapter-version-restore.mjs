import assert from 'node:assert/strict'
import {
  createChapterVersionContent,
  restoreChapterVersion
} from '../src/renderer/src/service/chapterVersionRestore.js'

assert.equal(createChapterVersionContent(''), '<p></p>')
assert.equal(
  createChapterVersionContent('第一段\n第二段 <保留>\n甲  乙'),
  '<p>第一段</p><p>第二段 &lt;保留&gt;</p><p>甲&nbsp;&nbsp;乙</p>'
)

const events = []
let chapterId = 'chapter-a'
const restored = await restoreChapterVersion({
  expectedChapterId: 'chapter-a',
  getCurrentChapterId: () => chapterId,
  currentContent: '<p>当前正文</p>',
  restoredContent: '<p>历史正文</p>',
  async createBackup(content) {
    events.push(['backup', content])
  },
  applyContent(content) {
    events.push(['apply', content])
  },
  async persistContent() {
    events.push(['save'])
    return true
  }
})
assert.equal(restored, true)
assert.deepEqual(events, [
  ['backup', '<p>当前正文</p>'],
  ['apply', '<p>历史正文</p>'],
  ['save']
])

const failedEvents = []
await assert.rejects(
  () =>
    restoreChapterVersion({
      expectedChapterId: 'chapter-a',
      getCurrentChapterId: () => 'chapter-a',
      currentContent: 'current',
      restoredContent: 'history',
      async createBackup() {
        failedEvents.push('backup')
      },
      applyContent(content) {
        failedEvents.push(`apply:${content}`)
      },
      async persistContent() {
        return false
      }
    }),
  /恢复内容保存失败/
)
assert.deepEqual(failedEvents, ['backup', 'apply:history', 'apply:current'])

let applied = false
chapterId = 'chapter-b'
await assert.rejects(
  () =>
    restoreChapterVersion({
      expectedChapterId: 'chapter-a',
      getCurrentChapterId: () => chapterId,
      currentContent: 'current',
      restoredContent: 'history',
      async createBackup() {},
      applyContent() {
        applied = true
      },
      async persistContent() {
        return true
      }
    }),
  /当前章节已经变化/
)
assert.equal(applied, false)

chapterId = 'chapter-a'
await assert.rejects(
  () =>
    restoreChapterVersion({
      expectedChapterId: 'chapter-a',
      getCurrentChapterId: () => chapterId,
      currentContent: 'current',
      restoredContent: 'history',
      async createBackup() {
        chapterId = 'chapter-b'
      },
      applyContent() {
        applied = true
      },
      async persistContent() {
        return true
      }
    }),
  /当前章节已经变化/
)
assert.equal(applied, false)

console.log('章节版本恢复测试通过')

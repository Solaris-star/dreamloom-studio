import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createChapterVersion,
  deleteChapterVersion,
  listChapterVersions
} from '../src/main/services/chapterVersionService.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-versions-'))
const bookA = join(root, '作品甲')
const bookB = join(root, '作品乙')
fs.mkdirSync(bookA)
fs.mkdirSync(bookB)

try {
  const first = createChapterVersion(bookA, {
    chapterId: '正文/第一章.txt',
    chapterName: '第一章',
    content: '<p>初稿</p>',
    reason: 'manual'
  })
  createChapterVersion(bookA, {
    chapterId: '正文/第二章.txt',
    chapterName: '第二章',
    contentBefore: '<p>第二章</p>',
    reason: 'auto_save'
  })
  createChapterVersion(bookB, {
    chapterId: '正文/第一章.txt',
    chapterName: '第一章',
    content: '<p>另一部作品</p>',
    reason: 'manual'
  })
  assert.equal(listChapterVersions(bookA, '正文/第一章.txt')[0].id, first.id)
  assert.equal(listChapterVersions(bookA, '正文/第二章.txt').length, 1)
  assert.equal(listChapterVersions(bookB, '正文/第一章.txt')[0].contentBefore, '<p>另一部作品</p>')
  assert.equal(
    deleteChapterVersion(bookA, { chapterId: '正文/第二章.txt', snapshotId: first.id }),
    false
  )
  assert.equal(
    deleteChapterVersion(bookA, { chapterId: '正文/第一章.txt', snapshotId: first.id }),
    true
  )

  for (let index = 0; index < 55; index += 1) {
    createChapterVersion(bookA, {
      chapterId: '正文/第三章.txt',
      chapterName: '第三章',
      content: String(index),
      reason: 'auto_save'
    })
  }
  assert.equal(listChapterVersions(bookA, '正文/第三章.txt').length, 50)

  const storeFile = join(bookA, '.dreamloom', 'chapter-versions.json')
  fs.writeFileSync(storeFile, '{ bad json', 'utf8')
  assert.throws(
    () =>
      createChapterVersion(bookA, {
        chapterId: '正文/第四章.txt',
        chapterName: '第四章',
        content: '不会覆盖',
        reason: 'manual'
      }),
    /文件损坏/
  )
  assert.equal(fs.readFileSync(storeFile, 'utf8'), '{ bad json')
  assert.throws(() => listChapterVersions(bookB, ''), /缺少章节标识/)
  console.log('章节版本服务测试通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

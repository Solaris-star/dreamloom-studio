import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createBook,
  createChapter,
  deleteBook,
  editBook,
  loadChapters,
  readBooksDir,
  readChapter,
  saveChapter,
  upsertChapter
} from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-web-books-lifecycle-'))
const booksDir = join(root, 'books')
const pngBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32, 1)])
const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

try {
  assert.deepEqual(await readBooksDir(''), [])
  await assert.rejects(() => readBooksDir(booksDir), /书籍目录不存在/)
  fs.mkdirSync(booksDir, { recursive: true })

  const created = await createBook(
    { id: 'lifecycle-book', name: '生命周期作品', coverImagePath: pngDataUrl },
    booksDir
  )
  assert.equal(created.success, true)

  fs.mkdirSync(join(booksDir, '损坏作品'), { recursive: true })
  fs.writeFileSync(join(booksDir, '损坏作品', 'mazi.json'), '{broken', 'utf8')
  fs.writeFileSync(
    join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'),
    '第一章正文',
    'utf8'
  )

  const books = await readBooksDir(booksDir)
  assert.equal(books.length, 1)
  assert.equal(books[0].folderName, '生命周期作品')
  assert.equal(books[0].chapterCount, 1)
  assert.equal(books[0].totalWords > 0, true)

  const conflict = await createBook({ id: 'conflict-book', name: '冲突作品' }, booksDir)
  assert.equal(conflict.success, true)
  const coverPath = join(booksDir, '生命周期作品', 'cover.png')
  const conflictRename = await editBook(
    { originalName: '生命周期作品', name: '冲突作品', coverUrl: null },
    booksDir
  )
  assert.equal(conflictRename.success, false)
  assert.match(conflictRename.message, /已存在同名书籍/)
  assert.equal(fs.existsSync(coverPath), true)

  const invalidCover = await editBook(
    {
      originalName: '生命周期作品',
      name: '生命周期作品',
      coverImagePath: `data:image/png;base64,${Buffer.from('invalid').toString('base64')}`
    },
    booksDir
  )
  assert.equal(invalidCover.success, false)
  assert.equal(fs.existsSync(coverPath), true)

  const missingSave = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '不存在',
      content: '内容'
    },
    booksDir
  )
  assert.equal(missingSave.success, false)
  assert.match(missingSave.message, /章节不存在/)

  const blockedEmptySave = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第1章',
      content: ''
    },
    booksDir
  )
  assert.equal(blockedEmptySave.success, false)
  assert.equal(
    fs.readFileSync(join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'), 'utf8'),
    '第一章正文'
  )

  await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '第二章正文'
    },
    booksDir
  )
  const renameConflict = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第1章',
      newName: '第2章',
      content: '不能写入'
    },
    booksDir
  )
  assert.equal(renameConflict.success, false)
  assert.equal(
    fs.readFileSync(join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'), 'utf8'),
    '第一章正文'
  )

  const duplicateUpsert = await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '不应覆盖'
    },
    booksDir
  )
  assert.equal(duplicateUpsert.success, false)
  assert.equal(duplicateUpsert.exists, true)

  const overwritten = await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '允许覆盖',
      overwrite: true
    },
    booksDir
  )
  assert.equal(overwritten.success, true)
  assert.equal(overwritten.exists, true)

  const autoChapter = await createChapter(
    { bookName: '生命周期作品', volumeId: '正文' },
    booksDir
  )
  assert.equal(autoChapter.success, true)
  assert.equal(autoChapter.chapterName, '第3章')

  const chapterTree = await loadChapters('生命周期作品', booksDir)
  assert.equal(chapterTree.success, true)
  assert.deepEqual(
    chapterTree.chapters[0].children.map((chapter) => chapter.name),
    ['第1章', '第2章', '第3章']
  )

  const chapter = await readChapter(
    { bookName: '生命周期作品', volumeName: '正文', chapterName: '第2章' },
    booksDir
  )
  assert.equal(chapter.success, true)
  assert.equal(chapter.content, '允许覆盖')

  assert.equal((await deleteBook('', booksDir)).success, false)
  const missingDelete = await deleteBook('不存在作品', booksDir)
  assert.equal(missingDelete.success, false)
  assert.equal(missingDelete.existed, false)
  const deleted = await deleteBook('生命周期作品', booksDir)
  assert.equal(deleted.success, true)
  assert.equal(fs.existsSync(join(booksDir, '生命周期作品')), false)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 书籍生命周期测试通过')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  checkChapterExists,
  createBook,
  deleteNote,
  editNode,
  readChapter,
  readNote,
  saveChapter,
  upsertChapter
} from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-path-security-'))
const booksDir = join(root, 'books')
const bookName = '测试作品'
const volumeName = '第一卷'
const chapterName = '第一章'
const bookPath = join(booksDir, bookName)
const volumePath = join(bookPath, '正文', volumeName)
const notebookPath = join(bookPath, '笔记', '随笔')
const outsideFile = join(root, 'outside.txt')

try {
  fs.mkdirSync(volumePath, { recursive: true })
  fs.mkdirSync(notebookPath, { recursive: true })
  fs.writeFileSync(join(volumePath, `${chapterName}.txt`), '原始正文', 'utf8')
  fs.writeFileSync(join(notebookPath, '记录.txt'), '原始笔记', 'utf8')
  fs.writeFileSync(outsideFile, '书库外内容', 'utf8')

  await assert.rejects(
    () => readChapter({ bookName: '..', volumeName, chapterName: 'outside' }, booksDir),
    /书籍名称无效/
  )
  await assert.rejects(
    () => readChapter({ bookName, volumeName: '..', chapterName: 'outside' }, booksDir),
    /路径名称/
  )
  await assert.rejects(
    () => saveChapter({ bookName, volumeName, chapterName, newName: '../outside', content: '覆盖' }, booksDir),
    /章节名称无效/
  )
  await assert.rejects(
    () => upsertChapter({ bookName, volumeName, chapterName: '../outside', content: '覆盖' }, booksDir),
    /章节名称无效/
  )
  await assert.rejects(
    () => checkChapterExists({ bookName, volumeName, chapterName: '../outside' }, booksDir),
    /章节名称无效/
  )
  const invalidRename = await editNode(
    { bookName, type: 'volume', volume: volumeName, newName: '..' },
    booksDir
  )
  assert.equal(invalidRename.success, false)
  assert.match(invalidRename.message, /路径名称/)
  await assert.rejects(
    () => readNote({ bookName, notebookName: '..', noteName: 'outside' }, booksDir),
    /路径名称/
  )
  await assert.rejects(
    () => deleteNote({ bookName, notebookName: '随笔', noteName: '../outside' }, booksDir),
    /笔记名称无效/
  )
  const invalidBook = await createBook({ name: '..' }, booksDir)
  assert.equal(invalidBook.success, false)
  assert.match(invalidBook.message, /书籍名称无效/)

  assert.equal(fs.readFileSync(outsideFile, 'utf8'), '书库外内容')
  assert.equal(fs.readFileSync(join(volumePath, `${chapterName}.txt`), 'utf8'), '原始正文')
  assert.equal(fs.readFileSync(join(notebookPath, '记录.txt'), 'utf8'), '原始笔记')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web books path security tests passed')

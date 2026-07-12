import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createBook } from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-book-create-safety-'))
const booksDir = join(root, 'books')

try {
  fs.mkdirSync(booksDir, { recursive: true })

  const created = await createBook(
    {
      id: 'existing-book',
      name: '已有作品',
      intro: '原始简介'
    },
    booksDir
  )
  assert.equal(created.success, true)

  const bookPath = join(booksDir, '已有作品')
  const metaPath = join(bookPath, 'mazi.json')
  const chapterPath = join(bookPath, '正文', '正文', '第1章.txt')
  fs.writeFileSync(chapterPath, '不能丢失的正文', 'utf8')
  const originalMeta = fs.readFileSync(metaPath, 'utf8')

  const duplicate = await createBook(
    {
      id: 'replacement-book',
      name: '已有作品',
      intro: '覆盖简介'
    },
    booksDir
  )
  assert.equal(duplicate.success, false)
  assert.equal(duplicate.existed, true)
  assert.match(duplicate.message, /已存在同名书籍/)
  assert.equal(fs.readFileSync(metaPath, 'utf8'), originalMeta)
  assert.equal(fs.readFileSync(chapterPath, 'utf8'), '不能丢失的正文')

  const concurrentResults = await Promise.all([
    createBook({ id: 'concurrent-a', name: '并发作品' }, booksDir),
    createBook({ id: 'concurrent-b', name: '并发作品' }, booksDir)
  ])
  assert.equal(concurrentResults.filter((result) => result.success).length, 1)
  assert.equal(
    concurrentResults.filter((result) => result.success === false && result.existed).length,
    1
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 作品创建安全测试通过')

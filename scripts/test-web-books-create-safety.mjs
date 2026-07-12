import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createBook } from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-book-create-safety-'))
const booksDir = join(root, 'books')
const originalFetch = globalThis.fetch

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

  const serverFile = join(root, 'server-secret.png')
  fs.writeFileSync(serverFile, '服务器私有内容', 'utf8')
  const localPathCover = await createBook(
    {
      id: 'local-path-cover',
      name: '本地路径封面',
      coverImagePath: serverFile
    },
    booksDir
  )
  assert.equal(localPathCover.success, false)
  assert.match(localPathCover.message, /必须通过网页上传/)
  assert.equal(fs.existsSync(join(booksDir, '本地路径封面')), false)

  const forgedCover = await createBook(
    {
      id: 'forged-cover',
      name: '伪造封面',
      coverImagePath: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`
    },
    booksDir
  )
  assert.equal(forgedCover.success, false)
  assert.match(forgedCover.message, /内容与格式不匹配/)
  assert.equal(fs.existsSync(join(booksDir, '伪造封面')), false)

  const pngBytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(32, 1)
  ])
  const uploadedCover = await createBook(
    {
      id: 'uploaded-cover',
      name: '网页上传封面',
      coverImagePath: `data:image/png;base64,${pngBytes.toString('base64')}`
    },
    booksDir
  )
  assert.equal(uploadedCover.success, true)
  assert.equal(fs.readFileSync(join(booksDir, '网页上传封面', 'cover.png')).equals(pngBytes), true)

  let receivedSignal = null
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal
    return new Response('', {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(11 * 1024 * 1024)
      }
    })
  }
  const oversizedRemote = await createBook(
    {
      id: 'remote-cover',
      name: '远程封面过大',
      coverRemoteUrl: 'https://images.example/cover.png'
    },
    booksDir
  )
  assert.equal(oversizedRemote.success, true)
  assert.equal(oversizedRemote.bookName, '远程封面过大')
  assert.match(oversizedRemote.coverWarning, /不能超过 10 MB/)
  assert.equal(receivedSignal instanceof AbortSignal, true)
  assert.equal(fs.existsSync(join(booksDir, '远程封面过大', 'cover.png')), false)
} finally {
  globalThis.fetch = originalFetch
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 作品创建安全测试通过')

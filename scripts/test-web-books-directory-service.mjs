import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { setWebBooksDirectory } from '../src/main/services/webBooksDirectoryService.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-books-dir-'))
const booksDir = join(root, 'books')
const otherDir = join(root, 'other')
const filePath = join(root, 'file.txt')
fs.mkdirSync(booksDir)
fs.mkdirSync(otherDir)
fs.writeFileSync(filePath, 'test')

const writes = []
const result = setWebBooksDirectory({
  requestedDir: booksDir,
  setStoreValue: (...args) => {
    writes.push(args)
    return true
  }
})
assert.equal(result.booksDir, fs.realpathSync(booksDir))
assert.equal(result.configurable, true)
assert.deepEqual(writes, [['booksDir', fs.realpathSync(booksDir)]])

const fixed = setWebBooksDirectory({
  requestedDir: booksDir,
  configuredDir: booksDir,
  setStoreValue: () => {
    throw new Error('固定目录不应写入设置')
  }
})
assert.equal(fixed.configurable, false)

assert.throws(
  () =>
    setWebBooksDirectory({
      requestedDir: otherDir,
      configuredDir: booksDir,
      setStoreValue: () => true
    }),
  (error) => error.statusCode === 409
)
assert.throws(
  () => setWebBooksDirectory({ requestedDir: '', setStoreValue: () => true }),
  (error) => error.statusCode === 400
)
assert.throws(
  () =>
    setWebBooksDirectory({
      requestedDir: join(root, 'missing'),
      setStoreValue: () => true
    }),
  (error) => error.statusCode === 404
)
assert.throws(
  () => setWebBooksDirectory({ requestedDir: filePath, setStoreValue: () => true }),
  (error) => error.statusCode === 400
)
assert.throws(
  () =>
    setWebBooksDirectory({
      requestedDir: booksDir,
      setStoreValue: () => false
    }),
  (error) => error.statusCode === 500
)

fs.rmSync(root, { recursive: true, force: true })
console.log('Web 书库目录服务测试通过')

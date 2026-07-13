import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import {
  createWebBooksPathService,
  inferWebBookNameFromPath,
  isPathInside,
  resolveBookPathForWebPayload
} from '../src/main/services/webBooksPathService.js'

const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-books-path-'))
const defaultDir = join(tempDir, 'default-books')
const storedDir = join(tempDir, 'stored-books')
const fixedDir = join(tempDir, 'fixed-books')
const siblingDir = `${storedDir}-backup`
const bookDir = join(storedDir, '长篇作品')
const dottedBookDir = join(storedDir, '..草稿')
const bookFile = join(storedDir, '不是目录.txt')

try {
  const defaultService = createWebBooksPathService({ defaultBooksDir: defaultDir })
  assert.equal(defaultService.getActiveBooksDir(), resolve(defaultDir))
  assert.equal(fs.statSync(defaultDir).isDirectory(), true)

  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(dottedBookDir)
  fs.mkdirSync(siblingDir)
  fs.writeFileSync(bookFile, 'test', 'utf8')

  const storedService = createWebBooksPathService({
    defaultBooksDir: defaultDir,
    getStoredBooksDir: () => storedDir
  })
  assert.equal(storedService.getActiveBooksDir(), resolve(storedDir))
  assert.equal(
    storedService.resolveBookPathForWebPayload({ bookName: '长篇作品' }, storedDir, {
      ensure: true
    }),
    resolve(bookDir)
  )
  assert.equal(
    storedService.resolveBookPathForWebPayload({ bookPath: bookDir }, storedDir),
    resolve(bookDir)
  )
  assert.equal(
    storedService.resolveBookPathForWebPayload({ bookName: '..草稿' }, storedDir),
    resolve(dottedBookDir)
  )

  const fixedService = createWebBooksPathService({
    configuredBooksDir: fixedDir,
    defaultBooksDir: defaultDir,
    getStoredBooksDir: () => storedDir
  })
  assert.equal(fixedService.getActiveBooksDir(), resolve(fixedDir))
  assert.equal(fs.statSync(fixedDir).isDirectory(), true)

  assert.equal(storedService.resolvePromptPresetPath(), resolve(storedDir))
  assert.equal(
    storedService.resolvePromptPresetPath({ bookPath: bookDir }),
    resolve(bookDir)
  )
  assert.equal(
    storedService.resolvePromptPresetPath({ bookPath: siblingDir }),
    resolve(storedDir)
  )

  assert.equal(isPathInside(storedDir, storedDir), true)
  assert.equal(isPathInside(storedDir, bookDir), true)
  assert.equal(isPathInside(storedDir, dottedBookDir), true)
  assert.equal(isPathInside(storedDir, siblingDir), false)
  assert.equal(isPathInside(storedDir, tempDir), false)
  assert.equal(inferWebBookNameFromPath(bookDir, storedDir), '长篇作品')

  assert.throws(
    () => resolveBookPathForWebPayload({}, storedDir),
    (error) => error.statusCode === 400
  )
  assert.throws(
    () => resolveBookPathForWebPayload({ bookName: '..' }, storedDir),
    (error) => error.statusCode === 403
  )
  assert.throws(
    () => resolveBookPathForWebPayload({ bookPath: siblingDir }, storedDir),
    (error) => error.statusCode === 403
  )
  assert.throws(
    () =>
      resolveBookPathForWebPayload({ bookName: '不存在' }, storedDir, {
        ensure: true
      }),
    (error) => error.statusCode === 404
  )
  assert.throws(
    () =>
      resolveBookPathForWebPayload({ bookPath: bookFile }, storedDir, {
        ensure: true
      }),
    (error) => error.statusCode === 404
  )
  assert.throws(
    () => inferWebBookNameFromPath(siblingDir, storedDir),
    (error) => error.statusCode === 403
  )
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('Web 书库路径服务测试通过')

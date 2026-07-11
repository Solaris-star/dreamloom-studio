import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { importBook } from '../src/main/services/importExportService.js'

function importPayload(bookName = '长夜灯火') {
  return {
    fileName: `${bookName}.txt`,
    bookName,
    textContent: ['第1章 初见', '风从窗外吹进来。', '', '第2章 再会', '灯火亮了起来。'].join(
      '\n'
    )
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-import-'))

try {
  const first = importBook(root, importPayload())
  assert.equal(first.success, true)
  assert.equal(first.bookName, '长夜灯火')
  assert.equal(first.chapterCount, 2)
  assert.equal(fs.existsSync(path.join(root, '长夜灯火', 'mazi.json')), true)
  assert.deepEqual(
    fs.readdirSync(path.join(root, '长夜灯火', '正文', '正文')).sort(),
    ['第1章 初见.txt', '第2章 再会.txt']
  )

  const duplicate = importBook(root, importPayload())
  assert.equal(duplicate.bookName, '长夜灯火_1')
  assert.equal(fs.existsSync(path.join(root, '长夜灯火_1', 'mazi.json')), true)

  const failedRoot = path.join(root, 'failed-library')
  fs.mkdirSync(path.join(failedRoot, '.import-export', 'tasks.json'), { recursive: true })
  assert.throws(() => importBook(failedRoot, importPayload('回滚测试')), /EISDIR|EPERM|directory/i)
  assert.equal(fs.existsSync(path.join(failedRoot, '回滚测试')), false)
  assert.deepEqual(
    fs
      .readdirSync(failedRoot)
      .filter((name) => name.startsWith('.importing-')),
    []
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('书籍导入事务测试通过')

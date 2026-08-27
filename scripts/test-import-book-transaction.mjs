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
  const first = await importBook(root, importPayload())
  assert.equal(first.success, true)
  assert.equal(first.bookName, '长夜灯火')
  assert.equal(first.chapterCount, 2)
  assert.equal(fs.existsSync(path.join(root, '长夜灯火', 'mazi.json')), true)
  assert.deepEqual(
    fs.readdirSync(path.join(root, '长夜灯火', '正文', '正文')).sort(),
    ['第1章 初见.txt', '第2章 再会.txt']
  )

  const duplicate = await importBook(root, importPayload())
  assert.equal(duplicate.bookName, '长夜灯火_1')
  assert.equal(fs.existsSync(path.join(root, '长夜灯火_1', 'mazi.json')), true)

  const prepared = await importBook(root, {
    fileName: '自定义标题.docx',
    format: 'docx',
    bookName: '自定义标题',
    chapters: [
      { title: '楔子', content: '这是楔子的正文。' },
      { title: '雨停以后', content: '这是下一章正文。' }
    ]
  })
  assert.equal(prepared.chapterCount, 2)
  assert.deepEqual(
    fs.readdirSync(path.join(root, '自定义标题', '正文', '正文')).sort(),
    ['楔子.txt', '雨停以后.txt']
  )
  await assert.rejects(() => importBook(root, { bookName: '空书', chapters: [] }),
    /导入章节不能为空/
  )
  await assert.rejects(() => importBook(root, { bookName: '坏正文', chapters: [{ title: '第一章', content: 1 }] }),
    /正文格式无效/
  )

  // PDF prepared 模式:format=pdf + chapters → 正常导入
  const pdfImport = await importBook(root, {
    fileName: '旧城故事.pdf',
    format: 'pdf',
    bookName: '旧城故事',
    chapters: [
      { title: '第1章 初见', content: '风从窗外吹进来。' },
      { title: '第2章 再会', content: '灯火亮了起来。' }
    ]
  })
  assert.equal(pdfImport.success, true)
  assert.equal(pdfImport.bookName, '旧城故事')
  assert.equal(pdfImport.chapterCount, 2)
  assert.equal(fs.existsSync(path.join(root, '旧城故事', 'mazi.json')), true)
  assert.deepEqual(
    fs.readdirSync(path.join(root, '旧城故事', '正文', '正文')).sort(),
    ['第1章 初见.txt', '第2章 再会.txt']
  )
  const pdfMeta = JSON.parse(fs.readFileSync(path.join(root, '旧城故事', 'mazi.json'), 'utf-8'))
  assert.ok(pdfMeta.intro.includes('旧城故事.pdf'))

  // prepared 格式白名单:未知 format 拒绝
  await assert.rejects(
    () => importBook(root, { fileName: 'x.xyz', format: 'xyz', bookName: '坏格式', chapters: [{ title: 'a', content: 'b' }] }),
    /导入格式无效/
  )

  // raw base64 PDF(无 chapters)→ 明确拒绝,要求浏览器端先解析
  await assert.rejects(
    () => importBook(root, { fileName: 'raw.pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64'), bookName: '原始PDF' }),
    /PDF 文件必须先在浏览器端解析为章节后再导入/
  )

  const failedRoot = path.join(root, 'failed-library')
  fs.mkdirSync(path.join(failedRoot, '.import-export', 'tasks.json'), { recursive: true })
  await assert.rejects(() => importBook(failedRoot, importPayload('回滚测试')), /EISDIR|EPERM|directory/i)
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

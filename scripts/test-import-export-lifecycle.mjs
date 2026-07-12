import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createBackup,
  exportBook,
  importBook,
  inspectBackup,
  listTasks,
  previewImport,
  restoreBackup
} from '../src/main/services/importExportService.js'

function createBook(booksDir, name, id = name) {
  const bookDir = join(booksDir, name)
  const chapterDir = join(bookDir, '正文', '第一卷')
  fs.mkdirSync(chapterDir, { recursive: true })
  fs.writeFileSync(
    join(bookDir, 'mazi.json'),
    JSON.stringify({ id, name, intro: `${name}简介` }),
    'utf8'
  )
  fs.writeFileSync(join(chapterDir, '第1章.txt'), '夜色落在窗前。', 'utf8')
  fs.writeFileSync(join(chapterDir, '第2章.txt'), '灯火沿街亮起。', 'utf8')
}

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-import-export-'))
const booksDir = join(root, 'books')

try {
  fs.mkdirSync(booksDir, { recursive: true })
  createBook(booksDir, '长夜灯火', 'book-1')

  const textPreview = previewImport(booksDir, {
    fileName: '归途.txt',
    textContent: '第1章 出发\n风吹过站台。\n\n第2章 抵达\n天色已经亮了。'
  })
  assert.equal(textPreview.preview.bookName, '归途')
  assert.equal(textPreview.preview.chapterCount, 2)

  const markdownPreview = previewImport(booksDir, {
    fileName: '远山.md',
    base64: Buffer.from('# 远山\n\n## 第一卷\n\n### 第1章 云起\n\n山中起雾。').toString(
      'base64'
    )
  })
  assert.equal(markdownPreview.preview.format, 'md')
  assert.equal(markdownPreview.preview.bookName, '远山')
  assert.equal(markdownPreview.preview.chapterCount, 1)

  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('第1章 雨夜\n雨落在屋檐上。', 'utf16le')
  ])
  assert.equal(
    previewImport(booksDir, {
      fileName: '雨夜.txt',
      base64: utf16.toString('base64')
    }).preview.chapterCount,
    1
  )

  const secretFile = join(root, 'server-secret.txt')
  fs.writeFileSync(secretFile, '不应被读取', 'utf8')
  assert.throws(
    () => previewImport(booksDir, { sourcePath: secretFile, fileName: 'secret.txt' }),
    /不能读取服务器本地路径/
  )
  assert.throws(
    () =>
      inspectBackup(booksDir, {
        sourcePath: secretFile,
        fileName: 'backup.zip'
      }),
    /不能读取服务器本地路径/
  )
  assert.throws(
    () =>
      previewImport(booksDir, {
        fileName: '损坏.docx',
        base64: Buffer.from('not-a-docx').toString('base64')
      }),
    /DOCX|ZIP/
  )
  assert.throws(
    () =>
      previewImport(booksDir, {
        fileName: '非法.txt',
        base64: '这不是base64'
      }),
    /Base64/
  )
  assert.throws(
    () =>
      previewImport(booksDir, {
        fileName: '空文件.txt',
        base64: ''
      }),
    /缺少导入文件内容|内容为空/
  )
  assert.throws(
    () =>
      previewImport(booksDir, {
        fileName: '超大.txt',
        base64: Buffer.alloc(50 * 1024 * 1024 + 1).toString('base64')
      }),
    /不能超过 50 MB/
  )

  const txtExport = exportBook(booksDir, { bookName: '长夜灯火', format: 'txt' })
  assert.match(txtExport.content, /第1章/)
  assert.match(txtExport.content, /灯火沿街亮起/)
  assert.equal(fs.existsSync(txtExport.filePath), true)

  const markdownExport = exportBook(booksDir, { bookName: '长夜灯火', format: 'md' })
  assert.match(markdownExport.content, /^# 长夜灯火/)
  assert.match(markdownExport.content, /### 第2章/)

  const projectExport = exportBook(booksDir, {
    bookName: '长夜灯火',
    format: 'project'
  })
  assert.equal(projectExport.mimeType, 'application/zip')
  assert.equal(Buffer.from(projectExport.downloadBase64, 'base64').length > 0, true)

  const bookBackup = createBackup(booksDir, {
    scope: 'book',
    bookName: '长夜灯火'
  })
  const inspectedBook = inspectBackup(booksDir, {
    fileName: bookBackup.fileName,
    base64: bookBackup.downloadBase64
  })
  assert.equal(inspectedBook.summary.bookCount, 1)
  assert.equal(inspectedBook.summary.books[0].name, '长夜灯火')

  const restoredBook = restoreBackup(booksDir, {
    fileName: bookBackup.fileName,
    base64: bookBackup.downloadBase64,
    restoreMode: 'library'
  })
  assert.equal(restoredBook.mode, 'library')
  assert.equal(restoredBook.restoredBooks[0].bookName, '长夜灯火_1')
  assert.notEqual(
    JSON.parse(
      fs.readFileSync(join(booksDir, '长夜灯火_1', 'mazi.json'), 'utf8')
    ).id,
    'book-1'
  )

  const libraryBackup = createBackup(booksDir)
  const archiveDir = join(root, 'restored-archive')
  const restoredArchive = restoreBackup(booksDir, {
    fileName: libraryBackup.fileName,
    base64: libraryBackup.downloadBase64,
    restoreMode: 'archive',
    targetDir: archiveDir
  })
  assert.equal(restoredArchive.mode, 'archive')
  assert.equal(fs.existsSync(join(archiveDir, '长夜灯火', 'mazi.json')), true)

  assert.throws(
    () =>
      restoreBackup(booksDir, {
        fileName: libraryBackup.fileName,
        base64: libraryBackup.downloadBase64,
        restoreMode: 'archive',
        targetDir: booksDir
      }),
    /不能覆盖当前书库目录/
  )
  assert.throws(
    () =>
      restoreBackup(booksDir, {
        fileName: libraryBackup.fileName,
        base64: libraryBackup.downloadBase64,
        restoreMode: 'archive',
        targetDir: join(booksDir, '长夜灯火', '恢复')
      }),
    /不能写入当前书库正文区域/
  )
  const occupiedDir = join(root, 'occupied')
  fs.mkdirSync(occupiedDir)
  fs.writeFileSync(join(occupiedDir, 'keep.txt'), '保留', 'utf8')
  assert.throws(
    () =>
      restoreBackup(booksDir, {
        fileName: libraryBackup.fileName,
        base64: libraryBackup.downloadBase64,
        restoreMode: 'archive',
        targetDir: occupiedDir
      }),
    /不是空目录/
  )

  assert.throws(
    () =>
      inspectBackup(booksDir, {
        fileName: 'broken.zip',
        base64: Buffer.from('broken').toString('base64')
      }),
    /ZIP/
  )
  assert.equal(listTasks(booksDir).items.length >= 7, true)

  const brokenTasksDir = join(root, 'broken-tasks')
  fs.mkdirSync(join(brokenTasksDir, '.import-export'), { recursive: true })
  const brokenTasksFile = join(brokenTasksDir, '.import-export', 'tasks.json')
  fs.writeFileSync(brokenTasksFile, '{broken', 'utf8')
  assert.throws(() => listTasks(brokenTasksDir), /任务记录读取失败/)
  assert.equal(fs.readFileSync(brokenTasksFile, 'utf8'), '{broken')

  const imported = importBook(booksDir, {
    fileName: '新书.txt',
    bookName: '新书',
    textContent: '第1章 开始\n这是正文。'
  })
  assert.equal(imported.success, true)
  assert.equal(fs.existsSync(join(booksDir, '新书', 'mazi.json')), true)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('导入导出生命周期测试通过')

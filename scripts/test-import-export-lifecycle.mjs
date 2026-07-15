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

function createStoredZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const [name, value] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const data = Buffer.from(value)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(local, nameBuffer, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBuffer)
    offset += local.length + nameBuffer.length + data.length
  }

  const localData = Buffer.concat(localParts)
  const centralData = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralData.length, 12)
  end.writeUInt32LE(localData.length, 16)
  return Buffer.concat([localData, centralData, end])
}

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-import-export-'))
const booksDir = join(root, 'books')

try {
  fs.mkdirSync(booksDir, { recursive: true })
  createBook(booksDir, '长夜灯火', 'book-1')

  const textPreview = await previewImport(booksDir, {
    fileName: '归途.txt',
    textContent: '第1章 出发\n风吹过站台。\n\n第2章 抵达\n天色已经亮了。'
  })
  assert.equal(textPreview.preview.bookName, '归途')
  assert.equal(textPreview.preview.chapterCount, 2)

  const markdownPreview = await previewImport(booksDir, {
    fileName: '远山.md',
    base64: Buffer.from('# 远山\n\n## 第一卷\n\n### 第1章 云起\n\n山中起雾。').toString(
      'base64'
    )
  })
  assert.equal(markdownPreview.preview.format, 'md')
  assert.equal(markdownPreview.preview.bookName, '远山')
  assert.equal(markdownPreview.preview.chapterCount, 1)

  const plainPreview = await previewImport(booksDir, {
    fileName: '无标题正文.txt',
    textContent: '雨停以后，街边的灯一盏接一盏亮起。'
  })
  assert.equal(plainPreview.preview.bookName, '雨停以后，街边的灯一盏接一盏亮起。')
  assert.equal(plainPreview.preview.chapterCount, 1)
  assert.equal(plainPreview.preview.chapters[0].title, '第1章')

  const namedPreview = await previewImport(booksDir, {
    fileName: '草稿.txt',
    textContent: '书名：远行者\n第1章 启程\n列车驶出站台。'
  })
  assert.equal(namedPreview.preview.bookName, '远行者')
  assert.equal(namedPreview.preview.chapters[0].preview, '列车驶出站台。')

  const bracketedPreview = await previewImport(booksDir, {
    fileName: '未命名.txt',
    textContent: '《北风来信》\n第1章 来信\n信纸被风吹动。'
  })
  assert.equal(bracketedPreview.preview.bookName, '北风来信')
  assert.equal(bracketedPreview.preview.chapters[0].preview, '信纸被风吹动。')

  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('第1章 雨夜\n雨落在屋檐上。', 'utf16le')
  ])
  assert.equal(
    (await previewImport(booksDir, {
      fileName: '雨夜.txt',
      base64: utf16.toString('base64')
    })).preview.chapterCount,
    1
  )

  const utf8Bom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('第1章 清晨\n晨光落在桌面。')
  ])
  assert.equal(
    (await previewImport(booksDir, {
      fileName: '清晨.txt',
      dataUrl: `data:text/plain;base64,${utf8Bom.toString('base64')}`
    })).preview.chapterCount,
    1
  )

  const docx = createStoredZip({
    'word/document.xml':
      '<w:document><w:body><w:p><w:r><w:t>第1章 相逢</w:t></w:r></w:p><w:p><w:r><w:t>甲&lt;乙&gt;&amp;&quot;丙&quot;&apos;丁&apos;</w:t></w:r><w:tab/><w:br/></w:p></w:body></w:document>'
  })
  const docxPreview = await previewImport(booksDir, {
    fileName: '相逢.docx',
    base64: docx.toString('base64')
  })
  assert.equal(docxPreview.preview.format, 'docx')
  assert.equal(docxPreview.preview.chapterCount, 1)
  assert.match(docxPreview.preview.chapters[0].preview, /甲<乙>&"丙"'丁'/)

  assert.throws(() => previewImport(booksDir, {
        fileName: '缺正文.docx',
        base64: createStoredZip({ '[Content_Types].xml': '<Types />' }).toString('base64')
      }),
    /word\/document\.xml/
  )

  const secretFile = join(root, 'server-secret.txt')
  fs.writeFileSync(secretFile, '不应被读取', 'utf8')
  assert.throws(() => previewImport(booksDir, { sourcePath: secretFile, fileName: 'secret.txt' }),
    /不能读取服务器本地路径/
  )
  assert.throws(() => inspectBackup(booksDir, {
        sourcePath: secretFile,
        fileName: 'backup.zip'
      }),
    /不能读取服务器本地路径/
  )
  assert.throws(() => previewImport(booksDir, {
        fileName: '损坏.docx',
        base64: Buffer.from('not-a-docx').toString('base64')
      }),
    /DOCX|ZIP/
  )
  assert.throws(() => previewImport(booksDir, {
        fileName: '非法.txt',
        base64: '这不是base64'
      }),
    /Base64/
  )
  assert.throws(() => previewImport(booksDir, {
        fileName: '空文件.txt',
        base64: ''
      }),
    /缺少导入文件内容|内容为空/
  )
  assert.throws(() => previewImport(booksDir, {
        fileName: '超大.txt',
        base64: Buffer.alloc(50 * 1024 * 1024 + 1).toString('base64')
      }),
    /不能超过 50 MB/
  )
  assert.throws(() => previewImport(booksDir, { fileName: '空文本.txt', textContent: '' }),
    /内容为空/
  )
  assert.throws(() => previewImport(booksDir, {
        fileName: '未知.bin',
        format: 'epub',
        base64: Buffer.from('content').toString('base64')
      }),
    /仅支持 TXT、Markdown 和 DOCX/
  )
  assert.throws(() => previewImport(booksDir, { chapters: [] }),
    /导入章节不能为空/
  )
  assert.throws(() => previewImport(booksDir, { chapters: [null] }),
    /第 1 章格式无效/
  )
  assert.throws(() => previewImport(booksDir, { chapters: [{ title: '第一章', content: 1 }] }),
    /第 1 章正文格式无效/
  )
  const preparedPreview = await previewImport(booksDir, {
    fileName: '整理稿.markdown',
    format: 'markdown',
    bookName: '整理/稿',
    chapters: [
      { title: '', content: '中文 English 123' },
      { title: '第二章:重逢', content: '' }
    ]
  })
  assert.equal(preparedPreview.preview.format, 'md')
  assert.equal(preparedPreview.preview.bookName, '整理_稿')
  assert.deepEqual(
    preparedPreview.preview.chapters.map((chapter) => chapter.title),
    ['第1章', '第二章_重逢']
  )
  assert.equal(preparedPreview.preview.wordCount, 4)

  const txtExport = await exportBook(booksDir, { bookName: '长夜灯火', format: 'txt' })
  assert.match(txtExport.content, /第1章/)
  assert.match(txtExport.content, /灯火沿街亮起/)
  assert.equal(fs.existsSync(txtExport.filePath), true)

  const markdownExport = await exportBook(booksDir, { bookName: '长夜灯火', format: 'md' })
  assert.match(markdownExport.content, /^# 长夜灯火/)
  assert.match(markdownExport.content, /### 第2章/)

  const projectExport = await exportBook(booksDir, {
    bookName: '长夜灯火',
    format: 'project'
  })
  assert.equal(projectExport.mimeType, 'application/zip')
  assert.equal(Buffer.from(projectExport.downloadBase64, 'base64').length > 0, true)
  const duplicateExport = await exportBook(booksDir, { bookName: '长夜灯火', format: 'txt' })
  assert.notEqual(duplicateExport.filePath, txtExport.filePath)
  assert.match(duplicateExport.fileName, /_1\.txt$/)
  await assert.rejects(() => exportBook(booksDir, { bookName: '不存在的书', format: 'txt' }),
    /未找到书籍/
  )

  const bookBackup = await createBackup(booksDir, {
    scope: 'book',
    bookName: '长夜灯火'
  })
  const inspectedBook = await inspectBackup(booksDir, {
    fileName: bookBackup.fileName,
    base64: bookBackup.downloadBase64
  })
  assert.equal(inspectedBook.summary.bookCount, 1)
  assert.equal(inspectedBook.summary.books[0].name, '长夜灯火')

  const restoredBook = await restoreBackup(booksDir, {
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

  const libraryBackup = await createBackup(booksDir)
  const archiveDir = join(root, 'restored-archive')
  const restoredArchive = await restoreBackup(booksDir, {
    fileName: libraryBackup.fileName,
    base64: libraryBackup.downloadBase64,
    restoreMode: 'archive',
    targetDir: archiveDir
  })
  assert.equal(restoredArchive.mode, 'archive')
  assert.equal(fs.existsSync(join(archiveDir, '长夜灯火', 'mazi.json')), true)

  const rootBookZip = createStoredZip({
    'mazi.json': JSON.stringify({ id: 'root-book', name: '根目录作品' }),
    '正文/第一卷/第1章.txt': '根目录正文'
  })
  const rootBookRestore = await restoreBackup(booksDir, {
    fileName: 'root-book.zip',
    base64: rootBookZip.toString('base64'),
    restoreMode: 'current'
  })
  assert.equal(rootBookRestore.restoredBooks[0].bookName, '根目录作品')

  const invalidMetaZip = createStoredZip({
    '损坏作品/mazi.json': '{broken',
    '损坏作品/正文/第一卷/第1章.txt': '仍可恢复的正文'
  })
  const invalidMetaInspection = await inspectBackup(booksDir, {
    fileName: 'invalid-meta.zip',
    base64: invalidMetaZip.toString('base64')
  })
  assert.equal(invalidMetaInspection.summary.books[0].name, '损坏作品')

  const arrayMetaZip = createStoredZip({
    '数组元数据/mazi.json': '[]',
    '数组元数据/正文/第一卷/第1章.txt': '数组元数据正文'
  })
  const defaultRestore = await restoreBackup(booksDir, {
    fileName: 'array-meta.zip',
    base64: arrayMetaZip.toString('base64')
  })
  assert.equal(defaultRestore.mode, 'library')
  assert.equal(defaultRestore.restoredBooks[0].bookName, '数组元数据')

  const bookshelfRestore = await restoreBackup(booksDir, {
    fileName: 'root-book-copy.zip',
    base64: rootBookZip.toString('base64'),
    mode: 'bookshelf'
  })
  assert.equal(bookshelfRestore.mode, 'library')
  assert.equal(bookshelfRestore.restoredBooks[0].bookName, '根目录作品_1')

  assert.throws(() => inspectBackup(booksDir, {
        fileName: 'empty.zip',
        base64: createStoredZip({}).toString('base64')
      }),
    /备份包为空/
  )
  assert.throws(() => inspectBackup(booksDir, {
        fileName: 'no-meta.zip',
        base64: createStoredZip({ 'readme.txt': '没有元数据' }).toString('base64')
      }),
    /未找到 mazi\.json/
  )
  assert.throws(() => inspectBackup(booksDir, {
        fileName: 'unsafe.zip',
        base64: createStoredZip({
          '../mazi.json': JSON.stringify({ name: '越界作品' })
        }).toString('base64')
      }),
    /不安全路径/
  )

  await assert.rejects(() => restoreBackup(booksDir, {
        fileName: libraryBackup.fileName,
        base64: libraryBackup.downloadBase64,
        restoreMode: 'archive',
        targetDir: booksDir
      }),
    /不能覆盖当前书库目录/
  )
  await assert.rejects(() => restoreBackup(booksDir, {
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
  await assert.rejects(() => restoreBackup(booksDir, {
        fileName: libraryBackup.fileName,
        base64: libraryBackup.downloadBase64,
        restoreMode: 'archive',
        targetDir: occupiedDir
      }),
    /不是空目录/
  )

  assert.throws(() => inspectBackup(booksDir, {
        fileName: 'broken.zip',
        base64: Buffer.from('broken').toString('base64')
      }),
    /ZIP/
  )
  assert.equal((await listTasks(booksDir)).items.length >= 7, true)

  const brokenTasksDir = join(root, 'broken-tasks')
  fs.mkdirSync(join(brokenTasksDir, '.import-export'), { recursive: true })
  const brokenTasksFile = join(brokenTasksDir, '.import-export', 'tasks.json')
  fs.writeFileSync(brokenTasksFile, '{broken', 'utf8')
  assert.throws(() => listTasks(brokenTasksDir), /任务记录读取失败/)
  assert.equal(fs.readFileSync(brokenTasksFile, 'utf8'), '{broken')
  fs.writeFileSync(brokenTasksFile, JSON.stringify({ items: [] }), 'utf8')
  assert.throws(() => listTasks(brokenTasksDir), /任务记录格式异常/)
  fs.writeFileSync(brokenTasksFile, JSON.stringify([null, { id: 'task-1' }]), 'utf8')
  assert.deepEqual((await listTasks(brokenTasksDir)).items, [{ id: 'task-1' }])

  const imported = await importBook(booksDir, {
    fileName: '新书.txt',
    bookName: '新书',
    textContent: '第1章 开始\n这是正文。'
  })
  assert.equal(imported.success, true)
  assert.equal(fs.existsSync(join(booksDir, '新书', 'mazi.json')), true)
  const duplicateImport = await importBook(booksDir, {
    fileName: '新书.txt',
    bookName: '新书',
    textContent: '第1章 再开始\n这是另一份正文。'
  })
  assert.equal(duplicateImport.bookName, '新书_1')

  const emptyLibrary = join(root, 'empty-library')
  fs.mkdirSync(emptyLibrary)
  await assert.rejects(() => createBackup(emptyLibrary), /没有可备份的文件/)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('导入导出生命周期测试通过')

import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  MAX_LOCAL_BOOK_FILE_SIZE,
  makeUniqueChapterTitle,
  parseLocalBookFile,
  parseLocalBookText,
  sanitizeChapterTitle,
  summarizeLocalBookImportResults,
  uniqueLocalBookName
} from '../src/renderer/src/service/localBookImport.js'

const txtBook = parseLocalBookText(
  ['第1章 初见', '风从窗外吹进来。', '', '第2章 再会', '灯火亮了起来。'].join('\n'),
  { fileName: '旧城故事.txt', extension: 'txt' }
)

assert.equal(txtBook.title, '旧城故事')
assert.equal(txtBook.chapterCount, 2)
assert.deepEqual(
  txtBook.chapters.map((chapter) => chapter.title),
  ['第1章 初见', '第2章 再会']
)
assert.equal(txtBook.totalWords, 15)
assert.equal(txtBook.encoding, 'UTF-8')
assert.equal(txtBook.chapters[0].wordCount, 8)

const markdownBook = parseLocalBookText(
  [
    '# 风灯手记',
    '',
    '## Chapter 1',
    '**Hello** [reader](https://example.com)',
    '',
    '## Chapter 2',
    '- first item'
  ].join('\n'),
  { fileName: 'fallback.md', extension: 'md' }
)

assert.equal(markdownBook.title, '风灯手记')
assert.equal(markdownBook.chapterCount, 2)
assert.deepEqual(
  markdownBook.chapters.map((chapter) => chapter.title),
  ['Chapter 1', 'Chapter 2']
)
assert.equal(markdownBook.chapters[0].content, 'Hello reader')
assert.equal(markdownBook.chapters[1].content, 'first item')

const plainBook = parseLocalBookText('只有正文，没有章节标题。', {
  fileName: '随笔.txt',
  extension: 'txt'
})

assert.equal(plainBook.chapterCount, 1)
assert.equal(plainBook.chapters[0].title, '正文')
assert.equal(plainBook.chapters[0].content, '只有正文，没有章节标题。')

assert.equal(sanitizeChapterTitle('第1章: A/B?'), '第1章_ A_B_')
assert.equal(uniqueLocalBookName('A/B', [{ name: 'A_B' }]), 'A_B_2')

const usedChapterTitles = new Set()
assert.equal(makeUniqueChapterTitle('正文', usedChapterTitles, '第1章'), '正文')
assert.equal(makeUniqueChapterTitle('正文', usedChapterTitles, '第2章'), '正文_2')
assert.deepEqual(
  summarizeLocalBookImportResults([
    { success: true },
    { success: false },
    { success: true },
    null
  ]),
  { success: 2, failed: 2 }
)
assert.deepEqual(summarizeLocalBookImportResults(), { success: 0, failed: 0 })

const validDocx = new JSZip()
validDocx.file(
  '[Content_Types].xml',
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
)
validDocx.folder('_rels').file(
  '.rels',
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
)
validDocx.folder('word').file(
  'document.xml',
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第1章 雨夜</w:t></w:r></w:p><w:p><w:r><w:t>林舟推开旧书铺的门。</w:t></w:r></w:p><w:p><w:r><w:t>第2章 来信</w:t></w:r></w:p><w:p><w:r><w:t>柜台上放着一封信。</w:t></w:r></w:p></w:body></w:document>'
)
validDocx.folder('word').folder('_rels').file(
  'document.xml.rels',
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
)
const validDocxBuffer = await validDocx.generateAsync({ type: 'arraybuffer' })
const parsedDocx = await parseLocalBookFile({
  name: '旧书铺.docx',
  size: validDocxBuffer.byteLength,
  arrayBuffer: async () => validDocxBuffer
})
assert.equal(parsedDocx.title, '旧书铺')
assert.equal(parsedDocx.extension, 'docx')
assert.equal(parsedDocx.fileSize, validDocxBuffer.byteLength)
assert.equal(parsedDocx.encoding, 'DOCX')
assert.deepEqual(parsedDocx.warnings, [])
assert.equal(parsedDocx.chapterCount, 2)
assert.deepEqual(
  parsedDocx.chapters.map((chapter) => chapter.title),
  ['第1章 雨夜', '第2章 来信']
)
assert.equal(parsedDocx.chapters[0].content, '林舟推开旧书铺的门。')
assert.equal(parsedDocx.chapters[0].wordCount, 10)

const gbText = new TextEncoder().encode('第1章 编码\n正文')
const parsedTextFile = await parseLocalBookFile({
  name: '编码.txt',
  size: gbText.byteLength,
  arrayBuffer: async () => gbText.buffer
})
assert.equal(parsedTextFile.encoding, 'UTF-8')
assert.equal(parsedTextFile.fileSize, gbText.byteLength)

await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '伪装文档.docx',
      size: 8,
      arrayBuffer: async () => new TextEncoder().encode('not docx').buffer
    }),
  /DOCX 文件内容损坏/
)

const missingDocument = new JSZip()
missingDocument.file('[Content_Types].xml', '<Types />')
const missingDocumentBuffer = await missingDocument.generateAsync({ type: 'arraybuffer' })
await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '缺少正文.docx',
      size: missingDocumentBuffer.byteLength,
      arrayBuffer: async () => missingDocumentBuffer
    }),
  /DOCX 文件无法解析/
)

await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '边界.txt',
      size: MAX_LOCAL_BOOK_FILE_SIZE,
      arrayBuffer: async () => new ArrayBuffer(0)
    }),
  /文件正文为空/
)

await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '过大文档.txt',
      size: MAX_LOCAL_BOOK_FILE_SIZE + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    }),
  /文件超过 50 MB/
)

await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '空文档.docx',
      size: 4,
      arrayBuffer: async () => Uint8Array.from([0x50, 0x4b, 0x05, 0x06]).buffer
    }),
  /DOCX 文件无法解析|文件正文为空/
)

console.log('local book import parser tests passed')

import assert from 'node:assert/strict'

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

await assert.rejects(
  () =>
    parseLocalBookFile({
      name: '伪装文档.docx',
      size: 8,
      arrayBuffer: async () => new TextEncoder().encode('not docx').buffer
    }),
  /DOCX 文件内容损坏/
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

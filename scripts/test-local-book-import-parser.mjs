import assert from 'node:assert/strict'

import {
  makeUniqueChapterTitle,
  parseLocalBookText,
  sanitizeChapterTitle,
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

console.log('local book import parser tests passed')

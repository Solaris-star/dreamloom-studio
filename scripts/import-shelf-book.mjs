#!/usr/bin/env node
/**
 * 导入本地小说到 Dreamloom 书架（复用 importBook 事务导入）
 * 用法: node scripts/import-shelf-book.mjs <源文件> [--书名 自定义书名]
 *
 * 清洗策略（针对 599txt 等下载站的 TXT）：
 *  1. 去 BOM、去站点广告行
 *  2. 裁掉头部《书名》作者/简介引导段（从第一个「第N章」标题行起）
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { importBook } = await import('../src/main/services/importExportService.js')

const sourceFile = process.argv[2]
if (!sourceFile || !fs.existsSync(sourceFile)) {
  console.error('用法: node scripts/import-shelf-book.mjs <source.txt> [--书名 自定义书名]')
  process.exit(1)
}
const bookNameArg = process.argv.indexOf('--书名') >= 0 ? process.argv[process.argv.indexOf('--书名') + 1] : ''

const lines = fs.readFileSync(sourceFile, 'utf-8')
  .replace(/^\uFEFF/, '')          // 去 BOM
  .replace(/\r\n?/g, '\n')         // 统一换行
  .split('\n')

// 1. 去站点广告行
const adKeywords = ['599txt', '推荐一个小说下载必备网址', '每天更新，喜欢的去看看']
const body = lines.filter((line) => !adKeywords.some((kw) => line.includes(kw)))

// 2. 裁头部引导段：从第一个章节标题行起
const chapterStart = body.findIndex((line) => /^第\s*[0-9０-９零一二三四五六七八九十百千万两]+[章回节卷集部]/.test(line.trim()))
const text = (chapterStart > 0 ? body.slice(chapterStart) : body).join('\n').trim()
const fileName = sourceFile.split('/').pop()

const booksDir = process.env.NOVEL_BOOKS_DIR || '/tmp/dreamloom-load-books'
fs.mkdirSync(booksDir, { recursive: true })

const input = { fileName, textContent: text }
if (bookNameArg) input.bookName = bookNameArg

console.log(`📖 导入: ${fileName} (${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} MB) -> ${booksDir}`)
const t0 = Date.now()
const result = await importBook(booksDir, input)
const spent = ((Date.now() - t0) / 1000).toFixed(1)
console.log(JSON.stringify({
  success: result.success,
  bookName: result.bookName,
  chapterCount: result.chapterCount,
  wordCount: result.wordCount,
  spentSec: spent,
  path: result.bookPath,
  taskId: result.task?.id || ''
}, null, 2))
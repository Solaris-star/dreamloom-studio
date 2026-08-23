/**
 * 回归测试：saveChapter 重命名（newName）时必须保留正问内容。
 *
 * 背景：`saveChapter` 旧逻辑 `content === undefined ? '' : String(content)`
 *      导致「仅重命名」场景（UI 或调用方没传 content）将章节正文清空。
 *      isClearingExistingChapter 保护条件 `!String(newName || '').trim()`
 *      在 newName 非空时不生效，因此重命名时丢数据。
 *
 * 本修复：isRenameOnly = 有 newName 且 content 未传入时，
 *        以原内容作为 nextContent，同时在计算清空保护时跳过rename模式。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { saveChapter, createChapter } = await import('../src/main/services/webBooksApi.js')

const booksDir = mkdtempSync(join(tmpdir(), 'dreamloom-savechapter-test-'))
const bookName = '演示书'
const volumeName = '正文'

mkdirSync(join(booksDir, bookName, '正文', volumeName), { recursive: true })

// 手动预置一个章节
const chapter1Path = join(booksDir, bookName, '正文', volumeName, '第1章.txt')
writeFileSync(chapter1Path, '暮色下沉，洛河以北的黑石城压进一片铁灰。', 'utf-8')

// ── 用例 1：仅重命名（不传 content）必须保留原文 ─────────────────
const renameOnly = await saveChapter(
  {
    bookName,
    volumeName,
    chapterName: '第1章',
    newName: '第1章 星陨之夜'
    // 故意不传 content：模拟 UI 层只改标题的场景
  },
  booksDir
)
assert.equal(renameOnly.success, true, JSON.stringify(renameOnly))
const renamedPath = join(booksDir, bookName, '正文', volumeName, '第1章 星陨之夜.txt')
assert.equal(existsSync(renamedPath), true, '重命名后章节文件必须存在')
assert.equal(
  readFileSync(renamedPath, 'utf-8'),
  '暮色下沉，洛河以北的黑石城压进一片铁灰。',
  '仅重命名不得清空章节正文'
)

// ── 用例 2：重命名 + 同时保存内容（content 明传） ────────────────
const renameWithContent = await saveChapter(
  {
    bookName,
    volumeName,
    chapterName: '第1章 星陨之夜',
    newName: '第1章 星陨之殇',
    content: '第二天，沈墨从梦中惊醒。'
  },
  booksDir
)
assert.equal(renameWithContent.success, true)
const finalPath = join(booksDir, bookName, '正文', volumeName, '第1章 星陨之殇.txt')
assert.equal(readFileSync(finalPath, 'utf-8'), '第二天，沈墨从梦中惊醒。')

// ── 用例 3：仅重命名同各（不能产生新文件） ───────────────────────
const sameName = await saveChapter(
  {
    bookName,
    volumeName,
    chapterName: '第1章 星陨之殇',
    newName: '第1章 星陨之殇',
    content: undefined
  },
  booksDir
)
assert.equal(sameName.success, true)
assert.equal(
  readFileSync(finalPath, 'utf-8'),
  '第二天，沈墨从梦中惊醒。',
  '同各重命名也必须保留原文'
)

// ── 用例 4：未传 newName 且 content='' 不能清空已有正文（原有保护） ──
const clearBlocked = await saveChapter(
  {
    bookName,
    volumeName,
    chapterName: '第1章 星陨之殇',
    content: ''
  },
  booksDir
)
assert.equal(clearBlocked.success, false, '空内容覆盖必须被拦截')
assert.match(clearBlocked.message || '', /空内容/)
assert.equal(
  readFileSync(finalPath, 'utf-8'),
  '第二天，沈墨从梦中惊醒。',
  '被拦截后正文必须未被修改'
)

// ── 用例 5：rename 到已存在的名称应报错 ──────────────────────────
writeFileSync(
  join(booksDir, bookName, '正文', volumeName, '第2章.txt'),
  '第二章内容',
  'utf-8'
)
const conflict = await saveChapter(
  {
    bookName,
    volumeName,
    chapterName: '第1章 星陨之殇',
    newName: '第2章'
  },
  booksDir
)
assert.equal(conflict.success, false)
assert.match(conflict.message || '', /已存在/)

console.log('saveChapter 重命名保留正文测试通过')

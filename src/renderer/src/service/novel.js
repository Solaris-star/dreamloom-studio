import { postJson } from './webHttpClient.js'

function requirePlainObject(result, fallback) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return result
}

function requireNovelSourceRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('读取小说书源失败：书源格式不正确')
  }
  if (
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    typeof row.name !== 'string' ||
    !row.name.trim()
  ) {
    throw new Error('读取小说书源失败：书源格式不正确')
  }
  return {
    ...row,
    id: row.id.trim(),
    name: row.name.trim()
  }
}

function requireNovelSourcesResult(result) {
  const list = Array.isArray(result) ? result : result?.sources
  if (!Array.isArray(list)) {
    throw new Error('读取小说书源失败：接口返回格式不正确')
  }
  return list.map((row) => requireNovelSourceRow(row))
}

function requireNovelSearchResult(result) {
  const output = requirePlainObject(result, '搜索失败')
  if (output.success !== true) {
    throw new Error(result?.message || '搜索失败')
  }
  if (!Array.isArray(output.list)) {
    throw new Error('搜索失败：接口返回格式不正确')
  }
  if (output.sourceErrors != null && !Array.isArray(output.sourceErrors)) {
    throw new Error('搜索失败：接口返回格式不正确')
  }
  return {
    ...output,
    sourceErrors: output.sourceErrors || []
  }
}

function requireNovelChapterListResult(result, fallback = '读取章节目录失败') {
  const output = requirePlainObject(result, fallback)
  if (output.success !== true) {
    throw new Error(output?.message || output?.error || fallback)
  }
  if (!Array.isArray(output.chapters)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return output
}

function requireNovelBookInfoResult(result, fallback = '读取书籍详情失败') {
  const output = requirePlainObject(result, fallback)
  if (output.success !== true) {
    throw new Error(output?.message || output?.error || fallback)
  }
  if (!output.info || typeof output.info !== 'object' || Array.isArray(output.info)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return output
}

function requireNovelChapterContentResult(result, fallback = '下载章节失败') {
  const output = requirePlainObject(result, fallback)
  if (output.success !== true) {
    throw new Error(output?.message || output?.error || fallback)
  }
  if (typeof output.content !== 'string') {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  if (!output.content.trim()) {
    throw new Error(`${fallback}：正文为空`)
  }
  return output
}

function requireNovelChaptersDownloadResult(result, fallback = '下载章节失败') {
  const output = requirePlainObject(result, fallback)
  if (output.success !== true) {
    throw new Error(output?.message || output?.error || fallback)
  }
  if (!Array.isArray(output.chapters)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return output
}

function sanitizeBookName(value, fallback = '下载小说') {
  const name = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return name || fallback
}

function normalizeExistingBookNames(books = []) {
  if (!Array.isArray(books)) return new Set()
  return new Set(
    books
      .flatMap((book) => [book?.name, book?.folderName, book?.id])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
}

/**
 * 获取可用书源列表。
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getNovelSources() {
  return requireNovelSourcesResult(await postJson('/api/novel/sources', {}))
}

/**
 * 按关键词搜索书籍。
 * @param {string} keyword 书名或作者
 * @param {string} [sourceId] 书源 ID
 * @returns {Promise<{ success: boolean, list: Array, sourceErrors: Array<string>, message?: string }>}
 */
export async function searchNovel(keyword, sourceId) {
  const result = await postJson('/api/novel/search', { keyword, sourceId })
  return requireNovelSearchResult(result)
}

/**
 * 获取书籍目录。
 * @param {string} bookUrl 书籍页 URL
 * @param {string} sourceId 书源 ID
 * @returns {Promise<{ success: boolean, chapters: Array<{ title: string, url: string }>, message?: string }>}
 */
export async function getNovelChapterList(bookUrl, sourceId) {
  const result = await postJson('/api/novel/chapters', { bookUrl, sourceId })
  return requireNovelChapterListResult(result)
}

/**
 * 获取书籍详情。
 * @param {string} bookUrl 书籍页 URL
 * @param {string} sourceId 书源 ID
 * @returns {Promise<{ success: boolean, info: Record<string, unknown>, message?: string }>}
 */
export async function getNovelBookInfo(bookUrl, sourceId) {
  const result = await postJson('/api/novel/book-info', { bookUrl, sourceId })
  return requireNovelBookInfoResult(result)
}

/**
 * 下载单章正文。
 * @param {string} chapterUrl 章节 URL
 * @param {string} sourceId 书源 ID
 * @returns {Promise<{ success: boolean, title?: string, content: string, message?: string }>}
 */
export async function downloadNovelChapter(chapterUrl, sourceId) {
  const resultList = await downloadNovelChapters([{ title: '正文', url: chapterUrl }], sourceId)
  const [chapter] = resultList.chapters
  const result = {
    success: Boolean(chapter && !chapter.failed),
    title: chapter?.title || '正文',
    content: chapter?.content || '',
    message: chapter?.message || chapter?.error || ''
  }
  return requireNovelChapterContentResult(result)
}

/**
 * 批量下载章节正文。
 * @param {Array<{ title: string, url: string }>} chapterList 章节列表
 * @param {string} sourceId 书源 ID
 * @returns {Promise<{ success: boolean, chapters: Array<{ title: string, content: string }>, message?: string }>}
 */
export async function downloadNovelChapters(chapterList, sourceId) {
  const plainList = (chapterList || []).map((chapter, index) => ({
    title: String(chapter?.title || `第${index + 1}章`),
    url: String(chapter?.url || '')
  }))
  const result = await postJson('/api/novel/download', { chapterList: plainList, sourceId })
  return requireNovelChaptersDownloadResult(result)
}

/**
 * 去掉失败或空正文的章节，返回可写入的下载结果。
 * @param {Array<{ title?: string, content?: string, failed?: boolean, error?: string }>} chapters
 * @returns {Array<{ title: string, content: string }>}
 */
export function normalizeDownloadedChapters(chapters = []) {
  if (!Array.isArray(chapters)) return []
  return chapters
    .filter((chapter) => chapter && chapter.failed !== true && String(chapter.content || '').trim())
    .map((chapter, index) => ({
      title: String(chapter.title || `第${index + 1}章`).trim(),
      content: String(chapter.content || '').trim()
    }))
}

/**
 * 生成不会和现有书架冲突的下载书名。
 * @param {string} title 原书名
 * @param {Array} existingBooks 现有书籍
 * @returns {string}
 */
export function uniqueDownloadedBookName(title, existingBooks = []) {
  const usedNames = normalizeExistingBookNames(existingBooks)
  const baseName = sanitizeBookName(title)
  if (!usedNames.has(baseName)) return baseName
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`
    const candidate = `${baseName.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`
    if (!usedNames.has(candidate)) return candidate
  }
  return `${baseName.slice(0, 66)}_${Date.now()}`
}

/**
 * 导出下载小说 TXT。
 * @param {{ title: string, content: string, dialogTitle?: string, textFileLabel?: string }} options
 * @returns {Promise<object | null>}
 */
export async function exportDownloadedNovelTextFile(options = {}) {
  const title = sanitizeBookName(options.title || '下载小说')
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('当前浏览器不支持文件下载')
  }
  const fileName = `${title}.txt`
  const objectUrl = URL.createObjectURL(
    new Blob([String(options.content || '')], { type: 'text/plain;charset=utf-8' })
  )
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  return { success: true, fileName }
}

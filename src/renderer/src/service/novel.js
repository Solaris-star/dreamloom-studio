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

function requireDownloadStartResult(result) {
  const output = requirePlainObject(result, '启动下载失败')
  if (output.success !== true || !output.jobId) {
    throw new Error(output?.message || '启动下载失败')
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 获取可用书源列表。
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getNovelSources() {
  return requireNovelSourcesResult(await postJson('/api/novel/sources', {}))
}

/**
 * 按关键词搜索书籍（默认全源聚合）。
 * @param {string} keyword 书名或作者
 * @param {string} [sourceId='all'] 书源 ID，默认 all
 * @returns {Promise<{ success: boolean, list: Array, sourceErrors: Array<string>, message?: string }>}
 */
export async function searchNovel(keyword, sourceId = 'all') {
  const result = await postJson(
    '/api/novel/search',
    { keyword, sourceId: sourceId || 'all' },
    { timeoutMs: 90_000 }
  )
  return requireNovelSearchResult(result)
}

/**
 * 获取书籍目录。
 * @param {string} bookUrl 书籍页 URL
 * @param {string} sourceId 书源 ID
 * @returns {Promise<{ success: boolean, chapters: Array<{ title: string, url: string }>, message?: string }>}
 */
export async function getNovelChapterList(bookUrl, sourceId) {
  const result = await postJson(
    '/api/novel/chapters',
    { bookUrl, sourceId },
    { timeoutMs: 60_000 }
  )
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
 * 启动异步下载任务。
 * @param {Array<{ title: string, url: string }>} chapterList
 * @param {string} sourceId
 * @returns {Promise<{ success: boolean, jobId: string, total?: number, status?: string }>}
 */
export async function startNovelDownloadJob(chapterList, sourceId) {
  const plainList = (chapterList || []).map((chapter, index) => ({
    title: String(chapter?.title || `第${index + 1}章`),
    url: String(chapter?.url || '')
  }))
  const result = await postJson(
    '/api/novel/download/start',
    { chapterList: plainList, sourceId },
    { timeoutMs: 30_000 }
  )
  return requireDownloadStartResult(result)
}

/**
 * 查询下载任务进度。
 * @param {string} jobId
 * @returns {Promise<object>}
 */
export async function getNovelDownloadProgress(jobId) {
  return requirePlainObject(
    await postJson('/api/novel/download/progress', { jobId }, { timeoutMs: 20_000 }),
    '查询下载进度失败'
  )
}

/**
 * 取消下载任务。
 * @param {string} jobId
 * @param {string} [reason]
 */
export async function cancelNovelDownloadJob(jobId, reason) {
  return requirePlainObject(
    await postJson('/api/novel/download/cancel', { jobId, reason }, { timeoutMs: 15_000 }),
    '取消下载失败'
  )
}

/**
 * 异步下载全部章节（start + poll），带真进度回调。
 * @param {Array<{ title: string, url: string }>} chapterList
 * @param {string} sourceId
 * @param {{ onProgress?: (p: {current:number,total:number,currentTitle?:string,percent?:number}) => void, pollMs?: number, signal?: AbortSignal }} [options]
 */
export async function downloadNovelChapters(chapterList, sourceId, options = {}) {
  const started = await startNovelDownloadJob(chapterList, sourceId)
  const jobId = started.jobId
  const pollMs = Number(options.pollMs) > 200 ? Number(options.pollMs) : 800
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const signal = options.signal

  if (onProgress) {
    onProgress({
      current: 0,
      total: started.total || chapterList?.length || 0,
      currentTitle: '',
      percent: 0
    })
  }

  while (true) {
    if (signal?.aborted) {
      try {
        await cancelNovelDownloadJob(jobId, '客户端中止')
      } catch {
        // ignore cancel error
      }
      throw new Error('下载已取消')
    }

    const progress = await getNovelDownloadProgress(jobId)
    if (progress.success === false) {
      throw new Error(progress.message || '下载任务不存在或已过期')
    }

    if (onProgress) {
      onProgress({
        current: Number(progress.current) || 0,
        total: Number(progress.total) || 0,
        currentTitle: progress.currentTitle || '',
        percent: Number(progress.percent) || 0
      })
    }

    if (progress.done) {
      const ok =
        progress.status === 'completed' ||
        progress.status === 'partial' ||
        (Array.isArray(progress.chapters) &&
          progress.chapters.some((chapter) => chapter && !chapter.failed))
      if (!ok) {
        throw new Error(progress.message || '下载失败')
      }
      return requireNovelChaptersDownloadResult({
        success: true,
        chapters: progress.chapters || [],
        message: progress.message || '',
        status: progress.status,
        jobId
      })
    }

    await sleep(pollMs)
  }
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

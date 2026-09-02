export const SUPPORTED_LOCAL_BOOK_EXTENSIONS = ['txt', 'md', 'markdown', 'docx', 'pdf']
export const MAX_LOCAL_BOOK_FILE_SIZE = 50 * 1024 * 1024

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown'])
const CHAPTER_TITLE_MAX_LENGTH = 90
const CHINESE_NUMERAL = '零一二三四五六七八九十百千万两〇壹贰叁肆伍陆柒捌玖拾佰仟'
// 章级标题:第N章/卷N/序章/楔子/Chapter N 等顶层结构
const BOOK_LEVEL_TITLE_PATTERN = new RegExp(
  [
    `^第\\s*[0-9${CHINESE_NUMERAL}]+\\s*[章回节卷部集]`,
    `^卷\\s*[0-9${CHINESE_NUMERAL}]+`,
    '^序章',
    '^楔子',
    '^引子',
    '^尾声',
    '^后记',
    '^番外',
    '^Chapter\\s+\\d+\\b',
    '^CHAPTER\\s+\\d+\\b'
  ].join('|'),
  'i'
)
// 小节标题:1.1 / 1.1.1 / 12.、编号式(仅当全书无章级标题时启用)
const SECTION_TITLE_PATTERN = /^\d+(?:\.\d+)*\s*[.、]?\s*\S+/
// 叙述句排除:匹配到章标题后,行内若还有句读(逗号/句号/分号/问叹号)说明是正文引用,不是标题
const NARRATIVE_PUNCTUATION = /[,，。;；:：?!]/
// 叙述动词:推荐序/前言里「第一章介绍了…」「第四章详细展开。」这类引用句
const NARRATIVE_VERB = /(介绍了|讲述了|讨论|展开|已经|将系统|分别|说明了|映射|呼应|给出|展示|提供)/

export function getLocalBookFileExtension(fileName = '') {
  const name = String(fileName || '').trim()
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function isSupportedLocalBookFile(file = {}) {
  return SUPPORTED_LOCAL_BOOK_EXTENSIONS.includes(getLocalBookFileExtension(file.name))
}

export async function parseLocalBookFile(file, options = {}) {
  if (!file?.name) {
    throw new Error('请选择本地书籍文件')
  }
  const extension = getLocalBookFileExtension(file.name)
  if (!SUPPORTED_LOCAL_BOOK_EXTENSIONS.includes(extension)) {
    throw new Error('暂不支持该文件格式')
  }
  if (Number(file.size) > MAX_LOCAL_BOOK_FILE_SIZE) {
    throw new Error('文件超过 50 MB，无法导入')
  }

  // PDF 走浏览器端解析,返回独立 ParsedBook 结构
  if (extension === 'pdf') {
    return parsePdfBook(file, options)
  }

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const signal = options.signal
  let source
  try {
    if (onProgress) onProgress({ phase: 'reading', percent: 20, message: '正在读取文件' })
    source = extension === 'docx' ? await readDocxText(file) : await readTextFile(file)
  } catch (error) {
    if (error?.message?.startsWith('DOCX')) throw error
    throw new Error(`读取文件失败：${error?.message || '文件内容损坏'}`)
  }

  return parseLocalBookText(source.text, {
    fileName: file.name,
    extension,
    fileSize: Number(file.size) || 0,
    encoding: source.encoding,
    warnings: source.warnings
  })
}

/**
 * PDF 解析分派。
 *
 * 不在顶层 import pdfBookImport.js,避免 Node 测试加载 Vite ?url worker。
 * readers.pdfReader 可作为测试注入点替换真实 PDF.js。
 */
async function parsePdfBook(file, options = {}) {
  const { onProgress = () => {}, signal, readers = {} } = options
  if (signal?.aborted) {
    throw makeAbortError()
  }

  // 测试注入点
  if (readers.pdfReader) {
    const result = await readers.pdfReader(file, options)
    return normalizePdfParsedBook(result, file)
  }

  // 浏览器环境:动态加载 PDF 解析模块
  let parsePdfFile = null
  try {
    const mod = await import('./pdfBookImport.js')
    parsePdfFile = mod.parsePdfFile || mod.default?.parsePdfFile
  } catch (error) {
    console.error('[localBookImport] 加载 pdfBookImport 失败:', error)
    throw new Error('PDF 解析组件加载失败')
  }
  if (!parsePdfFile) {
    throw new Error('PDF 解析组件加载失败')
  }

  const result = await parsePdfFile(file, { onProgress, signal })
  return normalizePdfParsedBook(result, file)
}

function makeAbortError() {
  const err = new Error('PDF 解析已取消')
  err.code = 'PDF_PARSE_ABORTED'
  return err
}

/**
 * 把 pdfBookImport 返回的原始结构归一化为统一 ParsedBook。
 * PDF 保留严格的一页一章，不再经过普通文本的章节标题猜测。
 */
function normalizePdfParsedBook(pdfResult, file) {
  const pageChapters = Array.isArray(pdfResult.pages)
    ? pdfResult.pages.map((page, index) => ({
        title: sanitizeChapterTitle(page?.title, `第${index + 1}页`),
        content: String(page?.content || ''),
        wordCount: countWords(page?.content || '')
      }))
    : []

  if (pageChapters.length) {
    const title = normalizeBookTitleOverride(pdfResult.title) || inferBookTitle('', file.name)
    return {
      title,
      extension: 'pdf',
      fileSize: Number(file.size) || 0,
      encoding: 'PDF',
      warnings: normalizeWarnings(pdfResult.warnings),
      totalWords: pageChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
      chapterCount: pageChapters.length,
      chapters: pageChapters,
      pageCount: Number(pdfResult.pageCount) || pageChapters.length,
      textPageCount:
        Number(pdfResult.textPageCount) || pageChapters.filter((chapter) => chapter.content).length,
      skippedPageCount: 0,
      metadata: pdfResult.metadata || null,
      _source: 'pdf'
    }
  }

  // 兼容旧的 readers 注入结果；真实 PDF 解析始终走上面的逐页分支。
  const rawText = String(pdfResult.rawText || pdfResult.text || '')
  const titleOverride = pdfResult.title || ''
  const parsed = parseLocalBookText(rawText, {
    fileName: file.name,
    extension: 'pdf',
    fileSize: Number(file.size) || 0,
    encoding: 'PDF',
    warnings: pdfResult.warnings,
    titleOverride
  })
  return {
    ...parsed,
    extension: 'pdf',
    encoding: 'PDF',
    pageCount: Number(pdfResult.pageCount) || 0,
    textPageCount: Number(pdfResult.textPageCount) || 0,
    skippedPageCount: Number(pdfResult.skippedPageCount) || 0,
    metadata: pdfResult.metadata || null,
    _source: 'pdf'
  }
}

export function parseLocalBookText(text, options = {}) {
  const normalizedText = normalizeSourceText(text)
  if (!normalizedText.trim()) {
    throw new Error('文件正文为空')
  }
  const extension = String(options.extension || '').toLowerCase()
  const title = normalizeBookTitleOverride(options.titleOverride) || inferBookTitle(normalizedText, options.fileName)
  const sourceText = isMarkdownExtension(extension)
    ? stripLeadingMarkdownBookTitle(normalizedText, title)
    : normalizedText
  const editorText = isMarkdownExtension(extension)
    ? markdownToPlainText(sourceText)
    : normalizedText
  const chapters = parseChapters(editorText, extension)
  const safeChapters = (chapters.length
    ? chapters
    : [{ title: '正文', content: editorText.trim() }]
  ).map((chapter) => ({
    ...chapter,
    wordCount: countWords(chapter.content)
  }))
  const totalWords = safeChapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0)

  return {
    title,
    extension,
    fileSize: Number(options.fileSize) || 0,
    encoding: String(options.encoding || (extension === 'docx' ? 'DOCX' : 'UTF-8')),
    warnings: normalizeWarnings(options.warnings),
    totalWords,
    chapterCount: safeChapters.length,
    chapters: safeChapters
  }
}

export function parseChapters(text, extension = '') {
  const lines = normalizeSourceText(text).split('\n')
  const chapters = []
  let current = null

  // 预扫描:全书是否存在章级标题(第N章/Chapter N)。
  // 有章级 → 小节编号(1.1)不再作为切分点,避免一本书被切成几百个碎章。
  const bookLevelSeen = lines.some((rawLine) => {
    const line = rawLine.trim()
    return line && line.length <= CHAPTER_TITLE_MAX_LENGTH &&
      BOOK_LEVEL_TITLE_PATTERN.test(line.replace(/^#{1,6}\s+/, ''))
  })

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const title = extractChapterTitle(line, extension, { bookLevelSeen })
    if (title) {
      if (current) chapters.push(finalizeChapter(current))
      current = {
        title,
        lines: []
      }
      continue
    }

    if (!current) {
      current = {
        title: '正文',
        lines: []
      }
    }
    current.lines.push(rawLine)
  }

  if (current) chapters.push(finalizeChapter(current))

  const visible = chapters.filter((chapter) => chapter.content.trim() || chapter.title !== '正文')
  if (!visible.length) {
    return [{ title: '正文', content: normalizeSourceText(text).trim() }]
  }
  return visible.map((chapter, index) => ({
    title: sanitizeChapterTitle(chapter.title, `第${index + 1}章`),
    content: chapter.content.trim()
  }))
}

export function sanitizeChapterTitle(title, fallback = '正文') {
  const value = String(title || fallback)
    .replace(/^#{1,6}\s+/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (value || fallback).slice(0, CHAPTER_TITLE_MAX_LENGTH)
}

export function uniqueLocalBookName(title, existingBooks = []) {
  const base = sanitizeBookName(title || '本地导入书籍')
  const names = new Set(
    existingBooks
      .flatMap((book) => [book?.name, book?.folderName])
      .filter(Boolean)
      .map((name) => String(name).trim())
  )
  if (!names.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`
    if (!names.has(candidate)) return candidate
  }
  return `${base}_${Date.now()}`
}

export function makeUniqueChapterTitle(title, usedTitles, fallback) {
  const base = sanitizeChapterTitle(title, fallback)
  if (!usedTitles.has(base)) {
    usedTitles.add(base)
    return base
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`
    const candidate = `${base.slice(0, Math.max(1, CHAPTER_TITLE_MAX_LENGTH - suffix.length))}${suffix}`
    if (!usedTitles.has(candidate)) {
      usedTitles.add(candidate)
      return candidate
    }
  }
  const candidate = `${base.slice(0, 70)}_${Date.now()}`
  usedTitles.add(candidate)
  return candidate
}

export function countWords(text = '') {
  return String(text || '').replace(/[\s\n\r\t]/g, '').length
}

export function summarizeLocalBookImportResults(results = []) {
  return results.reduce(
    (summary, result) => {
      if (result?.success) {
        summary.success += 1
      } else {
        summary.failed += 1
      }
      return summary
    },
    { success: 0, failed: 0 }
  )
}

async function readDocxText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 4))
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  if (!isZip) {
    throw new Error('DOCX 文件内容损坏，或文件扩展名与实际格式不符')
  }

  let result
  try {
    const mammothModule = await import('mammoth')
    const mammoth = mammothModule.default || mammothModule
    const input =
      typeof globalThis.Buffer?.from === 'function'
        ? { buffer: globalThis.Buffer.from(arrayBuffer) }
        : { arrayBuffer }
    result = await mammoth.extractRawText(input)
  } catch {
    throw new Error('DOCX 文件无法解析，请确认文件未损坏且未加密')
  }
  return {
    text: result?.value || '',
    encoding: 'DOCX',
    warnings: normalizeWarnings(result?.messages)
  }
}

async function readTextFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  return decodeTextBuffer(arrayBuffer)
}

function decodeTextBuffer(arrayBuffer) {
  for (const encoding of ['utf-8', 'gb18030', 'gbk']) {
    try {
      return {
        text: new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(arrayBuffer),
        encoding: encoding.toUpperCase()
      }
    } catch {
      // 尝试下一种常见编码
    }
  }
  return {
    text: new TextDecoder().decode(arrayBuffer),
    encoding: 'UTF-8'
  }
}

function normalizeWarnings(warnings = []) {
  return [...new Set(
    warnings
      .map((warning) => String(warning?.message || warning || '').trim())
      .filter(Boolean)
      .map((warning) => warning.replace(/[A-Za-z]:[\\/][^\s]+/g, '[本地文件]'))
  )]
}

function normalizeSourceText(text = '') {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function inferBookTitle(text, fileName = '') {
  const baseName = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
  const heading = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#\s+\S/.test(line))
  if (heading) return sanitizeBookName(heading.replace(/^#\s+/, ''))
  return sanitizeBookName(baseName || '本地导入书籍')
}

function stripLeadingMarkdownBookTitle(text, title) {
  const lines = normalizeSourceText(text).split('\n')
  const firstLine = String(lines[0] || '').trim()
  if (!/^#\s+\S/.test(firstLine)) return text
  const heading = sanitizeBookName(firstLine.replace(/^#\s+/, ''))
  if (heading !== title) return text
  return lines.slice(1).join('\n').trim()
}

function normalizeBookTitleOverride(title) {
  const value = String(title || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!value || value.length > 120) return ''
  if (/^(untitled|unknown|microsoft word|adobe acrobat|pdf)$/i.test(value)) return ''
  return sanitizeBookName(value)
}

function sanitizeBookName(name) {
  return (
    String(name || '本地导入书籍')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '本地导入书籍'
  )
}

function extractChapterTitle(line, extension, options = {}) {
  if (!line || line.length > CHAPTER_TITLE_MAX_LENGTH) return ''
  if (isMarkdownExtension(extension) && /^#{1,3}\s+\S/.test(line)) {
    return sanitizeChapterTitle(line)
  }
  const cleanLine = line.replace(/^#{1,6}\s+/, '')
  const { bookLevelSeen = false } = options
  if (BOOK_LEVEL_TITLE_PATTERN.test(cleanLine)) {
    // 叙述句防误切:推荐序/前言里「第二章,工具安全…在第四、五、六章展开。」「第一章介绍了…」
    // 是对章节的引用而非标题。启发式:含句读 / 句读后余文 > 8 字 / 含叙述动词 → 放行当正文
    if (NARRATIVE_PUNCTUATION.test(cleanLine) || NARRATIVE_VERB.test(cleanLine)) {
      const firstPunct = cleanLine.search(NARRATIVE_PUNCTUATION)
      const afterPunct = firstPunct >= 0 ? cleanLine.slice(firstPunct + 1) : ''
      if (afterPunct.length > 8 || NARRATIVE_VERB.test(cleanLine) || cleanLine.length > 40) {
        return ''
      }
    }
    return sanitizeChapterTitle(cleanLine)
  }
  // 小节编号(1.1/1.1.1):仅当全书没有章级标题时才作为章节切分依据
  if (!bookLevelSeen && SECTION_TITLE_PATTERN.test(cleanLine)) {
    if (!NARRATIVE_PUNCTUATION.test(cleanLine)) {
      return sanitizeChapterTitle(cleanLine)
    }
  }
  return ''
}

function finalizeChapter(chapter) {
  return {
    title: chapter.title,
    content: chapter.lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

function isMarkdownExtension(extension) {
  return extension === 'md' || extension === 'markdown'
}

function markdownToPlainText(text = '') {
  return normalizeSourceText(text)
    .replace(/^---[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '')
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[ \t]*>\s?/gm, '')
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    .replace(/^[ \t]*\d+[.)]\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
}

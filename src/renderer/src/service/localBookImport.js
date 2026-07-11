import mammoth from 'mammoth'

export const SUPPORTED_LOCAL_BOOK_EXTENSIONS = ['txt', 'md', 'markdown', 'docx']
export const MAX_LOCAL_BOOK_FILE_SIZE = 50 * 1024 * 1024

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown'])
const CHAPTER_TITLE_MAX_LENGTH = 90
const CHINESE_NUMERAL = '零一二三四五六七八九十百千万两〇壹贰叁肆伍陆柒捌玖拾佰仟'
const CHAPTER_TITLE_PATTERN = new RegExp(
  [
    `^第\\s*[0-9０-９${CHINESE_NUMERAL}]+\\s*[章回节卷部集]`,
    `^卷\\s*[0-9０-９${CHINESE_NUMERAL}]+`,
    '^序章',
    '^楔子',
    '^引子',
    '^尾声',
    '^后记',
    '^番外',
    '^Chapter\\s+\\d+\\b',
    '^CHAPTER\\s+\\d+\\b',
    '^\\d+\\s*[.、]\\s*\\S+'
  ].join('|'),
  'i'
)

export function getLocalBookFileExtension(fileName = '') {
  const name = String(fileName || '').trim()
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function isSupportedLocalBookFile(file = {}) {
  return SUPPORTED_LOCAL_BOOK_EXTENSIONS.includes(getLocalBookFileExtension(file.name))
}

export async function parseLocalBookFile(file) {
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

  let text
  try {
    text = extension === 'docx' ? await readDocxText(file) : await readTextFile(file, extension)
  } catch (error) {
    if (error?.message?.startsWith('DOCX')) throw error
    throw new Error(`读取文件失败：${error?.message || '文件内容损坏'}`)
  }

  return parseLocalBookText(text, {
    fileName: file.name,
    extension
  })
}

export function parseLocalBookText(text, options = {}) {
  const normalizedText = normalizeSourceText(text)
  if (!normalizedText.trim()) {
    throw new Error('文件正文为空')
  }
  const extension = String(options.extension || '').toLowerCase()
  const title = inferBookTitle(normalizedText, options.fileName)
  const sourceText = isMarkdownExtension(extension)
    ? stripLeadingMarkdownBookTitle(normalizedText, title)
    : normalizedText
  const editorText = isMarkdownExtension(extension)
    ? markdownToPlainText(sourceText)
    : normalizedText
  const chapters = parseChapters(editorText, extension)
  const safeChapters = chapters.length ? chapters : [{ title: '正文', content: editorText.trim() }]
  const totalWords = safeChapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0)

  return {
    title,
    extension,
    totalWords,
    chapterCount: safeChapters.length,
    chapters: safeChapters
  }
}

export function parseChapters(text, extension = '') {
  const lines = normalizeSourceText(text).split('\n')
  const chapters = []
  let current = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const title = extractChapterTitle(line, extension)
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
    result = await mammoth.extractRawText({ arrayBuffer })
  } catch {
    throw new Error('DOCX 文件无法解析，请确认文件未损坏且未加密')
  }
  return result?.value || ''
}

async function readTextFile(file, extension) {
  const arrayBuffer = await file.arrayBuffer()
  if (extension === 'txt') {
    return decodeTextBuffer(arrayBuffer)
  }
  return decodeTextBuffer(arrayBuffer)
}

function decodeTextBuffer(arrayBuffer) {
  for (const encoding of ['utf-8', 'gb18030', 'gbk']) {
    try {
      return new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(arrayBuffer)
    } catch {
      // 尝试下一种常见编码
    }
  }
  return new TextDecoder().decode(arrayBuffer)
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

function sanitizeBookName(name) {
  return (
    String(name || '本地导入书籍')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '本地导入书籍'
  )
}

function extractChapterTitle(line, extension) {
  if (!line || line.length > CHAPTER_TITLE_MAX_LENGTH) return ''
  if (isMarkdownExtension(extension) && /^#{1,3}\s+\S/.test(line)) {
    return sanitizeChapterTitle(line)
  }
  const cleanLine = line.replace(/^#{1,6}\s+/, '')
  if (CHAPTER_TITLE_PATTERN.test(cleanLine)) return sanitizeChapterTitle(cleanLine)
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

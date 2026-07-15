import fs from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import zlib from 'node:zlib'
import iconv from 'iconv-lite'
import { nowIso, readJson, writeJson } from './webJsonRepository.js'

const IMPORT_EXPORT_DIR = '.import-export'
const TASKS_FILE = 'tasks.json'
const DEFAULT_VOLUME_NAME = '正文'
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown'])
const ZIP_STORE = 0
const ZIP_DEFLATE = 8
const MAX_IMPORT_BYTES = 50 * 1024 * 1024

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let j = 0; j < 8; j++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function safeName(value, fallback = '未命名') {
  return (
    String(value || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_') || fallback
  )
}

function isInside(baseDir, targetPath) {
  const rel = relative(resolve(baseDir), resolve(targetPath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

function getTaskFile(booksDir) {
  return join(booksDir, IMPORT_EXPORT_DIR, TASKS_FILE)
}

function getExportDir(booksDir) {
  return ensureDir(join(booksDir, IMPORT_EXPORT_DIR, 'exports'))
}

function getBackupDir(booksDir) {
  return ensureDir(join(booksDir, IMPORT_EXPORT_DIR, 'backups'))
}

function getRestoreRoot(booksDir) {
  return ensureDir(join(booksDir, IMPORT_EXPORT_DIR, 'restored'))
}

function readTasks(booksDir) {
  const filePath = getTaskFile(booksDir)
  if (!fs.existsSync(filePath)) return []
  let rows
  try {
    rows = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]')
  } catch (error) {
    throw new Error(`导入导出任务记录读取失败：${error.message}`)
  }
  if (!Array.isArray(rows)) {
    throw new Error('导入导出任务记录格式异常，已停止读取任务记录')
  }
  return rows.filter((row) => row != null)
}

async function writeTasks(booksDir, rows) {
  if (!Array.isArray(rows)) {
    throw new Error('导入导出任务记录格式异常，已停止写入以免覆盖原始记录')
  }
  await writeJson(getTaskFile(booksDir), rows.slice(0, 120))
}

async function recordTask(booksDir, task) {
  const row = {
    id: task.id || randomUUID(),
    createdAt: nowIso(),
    status: task.status || 'success',
    ...task
  }
  await writeTasks(booksDir, [row, ...readTasks(booksDir)])
  return row
}

function getBookPath(booksDir, bookName) {
  const safeBookName = safeName(bookName)
  const target = resolve(booksDir, safeBookName)
  if (!isInside(booksDir, target)) throw new Error('书籍路径无效')
  return target
}

async function readBooks(booksDir) {
  if (!booksDir || !fs.existsSync(booksDir)) return []
  const entries = fs
    .readdirSync(booksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== IMPORT_EXPORT_DIR)
  const books = []
  for (const entry of entries) {
    const bookPath = join(booksDir, entry.name)
    const meta = await readJson(join(bookPath, 'mazi.json'), null)
    if (!meta || typeof meta !== 'object') continue
    books.push({
      id: String(meta.id || entry.name),
      name: String(meta.name || entry.name),
      folderName: entry.name,
      path: bookPath,
      meta
    })
  }
  return books
}

function uniqueBookName(booksDir, preferredName) {
  const base = safeName(preferredName, `导入书籍_${Date.now()}`)
  let candidate = base
  let index = 1
  while (fs.existsSync(join(booksDir, candidate))) {
    candidate = `${base}_${index}`
    index++
  }
  return candidate
}

function uniqueRestoredBookName(booksDir, preferredName, reservedNames) {
  const base = safeName(preferredName, `恢复书籍_${Date.now()}`)
  let candidate = base
  let index = 1
  while (reservedNames.has(candidate) || fs.existsSync(join(booksDir, candidate))) {
    candidate = `${base}_${index}`
    index++
  }
  reservedNames.add(candidate)
  return candidate
}

function uniqueFilePath(dirPath, fileName) {
  const ext = extname(fileName)
  const base = safeName(basename(fileName, ext), 'file')
  let candidate = join(dirPath, `${base}${ext}`)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = join(dirPath, `${base}_${index}${ext}`)
    index++
  }
  return candidate
}

function moveDirectory(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath)
    return
  } catch (error) {
    if (error?.code !== 'EXDEV' && error?.code !== 'EPERM') {
      throw error
    }
  }

  try {
    fs.cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true })
    fs.rmSync(sourcePath, { recursive: true, force: true })
  } catch (error) {
    fs.rmSync(targetPath, { recursive: true, force: true })
    throw error
  }
}

function decodeInputBuffer(input = {}) {
  if (input.sourcePath) {
    throw new Error('Web 服务必须通过网页上传文件内容，不能读取服务器本地路径')
  }
  if (input.dataUrl || input.base64) {
    const raw = String(input.dataUrl || input.base64).trim()
    const separator = raw.indexOf(',')
    const base64 = separator >= 0 ? raw.slice(separator + 1) : raw
    if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
      throw new Error('导入文件不是有效的 Base64 数据')
    }
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) throw new Error('导入文件内容为空')
    if (buffer.length > MAX_IMPORT_BYTES) throw new Error('导入文件不能超过 50 MB')
    return {
      buffer,
      fileName: input.fileName || `import_${Date.now()}`
    }
  }
  if (typeof input.textContent === 'string') {
    const buffer = Buffer.from(input.textContent, 'utf-8')
    if (!buffer.length) throw new Error('导入文件内容为空')
    if (buffer.length > MAX_IMPORT_BYTES) throw new Error('导入文件不能超过 50 MB')
    return {
      buffer,
      fileName: input.fileName || `import_${Date.now()}.txt`
    }
  }
  throw new Error('缺少导入文件内容')
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\ufeff/, '')
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf-8').replace(/^\ufeff/, '')
  }
  const utf8Text = buffer.toString('utf-8')
  const badCount = (utf8Text.match(/\ufffd/g) || []).length
  if (badCount > Math.max(2, utf8Text.length * 0.01)) {
    return iconv.decode(buffer, 'gb18030')
  }
  return utf8Text
}

function readZipEntries(buffer) {
  const entries = new Map()
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP 文件结构无效')

  const totalEntries = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP 目录结构无效')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8')

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP 文件头无效')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let data
    if (method === ZIP_STORE) {
      data = Buffer.from(compressed)
    } else if (method === ZIP_DEFLATE) {
      data = zlib.inflateRawSync(compressed)
    } else {
      throw new Error(`暂不支持 ZIP 压缩方式：${method}`)
    }
    if (uncompressedSize !== data.length) throw new Error('ZIP 文件大小不匹配')
    entries.set(name.replace(/\\/g, '/'), data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function createZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name.replace(/\\/g, '/'), 'utf-8')
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(String(file.data || ''), 'utf-8')
    const crc = crc32(data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(ZIP_STORE, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(ZIP_STORE, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDir = Buffer.concat(centralParts)
  const localData = Buffer.concat(localParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(localData.length, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([localData, centralDir, end])
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractDocxText(buffer) {
  const entries = readZipEntries(buffer)
  const documentXml = entries.get('word/document.xml')
  if (!documentXml) throw new Error('DOCX 中缺少 word/document.xml')
  return decodeXmlEntities(
    documentXml
      .toString('utf-8')
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:br\s*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\r\n/g, '\n')
}

function getFormat(input = {}, fileName = '') {
  const raw = String(input.format || '').toLowerCase()
  if (raw) return raw === 'markdown' ? 'md' : raw
  const ext = extname(fileName).toLowerCase()
  if (ext === '.docx') return 'docx'
  if (ext === '.md' || ext === '.markdown') return 'md'
  return 'txt'
}

function readImportText(input = {}) {
  const { buffer, fileName } = decodeInputBuffer(input)
  const format = getFormat(input, fileName)
  if (format === 'docx') {
    return { text: extractDocxText(buffer), fileName, format }
  }
  if (
    !TEXT_EXTENSIONS.has(extname(fileName).toLowerCase()) &&
    format !== 'txt' &&
    format !== 'md'
  ) {
    throw new Error('仅支持 TXT、Markdown 和 DOCX')
  }
  return { text: decodeTextBuffer(buffer).replace(/\r\n/g, '\n'), fileName, format }
}

function isChapterTitle(line, index, format, markdownHeadingLevel = null) {
  const text = String(line || '').trim()
  if (!text || text.length > 90) return false
  if (format === 'md' && markdownHeadingLevel) {
    return new RegExp(`^#{${markdownHeadingLevel}}\\s+\\S+`).test(text)
  }
  if (format === 'md' && /^#{2,3}\s+\S+/.test(text)) return true
  return (
    /^第[零〇一二三四五六七八九十百千万两\d]+[章回节卷集部]\s*\S*/.test(text) ||
    /^Chapter\s+\d+\b/i.test(text) ||
    /^CHAPTER\s+\d+\b/.test(text) ||
    /^\d{1,4}[.、]\s*\S+/.test(text) ||
    (index > 0 && /^【[^】]{1,40}】$/.test(text))
  )
}

function normalizeChapterTitle(title, index) {
  const cleaned = String(title || '')
    .trim()
    .replace(/^#{1,3}\s+/, '')
  return safeName(cleaned || `第${index + 1}章`, `第${index + 1}章`)
}

function normalizePlainTitle(line = '') {
  return String(line || '')
    .trim()
    .replace(/^#{1,2}\s+/, '')
    .replace(/^《(.+)》$/, '$1')
    .replace(/^书名[:：]\s*/, '')
    .trim()
}

function inferBookName(text, fileName, format) {
  const sourceBaseName = normalizePlainTitle(basename(fileName, extname(fileName)))
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)

  const explicitTitle = lines.find((line) => /^书名[:：]\s*\S+/.test(line))
  if (explicitTitle)
    return safeName(normalizePlainTitle(explicitTitle), sourceBaseName || '导入书籍')

  if (format === 'md') {
    const h1 = lines.find((line) => /^#\s+\S+/.test(line))
    if (h1) return safeName(normalizePlainTitle(h1), sourceBaseName || '导入书籍')
  }

  const firstLine = normalizePlainTitle(lines[0] || '')
  const looksLikeChapter = isChapterTitle(firstLine, 0, format)
  if (firstLine && firstLine.length <= 50 && !looksLikeChapter) {
    return safeName(firstLine, sourceBaseName || '导入书籍')
  }

  return safeName(sourceBaseName || '导入书籍', '导入书籍')
}

function isExplicitBookTitleLine(line, format) {
  const text = String(line || '').trim()
  return (
    /^书名[:：]\s*\S+/.test(text) ||
    /^《[^》]{1,60}》$/.test(text) ||
    (format === 'md' && /^#\s+\S+/.test(text))
  )
}

function shouldStripBookTitleLine(line, bookName, format) {
  const text = String(line || '').trim()
  if (!text) return false
  const normalizedLine = normalizePlainTitle(text)
  const normalizedBookName = normalizePlainTitle(bookName)
  if (!normalizedLine || normalizedLine !== normalizedBookName) return false
  if (isExplicitBookTitleLine(text, format)) return true
  if (isChapterTitle(text, 0, format)) return false
  if (/[，。！？；：,.!?;:]/.test(normalizedLine)) return false
  return normalizedLine.length <= 40
}

function stripLeadingBookTitle(text, bookName, format) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const firstTextIndex = lines.findIndex((line) => line.trim())
  if (firstTextIndex < 0) return String(text || '')

  const firstLine = lines[firstTextIndex]
  if (!shouldStripBookTitleLine(firstLine, bookName, format)) return String(text || '')

  const hasChapterAfterTitle = lines
    .slice(firstTextIndex + 1)
    .some((line, index) => isChapterTitle(line, firstTextIndex + index + 1, format))
  if (!hasChapterAfterTitle) return String(text || '')

  const nextLines = [...lines.slice(0, firstTextIndex), ...lines.slice(firstTextIndex + 1)]
  return nextLines.join('\n').replace(/^\s*\n/, '')
}

function splitChapters(text, format) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const markdownHeadingLevel =
    format === 'md' && lines.some((line) => /^###\s+\S+/.test(line.trim())) ? 3 : 2
  const chapters = []
  let current = null
  let buffer = []

  const flush = () => {
    if (!current && buffer.join('\n').trim()) {
      current = `第${chapters.length + 1}章`
    }
    if (!current) return
    chapters.push({
      title: normalizeChapterTitle(current, chapters.length, format),
      content: buffer.join('\n').trim()
    })
    current = null
    buffer = []
  }

  lines.forEach((line, index) => {
    if (format === 'md' && markdownHeadingLevel === 3 && /^##\s+\S+/.test(line.trim())) {
      return
    }
    if (isChapterTitle(line, index, format, markdownHeadingLevel)) {
      flush()
      current = line
      buffer = []
      return
    }
    buffer.push(line)
  })
  flush()

  if (chapters.length === 0) {
    chapters.push({ title: '第1章', content: String(text || '').trim() })
  }
  return chapters
}

function countWords(text) {
  const value = String(text || '')
  const cn = value.match(/[\u4e00-\u9fa5]/g)?.length || 0
  const en = value.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g)?.length || 0
  return cn + en
}

function buildPreparedImportPreview(input = {}) {
  if (!Array.isArray(input.chapters) || input.chapters.length === 0) {
    throw new Error('导入章节不能为空')
  }
  if (input.chapters.length > 10000) throw new Error('导入章节数量不能超过 10000')

  const chapters = input.chapters.map((chapter, index) => {
    if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter)) {
      throw new Error(`第 ${index + 1} 章格式无效`)
    }
    if (typeof chapter.content !== 'string') {
      throw new Error(`第 ${index + 1} 章正文格式无效`)
    }
    return {
      title: normalizeChapterTitle(chapter.title, index),
      content: chapter.content
    }
  })
  const bookName = safeName(input.bookName || '导入书籍', '导入书籍')
  const wordCount = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0)
  return {
    fileName: safeName(input.fileName || `${bookName}.txt`, `${bookName}.txt`),
    format: getFormat(input, input.fileName),
    bookName,
    chapterCount: chapters.length,
    wordCount,
    chapters: chapters.map((chapter, index) => ({
      index: index + 1,
      title: chapter.title,
      wordCount: countWords(chapter.content),
      preview: chapter.content.slice(0, 160)
    })),
    rawChapters: chapters
  }
}

function buildImportPreview(input = {}) {
  if (Array.isArray(input.chapters)) return buildPreparedImportPreview(input)
  const parsed = readImportText(input)
  const bookName = inferBookName(parsed.text, parsed.fileName, parsed.format)
  const chapterText = stripLeadingBookTitle(parsed.text, bookName, parsed.format)
  const chapters = splitChapters(chapterText, parsed.format)
  return {
    fileName: parsed.fileName,
    format: parsed.format,
    bookName,
    chapterCount: chapters.length,
    wordCount: countWords(chapterText),
    chapters: chapters.map((chapter, index) => ({
      index: index + 1,
      title: chapter.title,
      wordCount: countWords(chapter.content),
      preview: chapter.content.slice(0, 160)
    })),
    rawChapters: chapters
  }
}

export function previewImport(_booksDir, input = {}) {
  const preview = buildImportPreview(input)
  return {
    success: true,
    preview: {
      ...preview,
      rawChapters: undefined,
      chapters: preview.chapters.slice(0, 80)
    }
  }
}

export async function importBook(booksDir, input = {}) {
  const preview = buildImportPreview(input)
  const bookName = uniqueBookName(booksDir, input.bookName || preview.bookName || '导入书籍')
  const bookPath = getBookPath(booksDir, bookName)
  const tempBookPath = join(booksDir, `.importing-${randomUUID()}`)
  const volumeName = safeName(input.volumeName || DEFAULT_VOLUME_NAME)
  const volumePath = join(tempBookPath, '正文', volumeName)
  let moved = false

  ensureDir(booksDir)
  try {
    ensureDir(volumePath)
    ensureDir(join(tempBookPath, '笔记', '大纲'))
    ensureDir(join(tempBookPath, '笔记', '设定'))
    ensureDir(join(tempBookPath, '笔记', '人物'))

    const meta = {
      id: String(Date.now()),
      name: bookName,
      type: input.type || 'original',
      typeName: input.typeName || '导入作品',
      targetCount: Number(input.targetCount || 0),
      intro: input.intro || `从 ${preview.fileName} 导入`,
      sourceType: 'user_imported',
      downloaded: false,
      importedFrom: 'importExport',
      bookRole: 'creative',
      password: null,
      coverColor: input.coverColor || '#22345c',
      coverUrl: null,
      coverImagePath: null,
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString()
    }
    await writeJson(join(tempBookPath, 'mazi.json'), meta)

    preview.rawChapters.forEach((chapter, index) => {
      const title = chapter.title || `第${index + 1}章`
      const filePath = uniqueFilePath(
        volumePath,
        `${safeName(title, `第${index + 1}章`)}.txt`
      )
      fs.writeFileSync(filePath, chapter.content || '', 'utf-8')
    })

    if (fs.existsSync(bookPath)) throw new Error(`书库中已存在 ${bookName}`)
    moveDirectory(tempBookPath, bookPath)
    moved = true

    const task = await recordTask(booksDir, {
      type: 'import',
      title: `导入 ${bookName}`,
      sourceName: preview.fileName,
      bookName,
      format: preview.format,
      chapterCount: preview.chapterCount,
      wordCount: preview.wordCount
    })

    return {
      success: true,
      bookName,
      bookPath,
      chapterCount: preview.chapterCount,
      wordCount: preview.wordCount,
      task
    }
  } catch (error) {
    fs.rmSync(tempBookPath, { recursive: true, force: true })
    if (moved && isInside(booksDir, bookPath)) {
      fs.rmSync(bookPath, { recursive: true, force: true })
    }
    throw error
  }
}

function listBookChapters(book) {
  const root = join(book.path, '正文')
  if (!fs.existsSync(root)) return []
  const volumes = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  return volumes.flatMap((volumeName) => {
    const volumePath = join(root, volumeName)
    return fs
      .readdirSync(volumePath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      .map((entry) => {
        const filePath = join(volumePath, entry.name)
        return {
          volumeName,
          title: basename(entry.name, '.txt'),
          content: fs.readFileSync(filePath, 'utf-8')
        }
      })
  })
}

async function getBook(booksDir, bookName) {
  const book = (await readBooks(booksDir)).find(
    (item) => item.name === bookName || item.folderName === bookName || item.id === bookName
  )
  if (!book) throw new Error('未找到书籍')
  return book
}

function formatBookAsText(book, chapters) {
  const parts = [book.name, '', book.meta?.intro || '', ''].filter((part) => part !== '')
  let lastVolume = ''
  for (const chapter of chapters) {
    if (chapter.volumeName !== lastVolume) {
      parts.push('', `【${chapter.volumeName}】`)
      lastVolume = chapter.volumeName
    }
    parts.push('', chapter.title, '', chapter.content)
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}

function formatBookAsMarkdown(book, chapters) {
  const parts = [`# ${book.name}`]
  if (book.meta?.intro) parts.push('', book.meta.intro)
  let lastVolume = ''
  for (const chapter of chapters) {
    if (chapter.volumeName !== lastVolume) {
      parts.push('', `## ${chapter.volumeName}`)
      lastVolume = chapter.volumeName
    }
    parts.push('', `### ${chapter.title}`, '', chapter.content)
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n')
}

function collectFiles(rootDir, prefix = '') {
  const rows = []
  if (!fs.existsSync(rootDir)) return rows
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === IMPORT_EXPORT_DIR) continue
    const filePath = join(rootDir, entry.name)
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      rows.push(...collectFiles(filePath, relativeName))
    } else if (entry.isFile()) {
      rows.push({
        name: relativeName.replace(/\\/g, '/'),
        data: fs.readFileSync(filePath)
      })
    }
  }
  return rows
}

export async function exportBook(booksDir, input = {}) {
  const format = String(input.format || 'txt').toLowerCase()
  const book = await getBook(booksDir, input.bookName)
  const exportDir = getExportDir(booksDir)
  let filePath
  let content = ''
  let downloadBase64 = ''
  let mimeType = 'text/plain;charset=utf-8'

  if (format === 'md' || format === 'markdown') {
    content = formatBookAsMarkdown(book, listBookChapters(book))
    filePath = uniqueFilePath(exportDir, `${book.name}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')
    mimeType = 'text/markdown;charset=utf-8'
  } else if (format === 'project') {
    const files = collectFiles(book.path, book.folderName)
    const zip = createZip(files)
    filePath = uniqueFilePath(exportDir, `${book.name}.zip`)
    fs.writeFileSync(filePath, zip)
    downloadBase64 = zip.toString('base64')
    mimeType = 'application/zip'
  } else {
    content = formatBookAsText(book, listBookChapters(book))
    filePath = uniqueFilePath(exportDir, `${book.name}.txt`)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  const stat = fs.statSync(filePath)
  const task = await recordTask(booksDir, {
    type: 'export',
    title: `导出 ${book.name}`,
    bookName: book.name,
    format,
    filePath,
    size: stat.size
  })

  return {
    success: true,
    filePath,
    fileName: basename(filePath),
    content,
    downloadBase64,
    mimeType,
    size: stat.size,
    task
  }
}

export async function createBackup(booksDir, input = {}) {
  const scope = input.scope === 'book' ? 'book' : 'library'
  let rootDir = booksDir
  let prefix = ''
  let label = '书库备份'
  if (scope === 'book') {
    const book = await getBook(booksDir, input.bookName)
    rootDir = book.path
    prefix = book.folderName
    label = `${book.name}备份`
  }
  const files = collectFiles(rootDir, prefix)
  if (!files.length) throw new Error('没有可备份的文件')
  const zip = createZip(files)
  const filePath = uniqueFilePath(getBackupDir(booksDir), `${safeName(label)}_${Date.now()}.zip`)
  fs.writeFileSync(filePath, zip)
  const task = await recordTask(booksDir, {
    type: 'backup',
    title: label,
    scope,
    bookName: input.bookName || '',
    filePath,
    size: zip.length
  })
  return {
    success: true,
    filePath,
    fileName: basename(filePath),
    downloadBase64: zip.toString('base64'),
    mimeType: 'application/zip',
    size: zip.length,
    task
  }
}

function decodeZipInput(input = {}) {
  const decoded = decodeInputBuffer(input)
  return {
    buffer: decoded.buffer,
    fileName: decoded.fileName
  }
}

function maziRootFromFileName(fileName) {
  if (fileName === 'mazi.json') return ''
  const root = dirname(fileName).replace(/\\/g, '/')
  return root === '.' ? '' : root
}

function entryBelongsToRoot(entryName, root) {
  if (!root) return true
  return entryName.startsWith(`${root}/`)
}

function restoreRelativeName(entryName, root) {
  return root ? entryName.slice(root.length + 1) : entryName
}

function parseRestoreMeta(buffer) {
  try {
    const meta = JSON.parse(Buffer.from(buffer || '').toString('utf-8'))
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  } catch {
    return {}
  }
}

function buildRestoreBookGroups(entries) {
  const names = [...entries.keys()].filter((name) => !name.endsWith('/'))
  const maziFiles = names.filter((name) => name.endsWith('/mazi.json') || name === 'mazi.json')
  return maziFiles.map((maziFile) => {
    const root = maziRootFromFileName(maziFile)
    const meta = parseRestoreMeta(entries.get(maziFile))
    const preferredName = meta.name || basename(root) || '恢复书籍'
    return {
      root,
      maziFile,
      meta,
      preferredName,
      files: names.filter((name) => entryBelongsToRoot(name, root))
    }
  })
}

function validateRestoreEntries(entries) {
  const names = [...entries.keys()].filter((name) => !name.endsWith('/'))
  if (!names.length) throw new Error('备份包为空')
  for (const name of names) {
    if (name.startsWith('/') || name.includes('..') || /^[A-Za-z]:/.test(name)) {
      throw new Error('备份包包含不安全路径')
    }
  }
  const maziFiles = names.filter((name) => name.endsWith('/mazi.json') || name === 'mazi.json')
  if (!maziFiles.length) throw new Error('备份包中未找到 mazi.json')
  const books = buildRestoreBookGroups(entries)
  return {
    fileCount: names.length,
    maziCount: maziFiles.length,
    bookCount: books.length,
    totalSize: names.reduce((sum, name) => sum + (entries.get(name)?.length || 0), 0),
    sampleFiles: names.slice(0, 30),
    books: books.map((book) => ({
      name: book.preferredName,
      root: book.root,
      fileCount: book.files.length
    }))
  }
}

export function inspectBackup(booksDir, input = {}) {
  const { buffer, fileName } = decodeZipInput(input)
  const entries = readZipEntries(buffer)
  const summary = validateRestoreEntries(entries)
  return {
    success: true,
    fileName,
    summary,
    suggestedTargetDir: join(
      getRestoreRoot(booksDir),
      safeName(basename(fileName, extname(fileName)), `restore_${Date.now()}`)
    )
  }
}

export async function restoreBackup(booksDir, input = {}) {
  const { buffer, fileName } = decodeZipInput(input)
  const entries = readZipEntries(buffer)
  const summary = validateRestoreEntries(entries)
  const restoreMode = String(
    input.restoreMode || input.mode || (input.targetDir ? 'archive' : 'library')
  ).toLowerCase()
  if (restoreMode === 'library' || restoreMode === 'bookshelf' || restoreMode === 'current') {
    return await restoreBackupToLibrary(booksDir, entries, summary, fileName)
  }
  const targetDir = resolve(
    String(
      input.targetDir ||
        join(
          getRestoreRoot(booksDir),
          safeName(basename(fileName, extname(fileName)), `restore_${Date.now()}`)
        )
    )
  )
  if (resolve(targetDir) === resolve(booksDir)) throw new Error('不能覆盖当前书库目录')
  if (isInside(booksDir, targetDir) && !isInside(getRestoreRoot(booksDir), targetDir)) {
    throw new Error('恢复目录不能写入当前书库正文区域')
  }
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error('恢复目标目录不是空目录')
  }

  const tempDir = `${targetDir}.tmp-${Date.now()}`
  ensureDir(tempDir)
  try {
    for (const [name, data] of entries.entries()) {
      if (name.endsWith('/')) continue
      const targetPath = resolve(tempDir, name)
      if (!isInside(tempDir, targetPath)) throw new Error('备份包路径无效')
      ensureDir(dirname(targetPath))
      fs.writeFileSync(targetPath, data)
    }
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
    ensureDir(dirname(targetDir))
    moveDirectory(tempDir, targetDir)
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true })
    throw error
  }

  const task = await recordTask(booksDir, {
    type: 'restore',
    title: `恢复 ${fileName}`,
    sourceName: fileName,
    targetDir,
    fileCount: summary.fileCount
  })

  return {
    success: true,
    mode: 'archive',
    targetDir,
    summary,
    task
  }
}

async function restoreBackupToLibrary(booksDir, entries, summary, fileName) {
  const groups = buildRestoreBookGroups(entries)
  if (!groups.length) throw new Error('备份包中未找到可加入书库的书籍')

  const existingIds = new Set(
    (await readBooks(booksDir))
      .map((book) => String(book.id || ''))
      .filter(Boolean)
  )
  const usedIds = new Set(existingIds)
  const reservedNames = new Set()
  const tempRoot = join(getRestoreRoot(booksDir), `.tmp-library-${Date.now()}-${randomUUID()}`)
  const restoredBooks = []
  const movedTargets = []
  ensureDir(tempRoot)

  try {
    for (const group of groups) {
      const folderName = uniqueRestoredBookName(booksDir, group.preferredName, reservedNames)
      const tempBookPath = join(tempRoot, folderName)
      ensureDir(tempBookPath)

      for (const name of group.files) {
        const rel = restoreRelativeName(name, group.root)
        if (!rel) continue
        const targetPath = resolve(tempBookPath, rel)
        if (!isInside(tempBookPath, targetPath)) throw new Error('备份包路径无效')
        ensureDir(dirname(targetPath))
        fs.writeFileSync(targetPath, entries.get(name))
      }

      const metaPath = join(tempBookPath, 'mazi.json')
      const meta = await readJson(metaPath, {})
      const metaId = String(meta.id || '')
      const id = metaId && !usedIds.has(metaId) ? metaId : randomUUID()
      usedIds.add(id)
      await writeJson(metaPath, {
        ...meta,
        id,
        name: folderName,
        restoredFrom: fileName,
        restoredAt: nowIso()
      })

      restoredBooks.push({
        bookName: folderName,
        folderName,
        path: getBookPath(booksDir, folderName),
        fileCount: group.files.length
      })
    }

    for (const book of restoredBooks) {
      const sourcePath = join(tempRoot, book.folderName)
      const targetPath = getBookPath(booksDir, book.folderName)
      if (fs.existsSync(targetPath)) throw new Error(`书库中已存在 ${book.folderName}`)
      moveDirectory(sourcePath, targetPath)
      movedTargets.push(targetPath)
    }
    fs.rmSync(tempRoot, { recursive: true, force: true })
  } catch (error) {
    for (const targetPath of movedTargets) {
      if (isInside(booksDir, targetPath) && fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true })
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true })
    throw error
  }

  const task = await recordTask(booksDir, {
    type: 'restore',
    title: `恢复到当前书库 ${fileName}`,
    sourceName: fileName,
    targetDir: booksDir,
    fileCount: summary.fileCount,
    bookCount: restoredBooks.length,
    restoredBooks
  })

  return {
    success: true,
    mode: 'library',
    targetDir: booksDir,
    summary,
    restoredBooks,
    bookCount: restoredBooks.length,
    task
  }
}

export function listTasks(booksDir) {
  return { success: true, items: readTasks(booksDir) }
}

export default {
  previewImport,
  importBook,
  exportBook,
  createBackup,
  inspectBackup,
  restoreBackup,
  listTasks
}

/**
 * Web 端书籍/章节文件操作 API（供 Vite dev server 中间件使用）
 * 复用当前本地服务逻辑，供 Web 端 HTTP 调用
 *
 * 设计目标：让 Web 模式能复现编辑器需要的核心能力（加载/读取/创建/重命名/删除
 * 卷与章节、笔记本与笔记、章节设置、排序与上次浏览章节等），并使用项目根目录的
 * `.store.json` 文件作为简单的键值仓库，提供本地设置读写能力。
 */
import fs from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  confirmBookIdeaRun as confirmNovelBookIdeaRun,
  recordChapterWrite as recordNovelChapterWrite,
  syncBookDocument as syncNovelBookDocument,
  upsertProjectFromBook as upsertNovelProjectFromBook
} from './novelDatabaseService.js'
import { readJson, writeJson } from './webJsonRepository.js'

const IMAGE_CONTENT_TYPE_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
}
const MAX_COVER_BYTES = 10 * 1024 * 1024
const COVER_DOWNLOAD_TIMEOUT_MS = 15000
const BOOK_ROLE = {
  CREATIVE: 'creative',
  DOWNLOADED: 'downloaded'
}
const DOWNLOADED_BOOK_SOURCE_TYPES = new Set([
  'download',
  'downloaded',
  'downloadedNovel',
  'novel_download',
  'novelDownload'
])
const BOOK_DOCUMENT_TYPES = {
  'mazi.json': 'meta',
  'characters.json': 'characters',
  'settings.json': 'settings',
  'outlines.json': 'outlines',
  'timelines.json': 'timeline',
  'dictionary.json': 'dictionary',
  'entity_profiles.json': 'entity_profiles',
  'outline-ai-sessions.json': 'outline_ai_sessions',
  'sequence-charts.json': 'sequence_charts'
}

function isImportExportBook(meta = {}) {
  return meta.importedFrom === 'importExport'
}

function countChapterWords(content) {
  if (!content) return 0
  return String(content).replace(/[\s\n\r\t]/g, '').length
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return 0
}

function calculateBookTextStats(bookName, booksDir) {
  const bookPath = join(booksDir, bookName)
  const volumeRootPath = join(bookPath, '正文')
  const stats = { totalWords: 0, chapterCount: 0 }

  if (!fs.existsSync(volumeRootPath)) return stats

  const volumes = fs.readdirSync(volumeRootPath, { withFileTypes: true })
  for (const volume of volumes) {
    if (!volume.isDirectory()) continue
    const currentVolumePath = join(volumeRootPath, volume.name)
    const files = fs.readdirSync(currentVolumePath, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.txt')) continue
      stats.chapterCount += 1
      try {
        stats.totalWords += countChapterWords(
          fs.readFileSync(join(currentVolumePath, file.name), 'utf-8')
        )
      } catch (error) {
        console.warn('统计章节字数失败:', error.message)
      }
    }
  }

  return stats
}

function normalizeBookRole(meta = {}) {
  if (isImportExportBook(meta)) {
    return BOOK_ROLE.CREATIVE
  }
  if (meta.bookRole === BOOK_ROLE.CREATIVE || meta.bookRole === BOOK_ROLE.DOWNLOADED) {
    return meta.bookRole
  }
  if (
    meta.downloaded === true ||
    meta.importedFrom === 'novelDownload' ||
    DOWNLOADED_BOOK_SOURCE_TYPES.has(meta.sourceType) ||
    String(meta.intro || '').trim() === '从网络下载'
  ) {
    return BOOK_ROLE.DOWNLOADED
  }
  return BOOK_ROLE.CREATIVE
}

function normalizeBookStorageMeta(meta = {}) {
  const bookRole = normalizeBookRole(meta)
  if (!isImportExportBook(meta)) {
    return { ...meta, bookRole }
  }
  return {
    ...meta,
    type: meta.type === 'imported' ? 'original' : meta.type || 'original',
    typeName: meta.typeName === '导入' ? '导入作品' : meta.typeName || '导入作品',
    sourceType:
      meta.sourceType === 'downloaded' ? 'user_imported' : meta.sourceType || 'user_imported',
    downloaded: false,
    bookRole
  }
}

// ---------------------------------------------------------------------------
// 章节命名工具（与主进程保持一致）
// ---------------------------------------------------------------------------

const CHINESE_NUMBERS = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
  两: 2,
  廿: 20,
  卅: 30,
  卌: 40,
  皕: 200
}

function parseChineseNumber(str) {
  if (!str) return 0
  if (/^\d+$/.test(str)) return parseInt(str, 10)
  let result = 0
  let section = 0
  let number = 0
  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const digit = CHINESE_NUMBERS[char]
    if (digit === undefined) continue
    if (digit >= 10) {
      if (number === 0) number = 1
      section += number * digit
      number = 0
      if (digit >= 10000) {
        result += section * digit
        section = 0
      }
    } else {
      number = number * 10 + digit
    }
  }
  return result + section + number
}

function parseChapterName(name) {
  const match = String(name || '').match(/^第(.+?)([章回集节部卷])\s*(.*)$/)
  if (!match) return null
  const [, rawNumber, suffix, description] = match
  let number
  if (/^\d+$/.test(rawNumber)) {
    number = parseInt(rawNumber, 10)
  } else {
    number = parseChineseNumber(rawNumber)
  }
  if (!Number.isFinite(number) || number <= 0) return null
  return { number, suffix, description: description || '' }
}

function convertNumberToChinese(num) {
  if (num <= 0) return '零'
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const units = ['', '十', '百', '千']
  const bigUnits = ['', '万', '亿']
  if (num < 10) return digits[num]
  const parts = []
  let unitIndex = 0
  let n = num
  while (n > 0) {
    const section = n % 10000
    if (section > 0 || parts.length === 0) {
      parts.unshift(formatSection(section, digits, units) + bigUnits[unitIndex])
    }
    n = Math.floor(n / 10000)
    unitIndex++
  }
  return parts.join('').replace(/零+/g, '零').replace(/零+$/, '')
}

function formatSection(num, digits, units) {
  let result = ''
  let zero = false
  for (let i = 3; i >= 0; i--) {
    const digit = Math.floor(num / Math.pow(10, i)) % 10
    if (digit === 0) {
      if (!zero && result) zero = true
    } else {
      if (zero) {
        result += '零'
        zero = false
      }
      result += digits[digit] + units[i]
    }
  }
  return result || '零'
}

function generateChapterName(number, settings) {
  const format = settings?.chapterFormat === 'hanzi' ? 'hanzi' : 'number'
  const suffix = settings?.suffixType || settings?.suffix || '章'
  const numberPart = format === 'hanzi' ? convertNumberToChinese(number) : String(number)
  return `第${numberPart}${suffix}`
}

// ---------------------------------------------------------------------------
// 简易键值仓库（用 `.store.json` 文件保存本地设置）
// ---------------------------------------------------------------------------

const STORE_FILE = resolve('.store.json')

function readStore() {
  if (!fs.existsSync(STORE_FILE)) return {}
  let store
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8') || 'null')
  } catch (error) {
    throw new Error(`本地设置读取失败：${error.message}`)
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('本地设置格式异常，已停止读取本地设置')
  }
  return store
}

function writeStore(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('本地设置格式异常，已停止写入本地设置')
  }
  writeJson(STORE_FILE, data || {})
  return true
}

export function storeGet(key) {
  if (!key) return null
  const store = readStore()
  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
}

export function storeSet(key, value) {
  if (!key) return false
  const store = readStore()
  store[key] = value
  writeStore(store)
  return true
}

export function storeDelete(key) {
  if (!key) return false
  const store = readStore()
  if (Object.prototype.hasOwnProperty.call(store, key)) {
    delete store[key]
    writeStore(store)
  }
  return true
}

// ---------------------------------------------------------------------------
// 卷创建顺序元数据（与主进程相同的 key 规范）
// ---------------------------------------------------------------------------

function getVolumeOrderKey(bookName) {
  return `volumeOrder:${bookName}`
}

function requireVolumeOrder(value, bookName, action = '读取卷顺序') {
  if (Array.isArray(value) && value.every((name) => typeof name === 'string')) {
    return [...value]
  }
  throw new Error(`${bookName} 卷顺序记录格式异常，已停止${action}以免覆盖原始记录`)
}

function readVolumeOrder(bookName, action = '读取卷顺序') {
  const value = storeGet(getVolumeOrderKey(bookName))
  if (value == null) return []
  return requireVolumeOrder(value, bookName, action)
}

function writeVolumeOrder(bookName, order) {
  storeSet(getVolumeOrderKey(bookName), requireVolumeOrder(order, bookName, '写入卷顺序'))
}

function safeAssetName(value, fallback = '未命名') {
  const name = String(value || fallback).trim() || fallback
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function nowText() {
  return new Date().toLocaleString()
}

function resolveBookDirPath(booksDir, bookName) {
  if (!booksDir || !bookName) return null
  const root = resolve(booksDir)
  const target = resolve(root, safeAssetName(bookName))
  const relativePath = relative(root, target)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null
  }
  return target
}

function requirePathSegment(value, label) {
  const segment = String(value || '').trim()
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\') ||
    segment.includes('\0') ||
    isAbsolute(segment)
  ) {
    throw new Error(`${label}无效`)
  }
  return segment
}

function resolveBookChildPath(booksDir, bookName, ...parts) {
  const root = resolve(booksDir)
  const safeBookName = requirePathSegment(bookName, '书籍名称')
  const safeParts = parts.map((part, index) => requirePathSegment(part, `路径名称 ${index + 1}`))
  const target = resolve(root, safeBookName, ...safeParts)
  const relativePath = relative(root, target)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('文件路径不在当前书库内')
  }
  return target
}

function extensionFromImageMime(mimeType, fallback = 'jpg') {
  return IMAGE_CONTENT_TYPE_EXTENSION[String(mimeType || '').split(';')[0]] || fallback
}

function removeBookCover(bookPath, coverUrl) {
  if (!coverUrl) return
  const root = resolve(bookPath)
  const oldCoverPath = resolve(root, String(coverUrl))
  const relativePath = relative(root, oldCoverPath)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('封面文件路径无效')
  }
  if (!fs.existsSync(oldCoverPath)) return
  fs.unlinkSync(oldCoverPath)
}

function parseCoverDataUrl(imageData) {
  const match = String(imageData || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
  if (!match) throw new Error('封面图片必须通过网页上传')
  const [, mimeType, base64Data] = match
  const extension = IMAGE_CONTENT_TYPE_EXTENSION[mimeType]
  if (!extension) throw new Error('封面图片格式不受支持')
  const buffer = Buffer.from(base64Data, 'base64')
  if (!buffer.length) throw new Error('封面图片内容为空')
  if (buffer.length > MAX_COVER_BYTES) throw new Error('封面图片不能超过 10 MB')
  if (!matchesImageSignature(buffer, extension)) throw new Error('封面图片内容与格式不匹配')
  return { buffer, extension }
}

function matchesImageSignature(buffer, extension) {
  if (extension === 'jpg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (extension === 'png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  }
  if (extension === 'gif') {
    const header = buffer.subarray(0, 6).toString('ascii')
    return header === 'GIF87a' || header === 'GIF89a'
  }
  if (extension === 'webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  if (extension === 'avif') {
    return buffer.length >= 12 && buffer.subarray(4, 12).toString('ascii') === 'ftypavif'
  }
  return false
}

function writeDataUrlCover(bookPath, imageData) {
  const { buffer, extension } = parseCoverDataUrl(imageData)
  const coverFileName = `cover.${extension}`
  fs.writeFileSync(join(bookPath, coverFileName), buffer)
  return coverFileName
}

function saveCoverImageSource(bookPath, source, existingCoverUrl = '') {
  const value = String(source || '').trim()
  if (!value) return ''
  const coverFileName = writeDataUrlCover(bookPath, value)
  if (existingCoverUrl && existingCoverUrl !== coverFileName) {
    removeBookCover(bookPath, existingCoverUrl)
  }
  return coverFileName
}

function requireRemoteCoverUrl(value) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('远程封面地址无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('远程封面只支持 HTTP 或 HTTPS 地址')
  }
  return url
}

async function downloadRemoteCover(source) {
  const url = requireRemoteCoverUrl(source)
  const response = await fetch(url, { signal: AbortSignal.timeout(COVER_DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`远程封面下载失败：HTTP ${response.status}`)
  const contentType = response.headers.get('content-type')?.split(';')[0] || ''
  const extension = IMAGE_CONTENT_TYPE_EXTENSION[contentType]
  if (!extension) throw new Error('远程封面返回的不是受支持的图片')
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_COVER_BYTES) {
    throw new Error('远程封面不能超过 10 MB')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 8 * 1024) throw new Error('封面图片过小，可能是站点占位图')
  if (buffer.length > MAX_COVER_BYTES) throw new Error('远程封面不能超过 10 MB')
  if (!matchesImageSignature(buffer, extension)) throw new Error('远程封面内容与格式不匹配')
  return { buffer, extension }
}

function getBookPath(booksDir, bookName) {
  return resolveBookChildPath(booksDir, safeAssetName(bookName))
}

function ensureBookPath(booksDir, bookName) {
  const bookPath = getBookPath(booksDir, bookName)
  fs.mkdirSync(bookPath, { recursive: true })
  return bookPath
}

function syncNovelProject(booksDir, bookName, extra = {}) {
  if (!bookName || !booksDir) return null
  const safeBookName = safeAssetName(bookName)
  return upsertNovelProjectFromBook({
    booksDir,
    bookName: safeBookName,
    bookPath: getBookPath(booksDir, safeBookName),
    ...extra
  })
}

function syncNovelDocument(booksDir, bookName, documentType, fileName) {
  if (!bookName || !booksDir) return null
  const safeBookName = safeAssetName(bookName)
  return syncNovelBookDocument({
    booksDir,
    bookName: safeBookName,
    bookPath: getBookPath(booksDir, safeBookName),
    documentType,
    fileName
  })
}

function documentItemCount(data) {
  return Array.isArray(data) ? data.length : undefined
}

function bookDocumentWriteResult({
  bookName,
  bookPath,
  fileName,
  documentType,
  documentRecord,
  data
}) {
  const resolvedType = documentRecord?.documentType || documentType || ''
  const documentPath = documentRecord?.documentPath || join(bookPath, fileName)
  const result = {
    success: true,
    bookName,
    fileName,
    documentType: resolvedType,
    projectId: documentRecord?.projectId || '',
    path: documentPath,
    documentPath,
    databaseSync: {
      success: Boolean(!resolvedType || documentRecord),
      projectId: documentRecord?.projectId || '',
      documentType: resolvedType,
      documentPath: documentRecord?.documentPath || '',
      updatedAt: documentRecord?.updatedAt || ''
    }
  }
  const itemCount = documentItemCount(data)
  if (itemCount !== undefined) result.itemCount = itemCount
  if (resolvedType && !documentRecord) {
    result.success = false
    result.message = '资料已写入文件，但数据库未记录快照'
  }
  return result
}

function bookMetadataWriteResult({ bookName, originalName, bookPath, project, documentRecord }) {
  const fileName = 'mazi.json'
  const documentType = documentRecord?.documentType || BOOK_DOCUMENT_TYPES[fileName] || ''
  const projectId = project?.id || documentRecord?.projectId || ''
  const documentPath = documentRecord?.documentPath || join(bookPath, fileName)
  const result = {
    success: true,
    bookName,
    originalName: originalName || '',
    folderName: safeAssetName(bookName),
    renamed: safeAssetName(originalName) !== safeAssetName(bookName),
    fileName,
    documentType,
    projectId,
    bookPath,
    path: documentPath,
    documentPath,
    databaseSync: {
      success: Boolean(project && documentRecord),
      projectId,
      bookName: project?.bookName || '',
      documentType,
      documentPath: documentRecord?.documentPath || '',
      updatedAt: documentRecord?.updatedAt || project?.updatedAt || ''
    }
  }
  if (!project || !documentRecord) {
    result.success = false
    result.message = '书籍资料已写入文件，但数据库未记录作品资料'
  }
  return result
}

function syncWrittenChapter(
  booksDir,
  { bookName, volumeName, chapterName, previousChapterName, content, filePath }
) {
  if (!bookName || !volumeName || !chapterName || content == null) return null
  const safeBookName = safeAssetName(bookName)
  const text = String(content)
  return recordNovelChapterWrite({
    booksDir,
    bookName: safeBookName,
    bookPath: getBookPath(booksDir, safeBookName),
    chapter: {
      volumeName,
      chapterName,
      previousChapterName,
      filePath,
      content: text,
      wordCount: countChapterWords(text),
      status: 'saved',
      mode: 'manual_edit'
    }
  })
}

function readBookJsonResult(booksDir, bookName, fileName, fallback, label) {
  if (!bookName || !booksDir) return { success: false, message: '书籍名称不能为空' }
  const filePath = join(getBookPath(booksDir, bookName), fileName)
  if (!fs.existsSync(filePath)) {
    return { success: true, data: fallback }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    return { success: true, data: parsed == null ? fallback : parsed }
  } catch (error) {
    return { success: false, message: `读取${label}失败：${error.message}` }
  }
}

function readBookArrayJsonResult(booksDir, bookName, fileName, label) {
  const result = readBookJsonResult(booksDir, bookName, fileName, [], label)
  if (!result.success) return result
  if (!Array.isArray(result.data)) {
    return { success: false, message: `${label}数据必须是数组` }
  }
  return result
}

function requireBookArrayPayload(data, label) {
  if (!Array.isArray(data)) {
    return { success: false, message: `${label}数据必须是数组` }
  }
  return { success: true, data }
}

function validateOutlineNodePayload(node, label = '大纲') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { success: false, message: `${label}节点必须是对象` }
  }
  if (Object.prototype.hasOwnProperty.call(node, 'children')) {
    if (!Array.isArray(node.children)) {
      return { success: false, message: `${label}节点 children 必须是数组` }
    }
    for (const child of node.children) {
      const childResult = validateOutlineNodePayload(child, label)
      if (!childResult.success) return childResult
    }
  }
  return { success: true }
}

function requireOutlinePayload(data) {
  if (Array.isArray(data)) {
    for (const node of data) {
      const nodeResult = validateOutlineNodePayload(node)
      if (!nodeResult.success) return nodeResult
    }
    return { success: true, data }
  }
  if (!data || typeof data !== 'object') {
    return { success: false, message: '大纲数据必须是对象或数组' }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'children') && !Array.isArray(data.children)) {
    return { success: false, message: '大纲 children 必须是数组' }
  }
  for (const node of data.children || []) {
    const nodeResult = validateOutlineNodePayload(node)
    if (!nodeResult.success) return nodeResult
  }
  return { success: true, data }
}

function requireOutlineAiSessionsPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { success: false, message: 'AI 大纲会话数据必须是对象' }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'nodes')) {
    if (!data.nodes || typeof data.nodes !== 'object' || Array.isArray(data.nodes)) {
      return { success: false, message: 'AI 大纲会话 nodes 必须是对象' }
    }
  }
  return {
    success: true,
    data: {
      ...data,
      version: Number(data.version) || 1,
      nodes: data.nodes || {}
    }
  }
}

function writeBookJson(booksDir, bookName, fileName, data) {
  if (!bookName || !booksDir) return { success: false, message: '书籍名称不能为空' }
  const bookPath = ensureBookPath(booksDir, bookName)
  const filePath = join(bookPath, fileName)
  writeJson(filePath, data)
  const documentType = BOOK_DOCUMENT_TYPES[fileName]
  let documentRecord = null
  if (documentType) {
    documentRecord = syncNovelDocument(booksDir, bookName, documentType, fileName)
  }
  return bookDocumentWriteResult({
    bookName,
    bookPath,
    fileName,
    documentType,
    documentRecord,
    data
  })
}

function getDirCreateTimeMs(dirPath) {
  try {
    const st = fs.statSync(dirPath)
    if (Number.isFinite(st.birthtimeMs) && st.birthtimeMs > 0) return st.birthtimeMs
    if (Number.isFinite(st.ctimeMs) && st.ctimeMs > 0) return st.ctimeMs
    if (Number.isFinite(st.mtimeMs) && st.mtimeMs > 0) return st.mtimeMs
    return 0
  } catch {
    return 0
  }
}

function ensureVolumeOrder(bookName, bookPath, volumeNames) {
  let order = readVolumeOrder(bookName, '读取章节目录')

  order = order.filter((name) => volumeNames.includes(name))

  const missing = volumeNames.filter((name) => !order.includes(name))
  if (missing.length > 0) {
    const withTime = missing.map((name) => ({
      name,
      t: getDirCreateTimeMs(join(bookPath, '正文', name))
    }))
    withTime.sort((a, b) => a.t - b.t)
    order.push(...withTime.map((x) => x.name))
  }

  if (order.length === 0 && volumeNames.length > 0) {
    const withTime = volumeNames.map((name) => ({
      name,
      t: getDirCreateTimeMs(join(bookPath, '正文', name))
    }))
    withTime.sort((a, b) => a.t - b.t)
    order = withTime.map((x) => x.name)
  }

  writeVolumeOrder(bookName, order)
  return order
}

// ---------------------------------------------------------------------------
// 书籍基础 API（已有 + 兼容）
// ---------------------------------------------------------------------------

export async function createBook(bookInfo, booksDir) {
  const safeName = String(bookInfo.name || '').replace(/[\\/:*?"<>|]/g, '_')
  if (!safeName) return { success: false, message: '书籍名称不能为空' }
  let bookPath
  try {
    bookPath = resolveBookChildPath(booksDir, safeName)
  } catch (error) {
    return { success: false, message: error.message || '书籍名称无效' }
  }
  if (fs.existsSync(bookPath)) {
    return {
      success: false,
      message: '已存在同名书籍',
      bookName: safeName,
      folderName: safeName,
      bookPath,
      existed: true
    }
  }
  try {
    fs.mkdirSync(bookPath)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return {
        success: false,
        message: '已存在同名书籍',
        bookName: safeName,
        folderName: safeName,
        bookPath,
        existed: true
      }
    }
    throw error
  }

  let coverUrl = bookInfo.coverUrl || null
  let coverWarning = ''
  if (bookInfo.coverImagePath) {
    try {
      const savedCoverUrl = saveCoverImageSource(bookPath, bookInfo.coverImagePath)
      if (savedCoverUrl) coverUrl = savedCoverUrl
    } catch (error) {
      fs.rmSync(bookPath, { recursive: true, force: true })
      return { success: false, message: error.message || '封面图片保存失败' }
    }
  }
  if (!coverUrl && bookInfo.coverRemoteUrl) {
    try {
      const { buffer, extension } = await downloadRemoteCover(bookInfo.coverRemoteUrl)
      const coverFileName = `cover.${extension}`
      fs.writeFileSync(join(bookPath, coverFileName), buffer)
      coverUrl = coverFileName
    } catch (error) {
      console.error('Web 端下载小说封面失败:', error)
      coverWarning = error?.message || '远程封面下载失败'
    }
  }

  const meta = {
    id: bookInfo.id,
    name: bookInfo.name,
    type: bookInfo.type || 'xuanhua',
    typeName: bookInfo.typeName || '玄幻',
    targetCount: bookInfo.targetCount || 0,
    totalWords: bookInfo.totalWords || 0,
    intro: bookInfo.intro || '',
    sourceType: bookInfo.sourceType || '',
    downloaded: Boolean(bookInfo.downloaded),
    importedFrom: bookInfo.importedFrom || '',
    bookRole: normalizeBookRole(bookInfo),
    password: bookInfo.password || null,
    coverColor: bookInfo.coverColor || '#22345c',
    coverUrl,
    coverImagePath: null,
    createdAt: nowText(),
    updatedAt: nowText()
  }
  writeJson(join(bookPath, 'mazi.json'), meta)

  fs.mkdirSync(join(bookPath, '正文'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记'), { recursive: true })
  fs.mkdirSync(join(bookPath, '正文', '正文'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '大纲'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '设定'), { recursive: true })
  fs.mkdirSync(join(bookPath, '笔记', '人物'), { recursive: true })

  fs.writeFileSync(join(bookPath, '正文', '正文', '第1章.txt'), '')

  const project = syncNovelProject(booksDir, safeName, { meta })
  const documentRecord = syncNovelDocument(
    booksDir,
    safeName,
    BOOK_DOCUMENT_TYPES['mazi.json'],
    'mazi.json'
  )
  let bookIdeaRun = null
  if (bookInfo.bookIdeaRunId || bookInfo.selectedPlanId) {
    try {
      bookIdeaRun = confirmNovelBookIdeaRun({
        booksDir,
        bookName: safeName,
        bookPath,
        meta,
        bookIdeaRunId: bookInfo.bookIdeaRunId,
        selectedPlanId: bookInfo.selectedPlanId,
        selectedPlan: bookInfo.selectedPlan,
        status: 'confirmed'
      })
    } catch (error) {
      console.error('Web 端确认 AI 开书立项失败:', error)
    }
  }
  return {
    ...bookMetadataWriteResult({
      bookName: safeName,
      originalName: '',
      bookPath,
      project,
      documentRecord
    }),
    bookIdeaRun,
    coverWarning
  }
}

export async function readBooksDir(booksDir) {
  const books = []
  if (!booksDir || typeof booksDir !== 'string') return books
  if (!fs.existsSync(booksDir)) {
    throw new Error('书籍目录不存在，请重新选择书库目录')
  }
  let files = []
  try {
    files = fs.readdirSync(booksDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`读取书籍目录失败：${error?.message || '未知错误'}`)
  }
  for (const file of files) {
    if (file.isDirectory()) {
      const metaPath = join(booksDir, file.name, 'mazi.json')
      if (fs.existsSync(metaPath)) {
        try {
          const meta = readJson(metaPath, null)
          if (!meta || typeof meta !== 'object') continue
          const stats = calculateBookTextStats(file.name, booksDir)
          const totalWords = firstPositiveNumber(
            stats.totalWords,
            meta.totalWords,
            meta.wordCount,
            meta.words,
            meta.totalWordCount,
            meta.metadata?.totalWords,
            meta.metadata?.wordCount
          )
          const chapterCount = firstPositiveNumber(
            stats.chapterCount,
            meta.totalChapterCount,
            meta.chapterCount
          )
          const normalizedMeta = normalizeBookStorageMeta({
            ...meta,
            totalWords,
            totalChapterCount: chapterCount,
            chapterCount
          })
          if (
            normalizedMeta.totalWords !== meta.totalWords ||
            normalizedMeta.totalChapterCount !== meta.totalChapterCount ||
            normalizedMeta.chapterCount !== meta.chapterCount ||
            normalizedMeta.bookRole !== meta.bookRole ||
            normalizedMeta.downloaded !== meta.downloaded ||
            normalizedMeta.sourceType !== meta.sourceType ||
            normalizedMeta.type !== meta.type ||
            normalizedMeta.typeName !== meta.typeName
          ) {
            writeJson(metaPath, normalizedMeta)
          }
          books.push({ ...normalizedMeta, folderName: file.name })
        } catch {
          // ignore
        }
      }
    }
  }
  books.sort((a, b) => {
    const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(0)
    const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(0)
    return dateB.getTime() - dateA.getTime()
  })
  return books
}

export async function deleteBook(bookName, booksDir) {
  try {
    const safeBookName = safeAssetName(bookName, '')
    if (!booksDir) return { success: false, message: 'booksDir not set' }
    if (!safeBookName) return { success: false, message: '书籍名称不能为空' }
    const bookPath = resolveBookDirPath(booksDir, bookName)
    if (!bookPath) return { success: false, message: '书籍目录无效', bookName: safeBookName }
    if (!fs.existsSync(bookPath)) {
      return {
        success: false,
        message: '书籍不存在',
        bookName: safeBookName,
        bookPath,
        existed: false
      }
    }
    fs.rmSync(bookPath, { recursive: true, force: true })
    return {
      success: true,
      bookName: safeBookName,
      folderName: safeBookName,
      bookPath,
      deleted: true,
      existed: true
    }
  } catch (error) {
    return { success: false, message: error.message || '删除失败' }
  }
}

export async function editBook(bookInfo = {}, booksDir) {
  try {
    if (!booksDir) return { success: false, message: 'booksDir not set' }
    const originalName = bookInfo.originalName || bookInfo.folderName || bookInfo.name
    let bookPath = resolveBookDirPath(booksDir, originalName)
    if (!bookPath || !fs.existsSync(bookPath)) {
      return { success: false, message: '书籍不存在' }
    }

    const metaPath = join(bookPath, 'mazi.json')
    const existingMeta = readJson(metaPath, null)
    if (!existingMeta || typeof existingMeta !== 'object') {
      return { success: false, message: '书籍元数据不存在' }
    }

    const nextFolderName = safeAssetName(bookInfo.name || originalName)
    let newBookPath = bookPath
    if (nextFolderName !== safeAssetName(originalName)) {
      newBookPath = resolveBookDirPath(booksDir, nextFolderName)
      if (!newBookPath) return { success: false, message: '书籍名称无效' }
      if (fs.existsSync(newBookPath)) {
        return { success: false, message: '已存在同名书籍' }
      }
    }

    let coverUrl = bookInfo.coverUrl || existingMeta.coverUrl || null
    if (bookInfo.coverImagePath) {
      const savedCoverUrl = saveCoverImageSource(
        bookPath,
        bookInfo.coverImagePath,
        existingMeta.coverUrl
      )
      if (savedCoverUrl) coverUrl = savedCoverUrl
    } else if (bookInfo.coverUrl === null || bookInfo.coverUrl === '') {
      removeBookCover(bookPath, existingMeta.coverUrl)
      coverUrl = null
    } else if (
      typeof bookInfo.coverUrl === 'string' &&
      bookInfo.coverUrl &&
      existingMeta.coverUrl &&
      bookInfo.coverUrl !== existingMeta.coverUrl
    ) {
      removeBookCover(bookPath, existingMeta.coverUrl)
    }

    if (nextFolderName !== safeAssetName(originalName)) {
      fs.renameSync(bookPath, newBookPath)
      bookPath = newBookPath
    }

    const bookData = { ...bookInfo }
    delete bookData.coverImagePath
    delete bookData.coverRemoteUrl
    delete bookData.folderName
    delete bookData.originalName
    const mergedMeta = {
      ...existingMeta,
      ...bookData,
      name: bookInfo.name || existingMeta.name,
      bookRole: normalizeBookRole({ ...existingMeta, ...bookData }),
      coverUrl,
      updatedAt: nowText()
    }
    writeJson(join(bookPath, 'mazi.json'), mergedMeta)
    const project = syncNovelProject(booksDir, nextFolderName, {
      meta: mergedMeta,
      previousBookName: originalName
    })
    const documentRecord = syncNovelDocument(
      booksDir,
      nextFolderName,
      BOOK_DOCUMENT_TYPES['mazi.json'],
      'mazi.json'
    )
    return bookMetadataWriteResult({
      bookName: nextFolderName,
      originalName,
      bookPath,
      project,
      documentRecord
    })
  } catch (error) {
    return { success: false, message: error.message || '编辑失败' }
  }
}

async function updateBookMetadata(bookName, booksDir) {
  if (!bookName || !booksDir) return null
  const safeBookName = safeAssetName(bookName)
  const metaPath = join(getBookPath(booksDir, safeBookName), 'mazi.json')
  if (!fs.existsSync(metaPath)) return null
  const meta = readJson(metaPath, null)
  if (!meta || typeof meta !== 'object') return null
  const stats = calculateBookTextStats(safeBookName, booksDir)
  meta.totalWords = stats.totalWords
  meta.totalChapterCount = stats.chapterCount
  meta.chapterCount = stats.chapterCount
  meta.updatedAt = new Date().toLocaleString()
  writeJson(metaPath, meta)
  return syncNovelProject(booksDir, safeBookName, { meta })
}

export async function saveChapter(
  { bookName, volumeName, chapterName, newName, content },
  booksDir
) {
  const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volumeName)
  const safeChapterName = requirePathSegment(chapterName, '章节名称')
  const oldPath = join(volumePath, `${safeChapterName}.txt`)
  const finalName = requirePathSegment(newName || chapterName, '章节名称')
  const targetPath = join(volumePath, `${finalName}.txt`)

  if (!fs.existsSync(oldPath)) {
    return { success: false, message: '章节不存在' }
  }
  if (newName && finalName !== chapterName && fs.existsSync(targetPath)) {
    return { success: false, message: '章节名已存在', name: chapterName }
  }

  const oldContent = fs.readFileSync(oldPath, 'utf-8')
  const nextContent = content === undefined || content === null ? '' : String(content)
  const isClearingExistingChapter =
    oldContent.trim().length > 0 && nextContent.trim().length === 0 && !String(newName || '').trim()

  if (isClearingExistingChapter) {
    return { success: false, message: '已阻止空内容覆盖已有章节' }
  }

  fs.writeFileSync(oldPath, nextContent, 'utf-8')

  if (newName && finalName !== chapterName) {
    fs.renameSync(oldPath, targetPath)
  }

  await updateBookMetadata(bookName, booksDir)
  const finalPath = newName && finalName !== chapterName ? targetPath : oldPath
  const chapterRecord = syncWrittenChapter(booksDir, {
    bookName,
    volumeName,
    chapterName: finalName,
    previousChapterName: newName && finalName !== chapterName ? chapterName : '',
    content: nextContent,
    filePath: finalPath
  })
  return {
    success: true,
    bookName,
    volumeName,
    chapterName: finalName,
    previousChapterName: newName && finalName !== chapterName ? chapterName : '',
    name: finalName,
    filePath: finalPath,
    wordCount: countChapterWords(nextContent),
    databaseSync: {
      success: Boolean(chapterRecord),
      projectId: chapterRecord?.projectId || '',
      chapterId: chapterRecord?.id || '',
      volumeName: chapterRecord?.volumeName || '',
      chapterName: chapterRecord?.chapterName || '',
      filePath: chapterRecord?.filePath || '',
      wordCount: Number(chapterRecord?.wordCount || 0),
      updatedAt: chapterRecord?.updatedAt || ''
    }
  }
}

export async function createChapter({ bookName, volumeId }, booksDir) {
  const bookPath = resolveBookChildPath(booksDir, bookName)
  const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volumeId)
  if (!fs.existsSync(volumePath)) {
    fs.mkdirSync(volumePath, { recursive: true })
  }

  const files = fs.readdirSync(volumePath, { withFileTypes: true })
  const chapters = files.filter((f) => f.isFile() && f.name.endsWith('.txt'))

  let nextChapterNumber = 1
  if (chapters.length > 0) {
    const chapterNumbers = chapters
      .map((f) => {
        const parsed = parseChapterName(f.name.replace('.txt', ''))
        return parsed?.number || 0
      })
      .filter((n) => n > 0)
    if (chapterNumbers.length > 0) {
      nextChapterNumber = Math.max(...chapterNumbers) + 1
    } else {
      nextChapterNumber = chapters.length + 1
    }
  }

  const chapterSettings = storeGet(`chapterSettings:${bookName}`) || {
    chapterFormat: 'number',
    suffixType: '章',
    targetWords: 2000
  }
  const chapterName = generateChapterName(nextChapterNumber, chapterSettings)
  const filePath = join(volumePath, `${chapterName}.txt`)
  fs.writeFileSync(filePath, '')

  return { success: true, chapterName, filePath }
}

export async function upsertChapter(
  { bookName, volumeName, chapterName, content, overwrite = false },
  booksDir
) {
  const cleanChapterName = String(chapterName || '').trim()
  if (!bookName || !volumeName || !cleanChapterName) {
    return { success: false, exists: false, message: '参数不完整' }
  }

  requirePathSegment(cleanChapterName, '章节名称')
  const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volumeName)
  if (!fs.existsSync(volumePath)) {
    fs.mkdirSync(volumePath, { recursive: true })
  }

  const chapterPath = join(volumePath, `${cleanChapterName}.txt`)
  const exists = fs.existsSync(chapterPath)
  if (exists && !overwrite) {
    return { success: false, exists: true, message: '章节已存在' }
  }

  fs.writeFileSync(chapterPath, String(content || ''), 'utf-8')
  await updateBookMetadata(bookName, booksDir)
  const chapterRecord = syncWrittenChapter(booksDir, {
    bookName,
    volumeName,
    chapterName: cleanChapterName,
    content: String(content || ''),
    filePath: chapterPath
  })
  return {
    success: true,
    bookName,
    volumeName,
    exists,
    chapterName: cleanChapterName,
    filePath: chapterPath,
    wordCount: countChapterWords(String(content || '')),
    databaseSync: {
      success: Boolean(chapterRecord),
      projectId: chapterRecord?.projectId || '',
      chapterId: chapterRecord?.id || '',
      volumeName: chapterRecord?.volumeName || '',
      chapterName: chapterRecord?.chapterName || '',
      filePath: chapterRecord?.filePath || '',
      wordCount: Number(chapterRecord?.wordCount || 0),
      updatedAt: chapterRecord?.updatedAt || ''
    }
  }
}

// ---------------------------------------------------------------------------
// 章节树 / 章节读取 / 卷管理
// ---------------------------------------------------------------------------

export async function loadChapters(bookName, booksDir) {
  if (!bookName) return { success: false, message: '书籍名称不能为空', chapters: [] }
  if (!booksDir) return { success: false, message: '请先选择书库目录', bookName, chapters: [] }
  const bookPath = resolveBookChildPath(booksDir, bookName)
  const volumeRootPath = join(bookPath, '正文')
  if (!fs.existsSync(volumeRootPath)) return { success: true, bookName, chapters: [] }

  const volumes = fs.readdirSync(volumeRootPath, { withFileTypes: true })
  const volumeNames = volumes.filter((v) => v.isDirectory()).map((v) => v.name)
  const volumeOrder = ensureVolumeOrder(bookName, bookPath, volumeNames)

  const chapters = []
  for (const volumeName of volumeOrder) {
    const currentVolumePath = join(bookPath, '正文', volumeName)
    if (!fs.existsSync(currentVolumePath)) continue

    const files = fs.readdirSync(currentVolumePath, { withFileTypes: true })
    const volumeChapters = files
      .filter((file) => file.isFile() && file.name.endsWith('.txt'))
      .map((file) => {
        const name = file.name.replace('.txt', '')
        const parsed = parseChapterName(name)
        const chapterPath = join(bookPath, '正文', volumeName, file.name)
        let wordCount = 0
        try {
          wordCount = countChapterWords(fs.readFileSync(chapterPath, 'utf-8'))
        } catch (error) {
          console.warn('读取章节字数失败:', error.message)
        }
        return {
          id: file.name,
          name,
          type: 'chapter',
          path: chapterPath,
          wordCount,
          orderValue: parsed?.number || 0,
          hasOrderValue: Boolean(parsed?.number)
        }
      })
      .sort((a, b) => {
        if (a.hasOrderValue && b.hasOrderValue) return a.orderValue - b.orderValue
        if (a.hasOrderValue) return -1
        if (b.hasOrderValue) return 1
        return a.name.localeCompare(b.name)
      })

    for (const chapter of volumeChapters) {
      delete chapter.orderValue
      delete chapter.hasOrderValue
    }

    chapters.push({
      id: volumeName,
      name: volumeName,
      type: 'volume',
      path: join(bookPath, '正文', volumeName),
      children: volumeChapters
    })
  }
  return { success: true, bookName, chapters }
}

export async function readChapter({ bookName, volumeName, chapterName }, booksDir) {
  const chapterPath = resolveBookChildPath(
    booksDir,
    bookName,
    '正文',
    volumeName,
    `${requirePathSegment(chapterName, '章节名称')}.txt`
  )
  if (!fs.existsSync(chapterPath)) {
    return { success: false, message: '章节不存在' }
  }
  const content = fs.readFileSync(chapterPath, 'utf-8')
  return {
    success: true,
    bookName,
    volumeName,
    chapterName,
    filePath: chapterPath,
    content,
    wordCount: countChapterWords(content)
  }
}

export async function createVolume(bookName, booksDir) {
  const bookPath = resolveBookChildPath(booksDir, bookName)
  const volumeRootPath = join(bookPath, '正文')
  if (!fs.existsSync(volumeRootPath)) {
    fs.mkdirSync(volumeRootPath, { recursive: true })
  }
  const order = readVolumeOrder(bookName, '创建卷')
  let volumeName = '新加卷'
  let index = 1
  while (fs.existsSync(join(volumeRootPath, volumeName))) {
    volumeName = `新加卷${index}`
    index++
  }
  fs.mkdirSync(join(volumeRootPath, volumeName))

  if (!order.includes(volumeName)) {
    order.push(volumeName)
    writeVolumeOrder(bookName, order)
  }
  return { success: true, volumeName }
}

export async function editNode({ bookName, type, volume, chapter, newName }, booksDir) {
  try {
    if (type === 'volume') {
      const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volume)
      const newVolumePath = resolveBookChildPath(booksDir, bookName, '正文', newName)
      if (!fs.existsSync(volumePath)) return { success: false, message: '原卷不存在' }
      if (volume === newName) {
        return {
          success: true,
          type: 'volume',
          oldName: volume,
          newName,
          volumeName: newName,
          message: '名称未变化'
        }
      }
      if (fs.existsSync(newVolumePath)) return { success: false, message: '新卷名已存在' }
      const order = readVolumeOrder(bookName, '重命名卷')
      fs.renameSync(volumePath, newVolumePath)

      const idx = order.indexOf(volume)
      if (idx !== -1) order[idx] = newName
      else if (!order.includes(newName)) order.push(newName)
      writeVolumeOrder(bookName, order)
      return { success: true, type: 'volume', oldName: volume, newName, volumeName: newName }
    } else if (type === 'chapter') {
      const chapterPath = resolveBookChildPath(
        booksDir,
        bookName,
        '正文',
        volume,
        `${requirePathSegment(chapter, '章节名称')}.txt`
      )
      const newChapterPath = resolveBookChildPath(
        booksDir,
        bookName,
        '正文',
        volume,
        `${requirePathSegment(newName, '章节名称')}.txt`
      )
      if (!fs.existsSync(chapterPath)) return { success: false, message: '原章节不存在' }
      if (chapter === newName) {
        return {
          success: true,
          type: 'chapter',
          volumeName: volume,
          oldName: chapter,
          newName,
          chapterName: newName,
          filePath: chapterPath,
          message: '名称未变化'
        }
      }
      if (fs.existsSync(newChapterPath)) return { success: false, message: '新章节名已存在' }
      fs.renameSync(chapterPath, newChapterPath)
      return {
        success: true,
        type: 'chapter',
        volumeName: volume,
        oldName: chapter,
        newName,
        chapterName: newName,
        filePath: newChapterPath
      }
    }
    return { success: false, message: '类型错误' }
  } catch (error) {
    return { success: false, message: error.message || '编辑失败' }
  }
}

export async function deleteNode({ bookName, type, volume, chapter }, booksDir) {
  if (type === 'volume') {
    const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volume)
    if (!fs.existsSync(volumePath)) return { success: false, message: '卷不存在' }
    const order = readVolumeOrder(bookName, '删除卷').filter((name) => name !== volume)
    fs.rmSync(volumePath, { recursive: true, force: true })
    writeVolumeOrder(bookName, order)
    return { success: true, type: 'volume', volumeName: volume }
  }
  if (type === 'chapter') {
    const chapterPath = resolveBookChildPath(
      booksDir,
      bookName,
      '正文',
      volume,
      `${requirePathSegment(chapter, '章节名称')}.txt`
    )
    if (!fs.existsSync(chapterPath)) return { success: false, message: '章节不存在' }
    fs.rmSync(chapterPath)
    return { success: true, type: 'chapter', volumeName: volume, chapterName: chapter }
  }
  return { success: false, message: '类型错误' }
}

// ---------------------------------------------------------------------------
// 排序与章节设置
// ---------------------------------------------------------------------------

export function getSortOrder(bookName) {
  return storeGet(`sortOrder:${bookName}`) || 'desc'
}

export function setSortOrder({ bookName, order }) {
  if (!bookName || !['asc', 'desc'].includes(order)) {
    return { success: false, message: '排序参数无效' }
  }
  storeSet(`sortOrder:${bookName}`, order)
  return { success: true, order: getSortOrder(bookName) }
}

export function getChapterSettings(bookName) {
  const settings = storeGet(`chapterSettings:${bookName}`) || {
    suffixType: '章',
    targetWords: 2000
  }
  return {
    suffixType: settings.suffixType || '章',
    chapterFormat: settings.chapterFormat || 'number',
    targetWords: Number.isFinite(Number(settings.targetWords)) ? Number(settings.targetWords) : 2000
  }
}

export function setChapterTargetWords({ bookName, targetWords }) {
  if (!bookName) return { success: false, message: '书籍名称不能为空' }
  const numeric = Number(targetWords)
  const sanitized = Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 2000
  const existing = storeGet(`chapterSettings:${bookName}`) || {
    suffixType: '章',
    targetWords: 2000
  }
  const updated = { ...existing, targetWords: sanitized }
  storeSet(`chapterSettings:${bookName}`, updated)
  return { success: true, settings: updated }
}

export async function updateChapterFormat({ bookName, settings: rawSettings }, booksDir) {
  try {
    const bookPath = resolveBookChildPath(booksDir, bookName)
    const volumeRootPath = join(bookPath, '正文')
    if (!fs.existsSync(volumeRootPath)) {
      return { success: false, message: '正文目录不存在' }
    }
    const cleanSettings = {
      chapterFormat: rawSettings?.chapterFormat === 'hanzi' ? 'hanzi' : 'number',
      suffixType: rawSettings?.suffixType || '章',
      targetWords:
        Number.isFinite(Number(rawSettings?.targetWords)) && Number(rawSettings.targetWords) > 0
          ? Number(rawSettings.targetWords)
          : 2000
    }
    const settingsKey = `chapterSettings:${bookName}`
    storeSet(settingsKey, cleanSettings)
    const persistedSettings = storeGet(settingsKey) || {}
    const appliedSettings = {
      chapterFormat: persistedSettings?.chapterFormat === 'hanzi' ? 'hanzi' : 'number',
      suffixType: persistedSettings?.suffixType || '章',
      targetWords:
        Number.isFinite(Number(persistedSettings?.targetWords)) &&
        Number(persistedSettings.targetWords) > 0
          ? Number(persistedSettings.targetWords)
          : 2000
    }

    const volumes = fs.readdirSync(volumeRootPath, { withFileTypes: true })
    let totalRenamed = 0
    for (const volume of volumes) {
      if (!volume.isDirectory()) continue
      const volumeName = volume.name
      const currentVolumePath = join(bookPath, '正文', volumeName)
      const files = fs.readdirSync(currentVolumePath, { withFileTypes: true })
      for (const file of files) {
        if (!(file.isFile() && file.name.endsWith('.txt'))) continue
        const oldName = file.name.replace('.txt', '')
        const parsed = parseChapterName(oldName)
        if (!parsed) continue
        const { number: chapterNumber, description } = parsed
        const newPrefix = generateChapterName(chapterNumber, appliedSettings)
        const newName = description ? `${newPrefix} ${description}` : newPrefix
        if (newName === oldName) continue
        const oldPath = join(currentVolumePath, file.name)
        const newPath = join(currentVolumePath, `${newName}.txt`)
        if (fs.existsSync(newPath)) {
          return { success: false, message: `目标章节已存在: ${newName}` }
        }
        try {
          fs.renameSync(oldPath, newPath)
          totalRenamed++
        } catch (error) {
          return { success: false, message: `重命名失败: ${error.message || error}` }
        }
      }
    }
    return {
      success: true,
      bookName,
      totalRenamed,
      settings: appliedSettings
    }
  } catch (error) {
    return { success: false, message: error.message || '更新失败' }
  }
}

export async function reformatChapterNumbers({ bookName, volumeName, settings }, booksDir) {
  try {
    const bookPath = resolveBookChildPath(booksDir, bookName)
    const volumePath = resolveBookChildPath(booksDir, bookName, '正文', volumeName)
    if (!fs.existsSync(volumePath)) {
      return { success: false, message: '卷目录不存在' }
    }
    const files = fs.readdirSync(volumePath, { withFileTypes: true })
    const chapterFiles = files.filter((file) => file.isFile() && file.name.endsWith('.txt'))
    if (chapterFiles.length === 0) {
      return { success: false, message: '没有找到章节文件' }
    }
    const chapterInfos = chapterFiles.map((file) => {
      const oldName = file.name.replace('.txt', '')
      const parsed = parseChapterName(oldName)
      return { oldName, oldPath: join(volumePath, file.name), parsed }
    })
    chapterInfos.sort((a, b) => {
      const aNum = a.parsed?.number || 0
      const bNum = b.parsed?.number || 0
      if (aNum && bNum) return aNum - bNum
      return a.oldName.localeCompare(b.oldName)
    })
    const cleanSettings = {
      chapterFormat: settings?.chapterFormat === 'hanzi' ? 'hanzi' : 'number',
      suffixType: settings?.suffixType || '章'
    }
    let totalRenamed = 0
    for (let i = 0; i < chapterInfos.length; i++) {
      const info = chapterInfos[i]
      const newNumber = i + 1
      const description = info.parsed?.description || ''
      const newPrefix = generateChapterName(newNumber, cleanSettings)
      const newName = description ? `${newPrefix} ${description}` : newPrefix
      if (newName !== info.oldName) {
        const newPath = join(volumePath, `${newName}.txt`)
        if (fs.existsSync(newPath)) {
          return { success: false, message: `目标章节已存在: ${newName}` }
        }
        try {
          fs.renameSync(info.oldPath, newPath)
          totalRenamed++
        } catch (e) {
          return { success: false, message: `重命名失败: ${e.message || e}` }
        }
      }
    }
    return {
      success: true,
      bookName,
      volumeName,
      message: `成功重新格式化 ${totalRenamed} 个章节`,
      totalRenamed,
      settings: cleanSettings
    }
  } catch (error) {
    return { success: false, message: error.message || '操作失败' }
  }
}

// ---------------------------------------------------------------------------
// 笔记本与笔记
// ---------------------------------------------------------------------------

export async function loadNotes(bookName, booksDir) {
  if (!bookName) return { success: false, message: '书籍名称不能为空', notes: [] }
  if (!booksDir) return { success: false, message: '请先选择书库目录', bookName, notes: [] }
  const bookPath = resolveBookChildPath(booksDir, bookName)
  const notesPath = join(bookPath, '笔记')
  if (!fs.existsSync(notesPath)) return { success: true, bookName, notes: [] }

  function readNotesDir(dir, isRoot = false) {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    return items
      .filter((item) => {
        if (isRoot) return item.isDirectory()
        if (item.isDirectory()) return true
        return item.isFile() && item.name.endsWith('.txt')
      })
      .map((item) => {
        if (item.isDirectory()) {
          return {
            id: item.name,
            name: item.name,
            type: 'folder',
            path: join(dir, item.name),
            children: readNotesDir(join(dir, item.name))
          }
        }
        return {
          id: item.name,
          name: item.name.replace(/\.txt$/, ''),
          type: 'note',
          path: join(dir, item.name)
        }
      })
  }

  return { success: true, bookName, notes: readNotesDir(notesPath, true) }
}

export async function createNotebook({ bookName }, booksDir) {
  const notesPath = resolveBookChildPath(booksDir, bookName, '笔记')
  if (!fs.existsSync(notesPath)) {
    fs.mkdirSync(notesPath, { recursive: true })
  }
  let baseName = '新建笔记本'
  let notebookName = baseName
  let index = 1
  while (fs.existsSync(join(notesPath, notebookName))) {
    notebookName = `${baseName}${index}`
    index++
  }
  fs.mkdirSync(join(notesPath, notebookName))
  return { success: true, notebookName }
}

export async function deleteNotebook({ bookName, notebookName }, booksDir) {
  const notebookPath = resolveBookChildPath(booksDir, bookName, '笔记', notebookName)
  if (!fs.existsSync(notebookPath)) {
    return { success: false, message: '笔记本不存在' }
  }
  fs.rmSync(notebookPath, { recursive: true, force: true })
  return { success: true, notebookName }
}

export async function renameNotebook({ bookName, oldName, newName }, booksDir) {
  const notesPath = resolveBookChildPath(booksDir, bookName, '笔记')
  const oldPath = resolveBookChildPath(booksDir, bookName, '笔记', oldName)
  const newPath = resolveBookChildPath(booksDir, bookName, '笔记', newName)
  if (!fs.existsSync(oldPath)) return { success: false, message: '原笔记本不存在' }
  if (oldName === newName) {
    return { success: true, oldName, newName, notebookName: newName, message: '名称未变化' }
  }
  if (fs.existsSync(newPath)) return { success: false, message: '新笔记本名已存在' }
  fs.renameSync(oldPath, newPath)
  return { success: true, oldName, newName, notebookName: newName }
}

export async function createNote({ bookName, notebookName, noteName }, booksDir) {
  const notebookPath = resolveBookChildPath(booksDir, bookName, '笔记', notebookName)
  if (!fs.existsSync(notebookPath)) return { success: false, message: '笔记本不存在' }
  const baseName = requirePathSegment(noteName || '新建笔记', '笔记名称')
  let fileName = `${baseName}.txt`
  let index = 1
  while (fs.existsSync(join(notebookPath, fileName))) {
    fileName = `${baseName}${index}.txt`
    index++
  }
  fs.writeFileSync(join(notebookPath, fileName), '')
  return { success: true, noteName: fileName.replace(/\.txt$/i, ''), fileName }
}

export async function deleteNote({ bookName, notebookName, noteName }, booksDir) {
  const notePath = resolveBookChildPath(
    booksDir,
    bookName,
    '笔记',
    notebookName,
    `${requirePathSegment(noteName, '笔记名称')}.txt`
  )
  if (!fs.existsSync(notePath)) return { success: false, message: '笔记不存在' }
  fs.rmSync(notePath)
  return { success: true, notebookName, noteName }
}

export async function renameNote({ bookName, notebookName, oldName, newName }, booksDir) {
  const notebookPath = resolveBookChildPath(booksDir, bookName, '笔记', notebookName)
  const oldPath = resolveBookChildPath(
    booksDir,
    bookName,
    '笔记',
    notebookName,
    `${requirePathSegment(oldName, '笔记名称')}.txt`
  )
  const newPath = resolveBookChildPath(
    booksDir,
    bookName,
    '笔记',
    notebookName,
    `${requirePathSegment(newName, '笔记名称')}.txt`
  )
  if (!fs.existsSync(oldPath)) return { success: false, message: '原笔记不存在' }
  if (oldName === newName) {
    return {
      success: true,
      notebookName,
      oldName,
      newName,
      noteName: newName,
      message: '名称未变化'
    }
  }
  if (fs.existsSync(newPath)) return { success: false, message: '新笔记名已存在' }
  fs.renameSync(oldPath, newPath)
  return { success: true, notebookName, oldName, newName, noteName: newName }
}

export async function readNote({ bookName, notebookName, noteName }, booksDir) {
  const notePath = resolveBookChildPath(
    booksDir,
    bookName,
    '笔记',
    notebookName,
    `${requirePathSegment(noteName, '笔记名称')}.txt`
  )
  if (!fs.existsSync(notePath)) return { success: false, message: '笔记不存在' }
  const content = fs.readFileSync(notePath, 'utf-8')
  return { success: true, bookName, notebookName, noteName, filePath: notePath, content }
}

export async function editNote({ bookName, notebookName, noteName, newName, content }, booksDir) {
  const notebookPath = resolveBookChildPath(booksDir, bookName, '笔记', notebookName)
  const oldPath = resolveBookChildPath(
    booksDir,
    bookName,
    '笔记',
    notebookName,
    `${requirePathSegment(noteName, '笔记名称')}.txt`
  )
  const finalName = requirePathSegment(newName || noteName, '笔记名称')
  const newPath = join(notebookPath, `${finalName}.txt`)
  if (!fs.existsSync(oldPath)) return { success: false, message: '笔记不存在' }
  if (newName && finalName !== noteName && fs.existsSync(newPath)) {
    return { success: false, message: '笔记名已存在', name: noteName }
  }
  fs.writeFileSync(oldPath, String(content || ''), 'utf-8')
  if (newName && finalName !== noteName) {
    fs.renameSync(oldPath, newPath)
  }
  await updateBookMetadata(bookName, booksDir)
  return {
    success: true,
    bookName,
    notebookName,
    noteName: finalName,
    previousNoteName: newName && finalName !== noteName ? noteName : '',
    name: finalName,
    filePath: newName && finalName !== noteName ? newPath : oldPath,
    contentLength: String(content || '').length
  }
}

export async function exportOrganizationToNote({ bookName, organizationName, content }, booksDir) {
  try {
    if (!booksDir || !bookName || !organizationName) {
      return { success: false, message: '参数不完整' }
    }

    const safeBookName = safeAssetName(bookName)
    const bookPath = resolveBookDirPath(booksDir, safeBookName)
    if (!bookPath || !fs.existsSync(bookPath)) {
      return { success: false, message: '书籍不存在' }
    }

    const notebookName = '组织架构'
    const notebookPath = join(bookPath, '笔记', notebookName)
    fs.mkdirSync(notebookPath, { recursive: true })

    const safeNoteName = String(organizationName)
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
    if (!safeNoteName) {
      return { success: false, message: '组织架构名称无效' }
    }

    const notesRoot = resolve(notebookPath)
    const notePath = resolve(notesRoot, `${safeNoteName}.txt`)
    const relativeNotePath = relative(notesRoot, notePath)
    if (relativeNotePath.startsWith('..') || isAbsolute(relativeNotePath)) {
      return { success: false, message: '组织架构名称无效' }
    }

    fs.writeFileSync(notePath, String(content || ''), 'utf-8')
    await updateBookMetadata(safeBookName, booksDir)

    return {
      success: true,
      bookName: safeBookName,
      bookPath,
      notebookName,
      notebookPath,
      noteName: safeNoteName,
      fileName: `${safeNoteName}.txt`,
      notePath,
      path: notePath
    }
  } catch (error) {
    return { success: false, message: error.message || '导出组织架构到笔记失败' }
  }
}

export async function checkChapterExists({ bookName, volumeName, chapterName }, booksDir) {
  const cleanChapterName = String(chapterName || '').trim()
  if (!bookName || !volumeName || !cleanChapterName) {
    return { success: false, exists: false, message: '参数不完整' }
  }
  const chapterPath = resolveBookChildPath(
    booksDir,
    bookName,
    '正文',
    volumeName,
    `${requirePathSegment(cleanChapterName, '章节名称')}.txt`
  )
  return { success: true, exists: fs.existsSync(chapterPath) }
}

// ---------------------------------------------------------------------------
// 创作区扩展资料
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS_DATA = {
  categories: [
    {
      id: 'default',
      name: '默认设定',
      introduction: '',
      children: [],
      items: []
    }
  ]
}

const ENTITY_PROFILE_KEYS = ['mount', 'monster', 'spirit_beast', 'artifact']

function cloneDefaultSettingsData() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS_DATA))
}

function normalizeSettingItems(items, categoryIndexPath) {
  if (!Array.isArray(items)) return []

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, itemIndex) => ({
      id: String(item.id || `setting-${Date.now()}-${categoryIndexPath}-${itemIndex}`),
      name: String(item.name || '').trim(),
      introduction: String(item.introduction || '').trim()
    }))
}

function normalizeSettingCategories(categories, parentIndexPath = 'root') {
  if (!Array.isArray(categories)) return []

  return categories
    .filter((category) => category && typeof category === 'object')
    .map((category, categoryIndex) => {
      const indexPath = `${parentIndexPath}-${categoryIndex}`
      return {
        id: String(category.id || `category-${Date.now()}-${indexPath}`),
        name: String(category.name || '').trim() || '未命名分类',
        introduction: String(category.introduction || '').trim(),
        children: normalizeSettingCategories(category.children, indexPath),
        items: normalizeSettingItems(category.items, indexPath)
      }
    })
}

function normalizeSettingsData(data) {
  const categories = normalizeSettingCategories(data?.categories)
  return categories.length ? { categories } : cloneDefaultSettingsData()
}

function defaultOutlineAiSessionsPayload() {
  return {
    version: 1,
    nodes: {}
  }
}

function defaultEntityProfilesPayload() {
  return {
    mount: [],
    monster: [],
    spirit_beast: [],
    artifact: []
  }
}

function readEntityProfiles(booksDir, bookName) {
  const result = readBookJsonResult(
    booksDir,
    bookName,
    'entity_profiles.json',
    defaultEntityProfilesPayload(),
    '扩展档案'
  )
  if (!result.success) return result
  const raw = result.data
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false, message: '扩展档案数据必须是对象' }
  }
  const out = defaultEntityProfilesPayload()
  for (const key of ENTITY_PROFILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && !Array.isArray(raw[key])) {
      return { success: false, message: `扩展档案 ${key} 必须是数组` }
    }
    out[key] = Array.isArray(raw?.[key]) ? raw[key] : []
  }
  return { success: true, data: out }
}

function readImageAsDataUrl(filePath) {
  if (!fs.existsSync(filePath)) return ''
  const data = fs.readFileSync(filePath)
  return `data:image/png;base64,${data.toString('base64')}`
}

function writeDataUrlImage(filePath, imageData) {
  if (!imageData) return
  const base64Data = String(imageData).replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
}

function mapDocumentSyncResult(documentRecord, documentType) {
  return {
    success: Boolean(documentRecord),
    projectId: documentRecord?.projectId || '',
    documentType: documentRecord?.documentType || documentType,
    documentPath: documentRecord?.documentPath || '',
    updatedAt: documentRecord?.updatedAt || ''
  }
}

function mapWriteResult({
  booksDir,
  bookName,
  mapName,
  imagePath,
  metaPath,
  dataPath = '',
  metaRecord,
  dataRecord = null
}) {
  const safeBookName = safeAssetName(bookName)
  const safeName = safeAssetName(mapName, '新地图')
  const metaDocumentType = `map:${safeName}`
  const dataDocumentType = `map_data:${safeName}`
  const primaryRecord = metaRecord || dataRecord
  const primaryDocumentType = metaRecord ? metaDocumentType : dataDocumentType
  const result = {
    success: true,
    bookName: safeBookName,
    mapName: safeName,
    assetType: 'map',
    fileName: `${safeName}.png`,
    metaFileName: `${safeName}.json`,
    dataFileName: dataPath ? `${safeName}.data.json` : '',
    documentType: primaryDocumentType,
    documentPath: primaryRecord?.documentPath || '',
    path: imagePath,
    imagePath,
    metaPath,
    dataPath,
    bookPath: getBookPath(booksDir, safeBookName),
    updatedAt: new Date().toISOString(),
    databaseSync: mapDocumentSyncResult(primaryRecord, primaryDocumentType)
  }
  if (dataPath) {
    result.dataDatabaseSync = mapDocumentSyncResult(dataRecord, dataDocumentType)
  }
  if (result.databaseSync.success !== true || (dataPath && !dataRecord)) {
    result.success = false
    result.message = '地图已写入文件，但数据库未记录快照'
  }
  return result
}

export function readTimeline(bookName, booksDir) {
  return readBookJsonResult(booksDir, bookName, 'timelines.json', [], '时间线')
}

export function writeTimeline({ bookName, data }, booksDir) {
  const payload = requireBookArrayPayload(data, '时间线')
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'timelines.json', payload.data)
}

export function readOutlines(bookName, booksDir) {
  return readBookJsonResult(booksDir, bookName, 'outlines.json', null, '大纲')
}

export function writeOutlines({ bookName, data }, booksDir) {
  const payload = requireOutlinePayload(data)
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'outlines.json', payload.data)
}

export function readOutlineAiSessions(bookName, booksDir) {
  const result = readBookJsonResult(
    booksDir,
    bookName,
    'outline-ai-sessions.json',
    defaultOutlineAiSessionsPayload(),
    'AI 大纲会话'
  )
  if (!result.success) return result
  const payload = requireOutlineAiSessionsPayload(result.data)
  return payload.success ? { success: true, data: payload.data } : payload
}

export function writeOutlineAiSessions({ bookName, data }, booksDir) {
  const payload = requireOutlineAiSessionsPayload(data)
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'outline-ai-sessions.json', payload.data)
}

export function readCharacters(bookName, booksDir) {
  return readBookArrayJsonResult(booksDir, bookName, 'characters.json', '人物谱')
}

export function writeCharacters({ bookName, data }, booksDir) {
  const payload = requireBookArrayPayload(data, '人物谱')
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'characters.json', payload.data)
}

export function readEntityProfilesForBook(bookName, booksDir) {
  return readEntityProfiles(booksDir, bookName)
}

export function writeEntityProfileCategory({ bookName, category, data }, booksDir) {
  if (!ENTITY_PROFILE_KEYS.includes(category)) {
    return { success: false, message: '参数无效' }
  }
  if (!Array.isArray(data)) {
    return { success: false, message: '数据须为数组' }
  }
  const readResult = readEntityProfiles(booksDir, bookName)
  if (!readResult.success) return readResult
  const all = readResult.data
  all[category] = data
  return writeBookJson(booksDir, bookName, 'entity_profiles.json', all)
}

export function readDictionary(bookName, booksDir) {
  return readBookArrayJsonResult(booksDir, bookName, 'dictionary.json', '词条字典')
}

export function writeDictionary({ bookName, data }, booksDir) {
  const payload = requireBookArrayPayload(data, '词条字典')
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'dictionary.json', payload.data)
}

export function readSettings(bookName, booksDir) {
  const result = readBookJsonResult(
    booksDir,
    bookName,
    'settings.json',
    cloneDefaultSettingsData(),
    '设定管理'
  )
  if (!result.success) return result
  return { success: true, data: normalizeSettingsData(result.data) }
}

export function writeSettings({ bookName, data }, booksDir) {
  if (!bookName) return { success: false, message: '书籍名称不能为空' }
  return writeBookJson(booksDir, bookName, 'settings.json', normalizeSettingsData(data))
}

export function readSequenceCharts(bookName, booksDir) {
  return readBookJsonResult(booksDir, bookName, 'sequence-charts.json', [], '事序图')
}

export function writeSequenceCharts({ bookName, data }, booksDir) {
  const payload = requireBookArrayPayload(data, '事序图')
  if (!payload.success) return payload
  return writeBookJson(booksDir, bookName, 'sequence-charts.json', payload.data)
}

export function readMaps(bookName, booksDir) {
  const mapsDir = join(getBookPath(booksDir, bookName), 'maps')
  if (!fs.existsSync(mapsDir)) {
    fs.mkdirSync(mapsDir, { recursive: true })
    return { success: true, data: [] }
  }
  const maps = fs
    .readdirSync(mapsDir)
    .filter((file) => file.endsWith('.png'))
    .map((file) => {
      const name = file.split('.').slice(0, -1).join('.')
      const meta = readJson(join(mapsDir, `${name}.json`), {})
      return {
        id: meta.id || name,
        name: meta.name || name,
        description: meta.description || '',
        createdAt: meta.createdAt || '',
        updatedAt: meta.updatedAt || '',
        thumbnail: readImageAsDataUrl(join(mapsDir, file))
      }
    })
  return { success: true, data: maps }
}

export function createMap({ bookName, mapName, description, imageData }, booksDir) {
  const mapsDir = join(ensureBookPath(booksDir, bookName), 'maps')
  fs.mkdirSync(mapsDir, { recursive: true })
  const safeName = safeAssetName(mapName, '新地图')
  const filePath = join(mapsDir, `${safeName}.png`)
  const jsonPath = join(mapsDir, `${safeName}.json`)
  if (fs.existsSync(filePath) || fs.existsSync(jsonPath)) {
    return { success: false, message: '已存在同名地图文件' }
  }
  if (!imageData) {
    return { success: false, message: '缺少地图图片数据' }
  }
  writeDataUrlImage(filePath, imageData)
  writeJson(jsonPath, {
    id: safeName,
    name: safeName,
    description: description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  const metaRecord = syncNovelDocument(
    booksDir,
    bookName,
    `map:${safeName}`,
    join('maps', `${safeName}.json`)
  )
  return mapWriteResult({
    booksDir,
    bookName,
    mapName: safeName,
    imagePath: filePath,
    metaPath: jsonPath,
    metaRecord
  })
}

export function updateMap({ bookName, mapName, imageData, mapData }, booksDir) {
  const mapsDir = join(ensureBookPath(booksDir, bookName), 'maps')
  fs.mkdirSync(mapsDir, { recursive: true })
  const safeName = safeAssetName(mapName, '新地图')
  const filePath = join(mapsDir, `${safeName}.png`)
  const jsonPath = join(mapsDir, `${safeName}.json`)
  if (imageData) writeDataUrlImage(filePath, imageData)
  if (mapData) writeJson(join(mapsDir, `${safeName}.data.json`), mapData)
  const meta = readJson(jsonPath, {})
  const now = new Date().toISOString()
  writeJson(jsonPath, {
    ...meta,
    id: meta.id || safeName,
    name: meta.name || safeName,
    description: meta.description || '',
    createdAt: meta.createdAt || now,
    updatedAt: now
  })
  const metaRecord = syncNovelDocument(
    booksDir,
    bookName,
    `map:${safeName}`,
    join('maps', `${safeName}.json`)
  )
  const dataRecord = mapData
    ? syncNovelDocument(
        booksDir,
        bookName,
        `map_data:${safeName}`,
        join('maps', `${safeName}.data.json`)
      )
    : null
  return mapWriteResult({
    booksDir,
    bookName,
    mapName: safeName,
    imagePath: filePath,
    metaPath: jsonPath,
    dataPath: mapData ? join(mapsDir, `${safeName}.data.json`) : '',
    metaRecord,
    dataRecord
  })
}

export function saveMapData({ bookName, mapName, mapData }, booksDir) {
  const mapsDir = join(ensureBookPath(booksDir, bookName), 'maps')
  fs.mkdirSync(mapsDir, { recursive: true })
  const safeName = safeAssetName(mapName, '新地图')
  const dataFilePath = join(mapsDir, `${safeName}.data.json`)
  writeJson(dataFilePath, mapData || null)
  const dataRecord = syncNovelDocument(
    booksDir,
    bookName,
    `map_data:${safeName}`,
    join('maps', `${safeName}.data.json`)
  )
  const result = mapWriteResult({
    booksDir,
    bookName,
    mapName: safeName,
    imagePath: join(mapsDir, `${safeName}.png`),
    metaPath: join(mapsDir, `${safeName}.json`),
    dataPath: dataFilePath,
    metaRecord: syncNovelDocument(
      booksDir,
      bookName,
      `map:${safeName}`,
      join('maps', `${safeName}.json`)
    ),
    dataRecord
  })
  result.path = dataFilePath
  result.documentPath = dataFilePath
  return result
}

export function loadMapData({ bookName, mapName }, booksDir) {
  const dataFilePath = join(
    getBookPath(booksDir, bookName),
    'maps',
    `${safeAssetName(mapName, '新地图')}.data.json`
  )
  return readJson(dataFilePath, null)
}

export function readMapImage({ bookName, mapName }, booksDir) {
  return readImageAsDataUrl(
    join(getBookPath(booksDir, bookName), 'maps', `${safeAssetName(mapName, '新地图')}.png`)
  )
}

export function deleteMap({ bookName, mapName }, booksDir) {
  const mapsDir = join(getBookPath(booksDir, bookName), 'maps')
  const safeName = safeAssetName(mapName, '新地图')
  const deletedFiles = []
  const missingFiles = []
  for (const ext of ['png', 'json', 'data.json']) {
    const filePath = join(mapsDir, `${safeName}.${ext}`)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      deletedFiles.push(filePath)
    } else {
      missingFiles.push(filePath)
    }
  }
  return {
    success: true,
    bookName: safeAssetName(bookName),
    mapName: safeName,
    assetType: 'map',
    deletedFiles,
    missingFiles,
    existed: deletedFiles.length > 0
  }
}

function readGraphList(booksDir, bookName, dirName) {
  const graphDir = join(getBookPath(booksDir, bookName), dirName)
  if (!fs.existsSync(graphDir)) {
    fs.mkdirSync(graphDir, { recursive: true })
    return []
  }
  return fs
    .readdirSync(graphDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const name = file.replace('.json', '')
      const data = readJson(join(graphDir, file), {})
      const pngPath = join(graphDir, `${name}.png`)
      return {
        id: data.id || name,
        name: data.name || name,
        description: data.description || '',
        thumbnail: fs.existsSync(pngPath) ? `${name}.png` : '',
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        lines: Array.isArray(data.lines) ? data.lines : [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      }
    })
}

function readGraphData(booksDir, bookName, dirName, graphName) {
  return readJson(
    join(getBookPath(booksDir, bookName), dirName, `${safeAssetName(graphName)}.json`),
    null
  )
}

function graphAssetType(dirName) {
  return dirName === 'relationships' ? 'relationship' : 'organization'
}

function graphDataWriteResult({
  booksDir,
  bookName,
  dirName,
  graphName,
  filePath,
  data,
  created,
  documentRecord
}) {
  const safeBookName = safeAssetName(bookName)
  const safeName = safeAssetName(graphName)
  const documentType =
    documentRecord?.documentType || `${graphAssetType(dirName)}_graph:${safeName}`
  return {
    success: true,
    bookName: safeBookName,
    graphName: safeName,
    assetType: graphAssetType(dirName),
    collection: dirName,
    fileName: `${safeName}.json`,
    path: filePath,
    graphPath: filePath,
    bookPath: getBookPath(booksDir, safeBookName),
    created,
    updatedAt: data.updatedAt,
    nodeCount: data.nodes.length,
    lineCount: data.lines.length,
    databaseSync: {
      success: Boolean(documentRecord),
      projectId: documentRecord?.projectId || '',
      documentType,
      documentPath: documentRecord?.documentPath || '',
      updatedAt: documentRecord?.updatedAt || ''
    }
  }
}

function graphThumbnailWriteResult({ booksDir, bookName, dirName, graphName, thumbnailPath }) {
  const safeBookName = safeAssetName(bookName)
  const safeName = safeAssetName(graphName)
  return {
    success: true,
    bookName: safeBookName,
    graphName: safeName,
    assetType: graphAssetType(dirName),
    collection: dirName,
    fileName: `${safeName}.png`,
    path: thumbnailPath,
    thumbnailPath,
    bookPath: getBookPath(booksDir, safeBookName),
    updatedAt: new Date().toISOString()
  }
}

function graphDeleteResult({ booksDir, bookName, dirName, graphName, deletedFiles, missingFiles }) {
  const safeBookName = safeAssetName(bookName)
  const safeName = safeAssetName(graphName)
  return {
    success: true,
    bookName: safeBookName,
    graphName: safeName,
    assetType: graphAssetType(dirName),
    collection: dirName,
    bookPath: getBookPath(booksDir, safeBookName),
    deletedFiles,
    missingFiles,
    existed: deletedFiles.length > 0
  }
}

function writeGraphData(
  booksDir,
  bookName,
  dirName,
  graphName,
  graphData,
  shouldFailIfExists = false
) {
  const graphDir = join(ensureBookPath(booksDir, bookName), dirName)
  fs.mkdirSync(graphDir, { recursive: true })
  const safeName = safeAssetName(graphName)
  const filePath = join(graphDir, `${safeName}.json`)
  if (shouldFailIfExists && fs.existsSync(filePath)) {
    return { success: false, message: '已存在同名文件' }
  }
  const previous = readJson(filePath, {})
  const created = !fs.existsSync(filePath)
  const now = new Date().toISOString()
  const data =
    graphData && typeof graphData === 'object' && !Array.isArray(graphData) ? graphData : {}
  const savedData = {
    ...data,
    id: data.id || previous.id || safeName,
    name: data.name || previous.name || safeName,
    description: data.description ?? previous.description ?? '',
    nodes: Array.isArray(data.nodes)
      ? data.nodes
      : Array.isArray(previous.nodes)
        ? previous.nodes
        : [],
    lines: Array.isArray(data.lines)
      ? data.lines
      : Array.isArray(previous.lines)
        ? previous.lines
        : [],
    createdAt: data.createdAt || previous.createdAt || now,
    updatedAt: now
  }
  writeJson(filePath, savedData)
  const documentRecord = syncNovelDocument(
    booksDir,
    bookName,
    `${graphAssetType(dirName)}_graph:${safeName}`,
    join(dirName, `${safeName}.json`)
  )
  return graphDataWriteResult({
    booksDir,
    bookName,
    dirName,
    graphName,
    filePath,
    data: savedData,
    created,
    documentRecord
  })
}

function updateGraphThumbnail(booksDir, bookName, dirName, graphName, thumbnailData) {
  if (!thumbnailData) {
    return { success: false, message: '缺少缩略图数据' }
  }
  const graphDir = join(ensureBookPath(booksDir, bookName), dirName)
  fs.mkdirSync(graphDir, { recursive: true })
  const thumbnailPath = join(graphDir, `${safeAssetName(graphName)}.png`)
  writeDataUrlImage(thumbnailPath, thumbnailData)
  return graphThumbnailWriteResult({ booksDir, bookName, dirName, graphName, thumbnailPath })
}

function readGraphImage(booksDir, bookName, dirName, imageName) {
  return readImageAsDataUrl(
    join(getBookPath(booksDir, bookName), dirName, safeAssetName(imageName))
  )
}

function deleteGraph(booksDir, bookName, dirName, graphName) {
  const graphDir = join(getBookPath(booksDir, bookName), dirName)
  const safeName = safeAssetName(graphName)
  const deletedFiles = []
  const missingFiles = []
  for (const ext of ['json', 'png']) {
    const filePath = join(graphDir, `${safeName}.${ext}`)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      deletedFiles.push(filePath)
    } else {
      missingFiles.push(filePath)
    }
  }
  return graphDeleteResult({ booksDir, bookName, dirName, graphName, deletedFiles, missingFiles })
}

export function readRelationships(bookName, booksDir) {
  return { success: true, data: readGraphList(booksDir, bookName, 'relationships') }
}

export function readRelationshipData({ bookName, relationshipName }, booksDir) {
  const data = readGraphData(booksDir, bookName, 'relationships', relationshipName)
  return data ? { success: true, data } : { success: false, error: '关系图不存在' }
}

export function createRelationship({ bookName, relationshipName, relationshipData }, booksDir) {
  const result = writeGraphData(
    booksDir,
    bookName,
    'relationships',
    relationshipName,
    relationshipData,
    true
  )
  return result.success ? result : { success: false, message: '已存在同名关系图' }
}

export function saveRelationshipData({ bookName, relationshipName, relationshipData }, booksDir) {
  return writeGraphData(booksDir, bookName, 'relationships', relationshipName, relationshipData)
}

export function updateRelationshipThumbnail(
  { bookName, relationshipName, thumbnailData },
  booksDir
) {
  return updateGraphThumbnail(booksDir, bookName, 'relationships', relationshipName, thumbnailData)
}

export function readRelationshipImage({ bookName, imageName }, booksDir) {
  return readGraphImage(booksDir, bookName, 'relationships', imageName)
}

export function deleteRelationship({ bookName, relationshipName }, booksDir) {
  return deleteGraph(booksDir, bookName, 'relationships', relationshipName)
}

export function readOrganizations(bookName, booksDir) {
  return { success: true, data: readGraphList(booksDir, bookName, 'organizations') }
}

export function readOrganization({ bookName, organizationName }, booksDir) {
  const data = readGraphData(booksDir, bookName, 'organizations', organizationName)
  return data ? { success: true, data } : { success: false, error: '组织架构不存在' }
}

export function createOrganization({ bookName, organizationName, organizationData }, booksDir) {
  const result = writeGraphData(
    booksDir,
    bookName,
    'organizations',
    organizationName,
    organizationData,
    true
  )
  return result.success ? result : { success: false, error: '已存在同名组织架构' }
}

export function writeOrganization({ bookName, organizationName, organizationData }, booksDir) {
  return writeGraphData(booksDir, bookName, 'organizations', organizationName, organizationData)
}

export function updateOrganizationThumbnail({ bookName, organizationId, thumbnailData }, booksDir) {
  return updateGraphThumbnail(booksDir, bookName, 'organizations', organizationId, thumbnailData)
}

export function readOrganizationImage({ bookName, imageName }, booksDir) {
  return readGraphImage(booksDir, bookName, 'organizations', imageName)
}

export function deleteOrganization({ bookName, organizationName }, booksDir) {
  return deleteGraph(booksDir, bookName, 'organizations', organizationName)
}

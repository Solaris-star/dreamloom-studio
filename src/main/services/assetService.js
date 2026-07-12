import fs from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { nowIso, readJson, writeJson } from './webJsonRepository.js'

const TRASH_DIR = 'assets-trash'
const TRASH_MANIFEST = 'manifest.json'
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
const ATTACHMENT_DIRS = ['attachments', '附件', 'assets']
const IMAGE_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif'
}

function safeName(value, fallback = 'asset') {
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

function encodeAssetId(relativePath) {
  return Buffer.from(relativePath, 'utf-8').toString('base64url')
}

function decodeAssetId(id) {
  try {
    return Buffer.from(String(id || ''), 'base64url').toString('utf-8')
  } catch {
    return ''
  }
}

function getTrashDir(booksDir) {
  return join(booksDir, TRASH_DIR)
}

function readTrashManifest(booksDir) {
  const filePath = join(getTrashDir(booksDir), TRASH_MANIFEST)
  if (!fs.existsSync(filePath)) return []
  let rows
  try {
    rows = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]')
  } catch (error) {
    throw new Error(`素材回收站记录读取失败：${error.message}`)
  }
  if (!Array.isArray(rows)) {
    throw new Error('素材回收站记录格式异常，已停止读取回收站')
  }
  if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('素材回收站记录格式异常，已停止读取回收站')
  }
  return rows
}

function writeTrashManifest(booksDir, rows) {
  if (!Array.isArray(rows)) {
    throw new Error('素材回收站记录格式异常，已停止写入以免覆盖原始记录')
  }
  writeJson(join(getTrashDir(booksDir), TRASH_MANIFEST), rows)
}

function readBooks(booksDir) {
  if (!booksDir || !fs.existsSync(booksDir)) return []
  let entries = []
  try {
    entries = fs.readdirSync(booksDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== TRASH_DIR)
    .map((entry) => {
      const bookPath = join(booksDir, entry.name)
      const meta = readJson(join(bookPath, 'mazi.json'), null)
      if (!meta || typeof meta !== 'object') return null
      return {
        id: String(meta.id || entry.name),
        name: String(meta.name || entry.name),
        folderName: entry.name,
        path: bookPath,
        meta
      }
    })
    .filter(Boolean)
}

function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath)
    if (!stats.isFile()) return null
    return {
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      createdAt: stats.birthtime?.toISOString?.() || stats.ctime.toISOString()
    }
  } catch {
    return null
  }
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase()
  return IMAGE_CONTENT_TYPES[ext] || 'application/octet-stream'
}

function isImage(filePath) {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function makeAsset(booksDir, book, filePath, type, source = '') {
  const stats = getFileStats(filePath)
  if (!stats || !isInside(booksDir, filePath)) return null
  const rel = relative(booksDir, filePath)
  const ext = extname(filePath).toLowerCase()
  return {
    id: encodeAssetId(rel),
    name: basename(filePath),
    filePath,
    type,
    source,
    bookName: book?.name || '',
    bookFolderName: book?.folderName || '',
    relativePath: rel,
    extension: ext.replace('.', ''),
    mimeType: getContentType(filePath),
    isImage: isImage(filePath),
    size: stats.size,
    mtime: stats.mtime,
    createdAt: stats.createdAt,
    status: 'active'
  }
}

function collectFiles(dirPath, predicate, result = []) {
  if (!dirPath || !fs.existsSync(dirPath)) return result
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of entries) {
    const target = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      collectFiles(target, predicate, result)
    } else if (entry.isFile() && predicate(target)) {
      result.push(target)
    }
  }
  return result
}

function collectMatchingJsonPaths(value, candidates, jsonPath = '$', result = []) {
  if (typeof value === 'string') {
    const normalized = value.replaceAll('\\', '/')
    if (candidates.has(normalized) || candidates.has(basename(normalized))) result.push(jsonPath)
    return result
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectMatchingJsonPaths(item, candidates, `${jsonPath}[${index}]`, result)
    )
    return result
  }
  if (!value || typeof value !== 'object') return result
  for (const [key, item] of Object.entries(value)) {
    collectMatchingJsonPaths(item, candidates, `${jsonPath}.${key}`, result)
  }
  return result
}

function referenceUsage(file, field, data) {
  const normalizedFile = String(file || '').replaceAll('\\', '/')
  if (normalizedFile === 'mazi.json' && /(?:cover|封面)/i.test(field)) {
    return { type: 'cover', label: '作品封面' }
  }

  const indexed = field.match(/^\$\[(\d+)\]/)
  const item = indexed && Array.isArray(data) ? data[Number(indexed[1])] : null
  const subject = String(item?.name || item?.title || '').trim()
  if (normalizedFile.endsWith('characters.json')) {
    return { type: 'character', label: subject ? `人物「${subject}」` : '人物资料' }
  }
  if (normalizedFile.endsWith('scenes.json')) {
    return { type: 'scene', label: subject ? `场景「${subject}」` : '场景资料' }
  }
  if (normalizedFile.endsWith('organizations.json')) {
    return { type: 'organization', label: subject ? `组织「${subject}」` : '组织资料' }
  }
  if (normalizedFile.endsWith('maps.json')) {
    return { type: 'map', label: subject ? `地图「${subject}」` : '地图资料' }
  }
  return { type: 'other', label: '作品资料' }
}

export function findAssetReferences(booksDir, id) {
  const filePath = getActiveAssetPath(booksDir, id)
  const assetRelativePath = relative(booksDir, filePath).replaceAll('\\', '/')
  const bookFolderName = assetRelativePath.split('/')[0]
  const bookPath = resolve(booksDir, bookFolderName)
  if (!isInside(booksDir, bookPath)) return []

  const relativeToBook = relative(bookPath, filePath).replaceAll('\\', '/')
  const candidates = new Set([assetRelativePath, relativeToBook, basename(filePath)])
  const jsonFiles = collectFiles(bookPath, (target) => extname(target).toLowerCase() === '.json')
  const references = []

  for (const jsonFile of jsonFiles) {
    let data
    try {
      data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
    } catch {
      continue
    }
    const paths = collectMatchingJsonPaths(data, candidates)
    if (!paths.length) continue
    const usages = paths.map((field) => referenceUsage(relative(bookPath, jsonFile), field, data))
    references.push({
      file: relative(bookPath, jsonFile).replaceAll('\\', '/'),
      fields: [...new Set(paths)].slice(0, 10),
      usages: [...new Map(usages.map((usage) => [`${usage.type}:${usage.label}`, usage])).values()]
    })
  }
  return references
}

function uniquePush(rows, seen, asset) {
  if (!asset || seen.has(asset.relativePath)) return
  seen.add(asset.relativePath)
  rows.push(asset)
}

function scanBookAssets(booksDir, book) {
  const rows = []
  const seen = new Set()
  const root = book.path

  let rootEntries = []
  try {
    rootEntries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    rootEntries = []
  }
  for (const entry of rootEntries) {
    const filePath = join(root, entry.name)
    if (entry.isFile() && /^cover\./i.test(entry.name) && isImage(filePath)) {
      uniquePush(rows, seen, makeAsset(booksDir, book, filePath, 'cover', 'cover'))
    }
  }

  const imageSources = [
    { dir: 'character_images', type: 'character', source: 'character_images' },
    { dir: 'scene_images', type: 'scene', source: 'scene_images' },
    { dir: 'maps', type: 'map', source: 'maps' },
    { dir: 'relationships', type: 'map', source: 'relationships' },
    { dir: 'organizations', type: 'map', source: 'organizations' }
  ]

  for (const source of imageSources) {
    const files = collectFiles(join(root, source.dir), (filePath) => isImage(filePath))
    for (const filePath of files) {
      uniquePush(rows, seen, makeAsset(booksDir, book, filePath, source.type, source.source))
    }
  }

  for (const dirName of ATTACHMENT_DIRS) {
    const attachmentRoot = join(root, dirName)
    const files = collectFiles(attachmentRoot, () => true)
    for (const filePath of files) {
      uniquePush(rows, seen, makeAsset(booksDir, book, filePath, 'attachment', dirName))
    }
  }

  return rows
}

function normalizeFilter(filter = {}) {
  return {
    type: String(filter.type || '').trim(),
    bookName: String(filter.bookName || filter.book || '').trim(),
    keyword: String(filter.keyword || '')
      .trim()
      .toLowerCase(),
    includeTrash: Boolean(filter.includeTrash || filter.type === 'trash')
  }
}

function matchesFilter(asset, filter) {
  if (filter.type && filter.type !== 'all' && filter.type !== 'trash' && asset.type !== filter.type)
    return false
  if (
    filter.bookName &&
    asset.bookName !== filter.bookName &&
    asset.bookFolderName !== filter.bookName
  )
    return false
  if (filter.keyword) {
    const text = [asset.name, asset.bookName, asset.type, asset.source, asset.relativePath]
      .join(' ')
      .toLowerCase()
    if (!text.includes(filter.keyword)) return false
  }
  return true
}

function trashRowsToAssets(booksDir) {
  return readTrashManifest(booksDir).map((row) => {
    const filePath = row.trashRelativePath ? resolve(booksDir, row.trashRelativePath) : ''
    return {
      id: row.id,
      name: row.name,
      filePath,
      type: 'trash',
      originalType: row.type,
      source: row.source || '',
      bookName: row.bookName || '',
      bookFolderName: row.bookFolderName || '',
      relativePath: row.originalRelativePath,
      trashRelativePath: row.trashRelativePath,
      extension: row.extension || '',
      mimeType: row.mimeType || 'application/octet-stream',
      isImage: Boolean(row.isImage),
      size: row.size || 0,
      mtime: row.deletedAt || '',
      deletedAt: row.deletedAt || '',
      status: 'trash'
    }
  })
}

function summarize(items, books) {
  const byType = { cover: 0, character: 0, scene: 0, map: 0, attachment: 0, trash: 0 }
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1
  }
  return {
    total: items.length,
    byType,
    bookCount: books.length
  }
}

export function listAssets(booksDir, filterInput = {}) {
  const filter = normalizeFilter(filterInput)
  const books = readBooks(booksDir)
  let items = books.flatMap((book) => scanBookAssets(booksDir, book))
  if (filter.includeTrash) {
    items =
      filter.type === 'trash'
        ? trashRowsToAssets(booksDir)
        : [...items, ...trashRowsToAssets(booksDir)]
  }
  const filtered = items
    .filter((item) => matchesFilter(item, filter))
    .sort((a, b) => new Date(b.mtime || b.deletedAt || 0) - new Date(a.mtime || a.deletedAt || 0))

  return {
    success: true,
    items: filtered,
    books: books.map((book) => ({ id: book.id, name: book.name, folderName: book.folderName })),
    summary: summarize(filtered, books)
  }
}

function getActiveAssetPath(booksDir, id) {
  const rel = decodeAssetId(id)
  if (!rel) throw new Error('资产 ID 无效')
  const target = resolve(booksDir, rel)
  if (!isInside(booksDir, target) || isInside(getTrashDir(booksDir), target)) {
    throw new Error('资产路径无效')
  }
  if (!fs.existsSync(target)) throw new Error('资产文件不存在')
  return target
}

function getTrashAsset(booksDir, id) {
  const rows = readTrashManifest(booksDir)
  const row = rows.find((item) => item.id === id)
  if (!row) throw new Error('回收站记录不存在')
  const target = resolve(booksDir, row.trashRelativePath)
  if (!isInside(getTrashDir(booksDir), target) || !fs.existsSync(target))
    throw new Error('回收站文件不存在')
  return { row, filePath: target, rows }
}

export function getAssetFile(booksDir, { id, trash = false } = {}) {
  const filePath = trash ? getTrashAsset(booksDir, id).filePath : getActiveAssetPath(booksDir, id)
  return {
    success: true,
    filePath,
    contentType: getContentType(filePath),
    name: basename(filePath)
  }
}

function uniqueFilePath(dirPath, fileName) {
  const parsedExt = extname(fileName)
  const base = safeName(basename(fileName, parsedExt), 'asset')
  const ext = parsedExt || ''
  let candidate = join(dirPath, `${base}${ext}`)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = join(dirPath, `${base}_${index}${ext}`)
    index++
  }
  return candidate
}

function destinationForType(bookPath, type, fileName) {
  const ext = extname(fileName) || '.bin'
  if (type === 'cover') return join(bookPath, `cover${ext}`)
  const dirMap = {
    character: 'character_images',
    scene: 'scene_images',
    map: 'maps',
    attachment: 'attachments'
  }
  const dirPath = join(bookPath, dirMap[type] || 'attachments')
  fs.mkdirSync(dirPath, { recursive: true })
  return uniqueFilePath(dirPath, fileName)
}

function getBookByName(booksDir, bookName) {
  const books = readBooks(booksDir)
  const book = books.find(
    (item) => item.name === bookName || item.folderName === bookName || item.id === bookName
  )
  if (!book) throw new Error('未找到目标书籍')
  return book
}

function updateBookCoverMeta(book, targetPath) {
  const metaPath = join(book.path, 'mazi.json')
  const meta = readJson(metaPath, {})
  meta.coverUrl = basename(targetPath)
  meta.updatedAt = new Date().toLocaleString()
  writeJson(metaPath, meta)
}

export function importAsset(booksDir, input = {}) {
  const book = getBookByName(booksDir, input.bookName)
  const type = String(input.type || 'attachment')
  const fileName = safeName(
    input.fileName || basename(input.sourcePath || '') || `asset_${Date.now()}`
  )
  const targetPath = destinationForType(book.path, type, fileName)

  if (input.sourcePath) {
    const sourcePath = resolve(String(input.sourcePath))
    if (!fs.existsSync(sourcePath)) throw new Error('源文件不存在')
    fs.copyFileSync(sourcePath, targetPath)
  } else if (input.dataUrl || input.base64) {
    const raw = String(input.dataUrl || input.base64)
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'))
  } else {
    throw new Error('缺少导入文件')
  }

  if (type === 'cover') updateBookCoverMeta(book, targetPath)
  return { success: true, item: makeAsset(booksDir, book, targetPath, type, 'import') }
}

export function deleteAsset(booksDir, id) {
  const filePath = getActiveAssetPath(booksDir, id)
  const references = findAssetReferences(booksDir, id)
  if (references.length) {
    const locations = references
      .slice(0, 5)
      .map((item) => `${item.file}（${item.fields.join('、')}）`)
      .join('；')
    throw new Error(`该素材仍被引用，不能删除：${locations}`)
  }
  const rel = relative(booksDir, filePath)
  const existing = listAssets(booksDir, {}).items.find((item) => item.id === id)
  const trashDir = getTrashDir(booksDir)
  const rows = readTrashManifest(booksDir)
  fs.mkdirSync(trashDir, { recursive: true })
  const trashName = `${Date.now()}_${randomUUID()}_${basename(filePath)}`
  const trashPath = join(trashDir, trashName)
  fs.renameSync(filePath, trashPath)

  const record = {
    id: `trash_${randomUUID()}`,
    name: basename(filePath),
    type: existing?.type || 'attachment',
    source: existing?.source || '',
    bookName: existing?.bookName || '',
    bookFolderName: existing?.bookFolderName || '',
    originalRelativePath: rel,
    trashRelativePath: relative(booksDir, trashPath),
    extension: extname(filePath).replace('.', ''),
    mimeType: getContentType(filePath),
    isImage: isImage(filePath),
    size: getFileStats(trashPath)?.size || 0,
    deletedAt: nowIso()
  }
  rows.unshift(record)
  writeTrashManifest(booksDir, rows)
  return { success: true, item: record }
}

export function restoreAsset(booksDir, id) {
  const { row, filePath, rows } = getTrashAsset(booksDir, id)
  const targetPath = resolve(booksDir, row.originalRelativePath)
  if (!isInside(booksDir, targetPath) || isInside(getTrashDir(booksDir), targetPath)) {
    throw new Error('原始路径无效')
  }
  if (fs.existsSync(targetPath)) throw new Error('原位置已有同名文件，请先处理后再恢复')
  fs.mkdirSync(dirname(targetPath), { recursive: true })
  fs.renameSync(filePath, targetPath)
  writeTrashManifest(
    booksDir,
    rows.filter((item) => item.id !== id)
  )
  const originalFolderName =
    String(row.originalRelativePath || '')
      .split(/[\\/]/)
      .filter(Boolean)[0] || ''
  const restoredBook = readBooks(booksDir).find(
    (book) =>
      book.folderName === row.bookFolderName ||
      book.name === row.bookName ||
      book.id === row.bookName ||
      book.folderName === originalFolderName
  )
  return {
    success: true,
    item: makeAsset(booksDir, restoredBook, targetPath, row.type, 'restored'),
    restoredPath: targetPath,
    originalRelativePath: row.originalRelativePath,
    trashRelativePath: row.trashRelativePath,
    restoredId: id
  }
}

export function attachToBook(booksDir, input = {}) {
  const source = getAssetFile(booksDir, { id: input.id, trash: Boolean(input.trash) }).filePath
  const book = getBookByName(booksDir, input.bookName)
  const type = String(input.type || input.assetType || 'attachment')
  const targetPath = destinationForType(book.path, type, input.fileName || basename(source))
  fs.copyFileSync(source, targetPath)
  if (type === 'cover') updateBookCoverMeta(book, targetPath)
  return { success: true, item: makeAsset(booksDir, book, targetPath, type, 'attached') }
}

export default {
  listAssets,
  getAssetFile,
  importAsset,
  findAssetReferences,
  deleteAsset,
  restoreAsset,
  attachToBook
}

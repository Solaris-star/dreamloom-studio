import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

const MAX_VERSIONS_PER_CHAPTER = 50
const MAX_CONTENT_BYTES = 8 * 1024 * 1024

function requiredText(value, label, maxLength = 500) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`缺少${label}`)
  if (text.length > maxLength) throw new Error(`${label}过长`)
  return text
}

function getStorePath(bookPath) {
  return join(bookPath, '.dreamloom', 'chapter-versions.json')
}

function readStore(bookPath) {
  const filePath = getStorePath(bookPath)
  if (!fs.existsSync(filePath)) return { version: 1, items: [] }
  let data
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    throw new Error('章节版本文件损坏，未进行覆盖')
  }
  if (data?.version !== 1 || !Array.isArray(data.items)) {
    throw new Error('章节版本文件格式错误，未进行覆盖')
  }
  return data
}

function writeStore(bookPath, data) {
  const filePath = getStorePath(bookPath)
  fs.mkdirSync(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // 保留原始写入错误。
    }
    throw new Error(`章节版本保存失败：${error.message}`)
  }
}

function normalizeInput(payload = {}) {
  const content = String(payload.content ?? payload.contentBefore ?? '')
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
    throw new Error('章节版本内容过大')
  }
  return {
    chapterId: requiredText(payload.chapterId, '章节标识', 1000),
    chapterName: requiredText(payload.chapterName, '章节名称', 300),
    contentBefore: content,
    reason: requiredText(payload.reason || 'manual', '版本原因', 50),
    name: String(payload.name || '').trim().slice(0, 200)
  }
}

export function createChapterVersion(bookPath, payload = {}) {
  const input = normalizeInput(payload)
  const store = readStore(bookPath)
  const snapshot = {
    id: `version_${Date.now()}_${randomBytes(6).toString('hex')}`,
    ...input,
    createdAt: new Date().toISOString()
  }
  const otherItems = store.items.filter((item) => item.chapterId !== input.chapterId)
  const chapterItems = [
    snapshot,
    ...store.items.filter((item) => item.chapterId === input.chapterId)
  ].slice(0, MAX_VERSIONS_PER_CHAPTER)
  writeStore(bookPath, { version: 1, items: [...chapterItems, ...otherItems] })
  return snapshot
}

export function listChapterVersions(bookPath, chapterId) {
  const id = requiredText(chapterId, '章节标识', 1000)
  return readStore(bookPath).items
    .filter((item) => item.chapterId === id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function deleteChapterVersion(bookPath, { chapterId, snapshotId } = {}) {
  const id = requiredText(chapterId, '章节标识', 1000)
  const versionId = requiredText(snapshotId, '版本标识', 200)
  const store = readStore(bookPath)
  const index = store.items.findIndex(
    (item) => item.id === versionId && item.chapterId === id
  )
  if (index === -1) return false
  store.items.splice(index, 1)
  writeStore(bookPath, store)
  return true
}

import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** @type {Map<string, Promise<unknown>>} */
const pathQueues = new Map()

function normalizePath(filePath) {
  return resolve(String(filePath || ''))
}

/**
 * Serialize async work for the same absolute path so concurrent
 * read-modify-write requests cannot overwrite each other.
 */
export function withPathLock(filePath, task) {
  const key = normalizePath(filePath)
  const previous = pathQueues.get(key) || Promise.resolve()
  // Isolate task rejection from the queue chain so one failed write
  // does not poison later readers/writers, and avoid nested re-entry hang
  // by letting callers use unlocked helpers under an existing lock.
  const current = previous.catch(() => undefined).then(() => task())
  const tracked = current.then(
    () => undefined,
    () => undefined
  )
  pathQueues.set(key, tracked)
  tracked.finally(() => {
    if (pathQueues.get(key) === tracked) pathQueues.delete(key)
  })
  return current
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readJsonUnlocked(filePath, fallback) {
  try {
    if (!(await pathExists(filePath))) return fallback
    const raw = await fs.readFile(filePath, 'utf-8')
    const value = JSON.parse(raw || 'null')
    return value == null ? fallback : value
  } catch (error) {
    throw new Error(`读取 JSON 文件失败：${filePath}：${error.message}`, { cause: error })
  }
}

async function writeJsonUnlocked(filePath, data) {
  const directory = dirname(filePath)
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  )
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true })
    } catch {
      // keep original write error
    }
    throw new Error(`写入 JSON 文件失败：${filePath}：${error.message}`, { cause: error })
  }
}

export async function readJson(filePath, fallback) {
  return withPathLock(filePath, () => readJsonUnlocked(filePath, fallback))
}

export async function writeJson(filePath, data) {
  return withPathLock(filePath, () => writeJsonUnlocked(filePath, data))
}

/**
 * Atomic read-modify-write for one JSON path.
 * Concurrent updateJson/writeJson/readJson on the same path are serialized.
 */
export async function updateJson(filePath, updater, fallback = {}) {
  if (typeof updater !== 'function') {
    throw new Error('updateJson 需要 updater 函数')
  }
  return withPathLock(filePath, async () => {
    const current = await readJsonUnlocked(filePath, fallback)
    const next = await updater(current)
    await writeJsonUnlocked(filePath, next)
    return next
  })
}

async function writeTextAtomicUnlocked(filePath, content, encoding = 'utf-8') {
  const directory = dirname(filePath)
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  )
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.writeFile(temporaryPath, content, encoding)
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true })
    } catch {
      // keep original write error
    }
    throw new Error(`写入文件失败：${filePath}：${error.message}`, { cause: error })
  }
}

export async function writeTextAtomic(filePath, content, encoding = 'utf-8') {
  return withPathLock(filePath, () => writeTextAtomicUnlocked(filePath, content, encoding))
}

export function nowIso() {
  return new Date().toISOString()
}

/** @internal test helper */
export function __getPathQueueSizeForTests() {
  return pathQueues.size
}

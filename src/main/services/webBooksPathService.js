import fs from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function cleanPath(value) {
  return String(value || '').trim()
}

export function isPathInside(parent, child) {
  const relation = relative(resolve(parent), resolve(child))
  return (
    relation === '' ||
    (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  )
}

export function resolveBookPathForWebPayload(
  payload = {},
  booksDir = '',
  { ensure = false, fsApi = fs } = {}
) {
  const root = resolve(cleanPath(booksDir))
  const candidate = cleanPath(payload.bookPath || payload.bookName)
  if (!candidate) {
    throw Object.assign(new Error('缺少书籍目录'), { statusCode: 400 })
  }

  const bookPath = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate)
  if (!isPathInside(root, bookPath)) {
    throw Object.assign(new Error('书籍目录不在当前书库内'), { statusCode: 403 })
  }
  if (ensure && (!fsApi.existsSync(bookPath) || !fsApi.statSync(bookPath).isDirectory())) {
    throw Object.assign(new Error('书籍目录不存在'), { statusCode: 404 })
  }
  return bookPath
}

export function inferWebBookNameFromPath(bookPath, booksDir) {
  const root = resolve(cleanPath(booksDir))
  const target = resolve(cleanPath(bookPath))
  if (!isPathInside(root, target)) {
    throw Object.assign(new Error('书籍目录不在当前书库内'), { statusCode: 403 })
  }
  return relative(root, target)
}

export function createWebBooksPathService({
  configuredBooksDir = '',
  defaultBooksDir,
  getStoredBooksDir = () => '',
  fsApi = fs
} = {}) {
  const fixedDir = cleanPath(configuredBooksDir)
  const fallbackDir = resolve(cleanPath(defaultBooksDir) || '.booksDir')

  function getActiveBooksDir() {
    const storedDir = cleanPath(getStoredBooksDir())
    const activeDir = resolve(fixedDir || storedDir || fallbackDir)
    fsApi.mkdirSync(activeDir, { recursive: true })
    return activeDir
  }

  function resolvePromptPresetPath(payload = {}) {
    const root = getActiveBooksDir()
    const candidate = cleanPath(payload.bookPath)
    if (!candidate) return root
    const target = resolve(candidate)
    return isPathInside(root, target) ? target : root
  }

  function resolveBookPath(payload = {}, booksDir = getActiveBooksDir(), options = {}) {
    return resolveBookPathForWebPayload(payload, booksDir, { ...options, fsApi })
  }

  return {
    getActiveBooksDir,
    resolveBookPathForWebPayload: resolveBookPath,
    resolvePromptPresetPath
  }
}

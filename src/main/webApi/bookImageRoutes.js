import fs from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const ROUTES = new Set(['/api/books/cover', '/api/books/image'])
const IMAGE_CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif']
])

function isPathInside(parent, child) {
  const relation = relative(parent, child)
  return relation === '' || (relation && !relation.startsWith('..') && !isAbsolute(relation))
}

function imageContentType(fileName) {
  const normalized = String(fileName || '').toLowerCase()
  const extension = [...IMAGE_CONTENT_TYPES.keys()].find((item) => normalized.endsWith(item))
  return extension ? IMAGE_CONTENT_TYPES.get(extension) : ''
}

export function isBookImageRoute(path) {
  return ROUTES.has(path)
}

export function handleBookImageRoute({
  path,
  req,
  res,
  booksDir,
  sendTransparentImage,
  sanitizeText,
  fileSystem = fs
}) {
  if (!isBookImageRoute(path)) return false

  try {
    const url = new URL(req.url, 'http://localhost')
    const bookName = sanitizeText(url.searchParams.get('book'))
    const fileName = sanitizeText(url.searchParams.get('file'))
    const contentType = imageContentType(fileName)
    if (!bookName || !fileName || !contentType) throw new Error('图片参数无效')

    const root = fileSystem.realpathSync(resolve(booksDir))
    const bookPath = resolve(root, bookName)
    const target = resolve(bookPath, fileName)
    if (!isPathInside(root, bookPath) || !isPathInside(bookPath, target)) {
      throw new Error('图片路径不在书籍目录内')
    }

    const realTarget = fileSystem.realpathSync(target)
    if (!isPathInside(root, realTarget) || !isPathInside(bookPath, realTarget)) {
      throw new Error('图片真实路径不在书籍目录内')
    }
    if (!fileSystem.statSync(realTarget).isFile()) throw new Error('图片文件不存在')

    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(fileSystem.readFileSync(realTarget))
  } catch {
    sendTransparentImage(res)
  }
  return true
}

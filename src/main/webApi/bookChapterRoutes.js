import * as webBooksApi from '../services/webBooksApi.js'

const ROUTES = new Set([
  '/api/books/dir',
  '/api/books/set-dir',
  '/api/books/list',
  '/api/books/create',
  '/api/books/edit',
  '/api/books/delete',
  '/api/volumes/create',
  '/api/chapters/create',
  '/api/chapters/load',
  '/api/chapters/read',
  '/api/chapters/save',
  '/api/chapters/check-exists',
  '/api/chapters/upsert',
  '/api/nodes/edit',
  '/api/nodes/delete',
  '/api/sort-order/get',
  '/api/sort-order/set',
  '/api/chapter-settings/get',
  '/api/chapter-settings/target-words',
  '/api/chapter-format/update',
  '/api/chapter-numbers/reformat'
])

export function isBookChapterRoute(path) {
  return ROUTES.has(path)
}

export async function handleBookChapterRoute({
  path,
  body,
  res,
  booksDir,
  booksDirConfigurable = true,
  sendJson,
  setBooksDir,
  authSession = null,
  service = webBooksApi
}) {
  if (!isBookChapterRoute(path)) return false

  const payload = body || {}
  const session = authSession || { role: 'admin', canManageKeys: true }
  const isGuest = session.role === 'guest'

  async function requireBookAccess(bookName) {
    if (!isGuest) return
    const meta = await service.readBookMeta(booksDir, bookName)
    service.assertBookAccess(meta || {}, session, bookName)
  }

  try {
    let result
    if (path === '/api/books/dir') {
      if (isGuest) {
        result = { success: true, booksDir: '(guest)', configurable: false }
      } else {
        result = { success: true, booksDir, configurable: booksDirConfigurable }
      }
    } else if (path === '/api/books/set-dir') {
      if (isGuest) {
        result = { success: false, message: '访客无权修改书库目录' }
      } else {
        result = setBooksDir(payload.dir)
      }
    } else if (path === '/api/books/list') {
      const books = await service.readBooksDir(booksDir)
      result = service.filterBooksForSession(books, session)
    } else if (path === '/api/books/create') {
      const createPayload = isGuest
        ? {
            ...payload,
            ownerId: session.ownerId || session.keyId
          }
        : payload
      result = await service.createBook(createPayload, booksDir)
    } else if (path === '/api/books/edit') {
      await requireBookAccess(payload.originalName || payload.name || payload.folderName)
      result = await service.editBook(payload, booksDir)
    } else if (path === '/api/books/delete') {
      await requireBookAccess(payload.name)
      result = await service.deleteBook(payload.name, booksDir)
    } else if (path === '/api/volumes/create') {
      await requireBookAccess(payload.bookName)
      result = await service.createVolume(payload.bookName, booksDir)
    } else if (path === '/api/chapters/create') {
      await requireBookAccess(payload.bookName)
      result = await service.createChapter(payload, booksDir)
    } else if (path === '/api/chapters/load') {
      await requireBookAccess(payload.bookName)
      result = await service.loadChapters(payload.bookName, booksDir)
    } else if (path === '/api/chapters/read') {
      await requireBookAccess(payload.bookName)
      result = await service.readChapter(payload, booksDir)
    } else if (path === '/api/chapters/save') {
      await requireBookAccess(payload.bookName)
      result = await service.saveChapter(payload, booksDir)
    } else if (path === '/api/chapters/check-exists') {
      await requireBookAccess(payload.bookName)
      result = await service.checkChapterExists(payload, booksDir)
    } else if (path === '/api/chapters/upsert') {
      await requireBookAccess(payload.bookName)
      result = await service.upsertChapter(payload, booksDir)
    } else if (path === '/api/nodes/edit') {
      await requireBookAccess(payload.bookName)
      result = await service.editNode(payload, booksDir)
    } else if (path === '/api/nodes/delete') {
      await requireBookAccess(payload.bookName)
      result = await service.deleteNode(payload, booksDir)
    } else if (path === '/api/sort-order/get') {
      await requireBookAccess(payload.bookName)
      result = { success: true, order: await service.getSortOrder(payload.bookName) }
    } else if (path === '/api/sort-order/set') {
      await requireBookAccess(payload.bookName)
      result = await service.setSortOrder(payload)
    } else if (path === '/api/chapter-settings/get') {
      await requireBookAccess(payload.bookName)
      result = await service.getChapterSettings(payload.bookName)
    } else if (path === '/api/chapter-settings/target-words') {
      await requireBookAccess(payload.bookName)
      result = await service.setChapterTargetWords(payload)
    } else if (path === '/api/chapter-format/update') {
      await requireBookAccess(payload.bookName)
      result = await service.updateChapterFormat(payload, booksDir)
    } else {
      await requireBookAccess(payload.bookName)
      result = await service.reformatChapterNumbers(payload, booksDir)
    }
    sendJson(res, result)
  } catch (error) {
    sendJson(
      res,
      { success: false, message: error?.message || '请求失败' },
      error?.statusCode || 500
    )
  }
  return true
}

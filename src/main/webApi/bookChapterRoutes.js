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
  service = webBooksApi
}) {
  if (!isBookChapterRoute(path)) return false

  const payload = body || {}
  let result
  if (path === '/api/books/dir') {
    result = { success: true, booksDir, configurable: booksDirConfigurable }
  } else if (path === '/api/books/set-dir') {
    result = setBooksDir(payload.dir)
  } else if (path === '/api/books/list') {
    result = await service.readBooksDir(booksDir)
  } else if (path === '/api/books/create') {
    result = await service.createBook(payload, booksDir)
  } else if (path === '/api/books/edit') {
    result = await service.editBook(payload, booksDir)
  } else if (path === '/api/books/delete') {
    result = await service.deleteBook(payload.name, booksDir)
  } else if (path === '/api/volumes/create') {
    result = await service.createVolume(payload.bookName, booksDir)
  } else if (path === '/api/chapters/create') {
    result = await service.createChapter(payload, booksDir)
  } else if (path === '/api/chapters/load') {
    result = await service.loadChapters(payload.bookName, booksDir)
  } else if (path === '/api/chapters/read') {
    result = await service.readChapter(payload, booksDir)
  } else if (path === '/api/chapters/save') {
    result = await service.saveChapter(payload, booksDir)
  } else if (path === '/api/chapters/check-exists') {
    result = await service.checkChapterExists(payload, booksDir)
  } else if (path === '/api/chapters/upsert') {
    result = await service.upsertChapter(payload, booksDir)
  } else if (path === '/api/nodes/edit') {
    result = await service.editNode(payload, booksDir)
  } else if (path === '/api/nodes/delete') {
    result = await service.deleteNode(payload, booksDir)
  } else if (path === '/api/sort-order/get') {
    result = { success: true, order: await service.getSortOrder(payload.bookName) }
  } else if (path === '/api/sort-order/set') {
    result = await service.setSortOrder(payload)
  } else if (path === '/api/chapter-settings/get') {
    result = await service.getChapterSettings(payload.bookName)
  } else if (path === '/api/chapter-settings/target-words') {
    result = await service.setChapterTargetWords(payload)
  } else if (path === '/api/chapter-format/update') {
    result = await service.updateChapterFormat(payload, booksDir)
  } else {
    result = await service.reformatChapterNumbers(payload, booksDir)
  }
  sendJson(res, result)
  return true
}

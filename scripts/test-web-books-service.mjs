import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

const requests = []
const responses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : undefined
  requests.push({ url, method: options.method || 'GET', payload })
  const value = responses.get(url)
  const data = typeof value === 'function' ? value(payload) : value
  const body = data ?? { success: false, message: `未设置测试响应：${url}` }
  return new Response(JSON.stringify(body), {
    status: body?.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

setActivePinia(createPinia())
const booksService = await import('../src/renderer/src/service/books.js')
const { useMainStore } = await import('../src/renderer/src/stores/index.js')
const mainStore = useMainStore()

responses.set('/api/books/dir', { success: true, booksDir: 'D:/books' })
assert.equal(await booksService.getBookDir(), 'D:/books')
assert.deepEqual(requests.at(-1), {
  url: '/api/books/dir',
  method: 'GET',
  payload: undefined
})

responses.set('/api/books/set-dir', { success: true, booksDir: 'D:/new-books' })
assert.equal(await booksService.setBookDir('D:/new-books'), 'D:/new-books')
assert.deepEqual(requests.at(-1), {
  url: '/api/books/set-dir',
  method: 'POST',
  payload: { dir: 'D:/new-books' }
})
await assert.rejects(() => booksService.setBookDir(''), /书库目录不能为空/)

responses.set('/api/books/set-dir', { success: true, booksDir: 'D:/wrong' })
await assert.rejects(() => booksService.setBookDir('D:/new-books'), /接口返回格式不正确/)

const books = [{ id: 'book-1', name: '第一本书', folderName: '第一本书' }]
responses.set('/api/books/list', books)
assert.deepEqual(await booksService.readBooksDir(), books)
assert.deepEqual(mainStore.books, books)
assert.deepEqual(requests.at(-1), {
  url: '/api/books/list',
  method: 'POST',
  payload: {}
})

responses.set('/api/books/create', {
  success: true,
  bookName: '新作品',
  bookId: 'book-2'
})
assert.equal((await booksService.createBook({ name: '新作品' })).bookId, 'book-2')
assert.deepEqual(requests.at(-1).payload, { name: '新作品' })

responses.set('/api/books/edit', {
  success: true,
  bookName: '修改后的作品',
  folderName: '第一本书'
})
await booksService.updateBook({ originalName: '第一本书', name: '修改后的作品' })
assert.deepEqual(requests.at(-1), {
  url: '/api/books/edit',
  method: 'POST',
  payload: { originalName: '第一本书', name: '修改后的作品' }
})

responses.set('/api/books/delete', {
  success: true,
  bookName: '第一本书',
  deleted: true
})
await booksService.deleteBook('第一本书')
assert.deepEqual(requests.at(-1).payload, { name: '第一本书' })

responses.set('/api/books/list', { success: true, books: [] })
await assert.rejects(() => booksService.readBooksDir(), /书籍列表接口返回格式不正确/)
assert.deepEqual(mainStore.books, [])

responses.set('/api/books/edit', { success: false, message: '作品不存在' })
await assert.rejects(
  () => booksService.updateBook({ name: '不存在' }),
  /作品不存在/
)

responses.set('/api/books/dir', { success: true, booksDir: null })
await assert.rejects(() => booksService.getBookDir(), /书库目录接口返回格式不正确/)

console.log('Web 书籍服务测试通过')

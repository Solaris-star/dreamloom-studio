import assert from 'node:assert/strict'
import { handleBookImageRoute, isBookImageRoute } from '../src/main/webApi/bookImageRoutes.js'

function createResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(data) {
      this.data = data
    }
  }
}

const reads = []
const fileSystem = {
  realpathSync(path) {
    return path
  },
  statSync() {
    return { isFile: () => true }
  },
  readFileSync(path) {
    reads.push(path)
    return Buffer.from('image')
  }
}
const common = {
  booksDir: 'D:\\books',
  sanitizeText: (value) => String(value || '').trim(),
  fileSystem
}

assert.equal(isBookImageRoute('/api/books/cover'), true)
assert.equal(isBookImageRoute('/api/books/image'), true)
assert.equal(isBookImageRoute('/api/books/list'), false)
assert.equal(
  handleBookImageRoute({
    ...common,
    path: '/api/books/list',
    req: { url: '/api/books/list' },
    res: {},
    sendTransparentImage() {}
  }),
  false
)

for (const [file, contentType] of [
  ['cover.png', 'image/png'],
  ['cover.JPG', 'image/jpeg'],
  ['images/cover.webp', 'image/webp'],
  ['images/cover.gif', 'image/gif'],
  ['images/cover.avif', 'image/avif']
]) {
  const res = createResponse()
  let fallbackCount = 0
  assert.equal(
    handleBookImageRoute({
      ...common,
      path: '/api/books/image',
      req: {
        url: `/api/books/image?book=${encodeURIComponent('作品')}&file=${encodeURIComponent(file)}`
      },
      res,
      sendTransparentImage: () => {
        fallbackCount += 1
      }
    }),
    true
  )
  assert.equal(fallbackCount, 0)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Content-Type'], contentType)
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  assert.deepEqual(res.data, Buffer.from('image'))
}

const invalidRequests = [
  '/api/books/image?book=&file=cover.png',
  '/api/books/image?book=作品&file=notes.txt',
  '/api/books/image?book=..%2Foutside&file=cover.png',
  '/api/books/image?book=作品&file=..%2Foutside.png'
]
for (const url of invalidRequests) {
  let fallbackCount = 0
  handleBookImageRoute({
    ...common,
    path: '/api/books/image',
    req: { url },
    res: {},
    sendTransparentImage: () => {
      fallbackCount += 1
    }
  })
  assert.equal(fallbackCount, 1)
}

let fallbackCount = 0
handleBookImageRoute({
  ...common,
  path: '/api/books/cover',
  req: { url: '/api/books/cover?book=作品&file=cover.png' },
  res: {},
  fileSystem: {
    ...fileSystem,
    realpathSync(path) {
      return path.endsWith('cover.png') ? 'D:\\outside\\cover.png' : path
    }
  },
  sendTransparentImage: () => {
    fallbackCount += 1
  }
})
assert.equal(fallbackCount, 1)
assert.equal(reads.length, 5)

console.log('书籍图片路由测试通过')

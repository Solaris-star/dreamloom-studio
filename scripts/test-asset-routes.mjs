import assert from 'node:assert/strict'
import { handleAssetRoute, isAssetRoute } from '../src/main/webApi/assetRoutes.js'

const calls = []
const responses = []
const assets = {
  getAssetFile: (...args) => (
    calls.push(['get', ...args]),
    { filePath: 'D:/books/assets/cover.webp', contentType: 'image/webp' }
  ),
  listAssets: (...args) => (calls.push(['list', ...args]), { success: true, items: [] }),
  importAsset: (...args) => (calls.push(['import', ...args]), { success: true, id: 'a1' }),
  findAssetReferences: (...args) => (
    calls.push(['references', ...args]),
    [{ type: 'cover', bookName: '测试书' }]
  ),
  deleteAsset: (...args) => (calls.push(['delete', ...args]), { success: false }),
  restoreAsset: (...args) => (calls.push(['restore', ...args]), { success: true }),
  attachToBook: (...args) => (calls.push(['attach', ...args]), { success: true })
}
const fileSystem = {
  readFileSync(filePath) {
    calls.push(['read', filePath])
    return Buffer.from('image')
  }
}
const imageResponse = {
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value
  },
  end(data) {
    this.data = data
  }
}
const common = {
  body: {},
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  sendTransparentImage: () => {
    throw new Error('不应返回占位图')
  },
  assets,
  fileSystem
}

for (const path of [
  '/api/assets/get',
  '/api/assets/list',
  '/api/assets/import',
  '/api/assets/references',
  '/api/assets/delete',
  '/api/assets/restore',
  '/api/assets/attach-to-book'
]) {
  assert.equal(isAssetRoute(path), true)
}
assert.equal(isAssetRoute('/api/books/list'), false)

assert.equal(
  handleAssetRoute({
    ...common,
    path: '/api/assets/get',
    req: { url: '/api/assets/get?id=a1&trash=true' },
    res: imageResponse
  }),
  true
)
assert.equal(imageResponse.statusCode, 200)
assert.equal(imageResponse.headers['Content-Type'], 'image/webp')
assert.deepEqual(imageResponse.data, Buffer.from('image'))

for (const [path, body] of [
  ['/api/assets/list', { trash: false }],
  ['/api/assets/import', { fileName: 'cover.webp' }],
  ['/api/assets/references', { id: 'a1' }],
  ['/api/assets/delete', { id: 'a1' }],
  ['/api/assets/restore', { id: 'a1' }],
  ['/api/assets/attach-to-book', { id: 'a1', bookName: '测试书' }]
]) {
  assert.equal(handleAssetRoute({ ...common, path, body }), true)
}

let fallbackCount = 0
assert.equal(
  handleAssetRoute({
    ...common,
    path: '/api/assets/get',
    req: { url: '/api/assets/get?id=missing' },
    res: {},
    assets: {
      ...assets,
      getAssetFile() {
        throw new Error('素材不存在')
      }
    },
    sendTransparentImage: () => {
      fallbackCount += 1
    }
  }),
  true
)
assert.equal(fallbackCount, 1)
assert.equal(
  handleAssetRoute({
    ...common,
    path: '/api/books/list',
    req: { url: '/api/books/list' }
  }),
  false
)

assert.deepEqual(responses, [
  { success: true, items: [] },
  { success: true, id: 'a1' },
  {
    success: true,
    references: [{ type: 'cover', bookName: '测试书' }]
  },
  { success: false },
  { success: true },
  { success: true }
])
assert.deepEqual(calls, [
  ['get', 'D:/books', { id: 'a1', trash: true }],
  ['read', 'D:/books/assets/cover.webp'],
  ['list', 'D:/books', { trash: false }],
  ['import', 'D:/books', { fileName: 'cover.webp' }],
  ['references', 'D:/books', 'a1'],
  ['delete', 'D:/books', 'a1'],
  ['restore', 'D:/books', 'a1'],
  ['attach', 'D:/books', { id: 'a1', bookName: '测试书' }]
])

console.log('素材路由测试通过')

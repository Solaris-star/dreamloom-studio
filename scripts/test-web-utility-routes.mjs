import assert from 'node:assert/strict'
import { isAbsolute } from 'node:path'
import { handleWebUtilityRoute, isWebUtilityRoute } from '../src/main/webApi/webUtilityRoutes.js'

const responses = []
const values = new Map([['theme', 'dark']])

// Use platform-native absolute paths so isAbsolute() matches the runtime path module.
const isWin = process.platform === 'win32'
const library = isWin ? 'D:\\library' : '/library'
const books = isWin ? 'D:\\library\\books' : '/library/books'
const work = isWin ? 'D:\\library\\books\\作品' : '/library/books/作品'
const file = isWin ? 'D:\\library\\books\\文件.txt' : '/library/books/文件.txt'
const outside = isWin ? 'D:\\outside' : '/outside'
const missing = isWin ? 'D:\\missing' : '/missing'

assert.equal(isAbsolute(books), true)

const entries = new Map([
  [library, 'directory'],
  [books, 'directory'],
  [work, 'directory'],
  [file, 'file'],
  [outside, 'directory']
])
const fileSystem = {
  realpathSync(path) {
    if (!entries.has(path)) throw new Error('不存在')
    return path
  },
  statSync(path) {
    return { isDirectory: () => entries.get(path) === 'directory' }
  },
  readdirSync() {
    return [
      {
        name: '作品',
        isDirectory: () => true,
        isSymbolicLink: () => false
      },
      {
        name: '链接',
        isDirectory: () => true,
        isSymbolicLink: () => true
      },
      {
        name: '文件.txt',
        isDirectory: () => false,
        isSymbolicLink: () => false
      }
    ]
  }
}
const common = {
  res: {},
  booksDir: books,
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  storeGet: (key) => values.get(key),
  storeSet: (key, value) => {
    values.set(key, value)
    return true
  },
  storeDelete: (key) => {
    values.delete(key)
    return true
  },
  fileSystem
}

for (const path of ['/api/fs/list', '/api/store/get', '/api/store/set', '/api/store/delete']) {
  assert.equal(isWebUtilityRoute(path), true)
}
assert.equal(await handleWebUtilityRoute({ ...common, path: '/api/books/list' }), false)

await handleWebUtilityRoute({
  ...common,
  path: '/api/fs/list',
  body: { dir: books }
})
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  path: books,
  root: library,
  dirs: [{ name: '作品' }]
})

for (const [dir, statusCode] of [
  ['books', 400],
  [missing, 404],
  [outside, 403],
  [file, 400]
]) {
  await assert.rejects(
    () =>
      handleWebUtilityRoute({
        ...common,
        path: '/api/fs/list',
        body: { dir }
      }),
    (error) => error.statusCode === statusCode
  )
}

await handleWebUtilityRoute({ ...common, path: '/api/store/get', body: { key: 'theme' } })
assert.deepEqual(responses.at(-1)[0], { success: true, key: 'theme', value: 'dark' })

await handleWebUtilityRoute({
  ...common,
  path: '/api/store/set',
  body: { key: 'language', value: 'zh-CN' }
})
assert.equal(values.get('language'), 'zh-CN')

await handleWebUtilityRoute({ ...common, path: '/api/store/delete', body: { key: 'language' } })
assert.equal(values.has('language'), false)

for (const key of ['', ' ', '__proto__', 'prototype', 'constructor', 'x'.repeat(129)]) {
  await assert.rejects(
    () => handleWebUtilityRoute({ ...common, path: '/api/store/get', body: { key } }),
    (error) => error.statusCode === 400
  )
}

await assert.rejects(
  () =>
    handleWebUtilityRoute({
      ...common,
      path: '/api/store/set',
      body: { key: 'theme', value: 'light' },
      storeSet: () => false
    }),
  /保存本地设置失败/
)

console.log('Web 工具路由测试通过')

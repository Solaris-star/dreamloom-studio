import assert from 'node:assert/strict'
import { handleWebUtilityRoute, isWebUtilityRoute } from '../src/main/webApi/webUtilityRoutes.js'

const responses = []
const values = new Map([['theme', 'dark']])
const entries = new Map([
  ['D:\\library', 'directory'],
  ['D:\\library\\books', 'directory'],
  ['D:\\library\\books\\作品', 'directory'],
  ['D:\\library\\books\\文件.txt', 'file'],
  ['D:\\outside', 'directory']
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
  booksDir: 'D:\\library\\books',
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
assert.equal(handleWebUtilityRoute({ ...common, path: '/api/books/list' }), false)

handleWebUtilityRoute({
  ...common,
  path: '/api/fs/list',
  body: { dir: 'D:\\library\\books' }
})
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  path: 'D:\\library\\books',
  root: 'D:\\library',
  dirs: [{ name: '作品' }]
})

for (const [dir, statusCode] of [
  ['books', 400],
  ['D:\\missing', 404],
  ['D:\\outside', 403],
  ['D:\\library\\books\\文件.txt', 400]
]) {
  assert.throws(
    () =>
      handleWebUtilityRoute({
        ...common,
        path: '/api/fs/list',
        body: { dir }
      }),
    (error) => error.statusCode === statusCode
  )
}

handleWebUtilityRoute({ ...common, path: '/api/store/get', body: { key: 'theme' } })
assert.deepEqual(responses.at(-1)[0], { success: true, key: 'theme', value: 'dark' })

handleWebUtilityRoute({
  ...common,
  path: '/api/store/set',
  body: { key: 'language', value: 'zh-CN' }
})
assert.equal(values.get('language'), 'zh-CN')

handleWebUtilityRoute({ ...common, path: '/api/store/delete', body: { key: 'language' } })
assert.equal(values.has('language'), false)

for (const key of ['', ' ', '__proto__', 'prototype', 'constructor', 'x'.repeat(129)]) {
  assert.throws(
    () => handleWebUtilityRoute({ ...common, path: '/api/store/get', body: { key } }),
    (error) => error.statusCode === 400
  )
}

assert.throws(
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

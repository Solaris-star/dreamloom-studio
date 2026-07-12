import assert from 'node:assert/strict'
import { handleSettingsRoute, isSettingsRoute } from '../src/main/webApi/settingsRoutes.js'

const responses = []
const writes = []
const removed = []
const entries = new Map([
  ['D:\\books', { type: 'directory' }],
  ['D:\\books\\book.txt', { type: 'file', size: 12 }],
  ['D:\\books\\nested', { type: 'directory' }],
  ['D:\\books\\nested\\chapter.txt', { type: 'file', size: 18 }],
  ['D:\\books\\assets-trash', { type: 'directory' }],
  ['D:\\books\\assets-trash\\cover.png', { type: 'file', size: 25 }],
  ['D:\\app\\.store.json', { type: 'file', size: 40 }]
])
const children = new Map([
  [
    'D:\\books',
    [
      { name: 'book.txt', kind: 'file' },
      { name: 'nested', kind: 'directory' },
      { name: 'assets-trash', kind: 'directory' },
      { name: 'ignored-link', kind: 'link' }
    ]
  ],
  ['D:\\books\\nested', [{ name: 'chapter.txt', kind: 'file' }]],
  ['D:\\books\\assets-trash', [{ name: 'cover.png', kind: 'file' }]]
])
const toStats = (entry) => ({
  size: entry.size || 0,
  isFile: () => entry.type === 'file',
  isDirectory: () => entry.type === 'directory'
})
const fileSystem = {
  statSync(path) {
    const entry = entries.get(path)
    if (!entry) throw new Error('不存在')
    return toStats(entry)
  },
  readdirSync(path) {
    return (children.get(path) || []).map((entry) => ({
      name: entry.name,
      isFile: () => entry.kind === 'file',
      isDirectory: () => entry.kind === 'directory',
      isSymbolicLink: () => entry.kind === 'link'
    }))
  },
  rmSync(path, options) {
    removed.push([path, options])
    entries.delete('D:\\books\\assets-trash\\cover.png')
    children.set(path, [])
  }
}
const common = {
  res: {},
  booksDir: 'D:\\books',
  storeFile: 'D:\\app\\.store.json',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  readStore: () => ({ theme: 'dark' }),
  setStoreValue: (...args) => writes.push(args),
  isPathInside: () => true,
  fileSystem,
  now: () => new Date('2026-07-12T08:30:00.000Z')
}

for (const path of [
  '/api/settings/storage-stats',
  '/api/settings/clear-trash',
  '/api/settings/export',
  '/api/settings/import'
]) {
  assert.equal(isSettingsRoute(path), true)
}
assert.equal(isSettingsRoute('/api/vector/stats'), false)
assert.equal(handleSettingsRoute({ ...common, path: '/api/vector/stats' }), false)

assert.equal(
  handleSettingsRoute({ ...common, path: '/api/settings/storage-stats' }),
  true
)
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  booksDir: 'D:\\books',
  booksSize: 55,
  storeSize: 40,
  trashSize: 25
})

handleSettingsRoute({ ...common, path: '/api/settings/clear-trash' })
assert.deepEqual(removed, [
  ['D:\\books\\assets-trash', { recursive: true, force: true }]
])
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  bytesBefore: 25,
  bytesAfter: 0
})

handleSettingsRoute({ ...common, path: '/api/settings/export' })
const exported = responses.at(-1)[0]
assert.equal(exported.fileName, 'zhimeng-settings-2026-07-12.json')
assert.deepEqual(JSON.parse(exported.content), {
  version: 1,
  exportedAt: '2026-07-12T08:30:00.000Z',
  settings: { theme: 'dark' }
})

const importJson = JSON.stringify({
  version: 1,
  settings: {
    theme: 'light',
    password: 'blocked',
    secrets: { token: 'blocked' },
    prototype: 'blocked',
    constructor: 'blocked',
    language: 'zh-CN'
  }
})
handleSettingsRoute({
  ...common,
  path: '/api/settings/import',
  body: { jsonString: importJson }
})
assert.deepEqual(writes, [
  ['theme', 'light'],
  ['language', 'zh-CN']
])
assert.deepEqual(responses.at(-1)[0], { success: true, count: 2 })

for (const [body, message] of [
  [{ jsonString: '{bad json' }, '导入设置失败：JSON 格式不正确'],
  [{ settings: [] }, '导入设置失败：备份格式不正确'],
  [{ version: 1 }, '导入设置失败：备份格式不正确']
]) {
  await assert.rejects(
    async () =>
      handleSettingsRoute({
        ...common,
        path: '/api/settings/import',
        body
      }),
    (error) => error.statusCode === 400 && error.message === message
  )
}

assert.throws(
  () =>
    handleSettingsRoute({
      ...common,
      path: '/api/settings/clear-trash',
      isPathInside: () => false
    }),
  /回收站目录不在当前书库内/
)

console.log('设置路由测试通过')

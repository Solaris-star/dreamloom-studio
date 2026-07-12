import assert from 'node:assert/strict'
import {
  handleConsistencyRoute,
  isConsistencyRoute
} from '../src/main/webApi/consistencyRoutes.js'

const calls = []
const responses = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  store: { name: 'store' },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  },
  createProvider: (store, payload) => {
    calls.push(['provider', store, payload])
    return { service: { name: 'text-provider' } }
  },
  runCheck: async (payload, options) => {
    calls.push(['check', payload, options])
    return { success: true, issues: [] }
  },
  listChecks: (payload) => {
    calls.push(['list', payload])
    return { success: true, checks: [] }
  }
}

assert.equal(isConsistencyRoute('/api/consistency/check'), true)
assert.equal(isConsistencyRoute('/api/consistency/list'), true)
assert.equal(isConsistencyRoute('/api/consistency/delete'), false)
assert.equal(
  await handleConsistencyRoute({ ...common, path: '/api/books/list' }),
  false
)

await handleConsistencyRoute({
  ...common,
  path: '/api/consistency/list',
  body: { bookName: '作品' }
})
assert.deepEqual(calls.at(-1), [
  'list',
  { bookName: '作品', bookPath: 'D:\\books\\作品' }
])
assert.equal(calls.find((call) => call[0] === 'path')[3].ensure, true)

await handleConsistencyRoute({
  ...common,
  path: '/api/consistency/check',
  body: { bookName: '作品', text: '正文', useLlm: false }
})
assert.equal(calls.some((call) => call[0] === 'provider'), false)
assert.deepEqual(calls.at(-1), [
  'check',
  {
    bookName: '作品',
    text: '正文',
    useLlm: false,
    bookPath: 'D:\\books\\作品'
  },
  { textProvider: undefined }
])

for (const flag of ['useLlm', 'aiCheck', 'enableLlm']) {
  calls.length = 0
  await handleConsistencyRoute({
    ...common,
    path: '/api/consistency/check',
    body: { bookName: '作品', text: '正文', [flag]: true }
  })
  assert.deepEqual(calls.find((call) => call[0] === 'provider').slice(1), [
    common.store,
    { bookName: '作品', text: '正文', [flag]: true }
  ])
  assert.deepEqual(calls.at(-1)[2], { textProvider: { name: 'text-provider' } })
  assert.equal(responses.at(-1)[0].success, true)
}

calls.length = 0
await handleConsistencyRoute({
  ...common,
  path: '/api/consistency/check',
  body: { bookName: '作品', text: '正文', useLlm: 'true' }
})
assert.equal(calls.some((call) => call[0] === 'provider'), false)

console.log('一致性检查路由测试通过')

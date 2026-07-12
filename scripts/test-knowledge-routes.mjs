import assert from 'node:assert/strict'
import {
  handleKnowledgeRoute,
  isKnowledgeRoute
} from '../src/main/webApi/knowledgeRoutes.js'

const calls = []
const responses = []
const item = { id: 'k1', title: '密信' }
const knowledge = {
  listKnowledgeItems: (...args) => (calls.push(['list', ...args]), [item]),
  getKnowledgeItem: (...args) => (calls.push(['get', ...args]), item),
  createKnowledgeItem: (...args) => (calls.push(['create', ...args]), { success: true, item }),
  updateKnowledgeItem: (...args) => (calls.push(['update', ...args]), { success: true, item }),
  deleteKnowledgeItem: (...args) => (
    calls.push(['delete', ...args]),
    { success: true, deletedId: 'k1' }
  ),
  searchKnowledgeItems: (...args) => (calls.push(['search', ...args]), [item]),
  favoriteKnowledgeItem: (...args) => (
    calls.push(['favorite', ...args]),
    { success: true, item }
  ),
  archiveKnowledgeItem: (...args) => (
    calls.push(['archive', ...args]),
    { success: true, item }
  ),
  linkKnowledgeItems: (...args) => (calls.push(['link', ...args]), { success: true, item }),
  convertTopicCardToBook: (...args) => (
    calls.push(['convert', ...args]),
    { success: true, bookName: '新书' }
  )
}
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload, statusCode) => responses.push([payload, statusCode]),
  knowledge
}
const cases = [
  ['/api/knowledge/list', { type: 'note' }],
  ['/api/knowledge/get', { id: 'k1' }],
  ['/api/knowledge/create', { title: '密信' }],
  ['/api/knowledge/update', { id: 'k1', patch: { title: '旧信' } }],
  ['/api/knowledge/delete', { id: 'k1' }],
  ['/api/knowledge/search', { keyword: '信', filter: { favorite: true } }],
  ['/api/knowledge/favorite', { id: 'k1', favorite: true }],
  ['/api/knowledge/archive', { id: 'k1' }],
  ['/api/knowledge/link', { sourceId: 'k1', targetIds: ['k2'] }],
  ['/api/knowledge/convert-topic-to-book', { topicCardId: 'k1' }]
]

for (const [path, body] of cases) {
  assert.equal(isKnowledgeRoute(path), true)
  assert.equal(handleKnowledgeRoute({ ...common, path, body }), true)
}
assert.equal(isKnowledgeRoute('/api/knowledge/ai-task'), false)
assert.equal(
  handleKnowledgeRoute({ ...common, path: '/api/market/hotspots', body: {} }),
  false
)

assert.deepEqual(calls, [
  ['list', 'D:/books', { type: 'note' }],
  ['get', 'D:/books', 'k1'],
  ['create', 'D:/books', { title: '密信' }],
  ['update', 'D:/books', 'k1', { title: '旧信' }],
  ['delete', 'D:/books', 'k1'],
  ['search', 'D:/books', '信', { favorite: true }],
  ['favorite', 'D:/books', 'k1', true],
  ['archive', 'D:/books', 'k1'],
  ['link', 'D:/books', 'k1', ['k2']],
  ['convert', 'D:/books', 'k1']
])
assert.deepEqual(responses, [
  [{ success: true, items: [item] }, undefined],
  [{ success: true, item }, 200],
  [{ success: true, item }, undefined],
  [{ success: true, item }, undefined],
  [{ success: true, deletedId: 'k1' }, undefined],
  [{ success: true, items: [item] }, undefined],
  [{ success: true, item }, undefined],
  [{ success: true, item }, undefined],
  [{ success: true, item }, undefined],
  [{ success: true, bookName: '新书' }, undefined]
])

const missingResponses = []
assert.equal(
  handleKnowledgeRoute({
    ...common,
    path: '/api/knowledge/get',
    body: { id: 'missing' },
    knowledge: { ...knowledge, getKnowledgeItem: () => null },
    sendJson: (_res, payload, statusCode) => missingResponses.push([payload, statusCode])
  }),
  true
)
assert.deepEqual(missingResponses, [
  [{ success: false, message: '素材不存在' }, 404]
])

console.log('知识库路由测试通过')

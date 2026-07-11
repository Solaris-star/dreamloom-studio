import assert from 'node:assert/strict'

const requests = []
let responseData = { success: true }

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  requests.push({ url, payload })
  return new Response(JSON.stringify(responseData), {
    status: responseData.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const knowledge = await import('../src/renderer/src/service/knowledgeBase.js')
const item = { id: 'item-1', title: '素材' }

responseData = { success: true, items: [item] }
assert.equal((await knowledge.listKnowledgeItems({ type: 'idea' })).items.length, 1)
assert.deepEqual(requests.at(-1), {
  url: '/api/knowledge/list',
  payload: { type: 'idea' }
})

responseData = { success: true, item }
await knowledge.updateKnowledgeItem('item-1', { title: '新标题' })
assert.deepEqual(requests.at(-1), {
  url: '/api/knowledge/update',
  payload: { id: 'item-1', patch: { title: '新标题' } }
})

responseData = { success: true, items: [item] }
await knowledge.searchKnowledgeItems('密信', { favorite: true })
assert.deepEqual(requests.at(-1), {
  url: '/api/knowledge/search',
  payload: { keyword: '密信', filter: { favorite: true } }
})

responseData = { success: true, item }
await knowledge.linkKnowledgeItems('item-1', ['item-2'])
assert.deepEqual(requests.at(-1), {
  url: '/api/knowledge/link',
  payload: { sourceId: 'item-1', targetIds: ['item-2'] }
})

responseData = { success: true, deletedId: 'other-id' }
await assert.rejects(() => knowledge.deleteKnowledgeItem('item-1'), /素材不匹配/)

responseData = {
  success: true,
  raw: '{"title":"选题"}',
  parsed: { title: '选题' }
}
assert.equal((await knowledge.runKnowledgeAiTask({ prompt: '生成选题' })).parsed.title, '选题')
assert.equal(requests.at(-1).url, '/api/knowledge/ai-task')

console.log('Web 知识库服务测试通过')

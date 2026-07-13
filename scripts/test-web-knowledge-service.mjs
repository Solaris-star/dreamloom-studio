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
assert.equal((await knowledge.getKnowledgeItem('item-1')).item.id, 'item-1')
assert.deepEqual(requests.at(-1).payload, { id: 'item-1' })

responseData = { success: true, item }
assert.equal((await knowledge.createKnowledgeItem({ title: '新素材' })).item.id, 'item-1')
assert.deepEqual(requests.at(-1).payload, { title: '新素材' })

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

responseData = { success: true, item }
await knowledge.favoriteKnowledgeItem('item-1', true)
assert.deepEqual(requests.at(-1).payload, { id: 'item-1', favorite: true })

responseData = { success: true, item }
await knowledge.archiveKnowledgeItem('item-1')
assert.deepEqual(requests.at(-1).payload, { id: 'item-1' })

responseData = {
  success: true,
  item,
  book: { name: '新作品' }
}
assert.equal((await knowledge.convertTopicCardToBook('item-1')).book.name, '新作品')
assert.deepEqual(requests.at(-1).payload, { topicCardId: 'item-1' })

responseData = { success: true, item }
assert.equal(
  (await knowledge.createTopicCardFromAi({ title: 'AI 选题' })).item.id,
  'item-1'
)
assert.deepEqual(requests.at(-1).payload, { title: 'AI 选题' })

responseData = { success: true, deletedId: 'other-id' }
await assert.rejects(() => knowledge.deleteKnowledgeItem('item-1'), /素材不匹配/)
responseData = { success: true, deletedId: 'item-1' }
assert.equal((await knowledge.deleteKnowledgeItem('item-1')).deletedId, 'item-1')

responseData = {
  success: true,
  raw: '{"title":"选题"}',
  parsed: { title: '选题' }
}
assert.equal((await knowledge.runKnowledgeAiTask({ prompt: '生成选题' })).parsed.title, '选题')
assert.equal(requests.at(-1).url, '/api/knowledge/ai-task')

assert.throws(
  () => knowledge.requireKnowledgeSuccess({ success: false, error: '操作被拒绝' }),
  /操作被拒绝/
)
assert.throws(() => knowledge.requireKnowledgeSuccess(null, '备用错误'), /备用错误/)
assert.throws(
  () => knowledge.requireKnowledgeListResult({ success: true, items: {} }),
  /接口返回格式不正确/
)
assert.throws(
  () => knowledge.requireKnowledgeListResult({ success: true, items: [null] }),
  /没有返回有效素材/
)
assert.throws(
  () => knowledge.requireKnowledgeItemResult({ success: true, item: { id: ' ' } }),
  /没有返回有效素材/
)
assert.throws(
  () => knowledge.requireKnowledgeDeleteResult({ success: true }),
  /没有返回删除 ID/
)
assert.equal(
  knowledge.requireKnowledgeDeleteResult({ success: true, deletedId: 'item-1' }).deletedId,
  'item-1'
)
assert.throws(
  () => knowledge.requireTopicCardBookResult({ success: true, item, book: [] }),
  /接口没有返回作品/
)
assert.throws(
  () => knowledge.requireTopicCardBookResult({ success: true, item, book: { name: '' } }),
  /接口没有返回作品/
)
assert.throws(
  () =>
    knowledge.requireKnowledgeAiTaskResult({
      success: true,
      parsed: {}
    }),
  /接口没有返回生成内容/
)
assert.throws(
  () =>
    knowledge.requireKnowledgeAiTaskResult({
      success: true,
      content: '正文',
      parsed: []
    }),
  /接口没有返回可编辑 JSON/
)
assert.equal(
  knowledge.requireKnowledgeAiTaskResult({
    success: true,
    content: '  生成正文  ',
    parsed: {}
  }).raw,
  '生成正文'
)

const hotspot = knowledge.buildMarketHotspotItem({
  id: 'hot-1',
  title: '都市悬疑',
  relatedKeywords: ['探案'],
  categories: ['悬疑'],
  platforms: ['起点'],
  url: 'https://example.test/hot',
  heatScore: 88
})
assert.equal(hotspot.title, '都市悬疑')
assert.deepEqual(hotspot.tags, ['探案'])
assert.equal(hotspot.sourceUrl, 'https://example.test/hot')
assert.deepEqual(hotspot.sourceIds, ['hot-1'])
assert.equal(hotspot.metadata.marketHotspot.heatScore, 88)
assert.ok(hotspot.metadata.marketHotspot.capturedAt)

const emptyHotspot = knowledge.buildMarketHotspotItem()
assert.equal(emptyHotspot.title, '未命名热点')
assert.deepEqual(emptyHotspot.sourceIds, [])

const activity = knowledge.buildWriterActivityItem({
  id: 'activity-1',
  title: '征文活动',
  platform: '起点',
  sourceUrl: 'https://example.test/activity',
  reminderEnabled: 1
})
assert.deepEqual(activity.platformTags, ['起点'])
assert.deepEqual(activity.sourceIds, ['activity-1'])
assert.equal(activity.metadata.writerActivity.reminderEnabled, true)

const emptyActivity = knowledge.buildWriterActivityItem()
assert.equal(emptyActivity.title, '未命名活动')
assert.deepEqual(emptyActivity.platformTags, [])
assert.equal(emptyActivity.metadata.writerActivity.activityType, 'other')

console.log('Web 知识库服务测试通过')

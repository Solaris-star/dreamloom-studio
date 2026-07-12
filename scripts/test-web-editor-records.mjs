import assert from 'node:assert/strict'

const store = new Map([
  ['editorGenerations', [{ id: 'generation-1', bookId: 'book-1', status: 'generated' }]]
])

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : {}
  let data
  if (url === '/api/store/get') {
    data = {
      success: true,
      key: payload.key,
      value: store.has(payload.key) ? store.get(payload.key) : payload.defaultValue
    }
  } else if (url === '/api/store/set') {
    store.set(payload.key, payload.value)
    data = { success: true, key: payload.key, value: payload.value }
  } else {
    data = { success: false, message: `未模拟接口：${url}` }
  }
  return new Response(JSON.stringify(data), {
    status: data.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const {
  appendAgentMessage,
  listAgentHistory,
  listAgentMessages,
  listEditorMaterials,
  markGenerationApplied,
  openEditorSession,
  saveEditorMaterial,
  updateEditorSessionContext,
  updateModelDefaults
} = await import('../src/renderer/src/service/editor.js')

const defaults = await updateModelDefaults({
  task: 'writing',
  modelId: 'provider-a::writer-model'
})
assert.equal(defaults.providerId, 'provider-a')
assert.equal(store.get('editorModelDefaults').writing, 'provider-a::writer-model')
assert.equal(store.get('aiProviders.activeTextId'), 'provider-a')

const opened = await openEditorSession({ bookId: 'book-1', chapterId: 'chapter-1' })
assert.equal(opened.session.id, 'editor_session:book-1')
assert.equal(store.get('lastActiveBookId'), 'book-1')

const updated = await updateEditorSessionContext(opened.session.id, { includeCharacters: true })
assert.equal(updated.session.contextOptions.includeCharacters, true)

const savedMessage = await appendAgentMessage(opened.session.id, {
  role: 'user',
  content: '继续写'
})
assert.equal(savedMessage.message.sessionId, opened.session.id)
assert.equal((await listAgentMessages(opened.session.id)).messages.length, 1)

const marked = await markGenerationApplied('generation-1', 'replace')
assert.equal(marked.generation.status, 'applied')
assert.equal((await listAgentHistory('book-1')).items[0].status, 'applied')
await assert.rejects(() => markGenerationApplied('missing', 'replace'), /未找到生成记录/)

const savedMaterial = await saveEditorMaterial({
  bookId: 'book-1',
  chapterId: 'chapter-1',
  content: '素材'
})
assert.equal(savedMaterial.material.source, 'editor_agent')
assert.equal(
  (await listEditorMaterials({ bookId: 'book-1', chapterId: 'chapter-1' })).materials.length,
  1
)
assert.equal((await listEditorMaterials({ bookId: 'book-2' })).materials.length, 0)

store.set('editorMessages', {})
await assert.rejects(() => listAgentMessages(opened.session.id), /本地记录格式不正确/)

console.log('Web 编辑器记录服务测试通过')

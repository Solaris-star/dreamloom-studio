import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

const values = new Map()
const responses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  let body
  if (url === '/api/store/get') {
    body = { success: true, key: payload.key, value: values.get(payload.key) }
  } else if (url === '/api/store/set') {
    values.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else {
    body = responses.get(url) ?? { success: false, message: `未设置响应：${url}` }
  }
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

setActivePinia(createPinia())
const { useEditorStore } = await import('../src/renderer/src/stores/editor.js')
const store = useEditorStore()

values.set('editorSettings', { fontSize: '20px', lineHeight: '2' })
await store.loadEditorSettings()
assert.equal(store.editorSettings.fontSize, '20px')
assert.equal(store.editorSettings.lineHeight, '2')

await store.saveEditorSettings({ fontSize: '18px' })
assert.equal(values.get('editorSettings').fontSize, '18px')

responses.set('/api/analytics/overview', {
  success: true,
  data: { totalWords: 3456 }
})
assert.equal(await store.fetchBookTotalWords('作品一'), 3456)

responses.set('/api/analytics/overview', { success: true, data: {} })
responses.set('/api/books/list', [{ name: '作品二', totalWords: 789 }])
assert.equal(await store.fetchBookTotalWords('作品二', { force: true }), 789)

responses.set('/api/analytics/overview', { success: true, data: null })
await assert.rejects(
  () => store.fetchBookTotalWords('错误作品', { force: true }),
  /书籍字数接口返回格式不正确/
)

console.log('Web 编辑器状态测试通过')

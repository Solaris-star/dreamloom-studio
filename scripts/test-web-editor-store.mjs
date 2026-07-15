const __localStorageStore = new Map()
const __localStorageMock = {
  getItem(key) {
    return __localStorageStore.has(String(key)) ? __localStorageStore.get(String(key)) : null
  },
  setItem(key, value) {
    __localStorageStore.set(String(key), String(value))
  },
  removeItem(key) {
    __localStorageStore.delete(String(key))
  },
  clear() {
    __localStorageStore.clear()
  },
  key(index) {
    return [...__localStorageStore.keys()][index] ?? null
  },
  get length() {
    return __localStorageStore.size
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: __localStorageMock,
  configurable: true,
  writable: true,
  enumerable: true
})

import assert from 'node:assert/strict'

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

const { createPinia, setActivePinia } = await import('pinia')
setActivePinia(createPinia())
const { useEditorStore } = await import('../src/renderer/src/stores/editor.js')
const store = useEditorStore()

assert.equal(store.contentWordCount, 0)
store.setContent('  第一行\n第二行\t')
assert.equal(store.contentWordCount, 6)
store.setChapterTargetWords('3200.4')
assert.equal(store.chapterTargetWords, 3200)
store.setChapterTargetWords(0)
assert.equal(store.chapterTargetWords, 2000)

store.setSaveState('saving')
assert.equal(store.saveStatus, 'saving')
assert.equal(store.saveError, '')
const savedAt = '2026-07-13T10:00:00.000Z'
store.setSaveState('saved', { savedAt })
assert.equal(store.lastSavedAt, savedAt)
store.setSaveState('failed', { error: new Error('保存失败') })
assert.equal(store.saveStatus, 'failed')
assert.equal(store.saveError, 'Error: 保存失败')

assert.equal(await store.saveCurrentFileThroughHandler(), false)
let saveMessageFlag = null
store.registerExternalSaveHandler(async (showMessage) => {
  saveMessageFlag = showMessage
  return 'saved'
})
assert.equal(await store.saveCurrentFileThroughHandler(true), 'saved')
assert.equal(saveMessageFlag, true)
store.registerExternalSaveHandler('invalid')
assert.equal(await store.saveCurrentFileThroughHandler(), false)

store.setFile({ type: 'note', path: '笔记/人物/林青.html' })
store.applyNoteDraftFromDisk('', '<p>不应写入</p>')
store.applyNoteDraftFromDisk('笔记/人物/林青.html', '<p>人物初稿</p>')
assert.equal(store.getNoteDraftForPersist('笔记/人物/林青.html'), '<p>人物初稿</p>')
store.updateNoteDraftHtml('笔记/人物/林青.html', '<p><strong>人物新稿</strong></p>')
assert.equal(
  store.getNoteDraftForPersist('笔记/人物/林青.html'),
  '<p><strong>人物新稿</strong></p>'
)
store.updateNoteDraftHtml('', '<p>不应写入</p>')
store.updateNoteDraftHtml('笔记/人物/林青.html', null)
assert.equal(store.getNoteDraftForPersist('笔记/其他.html'), null)
store.setFile({ type: 'note', path: '笔记/人物/苏晚.html' })
assert.equal(store.getNoteDraftForPersist('笔记/人物/林青.html'), null)
store.applyNoteDraftFromDisk('笔记/人物/苏晚.html', null)
assert.equal(store.getNoteDraftForPersist('笔记/人物/苏晚.html'), '')
store.setFile({ type: 'chapter', path: '正文/第一章.txt' })
assert.equal(store.noteDraftPath, '')
store.setFile(null)
assert.equal(store.file, null)
assert.equal(store.isInitializing, false)

store.resetBookWordStats()
store.setFile({ type: 'chapter', path: '正文/第一章.txt' })
store.startEditingSession('已有正文')
store.setContent('已有正文', { isInitialLoad: true })
assert.equal(store.isInitializing, false)
store.setContent('已有正文新增')
assert.equal(store.bookTotalWords, 0)
store.setBookTotalWords(100)
assert.equal(store.bookTotalWords, 102)
store.setContent('已有正文')
assert.equal(store.bookTotalWords, 100)
store.setContent('')
assert.equal(store.bookTotalWords, 96)
store.setBookTotalWords('invalid')
assert.equal(store.bookTotalWords, 0)
store.resetEditingSession()
assert.equal(store.isInitializing, false)

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
responses.set('/api/analytics/overview', {
  success: true,
  data: { totalWords: 9999 }
})
assert.equal(await store.fetchBookTotalWords('作品一'), 3456)

responses.set('/api/analytics/overview', { success: true, data: {} })
responses.set('/api/books/list', [{ name: '作品二', totalWords: 789 }])
assert.equal(await store.fetchBookTotalWords('作品二', { force: true }), 789)

responses.set('/api/analytics/overview', { success: true, data: {} })
responses.set('/api/books/list', [{ name: '其他作品', totalWords: 321 }])
assert.equal(await store.fetchBookTotalWords('列表中不存在', { force: true }), 0)

responses.set('/api/analytics/overview', { success: true, data: {} })
responses.set('/api/books/list', { success: true, books: [] })
await assert.rejects(
  () => store.fetchBookTotalWords('错误列表', { force: true }),
  /书籍列表接口返回格式不正确/
)
assert.equal(store.bookWordsLoaded, false)
assert.equal(store.currentBookName, '')

responses.set('/api/analytics/overview', { success: true, data: null })
await assert.rejects(
  () => store.fetchBookTotalWords('错误作品', { force: true }),
  /书籍字数接口返回格式不正确/
)

assert.equal(await store.fetchBookTotalWords(''), 0)

console.log('Web 编辑器状态测试通过')

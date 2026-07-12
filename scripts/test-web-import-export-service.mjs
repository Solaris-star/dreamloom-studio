import assert from 'node:assert/strict'

const requests = []
let responseData = { success: true }

globalThis.fetch = async (url, options = {}) => {
  requests.push({
    url,
    payload: JSON.parse(options.body || '{}'),
    signal: options.signal
  })
  return new Response(JSON.stringify(responseData), {
    status: responseData.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const clicked = []
const revoked = []
globalThis.document = {
  body: {
    appendChild() {},
    removeChild() {}
  },
  createElement() {
    return {
      click() {
        clicked.push({ href: this.href, download: this.download })
      }
    }
  }
}
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = (url) => revoked.push(url)

const service = await import('../src/renderer/src/service/importExport.js')

responseData = { success: true, preview: { chapters: [{ title: '第一章' }] } }
assert.equal((await service.previewImportBook({ fileName: 'a.txt' })).preview.chapters.length, 1)

responseData = {
  success: true,
  bookName: '作品甲',
  bookPath: 'D:/books/a',
  task: { type: 'import' }
}
assert.equal((await service.importBookFromFile({ fileName: 'a.txt' })).bookName, '作品甲')
assert.ok(requests.at(-1).signal instanceof AbortSignal)

responseData = {
  success: true,
  fileName: 'a.txt',
  content: '正文',
  task: { type: 'export' }
}
assert.equal((await service.exportBookFile({ bookName: '作品甲' })).content, '正文')

responseData = {
  success: true,
  fileName: 'backup.zip',
  downloadBase64: 'YQ==',
  task: { type: 'backup' }
}
assert.equal((await service.createLibraryBackup()).fileName, 'backup.zip')

responseData = { success: true, summary: { books: 1 } }
assert.equal((await service.inspectLibraryBackup()).summary.books, 1)

responseData = {
  success: true,
  mode: 'library',
  restoredBooks: ['作品甲'],
  task: { type: 'restore' }
}
assert.deepEqual((await service.restoreLibraryBackup()).restoredBooks, ['作品甲'])

responseData = { success: true, items: [{ id: 'task-1' }] }
assert.equal((await service.listImportExportTasks()).items.length, 1)

service.downloadTextFile('a.txt', '正文')
service.downloadBase64File('a.bin', 'YQ==')
assert.deepEqual(clicked, [
  { href: 'blob:test', download: 'a.txt' },
  { href: 'blob:test', download: 'a.bin' }
])
assert.deepEqual(revoked, ['blob:test', 'blob:test'])

assert.throws(() => service.requirePreviewResult({ success: true, preview: {} }), /章节预览/)
assert.throws(
  () => service.requireImportedBookResult({ success: true, bookName: '', bookPath: 'x' }),
  /bookName/
)
assert.throws(
  () =>
    service.requireDownloadResult({
      success: true,
      fileName: 'a.txt',
      task: { type: 'export' }
    }),
  /可下载内容/
)
assert.throws(
  () =>
    service.requireRestoreResult({
      success: true,
      mode: 'directory',
      task: { type: 'restore' }
    }),
  /恢复目录/
)

console.log('Web 导入导出服务测试通过')

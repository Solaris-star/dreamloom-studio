import assert from 'node:assert/strict'

let response
let request
globalThis.fetch = async (url, options = {}) => {
  request = { url, payload: JSON.parse(options.body || '{}') }
  const body = response
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/chapters.js')

response = { success: true, chapterName: '第2章' }
assert.equal((await service.createChapter('作品', '正文')).chapterName, '第2章')
assert.deepEqual(request, {
  url: '/api/chapters/create',
  payload: { bookName: '作品', volumeId: '正文' }
})

response = { success: true, saved: true }
await service.saveChapter({
  bookName: '作品',
  volumeName: '正文',
  chapterName: '第2章',
  content: '正文'
})
assert.equal(request.url, '/api/chapters/save')

response = { success: true }
await assert.rejects(() => service.createChapter('作品', '正文'), /接口返回格式不正确/)

response = { success: false, message: '章节只读' }
await assert.rejects(() => service.saveChapter({}), /章节只读/)

console.log('Web 章节服务测试通过')

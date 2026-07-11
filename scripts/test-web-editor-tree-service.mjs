import assert from 'node:assert/strict'

let response = { success: true }
let request

globalThis.fetch = async (url, options = {}) => {
  request = { url, payload: JSON.parse(options.body || '{}') }
  return new Response(JSON.stringify(response), {
    status: response.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/editor.js')

response = { success: true, order: 'desc' }
assert.equal(await service.getSortOrder('作品'), 'desc')
assert.deepEqual(request, {
  url: '/api/sort-order/get',
  payload: { bookName: '作品' }
})

response = { success: true, order: 'asc' }
await service.setSortOrder('作品', 'asc')
assert.equal(request.url, '/api/sort-order/set')
await assert.rejects(() => service.setSortOrder('作品', 'invalid'), /排序方式无效/)

response = { success: true, volumeName: '第二卷' }
await service.createVolumeDocument('作品')
assert.deepEqual(request, {
  url: '/api/volumes/create',
  payload: { bookName: '作品' }
})

response = {
  success: true,
  chapterName: '第2章',
  filePath: 'D:/books/作品/正文/第一卷/第2章.txt'
}
assert.equal((await service.createChapterDocument('作品', '第一卷')).chapterName, '第2章')
assert.deepEqual(request, {
  url: '/api/chapters/create',
  payload: { bookName: '作品', volumeId: '第一卷' }
})

response = { success: true, chapters: [{ type: 'volume', name: '第一卷', children: [] }] }
assert.equal((await service.listChapterTree('作品')).length, 1)
assert.equal(request.url, '/api/chapters/load')

response = { success: true, notes: [{ type: 'folder', name: '资料', children: [] }] }
assert.equal((await service.listNoteTree('作品')).length, 1)
assert.equal(request.url, '/api/notes/load')

response = { success: true, settings: { targetWords: 2500 } }
await service.setChapterTargetWords(' 作品 ', 2500.4)
assert.deepEqual(request, {
  url: '/api/chapter-settings/target-words',
  payload: { bookName: '作品', targetWords: 2500 }
})
await assert.rejects(() => service.setChapterTargetWords('作品', 0), /目标字数无效/)

response = {
  success: true,
  bookName: '作品',
  totalRenamed: 3,
  settings: {
    chapterFormat: 'hanzi',
    suffixType: '回',
    targetWords: 3000
  }
}
const updatedSettings = await service.updateChapterFormat('作品', {
  chapterFormat: 'hanzi',
  suffixType: '回',
  targetWords: 3000
})
assert.equal(updatedSettings.totalRenamed, 3)
assert.deepEqual(request, {
  url: '/api/chapter-format/update',
  payload: {
    bookName: '作品',
    settings: {
      chapterFormat: 'hanzi',
      suffixType: '回',
      targetWords: 3000
    }
  }
})

response = { success: true, notebookName: '笔记本1' }
assert.equal((await service.createNotebookDocument('作品')).notebookName, '笔记本1')
assert.equal(request.url, '/api/notebooks/create')

response = { success: true, noteName: '笔记1', fileName: '笔记1.txt' }
await service.createNoteDocument('作品', '笔记本1')
assert.deepEqual(request, {
  url: '/api/notes/create',
  payload: { bookName: '作品', notebookName: '笔记本1' }
})

response = { success: false, message: '名称已存在' }
await assert.rejects(
  () => service.renameNotebookDocument('作品', '旧名', '新名'),
  /名称已存在/
)

response = { success: true, data: [{ name: '灵脉' }] }
assert.equal((await service.readDictionaryDocument('作品')).length, 1)
assert.deepEqual(request, {
  url: '/api/studio/dictionary/read',
  payload: { bookName: '作品' }
})

response = { success: true, data: [{ title: '主时间线' }] }
assert.equal((await service.readTimelineDocument('作品')).length, 1)
assert.equal(request.url, '/api/studio/timeline/read')

response = { success: true, data: [{ title: '主线事件' }] }
assert.equal((await service.readSequenceChartsDocument('作品')).length, 1)
assert.equal(request.url, '/api/studio/sequences/read')

response = { success: true, data: [{ name: '林青' }] }
assert.equal((await service.readCharactersDocument('作品')).length, 1)
assert.equal(request.url, '/api/studio/characters/read')

response = {
  success: true,
  data: { mount: [], monster: [], spirit_beast: [], artifact: [] }
}
assert.deepEqual((await service.readEntityProfilesDocument('作品')).artifact, [])
assert.equal(request.url, '/api/studio/entity-profiles/read')

response = { success: true, data: null }
await assert.rejects(() => service.readDictionaryDocument('作品'), /接口返回格式不正确/)

console.log('Web 编辑器章节树与笔记服务测试通过')

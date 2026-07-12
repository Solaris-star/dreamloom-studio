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

await assert.rejects(() => service.getSortOrder(' '), /缺少作品名/)
await assert.rejects(() => service.setSortOrder('', 'asc'), /缺少作品名/)
await assert.rejects(() => service.getChapterSettings(''), /缺少作品名/)
await assert.rejects(() => service.readChapterContent('', '第一卷', '第一章'), /缺少作品名/)
await assert.rejects(() => service.readChapterContent('作品', '', '第一章'), /缺少卷名/)
await assert.rejects(() => service.readChapterContent('作品', '第一卷', ''), /缺少章节名/)
await assert.rejects(
  () => service.checkChapterExistsForOutline({ volumeName: '第一卷', chapterName: '第一章' }),
  /缺少作品名/
)
await assert.rejects(
  () => service.checkChapterExistsForOutline({ bookName: '作品', chapterName: '第一章' }),
  /缺少卷名/
)
await assert.rejects(
  () => service.checkChapterExistsForOutline({ bookName: '作品', volumeName: '第一卷' }),
  /缺少章节名/
)
await assert.rejects(
  () =>
    service.upsertOutlineChapter({
      bookName: '作品',
      volumeName: '第一卷',
      chapterName: '第一章',
      content: ' '
    }),
  /正文为空/
)
await assert.rejects(() => service.createChapterDocument('', '第一卷'), /缺少作品名/)
await assert.rejects(() => service.createChapterDocument('作品', ''), /缺少卷名/)
await assert.rejects(
  () => service.saveChapterDocument({ volumeName: '第一卷', chapterName: '第一章' }),
  /缺少作品名/
)
await assert.rejects(
  () => service.saveChapterDocument({ bookName: '作品', chapterName: '第一章' }),
  /缺少卷名/
)
await assert.rejects(
  () => service.saveChapterDocument({ bookName: '作品', volumeName: '第一卷' }),
  /缺少章节名/
)
await assert.rejects(() => service.writeOutlineDocument('', {}), /缺少作品名/)
await assert.rejects(() => service.writeOutlineDocument('作品', []), /内容格式不正确/)
await assert.rejects(
  () => service.writeOutlineDocument('作品', { children: {} }),
  /内容格式不正确/
)
await assert.rejects(() => service.readOutlineAiSessionsDocument(''), /缺少作品名/)
await assert.rejects(
  () => service.writeOutlineAiSessionsDocument('作品', { nodes: [] }),
  /会话内容格式不正确/
)
await assert.rejects(() => service.listChapterTree(''), /缺少作品名/)
await assert.rejects(() => service.createVolumeDocument(''), /缺少作品名/)
await assert.rejects(() => service.listNoteTree(''), /缺少作品名/)
await assert.rejects(() => service.createNotebookDocument(''), /缺少作品名/)
await assert.rejects(() => service.createNoteDocument('作品', ''), /缺少笔记本名称/)
await assert.rejects(() => service.readNoteDocument('作品', '资料', ''), /缺少笔记名称/)
await assert.rejects(
  () => service.writeNoteDocument({ bookName: '作品', notebookName: '资料' }),
  /缺少笔记名称/
)

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

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '新章名',
  filePath: 'D:/books/作品/正文/第一卷/新章名.txt',
  wordCount: 4,
  databaseSync: { success: true, chapterName: '新章名' }
}
await service.saveChapterDocument({
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '旧章名',
  newName: '新章名',
  content: '新的正文'
})
assert.deepEqual(request, {
  url: '/api/chapters/save',
  payload: {
    bookName: '作品',
    volumeName: '第一卷',
    chapterName: '旧章名',
    newName: '新章名',
    content: '新的正文'
  }
})

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '错误章名',
  filePath: 'D:/books/作品/正文/第一卷/错误章名.txt',
  wordCount: 4,
  databaseSync: { success: true, chapterName: '错误章名' }
}
await assert.rejects(
  () =>
    service.saveChapterDocument({
      bookName: '作品',
      volumeName: '第一卷',
      chapterName: '第一章',
      content: '新的正文'
    }),
  /接口返回格式不正确/
)

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

response = {
  success: true,
  bookName: '作品',
  notebookName: '资料',
  noteName: '人物',
  filePath: 'D:/books/作品/笔记/资料/人物.txt',
  content: '林青'
}
assert.equal((await service.readNoteDocument('作品', '资料', '人物')).content, '林青')

response = {
  success: true,
  bookName: '作品',
  notebookName: '资料',
  noteName: '人物',
  filePath: 'D:/books/作品/笔记/资料/人物.txt',
  contentLength: 2
}
await service.writeNoteDocument({
  bookName: '作品',
  notebookName: '资料',
  noteName: '人物',
  content: '林青'
})
assert.equal(request.url, '/api/notes/edit')

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

response = { success: true, data: [{ name: '王都' }] }
assert.equal((await service.readMapDocuments('作品')).length, 1)
assert.deepEqual(request, {
  url: '/api/studio/maps/list',
  payload: { bookName: '作品' }
})

response = { success: true, data: { backgroundColor: '#ffffff', elements: [] } }
assert.deepEqual(await service.readMapDataDocument('作品', '王都'), {
  backgroundColor: '#ffffff',
  elements: []
})
assert.deepEqual(request, {
  url: '/api/studio/maps/data/load',
  payload: { bookName: '作品', mapName: '王都' }
})

response = { success: true, data: [{ id: '关系一', name: '关系一' }] }
assert.equal((await service.readRelationshipGraphs('作品')).length, 1)
assert.equal(request.url, '/api/studio/relationships/list')

response = { success: true, data: { name: '关系一', nodes: [], lines: [] } }
assert.equal((await service.readRelationshipGraphData('作品', '关系一')).name, '关系一')
assert.deepEqual(request, {
  url: '/api/studio/relationships/read',
  payload: { bookName: '作品', relationshipName: '关系一' }
})

response = { success: true, data: [{ id: '宗门', name: '宗门' }] }
assert.equal((await service.readOrganizationGraphs('作品')).length, 1)
assert.equal(request.url, '/api/studio/organizations/list')

response = { success: true, data: { name: '宗门', nodes: [], lines: [] } }
assert.equal((await service.readOrganizationGraphData('作品', '宗门')).name, '宗门')
assert.deepEqual(request, {
  url: '/api/studio/organizations/read',
  payload: { bookName: '作品', organizationName: '宗门' }
})

response = { success: true, data: { categories: [] } }
assert.deepEqual(await service.readSettingsDocument('作品'), { categories: [] })
assert.deepEqual(request, {
  url: '/api/studio/settings/read',
  payload: { bookName: '作品' }
})

response = {
  success: true,
  fileName: 'settings.json',
  documentType: 'settings',
  path: 'D:/books/作品/settings.json',
  documentPath: 'D:/books/作品/settings.json',
  itemCount: 0,
  databaseSync: { success: true }
}
await service.writeSettingsDocument('作品', { categories: [] })
assert.deepEqual(request, {
  url: '/api/studio/settings/write',
  payload: { bookName: '作品', data: { categories: [] } }
})

response = { success: false, message: '关系图损坏' }
await assert.rejects(() => service.readRelationshipGraphData('作品', '关系一'), /关系图损坏/)

response = { success: true, data: { content: '总纲', children: [] } }
assert.deepEqual(await service.readOutlineDocument('作品'), { content: '总纲', children: [] })
assert.deepEqual(request, {
  url: '/api/studio/outlines/read',
  payload: { bookName: '作品' }
})

response = {
  success: true,
  fileName: 'outlines.json',
  documentType: 'outlines',
  path: 'D:/books/作品/outlines.json',
  documentPath: 'D:/books/作品/outlines.json',
  databaseSync: { success: true }
}
await service.writeOutlineDocument('作品', { content: '总纲', children: [] })
assert.deepEqual(request, {
  url: '/api/studio/outlines/write',
  payload: { bookName: '作品', data: { content: '总纲', children: [] } }
})

response = { success: true, data: { version: 1, nodes: {} } }
assert.deepEqual(await service.readOutlineAiSessionsDocument('作品'), { version: 1, nodes: {} })
assert.equal(request.url, '/api/studio/outline-ai-sessions/read')

response = {
  success: true,
  fileName: 'outline-ai-sessions.json',
  path: 'D:/books/作品/outline-ai-sessions.json',
  documentPath: 'D:/books/作品/outline-ai-sessions.json',
  databaseSync: { success: true }
}
await service.writeOutlineAiSessionsDocument('作品', { version: 1, nodes: {} })
assert.deepEqual(request, {
  url: '/api/studio/outline-ai-sessions/write',
  payload: { bookName: '作品', data: { version: 1, nodes: {} } }
})

response = { success: true, exists: false }
assert.equal(
  (await service.checkChapterExistsForOutline({
    bookName: '作品',
    volumeName: '第一卷',
    chapterName: '第一章'
  })).exists,
  false
)
assert.deepEqual(request, {
  url: '/api/chapters/check-exists',
  payload: { bookName: '作品', volumeName: '第一卷', chapterName: '第一章' }
})

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  filePath: 'D:/books/作品/正文/第一卷/第一章.txt',
  wordCount: 4,
  databaseSync: { success: true, chapterName: '第一章' }
}
await service.upsertOutlineChapter({
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  content: '新的正文',
  overwrite: false
})
assert.deepEqual(request, {
  url: '/api/chapters/upsert',
  payload: {
    bookName: '作品',
    volumeName: '第一卷',
    chapterName: '第一章',
    content: '新的正文',
    overwrite: false
  }
})

console.log('Web 编辑器章节树与笔记服务测试通过')

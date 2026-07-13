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

const documentWriteResponse = (fileName, documentType, itemCount = undefined) => ({
  success: true,
  fileName,
  documentType,
  path: `D:/books/作品/${fileName}`,
  documentPath: `D:/books/作品/${fileName}`,
  ...(itemCount === undefined ? {} : { itemCount }),
  databaseSync: { success: true }
})

response = documentWriteResponse('timelines.json', 'timeline', 1)
await service.writeTimelineDocument(' 作品 ', [{ title: '主时间线' }])
assert.deepEqual(request, {
  url: '/api/studio/timeline/write',
  payload: { bookName: '作品', data: [{ title: '主时间线' }] }
})
await assert.rejects(() => service.writeTimelineDocument('', []), /缺少作品名/)
await assert.rejects(() => service.writeTimelineDocument('作品', {}), /内容格式不正确/)

response = documentWriteResponse('sequence-charts.json', 'sequence_charts', 1)
await service.writeSequenceChartsDocument('作品', [{ title: '主线事件' }])
assert.equal(request.url, '/api/studio/sequences/write')
await assert.rejects(() => service.writeSequenceChartsDocument('作品', null), /内容格式不正确/)

response = documentWriteResponse('characters.json', 'characters', 1)
await service.writeCharactersDocument('作品', [{ name: '林青' }])
assert.equal(request.url, '/api/studio/characters/write')
await assert.rejects(() => service.writeCharactersDocument('作品', '林青'), /内容格式不正确/)

const mapResponse = (withDataDocument = false) => ({
  success: true,
  mapName: '王都',
  assetType: 'map',
  fileName: '王都.png',
  path: 'D:/books/作品/maps/王都.png',
  bookPath: 'D:/books/作品',
  databaseSync: {
    success: true,
    documentType: 'map:王都',
    documentPath: 'D:/books/作品/maps/王都.png'
  },
  ...(withDataDocument
    ? {
        dataDatabaseSync: {
          success: true,
          documentType: 'map_data:王都',
          documentPath: 'D:/books/作品/maps/王都.json'
        }
      }
    : {})
})

response = mapResponse()
await service.createMapDocument({
  bookName: '作品',
  mapName: '王都',
  description: '都城',
  imageData: 'data:image/png;base64,AA=='
})
assert.equal(request.url, '/api/studio/maps/create')
await assert.rejects(() => service.createMapDocument({}), /缺少作品名/)
await assert.rejects(() => service.createMapDocument({ bookName: '作品' }), /缺少地图名/)
await assert.rejects(
  () => service.createMapDocument({ bookName: '作品', mapName: '王都' }),
  /缺少图片数据/
)

response = mapResponse(true)
await service.updateMapDocument({
  bookName: '作品',
  mapName: '王都',
  imageData: 'data:image/png;base64,AA==',
  mapData: { elements: [] }
})
assert.equal(request.url, '/api/studio/maps/update')

response = {
  success: true,
  mapName: '王都',
  assetType: 'map',
  deletedFiles: ['王都.png'],
  existed: true
}
await service.deleteMapDocument('作品', '王都')
assert.equal(request.url, '/api/studio/maps/delete')
await assert.rejects(() => service.deleteMapDocument('作品', ''), /缺少地图名/)

const graphWriteResponse = (assetType, collection, graphName) => ({
  success: true,
  graphName,
  assetType,
  collection,
  fileName: `${graphName}.json`,
  path: `D:/books/作品/${collection}/${graphName}.json`,
  graphPath: `D:/books/作品/${collection}/${graphName}.json`,
  nodeCount: 1,
  lineCount: 0,
  databaseSync: {
    success: true,
    documentType: `${assetType}_graph:${graphName}`,
    documentPath: `D:/books/作品/${collection}/${graphName}.json`
  }
})
const graphThumbnailResponse = (assetType, collection, graphName) => ({
  success: true,
  graphName,
  assetType,
  collection,
  fileName: `${graphName}.png`,
  path: `D:/books/作品/${collection}/${graphName}.png`,
  thumbnailPath: `D:/books/作品/${collection}/${graphName}.png`,
  bookPath: 'D:/books/作品'
})
const graphDeleteResponse = (assetType, collection, graphName) => ({
  success: true,
  graphName,
  assetType,
  collection,
  deletedFiles: [`${graphName}.json`],
  existed: true
})

const relationshipData = { nodes: [{ id: 'a' }], lines: [] }
response = graphWriteResponse('relationship', 'relationships', '关系一')
await service.createRelationshipGraph('作品', '关系一', relationshipData)
assert.equal(request.url, '/api/studio/relationships/create')
response = graphWriteResponse('relationship', 'relationships', '关系一')
await service.writeRelationshipGraphData('作品', '关系一', relationshipData)
assert.equal(request.url, '/api/studio/relationships/write')
response = graphThumbnailResponse('relationship', 'relationships', '关系一')
await service.writeRelationshipGraphThumbnail(
  '作品',
  '关系一',
  'data:image/png;base64,AA=='
)
assert.equal(request.url, '/api/studio/relationships/thumbnail')
response = { success: true, data: 'data:image/png;base64,AA==' }
assert.equal(
  await service.readRelationshipGraphImage('作品', '关系一.png'),
  'data:image/png;base64,AA=='
)
response = graphDeleteResponse('relationship', 'relationships', '关系一')
await service.deleteRelationshipGraph('作品', '关系一')
assert.equal(request.url, '/api/studio/relationships/delete')
await assert.rejects(
  () => service.createRelationshipGraph('作品', '关系一', []),
  /内容格式不正确/
)
await assert.rejects(
  () => service.writeRelationshipGraphThumbnail('作品', '关系一', ''),
  /缺少图片数据/
)

const organizationData = { nodes: [{ id: 'root' }], lines: [] }
response = graphWriteResponse('organization', 'organizations', '宗门')
await service.createOrganizationGraph('作品', '宗门', organizationData)
assert.equal(request.url, '/api/studio/organizations/create')
response = graphWriteResponse('organization', 'organizations', '宗门')
await service.writeOrganizationGraphData('作品', '宗门', organizationData)
assert.equal(request.url, '/api/studio/organizations/write')
response = graphThumbnailResponse('organization', 'organizations', '宗门')
await service.writeOrganizationGraphThumbnail('作品', '宗门', 'data:image/png;base64,AA==')
assert.deepEqual(request, {
  url: '/api/studio/organizations/thumbnail',
  payload: {
    bookName: '作品',
    organizationId: '宗门',
    thumbnailData: 'data:image/png;base64,AA=='
  }
})
response = 'data:image/png;base64,AA=='
assert.equal(
  await service.readOrganizationGraphImage('作品', '宗门.png'),
  'data:image/png;base64,AA=='
)
response = graphDeleteResponse('organization', 'organizations', '宗门')
await service.deleteOrganizationGraph('作品', '宗门')
assert.equal(request.url, '/api/studio/organizations/delete')

response = {
  success: true,
  bookName: '作品',
  notebookName: '组织架构',
  noteName: '宗门',
  fileName: '宗门.txt',
  notePath: 'D:/books/作品/笔记/组织架构/宗门.txt',
  path: 'D:/books/作品/笔记/组织架构/宗门.txt',
  bookPath: 'D:/books/作品',
  notebookPath: 'D:/books/作品/笔记/组织架构'
}
await service.exportOrganizationGraphToNote({
  bookName: '作品',
  organizationName: '宗门',
  content: '宗门资料'
})
assert.equal(request.url, '/api/organizations/export-note')
await assert.rejects(() => service.exportOrganizationGraphToNote({}), /缺少作品名/)

response = documentWriteResponse('entity_profiles.json', 'entity_profiles')
await service.writeEntityProfileCategoryDocument('作品', 'artifact', [{ name: '青锋剑' }])
assert.equal(request.url, '/api/studio/entity-profiles/write-category')
await assert.rejects(
  () => service.writeEntityProfileCategoryDocument('作品', 'unknown', []),
  /档案分类不正确/
)

response = documentWriteResponse('dictionary.json', 'dictionary', 1)
await service.writeDictionaryDocument('作品', [{ name: '灵脉' }])
assert.equal(request.url, '/api/studio/dictionary/write')
response = documentWriteResponse('dictionary.json', 'dictionary', 0)
await assert.rejects(
  () => service.writeDictionaryDocument('作品', [{ name: '灵脉' }]),
  /词条数量不匹配/
)

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  filePath: 'D:/books/作品/正文/第一卷/第一章.txt',
  content: '正文',
  wordCount: 2
}
assert.equal((await service.readChapterContent('作品', '第一卷', '第一章')).content, '正文')
assert.equal(request.url, '/api/chapters/read')

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  filePath: 'D:/books/作品/正文/第一卷/第一章.txt',
  wordCount: 0,
  databaseSync: { success: true, chapterName: '第一章' }
}
await service.upsertChapterDocument({
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  content: ''
})
assert.equal(request.url, '/api/chapters/upsert')
await assert.rejects(() => service.upsertChapterDocument({}), /缺少作品名/)

response = {
  success: true,
  settings: { chapterFormat: 'arabic', suffixType: '章', targetWords: 2000 }
}
assert.equal((await service.getChapterSettings('作品')).targetWords, 2000)
assert.equal(request.url, '/api/chapter-settings/get')

response = { success: true, node: { name: '新章名' } }
await service.editChapterNode('作品', { type: 'chapter', oldName: '旧章名', newName: '新章名' })
assert.equal(request.url, '/api/nodes/edit')
await assert.rejects(() => service.editChapterNode('', {}), /缺少作品名/)

response = { success: true, deleted: true }
await service.deleteChapterNode('作品', { type: 'chapter', name: '第一章' })
assert.equal(request.url, '/api/nodes/delete')
await assert.rejects(() => service.deleteChapterNode('', {}), /缺少作品名/)

response = { success: true, notebookName: '新资料' }
await service.renameNotebookDocument('作品', '旧资料', '新资料')
assert.equal(request.url, '/api/notebooks/rename')
response = { success: true, noteName: '新人物' }
await service.renameNoteDocument('作品', '资料', '旧人物', '新人物')
assert.equal(request.url, '/api/notes/rename')
response = { success: true, deleted: true }
await service.deleteNotebookDocument('作品', '资料')
assert.equal(request.url, '/api/notebooks/delete')
response = { success: true, deleted: true }
await service.deleteNoteDocument('作品', '资料', '人物')
assert.equal(request.url, '/api/notes/delete')

await assert.rejects(() => service.ensureNotebookDocument('', '资料'), /缺少作品名/)
await assert.rejects(() => service.ensureNotebookDocument('作品', ''), /缺少笔记本名称/)
await assert.rejects(() => service.ensureNoteDocument('', '资料', '人物'), /缺少作品名/)
await assert.rejects(() => service.ensureNoteDocument('作品', '', '人物'), /缺少笔记本名称/)
await assert.rejects(() => service.ensureNoteDocument('作品', '资料', ''), /缺少笔记名称/)

await assert.rejects(() => service.readSettingsDocument(''), /缺少作品名/)
await assert.rejects(() => service.writeSettingsDocument('', { categories: [] }), /缺少作品名/)
await assert.rejects(() => service.writeSettingsDocument('作品', []), /内容格式不正确/)
await assert.rejects(
  () => service.writeSettingsDocument('作品', { categories: {} }),
  /分类格式不正确/
)

await assert.rejects(() => service.readTimelineDocument(''), /缺少作品名/)
await assert.rejects(() => service.readSequenceChartsDocument(''), /缺少作品名/)
await assert.rejects(() => service.readCharactersDocument(''), /缺少作品名/)
await assert.rejects(() => service.readMapDocuments(''), /缺少作品名/)
await assert.rejects(() => service.readMapDataDocument('', '王都'), /缺少作品名/)
await assert.rejects(() => service.readMapDataDocument('作品', ''), /缺少地图名/)
await assert.rejects(() => service.updateMapDocument({}), /缺少作品名/)
await assert.rejects(() => service.updateMapDocument({ bookName: '作品' }), /缺少地图名/)
await assert.rejects(
  () => service.updateMapDocument({ bookName: '作品', mapName: '王都' }),
  /缺少图片数据/
)
await assert.rejects(() => service.deleteMapDocument('', '王都'), /缺少作品名/)

await assert.rejects(() => service.readRelationshipGraphs(''), /缺少作品名/)
await assert.rejects(() => service.readRelationshipGraphData('', '关系一'), /缺少作品名/)
await assert.rejects(() => service.readRelationshipGraphData('作品', ''), /缺少图谱名/)
await assert.rejects(() => service.createRelationshipGraph('', '关系一'), /缺少作品名/)
await assert.rejects(() => service.createRelationshipGraph('作品', ''), /缺少图谱名/)
await assert.rejects(() => service.writeRelationshipGraphData('', '关系一'), /缺少作品名/)
await assert.rejects(() => service.writeRelationshipGraphData('作品', ''), /缺少图谱名/)
await assert.rejects(
  () => service.writeRelationshipGraphData('作品', '关系一', null),
  /内容格式不正确/
)
await assert.rejects(
  () => service.writeRelationshipGraphThumbnail('', '关系一', 'image'),
  /缺少作品名/
)
await assert.rejects(
  () => service.writeRelationshipGraphThumbnail('作品', '', 'image'),
  /缺少图谱名/
)
await assert.rejects(() => service.readRelationshipGraphImage('', '关系一.png'), /缺少作品名/)
await assert.rejects(() => service.readRelationshipGraphImage('作品', ''), /缺少图片名/)
await assert.rejects(() => service.deleteRelationshipGraph('', '关系一'), /缺少作品名/)
await assert.rejects(() => service.deleteRelationshipGraph('作品', ''), /缺少图谱名/)

await assert.rejects(() => service.readOrganizationGraphs(''), /缺少作品名/)
await assert.rejects(() => service.readOrganizationGraphData('', '宗门'), /缺少作品名/)
await assert.rejects(() => service.readOrganizationGraphData('作品', ''), /缺少图谱名/)
await assert.rejects(() => service.createOrganizationGraph('', '宗门'), /缺少作品名/)
await assert.rejects(() => service.createOrganizationGraph('作品', ''), /缺少图谱名/)
await assert.rejects(() => service.createOrganizationGraph('作品', '宗门', []), /内容格式不正确/)
await assert.rejects(() => service.writeOrganizationGraphData('', '宗门'), /缺少作品名/)
await assert.rejects(() => service.writeOrganizationGraphData('作品', ''), /缺少图谱名/)
await assert.rejects(
  () => service.writeOrganizationGraphThumbnail('作品', '宗门', ''),
  /缺少图片数据/
)
await assert.rejects(() => service.readOrganizationGraphImage('', '宗门.png'), /缺少作品名/)
await assert.rejects(() => service.readOrganizationGraphImage('作品', ''), /缺少图片名/)
await assert.rejects(() => service.deleteOrganizationGraph('', '宗门'), /缺少作品名/)
await assert.rejects(() => service.deleteOrganizationGraph('作品', ''), /缺少图谱名/)
await assert.rejects(
  () => service.exportOrganizationGraphToNote({ bookName: '作品' }),
  /缺少图谱名/
)

await assert.rejects(() => service.readEntityProfilesDocument(''), /缺少作品名/)
await assert.rejects(
  () => service.writeEntityProfileCategoryDocument('', 'artifact', []),
  /缺少作品名/
)
await assert.rejects(
  () => service.writeEntityProfileCategoryDocument('作品', 'artifact', {}),
  /内容格式不正确/
)
await assert.rejects(() => service.writeDictionaryDocument('', []), /缺少作品名/)
await assert.rejects(() => service.writeDictionaryDocument('作品', {}), /内容格式不正确/)

response = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  message: '已重新编号 3 章',
  totalRenamed: 3,
  settings: { chapterFormat: 'arabic', suffixType: '章' }
}
assert.equal(
  (
    await service.reformatChapterNumbers('作品', '第一卷', {
      chapterFormat: 'arabic',
      suffixType: '章'
    })
  ).totalRenamed,
  3
)
assert.equal(request.url, '/api/chapter-numbers/reformat')
await assert.rejects(() => service.reformatChapterNumbers('', '第一卷'), /缺少作品名/)
await assert.rejects(() => service.reformatChapterNumbers('作品', ''), /缺少卷名/)

console.log('Web 编辑器章节树与笔记服务测试通过')

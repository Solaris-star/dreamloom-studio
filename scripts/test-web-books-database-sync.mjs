import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createOrganization,
  createBook,
  createMap,
  createRelationship,
  deleteMap,
  deleteOrganization,
  deleteRelationship,
  editBook,
  exportOrganizationToNote,
  loadMapData,
  readCharacters,
  readDictionary,
  readEntityProfilesForBook,
  readMapImage,
  readMaps,
  readOrganization,
  readOrganizationImage,
  readOrganizations,
  readOutlineAiSessions,
  readRelationshipData,
  readRelationshipImage,
  readRelationships,
  readSequenceCharts,
  readSettings,
  readTimeline,
  saveChapter,
  saveMapData,
  saveRelationshipData,
  updateOrganizationThumbnail,
  updateRelationshipThumbnail,
  updateMap,
  upsertChapter,
  writeOrganization,
  writeCharacters,
  writeDictionary,
  writeEntityProfileCategory,
  writeOutlineAiSessions,
  writeOutlines,
  writeSequenceCharts,
  writeSettings,
  writeTimeline
} from '../src/main/services/webBooksApi.js'
import {
  getNovelDatabasePath,
  openNovelDatabase,
  recordBookIdeaRun
} from '../src/main/services/novelDatabaseService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-web-books-db-'))
const booksDir = join(rootDir, 'books')
const originalBookName = '雪岭旧案'
const renamedBookName = '雪岭新案'
const imageData =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSHzRgQAAAABJRU5ErkJggg=='

function documentTypes(repository, projectId) {
  return new Set(repository.listBookDocuments(projectId).map((item) => item.documentType))
}

function assertDocumentWriteResult(result, { fileName, documentType, itemCount }) {
  assert.equal(result.success, true)
  assert.equal(result.fileName, fileName)
  assert.equal(result.documentType, documentType)
  assert.equal(result.projectId, 'book_xueling')
  assert.equal(result.databaseSync.success, true)
  assert.equal(result.databaseSync.projectId, 'book_xueling')
  assert.equal(result.databaseSync.documentType, documentType)
  assert.equal(Boolean(result.documentPath), true)
  assert.equal(Boolean(result.path), true)
  if (itemCount !== undefined) assert.equal(result.itemCount, itemCount)
}

function assertGraphWriteResult(
  result,
  { graphName, assetType, collection, nodeCount, lineCount }
) {
  assert.equal(result.success, true)
  assert.equal(result.graphName, graphName)
  assert.equal(result.assetType, assetType)
  assert.equal(result.collection, collection)
  assert.equal(result.fileName, `${graphName}.json`)
  assert.equal(result.nodeCount, nodeCount)
  assert.equal(result.lineCount, lineCount)
  assert.equal(result.databaseSync.success, true)
  assert.equal(result.databaseSync.projectId, 'book_xueling')
  assert.equal(result.databaseSync.documentType, `${assetType}_graph:${graphName}`)
  assert.equal(Boolean(result.databaseSync.documentPath), true)
  assert.equal(fs.existsSync(result.databaseSync.documentPath), true)
}

function assertMapWriteResult(result, { mapName, documentType, dataDocumentType = '' }) {
  assert.equal(result.success, true)
  assert.equal(result.bookName, originalBookName)
  assert.equal(result.mapName, mapName)
  assert.equal(result.assetType, 'map')
  assert.equal(result.fileName, `${mapName}.png`)
  assert.equal(result.databaseSync.success, true)
  assert.equal(result.databaseSync.projectId, 'book_xueling')
  assert.equal(result.databaseSync.documentType, documentType)
  assert.equal(Boolean(result.databaseSync.documentPath), true)
  assert.equal(fs.existsSync(result.databaseSync.documentPath), true)
  if (dataDocumentType) {
    assert.equal(result.dataDatabaseSync.success, true)
    assert.equal(result.dataDatabaseSync.projectId, 'book_xueling')
    assert.equal(result.dataDatabaseSync.documentType, dataDocumentType)
    assert.equal(Boolean(result.dataDatabaseSync.documentPath), true)
    assert.equal(fs.existsSync(result.dataDatabaseSync.documentPath), true)
  }
}

try {
  fs.mkdirSync(booksDir, { recursive: true })

  const ideaRun = recordBookIdeaRun({
    booksDir,
    payload: {
      idea: '雪岭旧案开书',
      tags: ['悬疑']
    },
    result: {
      success: true,
      plans: [
        {
          id: 'idea_web_1',
          title: originalBookName,
          type: 'original',
          typeName: '原创',
          intro: '少女追查雪岭旧案。'
        }
      ],
      providerId: 'offline-provider',
      model: 'offline-model'
    }
  })
  assert.equal(ideaRun.status, 'generated')

  const created = await createBook(
    {
      id: 'book_xueling',
      name: originalBookName,
      type: 'original',
      typeName: '原创',
      intro: '少女追查雪岭旧案。',
      targetCount: 240000,
      bookIdeaRunId: ideaRun.id,
      selectedPlanId: 'idea_web_1',
      selectedPlan: ideaRun.plans[0]
    },
    booksDir
  )
  assert.equal(created.success, true)
  assert.equal(created.bookIdeaRun.status, 'confirmed')
  assert.equal(created.bookIdeaRun.projectId, 'book_xueling')
  assert.equal(fs.existsSync(getNovelDatabasePath(booksDir)), true)

  assertDocumentWriteResult(
    writeCharacters(
      { bookName: originalBookName, data: [{ name: '林青', gender: '女' }] },
      booksDir
    ),
    { fileName: 'characters.json', documentType: 'characters', itemCount: 1 }
  )
  assertDocumentWriteResult(
    writeSettings(
      {
        bookName: originalBookName,
        data: {
          categories: [
            { name: '术法', items: [{ name: '月影术', introduction: '只能夜间施展。' }] }
          ]
        }
      },
      booksDir
    ),
    { fileName: 'settings.json', documentType: 'settings' }
  )
  assertDocumentWriteResult(
    writeTimeline(
      { bookName: originalBookName, data: [{ title: '入山', time: '第一夜' }] },
      booksDir
    ),
    { fileName: 'timelines.json', documentType: 'timeline', itemCount: 1 }
  )
  assertDocumentWriteResult(
    writeOutlines(
      {
        bookName: originalBookName,
        data: { children: [{ id: 'outline_root', title: '全书大纲', children: [] }] }
      },
      booksDir
    ),
    { fileName: 'outlines.json', documentType: 'outlines' }
  )
  assertDocumentWriteResult(
    writeDictionary(
      { bookName: originalBookName, data: [{ term: '雪岭', description: '北境山脉。' }] },
      booksDir
    ),
    { fileName: 'dictionary.json', documentType: 'dictionary', itemCount: 1 }
  )
  assertDocumentWriteResult(
    writeEntityProfileCategory(
      {
        bookName: originalBookName,
        category: 'artifact',
        data: [{ name: '寒月剑', description: '剑身映月。' }]
      },
      booksDir
    ),
    { fileName: 'entity_profiles.json', documentType: 'entity_profiles' }
  )
  assertDocumentWriteResult(
    writeOutlineAiSessions(
      {
        bookName: originalBookName,
        data: {
          version: 1,
          nodes: { outline_root: [{ role: 'assistant', content: '保留雪岭线。' }] }
        }
      },
      booksDir
    ),
    { fileName: 'outline-ai-sessions.json', documentType: 'outline_ai_sessions' }
  )
  assertDocumentWriteResult(
    writeSequenceCharts(
      { bookName: originalBookName, data: [{ id: 'seq_1', title: '追兵入山' }] },
      booksDir
    ),
    { fileName: 'sequence-charts.json', documentType: 'sequence_charts', itemCount: 1 }
  )
  assertGraphWriteResult(
    createRelationship(
      {
        bookName: originalBookName,
        relationshipName: '主关系图',
        relationshipData: {
          nodes: [{ id: 'lin_qing', text: '林青' }],
          lines: []
        }
      },
      booksDir
    ),
    {
      graphName: '主关系图',
      assetType: 'relationship',
      collection: 'relationships',
      nodeCount: 1,
      lineCount: 0
    }
  )
  assertGraphWriteResult(
    createOrganization(
      {
        bookName: originalBookName,
        organizationName: '主势力图',
        organizationData: {
          nodes: [{ id: 'xueling', text: '雪岭门' }],
          lines: []
        }
      },
      booksDir
    ),
    {
      graphName: '主势力图',
      assetType: 'organization',
      collection: 'organizations',
      nodeCount: 1,
      lineCount: 0
    }
  )
  assertMapWriteResult(
    createMap(
      {
        bookName: originalBookName,
        mapName: '雪岭地图',
        description: '主地图',
        imageData
      },
      booksDir
    ),
    {
      mapName: '雪岭地图',
      documentType: 'map:雪岭地图'
    }
  )
  assertMapWriteResult(
    updateMap(
      {
        bookName: originalBookName,
        mapName: '雪岭地图',
        mapData: { elements: [{ id: 'gate', type: 'text', text: '山门' }] }
      },
      booksDir
    ),
    {
      mapName: '雪岭地图',
      documentType: 'map:雪岭地图',
      dataDocumentType: 'map_data:雪岭地图'
    }
  )

  const upserted = await upsertChapter(
    {
      bookName: originalBookName,
      volumeName: '正文',
      chapterName: '第一章',
      content: '林青在夜色里进入雪岭，寒月剑轻轻震动。',
      overwrite: true
    },
    booksDir
  )
  assert.equal(upserted.success, true)

  const saved = await saveChapter(
    {
      bookName: originalBookName,
      volumeName: '正文',
      chapterName: '第一章',
      newName: '第一章 雪岭夜行',
      content: '林青确认月影术只能夜里施展，于是借夜色绕开追兵。'
    },
    booksDir
  )
  assert.equal(saved.success, true)
  assert.equal(saved.bookName, originalBookName)
  assert.equal(saved.volumeName, '正文')
  assert.equal(saved.chapterName, '第一章 雪岭夜行')
  assert.equal(saved.databaseSync.success, true)
  assert.equal(saved.databaseSync.projectId, 'book_xueling')
  assert.equal(saved.databaseSync.volumeName, '正文')
  assert.equal(saved.databaseSync.chapterName, '第一章 雪岭夜行')
  assert.equal(saved.databaseSync.wordCount, saved.wordCount)
  assert.equal(Boolean(saved.databaseSync.chapterId), true)
  assert.equal(fs.existsSync(saved.filePath), true)

  const renamed = await editBook(
    {
      originalName: originalBookName,
      name: renamedBookName,
      intro: '少女在雪岭追查新案。',
      type: 'original',
      typeName: '原创'
    },
    booksDir
  )
  assert.equal(renamed.success, true)
  assert.equal(renamed.bookName, renamedBookName)
  assert.equal(renamed.originalName, originalBookName)
  assert.equal(renamed.renamed, true)
  assert.equal(renamed.fileName, 'mazi.json')
  assert.equal(renamed.documentType, 'meta')
  assert.equal(renamed.projectId, 'book_xueling')
  assert.equal(renamed.databaseSync.success, true)
  assert.equal(renamed.databaseSync.projectId, 'book_xueling')
  assert.equal(renamed.databaseSync.documentType, 'meta')
  assert.equal(Boolean(renamed.bookPath), true)
  assert.equal(Boolean(renamed.documentPath), true)
  assert.equal(fs.existsSync(renamed.documentPath), true)

  const repository = openNovelDatabase(booksDir)
  try {
    const project = repository.getProjectByName(renamedBookName)
    assert.equal(Boolean(project), true)
    assert.equal(project.id, 'book_xueling')
    assert.equal(project.bookName, renamedBookName)
    assert.equal(repository.getProjectByName(originalBookName), null)
    const bookIdeaRuns = repository.listBookIdeaRuns(project.id)
    assert.equal(bookIdeaRuns.length, 1)
    assert.equal(bookIdeaRuns[0].id, ideaRun.id)
    assert.equal(bookIdeaRuns[0].status, 'confirmed')
    assert.equal(bookIdeaRuns[0].selectedPlanId, 'idea_web_1')

    const types = documentTypes(repository, project.id)
    for (const type of [
      'meta',
      'characters',
      'settings',
      'timeline',
      'outlines',
      'dictionary',
      'entity_profiles',
      'outline_ai_sessions',
      'sequence_charts',
      'relationship_graph:主关系图',
      'organization_graph:主势力图',
      'map:雪岭地图',
      'map_data:雪岭地图'
    ]) {
      assert.equal(types.has(type), true, `缺少 ${type} 资料快照`)
    }

    const chapters = repository.listChapters(project.id)
    assert.equal(chapters.length, 1)
    assert.equal(chapters[0].chapterName, '第一章 雪岭夜行')
    assert.equal(chapters[0].content.includes('月影术'), true)
    assert.equal(chapters[0].wordCount > 0, true)
  } finally {
    repository.close()
  }

  assert.equal(readTimeline(renamedBookName, booksDir).data.length, 1)
  assert.equal(readCharacters(renamedBookName, booksDir).data[0].name, '林青')
  assert.equal(readDictionary(renamedBookName, booksDir).data[0].term, '雪岭')
  assert.equal(readSettings(renamedBookName, booksDir).data.categories.length, 1)
  assert.equal(readSequenceCharts(renamedBookName, booksDir).data.length, 1)
  assert.equal(
    readOutlineAiSessions(renamedBookName, booksDir).data.nodes.outline_root.length,
    1
  )
  assert.equal(
    readEntityProfilesForBook(renamedBookName, booksDir).data.artifact[0].name,
    '寒月剑'
  )

  assert.equal(readMaps(renamedBookName, booksDir).data[0].name, '雪岭地图')
  const savedMapData = saveMapData(
    {
      bookName: renamedBookName,
      mapName: '雪岭地图',
      mapData: { elements: [{ id: 'cliff', type: 'text', text: '断崖' }] }
    },
    booksDir
  )
  assert.equal(savedMapData.success, true)
  assert.equal(loadMapData({ bookName: renamedBookName, mapName: '雪岭地图' }, booksDir).elements.length, 1)
  assert.match(
    readMapImage({ bookName: renamedBookName, mapName: '雪岭地图' }, booksDir),
    /^data:image\/png;base64,/
  )

  assert.equal(readRelationships(renamedBookName, booksDir).data.length, 1)
  assert.equal(
    readRelationshipData(
      { bookName: renamedBookName, relationshipName: '主关系图' },
      booksDir
    ).data.nodes.length,
    1
  )
  assert.equal(
    createRelationship(
      {
        bookName: renamedBookName,
        relationshipName: '主关系图',
        relationshipData: {}
      },
      booksDir
    ).success,
    false
  )
  const savedRelationship = saveRelationshipData(
    {
      bookName: renamedBookName,
      relationshipName: '主关系图',
      relationshipData: { description: '更新后的关系图' }
    },
    booksDir
  )
  assert.equal(savedRelationship.success, true)
  assert.equal(savedRelationship.nodeCount, 1)
  assert.equal(
    updateRelationshipThumbnail(
      { bookName: renamedBookName, relationshipName: '主关系图', thumbnailData: '' },
      booksDir
    ).success,
    false
  )
  assert.equal(
    updateRelationshipThumbnail(
      { bookName: renamedBookName, relationshipName: '主关系图', thumbnailData: imageData },
      booksDir
    ).success,
    true
  )
  assert.match(
    readRelationshipImage(
      { bookName: renamedBookName, imageName: '主关系图.png' },
      booksDir
    ),
    /^data:image\/png;base64,/
  )

  assert.equal(readOrganizations(renamedBookName, booksDir).data.length, 1)
  assert.equal(
    readOrganization(
      { bookName: renamedBookName, organizationName: '主势力图' },
      booksDir
    ).data.nodes.length,
    1
  )
  const writtenOrganization = writeOrganization(
    {
      bookName: renamedBookName,
      organizationName: '主势力图',
      organizationData: { description: '更新后的势力图' }
    },
    booksDir
  )
  assert.equal(writtenOrganization.success, true)
  assert.equal(writtenOrganization.nodeCount, 1)
  assert.equal(
    updateOrganizationThumbnail(
      { bookName: renamedBookName, organizationId: '主势力图', thumbnailData: imageData },
      booksDir
    ).success,
    true
  )
  assert.match(
    readOrganizationImage(
      { bookName: renamedBookName, imageName: '主势力图.png' },
      booksDir
    ),
    /^data:image\/png;base64,/
  )
  const exportedOrganization = await exportOrganizationToNote(
    {
      bookName: renamedBookName,
      organizationName: '主势力图',
      content: '雪岭门负责守卫北境。'
    },
    booksDir
  )
  assert.equal(exportedOrganization.success, true)
  assert.equal(fs.existsSync(exportedOrganization.notePath), true)

  assert.equal(deleteMap({ bookName: renamedBookName, mapName: '雪岭地图' }, booksDir).existed, true)
  assert.equal(deleteMap({ bookName: renamedBookName, mapName: '雪岭地图' }, booksDir).existed, false)
  assert.equal(
    deleteRelationship(
      { bookName: renamedBookName, relationshipName: '主关系图' },
      booksDir
    ).existed,
    true
  )
  assert.equal(
    readRelationshipData(
      { bookName: renamedBookName, relationshipName: '主关系图' },
      booksDir
    ).success,
    false
  )
  assert.equal(
    deleteOrganization(
      { bookName: renamedBookName, organizationName: '主势力图' },
      booksDir
    ).existed,
    true
  )
  assert.equal(
    readOrganization(
      { bookName: renamedBookName, organizationName: '主势力图' },
      booksDir
    ).success,
    false
  )
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('web books database sync tests passed')

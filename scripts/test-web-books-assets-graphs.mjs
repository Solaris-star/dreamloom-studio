import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createBook,
  createMap,
  createOrganization,
  createRelationship,
  deleteMap,
  deleteOrganization,
  deleteRelationship,
  loadMapData,
  readCharacters,
  readDictionary,
  readEntityProfilesForBook,
  readMapImage,
  readMaps,
  readOrganization,
  readOrganizationImage,
  readOrganizations,
  readRelationshipData,
  readRelationshipImage,
  readRelationships,
  readSequenceCharts,
  readSettings,
  readTimeline,
  saveMapData,
  saveRelationshipData,
  updateMap,
  updateOrganizationThumbnail,
  updateRelationshipThumbnail,
  writeCharacters,
  writeDictionary,
  writeEntityProfileCategory,
  writeSequenceCharts,
  writeSettings,
  writeTimeline,
  writeOrganization
} from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-web-book-assets-'))
const booksDir = join(root, 'books')
const bookName = '资料图谱测试'
const pngBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32, 1)])
const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

try {
  fs.mkdirSync(booksDir, { recursive: true })
  assert.equal((await createBook({ id: 'asset-graph-book', name: bookName }, booksDir)).success, true)

  assert.deepEqual(readTimeline(bookName, booksDir).data, [])
  assert.deepEqual(readCharacters(bookName, booksDir).data, [])
  assert.deepEqual(readDictionary(bookName, booksDir).data, [])
  assert.deepEqual(readSequenceCharts(bookName, booksDir).data, [])
  assert.equal(readSettings(bookName, booksDir).success, true)
  assert.equal(readEntityProfilesForBook(bookName, booksDir).success, true)

  assert.equal(writeTimeline({ bookName, data: null }, booksDir).success, false)
  assert.equal(writeCharacters({ bookName, data: {} }, booksDir).success, false)
  assert.equal(writeDictionary({ bookName, data: 'invalid' }, booksDir).success, false)
  assert.equal(writeSequenceCharts({ bookName, data: 1 }, booksDir).success, false)
  assert.equal(writeSettings({ bookName: '', data: {} }, booksDir).success, false)
  assert.equal(
    writeEntityProfileCategory({ bookName, category: 'invalid', data: [] }, booksDir).success,
    false
  )
  assert.equal(
    writeEntityProfileCategory({ bookName, category: 'artifact', data: {} }, booksDir).success,
    false
  )

  assert.equal(writeTimeline({ bookName, data: [{ id: 'timeline-1' }] }, booksDir).success, true)
  assert.equal(writeCharacters({ bookName, data: [{ name: '林青' }] }, booksDir).success, true)
  assert.equal(writeDictionary({ bookName, data: [{ word: '月影术' }] }, booksDir).success, true)
  assert.equal(
    writeSequenceCharts({ bookName, data: [{ id: 'sequence-1' }] }, booksDir).success,
    true
  )
  assert.equal(
    writeSettings({ bookName, data: { categories: [{ name: '术法', items: [] }] } }, booksDir)
      .success,
    true
  )
  assert.equal(
    writeEntityProfileCategory(
      { bookName, category: 'artifact', data: [{ name: '月影剑' }] },
      booksDir
    ).success,
    true
  )
  assert.equal(readCharacters(bookName, booksDir).data[0].name, '林青')
  assert.equal(readEntityProfilesForBook(bookName, booksDir).data.artifact[0].name, '月影剑')

  assert.deepEqual(readMaps(bookName, booksDir), { success: true, data: [] })
  assert.equal(
    createMap({ bookName, mapName: '山门图', description: '山门地形' }, booksDir).success,
    false
  )
  const map = createMap(
    { bookName, mapName: '山门图', description: '山门地形', imageData: pngDataUrl },
    booksDir
  )
  assert.equal(map.success, true)
  assert.equal(map.assetType, 'map')
  assert.equal(
    createMap({ bookName, mapName: '山门图', imageData: pngDataUrl }, booksDir).success,
    false
  )
  assert.equal(readMaps(bookName, booksDir).data[0].description, '山门地形')
  assert.match(readMapImage({ bookName, mapName: '山门图' }, booksDir), /^data:image\/png;base64,/)

  const updatedMap = updateMap(
    {
      bookName,
      mapName: '山门图',
      imageData: pngDataUrl,
      mapData: { nodes: [{ id: 'gate' }], lines: [] }
    },
    booksDir
  )
  assert.equal(updatedMap.success, true)
  assert.equal(updatedMap.dataDatabaseSync.success, true)
  assert.equal(loadMapData({ bookName, mapName: '山门图' }, booksDir).nodes[0].id, 'gate')
  const emptyMapData = saveMapData({ bookName, mapName: '山门图', mapData: null }, booksDir)
  assert.equal(emptyMapData.success, false)
  assert.match(emptyMapData.message, /数据库未记录快照/)
  assert.equal(loadMapData({ bookName, mapName: '山门图' }, booksDir), null)
  const deletedMap = deleteMap({ bookName, mapName: '山门图' }, booksDir)
  assert.equal(deletedMap.existed, true)
  assert.equal(deletedMap.deletedFiles.length, 3)
  assert.equal(deleteMap({ bookName, mapName: '山门图' }, booksDir).existed, false)
  assert.equal(readMapImage({ bookName, mapName: '山门图' }, booksDir), '')

  assert.deepEqual(readRelationships(bookName, booksDir).data, [])
  assert.equal(
    readRelationshipData({ bookName, relationshipName: '人物关系' }, booksDir).success,
    false
  )
  const relationship = createRelationship(
    {
      bookName,
      relationshipName: '人物关系',
      relationshipData: {
        description: '主要人物关系',
        nodes: [{ id: 'linqing' }],
        lines: []
      }
    },
    booksDir
  )
  assert.equal(relationship.success, true)
  assert.equal(relationship.created, true)
  assert.equal(
    createRelationship(
      { bookName, relationshipName: '人物关系', relationshipData: {} },
      booksDir
    ).success,
    false
  )
  assert.equal(
    saveRelationshipData(
      { bookName, relationshipName: '人物关系', relationshipData: { description: '更新关系' } },
      booksDir
    ).created,
    false
  )
  assert.equal(readRelationships(bookName, booksDir).data[0].nodes.length, 1)
  assert.equal(
    updateRelationshipThumbnail(
      { bookName, relationshipName: '人物关系', thumbnailData: '' },
      booksDir
    ).success,
    false
  )
  assert.equal(
    updateRelationshipThumbnail(
      { bookName, relationshipName: '人物关系', thumbnailData: pngDataUrl },
      booksDir
    ).success,
    true
  )
  assert.match(
    readRelationshipImage({ bookName, imageName: '人物关系.png' }, booksDir),
    /^data:image\/png;base64,/
  )
  assert.equal(deleteRelationship({ bookName, relationshipName: '人物关系' }, booksDir).existed, true)
  assert.equal(deleteRelationship({ bookName, relationshipName: '人物关系' }, booksDir).existed, false)

  assert.deepEqual(readOrganizations(bookName, booksDir).data, [])
  assert.equal(
    readOrganization({ bookName, organizationName: '山门组织' }, booksDir).success,
    false
  )
  const organization = createOrganization(
    {
      bookName,
      organizationName: '山门组织',
      organizationData: { nodes: [{ id: 'master' }], lines: [] }
    },
    booksDir
  )
  assert.equal(organization.success, true)
  assert.equal(
    createOrganization(
      { bookName, organizationName: '山门组织', organizationData: {} },
      booksDir
    ).success,
    false
  )
  assert.equal(
    writeOrganization(
      { bookName, organizationName: '山门组织', organizationData: { lines: [{ id: 'line-1' }] } },
      booksDir
    ).success,
    true
  )
  assert.equal(readOrganization({ bookName, organizationName: '山门组织' }, booksDir).data.nodes.length, 1)
  assert.equal(
    updateOrganizationThumbnail(
      { bookName, organizationId: '山门组织', thumbnailData: pngDataUrl },
      booksDir
    ).success,
    true
  )
  assert.match(
    readOrganizationImage({ bookName, imageName: '山门组织.png' }, booksDir),
    /^data:image\/png;base64,/
  )
  assert.equal(deleteOrganization({ bookName, organizationName: '山门组织' }, booksDir).existed, true)
  assert.equal(deleteOrganization({ bookName, organizationName: '山门组织' }, booksDir).existed, false)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 书籍资料与图谱测试通过')

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
  readOutlineAiSessions,
  readOutlines,
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
  writeOutlineAiSessions,
  writeOutlines,
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
  assert.deepEqual(readOutlines(bookName, booksDir), { success: true, data: null })
  assert.deepEqual(readOutlineAiSessions(bookName, booksDir), {
    success: true,
    data: { version: 1, nodes: {} }
  })

  assert.equal((await writeTimeline({ bookName, data: null }, booksDir)).success, false)
  assert.equal((await writeCharacters({ bookName, data: {} }, booksDir)).success, false)
  assert.equal((await writeDictionary({ bookName, data: 'invalid' }, booksDir)).success, false)
  assert.equal((await writeSequenceCharts({ bookName, data: 1 }, booksDir)).success, false)
  assert.equal((await writeSettings({ bookName: '', data: {} }, booksDir)).success, false)
  assert.equal((await writeOutlines({ bookName, data: null }, booksDir)).success, false)
  assert.equal(
    (await writeOutlines({ bookName, data: { children: 'invalid' } }, booksDir)).success,
    false
  )
  assert.equal(
    (await writeOutlines({ bookName, data: [{ id: 'root', children: [null] }] }, booksDir)).success,
    false
  )
  assert.equal((await writeOutlineAiSessions({ bookName, data: [] }, booksDir)).success, false)
  assert.equal(
    (await writeOutlineAiSessions({ bookName, data: { nodes: [] } }, booksDir)).success,
    false
  )
  assert.equal(
    (await writeEntityProfileCategory({ bookName, category: 'invalid', data: [] }, booksDir)).success,
    false
  )
  assert.equal(
    (await writeEntityProfileCategory({ bookName, category: 'artifact', data: {} }, booksDir)).success,
    false
  )

  assert.equal((await writeTimeline({ bookName, data: [{ id: 'timeline-1' }] }, booksDir)).success, true)
  assert.equal((await writeCharacters({ bookName, data: [{ name: '林青' }] }, booksDir)).success, true)
  assert.equal((await writeDictionary({ bookName, data: [{ word: '月影术' }] }, booksDir)).success, true)
  assert.equal(
    (await writeSequenceCharts({ bookName, data: [{ id: 'sequence-1' }] }, booksDir)).success,
    true
  )
  assert.equal(
    (await writeSettings({ bookName, data: { categories: [{ name: '术法', items: [] }] } }, booksDir))
      .success,
    true
  )
  assert.equal(
    (await writeEntityProfileCategory(
      { bookName, category: 'artifact', data: [{ name: '月影剑' }] },
      booksDir
    )).success,
    true
  )
  assert.equal(
    (await writeOutlines(
      {
        bookName,
        data: [{ id: 'outline-root', children: [{ id: 'outline-child', children: [] }] }]
      },
      booksDir
    )).success,
    true
  )
  assert.equal(
    (await writeOutlineAiSessions(
      {
        bookName,
        data: { version: 0, nodes: { 'outline-root': { messages: [] } } }
      },
      booksDir
    )).success,
    true
  )
  assert.equal(readOutlines(bookName, booksDir).data[0].id, 'outline-root')
  assert.equal(readOutlineAiSessions(bookName, booksDir).data.version, 1)
  assert.deepEqual(
    readOutlineAiSessions(bookName, booksDir).data.nodes['outline-root'].messages,
    []
  )
  assert.equal(readCharacters(bookName, booksDir).data[0].name, '林青')
  assert.equal(readEntityProfilesForBook(bookName, booksDir).data.artifact[0].name, '月影剑')

  fs.writeFileSync(
    join(booksDir, bookName, 'settings.json'),
    JSON.stringify({
      categories: [
        null,
        {
          children: [
            {
              id: 'nested-category',
              name: '  嵌套分类  ',
              introduction: null,
              children: 'invalid',
              items: [null, { name: '  无名术法  ', introduction: '  术法说明  ' }]
            }
          ],
          items: 'invalid'
        }
      ]
    }),
    'utf8'
  )
  const normalizedSettings = readSettings(bookName, booksDir)
  assert.equal(normalizedSettings.success, true)
  assert.match(normalizedSettings.data.categories[0].id, /^category-/)
  assert.equal(normalizedSettings.data.categories[0].name, '未命名分类')
  assert.deepEqual(normalizedSettings.data.categories[0].items, [])
  assert.equal(normalizedSettings.data.categories[0].children[0].name, '嵌套分类')
  assert.equal(normalizedSettings.data.categories[0].children[0].introduction, '')
  assert.deepEqual(normalizedSettings.data.categories[0].children[0].children, [])
  assert.match(normalizedSettings.data.categories[0].children[0].items[0].id, /^setting-/)
  assert.equal(normalizedSettings.data.categories[0].children[0].items[0].name, '无名术法')
  assert.equal(normalizedSettings.data.categories[0].children[0].items[0].introduction, '术法说明')
  assert.equal((await writeSettings({ bookName, data: { categories: null } }, booksDir)).success, true)
  assert.equal(readSettings(bookName, booksDir).data.categories[0].id, 'default')

  fs.writeFileSync(join(booksDir, bookName, 'outline-ai-sessions.json'), '[]', 'utf8')
  assert.equal(readOutlineAiSessions(bookName, booksDir).success, false)
  fs.writeFileSync(join(booksDir, bookName, 'outline-ai-sessions.json'), '{broken', 'utf8')
  assert.equal(readOutlineAiSessions(bookName, booksDir).success, false)
  fs.writeFileSync(join(booksDir, bookName, 'entity_profiles.json'), '{broken', 'utf8')
  assert.equal(readEntityProfilesForBook(bookName, booksDir).success, false)
  assert.equal(
    (await writeEntityProfileCategory(
      { bookName, category: 'artifact', data: [{ name: '不应覆盖' }] },
      booksDir
    )).success,
    false
  )
  assert.equal(
    fs.readFileSync(join(booksDir, bookName, 'entity_profiles.json'), 'utf8'),
    '{broken'
  )

  assert.deepEqual(await readMaps(bookName, booksDir), { success: true, data: [] })
  const mapsDir = join(booksDir, bookName, 'maps')
  fs.writeFileSync(join(mapsDir, '旧地图.png'), pngBytes)
  fs.writeFileSync(join(mapsDir, '旧地图.json'), JSON.stringify(null), 'utf8')
  assert.deepEqual((await readMaps(bookName, booksDir)).data[0], {
    id: '旧地图',
    name: '旧地图',
    description: '',
    createdAt: '',
    updatedAt: '',
    thumbnail: pngDataUrl
  })
  fs.rmSync(join(mapsDir, '旧地图.png'))
  fs.rmSync(join(mapsDir, '旧地图.json'))
  assert.equal(
    (await createMap({ bookName, mapName: '山门图', description: '山门地形' }, booksDir)).success,
    false
  )
  const map = await createMap(
    { bookName, mapName: '山门图', description: '山门地形', imageData: pngDataUrl },
    booksDir
  )
  assert.equal(map.success, true)
  assert.equal(map.assetType, 'map')
  assert.equal(
    (await createMap({ bookName, mapName: '山门图', imageData: pngDataUrl }, booksDir)).success,
    false
  )
  assert.equal((await readMaps(bookName, booksDir)).data[0].description, '山门地形')
  assert.match(readMapImage({ bookName, mapName: '山门图' }, booksDir), /^data:image\/png;base64,/)

  const updatedMap = await updateMap(
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
  assert.equal((await loadMapData({ bookName, mapName: '山门图' }, booksDir)).nodes[0].id, 'gate')
  const imageOnlyMap = await updateMap(
    { bookName, mapName: '山门图', imageData: pngDataUrl },
    booksDir
  )
  assert.equal(imageOnlyMap.success, true)
  assert.equal(imageOnlyMap.dataFileName, '')
  assert.equal(Object.hasOwn(imageOnlyMap, 'dataDatabaseSync'), false)
  const dataOnlyMap = await updateMap(
    {
      bookName,
      mapName: '山门图',
      mapData: { nodes: [{ id: 'courtyard' }], lines: [] }
    },
    booksDir
  )
  assert.equal(dataOnlyMap.success, true)
  assert.equal(dataOnlyMap.dataDatabaseSync.success, true)
  assert.equal((await loadMapData({ bookName, mapName: '山门图' }, booksDir)).nodes[0].id, 'courtyard')
  const emptyMapData = await saveMapData({ bookName, mapName: '山门图', mapData: null }, booksDir)
  assert.equal(emptyMapData.success, false)
  assert.match(emptyMapData.message, /数据库未记录快照/)
  assert.equal(await loadMapData({ bookName, mapName: '山门图' }, booksDir), null)
  const deletedMap = deleteMap({ bookName, mapName: '山门图' }, booksDir)
  assert.equal(deletedMap.existed, true)
  assert.equal(deletedMap.deletedFiles.length, 3)
  assert.equal(deleteMap({ bookName, mapName: '山门图' }, booksDir).existed, false)
  assert.equal(readMapImage({ bookName, mapName: '山门图' }, booksDir), '')

  assert.deepEqual((await readRelationships(bookName, booksDir)).data, [])
  assert.equal(
    (await readRelationshipData({ bookName, relationshipName: '人物关系' }, booksDir)).success,
    false
  )
  const relationship = await createRelationship(
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
    (await createRelationship(
      { bookName, relationshipName: '人物关系', relationshipData: {} },
      booksDir
    )).success,
    false
  )
  assert.equal(
    (await saveRelationshipData(
      { bookName, relationshipName: '人物关系', relationshipData: { description: '更新关系' } },
      booksDir
    )).created,
    false
  )
  assert.equal((await readRelationships(bookName, booksDir)).data[0].nodes.length, 1)
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
  const relationshipsDir = join(booksDir, bookName, 'relationships')
  fs.writeFileSync(
    join(relationshipsDir, '旧关系.json'),
    JSON.stringify({ nodes: 'invalid', lines: null }),
    'utf8'
  )
  const legacyRelationship = (await readRelationships(bookName, booksDir)).data.find(
    (item) => item.name === '旧关系'
  )
  assert.equal(legacyRelationship.id, '旧关系')
  assert.equal(legacyRelationship.description, '')
  assert.equal(legacyRelationship.thumbnail, '')
  assert.deepEqual(legacyRelationship.nodes, [])
  assert.deepEqual(legacyRelationship.lines, [])
  assert.ok(legacyRelationship.createdAt)
  assert.ok(legacyRelationship.updatedAt)

  assert.deepEqual((await readOrganizations(bookName, booksDir)).data, [])
  assert.equal(
    (await readOrganization({ bookName, organizationName: '山门组织' }, booksDir)).success,
    false
  )
  const organization = await createOrganization(
    {
      bookName,
      organizationName: '山门组织',
      organizationData: { nodes: [{ id: 'master' }], lines: [] }
    },
    booksDir
  )
  assert.equal(organization.success, true)
  assert.equal(
    (await createOrganization(
      { bookName, organizationName: '山门组织', organizationData: {} },
      booksDir
    )).success,
    false
  )
  assert.equal(
    (await writeOrganization(
      { bookName, organizationName: '山门组织', organizationData: { lines: [{ id: 'line-1' }] } },
      booksDir
    )).success,
    true
  )
  assert.equal((await readOrganization({ bookName, organizationName: '山门组织' }, booksDir)).data.nodes.length, 1)
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
  const organizationsDir = join(booksDir, bookName, 'organizations')
  fs.writeFileSync(
    join(organizationsDir, '旧组织.json'),
    JSON.stringify({
      id: 'legacy-organization',
      name: '旧组织',
      description: '旧说明',
      nodes: [{ id: 'legacy-node' }],
      lines: [{ id: 'legacy-line' }],
      createdAt: '2024-01-01T00:00:00.000Z',
      customField: '保留字段'
    }),
    'utf8'
  )
  const updatedLegacyOrganization = await writeOrganization(
    {
      bookName,
      organizationName: '旧组织',
      organizationData: { description: '新说明' }
    },
    booksDir
  )
  assert.equal(updatedLegacyOrganization.created, false)
  const persistedLegacyOrganization = JSON.parse(
    fs.readFileSync(join(organizationsDir, '旧组织.json'), 'utf8')
  )
  assert.equal(persistedLegacyOrganization.id, 'legacy-organization')
  assert.equal(persistedLegacyOrganization.description, '新说明')
  assert.deepEqual(persistedLegacyOrganization.nodes, [{ id: 'legacy-node' }])
  assert.deepEqual(persistedLegacyOrganization.lines, [{ id: 'legacy-line' }])
  assert.equal(persistedLegacyOrganization.createdAt, '2024-01-01T00:00:00.000Z')
  assert.equal(persistedLegacyOrganization.customField, '保留字段')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 书籍资料与图谱测试通过')

import assert from 'node:assert/strict'
import {
  handleStudioContentRoute,
  isStudioContentRoute
} from '../src/main/webApi/studioContentRoutes.js'

const bookNameCases = [
  ['/api/studio/maps/list', 'readMaps'],
  ['/api/studio/timeline/read', 'readTimeline'],
  ['/api/studio/outlines/read', 'readOutlines'],
  ['/api/studio/outline-ai-sessions/read', 'readOutlineAiSessions'],
  ['/api/studio/characters/read', 'readCharacters'],
  ['/api/studio/entity-profiles/read', 'readEntityProfilesForBook'],
  ['/api/studio/dictionary/read', 'readDictionary'],
  ['/api/studio/settings/read', 'readSettings'],
  ['/api/studio/sequences/read', 'readSequenceCharts'],
  ['/api/studio/relationships/list', 'readRelationships'],
  ['/api/studio/organizations/list', 'readOrganizations']
]
const dataCases = [
  ['/api/studio/maps/image', 'readMapImage'],
  ['/api/studio/maps/data/load', 'loadMapData'],
  ['/api/studio/relationships/image', 'readRelationshipImage'],
  ['/api/studio/organizations/image', 'readOrganizationImage']
]
const payloadCases = [
  ['/api/studio/maps/create', 'createMap'],
  ['/api/studio/maps/update', 'updateMap'],
  ['/api/studio/maps/delete', 'deleteMap'],
  ['/api/studio/maps/data/save', 'saveMapData'],
  ['/api/studio/timeline/write', 'writeTimeline'],
  ['/api/studio/outlines/write', 'writeOutlines'],
  ['/api/studio/outline-ai-sessions/write', 'writeOutlineAiSessions'],
  ['/api/studio/characters/write', 'writeCharacters'],
  ['/api/studio/entity-profiles/write-category', 'writeEntityProfileCategory'],
  ['/api/studio/dictionary/write', 'writeDictionary'],
  ['/api/studio/settings/write', 'writeSettings'],
  ['/api/studio/sequences/write', 'writeSequenceCharts'],
  ['/api/studio/relationships/read', 'readRelationshipData'],
  ['/api/studio/relationships/create', 'createRelationship'],
  ['/api/studio/relationships/write', 'saveRelationshipData'],
  ['/api/studio/relationships/thumbnail', 'updateRelationshipThumbnail'],
  ['/api/studio/relationships/delete', 'deleteRelationship'],
  ['/api/studio/organizations/read', 'readOrganization'],
  ['/api/studio/organizations/create', 'createOrganization'],
  ['/api/studio/organizations/write', 'writeOrganization'],
  ['/api/studio/organizations/thumbnail', 'updateOrganizationThumbnail'],
  ['/api/studio/organizations/delete', 'deleteOrganization'],
  ['/api/notebooks/create', 'createNotebook'],
  ['/api/notebooks/delete', 'deleteNotebook'],
  ['/api/notebooks/rename', 'renameNotebook'],
  ['/api/notes/create', 'createNote'],
  ['/api/notes/delete', 'deleteNote'],
  ['/api/notes/rename', 'renameNote'],
  ['/api/notes/read', 'readNote'],
  ['/api/notes/edit', 'editNote'],
  ['/api/organizations/export-note', 'exportOrganizationToNote']
]

const calls = []
const responses = []
const service = {}
for (const [, method] of [...bookNameCases, ...dataCases, ...payloadCases]) {
  service[method] = async (...args) => {
    calls.push([method, ...args])
    return { method }
  }
}
service.loadNotes = async (...args) => {
  calls.push(['loadNotes', ...args])
  return { success: true, notes: [] }
}
const common = {
  res: {},
  booksDir: 'D:/books',
  sendJson: (_res, payload) => responses.push(payload),
  sanitizeText: (value) => String(value || '').trim(),
  service
}
const payload = { bookName: '长夜', item: '测试' }

for (const [path, method] of bookNameCases) {
  assert.equal(isStudioContentRoute(path), true)
  await handleStudioContentRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, '长夜', 'D:/books'])
}
for (const [path, method] of dataCases) {
  await handleStudioContentRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, payload, 'D:/books'])
  assert.deepEqual(responses.at(-1), { success: true, data: { method } })
}
for (const [path, method] of payloadCases) {
  await handleStudioContentRoute({ ...common, path, body: payload })
  assert.deepEqual(calls.at(-1), [method, payload, 'D:/books'])
  assert.deepEqual(responses.at(-1), { method })
}

await handleStudioContentRoute({ ...common, path: '/api/notes/load', body: payload })
assert.deepEqual(calls.at(-1), ['loadNotes', '长夜', 'D:/books'])
const callCount = calls.length
await handleStudioContentRoute({
  ...common,
  path: '/api/notes/load',
  body: { bookName: '   ' }
})
assert.equal(calls.length, callCount)
assert.deepEqual(responses.at(-1), { success: true, bookName: '', notes: [] })

assert.equal(isStudioContentRoute('/api/market/hotspots'), false)
assert.equal(
  await handleStudioContentRoute({ ...common, path: '/api/market/hotspots', body: {} }),
  false
)

console.log('创作资料路由测试通过')

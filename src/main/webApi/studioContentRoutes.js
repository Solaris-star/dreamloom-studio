import * as webBooksApi from '../services/webBooksApi.js'

const BOOK_NAME_ROUTES = new Map([
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
])

const DATA_ROUTES = new Map([
  ['/api/studio/maps/image', 'readMapImage'],
  ['/api/studio/maps/data/load', 'loadMapData'],
  ['/api/studio/relationships/image', 'readRelationshipImage'],
  ['/api/studio/organizations/image', 'readOrganizationImage']
])

const PAYLOAD_ROUTES = new Map([
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
])

export function isStudioContentRoute(path) {
  return (
    path === '/api/notes/load' ||
    BOOK_NAME_ROUTES.has(path) ||
    DATA_ROUTES.has(path) ||
    PAYLOAD_ROUTES.has(path)
  )
}

export async function handleStudioContentRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  sanitizeText,
  service = webBooksApi
}) {
  if (!isStudioContentRoute(path)) return false

  const payload = body || {}
  let result
  if (path === '/api/notes/load') {
    result = sanitizeText(payload.bookName)
      ? await service.loadNotes(payload.bookName, booksDir)
      : { success: true, bookName: '', notes: [] }
  } else if (BOOK_NAME_ROUTES.has(path)) {
    result = await service[BOOK_NAME_ROUTES.get(path)](payload.bookName, booksDir)
  } else if (DATA_ROUTES.has(path)) {
    result = {
      success: true,
      data: await service[DATA_ROUTES.get(path)](payload, booksDir)
    }
  } else {
    result = await service[PAYLOAD_ROUTES.get(path)](payload, booksDir)
  }
  sendJson(res, result)
  return true
}

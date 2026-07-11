import { readNovelDatabaseSnapshot } from './novelDatabaseService.js'

const QUERYABLE_RESOURCES = new Set([
  'projects',
  'documents',
  'researchRuns',
  'bookIdeaRuns',
  'outlines',
  'chapterOutlineRuns',
  'extractionRuns',
  'chapters',
  'agentTasks',
  'consistencyChecks',
  'exports',
  'backups'
])

function normalizeInput(booksDir, input = {}) {
  return {
    booksDir,
    bookName: String(input.bookName || '').trim(),
    projectId: String(input.projectId || '').trim()
  }
}

export function getWorkbenchDatabaseSnapshot(booksDir, input = {}) {
  return {
    success: true,
    data: readNovelDatabaseSnapshot(normalizeInput(booksDir, input))
  }
}

export function queryWorkbenchDatabase(booksDir, input = {}) {
  const resource = String(input.resource || '').trim()
  if (!QUERYABLE_RESOURCES.has(resource)) {
    throw Object.assign(new Error('数据库查询资源无效'), { statusCode: 400 })
  }

  const snapshot = readNovelDatabaseSnapshot(normalizeInput(booksDir, input))
  let items = Array.isArray(snapshot[resource]) ? snapshot[resource] : []
  const id = String(input.id || '').trim()
  if (id) items = items.filter((item) => String(item?.id || '') === id)

  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500)
  return {
    success: true,
    resource,
    items: items.slice(0, limit),
    total: items.length
  }
}

export default {
  getWorkbenchDatabaseSnapshot,
  queryWorkbenchDatabase
}

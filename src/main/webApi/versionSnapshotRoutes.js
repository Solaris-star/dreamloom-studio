import * as settingSnapshotService from '../services/settingSnapshotService.js'
import * as chapterVersionService from '../services/chapterVersionService.js'

const SETTING_ROUTES = new Set([
  '/api/setting-snapshots/list',
  '/api/setting-snapshots/create',
  '/api/setting-snapshots/restore',
  '/api/setting-snapshots/delete',
  '/api/setting-snapshots/diff'
])

const CHAPTER_ROUTES = new Set([
  '/api/editor-snapshots/create',
  '/api/editor-snapshots/list',
  '/api/editor-snapshots/delete'
])

export function isVersionSnapshotRoute(path) {
  return SETTING_ROUTES.has(path) || CHAPTER_ROUTES.has(path)
}

export function handleVersionSnapshotRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  resolveBookPath,
  settings = settingSnapshotService,
  chapters = chapterVersionService
}) {
  if (!isVersionSnapshotRoute(path)) return false

  const payload = body || {}
  const pathPayload = CHAPTER_ROUTES.has(path)
    ? { ...payload, bookName: payload.bookName || payload.bookId }
    : payload
  const bookPath = resolveBookPath(pathPayload, booksDir, { ensure: true })

  if (path === '/api/setting-snapshots/list') {
    sendJson(res, { success: true, snapshots: settings.listSnapshots(bookPath) })
  } else if (path === '/api/setting-snapshots/create') {
    sendJson(res, {
      success: true,
      snapshot: settings.createSnapshot(bookPath, payload)
    })
  } else if (path === '/api/setting-snapshots/restore') {
    const result = settings.restoreSnapshotWithBackup(bookPath, payload.snapshotId)
    sendJson(
      res,
      result
        ? { success: true, snapshot: result.snapshot, backup: result.backup }
        : { success: false, message: '设定快照不存在' }
    )
  } else if (path === '/api/setting-snapshots/delete') {
    const deleted = settings.deleteSnapshot(bookPath, payload.snapshotId)
    sendJson(
      res,
      deleted
        ? { success: true, deletedId: payload.snapshotId }
        : { success: false, message: '设定快照不存在' }
    )
  } else if (path === '/api/setting-snapshots/diff') {
    const diff = settings.diffSnapshots(bookPath, payload.snapshotIdA, payload.snapshotIdB)
    sendJson(
      res,
      diff ? { success: true, diff } : { success: false, message: '设定快照不存在' }
    )
  } else if (path === '/api/editor-snapshots/create') {
    sendJson(res, {
      success: true,
      snapshot: chapters.createChapterVersion(bookPath, payload)
    })
  } else if (path === '/api/editor-snapshots/list') {
    sendJson(res, {
      success: true,
      snapshots: chapters.listChapterVersions(bookPath, payload.chapterId)
    })
  } else {
    const deleted = chapters.deleteChapterVersion(bookPath, payload)
    sendJson(
      res,
      deleted
        ? { success: true, snapshotId: payload.snapshotId }
        : { success: false, message: '章节版本不存在' }
    )
  }
  return true
}

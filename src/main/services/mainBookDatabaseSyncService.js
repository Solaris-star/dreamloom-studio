import fs from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import {
  recordChapterWrite as recordNovelChapterWrite,
  recordBackup as recordNovelBackup,
  recordExport as recordNovelExport,
  syncBookDocument as syncNovelBookDocument,
  upsertProjectFromBook as upsertNovelProjectFromBook,
  withNovelDatabase
} from './novelDatabaseService.js'

export const BOOK_DOCUMENT_TYPES = {
  'mazi.json': 'meta',
  'characters.json': 'characters',
  'settings.json': 'settings',
  'outlines.json': 'outlines',
  'timelines.json': 'timeline',
  'dictionary.json': 'dictionary',
  'entity_profiles.json': 'entity_profiles',
  'outline-ai-sessions.json': 'outline_ai_sessions',
  'sequence-charts.json': 'sequence_charts'
}

export function safeBookFolderName(value, fallback = '') {
  const text = String(value || fallback || '').trim()
  return text.replace(/[\\/:*?"<>|]/g, '_')
}

export function countChapterWords(content) {
  if (!content) return 0
  return String(content).replace(/[\s\n\r\t]/g, '').length
}

function resolveExistingPath(filePath) {
  const absolutePath = resolve(filePath)
  try {
    return fs.realpathSync(absolutePath)
  } catch {
    return absolutePath
  }
}

function isPathInside(parentPath, candidatePath) {
  const parent = resolveExistingPath(parentPath)
  const candidate = resolveExistingPath(candidatePath)
  const relation = relative(parent, candidate)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function requireBookPath(booksDir, bookPath) {
  if (!isPathInside(booksDir, bookPath)) {
    throw new Error('作品目录必须位于当前书库内')
  }
  return bookPath
}

export function readBookMeta(bookPath) {
  if (!bookPath) return null
  const metaPath = join(bookPath, 'mazi.json')
  if (!fs.existsSync(metaPath)) return null
  const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  return parsed && typeof parsed === 'object' ? parsed : null
}

function withSkippedDatabaseSync(result, message) {
  return {
    ...(result && typeof result === 'object' ? result : {}),
    databaseSync: {
      success: false,
      message
    }
  }
}

export function inferBookNameFromPath(bookPath) {
  return safeBookFolderName(basename(bookPath || ''))
}

export function syncBookProject({
  booksDir,
  bookName,
  bookPath,
  meta,
  previousBookName = ''
} = {}) {
  if (!booksDir || !bookName) return null
  const folderName = safeBookFolderName(bookName)
  return upsertNovelProjectFromBook({
    booksDir,
    bookName: folderName,
    bookPath: bookPath || join(booksDir, folderName),
    meta,
    previousBookName
  })
}

export function syncBookDocument({
  booksDir,
  bookName,
  bookPath,
  documentType,
  fileName,
  meta
} = {}) {
  if (!booksDir || !bookName || !fileName) return null
  const folderName = safeBookFolderName(bookName)
  const type = documentType || BOOK_DOCUMENT_TYPES[fileName]
  if (!type) return null
  return syncNovelBookDocument({
    booksDir,
    bookName: folderName,
    bookPath: bookPath || join(booksDir, folderName),
    meta,
    documentType: type,
    fileName
  })
}

export function syncBookDocumentFile({ booksDir, bookName, bookPath, fileName, meta } = {}) {
  const documentType = BOOK_DOCUMENT_TYPES[fileName]
  if (!documentType) return null
  return syncBookDocument({ booksDir, bookName, bookPath, documentType, fileName, meta })
}

export function syncBookDocumentPath({
  booksDir,
  bookName,
  bookPath,
  documentType,
  filePath,
  meta
} = {}) {
  if (!booksDir || !bookName || !documentType || !filePath) return null
  const folderName = safeBookFolderName(bookName)
  const projectPath = requireBookPath(booksDir, bookPath || join(booksDir, folderName))
  const documentPath = isAbsolute(filePath) ? filePath : resolve(projectPath, filePath)
  if (!isPathInside(projectPath, documentPath)) {
    throw new Error('作品资料文件必须位于作品目录内')
  }
  const documentFileName = relative(projectPath, documentPath)
  return syncNovelBookDocument({
    booksDir,
    bookName: folderName,
    bookPath: projectPath,
    meta,
    documentType,
    fileName: documentFileName
  })
}

export function syncChapterWrite({
  booksDir,
  bookName,
  bookPath,
  volumeName,
  chapterName,
  previousChapterName = '',
  content = '',
  filePath = ''
} = {}) {
  if (!booksDir || !bookName || !volumeName || !chapterName) return null
  const folderName = safeBookFolderName(bookName)
  const projectPath = bookPath || join(booksDir, folderName)
  const text = String(content ?? '')
  return recordNovelChapterWrite({
    booksDir,
    bookName: folderName,
    bookPath: projectPath,
    chapter: {
      volumeName,
      chapterName,
      previousChapterName,
      filePath: filePath || join(projectPath, '正文', volumeName, `${chapterName}.txt`),
      content: text,
      wordCount: countChapterWords(text),
      status: 'saved',
      mode: 'manual_edit'
    }
  })
}

export function syncExportResult({
  booksDir,
  bookName,
  bookPath = '',
  meta = null,
  format = '',
  result = {}
} = {}) {
  if (!booksDir) return withSkippedDatabaseSync(result, '缺少书库目录，已跳过导出数据库同步')
  if (result?.success !== true)
    return withSkippedDatabaseSync(result, '导出未成功，已跳过数据库同步')
  const taskBookName = result.task?.bookName || ''
  const folderName = safeBookFolderName(taskBookName || bookName)
  if (!folderName) {
    return {
      ...result,
      exportRecord: null,
      databaseSync: {
        success: false,
        message: '导出结果写入数据库前需要有效作品'
      }
    }
  }

  try {
    const exportRecord = recordNovelExport({
      booksDir,
      bookName: folderName,
      bookPath: bookPath || join(booksDir, folderName),
      meta,
      format: format || result.format || result.task?.format || '',
      result
    })
    return {
      ...result,
      exportRecordId: exportRecord?.id || '',
      exportRecord: exportRecord || null
    }
  } catch (error) {
    return {
      ...result,
      exportRecord: null,
      databaseSync: {
        success: false,
        message: error?.message || '导出结果写入数据库失败'
      }
    }
  }
}

export function syncBackupResult({
  booksDir,
  bookName,
  bookPath = '',
  meta = null,
  result = {}
} = {}) {
  if (!booksDir) return withSkippedDatabaseSync(result, '缺少书库目录，已跳过备份数据库同步')
  if (result?.success !== true)
    return withSkippedDatabaseSync(result, '备份未成功，已跳过数据库同步')
  const taskBookName = result.task?.bookName || ''
  const folderName = safeBookFolderName(taskBookName || result.bookName || bookName)

  try {
    const backupRecord = recordNovelBackup({
      booksDir,
      bookName: folderName,
      bookPath: folderName ? bookPath || join(booksDir, folderName) : '',
      meta,
      scope: result.scope || result.task?.scope || '',
      result
    })
    return {
      ...result,
      backupRecordId: backupRecord?.id || '',
      backupRecord: backupRecord || null,
      databaseSync: {
        success: true,
        backupRecordId: backupRecord?.id || '',
        projectId: backupRecord?.projectId || ''
      }
    }
  } catch (error) {
    return {
      ...result,
      backupRecord: null,
      databaseSync: {
        success: false,
        message: error?.message || '备份结果写入数据库失败'
      }
    }
  }
}

function collectChapterTextFiles(rootPath, volumeParts = []) {
  if (!rootPath || !fs.existsSync(rootPath)) return []
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
    .flatMap((entry) => {
      const entryPath = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        return collectChapterTextFiles(entryPath, [...volumeParts, entry.name])
      }
      if (!entry.isFile() || !entry.name.endsWith('.txt')) return []
      return [
        {
          volumeName: volumeParts.join('/') || '正文',
          chapterName: basename(entry.name, '.txt'),
          filePath: entryPath
        }
      ]
    })
}

function syncBookDirectoryWithRepository(repository, { bookName, bookPath } = {}) {
  const folderName = safeBookFolderName(bookName || inferBookNameFromPath(bookPath))
  if (!folderName) throw new Error('写入数据库前需要有效作品')
  if (!bookPath || !fs.existsSync(bookPath)) throw new Error('写入数据库前需要有效作品目录')
  const meta = readBookMeta(bookPath)
  if (!meta) throw new Error('写入数据库前需要 mazi.json')

  const project = repository.upsertProjectFromBook({
    bookName: folderName,
    bookPath,
    meta
  })
  const documents = repository.syncBookDocuments({
    bookName: folderName,
    bookPath,
    meta
  })
  const chapters = collectChapterTextFiles(join(bookPath, '正文')).map((chapter) => {
    const content = fs.readFileSync(chapter.filePath, 'utf-8')
    return repository.recordChapterWrite({
      bookName: folderName,
      bookPath,
      meta,
      chapter: {
        volumeName: chapter.volumeName,
        chapterName: chapter.chapterName,
        filePath: chapter.filePath,
        content,
        wordCount: countChapterWords(content),
        status: 'saved',
        mode: 'manual_edit'
      }
    })
  })

  return {
    bookName: folderName,
    bookPath,
    project,
    documents,
    chapters
  }
}

export function syncImportResult({ booksDir, result = {} } = {}) {
  if (!booksDir) return withSkippedDatabaseSync(result, '缺少书库目录，已跳过导入数据库同步')
  if (result?.success !== true)
    return withSkippedDatabaseSync(result, '导入未成功，已跳过数据库同步')
  const taskBookName = result.task?.bookName || ''
  const folderName = safeBookFolderName(result.bookName || taskBookName)
  if (!folderName) {
    return {
      ...result,
      databaseSync: {
        success: false,
        message: '导入结果写入数据库前需要有效作品'
      }
    }
  }

  const bookPath = result.bookPath || join(booksDir, folderName)
  if (!fs.existsSync(bookPath)) {
    return {
      ...result,
      databaseSync: {
        success: false,
        message: '导入结果写入数据库前需要有效作品目录'
      }
    }
  }

  try {
    requireBookPath(booksDir, bookPath)
    const synced = withNovelDatabase(booksDir, (repository) =>
      repository.withTransaction(() =>
        syncBookDirectoryWithRepository(repository, {
          bookName: folderName,
          bookPath
        })
      )
    )

    return {
      ...result,
      databaseSync: {
        success: true,
        projectId: synced.project?.id || '',
        documentTypes: synced.documents.map((document) => document.documentType),
        chapterCount: synced.chapters.filter(Boolean).length
      },
      projectRecord: synced.project || null
    }
  } catch (error) {
    return {
      ...result,
      databaseSync: {
        success: false,
        message: error?.message || '导入结果写入数据库失败'
      }
    }
  }
}

export function syncRestoreResult({ booksDir, result = {} } = {}) {
  if (!booksDir) return withSkippedDatabaseSync(result, '缺少书库目录，已跳过恢复数据库同步')
  if (result?.success !== true)
    return withSkippedDatabaseSync(result, '恢复未成功，已跳过数据库同步')
  const mode = String(result.mode || result.restoreMode || '').toLowerCase()
  if (mode && !['library', 'bookshelf', 'current'].includes(mode)) {
    return {
      ...result,
      databaseSync: {
        success: true,
        projectCount: 0,
        projectIds: [],
        documentTypes: [],
        chapterCount: 0,
        message: '归档恢复未写入当前书库数据库'
      }
    }
  }

  const restoredBooks = Array.isArray(result.restoredBooks) ? result.restoredBooks : []
  if (!restoredBooks.length) {
    return {
      ...result,
      databaseSync: {
        success: false,
        message: '恢复结果写入数据库前需要恢复作品列表'
      }
    }
  }

  try {
    const syncedBooks = withNovelDatabase(booksDir, (repository) =>
      repository.withTransaction(() =>
        restoredBooks.map((book) => {
          const bookName = book.bookName || book.folderName || inferBookNameFromPath(book.path)
          const folderName = safeBookFolderName(bookName)
          const bookPath = requireBookPath(
            booksDir,
            book.path || join(booksDir, folderName)
          )
          return syncBookDirectoryWithRepository(repository, {
            bookName: folderName,
            bookPath
          })
        })
      )
    )
    const documentTypes = [
      ...new Set(
        syncedBooks.flatMap((book) => book.documents.map((document) => document.documentType))
      )
    ]

    return {
      ...result,
      databaseSync: {
        success: true,
        projectCount: syncedBooks.length,
        projectIds: syncedBooks.map((book) => book.project?.id || '').filter(Boolean),
        documentTypes,
        chapterCount: syncedBooks.reduce(
          (sum, book) => sum + book.chapters.filter(Boolean).length,
          0
        )
      },
      projectRecords: syncedBooks.map((book) => book.project).filter(Boolean)
    }
  } catch (error) {
    return {
      ...result,
      databaseSync: {
        success: false,
        message: error?.message || '恢复结果写入数据库失败'
      }
    }
  }
}

export default {
  BOOK_DOCUMENT_TYPES,
  safeBookFolderName,
  countChapterWords,
  readBookMeta,
  inferBookNameFromPath,
  syncBookProject,
  syncBookDocument,
  syncBookDocumentFile,
  syncBookDocumentPath,
  syncChapterWrite,
  syncImportResult,
  syncRestoreResult,
  syncBackupResult,
  syncExportResult
}

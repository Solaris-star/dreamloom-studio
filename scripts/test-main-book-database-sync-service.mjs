import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  countChapterWords,
  readBookMeta,
  syncBookDocumentFile,
  syncBookProject,
  syncChapterWrite,
  syncBackupResult,
  syncExportResult,
  syncImportResult,
  syncRestoreResult
} from '../src/main/services/mainBookDatabaseSyncService.js'
import { getNovelDatabasePath, openNovelDatabase } from '../src/main/services/novelDatabaseService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-main-book-db-'))
const booksDir = join(rootDir, 'books')
const originalBookName = '雾城旧梦'
const renamedBookName = '雾城新梦'
const originalBookPath = join(booksDir, originalBookName)
const renamedBookPath = join(booksDir, renamedBookName)

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function documentTypes(repository, projectId) {
  return new Set(repository.listBookDocuments(projectId).map((item) => item.documentType))
}

try {
  fs.mkdirSync(join(originalBookPath, '正文', '第一卷'), { recursive: true })

  const originalMeta = {
    id: 'book_wucheng',
    name: originalBookName,
    type: 'original',
    typeName: '原创',
    intro: '少女在雾城查案。',
    targetCount: 260000
  }
  writeJson(join(originalBookPath, 'mazi.json'), originalMeta)
  writeJson(join(originalBookPath, 'characters.json'), [{ name: '许灯', role: '主角' }])
  writeJson(join(originalBookPath, 'settings.json'), {
    categories: [{ name: '城市', items: [{ name: '雾城', introduction: '常年起雾。' }] }]
  })

  const project = syncBookProject({
    booksDir,
    bookName: originalBookName,
    bookPath: originalBookPath,
    meta: originalMeta
  })
  assert.equal(project.id, 'book_wucheng')
  assert.equal(project.bookName, originalBookName)
  assert.deepEqual(readBookMeta(originalBookPath), originalMeta)

  syncBookDocumentFile({
    booksDir,
    bookName: originalBookName,
    bookPath: originalBookPath,
    fileName: 'characters.json'
  })
  syncBookDocumentFile({
    booksDir,
    bookName: originalBookName,
    bookPath: originalBookPath,
    fileName: 'settings.json'
  })

  const firstChapterContent = '许灯推开旧档案室的门，发现案卷里少了一页。'
  const firstChapterPath = join(originalBookPath, '正文', '第一卷', '第一章.txt')
  fs.writeFileSync(firstChapterPath, firstChapterContent, 'utf-8')
  syncChapterWrite({
    booksDir,
    bookName: originalBookName,
    bookPath: originalBookPath,
    volumeName: '第一卷',
    chapterName: '第一章',
    content: firstChapterContent,
    filePath: firstChapterPath
  })

  fs.renameSync(originalBookPath, renamedBookPath)
  const renamedMeta = {
    ...originalMeta,
    name: renamedBookName,
    intro: '少女在雾城追查新案。'
  }
  writeJson(join(renamedBookPath, 'mazi.json'), renamedMeta)
  syncBookProject({
    booksDir,
    bookName: renamedBookName,
    bookPath: renamedBookPath,
    meta: renamedMeta,
    previousBookName: originalBookName
  })

  const renamedChapterName = '第一章 档案缺页'
  const renamedChapterPath = join(renamedBookPath, '正文', '第一卷', `${renamedChapterName}.txt`)
  fs.renameSync(join(renamedBookPath, '正文', '第一卷', '第一章.txt'), renamedChapterPath)
  const renamedChapterContent = '许灯确认缺页记录着十年前的火灾，于是决定重查旧案。'
  fs.writeFileSync(renamedChapterPath, renamedChapterContent, 'utf-8')
  syncChapterWrite({
    booksDir,
    bookName: renamedBookName,
    bookPath: renamedBookPath,
    volumeName: '第一卷',
    chapterName: renamedChapterName,
    previousChapterName: '第一章',
    content: renamedChapterContent,
    filePath: renamedChapterPath
  })

  const exportResult = syncExportResult({
    booksDir,
    result: {
      success: true,
      filePath: join(booksDir, '.import-export', 'exports', `${renamedBookName}.md`),
      fileName: `${renamedBookName}.md`,
      size: 512,
      task: {
        id: 'export_task_main_sync',
        bookName: renamedBookName,
        format: 'md'
      }
    }
  })
  assert.equal(exportResult.exportRecordId, 'export_task_main_sync')
  assert.equal(exportResult.exportRecord.format, 'md')

  const missingBooksDirExportResult = syncExportResult({
    result: {
      success: true,
      filePath: join(booksDir, '.import-export', 'exports', 'missing-books-dir.md'),
      fileName: 'missing-books-dir.md'
    }
  })
  assert.equal(missingBooksDirExportResult.databaseSync.success, false)

  const emptyExportResult = syncExportResult({ booksDir, result: {} })
  assert.equal(emptyExportResult.databaseSync.success, false)

  const failedSyncResult = syncExportResult({
    booksDir,
    bookName: renamedBookName,
    result: {
      success: true,
      filePath: join(booksDir, '.import-export', 'exports', `${renamedBookName}-copy.md`),
      fileName: `${renamedBookName}-copy.md`,
      size: 16,
      task: {
        id: 'export_task_main_sync',
        format: 'md'
      }
    }
  })
  assert.equal(failedSyncResult.exportRecord, null)
  assert.equal(failedSyncResult.databaseSync.success, false)

  const backupResult = syncBackupResult({
    booksDir,
    result: {
      success: true,
      scope: 'book',
      filePath: join(booksDir, '.import-export', 'backups', `${renamedBookName}.zip`),
      fileName: `${renamedBookName}.zip`,
      size: 1024,
      task: {
        id: 'backup_task_main_sync',
        type: 'backup',
        scope: 'book',
        bookName: renamedBookName
      }
    }
  })
  assert.equal(backupResult.backupRecordId, 'backup_task_main_sync')
  assert.equal(backupResult.backupRecord.scope, 'book')
  assert.equal(backupResult.databaseSync.success, true)

  const libraryBackupResult = syncBackupResult({
    booksDir,
    result: {
      success: true,
      scope: 'library',
      filePath: join(booksDir, '.import-export', 'backups', 'library.zip'),
      fileName: 'library.zip',
      size: 4096,
      task: {
        id: 'backup_library_task_main_sync',
        type: 'backup',
        scope: 'library'
      }
    }
  })
  assert.equal(libraryBackupResult.backupRecordId, 'backup_library_task_main_sync')
  assert.equal(libraryBackupResult.backupRecord.projectId, '')
  assert.equal(libraryBackupResult.databaseSync.success, true)

  const failedBackupResult = syncBackupResult({
    booksDir,
    result: {
      success: false,
      message: '备份失败'
    }
  })
  assert.equal(failedBackupResult.databaseSync.success, false)

  const failedBackupSyncResult = syncBackupResult({
    booksDir,
    bookName: renamedBookName,
    result: {
      success: true,
      scope: 'book',
      filePath: join(booksDir, '.import-export', 'backups', `${renamedBookName}-copy.zip`),
      fileName: `${renamedBookName}-copy.zip`,
      size: 16,
      task: {
        id: 'backup_task_main_sync',
        type: 'backup',
        scope: 'book'
      }
    }
  })
  assert.equal(failedBackupSyncResult.backupRecord, null)
  assert.equal(failedBackupSyncResult.databaseSync.success, false)

  const missingBookSyncResult = syncExportResult({
    booksDir,
    result: {
      success: true,
      filePath: join(booksDir, '.import-export', 'exports', 'missing.md'),
      fileName: 'missing.md',
      size: 16
    }
  })
  assert.equal(missingBookSyncResult.exportRecord, null)
  assert.equal(missingBookSyncResult.databaseSync.success, false)

  const importedBookName = '导入长夜'
  const importedBookPath = join(booksDir, importedBookName)
  fs.mkdirSync(join(importedBookPath, '正文', '第一卷'), { recursive: true })
  const importedMeta = {
    id: 'book_imported_changye',
    name: importedBookName,
    type: 'original',
    typeName: '导入作品',
    intro: '从本地文本导入。'
  }
  writeJson(join(importedBookPath, 'mazi.json'), importedMeta)
  const importedFirstChapter = '钟离在长夜里醒来，听见城墙外传来铁铃声。'
  const importedSecondChapter = '他沿着旧河道追踪线索，发现守夜人的名单被人改过。'
  fs.writeFileSync(join(importedBookPath, '正文', '第一卷', '第一章.txt'), importedFirstChapter, 'utf-8')
  fs.writeFileSync(join(importedBookPath, '正文', '第一卷', '第二章.txt'), importedSecondChapter, 'utf-8')
  const importSyncResult = syncImportResult({
    booksDir,
    result: {
      success: true,
      bookName: importedBookName,
      bookPath: importedBookPath,
      chapterCount: 2,
      wordCount: countChapterWords(importedFirstChapter + importedSecondChapter),
      task: {
        id: 'import_task_main_sync',
        type: 'import',
        bookName: importedBookName,
        format: 'txt'
      }
    }
  })
  assert.equal(importSyncResult.databaseSync.success, true)
  assert.equal(importSyncResult.databaseSync.projectId, 'book_imported_changye')
  assert.equal(importSyncResult.databaseSync.chapterCount, 2)
  assert.equal(importSyncResult.projectRecord.id, 'book_imported_changye')

  const emptyImportResult = syncImportResult({ booksDir, result: {} })
  assert.equal(emptyImportResult.databaseSync.success, false)

  const missingImportBookSyncResult = syncImportResult({
    booksDir,
    result: {
      success: true,
      bookPath: importedBookPath,
      chapterCount: 0
    }
  })
  assert.equal(missingImportBookSyncResult.databaseSync.success, false)

  const missingImportPathSyncResult = syncImportResult({
    booksDir,
    result: {
      success: true,
      bookName: '不存在的导入作品',
      bookPath: join(booksDir, '不存在的导入作品')
    }
  })
  assert.equal(missingImportPathSyncResult.databaseSync.success, false)

  const restoredBookName = '恢复星河'
  const restoredBookPath = join(booksDir, restoredBookName)
  fs.mkdirSync(join(restoredBookPath, '正文', '第一卷'), { recursive: true })
  const restoredMeta = {
    id: 'book_restored_xinghe',
    name: restoredBookName,
    type: 'original',
    typeName: '恢复作品',
    intro: '从备份恢复。'
  }
  writeJson(join(restoredBookPath, 'mazi.json'), restoredMeta)
  writeJson(join(restoredBookPath, 'characters.json'), [{ name: '林照', role: '领航员' }])
  writeJson(join(restoredBookPath, 'outlines.json'), [{ title: '第一卷', children: [] }])
  const restoredChapterContent = '林照在星河港口确认航线，准备带队穿越暗区。'
  fs.writeFileSync(join(restoredBookPath, '正文', '第一卷', '第一章.txt'), restoredChapterContent, 'utf-8')
  const restoreSyncResult = syncRestoreResult({
    booksDir,
    result: {
      success: true,
      mode: 'library',
      targetDir: booksDir,
      restoredBooks: [{
        bookName: restoredBookName,
        folderName: restoredBookName,
        path: restoredBookPath,
        fileCount: 4
      }],
      bookCount: 1,
      task: {
        id: 'restore_task_main_sync',
        type: 'restore',
        restoredBooks: [{ bookName: restoredBookName, path: restoredBookPath }]
      }
    }
  })
  assert.equal(restoreSyncResult.databaseSync.success, true)
  assert.equal(restoreSyncResult.databaseSync.projectCount, 1)
  assert.equal(restoreSyncResult.databaseSync.chapterCount, 1)
  assert.equal(restoreSyncResult.databaseSync.documentTypes.includes('characters'), true)
  assert.equal(restoreSyncResult.databaseSync.documentTypes.includes('outlines'), true)
  assert.equal(restoreSyncResult.projectRecords[0].id, 'book_restored_xinghe')

  const archiveRestoreSyncResult = syncRestoreResult({
    booksDir,
    result: {
      success: true,
      mode: 'archive',
      targetDir: join(booksDir, '.import-export', 'restored', 'archive-copy')
    }
  })
  assert.equal(archiveRestoreSyncResult.databaseSync.success, true)
  assert.equal(archiveRestoreSyncResult.databaseSync.projectCount, 0)

  const failedRestoreResult = syncRestoreResult({
    booksDir,
    result: {
      success: false,
      message: '恢复失败'
    }
  })
  assert.equal(failedRestoreResult.databaseSync.success, false)

  const missingRestoreBooksSyncResult = syncRestoreResult({
    booksDir,
    result: {
      success: true,
      mode: 'library',
      restoredBooks: []
    }
  })
  assert.equal(missingRestoreBooksSyncResult.databaseSync.success, false)

  const repository = openNovelDatabase(booksDir)
  try {
    assert.equal(fs.existsSync(getNovelDatabasePath(booksDir)), true)
    const storedProject = repository.getProjectByName(renamedBookName)
    assert.equal(Boolean(storedProject), true)
    assert.equal(storedProject.id, 'book_wucheng')
    assert.equal(storedProject.intro, '少女在雾城追查新案。')
    assert.equal(repository.getProjectByName(originalBookName), null)

    const types = documentTypes(repository, storedProject.id)
    assert.equal(types.has('meta'), true)
    assert.equal(types.has('characters'), true)
    assert.equal(types.has('settings'), true)

    const chapters = repository.listChapters(storedProject.id)
    assert.equal(chapters.length, 1)
    assert.equal(chapters[0].chapterName, renamedChapterName)
    assert.equal(chapters[0].content, renamedChapterContent)
    assert.equal(chapters[0].wordCount, countChapterWords(renamedChapterContent))

    const exports = repository.listExports(storedProject.id)
    assert.equal(exports.length, 1)
    assert.equal(exports[0].id, 'export_task_main_sync')
    assert.equal(exports[0].taskId, 'export_task_main_sync')

    const backups = repository.listBackups(storedProject.id)
    assert.equal(backups.length, 1)
    assert.equal(backups[0].id, 'backup_task_main_sync')
    assert.equal(backups[0].taskId, 'backup_task_main_sync')

    const allBackups = repository.listBackups('')
    assert.equal(allBackups.some((item) => item.id === 'backup_library_task_main_sync'), true)

    const importedProject = repository.getProjectByName(importedBookName)
    assert.equal(Boolean(importedProject), true)
    assert.equal(importedProject.id, 'book_imported_changye')
    const importedTypes = documentTypes(repository, importedProject.id)
    assert.equal(importedTypes.has('meta'), true)
    const importedChapters = repository.listChapters(importedProject.id)
    assert.equal(importedChapters.length, 2)
    assert.equal(
      importedChapters.some((chapter) =>
        chapter.chapterName === '第一章' && chapter.content === importedFirstChapter
      ),
      true
    )
    assert.equal(
      importedChapters.some((chapter) =>
        chapter.chapterName === '第二章' && chapter.content === importedSecondChapter
      ),
      true
    )

    const restoredProject = repository.getProjectByName(restoredBookName)
    assert.equal(Boolean(restoredProject), true)
    assert.equal(restoredProject.id, 'book_restored_xinghe')
    const restoredTypes = documentTypes(repository, restoredProject.id)
    assert.equal(restoredTypes.has('meta'), true)
    assert.equal(restoredTypes.has('characters'), true)
    assert.equal(restoredTypes.has('outlines'), true)
    const restoredChapters = repository.listChapters(restoredProject.id)
    assert.equal(restoredChapters.length, 1)
    assert.equal(restoredChapters[0].content, restoredChapterContent)
  } finally {
    repository.close()
  }
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('main book database sync service tests passed')

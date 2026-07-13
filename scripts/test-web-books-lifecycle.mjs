import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createBook,
  createChapter,
  createNote,
  createNotebook,
  createVolume,
  checkChapterExists,
  deleteBook,
  deleteNode,
  deleteNote,
  deleteNotebook,
  editBook,
  editNode,
  editNote,
  exportOrganizationToNote,
  getChapterSettings,
  getSortOrder,
  loadChapters,
  loadNotes,
  readBooksDir,
  readChapter,
  readNote,
  reformatChapterNumbers,
  renameNote,
  renameNotebook,
  saveChapter,
  setChapterTargetWords,
  setSortOrder,
  storeDelete,
  storeGet,
  storeSet,
  updateChapterFormat,
  upsertChapter
} from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-web-books-lifecycle-'))
const booksDir = join(root, 'books')
const pngBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32, 1)])
const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

try {
  assert.equal(storeGet(''), null)
  assert.equal(storeSet('', 'ignored'), false)
  assert.equal(storeDelete(''), false)
  assert.deepEqual(await readBooksDir(''), [])
  await assert.rejects(() => readBooksDir(booksDir), /书籍目录不存在/)
  fs.mkdirSync(booksDir, { recursive: true })
  assert.deepEqual(await loadChapters('', booksDir), {
    success: false,
    message: '书籍名称不能为空',
    chapters: []
  })
  assert.deepEqual(await loadChapters('不存在作品', ''), {
    success: false,
    message: '请先选择书库目录',
    bookName: '不存在作品',
    chapters: []
  })
  assert.deepEqual(await loadChapters('不存在作品', booksDir), {
    success: true,
    bookName: '不存在作品',
    chapters: []
  })

  const created = await createBook(
    { id: 'lifecycle-book', name: '生命周期作品', coverImagePath: pngDataUrl },
    booksDir
  )
  assert.equal(created.success, true)
  assert.equal((await deleteBook('生命周期作品', '')).message, 'booksDir not set')
  assert.equal((await editBook({ originalName: '生命周期作品' }, '')).message, 'booksDir not set')
  assert.equal(
    (await editBook({ originalName: '不存在作品', name: '新名称' }, booksDir)).message,
    '书籍不存在'
  )

  fs.mkdirSync(join(booksDir, '损坏作品'), { recursive: true })
  fs.writeFileSync(join(booksDir, '损坏作品', 'mazi.json'), '{broken', 'utf8')
  assert.equal(
    (await editBook({ originalName: '损坏作品', name: '损坏作品' }, booksDir)).message,
    '书籍元数据损坏'
  )
  fs.writeFileSync(
    join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'),
    '第一章正文',
    'utf8'
  )

  const legacyBooks = [
    {
      folderName: '旧导入作品',
      meta: {
        id: 'legacy-imported-book',
        name: '旧导入作品',
        importedFrom: 'importExport',
        type: 'imported',
        typeName: '导入',
        sourceType: 'downloaded',
        downloaded: true,
        metadata: { wordCount: 1234 }
      },
      expected: {
        bookRole: 'creative',
        type: 'original',
        typeName: '导入作品',
        sourceType: 'user_imported',
        downloaded: false,
        totalWords: 1234
      }
    },
    {
      folderName: '旧下载作品',
      meta: {
        id: 'legacy-downloaded-book',
        name: '旧下载作品',
        importedFrom: 'novelDownload',
        wordCount: 567
      },
      expected: { bookRole: 'downloaded', totalWords: 567 }
    },
    {
      folderName: '旧来源作品',
      meta: {
        id: 'legacy-source-book',
        name: '旧来源作品',
        sourceType: 'downloadedNovel',
        metadata: { totalWords: 890 }
      },
      expected: { bookRole: 'downloaded', totalWords: 890 }
    },
    {
      folderName: '旧简介作品',
      meta: {
        id: 'legacy-intro-book',
        name: '旧简介作品',
        intro: '从网络下载',
        bookRole: 'creative'
      },
      expected: { bookRole: 'creative', totalWords: 0 }
    }
  ]
  for (const legacyBook of legacyBooks) {
    const legacyBookDir = join(booksDir, legacyBook.folderName)
    fs.mkdirSync(legacyBookDir, { recursive: true })
    fs.writeFileSync(
      join(legacyBookDir, 'mazi.json'),
      JSON.stringify(legacyBook.meta, null, 2),
      'utf8'
    )
  }

  const books = await readBooksDir(booksDir)
  assert.equal(books.length, legacyBooks.length + 1)
  const lifecycleBook = books.find((book) => book.folderName === '生命周期作品')
  assert.equal(lifecycleBook.chapterCount, 1)
  assert.equal(lifecycleBook.totalWords > 0, true)
  for (const legacyBook of legacyBooks) {
    const migratedBook = books.find((book) => book.folderName === legacyBook.folderName)
    assert.ok(migratedBook)
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(legacyBook.expected).map((key) => [key, migratedBook[key]])
      ),
      legacyBook.expected
    )
    const persistedMeta = JSON.parse(
      fs.readFileSync(join(booksDir, legacyBook.folderName, 'mazi.json'), 'utf8')
    )
    assert.equal(persistedMeta.bookRole, legacyBook.expected.bookRole)
    assert.equal(persistedMeta.totalWords, legacyBook.expected.totalWords)
  }

  const conflict = await createBook({ id: 'conflict-book', name: '冲突作品' }, booksDir)
  assert.equal(conflict.success, true)
  storeDelete('sortOrder:冲突作品')
  storeDelete('chapterSettings:冲突作品')
  assert.equal(getSortOrder('冲突作品'), 'desc')
  assert.deepEqual(setSortOrder({ bookName: '', order: 'asc' }), {
    success: false,
    message: '排序参数无效'
  })
  assert.deepEqual(setSortOrder({ bookName: '冲突作品', order: 'invalid' }), {
    success: false,
    message: '排序参数无效'
  })
  assert.deepEqual(setSortOrder({ bookName: '冲突作品', order: 'asc' }), {
    success: true,
    order: 'asc'
  })
  assert.equal(getSortOrder('冲突作品'), 'asc')
  assert.equal(setChapterTargetWords({ bookName: '', targetWords: 3000 }).success, false)
  assert.equal(
    setChapterTargetWords({ bookName: '冲突作品', targetWords: 'invalid' }).settings.targetWords,
    2000
  )
  assert.equal(
    setChapterTargetWords({ bookName: '冲突作品', targetWords: 3560.4 }).settings.targetWords,
    3560
  )
  assert.equal(getChapterSettings('冲突作品').targetWords, 3560)
  assert.equal((await createVolume('不存在作品', booksDir)).success, false)
  assert.equal(
    (
      await createChapter(
        { bookName: '冲突作品', volumeId: '不存在卷' },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await upsertChapter(
        {
          bookName: '',
          volumeName: '正文',
          chapterName: '第1章',
          content: '不会保存'
        },
        booksDir
      )
    ).success,
    false
  )

  const extraVolume = await createVolume('冲突作品', booksDir)
  assert.equal(extraVolume.success, true)
  const duplicateExtraVolume = await createVolume('冲突作品', booksDir)
  assert.equal(duplicateExtraVolume.volumeName, '新加卷1')
  await upsertChapter(
    {
      bookName: '冲突作品',
      volumeName: extraVolume.volumeName,
      chapterName: '第10章 尾声',
      content: '格式测试正文。'
    },
    booksDir
  )
  await upsertChapter(
    {
      bookName: '冲突作品',
      volumeName: extraVolume.volumeName,
      chapterName: '第11章 转折',
      content: '格式测试正文。'
    },
    booksDir
  )
  await upsertChapter(
    {
      bookName: '冲突作品',
      volumeName: extraVolume.volumeName,
      chapterName: '第20章 终局',
      content: '格式测试正文。'
    },
    booksDir
  )
  fs.writeFileSync(
    join(booksDir, '冲突作品', '正文', extraVolume.volumeName, '序章.txt'),
    '没有章节编号的正文。',
    'utf8'
  )
  const formatted = await updateChapterFormat(
    {
      bookName: '冲突作品',
      settings: { chapterFormat: 'hanzi', suffixType: '回', targetWords: 1800 }
    },
    booksDir
  )
  assert.equal(formatted.success, true)
  assert.equal(formatted.totalRenamed >= 1, true)
  assert.equal(formatted.settings.chapterFormat, 'hanzi')
  assert.equal(
    fs.existsSync(join(booksDir, '冲突作品', '正文', extraVolume.volumeName, '第十回 尾声.txt')),
    true
  )
  assert.equal(
    fs.existsSync(join(booksDir, '冲突作品', '正文', extraVolume.volumeName, '第十一回 转折.txt')),
    true
  )
  assert.equal(
    fs.existsSync(join(booksDir, '冲突作品', '正文', extraVolume.volumeName, '第二十回 终局.txt')),
    true
  )
  const reformatted = await reformatChapterNumbers(
    {
      bookName: '冲突作品',
      volumeName: extraVolume.volumeName,
      settings: { chapterFormat: 'number', suffixType: '章' }
    },
    booksDir
  )
  assert.equal(reformatted.success, true)
  assert.equal(reformatted.totalRenamed, 4)
  assert.equal(
    fs.existsSync(join(booksDir, '冲突作品', '正文', extraVolume.volumeName, '第1章 尾声.txt')),
    true
  )
  assert.equal(
    (await reformatChapterNumbers(
      {
        bookName: '冲突作品',
        volumeName: '不存在卷',
        settings: {}
      },
      booksDir
    )).success,
    false
  )
  assert.equal(
    (await updateChapterFormat(
      { bookName: '不存在作品', settings: {} },
      booksDir
    )).success,
    false
  )
  const coverPath = join(booksDir, '生命周期作品', 'cover.png')
  const conflictRename = await editBook(
    { originalName: '生命周期作品', name: '冲突作品', coverUrl: null },
    booksDir
  )
  assert.equal(conflictRename.success, false)
  assert.match(conflictRename.message, /已存在同名书籍/)
  assert.equal(fs.existsSync(coverPath), true)

  const invalidCover = await editBook(
    {
      originalName: '生命周期作品',
      name: '生命周期作品',
      coverImagePath: `data:image/png;base64,${Buffer.from('invalid').toString('base64')}`
    },
    booksDir
  )
  assert.equal(invalidCover.success, false)
  assert.equal(fs.existsSync(coverPath), true)

  const missingSave = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '不存在',
      content: '内容'
    },
    booksDir
  )
  assert.equal(missingSave.success, false)
  assert.match(missingSave.message, /章节不存在/)
  assert.equal(
    (
      await checkChapterExists(
        { bookName: '生命周期作品', volumeName: '正文', chapterName: '' },
        booksDir
      )
    ).success,
    false
  )
  assert.deepEqual(
    await checkChapterExists(
      { bookName: '生命周期作品', volumeName: '正文', chapterName: '第1章' },
      booksDir
    ),
    { success: true, exists: true }
  )
  assert.deepEqual(
    await checkChapterExists(
      { bookName: '生命周期作品', volumeName: '正文', chapterName: '不存在' },
      booksDir
    ),
    { success: true, exists: false }
  )
  await assert.rejects(
    () =>
      saveChapter(
        {
          bookName: '生命周期作品',
          volumeName: '正文',
          chapterName: '../越界',
          content: '内容'
        },
        booksDir
      ),
    /章节名称/
  )
  await assert.rejects(
    () =>
      readChapter(
        {
          bookName: '生命周期作品',
          volumeName: '正文',
          chapterName: '..\\越界'
        },
        booksDir
      ),
    /章节名称/
  )

  const blockedEmptySave = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第1章',
      content: ''
    },
    booksDir
  )
  assert.equal(blockedEmptySave.success, false)
  assert.equal(
    fs.readFileSync(join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'), 'utf8'),
    '第一章正文'
  )

  await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '第二章正文'
    },
    booksDir
  )
  const renameConflict = await saveChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第1章',
      newName: '第2章',
      content: '不能写入'
    },
    booksDir
  )
  assert.equal(renameConflict.success, false)
  assert.equal(
    fs.readFileSync(join(booksDir, '生命周期作品', '正文', '正文', '第1章.txt'), 'utf8'),
    '第一章正文'
  )

  const duplicateUpsert = await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '不应覆盖'
    },
    booksDir
  )
  assert.equal(duplicateUpsert.success, false)
  assert.equal(duplicateUpsert.exists, true)

  const overwritten = await upsertChapter(
    {
      bookName: '生命周期作品',
      volumeName: '正文',
      chapterName: '第2章',
      content: '允许覆盖',
      overwrite: true
    },
    booksDir
  )
  assert.equal(overwritten.success, true)
  assert.equal(overwritten.exists, true)

  const autoChapter = await createChapter(
    { bookName: '生命周期作品', volumeId: '正文' },
    booksDir
  )
  assert.equal(autoChapter.success, true)
  assert.equal(autoChapter.chapterName, '第3章')

  const chapterTree = await loadChapters('生命周期作品', booksDir)
  assert.equal(chapterTree.success, true)
  assert.deepEqual(
    chapterTree.chapters[0].children.map((chapter) => chapter.name),
    ['第1章', '第2章', '第3章']
  )

  const chapter = await readChapter(
    { bookName: '生命周期作品', volumeName: '正文', chapterName: '第2章' },
    booksDir
  )
  assert.equal(chapter.success, true)
  assert.equal(chapter.content, '允许覆盖')
  assert.equal(
    (
      await readChapter(
        { bookName: '生命周期作品', volumeName: '正文', chapterName: '不存在章节' },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await editNode(
        {
          bookName: '生命周期作品',
          type: 'unknown',
          volume: '正文',
          chapter: '第1章',
          newName: '新名称'
        },
        booksDir
      )
    ).message,
    '类型错误'
  )
  assert.equal(
    (
      await editNode(
        {
          bookName: '生命周期作品',
          type: 'volume',
          volume: '不存在卷',
          newName: '新卷'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await deleteNode(
        {
          bookName: '生命周期作品',
          type: 'unknown',
          volume: '正文'
        },
        booksDir
      )
    ).message,
    '类型错误'
  )

  const renamedChapter = await editNode(
    {
      bookName: '生命周期作品',
      type: 'chapter',
      volume: '正文',
      chapter: '第2章',
      newName: '第2章 新标题'
    },
    booksDir
  )
  assert.equal(renamedChapter.success, true)
  assert.equal(
    (
      await readChapter(
        {
          bookName: '生命周期作品',
          volumeName: '正文',
          chapterName: '第2章 新标题'
        },
        booksDir
      )
    ).content,
    '允许覆盖'
  )
  assert.equal(
    (
      await editNode(
        {
          bookName: '生命周期作品',
          type: 'chapter',
          volume: '正文',
          chapter: '第2章 新标题',
          newName: '第1章'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await editNode(
        {
          bookName: '生命周期作品',
          type: 'chapter',
          volume: '正文',
          chapter: '第2章 新标题',
          newName: '../越界'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await deleteNode(
        {
          bookName: '生命周期作品',
          type: 'chapter',
          volume: '正文',
          chapter: '第2章 新标题'
        },
        booksDir
      )
    ).success,
    true
  )
  assert.equal(
    (
      await deleteNode(
        {
          bookName: '生命周期作品',
          type: 'chapter',
          volume: '正文',
          chapter: '第2章 新标题'
        },
        booksDir
      )
    ).success,
    false
  )

  assert.deepEqual(await loadNotes('', booksDir), {
    success: false,
    message: '书籍名称不能为空',
    notes: []
  })
  assert.deepEqual(await loadNotes('生命周期作品', ''), {
    success: false,
    message: '请先选择书库目录',
    bookName: '生命周期作品',
    notes: []
  })
  assert.equal(
    (
      await deleteNotebook(
        { bookName: '生命周期作品', notebookName: '不存在笔记本' },
        booksDir
      )
    ).success,
    false
  )
  assert.equal((await createNotebook({ bookName: '不存在作品' }, booksDir)).success, false)
  const notebook = await createNotebook({ bookName: '生命周期作品' }, booksDir)
  assert.equal(notebook.success, true)
  const duplicateNotebook = await createNotebook({ bookName: '生命周期作品' }, booksDir)
  assert.equal(duplicateNotebook.notebookName, '新建笔记本1')
  assert.equal(
    (
      await renameNotebook({
        bookName: '生命周期作品',
        oldName: '不存在笔记本',
        newName: '新名称'
      }, booksDir)
    ).success,
    false
  )
  assert.equal(
    (
      await renameNotebook({
        bookName: '生命周期作品',
        oldName: duplicateNotebook.notebookName,
        newName: duplicateNotebook.notebookName
      }, booksDir)
    ).message,
    '名称未变化'
  )
  const note = await createNote(
    {
      bookName: '生命周期作品',
      notebookName: notebook.notebookName,
      noteName: '人物线索'
    },
    booksDir
  )
  assert.equal(note.noteName, '人物线索')
  const duplicateNote = await createNote(
    {
      bookName: '生命周期作品',
      notebookName: notebook.notebookName,
      noteName: '人物线索'
    },
    booksDir
  )
  assert.equal(duplicateNote.noteName, '人物线索1')
  assert.equal(
    (
      await createNote(
        {
          bookName: '生命周期作品',
          notebookName: '不存在笔记本',
          noteName: '不会创建'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await readNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '不存在笔记'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await editNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '不存在笔记',
          content: '不会保存'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await deleteNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '不存在笔记'
        },
        booksDir
      )
    ).success,
    false
  )
  await assert.rejects(
    () =>
      createNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '../越界'
        },
        booksDir
      ),
    /笔记名称/
  )
  assert.equal(
    (
      await editNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '人物线索',
          newName: '伏笔记录',
          content: '主角在雨夜拾到旧钥匙。'
        },
        booksDir
      )
    ).success,
    true
  )
  assert.equal(
    (
      await editNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '伏笔记录',
          content: null
        },
        booksDir
      )
    ).success,
    true
  )
  assert.equal(
    (
      await readNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '伏笔记录'
        },
        booksDir
    )
    ).content,
    ''
  )
  assert.equal(
    (
      await renameNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          oldName: '伏笔记录',
          newName: '人物线索1'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await renameNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          oldName: '不存在笔记',
          newName: '新名称'
        },
        booksDir
      )
    ).success,
    false
  )
  assert.equal(
    (
      await renameNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          oldName: '伏笔记录',
          newName: '伏笔记录'
        },
        booksDir
      )
    ).message,
    '名称未变化'
  )
  assert.equal(
    (
      await renameNotebook(
        {
          bookName: '生命周期作品',
          oldName: notebook.notebookName,
          newName: duplicateNotebook.notebookName
        },
        booksDir
      )
    ).success,
    false
  )
  const notes = await loadNotes('生命周期作品', booksDir)
  assert.equal(notes.success, true)
  assert.equal(notes.notes.some((item) => item.name === notebook.notebookName), true)
  assert.equal(notes.notes.some((item) => item.name === duplicateNotebook.notebookName), true)
  assert.equal(
    (
      await deleteNote(
        {
          bookName: '生命周期作品',
          notebookName: notebook.notebookName,
          noteName: '伏笔记录'
        },
        booksDir
      )
    ).success,
    true
  )
  assert.equal(
    (
      await deleteNotebook(
        { bookName: '生命周期作品', notebookName: notebook.notebookName },
        booksDir
      )
    ).success,
    true
  )

  assert.equal(
    (await exportOrganizationToNote(
      { bookName: '', organizationName: '山门', content: '内容' },
      booksDir
    )).message,
    '参数不完整'
  )
  assert.equal(
    (await exportOrganizationToNote(
      { bookName: '不存在作品', organizationName: '山门', content: '内容' },
      booksDir
    )).message,
    '书籍不存在'
  )
  const exportedOrganization = await exportOrganizationToNote(
    {
      bookName: '生命周期作品',
      organizationName: '山门/外院',
      content: '掌门与长老。'
    },
    booksDir
  )
  assert.equal(exportedOrganization.success, true)
  assert.equal(exportedOrganization.noteName, '山门_外院')
  assert.equal(fs.readFileSync(exportedOrganization.notePath, 'utf8'), '掌门与长老。')

  assert.equal((await deleteBook('', booksDir)).success, false)
  const missingDelete = await deleteBook('不存在作品', booksDir)
  assert.equal(missingDelete.success, false)
  assert.equal(missingDelete.existed, false)
  const deleted = await deleteBook('生命周期作品', booksDir)
  assert.equal(deleted.success, true)
  assert.equal(fs.existsSync(join(booksDir, '生命周期作品')), false)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 书籍生命周期测试通过')

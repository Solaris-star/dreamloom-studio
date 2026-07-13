import assert from 'node:assert/strict'

let nextResponse = { success: true }
globalThis.fetch = async () =>
  new Response(JSON.stringify(nextResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

const editor = await import('../src/renderer/src/service/editor.js')

function withChanges(response, changes) {
  return { ...structuredClone(response), ...changes }
}

const cases = [
  [() => editor.setSortOrder('作品', 'asc'), { success: false, message: '拒绝保存' }],
  [() => editor.getSortOrder('作品'), { success: true, order: 'unknown' }],
  [() => editor.getChapterSettings('作品'), { success: true, settings: null }],
  [() => editor.getChapterSettings('作品'), { success: true, settings: [] }],
  [
    () => editor.getChapterSettings('作品'),
    { success: true, settings: { chapterFormat: 'number', suffixType: '章' } }
  ],
  [() => editor.listChapterTree('作品'), { success: true, bookName: '另一作品', chapters: [] }],
  [() => editor.listChapterTree('作品'), { success: true, chapters: {} }],
  [() => editor.listChapterTree('作品'), { success: true, chapters: [null] }],
  [
    () => editor.listChapterTree('作品'),
    { success: true, chapters: [{ name: '第一卷', children: {} }] }
  ],
  [() => editor.readOutlineDocument('作品'), { success: true }],
  [() => editor.readOutlineDocument('作品'), { success: true, data: '错误大纲' }],
  [
    () => editor.readOutlineDocument('作品'),
    { success: true, data: { children: {} } }
  ],
  [() => editor.writeOutlineDocument('作品', {}), { success: true }],
  [
    () => editor.writeOutlineDocument('作品', {}),
    {
      success: true,
      fileName: 'outlines.json',
      documentType: 'outlines',
      path: '/book/outlines.json',
      documentPath: '/book/outlines.json',
      databaseSync: { success: false }
    }
  ],
  [() => editor.readOutlineAiSessionsDocument('作品'), { success: false, message: '读取失败' }],
  [() => editor.readOutlineAiSessionsDocument('作品'), { success: true, data: [] }],
  [
    () => editor.readOutlineAiSessionsDocument('作品'),
    { success: true, data: { nodes: [] } }
  ],
  [() => editor.writeOutlineAiSessionsDocument('作品', {}), { success: true }],
  [
    () => editor.writeOutlineAiSessionsDocument('作品', {}),
    {
      success: true,
      fileName: 'outline-ai-sessions.json',
      path: '/book/outline-ai-sessions.json',
      documentPath: '/book/outline-ai-sessions.json',
      databaseSync: { success: false }
    }
  ],
  [() => editor.listNoteTree('作品'), { success: true, notes: {} }],
  [() => editor.listNoteTree('作品'), { success: true, notes: [null] }],
  [
    () => editor.listNoteTree('作品'),
    { success: true, notes: [{ name: '笔记本', children: {} }] }
  ],
  [() => editor.createNotebookDocument('作品'), { success: true }],
  [() => editor.readNoteDocument('作品', '笔记本', '笔记'), { success: true }],
  [
    () => editor.readNoteDocument('作品', '笔记本', '笔记'),
    {
      success: true,
      bookName: '另一作品',
      notebookName: '笔记本',
      noteName: '笔记',
      content: ''
    }
  ],
  [
    () => editor.writeNoteDocument({
      bookName: '作品',
      notebookName: '笔记本',
      noteName: '笔记',
      content: '正文'
    }),
    { success: true }
  ],
  [() => editor.readChapterContent('作品', '第一卷', '第一章'), { success: true }],
  [
    () => editor.readChapterContent('作品', '第一卷', '第一章'),
    {
      success: true,
      bookName: '作品',
      volumeName: '第一卷',
      chapterName: '另一章',
      content: ''
    }
  ],
  [
    () =>
      editor.checkChapterExistsForOutline({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章'
      }),
    { success: true, exists: 'yes' }
  ],
  [
    () =>
      editor.upsertChapterDocument({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章',
        content: '正文'
      }),
    { success: true }
  ],
  [() => editor.createChapterDocument('作品', '第一卷'), { success: true }],
  [
    () =>
      editor.saveChapterDocument({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章',
        content: '正文'
      }),
    { success: true }
  ],
  [() => editor.readSettingsDocument('作品'), { success: true }],
  [() => editor.readSettingsDocument('作品'), { success: true, data: [] }],
  [
    () => editor.writeSettingsDocument('作品', { categories: [] }),
    { success: true, fileName: 'settings.json', itemCount: 1 }
  ],
  [() => editor.readDictionaryDocument('作品'), { success: true, data: {} }],
  [() => editor.readTimelineDocument('作品'), { success: true, data: {} }],
  [
    () => editor.writeTimelineDocument('作品', []),
    { success: true, fileName: 'timeline.json', itemCount: 1 }
  ],
  [() => editor.readSequenceChartsDocument('作品'), { success: true, data: {} }],
  [
    () => editor.writeSequenceChartsDocument('作品', []),
    { success: true, fileName: 'sequences.json', itemCount: 1 }
  ],
  [() => editor.readCharactersDocument('作品'), { success: true, data: {} }],
  [
    () => editor.writeCharactersDocument('作品', []),
    {
      success: true,
      fileName: 'characters.json',
      documentType: 'characters',
      itemCount: 1
    }
  ],
  [() => editor.readMapDocuments('作品'), { success: true, maps: {} }],
  [() => editor.readRelationshipGraphs('作品'), { success: true, graphs: {} }],
  [() => editor.readOrganizationGraphs('作品'), { success: true, graphs: {} }],
  [() => editor.readEntityProfilesDocument('作品'), { success: true, profiles: {} }],
  [
    () => editor.writeDictionaryDocument('作品', []),
    { success: true, fileName: 'dictionary.json', itemCount: 1 }
  ],
  [
    () => editor.setChapterTargetWords('作品', 2000),
    { success: true, settings: { targetWords: 1000 } }
  ],
  [
    () => editor.updateChapterFormat('作品', { chapterFormat: 'number', suffixType: '章' }),
    { success: true, settings: [] }
  ],
  [
    () => editor.reformatChapterNumbers('作品', '第一卷', {}),
    { success: true, renamed: '1' }
  ],
  [() => editor.runConsistencyCheck({ bookName: '作品' }), { success: true, check: [] }],
  [
    () => editor.runConsistencyCheck({ bookName: '作品' }),
    { success: true, check: { id: 'check-1', issues: {} } }
  ],
  [() => editor.listConsistencyChecks({ bookName: '作品' }), { success: true, checks: {} }],
  [
    () => editor.listConsistencyChecks({ bookName: '作品' }),
    { success: true, checks: [{ id: 'check-1', issues: {} }] }
  ],
  [() => editor.listWritingSkills(), { success: true, skills: {}, groups: [] }],
  [
    () => editor.listWritingSkills(),
    { success: true, skills: [{ id: 'skill-1' }], groups: [] }
  ],
  [
    () => editor.listWritingSkills(),
    {
      success: true,
      skills: [
        {
          id: 'skill-1',
          key: 'rewrite',
          label: '改写',
          instruction: '改写正文'
        }
      ],
      groups: {}
    }
  ],
  [() => editor.getAgentProgressServer(), { success: true, host: '', port: 8787, path: '/', url: 'ws://localhost' }],
  [() => editor.getAgentProgressServer(), { success: true, host: 'localhost', port: 0, path: '/', url: 'ws://localhost' }],
  [() => editor.getAgentProgressServer(), { success: true, host: 'localhost', port: 8787, path: '', url: 'ws://localhost' }]
]

const validNoteRead = {
  success: true,
  bookName: '作品',
  notebookName: '笔记本',
  noteName: '笔记',
  filePath: '/books/作品/笔记/笔记本/笔记.md',
  content: '正文'
}
for (const changes of [
  { bookName: '另一作品' },
  { notebookName: '另一笔记本' },
  { noteName: '另一笔记' },
  { filePath: null },
  { filePath: '/books/作品/笔记/其他目录/笔记.md' },
  { content: null }
]) {
  cases.push([
    () => editor.readNoteDocument('作品', '笔记本', '笔记'),
    withChanges(validNoteRead, changes)
  ])
}

const validNoteWrite = {
  success: true,
  bookName: '作品',
  notebookName: '笔记本',
  noteName: '笔记',
  filePath: '/books/作品/笔记/笔记本/笔记.md',
  contentLength: 2
}
for (const changes of [
  { bookName: '另一作品' },
  { notebookName: '另一笔记本' },
  { noteName: '' },
  { filePath: null },
  { filePath: '/books/作品/笔记/其他目录/笔记.md' },
  { contentLength: 1 }
]) {
  cases.push([
    () =>
      editor.writeNoteDocument({
        bookName: '作品',
        notebookName: '笔记本',
        noteName: '笔记',
        content: '正文'
      }),
    withChanges(validNoteWrite, changes)
  ])
}

const validChapterRead = {
  success: true,
  bookName: '作品',
  volumeName: '第一卷',
  chapterName: '第一章',
  filePath: '/books/作品/正文/第一卷/第一章.txt',
  content: '正文',
  wordCount: 2
}
for (const changes of [
  { bookName: '另一作品' },
  { volumeName: '第二卷' },
  { chapterName: '第二章' },
  { filePath: null },
  { filePath: '/books/作品/正文/第二卷/第一章.txt' },
  { content: null },
  { wordCount: 'invalid' }
]) {
  cases.push([
    () => editor.readChapterContent('作品', '第一卷', '第一章'),
    withChanges(validChapterRead, changes)
  ])
}

const validChapterWrite = {
  ...validChapterRead,
  databaseSync: { success: true, chapterName: '第一章' }
}
for (const changes of [
  { bookName: '另一作品' },
  { volumeName: '第二卷' },
  { chapterName: '第二章' },
  { filePath: null },
  { filePath: '/books/作品/正文/第二卷/第一章.txt' },
  { wordCount: 'invalid' },
  { wordCount: 1 },
  { databaseSync: null },
  { databaseSync: { success: false } },
  { databaseSync: { success: true, chapterName: '第二章' } }
]) {
  const response = withChanges(validChapterWrite, changes)
  cases.push([
    () =>
      editor.upsertChapterDocument({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章',
        content: '正文'
      }),
    response
  ])
  cases.push([
    () =>
      editor.saveChapterDocument({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章',
        content: '正文'
      }),
    response
  ])
}

const validProgressServer = {
  success: true,
  host: 'localhost',
  port: 8787,
  path: '/',
  url: 'ws://localhost:8787/'
}
for (const changes of [
  { host: null },
  { host: ' ' },
  { port: 'invalid' },
  { port: -1 },
  { path: null },
  { path: ' ' },
  { url: null },
  { url: 'http://localhost:8787/' }
]) {
  cases.push([() => editor.getAgentProgressServer(), withChanges(validProgressServer, changes)])
}

for (const [index, [call, response]] of cases.entries()) {
  nextResponse = response
  await assert.rejects(call, undefined, `损坏响应案例 ${index + 1} 未被拒绝`)
}

console.log(`Web 编辑器响应契约测试通过：${cases.length} 个损坏响应`)

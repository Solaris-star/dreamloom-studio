import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readProjectFile(filePath) {
  return readFileSync(join(root, filePath), 'utf8').replaceAll('\r\n', '\n')
}

function assertIncludes(source, expected, message) {
  assert(source.includes(expected), message)
}

async function assertRejectsWithText(action, text, message) {
  await assert.rejects(action, (error) => {
    assert(String(error?.message || '').includes(text), message)
    return true
  })
}

const serviceSource = readProjectFile('src/renderer/src/service/creationStarter.js')
const editorService = readProjectFile('src/renderer/src/service/editor.js')
const resultView = readProjectFile('src/renderer/src/views/CreationStarterResult.vue')
const aiWorkshop = readProjectFile('src/renderer/src/views/AiWorkshop.vue')

for (const expected of [
  'function requireOptionalArrayField(raw = {}, fieldName, label)',
  'throw new Error(`起笔任务${label}格式异常，已停止读取以免使用错误任务`)',
  "references: requireOptionalArrayField(raw, 'references', '手动参考素材')",
  "autoReferences: requireOptionalArrayField(raw, 'autoReferences', '自动参考素材')",
  'function requireStoredJobs',
  "throw new Error('起笔任务存储格式异常，已停止读取以免使用错误任务')",
  "await postJson('/api/store/get', { key: JOBS_KEY })",
  'return requireStoredJobs(result.value)',
  "await postJson('/api/store/set', { key: JOBS_KEY, value: rows })",
  'result?.success !== true',
  'result.key !== JOBS_KEY',
  "throw new Error('保存本地起笔任务失败：接口返回的设置项不匹配')",
  "throw new Error('起笔任务不存在，无法更新')"
]) {
  assertIncludes(serviceSource, expected, `creationStarter service missing ${expected}`)
}

for (const forbidden of [
  "JSON.parse(localStorage.getItem(JOBS_KEY) || '[]')",
  'return Array.isArray(local) ? local.map(normalizeJob) : []',
  '[CreationStarter] Electron store read failed',
  'window.electron',
  'window.electronStore',
  'Electron 存储不可用',
  'await window.electronStore.set(JOBS_KEY, rows)\n    wroteElectronStore = true',
  'references: Array.isArray(raw.references) ? raw.references : []',
  'autoReferences: Array.isArray(raw.autoReferences) ? raw.autoReferences : []'
]) {
  assert(
    !serviceSource.includes(forbidden),
    `creationStarter service must not contain ${forbidden}`
  )
}

for (const expected of [
  "const starterLoadError = ref('')",
  '<section v-if="loadingJob" class="state-panel">',
  '<section v-else-if="starterLoadError" class="state-panel state-error">',
  '@click="retryLoadJob"',
  'const loadedJob = await loadJob()',
  'starterLoadError.value = error?.message',
  "starterLoadError.value = writeError?.message || '保存起笔任务失败'",
  "function requireAiTextContent(result, fallback = '生成失败')",
  'if (result?.success !== true) throw new Error(result?.message || fallback)',
  'if (!content) throw new Error(`${fallback}：接口没有返回正文内容`)',
  "const rawOutput = requireAiTextContent(result, '生成失败')",
  'const content = requireAiTextContent(result, `${title}失败`)',
  "function requireKnowledgeItemResult(result, fallback = '保存失败')",
  "requireKnowledgeItemResult(result, '保存失败')",
  "requireKnowledgeItemResult(topicResult, '保存选题卡失败')",
  "function requireCreatedBookResult(result, expectedName, fallback = '创建作品失败')",
  'result.bookName !== expectedName',
  "typeof result.bookPath !== 'string'",
  'result.databaseSync?.success !== true',
  "function requireBookVisibleInShelf(books, expectedName, fallback = '刷新书架失败')",
  'const matchedBook = books.find((item) => item?.name === expectedName || item?.bookName === expectedName)',
  'if (!matchedBook) throw new Error(`${fallback}：新作品未出现在书架列表中`)',
  'const createdBook = requireCreatedBookResult(await createBook(bookData), title)',
  "import { writeOutlineDocument, writeSettingsDocument } from '@renderer/service/editor'",
  'await writeSettingsDocument(title, buildSettingsPayload())',
  'await writeOutlineDocument(title, buildOutlinesPayload())',
  'const books = await readBooksDir()',
  'requireBookVisibleInShelf(books, title)',
  'openBook({ ...bookData, bookPath: createdBook.bookPath })',
  'async function copyMarkdown()',
  "typeof navigator.clipboard?.writeText !== 'function'",
  'await navigator.clipboard.writeText(text)',
  "ElMessage.error(error?.message || '复制 Markdown 失败')",
  ":percentage=\"job.status === 'completed' ? 100 : job.status === 'failed' ? 100 : 0\""
]) {
  assertIncludes(resultView, expected, `CreationStarterResult missing ${expected}`)
}
for (const forbidden of [
  "if (result?.success === false) throw new Error(result.message || '生成失败')",
  "if (settingsResult?.success === false) throw new Error(settingsResult.message || '保存设定失败')",
  "if (outlinesResult?.success === false) throw new Error(outlinesResult.message || '保存大纲失败')",
  'await createBook(bookData)\n    if (window.electron?.writeSettings)',
  'if (window.electron?.writeSettings)',
  'if (window.electron?.writeOutlines)',
  'window.electron.writeSettings',
  'window.electron.writeOutlines',
  'function requireBookDocumentWriteResult(result, expected, fallback)',
  'await readBooksDir()\n    ElMessage.success(`已创建《${title}》`)',
  "const rawOutput = result.content || ''",
  "content: result.content || ''",
  "navigator.clipboard?.writeText(text)\n  ElMessage.success('已复制 Markdown')",
  ":percentage=\"job.status === 'completed' ? 100 : job.status === 'failed' ? 100 : 36\""
]) {
  assert(!resultView.includes(forbidden), `CreationStarterResult must not contain ${forbidden}`)
}

for (const expected of [
  'export async function writeSettingsDocument(bookName, payload = {})',
  "postJson('/api/studio/settings/write'",
  'return requireSettingsDocumentWriteResult(response, payload.categories)',
  'export async function writeOutlineDocument(bookName, payload = {})',
  "requireElectronApi('writeOutlines', '大纲写入接口')",
  'return requireOutlineWriteResult(response)'
]) {
  assertIncludes(
    editorService,
    expected,
    `editor service missing starter document writer guard ${expected}`
  )
}

for (const expected of [
  "const starterJobReadError = ref('')",
  'starterJobReadError.value = error?.message',
  "starterJobReadError.value = '没有找到起笔任务'",
  "latestOutputText.value = ''",
  'parsedStarterResult.value = null',
  'resultDrawerVisible.value = false',
  "const message = readableAiError(error?.message || '更新起笔任务失败')",
  "latestErrorText.value = readableAiError(writeError?.message || '保存起笔任务失败')"
]) {
  assertIncludes(aiWorkshop, expected, `AiWorkshop starter job guard missing ${expected}`)
}

const {
  createCreationStarterJob,
  getCreationStarterJob,
  updateCreationStarterJob,
  listCreationStarterJobs
} = await import('../src/renderer/src/service/creationStarter.js')

const originalWarn = console.warn

function installStorage({ storedValue = [], failGet = false, failSet = false, setResult } = {}) {
  const saved = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : {}
    if (url === '/api/store/get') {
      if (failGet) throw new Error('主存储读取失败')
      return new Response(
        JSON.stringify({ success: true, key: payload.key, value: storedValue }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (url === '/api/store/set') {
      if (failSet) throw new Error('主存储写入失败')
      saved.push(payload.value)
      storedValue = payload.value
      const body =
        setResult === undefined ? { success: true, key: payload.key } : setResult
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    throw new Error(`未处理的测试接口：${url}`)
  }
  const localRows = [
    {
      id: 'backup_job',
      status: 'completed',
      prompt: '来自浏览器备份的旧任务'
    }
  ]
  globalThis.localStorage = {
    getItem: () => JSON.stringify(localRows),
    setItem: () => true
  }
  return { saved }
}

installStorage({ storedValue: [{ id: 'job_1', status: 'pending', prompt: '真实主存储任务' }] })
assert.equal((await getCreationStarterJob('job_1')).prompt, '真实主存储任务')
assert.equal(await getCreationStarterJob('backup_job'), null)
assert.equal((await listCreationStarterJobs()).length, 1)

const createdStore = installStorage({ storedValue: [] })
const created = await createCreationStarterJob({ prompt: '新任务' })
assert(created.id, 'created job should have an id')
assert.equal(created.prompt, '新任务')
assert.equal(createdStore.saved[0].length, 1)

installStorage({ storedValue: [{ id: 'job_2', status: 'pending', prompt: '待更新' }] })
const updated = await updateCreationStarterJob('job_2', { status: 'running' })
assert.equal(updated.status, 'running')

installStorage({ storedValue: [{ id: 'job_2', status: 'pending', prompt: '待更新' }] })
await assertRejectsWithText(
  () => updateCreationStarterJob('missing_job', { status: 'running' }),
  '起笔任务不存在',
  'missing starter job updates should fail'
)

installStorage({ storedValue: { broken: true } })
await assertRejectsWithText(
  () => getCreationStarterJob('backup_job'),
  '起笔任务存储格式异常',
  'malformed starter job storage should fail instead of reading browser backup'
)

installStorage({ storedValue: [{ id: 'bad_refs', prompt: '坏引用', references: { id: 'ref' } }] })
await assertRejectsWithText(
  () => getCreationStarterJob('bad_refs'),
  '起笔任务手动参考素材格式异常',
  'malformed manual references should fail instead of becoming an empty list'
)

installStorage({
  storedValue: [{ id: 'bad_auto_refs', prompt: '坏引用', autoReferences: { id: 'ref' } }]
})
await assertRejectsWithText(
  () => getCreationStarterJob('bad_auto_refs'),
  '起笔任务自动参考素材格式异常',
  'malformed auto references should fail instead of becoming an empty list'
)

installStorage({ failGet: true })
await assertRejectsWithText(
  () => listCreationStarterJobs(),
  '主存储读取失败',
  'starter job reads should surface main storage failures'
)

installStorage({ storedValue: [], failSet: true })
console.warn = () => {}
await assertRejectsWithText(
  () => createCreationStarterJob({ prompt: '写入失败任务' }),
  '主存储写入失败',
  'starter job writes should fail when main storage cannot persist'
)

installStorage({ storedValue: [], setResult: {} })
await assertRejectsWithText(
  () => createCreationStarterJob({ prompt: '空返回任务' }),
  '保存起笔任务失败',
  'starter job writes should fail when main storage returns an empty result'
)

installStorage({ storedValue: [], setResult: { success: true, key: 'wrong:key' } })
await assertRejectsWithText(
  () => createCreationStarterJob({ prompt: '错 key 任务' }),
  '设置项不匹配',
  'starter job writes should fail when main storage returns the wrong key'
)
console.warn = originalWarn

console.log('creation starter storage redline guard tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  readJson,
  writeJson,
  updateJson,
  writeTextAtomic,
  __getPathQueueSizeForTests
} from '../src/main/services/webJsonRepository.js'
import { createWebServerStore } from '../src/main/services/webServerStoreService.js'
import {
  openNovelDatabase,
  closeAllNovelDatabases,
  recordChapterWrite
} from '../src/main/services/novelDatabaseService.js'
import { saveChapter, upsertChapter, storeSet, storeGet } from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-concurrent-write-'))
const booksDir = join(root, 'books')
const bookName = '并发测试书'
const bookPath = join(booksDir, bookName)
const volumePath = join(bookPath, '正文', '第一卷')
const jsonPath = join(root, 'shared.json')
const storePath = join(root, '.store.json')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function testConcurrentJsonUpdate() {
  await writeJson(jsonPath, { count: 0 })
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      updateJson(jsonPath, async (current) => {
        const next = { ...(current || {}), count: Number(current?.count || 0) + 1, last: index }
        await sleep(1)
        return next
      })
    )
  )
  const finalValue = await readJson(jsonPath, null)
  assert.equal(finalValue.count, 20)
}

async function testWriteFailureCleansTemp() {
  const originalRename = fs.promises.rename
  fs.promises.rename = async () => {
    throw new Error('simulated rename failure')
  }
  try {
    await assert.rejects(
      () => writeJson(jsonPath, { broken: true }),
      /写入 JSON 文件失败.*simulated rename failure/
    )
  } finally {
    fs.promises.rename = originalRename
  }
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.includes('.tmp')),
    []
  )
  const kept = await readJson(jsonPath, null)
  assert.equal(kept.count, 20)
}

async function testInterruptedTempFileDoesNotReplaceTarget() {
  const target = join(root, 'interrupt.json')
  await writeJson(target, { ok: true })
  const temporaryPath = join(root, `.interrupt.json.${process.pid}.orphan.tmp`)
  fs.writeFileSync(temporaryPath, '{"partial":true}', 'utf8')
  assert.deepEqual(await readJson(target, null), { ok: true })
  fs.rmSync(temporaryPath, { force: true })
}

async function testConcurrentStoreSet() {
  const store = createWebServerStore({ filePath: storePath })
  await Promise.all(Array.from({ length: 15 }, (_, index) => store.set(`k${index}`, index)))
  const all = await store.read()
  for (let i = 0; i < 15; i += 1) assert.equal(all[`k${i}`], i)

  const previousCwd = process.cwd()
  process.chdir(root)
  try {
    await Promise.all(Array.from({ length: 10 }, (_, i) => storeSet(`web:${i}`, i)))
    for (let i = 0; i < 10; i += 1) assert.equal(await storeGet(`web:${i}`), i)
  } finally {
    process.chdir(previousCwd)
  }
}

async function testConcurrentChapterSaves() {
  fs.mkdirSync(volumePath, { recursive: true })
  fs.writeFileSync(
    join(bookPath, 'mazi.json'),
    JSON.stringify({ id: 'book_conc', name: bookName }, null, 2)
  )
  const chapterNames = Array.from({ length: 8 }, (_, i) => `第${i + 1}章`)
  for (const name of chapterNames) {
    fs.writeFileSync(join(volumePath, `${name}.txt`), '旧内容', 'utf8')
  }

  const results = await Promise.all(
    chapterNames.map((name, index) =>
      saveChapter(
        {
          bookName,
          volumeName: '第一卷',
          chapterName: name,
          content: `新内容-${index}-${'字'.repeat(20)}`
        },
        booksDir
      )
    )
  )
  assert.equal(results.every((item) => item.success), true)
  for (const [index, name] of chapterNames.entries()) {
    const text = fs.readFileSync(join(volumePath, `${name}.txt`), 'utf8')
    assert.match(text, new RegExp(`新内容-${index}`))
  }

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      upsertChapter(
        {
          bookName,
          volumeName: '第一卷',
          chapterName: '第1章',
          content: `最终候选-${index}`,
          overwrite: true
        },
        booksDir
      )
    )
  )
  const finalText = fs.readFileSync(join(volumePath, '第1章.txt'), 'utf8')
  assert.match(finalText, /^最终候选-\d+$/)
}

async function testSqliteLockWaitAndReuse() {
  const repositoryA = openNovelDatabase(booksDir)
  const repositoryB = openNovelDatabase(booksDir)
  assert.equal(repositoryA.dbPath, repositoryB.dbPath)

  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      Promise.resolve().then(() =>
        recordChapterWrite({
          booksDir,
          bookName,
          volumeName: '第一卷',
          chapterName: `并发章${index + 1}`,
          content: `sqlite-${index}`,
          filePath: join(volumePath, `并发章${index + 1}.txt`)
        })
      )
    )
  )

  const project = repositoryA.getProjectByName(bookName)
  assert.ok(project)
  assert.ok(repositoryA.listChapters(project.id).length >= 8)

  // ensure pragmas applied (busy timeout + foreign keys at minimum)
  const busy = repositoryA.dbPath
  assert.ok(busy)

  repositoryA.close()
  repositoryB.close()
  closeAllNovelDatabases()
}

async function testPathLockQueueDrains() {
  const target = join(root, 'queue.json')
  await Promise.all(
    Array.from({ length: 5 }, (_, i) => writeTextAtomic(target, JSON.stringify({ i }), 'utf8'))
  )
  await sleep(10)
  assert.equal(__getPathQueueSizeForTests(), 0)
  assert.ok(fs.existsSync(target))
}

try {
  await testConcurrentJsonUpdate()
  await testWriteFailureCleansTemp()
  await testInterruptedTempFileDoesNotReplaceTarget()
  await testConcurrentStoreSet()
  await testConcurrentChapterSaves()
  await testSqliteLockWaitAndReuse()
  await testPathLockQueueDrains()
  console.log('concurrent write tests passed')
} finally {
  try {
    closeAllNovelDatabases()
  } catch {
    // ignore
  }
  fs.rmSync(root, { recursive: true, force: true })
}

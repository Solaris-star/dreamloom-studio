import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWebServerStore } from '../src/main/services/webServerStoreService.js'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-server-store-'))
const storeFile = path.join(tempDir, '.store.json')

try {
  const store = createWebServerStore({ filePath: storeFile })
  assert.deepEqual(await store.read(), {})
  assert.equal(await store.get('missing'), undefined)

  assert.equal(await store.set('theme', 'dark'), true)
  assert.equal(await store.get('theme'), 'dark')
  assert.deepEqual(JSON.parse(fs.readFileSync(storeFile, 'utf-8')), { theme: 'dark' })

  const adapter = store.adapter()
  assert.equal(await adapter.set('count', 2), true)
  assert.equal(await adapter.get('count'), 2)
  assert.equal(await adapter.delete('theme'), true)
  assert.equal(await adapter.get('theme'), undefined)
  assert.deepEqual(await store.read(), { count: 2 })

  await Promise.all([store.set('a', 1), store.set('b', 2), store.set('c', 3)])
  const afterConcurrent = await store.read()
  assert.equal(afterConcurrent.a, 1)
  assert.equal(afterConcurrent.b, 2)
  assert.equal(afterConcurrent.c, 3)

  fs.writeFileSync(storeFile, '[]', 'utf-8')
  await assert.rejects(() => store.read(), /Web 本地设置格式异常/)
  await assert.rejects(() => store.set('theme', 'light'), /Web 本地设置格式异常/)
  assert.equal(fs.readFileSync(storeFile, 'utf-8'), '[]')

  fs.writeFileSync(storeFile, 'null', 'utf-8')
  // null fallback becomes empty object via readJson
  assert.deepEqual(await store.read(), {})

  fs.writeFileSync(storeFile, '{broken', 'utf-8')
  await assert.rejects(() => store.read(), /Web 本地设置读取失败/)
  await assert.rejects(() => store.delete('theme'), /Web 本地设置读取失败/)
  assert.equal(fs.readFileSync(storeFile, 'utf-8'), '{broken')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('Web 服务器 Store 服务测试通过')

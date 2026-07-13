import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWebServerStore } from '../src/main/services/webServerStoreService.js'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-server-store-'))
const storeFile = path.join(tempDir, '.store.json')

try {
  const store = createWebServerStore({ filePath: storeFile })
  assert.deepEqual(store.read(), {})
  assert.equal(store.get('missing'), undefined)

  assert.equal(store.set('theme', 'dark'), true)
  assert.equal(store.get('theme'), 'dark')
  assert.deepEqual(JSON.parse(fs.readFileSync(storeFile, 'utf-8')), { theme: 'dark' })

  const adapter = store.adapter()
  assert.equal(adapter.set('count', 2), true)
  assert.equal(adapter.get('count'), 2)
  assert.equal(adapter.delete('theme'), true)
  assert.equal(adapter.get('theme'), undefined)
  assert.deepEqual(store.read(), { count: 2 })

  fs.writeFileSync(storeFile, '[]', 'utf-8')
  assert.throws(() => store.read(), /Web 本地设置格式异常/)
  assert.throws(() => store.set('theme', 'light'), /Web 本地设置格式异常/)
  assert.equal(fs.readFileSync(storeFile, 'utf-8'), '[]')

  fs.writeFileSync(storeFile, 'null', 'utf-8')
  assert.throws(() => store.read(), /Web 本地设置格式异常/)

  fs.writeFileSync(storeFile, '{broken', 'utf-8')
  assert.throws(() => store.read(), /Web 本地设置读取失败/)
  assert.throws(() => store.delete('theme'), /Web 本地设置读取失败/)
  assert.equal(fs.readFileSync(storeFile, 'utf-8'), '{broken')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('Web 服务器 Store 服务测试通过')

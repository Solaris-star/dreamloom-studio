import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { readJson, writeJson } from '../src/main/services/webJsonRepository.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-json-repository-'))
const filePath = join(root, 'data.json')
const originalRenameSync = fs.renameSync

try {
  assert.deepEqual(readJson(filePath, { empty: true }), { empty: true })
  writeJson(filePath, { value: 1 })
  assert.deepEqual(readJson(filePath, null), { value: 1 })
  writeJson(filePath, { value: 2 })
  assert.deepEqual(readJson(filePath, null), { value: 2 })
  assert.deepEqual(fs.readdirSync(root), ['data.json'])

  fs.renameSync = () => {
    throw new Error('simulated rename failure')
  }
  assert.throws(() => writeJson(filePath, { value: 3 }), /写入 JSON 文件失败.*simulated rename failure/)
  fs.renameSync = originalRenameSync
  assert.deepEqual(readJson(filePath, null), { value: 2 })
  assert.deepEqual(fs.readdirSync(root), ['data.json'])

  fs.writeFileSync(filePath, '{"value":', 'utf8')
  assert.throws(() => readJson(filePath, null), /读取 JSON 文件失败/)
} finally {
  fs.renameSync = originalRenameSync
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web json repository tests passed')

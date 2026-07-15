import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { readJson, writeJson, updateJson } from '../src/main/services/webJsonRepository.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-json-repository-'))
const filePath = join(root, 'data.json')
const originalRename = fs.promises.rename

try {
  assert.deepEqual(await readJson(filePath, { empty: true }), { empty: true })
  await writeJson(filePath, { value: 1 })
  assert.deepEqual(await readJson(filePath, null), { value: 1 })
  await writeJson(filePath, { value: 2 })
  assert.deepEqual(await readJson(filePath, null), { value: 2 })
  assert.deepEqual(fs.readdirSync(root), ['data.json'])

  fs.promises.rename = async () => {
    throw new Error('simulated rename failure')
  }
  let failed = false
  try {
    await writeJson(filePath, { value: 3 })
  } catch (error) {
    failed = true
    assert.match(String(error?.message || error), /写入 JSON 文件失败.*simulated rename failure/)
  } finally {
    fs.promises.rename = originalRename
  }
  assert.equal(failed, true)
  assert.deepEqual(await readJson(filePath, null), { value: 2 })
  assert.deepEqual(fs.readdirSync(root), ['data.json'])

  fs.writeFileSync(filePath, '{"value":', 'utf8')
  await assert.rejects(() => readJson(filePath, null), /读取 JSON 文件失败/)

  await writeJson(filePath, { value: 0 })
  await Promise.all(
    Array.from({ length: 12 }, () =>
      updateJson(filePath, (current) => ({ value: Number(current?.value || 0) + 1 }))
    )
  )
  assert.deepEqual(await readJson(filePath, null), { value: 12 })
} finally {
  fs.promises.rename = originalRename
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web json repository tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createPreset,
  deletePreset,
  exportPresets,
  importPresets,
  listPresets,
  updatePreset
} from '../src/main/services/promptPresetService.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-prompt-presets-'))

try {
  const globalDir = path.join(tempRoot, 'global')
  const builtins = listPresets(globalDir)
  assert.ok(builtins.length >= 20)
  assert.equal(builtins.every((preset) => preset.isBuiltin), true)
  assert.equal(builtins.every((preset) => preset.scope === 'builtin'), true)
  assert.equal(listPresets(globalDir, { includeBuiltins: false }).length, 0)

  const created = createPreset(globalDir, {
    id: 'ignored-id',
    name: '续写测试',
    category: 'continueWrite',
    systemPrompt: '保持人物语气。',
    userPromptTemplate: '{{content}}',
    temperature: '0.55',
    maxTokens: '1800',
    topP: '0.82',
    favorite: true
  })
  assert.notEqual(created.id, 'ignored-id')
  assert.deepEqual(created.modelParams, {
    temperature: 0.55,
    maxTokens: 1800,
    topP: 0.82
  })
  assert.equal(created.scope, 'global')
  assert.equal(created.isFavorite, true)
  assert.equal(fs.existsSync(path.join(globalDir, 'prompt_presets.json')), true)

  const preserved = createPreset(
    globalDir,
    {
      id: 'preset-preserved',
      name: '保留标识',
      modelParams: {
        temperature: 'invalid',
        maxTokens: null,
        topP: undefined
      }
    },
    { preserveId: true }
  )
  assert.equal(preserved.id, 'preset-preserved')
  assert.deepEqual(preserved.modelParams, {
    temperature: 0.7,
    maxTokens: 0,
    topP: 0.9
  })

  const bookDir = path.join(tempRoot, 'books', '长夜书')
  const bookPreset = createPreset(
    bookDir,
    {
      name: '作品专用',
      category: 'rewrite',
      sourcePresetId: created.id
    },
    {
      scope: {
        scope: 'book',
        bookPath: bookDir,
        bookId: 'book-1',
        bookName: '长夜书',
        bookFolderName: '长夜书'
      }
    }
  )
  assert.equal(bookPreset.scope, 'book')
  assert.equal(bookPreset.bookId, 'book-1')
  assert.equal(bookPreset.sourcePresetId, created.id)

  const updated = updatePreset(globalDir, created.id, {
    name: '续写测试（已更新）',
    isFavorite: false,
    modelParams: { temperature: 0.4, maxTokens: 2200, topP: 0.8 }
  })
  assert.equal(updated.id, created.id)
  assert.equal(updated.name, '续写测试（已更新）')
  assert.equal(updated.createdAt, created.createdAt)
  assert.equal(updated.isFavorite, false)
  assert.equal(updated.modelParams.maxTokens, 2200)
  assert.equal(updatePreset(globalDir, 'missing', { name: '不存在' }), null)
  assert.equal(updatePreset(globalDir, builtins[0].id, { name: '禁止修改' }), null)

  assert.equal(deletePreset(globalDir, builtins[0].id), false)
  assert.equal(deletePreset(globalDir, 'missing'), false)
  assert.equal(deletePreset(globalDir, preserved.id), true)
  assert.equal(
    listPresets(globalDir, { includeBuiltins: false }).some(
      (preset) => preset.id === preserved.id
    ),
    false
  )

  const exported = JSON.parse(exportPresets(globalDir))
  assert.ok(exported.some((preset) => preset.id === created.id))
  assert.ok(exported.some((preset) => preset.isBuiltin))

  assert.deepEqual(importPresets(globalDir, '{invalid json'), [])
  assert.deepEqual(importPresets(globalDir, '{"preset":true}'), [])

  const imported = importPresets(
    bookDir,
    JSON.stringify([
      null,
      'invalid',
      {
        id: 'must-not-be-reused',
        name: '导入的作品预设',
        category: 'outline',
        modelParams: { temperature: 0.6, maxTokens: 3000, topP: 0.88 }
      }
    ]),
    {
      scope: {
        scope: 'book',
        bookPath: bookDir,
        bookName: '长夜书'
      }
    }
  )
  assert.equal(imported.length, 1)
  assert.notEqual(imported[0].id, 'must-not-be-reused')
  assert.equal(imported[0].scope, 'book')
  assert.equal(imported[0].bookName, '长夜书')

  const corruptDir = path.join(tempRoot, 'corrupt')
  fs.mkdirSync(corruptDir, { recursive: true })
  fs.writeFileSync(path.join(corruptDir, 'prompt_presets.json'), '{bad json', 'utf8')
  assert.equal(listPresets(corruptDir, { includeBuiltins: false }).length, 0)

  assert.equal(deletePreset(globalDir, created.id), true)
  assert.equal(listPresets(globalDir, { includeBuiltins: false }).length, 0)
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('提示词预设服务测试通过')

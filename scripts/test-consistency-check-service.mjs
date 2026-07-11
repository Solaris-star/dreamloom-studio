import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import {
  listConsistencyChecks,
  runConsistencyCheck
} from '../src/main/services/consistencyCheckService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-consistency-'))
const bookPath = join(rootDir, '风雪试剑')
const chapterDir = join(bookPath, '正文', '第一卷')

function writeJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

try {
  fs.mkdirSync(chapterDir, { recursive: true })
  writeJson(join(bookPath, 'mazi.json'), {
    name: '风雪试剑',
    type: '玄幻',
    intro: '少年入山寻剑。'
  })
  writeJson(join(bookPath, 'characters.json'), [
    { name: '林青', gender: '女', age: 18, height: '168 cm' },
    { name: '陆遥', gender: '男', age: '二十岁', height: 180 }
  ])
  writeJson(join(bookPath, 'settings.json'), {
    categories: [
      {
        name: '术法',
        items: [
          {
            name: '月影术',
            introduction: '月影术只能在夜间施展，白天不能发动。'
          }
        ]
      }
    ]
  })
  writeJson(join(bookPath, 'dictionary.json'), [])
  writeJson(join(bookPath, 'timelines.json'), [])

  const chapterText = [
    '林青今年二十五岁，却被众人称作少年。',
    '今年陆遥二十一岁，他在山门外守了一夜。',
    '林青是男儿身的传闻传遍集市。',
    '正午日光刺眼，月影术被林青强行施展。'
  ].join('\n')
  fs.writeFileSync(join(chapterDir, '第一章.txt'), chapterText, 'utf-8')

  const ruleResult = await runConsistencyCheck({
    bookPath,
    volumeName: '第一卷',
    chapterName: '第一章',
    source: 'generated_chapter',
    generationId: 'gen_001',
    taskType: 'continue',
    applyAction: 'append'
  })

  assert.equal(ruleResult.success, true)
  assert.equal(ruleResult.check.ruleChecked, true)
  assert.equal(ruleResult.check.llmChecked, false)
  assert.equal(ruleResult.check.source, 'generated_chapter')
  assert.equal(ruleResult.check.generationId, 'gen_001')
  assert.equal(ruleResult.check.taskType, 'continue')
  assert.equal(ruleResult.check.applyAction, 'append')
  assert.equal(
    ruleResult.issues.some((item) => item.type === 'character_age' && item.actual === 25),
    true
  )
  assert.equal(
    ruleResult.issues.some((item) => item.type === 'character_age' && item.actual === 21),
    true
  )
  assert.equal(
    ruleResult.issues.some((item) => item.type === 'character_gender'),
    true
  )
  assert.equal(
    ruleResult.issues.some((item) => item.type === 'setting_condition'),
    true
  )

  const storeAfterRules = listConsistencyChecks({ bookPath })
  assert.equal(storeAfterRules.success, true)
  assert.equal(storeAfterRules.checks.length, 1)
  assert.equal(fs.existsSync(join(bookPath, 'consistency-checks.json')), true)

  const appliedResult = await runConsistencyCheck({
    bookPath,
    volumeName: '第一卷',
    chapterName: '第一章',
    text: `${chapterText}\n林青二十五岁时把月影术用在正午。`,
    source: 'applied_current_chapter',
    generationId: 'gen_002',
    taskType: 'continue',
    applyAction: 'append'
  })

  assert.equal(appliedResult.success, true)
  assert.equal(appliedResult.check.source, 'applied_current_chapter')
  assert.equal(appliedResult.check.generationId, 'gen_002')
  assert.equal(appliedResult.check.taskType, 'continue')
  assert.equal(appliedResult.check.applyAction, 'append')
  assert.equal(
    appliedResult.issues.some((item) => item.type === 'character_age' && item.actual === 25),
    true
  )

  const draftResult = await runConsistencyCheck({
    bookPath,
    volumeName: '第一卷',
    chapterName: '草稿章',
    text: '正午日光刺眼，月影术被林青强行施展。',
    source: 'cli_writer_draft_tool',
    generationId: 'draft_001',
    taskType: 'cli_write_draft',
    applyAction: 'draft_review',
    skipLlm: true,
    persist: false
  })

  assert.equal(draftResult.success, true)
  assert.equal(draftResult.check.persisted, false)
  assert.equal(
    draftResult.issues.some((item) => item.type === 'setting_condition'),
    true
  )
  const storeAfterDraft = listConsistencyChecks({ bookPath })
  assert.equal(storeAfterDraft.checks.length, 2)

  const offlineTextProvider = {
    async chat(options) {
      assert.equal(options.temperature, 0.1)
      assert.equal(options.model, 'consistency-model')
      return {
        content: JSON.stringify({
          summary: '发现一处地点冲突',
          issues: [
            {
              type: 'location_conflict',
              severity: 'medium',
              message: '正文地点与资料不一致',
              evidence: '山门外守了一夜',
              reference: '资料：林青在内门闭关',
              expected: '内门',
              actual: '山门外',
              suggestion: '修正文中地点，或补充离开内门的原因。'
            }
          ]
        }),
        providerId: 'offline-consistency-provider',
        model: 'consistency-model',
        usage: { total_tokens: 96 }
      }
    }
  }

  const llmResult = await runConsistencyCheck(
    {
      bookPath,
      text: '二十五岁的林青在山门外停步。',
      useLlm: true,
      model: 'consistency-model'
    },
    { textProvider: offlineTextProvider }
  )

  assert.equal(llmResult.success, true)
  assert.equal(llmResult.check.llmChecked, true)
  assert.equal(llmResult.check.providerId, 'offline-consistency-provider')
  assert.equal(llmResult.check.model, 'consistency-model')
  assert.deepEqual(llmResult.check.usage, { total_tokens: 96 })
  assert.equal(
    llmResult.issues.some((item) => item.type === 'location_conflict'),
    true
  )

  const finalStore = listConsistencyChecks({ bookPath })
  assert.equal(finalStore.checks.length, 3)

  const originalCharacters = fs.readFileSync(join(bookPath, 'characters.json'), 'utf-8')
  fs.writeFileSync(join(bookPath, 'characters.json'), '{ bad json', 'utf-8')
  await assert.rejects(
    () =>
      runConsistencyCheck({
        bookPath,
        text: '林青今年二十五岁。'
      }),
    /读取 JSON 文件失败/
  )
  fs.writeFileSync(
    join(bookPath, 'characters.json'),
    JSON.stringify({ name: '林青' }, null, 2),
    'utf-8'
  )
  await assert.rejects(
    () =>
      runConsistencyCheck({
        bookPath,
        text: '林青今年二十五岁。'
      }),
    /characters\.json 格式错误，应为数组/
  )
  fs.writeFileSync(join(bookPath, 'characters.json'), originalCharacters, 'utf-8')

  const checkStorePath = join(bookPath, 'consistency-checks.json')
  fs.writeFileSync(checkStorePath, '{ bad json', 'utf-8')
  assert.throws(() => listConsistencyChecks({ bookPath }), /读取 JSON 文件失败/)
  await assert.rejects(
    () =>
      runConsistencyCheck({
        bookPath,
        text: '林青今年二十五岁。'
      }),
    /读取 JSON 文件失败/
  )
  assert.equal(fs.readFileSync(checkStorePath, 'utf-8'), '{ bad json')

  fs.writeFileSync(checkStorePath, JSON.stringify({ checks: {} }, null, 2), 'utf-8')
  assert.throws(() => listConsistencyChecks({ bookPath }), /一致性检查记录格式错误/)
  await assert.rejects(
    () =>
      runConsistencyCheck({
        bookPath,
        text: '林青今年二十五岁。'
      }),
    /一致性检查记录格式错误/
  )
  assert.deepEqual(JSON.parse(fs.readFileSync(checkStorePath, 'utf-8')), { checks: {} })
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('consistency check service tests passed')

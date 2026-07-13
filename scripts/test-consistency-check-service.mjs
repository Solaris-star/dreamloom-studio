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
    '林青身高 180 cm，陆遥被误认成一位姑娘。',
    '正午日光刺眼，月影术被林青强行施展。'
  ].join('\n')
  fs.writeFileSync(join(chapterDir, '第一章.txt'), chapterText, 'utf-8')

  await assert.rejects(() => runConsistencyCheck({}), /作品目录不存在/)
  await assert.rejects(
    () => runConsistencyCheck({ bookPath, volumeName: '第一卷', chapterName: '不存在' }),
    /待检查正文为空/
  )

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
    ruleResult.issues.some(
      (item) => item.type === 'character_height' && item.expected === 168 && item.actual === 180
    ),
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

  const contentAliasResult = await runConsistencyCheck({
    bookPath,
    content: '林青二十五岁。',
    volume: '别名卷',
    chapter: '别名章',
    save: false
  })
  assert.equal(contentAliasResult.check.volumeName, '别名卷')
  assert.equal(contentAliasResult.check.chapterName, '别名章')
  assert.equal(contentAliasResult.check.persisted, false)

  const chapterTextAliasResult = await runConsistencyCheck(
    {
      bookPath,
      chapterText: '陆遥是一位姑娘。',
      aiCheck: true,
      save: true
    },
    { persist: false }
  )
  assert.equal(chapterTextAliasResult.check.persisted, false)
  assert.equal(chapterTextAliasResult.check.llmChecked, false)
  assert.match(
    chapterTextAliasResult.check.llmMessage,
    /未配置文本 AI 服务/
  )

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

  const fencedLlmResult = await runConsistencyCheck(
    {
      bookPath,
      text: '林青回到内门。',
      enableLlm: true,
      modelName: 'fallback-model',
      maxTokens: 800,
      persist: false
    },
    { textProvider: {} }
  )
  assert.equal(fencedLlmResult.check.llmChecked, false)

  const markdownLlmResult = await runConsistencyCheck(
    {
      bookPath,
      text: '林青回到内门。',
      enableLlm: true,
      modelName: 'fallback-model',
      maxTokens: 800,
      persist: false
    },
    {
      textProvider: {
        async chat(options) {
          assert.equal(options.model, 'fallback-model')
          assert.equal(options.max_tokens, 800)
          return {
            content:
              '```json\n{"summary":"格式正常","issues":[{"issue":"地点需要确认","quote":"回到内门","fact":"人物资料","fix":"补充说明"}]}\n```'
          }
        }
      }
    }
  )
  assert.equal(markdownLlmResult.check.llmMessage, '格式正常')
  assert.equal(markdownLlmResult.issues[0].type, 'semantic_consistency')
  assert.equal(markdownLlmResult.issues[0].severity, 'medium')

  const embeddedLlmResult = await runConsistencyCheck(
    {
      bookPath,
      text: '林青回到内门。',
      useLlm: true,
      persist: false
    },
    {
      textProvider: {
        async chat() {
          return {
            content:
              '前置文字 {"summary":"已提取","issues":[{"reason":"时间需要确认","type":"timeline","severity":"low"}]} 后置文字'
          }
        }
      }
    }
  )
  assert.equal(embeddedLlmResult.check.llmMessage, '已提取')
  assert.equal(embeddedLlmResult.issues[0].type, 'timeline')

  const malformedLlmResult = await runConsistencyCheck(
    {
      bookPath,
      text: '林青回到内门。',
      useLlm: true,
      persist: false
    },
    {
      textProvider: {
        async chat() {
          return { content: '不是 JSON' }
        }
      }
    }
  )
  assert.equal(malformedLlmResult.check.llmChecked, true)
  assert.equal(malformedLlmResult.check.llmMessage, '')
  assert.deepEqual(malformedLlmResult.issues, [])

  const finalStore = listConsistencyChecks({ bookPath })
  assert.equal(finalStore.checks.length, 3)

  const legacyStorePath = join(bookPath, 'consistency-checks.json')
  const currentChecks = finalStore.checks
  fs.writeFileSync(legacyStorePath, JSON.stringify(currentChecks), 'utf8')
  assert.equal(listConsistencyChecks({ bookPath }).checks.length, 3)
  fs.writeFileSync(legacyStorePath, JSON.stringify({ checks: currentChecks }), 'utf8')

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

  const originalSettings = fs.readFileSync(join(bookPath, 'settings.json'), 'utf8')
  fs.writeFileSync(join(bookPath, 'settings.json'), '[]', 'utf8')
  await assert.rejects(
    () => runConsistencyCheck({ bookPath, text: '测试正文。' }),
    /settings\.json 格式错误/
  )
  fs.writeFileSync(join(bookPath, 'settings.json'), JSON.stringify({ categories: {} }), 'utf8')
  await assert.rejects(
    () => runConsistencyCheck({ bookPath, text: '测试正文。' }),
    /settings\.json 格式错误/
  )
  fs.writeFileSync(join(bookPath, 'settings.json'), originalSettings, 'utf8')

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

  assert.throws(
    () => listConsistencyChecks({ bookPath: join(rootDir, '不存在作品') }),
    /作品目录不存在/
  )
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('consistency check service tests passed')

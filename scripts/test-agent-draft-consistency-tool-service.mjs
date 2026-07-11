import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { runAgentDraftConsistencyTool } from '../src/main/services/agentDraftConsistencyToolService.js'
import { listConsistencyChecks } from '../src/main/services/consistencyCheckService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-draft-tool-'))
const bookPath = join(rootDir, '月影试剑')

function writeJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

try {
  fs.mkdirSync(bookPath, { recursive: true })
  writeJson(join(bookPath, 'mazi.json'), {
    name: '月影试剑',
    type: '玄幻',
    intro: '少年剑修寻找失落术法。'
  })
  writeJson(join(bookPath, 'characters.json'), [])
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

  const result = await runAgentDraftConsistencyTool(
    {
      bookPath,
      bookName: '月影试剑',
      volumeName: '第一卷',
      chapterName: '第一章',
      chapterId: 'chapter-001',
      taskType: 'editor_agent_draft',
      signal: new AbortController().signal
    },
    'gen_001',
    '正午日光刺眼，月影术被林青强行施展。',
    'editor_agent_writer_draft_tool',
    '规则检查 Writer 初稿'
  )

  assert.equal(result.result.success, true)
  assert.equal(result.result.check.persisted, false)
  assert.equal(result.result.check.source, 'editor_agent_writer_draft_tool')
  assert.equal(result.result.check.taskType, 'editor_agent_draft')
  assert.equal(result.result.check.applyAction, 'draft_review')
  assert.equal(
    result.result.issues.some((item) => item.type === 'setting_condition'),
    true
  )
  assert.match(result.text, /草稿一致性规则检查发现/)
  assert.equal(result.step.stage, 'agent_draft_consistency_check')
  assert.equal(result.step.role, 'tool')
  assert.equal(result.step.title, '规则检查 Writer 初稿')
  assert.equal(result.step.issueCount, 1)
  assert.equal(result.step.metadata.persisted, false)
  assert.equal(result.step.metadata.ruleChecked, true)
  assert.equal(result.step.metadata.source, 'editor_agent_writer_draft_tool')

  const store = listConsistencyChecks({ bookPath })
  assert.equal(store.checks.length, 0)

  console.log('agent draft consistency tool service tests passed')
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

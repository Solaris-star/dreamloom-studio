import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import {
  createAgentDraftConsistencyStep,
  formatAgentDraftConsistencySummary,
  runAgentDraftConsistencyTool
} from '../src/main/services/agentDraftConsistencyToolService.js'
import { listConsistencyChecks } from '../src/main/services/consistencyCheckService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-draft-tool-'))
const bookPath = join(rootDir, '月影试剑')

function writeJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

try {
  assert.equal(
    formatAgentDraftConsistencySummary({ success: false }),
    '草稿一致性规则检查未返回可用结果。'
  )
  assert.equal(
    formatAgentDraftConsistencySummary({ success: true, issues: null }),
    '草稿一致性规则检查未发现明确矛盾。'
  )

  const formattedIssues = formatAgentDraftConsistencySummary({
    success: true,
    issues: Array.from({ length: 7 }, (_, index) => ({
      message: `问题 ${index + 1}`,
      evidence: index === 0 ? '正文证据' : '',
      reference: index === 0 ? '设定依据' : '',
      suggestion: index === 0 ? '修改建议' : ''
    }))
  })
  assert.match(formattedIssues, /发现 7 个可能矛盾/)
  assert.match(formattedIssues, /1\. 问题 1/)
  assert.match(formattedIssues, /证据：正文证据/)
  assert.match(formattedIssues, /依据：设定依据/)
  assert.match(formattedIssues, /建议：修改建议/)
  assert.match(formattedIssues, /6\. 问题 6/)
  assert.doesNotMatch(formattedIssues, /问题 7/)

  const startedAt = Date.parse('2026-07-12T08:00:00.000Z')
  const longStep = createAgentDraftConsistencyStep(
    {
      success: true,
      issues: Array.from({ length: 6 }, (_, index) => ({
        type: `issue_${index}`,
        message: `问题 ${index + 1}${'内容'.repeat(120)}`
      })),
      check: {
        id: 'check-long',
        ruleChecked: true,
        llmChecked: false,
        persisted: false,
        source: 'unit-test'
      }
    },
    '长文本规则检查',
    startedAt
  )
  assert.match(longStep.id, /^agent_draft_consistency_check_/)
  assert.equal(longStep.startedAt, '2026-07-12T08:00:00.000Z')
  assert.equal(longStep.content.length, 900)
  assert.equal(longStep.checkId, 'check-long')
  assert.equal(longStep.issueCount, 6)
  assert.deepEqual(longStep.usage, {})
  assert.deepEqual(longStep.metadata, {
    ruleChecked: true,
    llmChecked: false,
    persisted: false,
    source: 'unit-test'
  })
  assert.equal(Number.isNaN(Date.parse(longStep.finishedAt)), false)

  const emptyStep = createAgentDraftConsistencyStep(
    { success: true, issues: [], check: null },
    undefined,
    startedAt
  )
  assert.equal(emptyStep.title, '规则检查草稿')
  assert.equal(emptyStep.checkId, '')
  assert.equal(emptyStep.issueCount, 0)
  assert.deepEqual(emptyStep.metadata, {
    ruleChecked: false,
    llmChecked: false,
    persisted: false,
    source: ''
  })

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
  assert.equal(result.result.check.llmChecked, false)
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
  assert.equal(result.step.metadata.llmChecked, false)
  assert.equal(result.step.metadata.source, 'editor_agent_writer_draft_tool')

  const store = listConsistencyChecks({ bookPath })
  assert.equal(store.checks.length, 0)

  const defaultResult = await runAgentDraftConsistencyTool(
    {
      bookPath,
      bookName: '月影试剑',
      volumeName: '第一卷',
      title: '第二章',
      chapterId: 'chapter-002',
      taskType: '   ',
      applyAction: '   '
    },
    'gen_002',
    '夜幕降临，林青顺利施展月影术。'
  )
  assert.equal(defaultResult.result.success, true)
  assert.equal(defaultResult.result.check.chapterName, '第二章')
  assert.equal(defaultResult.result.check.taskType, 'agent_draft')
  assert.equal(defaultResult.result.check.applyAction, 'draft_review')
  assert.equal(defaultResult.result.check.persisted, false)
  assert.equal(defaultResult.result.check.llmChecked, false)
  assert.equal(defaultResult.step.title, '规则检查草稿')
  assert.match(defaultResult.text, /未发现明确矛盾/)
  assert.equal(listConsistencyChecks({ bookPath }).checks.length, 0)

  console.log('agent draft consistency tool service tests passed')
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

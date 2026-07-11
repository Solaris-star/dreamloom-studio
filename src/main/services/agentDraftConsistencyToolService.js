import { randomUUID } from 'node:crypto'
import { runConsistencyCheck } from './consistencyCheckService.js'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function nowIso() {
  return new Date().toISOString()
}

function formatIssuePrompt(issues = []) {
  return issues
    .map((issue, index) => {
      const bits = [
        `${index + 1}. ${issue.message || issue.type || '未知问题'}`,
        issue.evidence ? `证据：${issue.evidence}` : '',
        issue.reference ? `依据：${issue.reference}` : '',
        issue.suggestion ? `建议：${issue.suggestion}` : ''
      ].filter(Boolean)
      return bits.join('\n')
    })
    .join('\n\n')
}

export function formatAgentDraftConsistencySummary(checkResult = {}) {
  const issues = Array.isArray(checkResult.issues) ? checkResult.issues : []
  if (!checkResult.success) return '草稿一致性规则检查未返回可用结果。'
  if (!issues.length) return '草稿一致性规则检查未发现明确矛盾。'
  return [
    `草稿一致性规则检查发现 ${issues.length} 个可能矛盾：`,
    formatIssuePrompt(issues.slice(0, 6))
  ]
    .filter(Boolean)
    .join('\n')
}

export function createAgentDraftConsistencyStep(
  checkResult = {},
  title = '规则检查草稿',
  startedAt = Date.now()
) {
  const issueCount = Array.isArray(checkResult.issues) ? checkResult.issues.length : 0
  const check = checkResult.check || {}
  return {
    id: `agent_draft_consistency_check_${randomUUID()}`,
    stage: 'agent_draft_consistency_check',
    role: 'tool',
    title,
    status: 'done',
    content: cleanText(formatAgentDraftConsistencySummary(checkResult)).slice(0, 900),
    modelUsed: '',
    usage: {},
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: nowIso(),
    checkId: check.id || '',
    issueCount,
    metadata: {
      ruleChecked: check.ruleChecked === true,
      llmChecked: check.llmChecked === true,
      persisted: check.persisted === true,
      source: check.source || ''
    }
  }
}

export async function runAgentDraftConsistencyTool(
  input = {},
  generationId = '',
  draft = '',
  source = '',
  title = '规则检查草稿'
) {
  const checkResult = await runConsistencyCheck({
    bookPath: input.bookPath,
    bookName: input.bookName,
    volumeName: input.volumeName,
    chapterName: input.chapterName || input.title || input.chapterId,
    chapterId: input.chapterId,
    text: draft,
    source,
    generationId,
    taskType: cleanText(input.taskType) || 'agent_draft',
    applyAction: cleanText(input.applyAction) || 'draft_review',
    skipLlm: true,
    persist: false,
    save: false,
    signal: input.signal
  })
  return {
    result: checkResult,
    text: formatAgentDraftConsistencySummary(checkResult),
    step: createAgentDraftConsistencyStep(checkResult, title)
  }
}

export default {
  createAgentDraftConsistencyStep,
  formatAgentDraftConsistencySummary,
  runAgentDraftConsistencyTool
}

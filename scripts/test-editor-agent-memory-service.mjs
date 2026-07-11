import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  completeAgentTask,
  createAgentTask,
  recordAgentTaskConsistency,
  recordAgentTaskRepair
} from '../src/main/services/editorAgentTaskService.js'
import {
  editorAgentTaskMemoryRecord,
  formatEditorAgentTaskMemory,
  loadEditorAgentTaskMemory,
  summarizeEditorAgentTaskMemory
} from '../src/main/services/editorAgentMemoryService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-memory-'))
const bookPath = join(rootDir, '风雪试剑')

try {
  fs.mkdirSync(bookPath, { recursive: true })

  const firstTask = createAgentTask(bookPath, {
    bookName: '风雪试剑',
    bookId: '风雪试剑',
    chapterId: '第一章',
    title: 'CLI 写作 第一章',
    type: 'cli_write',
    agentMode: 'auto_edit',
    generationId: 'gen_001',
    instruction: '写林青第一次在山门外遇到追兵。'
  })

  completeAgentTask(bookPath, firstTask.id, {
    id: 'gen_001',
    modelUsed: 'offline-model',
    result: '林青在夜色里赶到山门，借月影术避开追兵。',
    review: {
      passed: false,
      score: 62,
      issues: ['初稿偏离写作要求'],
      revisionInstruction: '改成完整正文。'
    },
    usage: { calls: 2 },
    agentSteps: [
      {
        id: 'step_writer',
        stage: 'writer',
        role: 'writer',
        title: 'Writer 生成初稿',
        status: 'done',
        content: '林青在夜色里赶到山门。',
        modelUsed: 'offline-model',
        usage: { total_tokens: 90 }
      },
      {
        id: 'step_editor',
        stage: 'editor_review',
        role: 'editor',
        title: 'Editor 审核初稿',
        status: 'done',
        content: '审核：未通过。问题：初稿偏离写作要求。',
        modelUsed: 'offline-model',
        usage: { total_tokens: 60 }
      }
    ]
  })

  recordAgentTaskConsistency(bookPath, {
    taskId: firstTask.id,
    generationId: 'gen_001',
    checkId: 'check_001',
    title: 'CLI 写作后一致性检查',
    summary: '发现 1 个可能矛盾。',
    issueCount: 1,
    applyAction: 'replace_chapter'
  })

  recordAgentTaskRepair(bookPath, {
    taskId: firstTask.id,
    sourceGenerationId: 'gen_001',
    repairGenerationId: 'repair_001',
    checkId: 'check_001',
    issueCount: 1,
    review: { passed: true, score: 91, issues: [] },
    result: '林青在夜色里赶到山门，确认月影术只能夜里使用。',
    steps: [
      {
        id: 'step_repair',
        stage: 'writer_repair',
        role: 'writer',
        title: 'Writer 修正一致性问题',
        status: 'done',
        content: '林青确认月影术只能夜里使用。',
        modelUsed: 'offline-model',
        usage: { total_tokens: 110 }
      }
    ]
  })

  const secondTask = createAgentTask(bookPath, {
    bookName: '风雪试剑',
    bookId: '风雪试剑',
    chapterId: '第一章',
    title: '当前任务',
    type: 'cli_write',
    generationId: 'gen_002',
    instruction: '继续写第一章。'
  })

  const memory = loadEditorAgentTaskMemory(bookPath, {
    currentTaskId: secondTask.id,
    chapterId: '第一章',
    limit: 6,
    eventLimit: 8
  })
  assert.equal(memory.loaded, true)
  assert.equal(memory.taskCount, 1)
  assert.equal(memory.tasks[0].id, firstTask.id)
  assert.equal(
    memory.tasks.some((item) => item.id === secondTask.id),
    false
  )
  assert.equal(memory.eventCount > 0, true)
  assert.equal(memory.sources[0].type, 'agent_task')

  const formatted = formatEditorAgentTaskMemory(memory)
  assert.ok(formatted.includes('林青在夜色里赶到山门'))
  assert.ok(formatted.includes('审核：未通过'))
  assert.ok(formatted.includes('一致性检查'))
  assert.ok(formatted.includes('返修稿已保存'))

  const summary = summarizeEditorAgentTaskMemory(memory)
  assert.ok(summary.includes('已读取 1 条历史任务'))

  const record = editorAgentTaskMemoryRecord(memory)
  assert.equal(record.loaded, true)
  assert.equal(record.taskCount, 1)
  assert.equal(record.eventCount, memory.eventCount)
  assert.equal(record.sources.length, 1)
  assert.ok(record.preview.includes('林青在夜色里赶到山门'))

  const missing = loadEditorAgentTaskMemory(join(rootDir, '不存在的作品'), { chapterId: '第一章' })
  assert.equal(missing.loaded, false)
  assert.equal(missing.error, '作品目录不存在')
  assert.equal(formatEditorAgentTaskMemory(missing), '暂无可用历史任务记录。')
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('editor agent memory service tests passed')

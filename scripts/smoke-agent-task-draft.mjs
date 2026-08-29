// 冒烟验证：拒稿 resultDraft 落盘与读取全链路
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createAgentTask,
  completeAgentTask,
  listAgentTasks
} from '../src/main/services/editorAgentTaskService.js'

const bookDir = mkdtempSync(join(tmpdir(), 'dl-smoke-'))
let failed = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}`)
  if (!cond) failed++
}

try {
  // 1. 创建任务（模拟 agent 写作任务开始）
  const task = createAgentTask(bookDir, {
    bookName: 'smoke-book',
    title: '冒烟测试任务',
    type: 'cli_write',
    instruction: '写一段测试内容'
  })
  check('createAgentTask 返回 id', Boolean(task.id))

  // 2. 模拟拒稿完成：review.passed=false，正文应完整落盘
  const draftText = '第1章 测试章节\n\n这是拒稿后应保留的完整正文。'.repeat(50)
  completeAgentTask(bookDir, task.id, {
    id: 'gen_test_1',
    result: draftText,
    review: { passed: false, issues: ['节奏偏慢'] },
    modelUsed: 'test-model',
    usage: { totalTokens: 1234 }
  })

  // 3. 读回验证
  const { tasks } = listAgentTasks(bookDir, {})
  const found = tasks.find((t) => t.id === task.id)
  check('任务状态 = review_failed', found?.status === 'review_failed')
  check('resultDraft 完整保留（12k 内不截断）', found?.resultDraft === draftText)
  check('resultDraft 存在且非空', Boolean(found?.resultDraft))
  check('resultPreview 仅 900 字截断', (found?.resultPreview || '').length <= 903)

  // 4. 12k 截断保护验证
  const longDraft = '长文本测试'.repeat(10000) // 50k 字
  const task2 = createAgentTask(bookDir, { title: '长文本', type: 'cli_write' })
  completeAgentTask(bookDir, task2.id, {
    id: 'gen_test_2',
    result: longDraft,
    review: { passed: false }
  })
  const found2 = listAgentTasks(bookDir, {}).tasks.find((t) => t.id === task2.id)
  check('超 12k 正文截断到 12000', Math.abs((found2?.resultDraft?.length || 0) - 12000) <= 3)

  // 5. 审稿通过时 resultDraft 应为空（不冗余存储）
  const task3 = createAgentTask(bookDir, { title: '通过任务', type: 'cli_write' })
  completeAgentTask(bookDir, task3.id, {
    id: 'gen_test_3',
    result: '这是通过的正文',
    review: { passed: true }
  })
  const found3 = listAgentTasks(bookDir, {}).tasks.find((t) => t.id === task3.id)
  check('通过任务 resultDraft 为空', !found3?.resultDraft)

  // 6. 事件流也带 resultDraft
  check('事件记录含 resultDraft', Boolean(found?.events?.some((e) => e.resultDraft)))
} finally {
  rmSync(bookDir, { recursive: true, force: true })
}

console.log(failed === 0 ? '\nALL PASS ✅' : `\n${failed} FAILED ❌`)
process.exit(failed === 0 ? 0 : 1)

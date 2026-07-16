import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  cancelAgentTask,
  completeAgentTask,
  createAgentTask,
  failAgentTask,
  listAgentTasks,
  onAgentTaskProgress,
  recordAgentTaskApplication,
  recordAgentTaskConsistency,
  recordAgentTaskQueueEvent,
  recordAgentTaskRepair,
  recordAgentTaskRepairFailure,
  recordAgentTaskStream
} from '../src/main/services/editorAgentTaskService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-task-'))
const bookPath = join(rootDir, '风雪试剑')

try {
  fs.mkdirSync(bookPath, { recursive: true })
  assert.throws(() => listAgentTasks(join(rootDir, '不存在')), /作品目录不存在/)
  assert.throws(() => createAgentTask('', {}), /作品目录不存在/)

  const progressEvents = []
  const stopListening = onAgentTaskProgress((event) => progressEvents.push(event))
  const noopStop = onAgentTaskProgress(null)
  noopStop()

  const task = createAgentTask(bookPath, {
    bookName: '风雪试剑',
    bookId: '风雪试剑',
    chapterId: '第一章',
    sessionId: 'editor_session:风雪试剑',
    title: '续写本章',
    type: 'continue',
    agentMode: 'writing',
    modelId: 'custom::writer-model',
    executionMode: 'append',
    instruction: '续写 800 字，承接上文。'
  })

  assert.equal(task.status, 'running')
  assert.equal(task.bookName, '风雪试剑')
  assert.equal(task.events[0].type, 'task_started')
  assert.equal(progressEvents.at(-1).event.type, 'task_started')

  const defaultTask = createAgentTask(bookPath, {
    id: 'default_task',
    instruction: 123,
    events: 'invalid'
  })
  assert.equal(defaultTask.bookName, '风雪试剑')
  assert.equal(defaultTask.type, 'custom')
  assert.equal(defaultTask.agentMode, 'writing')
  assert.equal(defaultTask.outputMode, 'preview')
  assert.equal(defaultTask.canWriteChapter, false)
  assert.deepEqual(defaultTask.inputScopes, [])
  assert.equal(defaultTask.events[0].content, '123')

  const streamRunning = recordAgentTaskStream(bookPath, {
    taskId: defaultTask.id,
    generationId: 'stream_001',
    skillId: 'skill_001',
    skillKey: 'continue',
    outputMode: 'chapter_write',
    canWriteChapter: true,
    inputScopes: [' chapter ', '', 1],
    requiredContext: ['characters'],
    references: ['outline'],
    chunkCount: '2',
    wordCount: 120,
    content: '第一段'
  })
  assert.equal(streamRunning.status, 'running')
  assert.equal(streamRunning.canWriteChapter, true)
  assert.deepEqual(streamRunning.inputScopes, ['chapter'])
  assert.equal(streamRunning.events.at(-1).type, 'writer_stream')
  assert.equal(streamRunning.events.at(-1).chunkCount, 2)

  const streamDone = recordAgentTaskStream(bookPath, {
    taskId: defaultTask.id,
    status: 'done',
    type: 'custom_stream',
    role: 'editor',
    title: '完成流式写作'
  })
  assert.equal(streamDone.status, 'streamed')
  assert.equal(streamDone.events.at(-1).type, 'custom_stream')
  stopListening()
  const progressCountAfterStop = progressEvents.length

  const completed = completeAgentTask(bookPath, task.id, {
    id: 'gen_001',
    modelUsed: 'writer-model',
    result: '林青在风雪里握紧剑柄。',
    review: { passed: true, score: 86, issues: [] },
    agentSteps: [
      {
        id: 'step_context',
        stage: 'agent_context_loaded',
        role: 'tool',
        title: '读取作品资料',
        status: 'done',
        content: '已读取 2 类作品资料，约 320 字。来源：书籍信息、人物设定',
        bookContext: {
          loaded: true,
          sourceCount: 2,
          contextChars: 320,
          sources: [
            { type: 'book_meta', label: '书籍信息', path: join(bookPath, 'mazi.json') },
            { type: 'characters', label: '人物设定', path: join(bookPath, 'characters.json') }
          ],
          preview: '【书籍信息】\n书名：风雪试剑\n\n【人物设定】\n姓名：林青',
          error: '',
          loadedAt: '2026-06-07T00:00:00.000Z'
        }
      },
      {
        id: 'step_memory',
        stage: 'agent_memory_loaded',
        role: 'tool',
        title: '读取历史任务记录',
        status: 'done',
        content: '已读取 1 条历史任务、2 条事件，约 180 字。',
        taskMemory: {
          loaded: true,
          taskCount: 1,
          eventCount: 2,
          contextChars: 180,
          sources: [
            {
              type: 'agent_task',
              label: 'CLI 写作 第一章',
              id: 'history_task_001',
              chapterId: '第一章',
              updatedAt: '2026-06-07T00:00:00.000Z'
            }
          ],
          preview: '- CLI 写作 第一章；章节：第一章；状态：checked',
          error: '',
          loadedAt: '2026-06-07T00:00:00.000Z'
        }
      },
      {
        id: 'step_writer',
        stage: 'writer',
        role: 'writer',
        title: 'Writer 生成初稿',
        status: 'done',
        content: '林青在风雪里握紧剑柄。',
        modelUsed: 'writer-model',
        usage: { total_tokens: 120 }
      },
      {
        id: 'step_draft_check',
        stage: 'agent_draft_consistency_check',
        role: 'tool',
        title: '规则检查 Writer 初稿',
        status: 'done',
        content: '初稿一致性规则检查发现 1 个可能矛盾。',
        checkId: 'draft_check_001',
        issueCount: 1,
        metadata: {
          ruleChecked: true,
          llmChecked: false,
          persisted: false,
          source: 'cli_writer_draft_tool'
        }
      },
      {
        id: 'step_editor',
        stage: 'editor_review',
        role: 'editor',
        title: 'Editor 审核初稿',
        status: 'done',
        content: '是否通过：通过。',
        modelUsed: 'writer-model',
        usage: { total_tokens: 60 }
      }
    ]
  })

  assert.equal(completed.status, 'generated')
  assert.equal(completed.generationId, 'gen_001')
  const contextEvent = completed.events.find((item) => item.type === 'agent_context_loaded')
  assert.equal(contextEvent.bookContext.sourceCount, 2)
  assert.equal(contextEvent.contextChars, 320)
  assert.equal(contextEvent.sources.length, 2)
  const memoryEvent = completed.events.find((item) => item.type === 'agent_memory_loaded')
  assert.equal(memoryEvent.role, 'tool')
  assert.equal(memoryEvent.taskMemory.loaded, true)
  assert.equal(memoryEvent.taskMemory.taskCount, 1)
  assert.equal(memoryEvent.taskCount, 1)
  assert.equal(memoryEvent.eventCount, 2)
  assert.equal(memoryEvent.contextChars, 180)
  assert.equal(memoryEvent.sources[0].type, 'agent_task')
  const draftCheckEvent = completed.events.find(
    (item) => item.type === 'agent_draft_consistency_check'
  )
  assert.equal(draftCheckEvent.role, 'tool')
  assert.equal(draftCheckEvent.checkId, 'draft_check_001')
  assert.equal(draftCheckEvent.issueCount, 1)
  assert.equal(draftCheckEvent.metadata.persisted, false)
  assert.equal(
    completed.events.some((item) => item.type === 'writer'),
    true
  )
  assert.equal(
    completed.events.some((item) => item.type === 'editor_review'),
    true
  )
  assert.equal(completed.events.at(-1).type, 'generation_saved')

  const reviewFailed = completeAgentTask(bookPath, defaultTask.id, {
    review: { passed: false },
    agentSteps: 'invalid'
  })
  assert.equal(reviewFailed.status, 'review_failed')
  assert.equal(progressEvents.length, progressCountAfterStop)

  const applied = recordAgentTaskApplication(bookPath, {
    taskId: task.id,
    generationId: 'gen_001',
    applyAction: 'append',
    status: 'applied'
  })

  assert.equal(applied.status, 'applied')
  assert.equal(applied.applyAction, 'append')
  assert.equal(applied.events.at(-1).type, 'generation_applied')

  const defaultApplied = recordAgentTaskApplication(bookPath, {
    taskId: defaultTask.id,
    content: '应用默认结果'
  })
  assert.equal(defaultApplied.status, 'applied')
  assert.equal(defaultApplied.applyAction, '')

  const checked = recordAgentTaskConsistency(bookPath, {
    taskId: task.id,
    generationId: 'gen_001',
    checkId: 'check_001',
    title: '应用后整章检查',
    summary: '发现 1 个可能矛盾',
    issueCount: 1,
    applyAction: 'append'
  })

  assert.equal(checked.status, 'needs_review')
  assert.equal(checked.issueCount, 1)
  assert.equal(checked.events.at(-1).checkId, 'check_001')

  const noIssues = recordAgentTaskConsistency(bookPath, {
    taskId: defaultTask.id,
    issueCount: 'invalid'
  })
  assert.equal(noIssues.status, 'checked')
  assert.equal(noIssues.issueCount, 0)
  assert.equal(noIssues.events.at(-1).status, 'done')

  const repaired = recordAgentTaskRepair(bookPath, {
    taskId: task.id,
    sourceGenerationId: 'gen_001',
    repairGenerationId: 'gen_repair_001',
    checkId: 'check_001',
    issueCount: 1,
    review: { passed: true, score: 91, issues: [] },
    result: '林青在风雪里握紧剑柄，按人物档案修正了冲突。',
    steps: [
      {
        id: 'step_repair_context',
        stage: 'agent_context_loaded',
        role: 'tool',
        title: '读取作品资料',
        status: 'done',
        content: '已读取 1 类作品资料，约 220 字。来源：人物设定',
        bookContext: {
          loaded: true,
          sourceCount: 1,
          contextChars: 220,
          sources: [
            { type: 'characters', label: '人物设定', path: join(bookPath, 'characters.json') }
          ],
          preview: '【人物设定】\n姓名：林青',
          error: '',
          loadedAt: '2026-06-07T00:00:00.000Z'
        }
      },
      {
        id: 'step_repair_writer',
        stage: 'writer_repair',
        role: 'writer',
        title: 'Writer 生成返修稿',
        status: 'done',
        content: '林青在风雪里握紧剑柄，按人物档案修正了冲突。',
        modelUsed: 'writer-model',
        usage: { total_tokens: 140 }
      },
      {
        id: 'step_repair_editor',
        stage: 'editor_repair_review',
        role: 'editor',
        title: 'Editor 复核返修稿',
        status: 'done',
        content: '是否通过：通过。',
        modelUsed: 'writer-model',
        usage: { total_tokens: 70 }
      }
    ]
  })

  assert.equal(repaired.status, 'repaired')
  assert.equal(repaired.sourceGenerationId, 'gen_001')
  assert.equal(repaired.repairGenerationId, 'gen_repair_001')
  const repairContextEvents = repaired.events.filter((item) => item.type === 'agent_context_loaded')
  const repairContextEvent = repairContextEvents.at(-1)
  assert.equal(repairContextEvent.bookContext.sourceCount, 1)
  assert.equal(repairContextEvent.sources[0].type, 'characters')
  assert.equal(
    repaired.events.some((item) => item.type === 'writer_repair'),
    true
  )
  assert.equal(repaired.events.at(-1).type, 'repair_saved')
  assert.equal(repaired.events.at(-1).repairGenerationId, 'gen_repair_001')

  const reviewRepair = recordAgentTaskRepair(bookPath, {
    taskId: defaultTask.id,
    generationId: 'fallback_generation',
    issueCount: 'invalid',
    review: { passed: false },
    steps: 'invalid'
  })
  assert.equal(reviewRepair.status, 'repair_review_failed')
  assert.equal(reviewRepair.generationId, 'fallback_generation')
  assert.equal(reviewRepair.issueCount, 0)

  const explicitRepair = recordAgentTaskRepair(bookPath, {
    taskId: defaultTask.id,
    status: 'repair_pending',
    review: 'invalid'
  })
  assert.equal(explicitRepair.status, 'repair_pending')
  assert.equal(explicitRepair.review, null)

  const repairFailed = recordAgentTaskRepairFailure(
    bookPath,
    {
      taskId: task.id,
      sourceGenerationId: 'gen_001',
      checkId: 'check_002',
      issueCount: 2
    },
    new Error('返修模型超时')
  )

  assert.equal(repairFailed.status, 'repair_failed')
  assert.equal(repairFailed.error, '返修模型超时')
  assert.equal(repairFailed.events.at(-1).type, 'repair_failed')
  assert.equal(repairFailed.events.at(-1).checkId, 'check_002')

  const defaultRepairFailed = recordAgentTaskRepairFailure(bookPath, {
    taskId: defaultTask.id
  })
  assert.equal(defaultRepairFailed.error, '返修失败')

  const cancelled = cancelAgentTask(bookPath, task.id, {
    generationId: 'gen_001',
    content: '用户点击停止生成。'
  })

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.events.at(-1).type, 'task_cancelled')
  assert.equal(cancelled.events.at(-1).status, 'cancelled')
  assert.equal(cancelled.events.at(-1).content, '用户点击停止生成。')

  const defaultCancelled = cancelAgentTask(bookPath, defaultTask.id)
  assert.equal(defaultCancelled.events.at(-1).content, '用户停止生成。')

  const rows = listAgentTasks(bookPath, { generationId: 'gen_001' })
  assert.equal(rows.success, true)
  assert.equal(rows.tasks.length, 1)
  assert.equal(rows.tasks[0].id, task.id)
  assert.equal(fs.existsSync(join(bookPath, '.editor-agent', 'tasks.json')), true)
  assert.equal(listAgentTasks(bookPath, { id: task.id }).tasks.length, 1)
  assert.equal(listAgentTasks(bookPath, { taskId: task.id }).tasks.length, 1)
  assert.equal(listAgentTasks(bookPath, { chapterId: '不存在' }).tasks.length, 0)
  assert.equal(listAgentTasks(bookPath, { status: 'cancelled' }).tasks.length >= 1, true)
  assert.equal(listAgentTasks(bookPath, { type: 'continue' }).tasks.length, 1)
  assert.equal(listAgentTasks(bookPath, { agentMode: 'writing', limit: 1 }).tasks.length, 1)
  assert.equal(listAgentTasks(bookPath, { limit: 0 }).tasks.length >= 2, true)

  const queued = recordAgentTaskQueueEvent(bookPath, {
    taskId: 'queue_task_001',
    bookName: '风雪试剑',
    bookId: '风雪试剑',
    chapterId: '第二章',
    title: '队列写作 第二章',
    type: 'cli_write_queue',
    agentMode: 'auto_edit',
    queueName: 'novel-agent-writing',
    jobId: 'write:queue_task_001',
    executionMode: 'replace_chapter',
    status: 'queue_completed',
    eventType: 'queue_completed',
    eventTitle: '队列执行完成',
    generationId: 'gen_queue_001',
    repairGenerationId: 'gen_queue_repair_001',
    writeTaskId: 'inner_write_task_001',
    content: '已写入第二章，约 1200 字。写作任务：inner_write_task_001。'
  })

  assert.equal(queued.status, 'queue_completed')
  assert.equal(queued.generationId, 'gen_queue_001')
  assert.equal(queued.repairGenerationId, 'gen_queue_repair_001')
  assert.equal(queued.writeTaskId, 'inner_write_task_001')
  assert.equal(queued.events.at(-1).type, 'queue_completed')
  assert.equal(queued.events.at(-1).writeTaskId, 'inner_write_task_001')
  assert.equal(queued.events.at(-1).generationId, 'gen_queue_001')
  assert.equal(queued.events.at(-1).repairGenerationId, 'gen_queue_repair_001')

  const failed = failAgentTask(bookPath, 'task_failed_case', new Error('模型返回空内容'), {
    bookName: '风雪试剑',
    title: '重写本章',
    type: 'rewrite'
  })

  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, '模型返回空内容')
  assert.equal(failed.events.at(-1).type, 'task_failed')

  const defaultFailed = failAgentTask(bookPath, 'task_default_failed')
  assert.equal(defaultFailed.error, '任务失败')

  const stringFailed = failAgentTask(bookPath, 'task_string_failed', '字符串错误')
  assert.equal(stringFailed.error, '字符串错误')

  const taskStorePath = join(bookPath, '.editor-agent', 'tasks.json')
  const objectStore = fs.readFileSync(taskStorePath, 'utf8')
  const objectRows = JSON.parse(objectStore).tasks
  fs.writeFileSync(taskStorePath, JSON.stringify(objectRows), 'utf8')
  assert.equal(listAgentTasks(bookPath).tasks.length, objectRows.length)
  fs.writeFileSync(taskStorePath, 'null', 'utf8')
  assert.equal(listAgentTasks(bookPath).tasks.length, 0)
  fs.writeFileSync(taskStorePath, objectStore, 'utf8')

  // 损坏 JSON：隔离 .broken.* 并重建空 tasks.json，避免整本书 Agent 队列永久不可用
  fs.writeFileSync(taskStorePath, '{ broken json', 'utf8')
  const brokenList = listAgentTasks(bookPath)
  assert.equal(brokenList.tasks.length, 0)
  assert.ok(fs.existsSync(taskStorePath), '应重建 tasks.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(taskStorePath, 'utf8')), { tasks: [] })
  const brokenSnapshots = fs
    .readdirSync(join(bookPath, '.editor-agent'))
    .filter((name) => name.startsWith('tasks.json.broken.'))
  assert.ok(brokenSnapshots.length >= 1, '应隔离损坏文件到 .broken.*')
  assert.equal(
    fs.readFileSync(join(bookPath, '.editor-agent', brokenSnapshots[0]), 'utf8'),
    '{ broken json'
  )

  // 隔离后应可继续创建任务
  const recovered = createAgentTask(bookPath, { bookName: '风雪试剑', instruction: '继续写。' })
  assert.ok(recovered?.id)
  assert.equal(listAgentTasks(bookPath).tasks.length, 1)

  // 格式错误（tasks 非数组）：同样隔离重建
  const formatBrokenPayload = JSON.stringify({ tasks: { broken: true } })
  fs.writeFileSync(taskStorePath, formatBrokenPayload, 'utf8')
  const formatBrokenList = listAgentTasks(bookPath)
  assert.equal(formatBrokenList.tasks.length, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(taskStorePath, 'utf8')), { tasks: [] })
  const formatBrokenSnapshots = fs
    .readdirSync(join(bookPath, '.editor-agent'))
    .filter((name) => name.startsWith('tasks.json.broken.'))
  assert.ok(formatBrokenSnapshots.length >= 1, '格式错误也应隔离到 .broken.*')
  const quarantinedPayloads = formatBrokenSnapshots.map((name) =>
    fs.readFileSync(join(bookPath, '.editor-agent', name), 'utf8')
  )
  assert.ok(
    quarantinedPayloads.some((payload) => payload === formatBrokenPayload),
    '隔离快照应包含格式错误原文'
  )
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('editor agent task service tests passed')

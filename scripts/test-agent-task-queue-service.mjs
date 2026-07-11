import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  buildQueueRetryEvent,
  cancelAgentTaskQueueJob,
  closeAgentTaskQueue,
  enqueueAgentCheckTask,
  enqueueAgentRepairTask,
  enqueueAgentWriteTask,
  getAgentTaskQueueStatus,
  listAgentTaskQueueJobs,
  normalizeAgentTaskQueueProgress
} from '../src/main/services/agentTaskQueueService.js'
import {
  listConsistencyChecks,
  runConsistencyCheck
} from '../src/main/services/consistencyCheckService.js'
import { initNovelProject } from '../src/main/services/novelCliService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-queue-'))
const booksDir = join(rootDir, 'books')
const bookName = '队列试写'

const queueProgress = normalizeAgentTaskQueueProgress({
  bookPath: '/tmp/books/队列试写',
  taskId: 'task-queue-001',
  bookName,
  event: {
    id: 'event-queue-001',
    type: 'queue_active',
    title: '队列开始执行',
    status: 'running',
    jobId: 'write:task-queue-001'
  },
  task: {
    id: 'task-queue-001',
    bookName,
    bookId: bookName,
    chapterId: '第一章',
    status: 'running',
    updatedAt: '2026-06-07T02:00:00.000Z',
    events: []
  }
})
assert.equal(queueProgress.type, 'agent_task_updated')
assert.equal(queueProgress.taskId, 'task-queue-001')
assert.equal(queueProgress.bookName, bookName)
assert.equal(queueProgress.event.type, 'queue_active')
assert.equal(normalizeAgentTaskQueueProgress({ task: { id: '' }, event: {} }), null)

const firstAttemptRetryEvent = buildQueueRetryEvent(
  { attemptsMade: 1, opts: { attempts: 2 } },
  new Error('临时失败')
)
assert.equal(firstAttemptRetryEvent.status, 'retrying')
assert.equal(firstAttemptRetryEvent.eventType, 'queue_retrying')
assert.match(firstAttemptRetryEvent.content, /第 1 次执行失败，准备第 2 次执行，共 2 次/)
assert.match(firstAttemptRetryEvent.content, /临时失败/)
assert.equal(
  buildQueueRetryEvent({ attemptsMade: 1, opts: { attempts: 1 } }, new Error('最终失败')),
  null
)
assert.equal(
  buildQueueRetryEvent({ attemptsMade: 2, opts: { attempts: 2 } }, new Error('最终失败')),
  null
)

try {
  await initNovelProject({
    booksDir,
    bookName,
    intro: '验证真实队列入口。'
  })

  await assert.rejects(
    () =>
      enqueueAgentWriteTask({
        booksDir,
        bookName,
        volumeName: '第一卷',
        chapterName: '第一章',
        prompt: '写一章真实正文。',
        autoEdit: true
      }),
    /真实任务队列未启用/
  )

  await assert.rejects(() => getAgentTaskQueueStatus(), /真实任务队列未启用/)

  await assert.rejects(() => listAgentTaskQueueJobs(), /真实任务队列未启用/)

  await assert.rejects(
    () =>
      enqueueAgentCheckTask({
        booksDir,
        bookName,
        volumeName: '第一卷',
        chapterName: '第一章'
      }),
    /真实任务队列未启用/
  )

  await assert.rejects(
    () =>
      enqueueAgentRepairTask({
        booksDir,
        bookName,
        volumeName: '第一卷',
        chapterName: '第一章',
        currentText: '角色年龄写错，需要返修。',
        checkSummary: '发现年龄设定冲突。',
        issues: [{ severity: 'high', message: '年龄与人物设定冲突' }]
      }),
    /真实任务队列未启用/
  )

  await assert.rejects(
    () =>
      enqueueAgentRepairTask(
        {
          booksDir,
          bookName,
          volumeName: '第一卷',
          chapterName: '第一章',
          checkSummary: '发现年龄设定冲突。',
          issues: [{ severity: 'high', message: '年龄与人物设定冲突' }]
        },
        { enabled: true }
      ),
    /缺少要返修的正文/
  )

  await assert.rejects(
    () =>
      enqueueAgentRepairTask(
        {
          booksDir,
          bookName,
          volumeName: '第一卷',
          chapterName: '第一章',
          currentText: '角色年龄写错，需要返修。'
        },
        { enabled: true }
      ),
    /缺少一致性检查问题/
  )

  await assert.rejects(() => cancelAgentTaskQueueJob({ jobId: 'write:test' }), /真实任务队列未启用/)

  const helpCli = spawnSync(process.execPath, [join(process.cwd(), 'bin', 'novel.js'), '--help'], {
    encoding: 'utf-8'
  })
  assert.equal(helpCli.status, 0)
  assert.match(helpCli.stdout, /--attempts <num>/)
  assert.match(helpCli.stdout, /--backoff-delay-ms <ms>/)
  assert.match(helpCli.stdout, /--jobs/)
  assert.match(helpCli.stdout, /queue-repair/)
  assert.match(helpCli.stdout, /--issues-file <file>/)

  const cli = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'bin', 'novel.js'),
      'queue-write',
      '--books-dir',
      booksDir,
      '--book',
      bookName,
      '--chapter',
      '第一章',
      '--prompt',
      '写一章真实正文。',
      '--json'
    ],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        AGENT_TASK_QUEUE_ENABLED: ''
      }
    }
  )
  assert.equal(cli.status, 1)
  assert.match(cli.stderr, /真实任务队列未启用/)

  const checkCli = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'bin', 'novel.js'),
      'queue-check',
      '--books-dir',
      booksDir,
      '--book',
      bookName,
      '--volume',
      '第一卷',
      '--chapter',
      '第一章',
      '--json'
    ],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        AGENT_TASK_QUEUE_ENABLED: ''
      }
    }
  )
  assert.equal(checkCli.status, 1)
  assert.match(checkCli.stderr, /真实任务队列未启用/)

  const issuesFile = join(rootDir, 'repair-issues.json')
  fs.writeFileSync(
    issuesFile,
    JSON.stringify([{ severity: 'high', message: '人物设定冲突', evidence: '原文片段' }], null, 2),
    'utf-8'
  )
  const repairCli = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'bin', 'novel.js'),
      'queue-repair',
      '--books-dir',
      booksDir,
      '--book',
      bookName,
      '--volume',
      '第一卷',
      '--chapter',
      '第一章',
      '--text',
      '角色年龄写错，需要返修。',
      '--issues-file',
      issuesFile,
      '--json'
    ],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        AGENT_TASK_QUEUE_ENABLED: ''
      }
    }
  )
  assert.equal(repairCli.status, 1)
  assert.match(repairCli.stderr, /真实任务队列未启用/)

  const cancelCli = spawnSync(
    process.execPath,
    [join(process.cwd(), 'bin', 'novel.js'), 'queue-cancel', '--job-id', 'write:test', '--json'],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        AGENT_TASK_QUEUE_ENABLED: ''
      }
    }
  )
  assert.equal(cancelCli.status, 1)
  assert.match(cancelCli.stderr, /真实任务队列未启用/)

  const abortController = new AbortController()
  abortController.abort('测试停止检查')
  await assert.rejects(
    () =>
      runConsistencyCheck({
        bookPath: join(booksDir, bookName),
        bookName,
        text: '测试正文',
        signal: abortController.signal
      }),
    (error) =>
      error?.name === 'AbortError' &&
      error?.cancelled === true &&
      /测试停止检查/.test(error.message)
  )
  const checks = listConsistencyChecks({ bookPath: join(booksDir, bookName) })
  assert.equal(checks.checks.length, 0)

  const closeResult = await closeAgentTaskQueue({
    queueName: 'agent-task-test',
    redisUrl: 'redis://127.0.0.1:1'
  })
  assert.equal(closeResult.success, true)
  assert.equal(closeResult.queueName, 'agent-task-test')
  assert.equal(closeResult.redisUrl, 'redis://127.0.0.1:1')
  assert.equal(closeResult.closedWorker, false)
  assert.equal(closeResult.closedQueue, false)
  assert.equal(closeResult.abortedActiveJobs, 0)
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('agent task queue service tests passed')

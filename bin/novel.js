#!/usr/bin/env node
import fs from 'node:fs'
import { resolve } from 'node:path'
import {
  exportNovelBook,
  generateNovelOutline,
  initNovelProject,
  listNovelTasks,
  researchNovelMarket,
  runNovelLifecycle,
  writeNovelChapter,
  writeNovelChapters
} from '../src/main/services/novelCliService.js'
import {
  cancelAgentTaskQueueJob,
  enqueueAgentCheckTask,
  enqueueAgentRepairTask,
  enqueueAgentWriteTask,
  getAgentTaskQueueJob,
  getAgentTaskQueueStatus,
  listAgentTaskQueueJobs,
  startAgentTaskWorker
} from '../src/main/services/agentTaskQueueService.js'

const HELP_TEXT = `
novel - AI 小说工作台命令行

用法：
  novel init --books-dir <dir> --book <name>
  novel research --books-dir <dir> --sources <qidian,fanqie> [--force]
  novel outline --books-dir <dir> --book <name> --idea <text> --count <num>
  novel write --books-dir <dir> --book <name> --volume <name> --chapter <name> --prompt <text> --auto-edit
  novel queue-write --books-dir <dir> --book <name> --volume <name> --chapter <name> --prompt <text> --auto-edit
  novel queue-check --books-dir <dir> --book <name> --volume <name> --chapter <name> [--use-llm-check]
  novel queue-repair --books-dir <dir> --book <name> --volume <name> --chapter <name> --text-file <file> --issues-file <file>
  novel queue-worker
  novel queue-status [--job-id <id>] [--jobs]
  novel queue-cancel --job-id <id>
  novel run --books-dir <dir> --book <name> --idea <text> --sources <qidian,fanqie> --chapters <num> --auto-edit
  novel tasks --books-dir <dir> --book <name> [--status <status>] [--id <taskId>]
  novel export --books-dir <dir> --book <name> --format <txt|md|project>

选项：
  --books-dir <dir>       书库目录，也可使用 NOVEL_BOOKS_DIR
  --book <name>           书名
  --volume <name>         卷名，默认 正文
  --chapter <name>        章节名，默认 第1章
  --prompt <text>         写作要求
  --prompt-file <file>    从文件读取写作要求
  --text <text>           待检查正文；不传时按卷名和章节名读取正文文件
  --text-file <file>      从文件读取待检查正文
  --current-text <text>   待返修正文，未传时复用 --text
  --current-text-file <file> 从文件读取待返修正文，未传时复用 --text-file
  --source-generation-id <id> 原生成记录 ID
  --source-text <text>    原生成稿文本
  --source-text-file <file> 从文件读取原生成稿文本
  --issues-file <file>    从 JSON 文件读取一致性问题，支持数组或 { "issues": [...] }
  --check-id <id>         一致性检查记录 ID
  --check-summary <text>  一致性检查摘要
  --use-llm-check         检查队列显式启用 LLM 检查；默认只做规则检查
  --skip-llm              检查队列跳过 LLM 检查
  --idea <text>           大纲方向
  --sources <list>        市场来源，逗号分隔，如 qidian,fanqie
  --force                 忽略市场缓存，重新请求来源
  --count <num>           大纲段数，默认 10
  --chapters <num>        连续写作章节数，默认使用大纲段数
  --start <num>           连续写作起始章节序号，默认 1
  --outline-id <id>       从指定大纲节点读取章节计划
  --resume                续跑多章写作，跳过已经存在且非空的章节
  --refresh-market        生成大纲前刷新市场数据
  --save-mode <mode>      大纲保存方式，append 或 replace
  --target-words <num>    目标字数，默认 2000
  --model-id <id>         文本模型 ID，如 env:deepseek::deepseek-chat
  --provider-id <id>      文本 Provider ID
  --model <name>          模型名
  --auto-edit             Writer 生成后由 Editor 审核，不通过则重写；写入后执行一致性检查和必要返修
  --queue-name <name>     BullMQ 队列名，默认 novel-agent-writing
  --redis-url <url>       Redis 地址，也可使用 REDIS_URL
  --concurrency <num>     队列 worker 并发数，默认 1
  --attempts <num>        队列任务尝试次数，默认 1；大于 1 时失败后按指数等待
  --backoff-delay-ms <ms> 队列任务首次重试等待毫秒数，默认 3000
  --job-id <id>           查看指定 BullMQ 任务
  --jobs                  查看最近 BullMQ 任务列表
  --no-stream             不在终端输出 Writer 的流式正文片段
  --status <status>       筛选任务记录状态
  --id <taskId>           查看指定任务记录
  --limit <num>           限制任务记录数量
  --json                  输出 JSON
  --help                  显示帮助
`.trim()

function camelCase(flag) {
  return flag.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args[0] && !args[0].startsWith('--') ? args.shift() : 'help'
  const options = {}
  const positional = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2)
    const key = camelCase(rawKey)
    if (inlineValue !== undefined) {
      options[key] = inlineValue
      continue
    }

    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
      continue
    }

    options[key] = next
    index++
  }

  return { command, options, positional }
}

function readPrompt(options) {
  if (options.promptFile) {
    return fs.readFileSync(resolve(String(options.promptFile)), 'utf-8')
  }
  return options.prompt || ''
}

function readTextInput(options) {
  if (options.textFile) {
    return fs.readFileSync(resolve(String(options.textFile)), 'utf-8')
  }
  return options.text || ''
}

function readRepairTextInput(options) {
  if (options.currentTextFile) {
    return fs.readFileSync(resolve(String(options.currentTextFile)), 'utf-8')
  }
  if (options.currentText !== undefined) return options.currentText || ''
  return readTextInput(options)
}

function readSourceTextInput(options) {
  if (options.sourceTextFile) {
    return fs.readFileSync(resolve(String(options.sourceTextFile)), 'utf-8')
  }
  return options.sourceText || options.sourceResult || ''
}

function readIssuesInput(options) {
  if (!options.issuesFile) return []
  const filePath = resolve(String(options.issuesFile))
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.issues)) return parsed.issues
  throw new Error('issues-file 必须是 JSON 数组或包含 issues 数组的对象')
}

function commonInput(options) {
  return {
    booksDir: options.booksDir || process.env.NOVEL_BOOKS_DIR,
    bookName: options.book,
    modelId: options.modelId,
    providerId: options.providerId,
    model: options.model,
    modelName: options.modelName
  }
}

function queueOptions(options) {
  const result = {
    queueName: options.queueName,
    redisUrl: options.redisUrl,
    concurrency: options.concurrency,
    attempts: options.attempts,
    backoffDelayMs: options.backoffDelayMs
  }
  if (options.queueEnabled !== undefined) {
    result.enabled = optionEnabled(options.queueEnabled, false)
  }
  return result
}

function optionEnabled(value, fallback = false) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  const text = String(value || '').trim().toLowerCase()
  if (['false', '0', 'no', 'off'].includes(text)) return false
  if (['true', '1', 'yes', 'on'].includes(text)) return true
  return Boolean(value)
}

function streamOptions(options) {
  const stream = !optionEnabled(options.noStream, false)
  if (!stream || options.json) return { stream }
  let currentStage = ''
  return {
    stream,
    onChunk: ({ content, stage, title }) => {
      if (stage && stage !== currentStage) {
        currentStage = stage
        process.stdout.write(`\n[${title || stage}]\n`)
      }
      process.stdout.write(content)
    }
  }
}

function createCliAbortContext() {
  const controller = new AbortController()
  let requested = false
  const handlers = []

  function requestStop(signalName) {
    if (requested) {
      process.exit(130)
    }
    requested = true
    const message = signalName === 'SIGTERM' ? 'CLI 进程已请求停止' : 'CLI 写作已停止'
    controller.abort(message)
    if (process.stderr.isTTY) process.stderr.write(`\n${message}，正在保存任务记录...\n`)
  }

  for (const signalName of ['SIGINT', 'SIGTERM']) {
    const handler = () => requestStop(signalName)
    process.once(signalName, handler)
    handlers.push([signalName, handler])
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const [signalName, handler] of handlers) {
        process.removeListener(signalName, handler)
      }
    }
  }
}

function isCliAbortError(error = {}) {
  const message = String(error?.message || '')
  return Boolean(
    error?.cancelled ||
      error?.name === 'AbortError' ||
      message.includes('CLI 写作已停止') ||
      message.includes('请求已停止') ||
      /cancel|abort/i.test(message)
  )
}

function printResult(options, result, message) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(message)
}

function writeSummary(result) {
  const skipped = Number(result.skippedCount || 0)
  const skippedText = skipped ? `，跳过 ${skipped} 章` : ''
  return `已连续写入 ${result.count} 章${skippedText}，总计约 ${result.totalWordCount} 字，作品 ${result.bookName}`
}

function taskStatusText(status = '') {
  const texts = {
    running: '运行中',
    generated: '已生成',
    review_failed: '审核未通过',
    applied: '已应用',
    checked: '已检查',
    needs_review: '需处理',
    repaired: '已返修',
    repair_failed: '返修失败',
    repair_review_failed: '返修审核未通过',
    failed: '失败',
    cancelled: '已停止',
    streamed: '已输出'
  }
  return texts[status] || status || '未知'
}

function printTaskList(result) {
  const tasks = Array.isArray(result.tasks) ? result.tasks : []
  if (!tasks.length) {
    console.log(`未找到任务记录：${result.bookName}`)
    return
  }
  console.log(`任务记录：${result.bookName}，共 ${result.count} 条`)
  for (const [index, task] of tasks.entries()) {
    const title = task.title || task.type || 'Agent 任务'
    const chapter = task.chapterId ? ` / ${task.chapterId}` : ''
    const time = task.updatedAt || task.createdAt || ''
    console.log(`${index + 1}. ${task.id} [${taskStatusText(task.status)}] ${title}${chapter}${time ? ` · ${time}` : ''}`)
    if (task.error) console.log(`   错误：${task.error}`)
    const event = Array.isArray(task.events) ? task.events.at(-1) : null
    if (event?.title) console.log(`   最近事件：${event.title}${event.status ? ` / ${taskStatusText(event.status)}` : ''}`)
  }
}

async function run() {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (command === 'help' || options.help) {
    console.log(HELP_TEXT)
    return
  }

  if (command === 'init') {
    const result = await initNovelProject({
      ...commonInput(options),
      intro: options.intro,
      targetCount: options.targetCount
    })
    printResult(options, result, `${result.existed ? '已存在' : '已创建'}：${result.bookName}`)
    return
  }

  if (command === 'research') {
    const result = await researchNovelMarket({
      ...commonInput(options),
      sources: options.sources || options.source,
      sourceFilter: options.sourceFilter,
      channel: options.channel,
      limit: options.limit,
      force: Boolean(options.force),
      cacheTtlMs: options.cacheTtlMs,
      timeoutMs: options.timeoutMs
    })
    printResult(options, result, `已刷新市场数据：${result.topics.length} 条热点，新增 ${result.inserted} 条`)
    return
  }

  if (command === 'outline') {
    const result = await generateNovelOutline({
      ...commonInput(options),
      idea: options.idea || readPrompt(options),
      title: options.title,
      count: options.count,
      mode: options.mode,
      saveMode: options.saveMode,
      refreshMarket: Boolean(options.refreshMarket),
      useMarket: options.useMarket !== false,
      sources: options.sources || options.source,
      sourceFilter: options.sourceFilter,
      channel: options.channel,
      marketLimit: options.marketLimit || options.limit,
      force: Boolean(options.force),
      cacheTtlMs: options.cacheTtlMs,
      timeoutMs: options.timeoutMs
    })
    printResult(options, result, `已生成大纲：${result.title}，共 ${result.count} 段`)
    return
  }

  if (command === 'write') {
    const abortContext = createCliAbortContext()
    if (options.chapters || options.outlineId) {
      try {
        const result = await writeNovelChapters({
          ...commonInput(options),
          volumeName: options.volume,
          outlineId: options.outlineId,
          prompt: readPrompt(options),
          targetWords: options.targetWords,
          autoEdit: optionEnabled(options.autoEdit, false),
          chapters: options.chapters,
          start: options.start,
          resume: optionEnabled(options.resume, false),
          ...streamOptions(options),
          signal: abortContext.signal
        })
        if (!options.json && !optionEnabled(options.noStream, false)) process.stdout.write('\n')
        printResult(options, result, writeSummary(result))
      } finally {
        abortContext.dispose()
      }
      return
    }

    try {
      const result = await writeNovelChapter({
        ...commonInput(options),
        volumeName: options.volume,
        chapterName: options.chapter,
        prompt: readPrompt(options),
        targetWords: options.targetWords,
        autoEdit: optionEnabled(options.autoEdit, false),
        ...streamOptions(options),
        signal: abortContext.signal
      })
      if (!options.json && !optionEnabled(options.noStream, false)) process.stdout.write('\n')
      printResult(
        options,
        result,
        `已写入 ${result.bookName} / ${result.volumeName} / ${result.chapterName}，约 ${result.wordCount} 字，任务 ${result.taskId}`
      )
    } finally {
      abortContext.dispose()
    }
    return
  }

  if (command === 'queue-write') {
    const result = await enqueueAgentWriteTask(
      {
        ...commonInput(options),
        volumeName: options.volume,
        chapterName: options.chapter,
        prompt: readPrompt(options),
        targetWords: options.targetWords,
        autoEdit: optionEnabled(options.autoEdit, false)
      },
      queueOptions(options)
    )
    printResult(options, result, `已加入队列：${result.queueName} / ${result.jobId}，任务 ${result.taskId}`)
    return
  }

  if (command === 'queue-check') {
    const result = await enqueueAgentCheckTask(
      {
        ...commonInput(options),
        volumeName: options.volume,
        chapterName: options.chapter,
        text: readTextInput(options),
        useLlm: optionEnabled(options.useLlmCheck || options.aiCheck || options.enableLlm, false),
        skipLlm: optionEnabled(options.skipLlm, false),
        generationId: options.generationId,
        taskType: options.taskType,
        applyAction: options.applyAction,
        source: options.source,
        envCwd: process.cwd()
      },
      queueOptions(options)
    )
    printResult(options, result, `已加入检查队列：${result.queueName} / ${result.jobId}，任务 ${result.taskId}`)
    return
  }

  if (command === 'queue-repair') {
    const result = await enqueueAgentRepairTask(
      {
        ...commonInput(options),
        volumeName: options.volume,
        chapterName: options.chapter,
        prompt: readPrompt(options),
        currentText: readRepairTextInput(options),
        sourceText: readSourceTextInput(options),
        sourceGenerationId: options.sourceGenerationId || options.generationId,
        checkId: options.checkId,
        checkSummary: options.checkSummary,
        issues: readIssuesInput(options),
        targetWords: options.targetWords,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      },
      queueOptions(options)
    )
    printResult(options, result, `已加入返修队列：${result.queueName} / ${result.jobId}，任务 ${result.taskId}`)
    return
  }

  if (command === 'queue-worker') {
    const result = await startAgentTaskWorker(queueOptions(options))
    printResult(options, result, `队列 worker 已启动：${result.queueName}`)
    await new Promise(() => {})
    return
  }

  if (command === 'queue-status') {
    const result = options.jobId
      ? await getAgentTaskQueueJob(options.jobId, queueOptions(options))
      : optionEnabled(options.jobs, false)
        ? await listAgentTaskQueueJobs({ ...queueOptions(options), limit: options.limit, types: options.types })
      : await getAgentTaskQueueStatus(queueOptions(options))
    printResult(
      options,
      result,
      options.jobId
        ? `队列任务：${options.jobId}`
        : optionEnabled(options.jobs, false)
          ? `最近队列任务：${result.queueName}，共 ${result.jobs?.length || 0} 个`
          : `队列状态：${result.queueName}`
    )
    return
  }

  if (command === 'queue-cancel') {
    const result = await cancelAgentTaskQueueJob({ jobId: options.jobId }, queueOptions(options))
    const message = result.cancellationRequested ? '已请求停止队列任务' : '已停止队列任务'
    printResult(options, result, `${message}：${result.queueName} / ${result.jobId}`)
    return
  }

  if (command === 'run') {
    const abortContext = createCliAbortContext()
    try {
      const result = await runNovelLifecycle({
        ...commonInput(options),
        idea: options.idea || readPrompt(options),
        sources: options.sources || options.source,
        sourceFilter: options.sourceFilter,
        channel: options.channel,
        limit: options.limit,
        marketLimit: options.marketLimit || options.limit,
        count: options.count,
        chapters: options.chapters,
        volumeName: options.volume,
        targetWords: options.targetWords,
        autoEdit: optionEnabled(options.autoEdit, true),
        resume: optionEnabled(options.resume, false),
        force: Boolean(options.force),
        cacheTtlMs: options.cacheTtlMs,
        timeoutMs: options.timeoutMs,
        saveMode: options.saveMode,
        format: options.format || 'md',
        ...streamOptions(options),
        signal: abortContext.signal
      })
      if (!options.json && !optionEnabled(options.noStream, false)) process.stdout.write('\n')
      printResult(
        options,
        result,
        `已完成 CLI 流程：${result.bookName}，${writeSummary(result.writing)}`
      )
    } finally {
      abortContext.dispose()
    }
    return
  }

  if (command === 'tasks') {
    const result = listNovelTasks({
      ...commonInput(options),
      id: options.id,
      taskId: options.taskId,
      generationId: options.generationId,
      chapterId: options.chapterId || options.chapter,
      status: options.status,
      type: options.type,
      agentMode: options.agentMode,
      limit: options.limit
    })
    if (options.json) {
      printResult(options, result, '')
      return
    }
    printTaskList(result)
    return
  }

  if (command === 'export') {
    const result = exportNovelBook({
      ...commonInput(options),
      format: options.format || 'txt'
    })
    printResult(options, result, `已导出：${result.filePath}`)
    return
  }

  throw new Error(`未知命令：${command}\n\n${HELP_TEXT}`)
}

run().catch((error) => {
  console.error(error.message || String(error))
  process.exit(isCliAbortError(error) ? 130 : 1)
})

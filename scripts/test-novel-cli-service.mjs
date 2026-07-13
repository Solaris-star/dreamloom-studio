import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  exportNovelBook,
  generateNovelOutline,
  initNovelProject,
  listNovelTasks,
  repairNovelChapter,
  researchNovelMarket,
  runNovelLifecycle,
  writeNovelChapter,
  writeNovelChapters
} from '../src/main/services/novelCliService.js'
import marketService from '../src/main/services/marketService.js'
import {
  getNovelDatabasePath,
  openNovelDatabase
} from '../src/main/services/novelDatabaseService.js'

const ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'CUSTOM_TEXT_API_KEY',
  'CUSTOM_TEXT_BASE_URL',
  'CUSTOM_TEXT_MODEL',
  'CUSTOM_TEXT_MODELS',
  'CUSTOM_TEXT_API_TYPE',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL'
]

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-cli-'))
const booksDir = join(rootDir, 'books')
const emptyEnvDir = join(rootDir, 'empty-env')
const bookName = '风雪试剑'

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function requestText(request = {}) {
  return (request.messages || []).map((message) => message?.content || '').join('\n')
}

function createOfflineProvider() {
  const calls = []
  const requests = []
  function responseFor(options) {
    const requestId = String(options.requestId || '')
    if (requestId.includes('writer_rewrite')) {
      return {
        content: '林青在山门前遇到追兵。正午日光刺眼，月影术被她强行施展，寒光随剑锋一同掠过石阶。',
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 120 }
      }
    }
    if (requestId.includes('writer_repair')) {
      return {
        content: '林青在夜色里赶到山门。她确认月影术只能夜里使用，便借月光施展身法，避开追兵。',
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 130 }
      }
    }
    if (requestId.includes('editor_review')) {
      return {
        content: JSON.stringify({
          passed: false,
          score: 62,
          issues: ['初稿明显偏离写作要求'],
          revisionInstruction: '改成完整正文，保留主角行动。'
        }),
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 70 }
      }
    }
    if (requestId.includes('editor_rewrite_review') || requestId.includes('editor_repair_review')) {
      return {
        content: JSON.stringify({
          passed: true,
          score: 91,
          issues: [],
          revisionInstruction: ''
        }),
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 72 }
      }
    }
    if (requestId.includes('outline_split')) {
      return {
        content: JSON.stringify({
          items: [
            {
              title: '第一章 追兵入山',
              content: '林青在夜色中抵达山门，发现追兵已经封住下山路。',
              summary: '追兵逼近，主角入山。',
              goals: '建立追杀压力。',
              conflict: '追兵与林青正面冲突。',
              progression: '林青借月影术脱身。',
              resultHint: '山门里还有内应。'
            },
            {
              title: '第二章 月影试剑',
              content: '林青用月影术试剑，发现术法只能在夜里稳定生效。',
              summary: '主角确认能力限制。',
              goals: '写清能力规则。',
              conflict: '能力限制带来新风险。',
              progression: '她开始寻找师门旧案线索。',
              resultHint: '旧案牵出师门叛徒。'
            },
            {
              title: '第三章 旧案开封',
              content: '林青找到旧案卷宗，知道追兵不是唯一敌人。',
              summary: '主线扩大。',
              goals: '引出长期目标。',
              conflict: '外敌与内鬼同时出现。',
              progression: '她决定留下查明真相。',
              resultHint: '内鬼盯上了她。'
            }
          ]
        }),
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 210 }
      }
    }
    if (requestId.includes('outline_chapter_')) {
      return {
        content:
          '林澈在云海港口连夜查问姐姐的下落，沿着旧航道留下的线索潜入商路，发现宗门旧案与失踪事件已经连到一起。',
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 160 }
      }
    }
    if (requestId.includes('book_idea_')) {
      return {
        content: JSON.stringify({
          plans: [
            {
              id: 'idea-1',
              title: '云海追影',
              type: 'xuanhua',
              intro: '少年在云海商路中寻找失踪的姐姐，途中卷入宗门旧案。',
              protagonist: '林澈',
              coreHook: '云海商路与宗门秘案并行推进',
              worldRules: ['云海航道只在特定潮汐开放', '术法会受风压影响'],
              conflicts: ['追兵逼近', '旧案重启'],
              settings: ['云海商路', '宗门旧案'],
              firstChapters: ['入港', '失踪线索', '第一次追杀']
            }
          ]
        }),
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 180 }
      }
    }
    if (requestId.includes('setting_tree_')) {
      return {
        content: JSON.stringify({
          categories: [
            {
              name: '世界',
              introduction: '云海商路与山门旧案相关设定。',
              items: [{ name: '云海航道', introduction: '只在潮汐窗口开放。' }]
            },
            {
              name: '人物',
              introduction: '主角与配角设定。',
              items: [{ name: '林澈', introduction: '寻找姐姐的少年。' }]
            }
          ]
        }),
        providerId: 'offline-cli-provider',
        model: options.model || 'offline-model',
        usage: { total_tokens: 92 }
      }
    }
    return {
      content: '林青是男儿身的传闻传遍山门。正午日光刺眼，月影术被她强行施展。',
      providerId: 'offline-cli-provider',
      model: options.model || 'offline-model',
      usage: { total_tokens: 110 }
    }
  }

  const provider = {
    providerId: 'offline-cli-provider',
    calls,
    async chat(options) {
      calls.push(options.requestId)
      requests.push(options)
      return responseFor(options)
    },
    async streamChat(options) {
      calls.push(options.requestId)
      requests.push(options)
      const response = responseFor(options)
      const pieces = response.content.match(/.{1,8}/g) || []
      return {
        async *[Symbol.asyncIterator]() {
          for (const piece of pieces) {
            yield {
              content: piece,
              done: false,
              providerId: response.providerId,
              model: response.model,
              usage: {}
            }
          }
          yield {
            content: '',
            done: true,
            providerId: response.providerId,
            model: response.model,
            usage: response.usage
          }
        }
      }
    }
  }
  provider.requests = requests
  return provider
}

function createAbortableProvider(abortController) {
  const calls = []
  const provider = {
    providerId: 'abortable-cli-provider',
    calls,
    async chat(options) {
      calls.push(options.requestId)
      if (options.signal?.aborted) throw options.signal.reason || new Error('CLI 写作已停止')
      return {
        content: JSON.stringify({
          passed: true,
          score: 90,
          issues: [],
          revisionInstruction: ''
        }),
        providerId: 'abortable-cli-provider',
        model: options.model || 'abortable-model',
        usage: { total_tokens: 10 }
      }
    },
    async streamChat(options) {
      calls.push(options.requestId)
      return {
        async *[Symbol.asyncIterator]() {
          yield {
            content: '林青刚要拔剑',
            done: false,
            providerId: 'abortable-cli-provider',
            model: options.model || 'abortable-model',
            usage: {}
          }
          abortController.abort('CLI 写作已停止')
          yield {
            content: '，这一段不应写入文件。',
            done: false,
            providerId: 'abortable-cli-provider',
            model: options.model || 'abortable-model',
            usage: {}
          }
        }
      }
    }
  }
  return provider
}

function createChatOnlyProvider(responseFactory) {
  const requests = []
  return {
    providerId: 'chat-only-cli-provider',
    requests,
    async chat(options) {
      requests.push(options)
      return responseFactory(options)
    }
  }
}

try {
  fs.mkdirSync(emptyEnvDir, { recursive: true })

  await assert.rejects(() => initNovelProject({ booksDir }), /缺少书籍名称/)
  await assert.rejects(() => initNovelProject({ bookName: '缺少书库' }), /缺少书库目录/)
  await assert.rejects(
    () => generateNovelOutline({ booksDir, idea: '生成大纲' }),
    /缺少书籍名称/
  )
  await assert.rejects(
    () => generateNovelOutline({ booksDir, bookName }),
    /缺少大纲方向/
  )
  await assert.rejects(
    () => generateNovelOutline({ booksDir, bookName, idea: '生成大纲', count: 1 }),
    /大纲段数无效/
  )
  await assert.rejects(
    () => generateNovelOutline({ booksDir, bookName, idea: '生成大纲', count: 'invalid' }),
    /大纲段数无效/
  )
  await assert.rejects(
    () => writeNovelChapters({ booksDir, targetWords: 100 }),
    /缺少书籍名称/
  )
  await assert.rejects(
    () => writeNovelChapters({ booksDir, bookName, targetWords: -1 }),
    /目标字数无效/
  )
  await assert.rejects(
    () => writeNovelChapter({ booksDir, prompt: '写一章' }),
    /缺少书籍名称/
  )
  await assert.rejects(
    () => writeNovelChapter({ booksDir, bookName }),
    /缺少写作要求/
  )
  await assert.rejects(
    () => writeNovelChapter({ booksDir, bookName, prompt: '写一章', targetWords: -1 }),
    /目标字数无效/
  )
  await assert.rejects(
    () => repairNovelChapter({ booksDir }),
    /缺少书籍名称/
  )
  await assert.rejects(
    () => repairNovelChapter({ booksDir, bookName }),
    /缺少要返修的正文/
  )
  await assert.rejects(
    () =>
      repairNovelChapter({
        booksDir,
        bookName,
        currentText: '待返修正文'
      }),
    /缺少一致性检查问题/
  )
  await assert.rejects(
    () => runNovelLifecycle({ booksDir, idea: '创作一本书' }),
    /缺少书籍名称/
  )
  await assert.rejects(
    () => runNovelLifecycle({ booksDir, bookName }),
    /缺少创作方向/
  )
  assert.throws(() => exportNovelBook({ booksDir }), /缺少书籍名称/)
  assert.throws(() => listNovelTasks({ booksDir }), /缺少书籍名称/)

  const initResult = await initNovelProject({
    booksDir,
    bookName,
    intro: '少女入山寻剑。'
  })
  assert.equal(initResult.success, true)
  assert.equal(initResult.bookName, bookName)
  assert.equal(fs.existsSync(initResult.bookPath), true)
  assert.equal(fs.existsSync(join(booksDir, bookName, 'mazi.json')), true)

  const reusedInitResult = await initNovelProject({
    booksDir,
    bookName,
    intro: '重复初始化不应覆盖已有作品。'
  })
  assert.equal(reusedInitResult.success, true)
  assert.equal(reusedInitResult.existed, true)

  fs.mkdirSync(join(booksDir, '无效已有目录'), { recursive: true })
  await assert.rejects(
    () => initNovelProject({ booksDir, bookName: '无效已有目录' }),
    /目标目录已存在，但不是有效书籍/
  )

  const cachedAt = new Date().toISOString()
  fs.mkdirSync(join(booksDir, 'market'), { recursive: true })
  fs.writeFileSync(
    join(booksDir, 'market', 'source-cache.json'),
    JSON.stringify(
      {
        version: 1,
        updatedAt: cachedAt,
        items: [
          {
            source: 'qidian',
            createdAt: cachedAt,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            ttlMs: 60_000,
            result: {
              source: 'qidian',
              success: true,
              topics: [
                {
                  id: 'qidian-cache-1',
                  source: 'qidian',
                  platform: '起点',
                  keyword: '寒门剑修',
                  title: '寒门剑修登榜',
                  url: 'https://m.qidian.com/book/1',
                  heatIndex: 9800,
                  normalizedHeat: 98,
                  capturedAt: cachedAt,
                  tags: ['仙侠', '升级']
                }
              ],
              message: '',
              latencyMs: 12
            }
          }
        ]
      },
      null,
      2
    ),
    'utf-8'
  )
  const researchResult = await researchNovelMarket({
    booksDir,
    sources: 'qidian',
    limit: 5,
    cacheTtlMs: 60_000
  })
  assert.equal(researchResult.success, true)
  assert.equal(researchResult.fromCache, true)
  assert.equal(researchResult.cacheTypes.includes('persistent'), true)
  assert.equal(researchResult.topics.length > 0, true)
  assert.equal(researchResult.topics[0].title, '寒门剑修登榜')

  const originalRefreshMarketTrends = marketService.refreshMarketTrends
  try {
    marketService.refreshMarketTrends = async () => ({})
    await assert.rejects(
      () =>
        researchNovelMarket({
          booksDir,
          sources: 'qidian',
          limit: 5
        }),
      /市场数据刷新失败/
    )
    marketService.refreshMarketTrends = async () => ({
      success: true,
      sources: ['qidian'],
      results: [],
      topics: [],
      sourceStatus: [],
      collectionLogs: [],
      inserted: 0,
      updated: 0
    })
    await assert.rejects(
      () =>
        researchNovelMarket({
          booksDir,
          sources: 'qidian',
          limit: 5
        }),
      /没有真实来源结果/
    )
  } finally {
    marketService.refreshMarketTrends = originalRefreshMarketTrends
  }

  const outlineProvider = createOfflineProvider()
  const outlineResult = await generateNovelOutline({
    booksDir,
    bookName,
    idea: '少女入山寻剑，追查师门旧案。',
    count: 3,
    useMarket: false,
    saveMode: 'replace',
    textProvider: outlineProvider,
    model: 'offline-model'
  })
  assert.equal(outlineResult.success, true)
  assert.equal(outlineResult.count, 3)
  assert.equal(Boolean(outlineResult.outlineId), true)
  assert.equal(
    outlineProvider.calls.some((id) => id.includes('outline_split')),
    true
  )

  const outlines = readJson(join(booksDir, bookName, 'outlines.json'))
  assert.equal(outlines.children.length, 1)
  assert.equal(outlines.children[0].title, '风雪试剑 全书大纲')
  assert.equal(outlines.children[0].children.length, 3)

  const invalidOutlineProvider = createChatOnlyProvider(() => ({
    content: '这不是可解析的大纲',
    providerId: 'invalid-outline-provider'
  }))
  await assert.rejects(
    () =>
      generateNovelOutline({
        booksDir,
        bookName,
        idea: '返回无法解析的内容。',
        count: 2,
        useMarket: false,
        textProvider: invalidOutlineProvider
      }),
    /AI 大纲解析失败/
  )

  const emptyOutlineProvider = createChatOnlyProvider(() => ({
    content: JSON.stringify({ items: [] }),
    providerId: 'empty-outline-provider'
  }))
  await assert.rejects(
    () =>
      generateNovelOutline({
        booksDir,
        bookName,
        idea: '返回空大纲。',
        count: 2,
        useMarket: false,
        textProvider: emptyOutlineProvider
      }),
    /AI 大纲解析失败/
  )

  const marketOutlineProvider = createOfflineProvider()
  const marketOutlineResult = await generateNovelOutline({
    booksDir,
    bookName,
    title: '寒门剑修参考大纲',
    idea: '参考当前市场资料生成大纲。',
    count: 2,
    marketLimit: 1,
    saveMode: 'unsupported-mode',
    textProvider: marketOutlineProvider,
    modelName: 'market-outline-model'
  })
  assert.equal(marketOutlineResult.success, true)
  assert.equal(marketOutlineResult.saveMode, 'append')
  assert.equal(marketOutlineResult.title, '寒门剑修参考大纲')
  assert.equal(marketOutlineResult.research.topics.length, 1)
  const marketOutlineRequest = marketOutlineProvider.requests.find((item) =>
    item.requestId.includes('outline_split')
  )
  assert.ok(requestText(marketOutlineRequest).includes('寒门剑修登榜'))

  fs.writeFileSync(
    join(booksDir, bookName, 'characters.json'),
    JSON.stringify([{ name: '林青', gender: '女', age: 18 }], null, 2),
    'utf-8'
  )
  fs.writeFileSync(
    join(booksDir, bookName, 'settings.json'),
    JSON.stringify(
      {
        categories: [
          {
            name: '术法',
            items: [{ name: '月影术', introduction: '月影术只能在夜间施展，白天不能发动。' }]
          }
        ]
      },
      null,
      2
    ),
    'utf-8'
  )

  const offlineProvider = createOfflineProvider()
  const streamedPieces = []
  const taskProgressEvents = []
  const writeResult = await writeNovelChapter({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第一章',
    prompt: '写林青第一次在山门外遇到追兵。',
    targetWords: 120,
    autoEdit: true,
    textProvider: offlineProvider,
    model: 'offline-model',
    onChunk: ({ content }) => streamedPieces.push(content),
    onTaskProgress: ({ task, event }) =>
      taskProgressEvents.push({ taskId: task.id, eventType: event?.type })
  })

  assert.equal(writeResult.success, true)
  assert.equal(writeResult.repaired, true)
  assert.equal(writeResult.chapterName, '第一章')
  assert.equal(writeResult.wordCount > 0, true)
  assert.equal(writeResult.issues.length, 0)
  assert.equal(streamedPieces.length > 0, true)
  assert.equal(streamedPieces.join('').includes('林青'), true)
  assert.equal(
    taskProgressEvents.some((item) => item.taskId === writeResult.taskId),
    true
  )
  assert.equal(
    taskProgressEvents.some((item) => item.eventType === 'writer_stream'),
    true
  )
  assert.equal(
    taskProgressEvents.some((item) => item.eventType === 'writer_rewrite_stream'),
    true
  )
  assert.equal(
    taskProgressEvents.some((item) => item.eventType === 'writer_repair_stream'),
    true
  )
  assert.equal(
    offlineProvider.calls.some((id) => id.includes('writer_rewrite')),
    true
  )
  assert.equal(
    offlineProvider.calls.some((id) => id.includes('writer_repair')),
    true
  )
  const initialWriterRequest = offlineProvider.requests.find((item) =>
    item.requestId.includes('cli_writer_cli_write_')
  )
  const initialWriterText = requestText(initialWriterRequest)
  assert.ok(initialWriterText.includes('【人物设定】'))
  assert.ok(initialWriterText.includes('月影术只能在夜间施展'))
  const editorReviewRequest = offlineProvider.requests.find((item) =>
    item.requestId.includes('cli_editor_review_')
  )
  const editorReviewText = requestText(editorReviewRequest)
  assert.ok(editorReviewText.includes('【设定管理】'))
  assert.ok(editorReviewText.includes('规则检查工具结果'))
  assert.ok(editorReviewText.includes('月影术 的使用条件与设定不一致'))
  const repairWriterRequest = offlineProvider.requests.find((item) =>
    item.requestId.includes('cli_writer_repair_')
  )
  assert.ok(requestText(repairWriterRequest).includes('月影术只能在夜间施展'))

  const chapterPath = join(booksDir, bookName, '正文', '第一卷', '第一章.txt')
  const finalText = fs.readFileSync(chapterPath, 'utf-8')
  assert.equal(finalText.includes('夜色'), true)
  assert.equal(finalText.includes('正午'), false)

  const directRepairProvider = createOfflineProvider()
  const directRepairChunks = []
  const directRepairResult = await repairNovelChapter({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第一章',
    currentText: '林青在正午施展只能在夜间使用的月影术。',
    issues: [
      '月影术的使用时间与设定冲突',
      {
        level: 'high',
        title: '术法规则冲突',
        evidence: '正午施展月影术',
        reference: '月影术只能在夜间施展',
        fix: '把场景改为夜间'
      },
      null,
      {}
    ],
    checkId: 'direct-repair-check',
    checkSummary: '修正月影术的使用时间。',
    sourceGenerationId: 'direct-source-generation',
    targetWords: 120,
    textProvider: directRepairProvider,
    model: 'offline-model',
    onChunk: ({ content }) => directRepairChunks.push(content)
  })
  assert.equal(directRepairResult.success, true)
  assert.equal(directRepairResult.reviewPassed, true)
  assert.equal(directRepairResult.issueCount, 2)
  assert.equal(directRepairResult.checkId, 'direct-repair-check')
  assert.equal(directRepairResult.sourceGenerationId, 'direct-source-generation')
  assert.equal(directRepairResult.content.includes('夜色'), true)
  assert.equal(directRepairChunks.join('').includes('林青'), true)
  assert.equal(
    directRepairProvider.calls.some((id) => id.includes('writer_repair')),
    true
  )
  assert.equal(
    directRepairProvider.calls.some((id) => id.includes('editor_repair_review')),
    true
  )

  const memoryProvider = createOfflineProvider()
  const memoryWriteResult = await writeNovelChapter({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第一章',
    prompt: '参考上一轮历史任务，重写林青在山门外遇到追兵。',
    targetWords: 120,
    autoEdit: true,
    textProvider: memoryProvider,
    model: 'offline-model'
  })
  assert.equal(memoryWriteResult.success, true)
  assert.equal(memoryWriteResult.repaired, true)
  const memoryWriterRequest = memoryProvider.requests.find((item) =>
    item.requestId.includes('cli_writer_cli_write_')
  )
  const memoryWriterText = requestText(memoryWriterRequest)
  assert.ok(memoryWriterText.includes('历史任务记录'))
  assert.ok(memoryWriterText.includes('林青在夜色里赶到山门'))
  const memoryEditorRequest = memoryProvider.requests.find((item) =>
    item.requestId.includes('cli_editor_review_')
  )
  const memoryEditorText = requestText(memoryEditorRequest)
  assert.ok(memoryEditorText.includes('历史任务记录'))
  assert.ok(memoryEditorText.includes('林青在夜色里赶到山门'))
  assert.ok(memoryEditorText.includes('规则检查工具结果'))

  const multiProvider = createOfflineProvider()
  const multiWriteResult = await writeNovelChapters({
    booksDir,
    bookName,
    volumeName: '第一卷',
    outlineId: outlineResult.outlineId,
    prompt: '按大纲连续写作，保持林青追查旧案主线。',
    chapters: 2,
    targetWords: 120,
    autoEdit: true,
    textProvider: multiProvider,
    model: 'offline-model'
  })
  assert.equal(multiWriteResult.success, true)
  assert.equal(multiWriteResult.count, 2)
  assert.equal(
    multiWriteResult.chapters.every((item) => item.success),
    true
  )
  assert.equal(multiProvider.calls.filter((id) => id.includes('cli_writer_')).length >= 2, true)
  assert.equal(
    fs.existsSync(join(booksDir, bookName, '正文', '第一卷', '第一章 追兵入山.txt')),
    true
  )
  assert.equal(
    fs.existsSync(join(booksDir, bookName, '正文', '第一卷', '第二章 月影试剑.txt')),
    true
  )

  const chatOnlyProvider = createChatOnlyProvider((options) => ({
    result: `林青按计划进入藏书楼查阅旧案。请求：${options.requestId}`,
    providerId: 'chat-only-cli-provider',
    model: 'chat-only-model',
    usage: { total_tokens: 30 }
  }))
  const plannedWriteResult = await writeNovelChapters({
    booksDir,
    bookName,
    volumeName: '计划卷',
    prompt: '保持旧案主线。',
    chapterPlans: [
      {
        title: '藏书楼旧卷',
        content: '林青进入藏书楼寻找旧案。'
      }
    ],
    chapterDrafts: [{ content: '她在书架后发现一页残卷。' }],
    chapters: 'invalid',
    targetWords: 80,
    autoEdit: false,
    textProvider: chatOnlyProvider,
    modelName: 'chat-only-model'
  })
  assert.equal(plannedWriteResult.success, true)
  assert.equal(plannedWriteResult.count, 1)
  assert.equal(plannedWriteResult.chapters[0].repaired, false)
  assert.equal(plannedWriteResult.providerId, 'chat-only-cli-provider')
  assert.ok(requestText(chatOnlyProvider.requests[0]).includes('她在书架后发现一页残卷'))

  const resumeProvider = createOfflineProvider()
  const resumeWriteResult = await writeNovelChapters({
    booksDir,
    bookName,
    volumeName: '第一卷',
    outlineId: outlineResult.outlineId,
    prompt: '续跑写作时只补缺失章节。',
    chapters: 3,
    targetWords: 120,
    autoEdit: true,
    resume: true,
    textProvider: resumeProvider,
    model: 'offline-model'
  })
  assert.equal(resumeWriteResult.success, true)
  assert.equal(resumeWriteResult.requestedCount, 3)
  assert.equal(resumeWriteResult.count, 1)
  assert.equal(resumeWriteResult.skippedCount, 2)
  assert.equal(resumeWriteResult.chapters[0].skipped, true)
  assert.equal(resumeWriteResult.chapters[1].skipped, true)
  assert.equal(resumeWriteResult.chapters[2].chapterName, '第三章 旧案开封')
  assert.equal(
    fs.existsSync(join(booksDir, bookName, '正文', '第一卷', '第三章 旧案开封.txt')),
    true
  )
  assert.equal(
    resumeProvider.calls.filter((id) => id.startsWith('cli_writer_cli_write_')).length,
    1
  )

  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]
  const fullyResumedResult = await writeNovelChapters({
    booksDir,
    bookName,
    volumeName: '第一卷',
    outlineId: outlineResult.outlineId,
    prompt: '这些章节都已经写完，不应该调用模型。',
    chapters: 3,
    targetWords: 120,
    autoEdit: true,
    resume: true,
    envCwd: emptyEnvDir
  })
  assert.equal(fullyResumedResult.success, true)
  assert.equal(fullyResumedResult.count, 0)
  assert.equal(fullyResumedResult.skippedCount, 3)
  assert.equal(
    fullyResumedResult.chapters.every((item) => item.skipped),
    true
  )
  restoreEnv()

  const taskStore = readJson(join(booksDir, bookName, '.editor-agent', 'tasks.json'))
  const task = taskStore.tasks.find((item) => item.id === writeResult.taskId)
  assert.equal(Boolean(task), true)
  assert.equal(
    task.events.some((item) => item.type === 'writer'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'writer_stream'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'writer_rewrite_stream'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'writer_repair_stream'),
    true
  )
  assert.equal(task.events.find((item) => item.type === 'writer_stream')?.chunkCount > 0, true)
  assert.equal(
    task.events.some((item) => item.type === 'editor_review'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'writer_rewrite'),
    true
  )
  const draftToolEvents = task.events.filter(
    (item) => item.type === 'agent_draft_consistency_check'
  )
  assert.equal(draftToolEvents.length >= 3, true)
  assert.equal(draftToolEvents[0].role, 'tool')
  assert.equal(draftToolEvents[0].issueCount > 0, true)
  assert.equal(draftToolEvents[0].metadata.persisted, false)
  assert.equal(
    task.events.some((item) => item.type === 'consistency_check'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'writer_repair'),
    true
  )
  assert.equal(
    task.events.some((item) => item.type === 'repair_saved'),
    true
  )
  const contextEvents = task.events.filter((item) => item.type === 'agent_context_loaded')
  assert.equal(contextEvents.length >= 2, true)
  assert.equal(contextEvents[0].role, 'tool')
  assert.equal(contextEvents[0].bookContext.loaded, true)
  assert.equal(contextEvents[0].sourceCount >= 3, true)
  assert.equal(
    contextEvents[0].sources.some((item) => item.type === 'characters'),
    true
  )
  assert.equal(task.usage.calls, 4)
  const memoryTask = taskStore.tasks.find((item) => item.id === memoryWriteResult.taskId)
  assert.equal(Boolean(memoryTask), true)
  const memoryEvents = memoryTask.events.filter((item) => item.type === 'agent_memory_loaded')
  assert.equal(memoryEvents.length >= 2, true)
  assert.equal(memoryEvents[0].role, 'tool')
  assert.equal(memoryEvents[0].taskMemory.loaded, true)
  assert.equal(memoryEvents[0].taskCount > 0, true)
  assert.equal(
    memoryEvents[0].sources.some((item) => item.type === 'agent_task'),
    true
  )
  assert.equal(memoryTask.usage.calls, 4)

  const taskList = listNovelTasks({
    booksDir,
    bookName,
    limit: 3
  })
  assert.equal(taskList.success, true)
  assert.equal(taskList.bookName, bookName)
  assert.equal(taskList.count, 3)
  assert.equal(taskList.tasks.length, 3)

  const exactTaskList = listNovelTasks({
    booksDir,
    bookName,
    id: writeResult.taskId
  })
  assert.equal(exactTaskList.count, 1)
  assert.equal(exactTaskList.tasks[0].id, writeResult.taskId)

  const checkedTaskList = listNovelTasks({
    booksDir,
    bookName,
    status: 'checked'
  })
  assert.equal(
    checkedTaskList.tasks.some((item) => item.id === writeResult.taskId),
    true
  )

  const abortController = new AbortController()
  const abortProvider = createAbortableProvider(abortController)
  await assert.rejects(
    () =>
      writeNovelChapter({
        booksDir,
        bookName,
        volumeName: '第一卷',
        chapterName: '中止章',
        prompt: '这章会在 Writer 输出第一段后停止。',
        targetWords: 120,
        autoEdit: true,
        textProvider: abortProvider,
        model: 'abortable-model',
        signal: abortController.signal
      }),
    /CLI 写作已停止/
  )
  assert.equal(fs.existsSync(join(booksDir, bookName, '正文', '第一卷', '中止章.txt')), false)
  const cancelledTasks = listNovelTasks({
    booksDir,
    bookName,
    status: 'cancelled',
    limit: 1
  })
  assert.equal(cancelledTasks.count, 1)
  assert.equal(cancelledTasks.tasks[0].chapterId, '中止章')
  assert.equal(
    cancelledTasks.tasks[0].events.some((item) => item.type === 'task_cancelled'),
    true
  )

  const cliTasks = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'bin', 'novel.js'),
      'tasks',
      '--books-dir',
      booksDir,
      '--book',
      bookName,
      '--id',
      writeResult.taskId,
      '--json'
    ],
    { encoding: 'utf-8' }
  )
  assert.equal(cliTasks.status, 0, cliTasks.stderr)
  const cliTasksJson = JSON.parse(cliTasks.stdout)
  assert.equal(cliTasksJson.count, 1)
  assert.equal(cliTasksJson.tasks[0].id, writeResult.taskId)

  const checks = readJson(join(booksDir, bookName, 'consistency-checks.json'))
  assert.equal(checks.checks.length >= 2, true)
  assert.equal(checks.checks[0].source, 'cli_auto_repair')

  const lifecycleProvider = createOfflineProvider()
  const lifecycleResult = await runNovelLifecycle({
    booksDir,
    bookName: '云海试航',
    idea: '少年在云海商路中寻找失踪的姐姐。',
    sources: 'qidian',
    count: 2,
    chapters: 2,
    targetWords: 100,
    autoEdit: true,
    textProvider: lifecycleProvider,
    model: 'offline-model',
    saveMode: 'replace',
    format: 'md',
    sourceText: '第一章\n林澈在云海港口听见姐姐失踪的消息。'
  })
  assert.equal(lifecycleResult.success, true)
  assert.equal(
    lifecycleResult.stages.map((item) => item.name).join(','),
    'research,book_idea,init,extraction,setting,outline,chapter_outline,write,check,export'
  )
  assert.equal(lifecycleResult.research.fromCache, true)
  assert.equal(lifecycleResult.extraction.bookName, '云海试航')
  assert.equal(lifecycleResult.setting.categories.length, 2)
  assert.equal(lifecycleResult.outline.count, 3)
  assert.equal(lifecycleResult.chapterOutlines.length, 2)
  assert.equal(lifecycleResult.chapterOutlines[0].content.includes('林澈'), true)
  assert.equal(lifecycleResult.writing.count, 2)
  assert.equal(fs.existsSync(lifecycleResult.export.filePath), true)
  assert.equal(fs.existsSync(join(booksDir, '云海试航', 'settings.json')), true)
  assert.equal(
    lifecycleProvider.calls.some((id) => id.includes('book_idea_')),
    true
  )
  assert.equal(
    lifecycleProvider.calls.some((id) => id.includes('setting_tree_')),
    true
  )
  assert.equal(
    lifecycleProvider.calls.some((id) => id.includes('outline_chapter_')),
    true
  )
  assert.equal(
    lifecycleProvider.calls.some((id) => id.includes('cli_writer_')),
    true
  )
  assert.equal(
    lifecycleProvider.calls.some((id) => id.includes('outline_split')),
    true
  )
  assert.equal(lifecycleProvider.calls.filter((id) => id.includes('cli_writer_')).length >= 2, true)

  const noSourceLifecycleProvider = createOfflineProvider()
  const noSourceLifecycleResult = await runNovelLifecycle({
    booksDir,
    bookName: '无来源试航',
    idea: '少年在山城追查一封来历不明的旧信。',
    sources: 'qidian',
    count: 2,
    chapters: 1,
    targetWords: 100,
    autoEdit: false,
    exportResult: false,
    textProvider: noSourceLifecycleProvider,
    model: 'offline-model',
    saveMode: 'append'
  })
  assert.equal(noSourceLifecycleResult.success, true)
  assert.equal(
    noSourceLifecycleResult.stages.find((item) => item.name === 'extraction')?.status,
    'skipped'
  )
  assert.equal(
    noSourceLifecycleResult.stages.some((item) => item.name === 'export'),
    false
  )
  assert.equal(noSourceLifecycleResult.extraction, null)
  assert.equal(noSourceLifecycleResult.export, null)
  assert.equal(noSourceLifecycleResult.writing.count, 1)
  assert.equal(noSourceLifecycleResult.writing.chapters[0].repaired, false)
  assert.equal(fs.existsSync(noSourceLifecycleResult.writing.chapters[0].filePath), true)

  const exportResult = exportNovelBook({
    booksDir,
    bookName,
    format: 'md'
  })
  assert.equal(exportResult.success, true)
  assert.equal(fs.existsSync(exportResult.filePath), true)
  assert.equal(Boolean(exportResult.fileName), true)
  assert.equal(exportResult.size > 0, true)

  const databasePath = getNovelDatabasePath(booksDir)
  assert.equal(fs.existsSync(databasePath), true)
  const repository = openNovelDatabase(booksDir)
  try {
    const projects = repository.listProjects()
    assert.equal(
      projects.some((item) => item.bookName === bookName),
      true
    )
    assert.equal(
      projects.some((item) => item.bookName === '云海试航'),
      true
    )

    const fengxueProject = repository.getProjectByName(bookName)
    const yunhaiProject = repository.getProjectByName('云海试航')
    assert.equal(Boolean(fengxueProject), true)
    assert.equal(Boolean(yunhaiProject), true)

    const fengxueDocuments = repository.listBookDocuments(fengxueProject.id)
    assert.equal(
      fengxueDocuments.some((item) => item.documentType === 'characters'),
      true
    )
    assert.equal(
      fengxueDocuments.some((item) => item.documentType === 'settings'),
      true
    )

    const outlinesInDb = repository.listOutlines()
    assert.equal(
      outlinesInDb.some((item) => item.id === outlineResult.outlineId),
      true
    )
    assert.equal(
      outlinesInDb.some((item) => item.projectId === yunhaiProject.id),
      true
    )

    const chapterOutlineRunsInDb = repository.listChapterOutlineRuns()
    assert.equal(
      chapterOutlineRunsInDb.some((item) => item.projectId === yunhaiProject.id),
      true
    )
    assert.equal(
      chapterOutlineRunsInDb.some((item) => item.chapterName.includes('第一章')),
      true
    )
    assert.equal(
      chapterOutlineRunsInDb.some((item) => item.content.includes('林澈')),
      true
    )

    const chaptersInDb = repository.listChapters()
    assert.equal(
      chaptersInDb.some((item) => item.projectId === fengxueProject.id && item.wordCount > 0),
      true
    )
    assert.equal(
      chaptersInDb.some((item) => item.projectId === yunhaiProject.id && item.wordCount > 0),
      true
    )
    assert.equal(
      chaptersInDb.some((item) =>
        [writeResult.taskId, memoryWriteResult.taskId].includes(item.taskId)
      ),
      true
    )
    assert.equal(
      chaptersInDb.some((item) => item.content.includes('林青')),
      true
    )

    const tasksInDb = repository.listAgentTasks()
    assert.equal(
      tasksInDb.some((item) => item.id === writeResult.taskId && item.status === 'checked'),
      true
    )

    const checksInDb = repository.listConsistencyChecks()
    assert.equal(
      checksInDb.some((item) => item.projectId === fengxueProject.id),
      true
    )
    assert.equal(
      checksInDb.some((item) => item.source === 'cli_auto_repair'),
      true
    )

    const researchInDb = repository.listResearchRuns()
    assert.equal(
      researchInDb.some((item) => item.fromCache && item.topicCount > 0),
      true
    )

    const exportsInDb = repository.listExports()
    assert.equal(
      exportsInDb.some((item) => item.projectId === fengxueProject.id && item.format === 'md'),
      true
    )
    assert.equal(
      exportsInDb.some((item) => item.projectId === yunhaiProject.id && item.format === 'md'),
      true
    )
  } finally {
    repository.close()
  }

  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]
  await assert.rejects(
    () =>
      writeNovelChapter({
        booksDir,
        bookName,
        volumeName: '第一卷',
        chapterName: '第二章',
        prompt: '继续写下一章。',
        autoEdit: true,
        envCwd: emptyEnvDir
      }),
    /请先配置文本 AI 服务/
  )
  assert.equal(fs.existsSync(join(booksDir, bookName, '正文', '第一卷', '第二章.txt')), false)

  const beforeOutline = fs.readFileSync(join(booksDir, bookName, 'outlines.json'), 'utf-8')
  await assert.rejects(
    () =>
      generateNovelOutline({
        booksDir,
        bookName,
        idea: '没有 Provider 时不能保存 AI 大纲。',
        count: 3,
        useMarket: false,
        envCwd: emptyEnvDir
      }),
    /请先配置文本 AI 服务/
  )
  assert.equal(fs.readFileSync(join(booksDir, bookName, 'outlines.json'), 'utf-8'), beforeOutline)

  fs.writeFileSync(join(booksDir, bookName, 'outlines.json'), '{"children":', 'utf-8')
  await assert.rejects(
    () =>
      writeNovelChapters({
        booksDir,
        bookName,
        volumeName: '坏大纲卷',
        chapters: 1,
        prompt: '坏大纲读取结果不能继续写作。',
        textProvider: createOfflineProvider(),
        autoEdit: true
      }),
    /读取大纲失败/
  )
  assert.equal(fs.existsSync(join(booksDir, bookName, '正文', '坏大纲卷', '第一章.txt')), false)
  fs.writeFileSync(join(booksDir, bookName, 'outlines.json'), beforeOutline, 'utf-8')

  await assert.rejects(
    () =>
      writeNovelChapters({
        booksDir,
        bookName,
        volumeName: '缺模型卷',
        outlineId: outlineResult.outlineId,
        chapters: 1,
        start: 3,
        prompt: '缺少 Provider 时不能写连续章节。',
        autoEdit: true,
        envCwd: emptyEnvDir
      }),
    /请先配置文本 AI 服务/
  )
  assert.equal(
    fs.existsSync(join(booksDir, bookName, '正文', '缺模型卷', '第三章 旧案开封.txt')),
    false
  )
} finally {
  restoreEnv()
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('novel cli service tests passed')

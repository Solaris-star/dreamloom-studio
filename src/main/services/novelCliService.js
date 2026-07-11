import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createTextProvider } from './textGenerationRouter.js'
import { loadEnvFile } from './envConfig.js'
import {
  createBook,
  readOutlines,
  upsertChapter,
  writeOutlines,
  writeSettings
} from './webBooksApi.js'
import { runConsistencyCheck } from './consistencyCheckService.js'
import { exportBook } from './importExportService.js'
import bookIdeaAiService from './bookIdeaAi.js'
import extractionAiService from './extractionAi.js'
import marketService from './marketService.js'
import outlineChapterAiService from './outlineChapterAi.js'
import outlineAiService from './outlineAi.js'
import settingTreeAiService from './settingTreeAi.js'
import { createSnapshot } from './settingSnapshotService.js'
import {
  confirmBookIdeaRun as confirmNovelBookIdeaRun,
  recordChapterWrite as recordNovelChapterWrite,
  recordChapterOutlineRun as recordNovelChapterOutlineRun,
  recordExport as recordNovelExport,
  recordBookIdeaRun as recordNovelBookIdeaRun,
  recordExtractionRun as recordNovelExtractionRun,
  recordOutline as recordNovelOutline,
  recordResearchRun as recordNovelResearchRun,
  upsertProjectFromBook
} from './novelDatabaseService.js'
import {
  completeAgentTask,
  cancelAgentTask,
  createAgentTask,
  failAgentTask,
  recordAgentTaskApplication,
  recordAgentTaskConsistency,
  recordAgentTaskRepair,
  recordAgentTaskRepairFailure,
  recordAgentTaskStream,
  listAgentTasks
} from './editorAgentTaskService.js'
import {
  editorAgentBookContextRecord,
  formatEditorAgentBookContext,
  loadEditorAgentBookContext,
  summarizeEditorAgentBookContext
} from './editorAgentContextService.js'
import {
  editorAgentTaskMemoryRecord,
  formatEditorAgentTaskMemory,
  loadEditorAgentTaskMemory,
  summarizeEditorAgentTaskMemory
} from './editorAgentMemoryService.js'
import { runAgentDraftConsistencyTool } from './agentDraftConsistencyToolService.js'

const DEFAULT_VOLUME_NAME = '正文'
const DEFAULT_CHAPTER_NAME = '第1章'
const DEFAULT_TARGET_WORDS = 2000
const REVIEW_SCORE_PASS = 80
const CLI_CANCEL_MESSAGE = 'CLI 写作已停止'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function textArray(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : []
}

function skillRecord(input = {}) {
  const outputMode = cleanText(input.outputMode) || 'preview'
  return {
    skillId: cleanText(input.skillId),
    skillKey: cleanText(input.skillKey),
    outputMode,
    canWriteChapter: input.canWriteChapter === true && outputMode === 'chapter_write',
    inputScopes: textArray(input.inputScopes),
    requiredContext: textArray(input.requiredContext),
    references: textArray(input.references)
  }
}

function createCliCancelError(message = CLI_CANCEL_MESSAGE) {
  const error = new Error(message)
  error.name = 'AbortError'
  error.cancelled = true
  return error
}

function isAbortSignal(signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
}

function abortMessage(signal, fallback = CLI_CANCEL_MESSAGE) {
  const reason = signal?.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  if (reason?.message) return reason.message
  return fallback
}

function throwIfAborted(signal) {
  if (isAbortSignal(signal) && signal.aborted) {
    throw createCliCancelError(abortMessage(signal))
  }
}

function requireCliSuccessResult(result, message) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || message)
  }
  return result
}

function requireCliBookCreateResult(result, expectedBookName) {
  const output = requireCliSuccessResult(result, '创建书籍失败')
  if (output.databaseSync?.success !== true) {
    throw new Error(output.message || '创建书籍失败：数据库未记录作品')
  }
  if (String(output.bookName || '').trim() !== expectedBookName) {
    throw new Error('创建书籍失败：返回作品名不匹配')
  }
  if (!String(output.bookPath || output.path || '').trim()) {
    throw new Error('创建书籍失败：接口没有返回作品路径')
  }
  return output
}

function requireCliOutlineWriteResult(result) {
  const output = requireCliSuccessResult(result, '保存大纲失败')
  if (output.databaseSync?.success !== true) {
    throw new Error(output.message || '保存大纲失败：数据库未记录大纲')
  }
  if (output.fileName !== 'outlines.json' || output.documentType !== 'outlines') {
    throw new Error('保存大纲失败：返回文档信息不匹配')
  }
  if (!String(output.path || output.documentPath || '').trim()) {
    throw new Error('保存大纲失败：接口没有返回文件路径')
  }
  return output
}

function requireCliChapterWriteResult(result, expectedChapterName, message = '写入章节失败') {
  const output = requireCliSuccessResult(result, message)
  if (String(output.chapterName || '').trim() !== expectedChapterName) {
    throw new Error(`${message}：返回章节名不匹配`)
  }
  return output
}

function requireCliExportResult(result) {
  const output = requireCliSuccessResult(result, '导出失败')
  if (!String(output.filePath || '').trim() || !String(output.fileName || '').trim()) {
    throw new Error('导出失败：接口没有返回导出文件')
  }
  if (!(Number(output.size) > 0)) {
    throw new Error('导出失败：导出文件为空')
  }
  return output
}

function requireCliMarketRefreshResult(result) {
  const output = requireCliSuccessResult(result, '市场数据刷新失败')
  if (
    !Array.isArray(output.sources) ||
    !Array.isArray(output.results) ||
    !Array.isArray(output.topics)
  ) {
    throw new Error('市场数据刷新失败：返回数据结构不完整')
  }
  if (!Array.isArray(output.sourceStatus) || !Array.isArray(output.collectionLogs)) {
    throw new Error('市场数据刷新失败：缺少来源状态或采集记录')
  }
  if (!Number.isFinite(Number(output.inserted)) || !Number.isFinite(Number(output.updated))) {
    throw new Error('市场数据刷新失败：缺少写入统计')
  }
  if (!output.results.length) {
    throw new Error('市场数据刷新失败：没有真实来源结果')
  }
  return output
}

function requireCliMarketDashboardResult(result) {
  const output = requireCliSuccessResult(result, '读取市场看板失败')
  if (
    !Array.isArray(output.hotspots) ||
    !Array.isArray(output.topOpportunities) ||
    !Array.isArray(output.sourceStatus)
  ) {
    throw new Error('读取市场看板失败：返回数据结构不完整')
  }
  return output
}

function isCliCancelError(error, signal = null) {
  return Boolean(error?.cancelled || (isAbortSignal(signal) && signal.aborted))
}

function safeName(value, fallback = '未命名') {
  return cleanText(String(value || fallback)).replace(/[\\/:*?"<>|]/g, '_') || fallback
}

function isInside(baseDir, targetPath) {
  const rel = relative(resolve(baseDir), resolve(targetPath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function countWords(text) {
  const value = String(text || '')
  const cn = value.match(/[\u4e00-\u9fa5]/g)?.length || 0
  const en = value.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g)?.length || 0
  return cn + en
}

function ensureBooksDir(booksDir) {
  const dir = cleanText(booksDir)
  if (!dir) throw new Error('缺少书库目录')
  const root = resolve(dir)
  fs.mkdirSync(root, { recursive: true })
  return root
}

function resolveBookPath(booksDir, bookName) {
  const root = ensureBooksDir(booksDir)
  const target = resolve(root, safeName(bookName))
  if (!isInside(root, target)) throw new Error('书籍路径无效')
  return target
}

function ensureBookExists(booksDir, bookName) {
  const bookPath = resolveBookPath(booksDir, bookName)
  if (!fs.existsSync(bookPath)) throw new Error('书籍不存在，请先执行 novel init')
  if (!fs.existsSync(join(bookPath, 'mazi.json'))) throw new Error('书籍元数据不存在')
  return bookPath
}

function createCliStore() {
  return {
    get(_key, fallback) {
      return fallback
    },
    set() {}
  }
}

function extractJson(raw = '') {
  const text = cleanText(String(raw || ''))
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1] || text
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeReviewIssues(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      return cleanText(item?.message || item?.issue || item?.text || item?.reason)
    })
    .filter(Boolean)
    .slice(0, 12)
}

function parseEditorReview(raw = '') {
  const parsed = extractJson(raw)
  if (!parsed) {
    const text = cleanText(raw)
    return {
      passed: false,
      score: null,
      issues: [text ? `Editor 未返回可解析 JSON：${text.slice(0, 180)}` : 'Editor 返回为空'],
      revisionInstruction: text || '请重新审核并返回 JSON。',
      raw: text
    }
  }

  const issues = normalizeReviewIssues(parsed.issues)
  const score = Number(parsed.score)
  const passed =
    typeof parsed.passed === 'boolean'
      ? parsed.passed
      : issues.length === 0 && (!Number.isFinite(score) || score >= REVIEW_SCORE_PASS)

  return {
    passed,
    score: Number.isFinite(score) ? score : null,
    issues,
    revisionInstruction: cleanText(
      parsed.revisionInstruction || parsed.revision_instruction || parsed.fix
    ),
    raw: cleanText(raw)
  }
}

function reviewSummary(review = {}) {
  const status = review.passed ? '通过' : '未通过'
  const score = Number.isFinite(review.score) ? `评分：${review.score}。` : ''
  const issues = review.issues?.length ? review.issues.join('；') : '未列出具体问题'
  const instruction = review.revisionInstruction ? `修改要求：${review.revisionInstruction}` : ''
  return [`审核：${status}。`, score, `问题：${issues}。`, instruction].filter(Boolean).join('\n')
}

function stepRecord(stage, role, title, response = {}, content = '', startedAt = Date.now()) {
  return {
    id: `${stage}_${randomUUID()}`,
    stage,
    role,
    title,
    status: 'done',
    content: cleanText(String(content || '')).slice(0, 900),
    modelUsed: response.model || '',
    usage: response.usage || {},
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString()
  }
}

function bookContextStep(context = {}, title = '读取作品资料') {
  const record = editorAgentBookContextRecord(context)
  return {
    ...stepRecord(
      'agent_context_loaded',
      'tool',
      title,
      {},
      summarizeEditorAgentBookContext(context)
    ),
    bookContext: record,
    sourceCount: record.sourceCount,
    contextChars: record.contextChars,
    sources: record.sources
  }
}

function taskMemoryStep(memory = {}, title = '读取历史任务记录') {
  const record = editorAgentTaskMemoryRecord(memory)
  return {
    ...stepRecord('agent_memory_loaded', 'tool', title, {}, summarizeEditorAgentTaskMemory(memory)),
    taskMemory: record,
    taskCount: record.taskCount,
    eventCount: record.eventCount,
    contextChars: record.contextChars,
    sources: record.sources
  }
}

function totalUsage(steps = []) {
  const llmSteps = steps.filter((step) => step.role !== 'tool')
  const usage = { calls: llmSteps.length }
  for (const step of llmSteps) {
    for (const [key, value] of Object.entries(step.usage || {})) {
      if (typeof value === 'number') usage[key] = (usage[key] || 0) + value
    }
  }
  return usage
}

function highOrMediumIssues(issues = []) {
  return issues.filter((issue) => ['high', 'medium'].includes(cleanText(issue?.severity)))
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function outlineNode(title, content, children = []) {
  return {
    id: `cli_outline_${randomUUID()}`,
    title: cleanText(title) || '未命名大纲',
    content: cleanText(content),
    children
  }
}

function summarizeMarketTopics(topics = [], limit = 8) {
  return topics.slice(0, limit).map((item) => ({
    id: item.id || '',
    source: item.source || '',
    title: item.title || item.keyword || '',
    keyword: item.keyword || '',
    heat: item.normalizedHeat || item.heatIndex || 0,
    url: item.url || '',
    capturedAt: item.capturedAt || ''
  }))
}

function cloneSettingsCategories(value = {}) {
  const categories = Array.isArray(value?.categories) ? value.categories : []
  return {
    categories: categories
      .map((category) => ({
        name: cleanText(category?.name),
        introduction: cleanText(category?.introduction),
        items: Array.isArray(category?.items)
          ? category.items
              .map((item) => ({
                name: cleanText(item?.name),
                introduction: cleanText(item?.introduction)
              }))
              .filter((item) => item.name)
          : [],
        children: Array.isArray(category?.children) ? category.children : []
      }))
      .filter((category) => category.name)
  }
}

function buildBookIdeaPayload(input = {}) {
  return {
    idea: cleanText(input.idea || input.prompt || input.instruction),
    tags: textArray(input.tags),
    availableTypes:
      Array.isArray(input.availableTypes) && input.availableTypes.length
        ? input.availableTypes
        : [
            { value: 'xuanhua', label: '玄幻（通用）' },
            { value: 'dushi', label: '都市（通用）' },
            { value: 'yanqing', label: '言情（通用）' },
            { value: 'kehuan', label: '科幻（通用）' },
            { value: 'xuanyi', label: '悬疑（通用）' },
            { value: 'lishi', label: '历史（通用）' },
            { value: 'tongren', label: '同人' }
          ],
    model: input.model || input.modelName || '',
    providerId: input.providerId || '',
    textProviderId: input.textProviderId || ''
  }
}

function resolveSettingTreeStrategy(input = {}, selectedPlan = null) {
  const explicit = cleanText(input.strategy || input.settingStrategy)
  if (explicit) return explicit
  const rawType = cleanText(selectedPlan?.type || input.type)
  if (rawType.startsWith('xuanhua')) return 'fantasy'
  if (rawType.startsWith('dushi')) return 'urban'
  if (rawType.startsWith('kehuan')) return 'scifi'
  return 'free'
}

function buildSettingTreePayload(input = {}, idea = '', bookPath = '', selectedPlan = null) {
  return {
    idea: cleanText(input.settingIdea || input.setting || idea),
    strategy: resolveSettingTreeStrategy(input, selectedPlan),
    bookPath
  }
}

function writeSettingsDocument(booksDir, bookName, settingsData) {
  return writeSettings({ bookName: safeName(bookName), data: settingsData }, booksDir)
}

function resolveLifecycleSelectedPlan(runResult = {}, input = {}) {
  const plans = Array.isArray(runResult?.plans) ? runResult.plans : []
  if (!plans.length) return null
  const selectedPlanId = cleanText(input.selectedPlanId || input.planId)
  if (selectedPlanId) {
    const matched = plans.find((plan) => cleanText(plan?.id) === selectedPlanId)
    if (matched) return matched
  }
  return plans[0] || null
}

function hasLifecycleExtractionSource(input = {}) {
  return Boolean(
    cleanText(input.sourceText || input.sourceResult || input.sourceContent || input.onlineText)
  )
}

function buildLifecycleExtractionPayload(input = {}, bookPath = '', bookName = '') {
  return {
    bookPath,
    bookName,
    sourceBookName: cleanText(input.sourceBookName || input.extractionSourceBookName || bookName),
    sourceType: cleanText(input.sourceType || input.extractionSourceType || 'reference'),
    sourceUrl: cleanText(input.sourceUrl || input.extractionSourceUrl),
    sourceText: cleanText(input.sourceText || input.sourceResult || input.sourceContent),
    onlineText: cleanText(input.onlineText),
    dimensions: Array.isArray(input.dimensions) ? input.dimensions : undefined,
    runMode: cleanText(input.runMode || input.extractionRunMode || 'append'),
    chapterStart: input.chapterStart,
    chapterEnd: input.chapterEnd,
    chapterLimit: input.chapterLimit,
    chapterScope: input.chapterScope
  }
}

function buildOutlineSeed({ idea, topics = [], opportunities = [] }) {
  const topicLines = summarizeMarketTopics(topics, 10).map((item, index) =>
    [
      `${index + 1}. ${item.title || item.keyword}`,
      item.source ? `来源：${item.source}` : '',
      item.heat ? `热度：${item.heat}` : '',
      item.url ? `链接：${item.url}` : ''
    ]
      .filter(Boolean)
      .join('，')
  )
  const opportunityLines = opportunities
    .slice(0, 6)
    .map(
      (item, index) =>
        `${index + 1}. ${item.keyword || item.title || '热点'}：${item.suggestion || item.summary || ''}`
    )
  return [
    idea ? `创作方向：${idea}` : '',
    topicLines.length ? `真实市场信号：\n${topicLines.join('\n')}` : '',
    opportunityLines.length ? `可写方向：\n${opportunityLines.join('\n')}` : '',
    '请基于以上材料生成原创小说大纲，不要复述真实新闻，不要使用真实人物姓名。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeOutlineSaveMode(value = '') {
  const mode = cleanText(value)
  return ['append', 'replace'].includes(mode) ? mode : 'append'
}

function appendOutlinePayload(existing, node, mode = 'append') {
  if (mode === 'replace') {
    return {
      content: existing?.content || '',
      children: [node]
    }
  }

  return {
    content: existing?.content || '',
    children: [...(Array.isArray(existing?.children) ? existing.children : []), node]
  }
}

function requireOutlineReadData(result, message = '读取大纲失败') {
  const output = requireCliSuccessResult(result, message)
  if (Object.prototype.hasOwnProperty.call(output, 'data')) {
    return output.data
  }
  throw new Error(`${message}：接口没有返回大纲数据`)
}

function findOutlineNode(root, outlineId) {
  if (!root || typeof root !== 'object') return null
  if (root.id === outlineId) return root
  const children = Array.isArray(root.children) ? root.children : []
  for (const child of children) {
    const found = findOutlineNode(child, outlineId)
    if (found) return found
  }
  return null
}

function collectOutlineLeaves(node, bucket = []) {
  if (!node || typeof node !== 'object') return bucket
  const children = Array.isArray(node.children) ? node.children.filter(Boolean) : []
  if (!children.length) {
    if (cleanText(node.title) || cleanText(node.content)) bucket.push(node)
    return bucket
  }
  for (const child of children) collectOutlineLeaves(child, bucket)
  return bucket
}

function latestOutlineRoot(outlines) {
  const children = Array.isArray(outlines?.children) ? outlines.children.filter(Boolean) : []
  return children[children.length - 1] || outlines
}

function normalizeChapterPlan(item = {}, index = 0) {
  return {
    title: cleanText(item.chapterName || item.title) || `第${index + 1}章`,
    content: cleanText(
      [
        item.content,
        item.summary ? `章节概要：${item.summary}` : '',
        item.goals ? `写作目标：${item.goals}` : '',
        item.conflict ? `核心冲突：${item.conflict}` : '',
        item.progression ? `情节推进：${item.progression}` : '',
        item.resultHint ? `章末提示：${item.resultHint}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
}

function normalizeChapterDraft(item = {}, index = 0) {
  return {
    title: cleanText(item.chapterName || item.title || item.outlineTitle) || `第${index + 1}章`,
    content: cleanText(
      [
        item.content,
        item.generatedContent ? `章节正文：${item.generatedContent}` : '',
        item.outlineContent ? `章纲内容：${item.outlineContent}` : '',
        item.summary ? `章节概要：${item.summary}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
}

function resolveChapterPlans(input, booksDir, bookName) {
  const injectedPlans = Array.isArray(input.chapterPlans)
    ? input.chapterPlans
    : Array.isArray(input.outlineItems)
      ? input.outlineItems
      : []
  if (injectedPlans.length) return injectedPlans.map(normalizeChapterPlan)

  const outlines = requireOutlineReadData(readOutlines(safeName(bookName), booksDir))
  const root = input.outlineId
    ? findOutlineNode(outlines, input.outlineId)
    : latestOutlineRoot(outlines)
  const plans = collectOutlineLeaves(root).map(normalizeChapterPlan)
  if (!plans.length) throw new Error('没有可写章节计划，请先生成大纲')
  return plans
}

function resolveChapterDrafts(input = {}) {
  const injectedDrafts = Array.isArray(input.chapterDrafts)
    ? input.chapterDrafts
    : Array.isArray(input.chapterOutlines)
      ? input.chapterOutlines
      : []
  return injectedDrafts.length ? injectedDrafts.map(normalizeChapterDraft) : []
}

function limitChapterPlans(plans, input = {}) {
  const start = Math.max(0, Number(input.startIndex || input.start || 1) - 1)
  const requested = Number(input.writeChapters || input.chapters || input.count || plans.length)
  const count = Number.isFinite(requested) && requested > 0 ? requested : plans.length
  return plans.slice(start, start + count)
}

function readExistingChapterSnapshot({ booksDir, bookName, volumeName, chapterName }) {
  const bookPath = resolveBookPath(booksDir, bookName)
  const filePath = resolve(bookPath, '正文', volumeName, `${cleanText(chapterName)}.txt`)
  if (!isInside(bookPath, filePath)) throw new Error('章节路径无效')
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      hasContent: false,
      filePath,
      wordCount: 0,
      updatedAt: ''
    }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const stat = fs.statSync(filePath)
  return {
    exists: true,
    hasContent: cleanText(content).length > 0,
    filePath,
    wordCount: countWords(content),
    updatedAt: stat.mtime.toISOString()
  }
}

function loadStoredOutlineForResume(booksDir, bookName, outlineId = '') {
  const outlines = requireOutlineReadData(readOutlines(safeName(bookName), booksDir))
  const root = outlineId ? findOutlineNode(outlines, outlineId) : latestOutlineRoot(outlines)
  if (!root) return null
  const items = collectOutlineLeaves(root).map(normalizeChapterPlan)
  if (!items.length) return null
  return {
    success: true,
    reused: true,
    outlineId: root.id || '',
    title: cleanText(root.title) || `${safeName(bookName)} 已有大纲`,
    count: items.length,
    items,
    rawText: '',
    providerId: '',
    model: '',
    usage: {},
    research: null
  }
}

async function generateNovelChapterOutlines(input = {}) {
  throwIfAborted(input.signal)
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const outlineItems = Array.isArray(input.outlineItems)
    ? input.outlineItems
    : Array.isArray(input.outline?.items)
      ? input.outline.items
      : []
  const requestedCount = Number(
    input.chapterOutlineCount || input.count || input.chapters || outlineItems.length
  )
  const plans = limitChapterPlans(outlineItems.map(normalizeChapterPlan), {
    start: input.chapterOutlineStart || input.start,
    writeChapters: requestedCount,
    chapters: requestedCount,
    count: requestedCount
  })

  if (!bookName) throw new Error('缺少书籍名称')
  if (!plans.length) {
    return {
      success: true,
      bookName: safeName(bookName),
      bookPath: ensureBookExists(booksDir, bookName),
      count: 0,
      chapterOutlines: [],
      providerId: '',
      model: '',
      usage: {}
    }
  }

  const bookPath = ensureBookExists(booksDir, bookName)
  const volumeName = cleanText(input.volumeName || input.volume) || DEFAULT_VOLUME_NAME
  const provider = resolveTextProvider(input)
  const userRequirement = cleanText(input.userRequirement || input.chapterOutlineRequirement)
  const targetWords = Number(input.targetWords || input.chapterTargetWords || DEFAULT_TARGET_WORDS)
  const chapterOutlines = []
  let previousChapterExcerpt = cleanText(input.previousChapterExcerpt)

  for (let index = 0; index < plans.length; index++) {
    throwIfAborted(input.signal)
    const plan = plans[index]
    const chapterName = cleanText(plan.title) || `第${index + 1}章`
    const result = await outlineChapterAiService.generateChapterFromOutline(
      {
        bookPath,
        outlineTitle: chapterName,
        outlineContent: cleanText(plan.content),
        userRequirement,
        targetWords,
        previousChapterExcerpt,
        model: provider.model || input.model || input.modelName || '',
        modelName: provider.model || input.modelName || '',
        signal: input.signal
      },
      provider.service
    )
    const runId = `outline_chapter_${randomUUID()}`
    const recorded = recordNovelChapterOutlineRun({
      booksDir,
      bookName: safeName(bookName),
      bookPath,
      run: {
        id: runId,
        outlineId: cleanText(input.outlineId || input.outline?.outlineId || input.outline?.id),
        outlineTitle: chapterName,
        outlineContent: cleanText(plan.content),
        volumeName,
        chapterName,
        userRequirement,
        targetWords,
        previousChapterExcerpt,
        wordCount: result.wordCount,
        providerId: result.providerId || provider.providerId || '',
        model: result.model || provider.model || '',
        usage: result.usage || {}
      },
      result
    })
    chapterOutlines.push({
      ...result,
      id: recorded.id,
      chapterName,
      outlineTitle: chapterName,
      outlineContent: cleanText(plan.content),
      previousChapterExcerpt
    })
    previousChapterExcerpt = cleanText(result.content).slice(0, 1200)
  }

  const usage = chapterOutlines.reduce((acc, item) => {
    for (const [key, value] of Object.entries(item.usage || {})) {
      if (typeof value === 'number') acc[key] = (acc[key] || 0) + value
    }
    return acc
  }, {})

  return {
    success: true,
    bookName: safeName(bookName),
    bookPath,
    count: chapterOutlines.length,
    chapterOutlines,
    providerId:
      chapterOutlines.find((item) => item.providerId)?.providerId || provider.providerId || '',
    model: chapterOutlines.find((item) => item.model)?.model || provider.model || '',
    usage
  }
}

function buildChapterPlanPrompt({ basePrompt, plan, draft, index, total }) {
  return [
    basePrompt ? `全书方向：${basePrompt}` : '',
    `当前进度：第 ${index + 1} / ${total} 章`,
    `章节名：${plan.title}`,
    plan.content ? `章节计划：\n${plan.content}` : '',
    draft ? `章节初稿：\n${draft}` : '',
    '请写成完整正文，可以参考初稿，但不要照着抄。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

function resolveTextProvider(options = {}) {
  if (options.textProvider?.chat) {
    return {
      service: options.textProvider,
      providerId: options.textProvider.providerId || 'injected',
      model: options.model || options.modelName || 'injected'
    }
  }

  loadEnvFile(options.envCwd || process.cwd())
  try {
    return createTextProvider(createCliStore(), {
      modelId: options.modelId,
      modelName: options.modelName,
      providerId: options.providerId,
      textProviderId: options.textProviderId,
      model: options.model
    })
  } catch (error) {
    throw new Error(
      `${error.message || '请先配置文本 AI 服务'}。请在 .env 中配置 DEEPSEEK_API_KEY，或 CUSTOM_TEXT_*。`
    )
  }
}

async function callChat(service, request) {
  throwIfAborted(request.signal)
  const response = await service.chat(request)
  throwIfAborted(request.signal)
  const content = cleanText(response?.content || response?.result)
  if (!content) throw new Error(`${request.stageName || 'AI 调用'}返回为空`)
  return { ...response, content }
}

async function callStreamChat(service, request, hooks = {}) {
  throwIfAborted(request.signal)
  if (request.stream === false || !service.streamChat) return callChat(service, request)
  const stream = await service.streamChat(request)
  let content = ''
  let usage = {}
  let model = request.model || ''
  let providerId = ''
  let chunkCount = 0

  for await (const chunk of stream) {
    throwIfAborted(request.signal)
    if (chunk?.usage && Object.keys(chunk.usage).length) usage = chunk.usage
    if (chunk?.model) model = chunk.model
    if (chunk?.providerId) providerId = chunk.providerId
    const piece = String(chunk?.content || '')
    if (!piece) continue
    chunkCount++
    content += piece
    await hooks.onChunk?.({ content: piece, fullText: content, chunkCount, chunk })
  }

  throwIfAborted(request.signal)
  content = cleanText(content)
  if (!content) throw new Error(`${request.stageName || 'AI 调用'}返回为空`)
  await hooks.onDone?.({ content, chunkCount, usage, model, providerId })
  return {
    success: true,
    content,
    usage,
    model,
    providerId,
    stream: true,
    chunkCount
  }
}

function buildWriterMessages({
  bookName,
  volumeName,
  chapterName,
  prompt,
  targetWords,
  bookContextText,
  taskMemoryText
}) {
  return [
    {
      role: 'system',
      content: '你是小说 Writer。你必须直接输出章节正文，不要输出提纲、说明、Markdown 标题或 JSON。'
    },
    {
      role: 'user',
      content: [
        `作品：${bookName}`,
        `卷名：${volumeName}`,
        `章节：${chapterName}`,
        `目标字数：约 ${targetWords} 字`,
        '写作要求：',
        prompt,
        `历史任务记录：\n${taskMemoryText || '暂无可用历史任务记录。'}`,
        `作品资料：\n${bookContextText || '未读取到可用作品资料。'}`,
        '正文需要承接设定，避免复述任务要求。'
      ].join('\n')
    }
  ]
}

function buildReviewMessages({
  bookName,
  volumeName,
  chapterName,
  prompt,
  targetWords,
  draft,
  bookContextText,
  taskMemoryText,
  draftToolCheckText
}) {
  return [
    {
      role: 'system',
      content: '你是小说 Editor。你只做审稿判断，请只输出 JSON，不要 Markdown。'
    },
    {
      role: 'user',
      content: [
        '请审核 Writer 的章节正文是否可用。',
        '重点检查：是否是正文、是否明显偏离要求、是否大段复述任务、是否存在明显断裂、目标字数是否接近。',
        '返回格式：{"passed":true,"score":90,"issues":[],"revisionInstruction":""}',
        `作品：${bookName}`,
        `卷名：${volumeName}`,
        `章节：${chapterName}`,
        `目标字数：约 ${targetWords} 字`,
        `写作要求：\n${prompt}`,
        `历史任务记录：\n${taskMemoryText || '暂无可用历史任务记录。'}`,
        `作品资料：\n${bookContextText || '未读取到可用作品资料。'}`,
        `规则检查工具结果：\n${draftToolCheckText || '未执行规则检查工具。'}`,
        `正文：\n${draft}`
      ].join('\n\n')
    }
  ]
}

function buildRewriteMessages({
  bookName,
  volumeName,
  chapterName,
  prompt,
  targetWords,
  draft,
  review,
  bookContextText,
  taskMemoryText
}) {
  return [
    {
      role: 'system',
      content: '你是小说 Writer。请按 Editor 意见重写，直接输出完整章节正文。'
    },
    {
      role: 'user',
      content: [
        `作品：${bookName}`,
        `卷名：${volumeName}`,
        `章节：${chapterName}`,
        `目标字数：约 ${targetWords} 字`,
        `原始写作要求：\n${prompt}`,
        `历史任务记录：\n${taskMemoryText || '暂无可用历史任务记录。'}`,
        `作品资料：\n${bookContextText || '未读取到可用作品资料。'}`,
        `Editor 意见：\n${reviewSummary(review)}`,
        `原稿：\n${draft}`,
        '请输出重写后的完整正文。'
      ].join('\n\n')
    }
  ]
}

function issuePrompt(issues = []) {
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

function buildRepairMessages({
  bookName,
  volumeName,
  chapterName,
  prompt,
  targetWords,
  currentText,
  issues,
  bookContextText,
  taskMemoryText
}) {
  return [
    {
      role: 'system',
      content: '你是小说 Writer。请修正文中的一致性问题，保持章节情节和文风，直接输出完整章节正文。'
    },
    {
      role: 'user',
      content: [
        `作品：${bookName}`,
        `卷名：${volumeName}`,
        `章节：${chapterName}`,
        `目标字数：约 ${targetWords} 字`,
        `原始写作要求：\n${prompt}`,
        `历史任务记录：\n${taskMemoryText || '暂无可用历史任务记录。'}`,
        `作品资料：\n${bookContextText || '未读取到可用作品资料。'}`,
        `一致性问题：\n${issuePrompt(issues)}`,
        `当前正文：\n${currentText}`,
        '请输出修正后的完整正文。'
      ].join('\n\n')
    }
  ]
}

async function notifyTaskProgress(onTaskProgress, bookPath, task) {
  if (typeof onTaskProgress !== 'function' || !task?.id) return
  try {
    await onTaskProgress({
      bookPath,
      task,
      event: Array.isArray(task.events) ? task.events.at(-1) || null : null
    })
  } catch (error) {
    console.warn('agent task progress hook failed:', error?.message || error)
  }
}

function createStreamRecorder({
  bookPath,
  taskId,
  generationId,
  skillId,
  skillKey,
  outputMode,
  canWriteChapter,
  inputScopes,
  requiredContext,
  references,
  stage,
  role,
  title,
  enabled,
  onChunk,
  onTaskProgress
}) {
  if (!enabled || !bookPath || !taskId) {
    return {
      async onChunk(event) {
        await onChunk?.(event)
      },
      async onDone() {}
    }
  }
  let lastRecordedAt = 0

  async function record(status, event) {
    const task = recordAgentTaskStream(bookPath, {
      taskId,
      generationId,
      skillId,
      skillKey,
      outputMode,
      canWriteChapter,
      inputScopes,
      requiredContext,
      references,
      type: stage,
      role,
      title,
      status,
      content: event.content,
      chunkCount: event.chunkCount,
      wordCount: countWords(event.fullText || event.content),
      modelUsed: event.model || event.chunk?.model || '',
      usage: event.usage || event.chunk?.usage || {}
    })
    await notifyTaskProgress(onTaskProgress, bookPath, task)
  }

  return {
    async onChunk(event) {
      await onChunk?.({ ...event, stage, role, title })
      const now = Date.now()
      if (event.chunkCount === 1 || now - lastRecordedAt >= 1500) {
        lastRecordedAt = now
        await record('running', event)
      }
    },
    async onDone(event) {
      await record('done', {
        ...event,
        fullText: event.content,
        content: event.content,
        model: event.model
      })
    }
  }
}

async function runWriterReviewLoop(input, provider, generationId, context = {}) {
  const { service, model } = provider
  const steps = [
    taskMemoryStep(input.taskMemory, 'CLI 读取历史任务记录'),
    bookContextStep(input.bookContext, 'CLI 读取作品资料')
  ]
  throwIfAborted(input.signal)
  const writerStartedAt = Date.now()
  let writerResponse = await callStreamChat(
    service,
    {
      messages: buildWriterMessages(input),
      model: model || undefined,
      temperature: input.temperature ?? 0.75,
      max_tokens: input.maxTokens || undefined,
      stream: input.stream !== false,
      signal: input.signal,
      requestId: `cli_writer_${generationId}`,
      stageName: 'Writer'
    },
    createStreamRecorder({
      ...context,
      generationId,
      ...skillRecord(input),
      stage: 'writer_stream',
      role: 'writer',
      title: 'Writer 流式生成初稿',
      enabled: input.stream !== false,
      onChunk: input.onChunk,
      onTaskProgress: context.onTaskProgress
    })
  )
  let draft = writerResponse.content
  steps.push(
    stepRecord('writer', 'writer', 'Writer 生成初稿', writerResponse, draft, writerStartedAt)
  )

  throwIfAborted(input.signal)
  const draftCheck = await runAgentDraftConsistencyTool(
    { ...input, bookPath: context.bookPath },
    generationId,
    draft,
    'cli_writer_draft_tool',
    '规则检查 Writer 初稿'
  )
  steps.push(draftCheck.step)

  throwIfAborted(input.signal)
  const reviewStartedAt = Date.now()
  const reviewResponse = await callChat(service, {
    messages: buildReviewMessages({ ...input, draft, draftToolCheckText: draftCheck.text }),
    model: model || undefined,
    temperature: 0.1,
    max_tokens: 1800,
    signal: input.signal,
    requestId: `cli_editor_review_${generationId}`,
    stageName: 'Editor'
  })
  let review = parseEditorReview(reviewResponse.content)
  steps.push(
    stepRecord(
      'editor_review',
      'editor',
      'Editor 审核初稿',
      reviewResponse,
      reviewSummary(review),
      reviewStartedAt
    )
  )

  if (review.passed || !input.autoEdit) {
    return { text: draft, review, steps }
  }

  throwIfAborted(input.signal)
  const rewriteStartedAt = Date.now()
  writerResponse = await callStreamChat(
    service,
    {
      messages: buildRewriteMessages({ ...input, draft, review }),
      model: model || undefined,
      temperature: input.temperature ?? 0.72,
      max_tokens: input.maxTokens || undefined,
      stream: input.stream !== false,
      signal: input.signal,
      requestId: `cli_writer_rewrite_${generationId}`,
      stageName: 'Writer 重写'
    },
    createStreamRecorder({
      ...context,
      generationId,
      ...skillRecord(input),
      stage: 'writer_rewrite_stream',
      role: 'writer',
      title: 'Writer 流式重写',
      enabled: input.stream !== false,
      onChunk: input.onChunk,
      onTaskProgress: context.onTaskProgress
    })
  )
  draft = writerResponse.content
  steps.push(
    stepRecord(
      'writer_rewrite',
      'writer',
      'Writer 按审核意见重写',
      writerResponse,
      draft,
      rewriteStartedAt
    )
  )

  throwIfAborted(input.signal)
  const rewriteCheck = await runAgentDraftConsistencyTool(
    { ...input, bookPath: context.bookPath },
    generationId,
    draft,
    'cli_writer_rewrite_tool',
    '规则检查 Writer 重写稿'
  )
  steps.push(rewriteCheck.step)

  throwIfAborted(input.signal)
  const rewriteReviewStartedAt = Date.now()
  const rewriteReviewResponse = await callChat(service, {
    messages: buildReviewMessages({ ...input, draft, draftToolCheckText: rewriteCheck.text }),
    model: model || undefined,
    temperature: 0.1,
    max_tokens: 1800,
    signal: input.signal,
    requestId: `cli_editor_rewrite_review_${generationId}`,
    stageName: 'Editor 复核'
  })
  review = parseEditorReview(rewriteReviewResponse.content)
  steps.push(
    stepRecord(
      'editor_rewrite_review',
      'editor',
      'Editor 复核重写稿',
      rewriteReviewResponse,
      reviewSummary(review),
      rewriteReviewStartedAt
    )
  )

  return { text: draft, review, steps }
}

async function runRepairLoop(input, provider, sourceGenerationId, check, issues, context = {}) {
  const { service, model } = provider
  const repairGenerationId = `cli_repair_${randomUUID()}`
  const steps = [
    taskMemoryStep(input.taskMemory, 'CLI 返修读取历史任务记录'),
    bookContextStep(input.bookContext, 'CLI 返修读取作品资料')
  ]
  throwIfAborted(input.signal)
  const writerStartedAt = Date.now()
  const repairResponse = await callStreamChat(
    service,
    {
      messages: buildRepairMessages({
        ...input,
        currentText: input.currentText,
        issues
      }),
      model: model || undefined,
      temperature: input.temperature ?? 0.65,
      max_tokens: input.maxTokens || undefined,
      stream: input.stream !== false,
      signal: input.signal,
      requestId: `cli_writer_repair_${repairGenerationId}`,
      stageName: 'Writer 返修'
    },
    createStreamRecorder({
      ...context,
      generationId: repairGenerationId,
      ...skillRecord(input),
      stage: 'writer_repair_stream',
      role: 'writer',
      title: 'Writer 流式返修',
      enabled: input.stream !== false,
      onChunk: input.onChunk,
      onTaskProgress: context.onTaskProgress
    })
  )
  const repairedText = repairResponse.content
  steps.push(
    stepRecord(
      'writer_repair',
      'writer',
      'Writer 修正一致性问题',
      repairResponse,
      repairedText,
      writerStartedAt
    )
  )

  throwIfAborted(input.signal)
  const repairCheck = await runAgentDraftConsistencyTool(
    { ...input, bookPath: context.bookPath },
    repairGenerationId,
    repairedText,
    'cli_writer_repair_tool',
    '规则检查 Writer 返修稿'
  )
  steps.push(repairCheck.step)

  throwIfAborted(input.signal)
  const reviewStartedAt = Date.now()
  const reviewResponse = await callChat(service, {
    messages: buildReviewMessages({
      ...input,
      draft: repairedText,
      draftToolCheckText: repairCheck.text
    }),
    model: model || undefined,
    temperature: 0.1,
    max_tokens: 1800,
    signal: input.signal,
    requestId: `cli_editor_repair_review_${repairGenerationId}`,
    stageName: 'Editor 返修复核'
  })
  const review = parseEditorReview(reviewResponse.content)
  steps.push(
    stepRecord(
      'editor_repair_review',
      'editor',
      'Editor 复核返修稿',
      reviewResponse,
      reviewSummary(review),
      reviewStartedAt
    )
  )

  return {
    repairGenerationId,
    text: repairedText,
    review,
    steps,
    checkId: check?.id || '',
    issueCount: issues.length
  }
}

export async function initNovelProject(input = {}) {
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  if (!bookName) throw new Error('缺少书籍名称')

  const bookPath = resolveBookPath(booksDir, bookName)
  if (fs.existsSync(bookPath)) {
    if (!fs.existsSync(join(bookPath, 'mazi.json'))) {
      throw new Error('目标目录已存在，但不是有效书籍')
    }
    let confirmedBookIdea = null
    if (input.bookIdeaRunId || input.selectedPlanId || input.selectedPlan?.id) {
      confirmedBookIdea = confirmNovelBookIdeaRun({
        booksDir,
        bookName: safeName(bookName),
        bookPath,
        bookIdeaRunId: input.bookIdeaRunId,
        selectedPlanId: input.selectedPlanId,
        selectedPlan: input.selectedPlan
      })
    }
    upsertProjectFromBook({ booksDir, bookName: safeName(bookName), bookPath })
    return {
      success: true,
      existed: true,
      bookName: safeName(bookName),
      bookPath,
      confirmedBookIdea
    }
  }

  const result = await createBook(
    {
      id: input.id || randomUUID(),
      name: bookName,
      type: input.type || 'original',
      typeName: input.typeName || '原创',
      targetCount: Number(input.targetCount || 0),
      intro: input.intro || '',
      bookIdeaRunId: input.bookIdeaRunId,
      selectedPlanId: input.selectedPlanId,
      selectedPlan: input.selectedPlan || null
    },
    booksDir
  )
  requireCliBookCreateResult(result, safeName(bookName))
  upsertProjectFromBook({ booksDir, bookName: safeName(bookName), bookPath })

  return {
    success: true,
    existed: false,
    bookName: safeName(bookName),
    bookPath,
    confirmedBookIdea: result.bookIdeaRun || null
  }
}

export async function researchNovelMarket(input = {}) {
  const booksDir = ensureBooksDir(input.booksDir)
  const sources = splitList(input.sources || input.source)
  const limit = Number(input.limit || 12)
  const refreshResult = requireCliMarketRefreshResult(
    await marketService.refreshMarketTrends(booksDir, {
      sources,
      force: Boolean(input.force),
      cacheTtlMs: input.cacheTtlMs,
      timeoutMs: input.timeoutMs
    })
  )

  const dashboard = requireCliMarketDashboardResult(
    marketService.getMarketDashboard(booksDir, {
      source: input.sourceFilter || 'all',
      channel: input.channel || 'all',
      limit: Number.isFinite(limit) && limit > 0 ? limit : 12
    })
  )
  const topics = summarizeMarketTopics(dashboard.hotspots || refreshResult.topics || [], limit)
  const result = {
    success: true,
    booksDir,
    sources: refreshResult.sources || sources,
    inserted: refreshResult.inserted || 0,
    updated: refreshResult.updated || 0,
    hotspotSync: refreshResult.hotspotSync || {},
    fromCache: (refreshResult.results || []).some((item) => item.fromCache),
    cacheTypes: Array.from(
      new Set((refreshResult.results || []).map((item) => item.cacheType).filter(Boolean))
    ),
    topics,
    opportunities: (dashboard.topOpportunities || []).slice(0, Math.max(1, Math.min(12, limit))),
    sourceStatus: dashboard.sourceStatus || [],
    message: refreshResult.message || '市场数据已刷新'
  }
  recordNovelResearchRun({
    booksDir,
    bookName: input.bookName || input.book || '',
    result
  })
  return result
}

export async function generateNovelOutline(input = {}) {
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const idea = cleanText(input.idea || input.prompt || input.instruction)
  const splitCount = Number(input.count || input.chapters || 10)

  if (!bookName) throw new Error('缺少书籍名称')
  if (!idea) throw new Error('缺少大纲方向')
  if (!Number.isFinite(splitCount) || splitCount < 2) throw new Error('大纲段数无效')

  const bookPath = ensureBookExists(booksDir, bookName)
  const provider = resolveTextProvider(input)
  let research = null
  if (input.useMarket !== false) {
    if (input.refreshMarket) {
      research = await researchNovelMarket({
        booksDir,
        bookName: safeName(bookName),
        sources: input.sources || input.source,
        sourceFilter: input.sourceFilter,
        channel: input.channel,
        limit: input.marketLimit || 8,
        force: input.force,
        cacheTtlMs: input.cacheTtlMs,
        timeoutMs: input.timeoutMs
      })
    } else {
      const dashboard = marketService.getMarketDashboard(booksDir, {
        source: input.sourceFilter || 'all',
        channel: input.channel || 'all',
        limit: Number(input.marketLimit || 8)
      })
      research = {
        success: true,
        topics: summarizeMarketTopics(dashboard.hotspots || [], Number(input.marketLimit || 8)),
        opportunities: (dashboard.topOpportunities || []).slice(0, Number(input.marketLimit || 8)),
        sourceStatus: dashboard.sourceStatus || []
      }
    }
  }

  const sourceContent = buildOutlineSeed({
    idea,
    topics: research?.topics || [],
    opportunities: research?.opportunities || []
  })
  const result = await outlineAiService.splitOutline(
    {
      nodeTitle: input.title || `${safeName(bookName)} 全书大纲`,
      sourceContent,
      userInstruction: input.userInstruction || '',
      mode: input.mode || 'chapter',
      count: splitCount,
      model: provider.model || input.model,
      modelName: provider.model || input.modelName,
      signal: input.signal
    },
    provider.service
  )

  if (result.parseError) {
    throw new Error(`AI 大纲解析失败：${result.parseError}`)
  }
  if (!result.items.length) {
    throw new Error('AI 没有生成可保存的大纲')
  }

  const title = cleanText(input.title) || `${safeName(bookName)} 全书大纲`
  const node = outlineNode(
    title,
    sourceContent,
    result.items.map((item) => outlineNode(item.title, item.content))
  )
  const saveMode = normalizeOutlineSaveMode(input.saveMode)
  const existing = requireOutlineReadData(readOutlines(safeName(bookName), booksDir))
  const saved = writeOutlines(
    {
      bookName: safeName(bookName),
      data: appendOutlinePayload(existing, node, saveMode)
    },
    booksDir
  )
  requireCliOutlineWriteResult(saved)

  const output = {
    success: true,
    bookName: safeName(bookName),
    bookPath,
    outlineId: node.id,
    title: node.title,
    saveMode,
    count: result.items.length,
    items: result.items,
    rawText: result.rawText,
    providerId: result.providerId || provider.providerId || '',
    model: result.model || provider.model || '',
    usage: result.usage || {},
    research: research
      ? {
          topics: research.topics || [],
          opportunities: research.opportunities || [],
          fromCache: Boolean(research.fromCache),
          cacheTypes: research.cacheTypes || []
        }
      : null
  }
  recordNovelOutline({
    booksDir,
    bookName: safeName(bookName),
    bookPath,
    outline: output
  })
  return output
}

export async function writeNovelChapters(input = {}) {
  throwIfAborted(input.signal)
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume) || DEFAULT_VOLUME_NAME
  const targetWords = Number(input.targetWords || input.words || DEFAULT_TARGET_WORDS)
  const autoEdit = Boolean(input.autoEdit)
  const resume = Boolean(input.resume)
  const basePrompt = cleanText(input.prompt || input.idea || input.instruction)

  if (!bookName) throw new Error('缺少书籍名称')
  if (!Number.isFinite(targetWords) || targetWords <= 0) throw new Error('目标字数无效')
  ensureBookExists(booksDir, bookName)

  const plans = limitChapterPlans(resolveChapterPlans(input, booksDir, bookName), input)
  const drafts = limitChapterPlans(resolveChapterDrafts(input), input)
  if (!plans.length) throw new Error('没有可写章节计划')

  const results = []
  for (let index = 0; index < plans.length; index++) {
    throwIfAborted(input.signal)
    const plan = plans[index]
    const draft = drafts[index]?.content || ''
    const chapterName = plan.title || `第${index + 1}章`
    if (resume) {
      const existing = readExistingChapterSnapshot({
        booksDir,
        bookName: safeName(bookName),
        volumeName,
        chapterName
      })
      if (existing.hasContent) {
        results.push({
          success: true,
          skipped: true,
          bookName: safeName(bookName),
          volumeName,
          chapterName,
          wordCount: existing.wordCount,
          filePath: existing.filePath,
          updatedAt: existing.updatedAt,
          reason: '章节已存在且有正文'
        })
        continue
      }
    }

    const result = await writeNovelChapter({
      ...input,
      booksDir,
      bookName: safeName(bookName),
      volumeName,
      chapterName,
      prompt: buildChapterPlanPrompt({
        basePrompt,
        plan,
        draft,
        index,
        total: plans.length
      }),
      targetWords,
      autoEdit,
      signal: input.signal
    })
    results.push(result)
  }

  const writtenResults = results.filter((item) => !item.skipped)
  const skippedResults = results.filter((item) => item.skipped)
  return {
    success: true,
    bookName: safeName(bookName),
    volumeName,
    count: writtenResults.length,
    requestedCount: plans.length,
    skippedCount: skippedResults.length,
    totalWordCount: results.reduce((sum, item) => sum + Number(item.wordCount || 0), 0),
    writtenWordCount: writtenResults.reduce((sum, item) => sum + Number(item.wordCount || 0), 0),
    skippedWordCount: skippedResults.reduce((sum, item) => sum + Number(item.wordCount || 0), 0),
    chapters: results,
    skippedChapters: skippedResults,
    providerId: results.find((item) => item.providerId)?.providerId || '',
    model: results.find((item) => item.model)?.model || ''
  }
}

export async function writeNovelChapter(input = {}) {
  throwIfAborted(input.signal)
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume) || DEFAULT_VOLUME_NAME
  const chapterName = cleanText(input.chapterName || input.chapter) || DEFAULT_CHAPTER_NAME
  const prompt = cleanText(input.prompt || input.instruction)
  const targetWords = Number(input.targetWords || input.words || DEFAULT_TARGET_WORDS)
  const autoEdit = Boolean(input.autoEdit)
  const skill = skillRecord(input)

  if (!bookName) throw new Error('缺少书籍名称')
  if (!prompt) throw new Error('缺少写作要求')
  if (!Number.isFinite(targetWords) || targetWords <= 0) throw new Error('目标字数无效')

  const bookPath = ensureBookExists(booksDir, bookName)
  const generationId = `cli_write_${randomUUID()}`
  const task = createAgentTask(bookPath, {
    bookName: safeName(bookName),
    bookId: safeName(bookName),
    chapterId: chapterName,
    sessionId: `cli:${safeName(bookName)}:${chapterName}`,
    generationId,
    ...skill,
    title: `CLI 写作 ${chapterName}`,
    type: 'cli_write',
    agentMode: autoEdit ? 'auto_edit' : 'writing',
    modelId: input.modelId || input.providerId || '',
    executionMode: 'replace_chapter',
    instruction: prompt
  })

  try {
    const provider = resolveTextProvider(input)
    const bookContext = await loadEditorAgentBookContext(bookPath, {
      title: chapterName,
      chapterId: chapterName,
      instruction: prompt
    })
    const bookContextText = formatEditorAgentBookContext(bookContext)
    const taskMemory = loadEditorAgentTaskMemory(bookPath, {
      currentTaskId: task.id,
      chapterId: chapterName,
      limit: 6
    })
    const taskMemoryText = formatEditorAgentTaskMemory(taskMemory)
    const loopInput = {
      bookName: safeName(bookName),
      volumeName,
      chapterName,
      prompt,
      targetWords,
      bookContext,
      bookContextText,
      taskMemory,
      taskMemoryText,
      autoEdit,
      ...skill,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      stream: input.stream !== false,
      onChunk: input.onChunk,
      signal: input.signal
    }

    const generation = await runWriterReviewLoop(loopInput, provider, generationId, {
      bookPath,
      taskId: task.id,
      onTaskProgress: input.onTaskProgress
    })
    throwIfAborted(input.signal)
    completeAgentTask(bookPath, task.id, {
      id: generationId,
      ...skill,
      modelUsed: generation.steps.find((step) => step.modelUsed)?.modelUsed || provider.model || '',
      result: generation.text,
      review: generation.review,
      usage: totalUsage(generation.steps),
      bookContext: editorAgentBookContextRecord(bookContext),
      taskMemory: editorAgentTaskMemoryRecord(taskMemory),
      agentSteps: generation.steps
    })

    if (generation.review.passed === false && autoEdit) {
      throw new Error('Editor 复核仍未通过，已停止写入章节')
    }

    throwIfAborted(input.signal)
    const writeResult = await upsertChapter(
      {
        bookName: safeName(bookName),
        volumeName,
        chapterName,
        content: generation.text,
        overwrite: true
      },
      booksDir
    )
    requireCliChapterWriteResult(writeResult, chapterName, '写入章节失败')

    recordAgentTaskApplication(bookPath, {
      taskId: task.id,
      generationId,
      ...skill,
      applyAction: 'replace_chapter',
      status: 'applied',
      content: generation.text
    })

    const checkResult = await runConsistencyCheck({
      bookPath,
      bookName: safeName(bookName),
      volumeName,
      chapterName,
      text: generation.text,
      source: 'cli_auto_write',
      generationId,
      taskType: 'cli_write',
      applyAction: 'replace_chapter',
      skipLlm: true
    })
    const check = checkResult.check
    const issues = highOrMediumIssues(checkResult.issues)

    recordAgentTaskConsistency(bookPath, {
      taskId: task.id,
      generationId,
      checkId: check?.id || '',
      title: 'CLI 写作后一致性检查',
      summary: checkResult.summary,
      issueCount: checkResult.issues.length,
      applyAction: 'replace_chapter',
      ...skill
    })

    let repair = null
    let repairRecorded = false
    let finalText = generation.text
    let finalCheck = checkResult
    if (autoEdit && issues.length > 0) {
      try {
        const repairContext = await loadEditorAgentBookContext(bookPath, {
          title: chapterName,
          chapterId: chapterName,
          instruction: prompt,
          contextText: checkResult.summary,
          currentChapterText: generation.text
        })
        const repairContextText = formatEditorAgentBookContext(repairContext)
        const repairTaskMemory = loadEditorAgentTaskMemory(bookPath, {
          currentTaskId: task.id,
          chapterId: chapterName,
          sourceGenerationId: generationId,
          limit: 6
        })
        const repairTaskMemoryText = formatEditorAgentTaskMemory(repairTaskMemory)
        repair = await runRepairLoop(
          {
            ...loopInput,
            currentText: generation.text,
            bookContext: repairContext,
            bookContextText: repairContextText,
            taskMemory: repairTaskMemory,
            taskMemoryText: repairTaskMemoryText
          },
          provider,
          generationId,
          check,
          issues,
          {
            bookPath,
            taskId: task.id,
            onTaskProgress: input.onTaskProgress
          }
        )
        throwIfAborted(input.signal)

        if (repair.review.passed === false) {
          recordAgentTaskRepair(bookPath, {
            taskId: task.id,
            sourceGenerationId: generationId,
            repairGenerationId: repair.repairGenerationId,
            checkId: check?.id || '',
            issueCount: issues.length,
            review: repair.review,
            result: repair.text,
            steps: repair.steps,
            ...skill
          })
          repairRecorded = true
          throw new Error('Editor 未通过返修稿，已保留原章节')
        }

        throwIfAborted(input.signal)
        const repairWrite = await upsertChapter(
          {
            bookName: safeName(bookName),
            volumeName,
            chapterName,
            content: repair.text,
            overwrite: true
          },
          booksDir
        )
        requireCliChapterWriteResult(repairWrite, chapterName, '写入返修稿失败')

        recordAgentTaskRepair(bookPath, {
          taskId: task.id,
          sourceGenerationId: generationId,
          repairGenerationId: repair.repairGenerationId,
          checkId: check?.id || '',
          issueCount: issues.length,
          review: repair.review,
          result: repair.text,
          steps: repair.steps,
          ...skill
        })
        repairRecorded = true

        finalText = repair.text
        finalCheck = await runConsistencyCheck({
          bookPath,
          bookName: safeName(bookName),
          volumeName,
          chapterName,
          text: finalText,
          source: 'cli_auto_repair',
          generationId: repair.repairGenerationId,
          taskType: 'cli_write_repair',
          applyAction: 'replace_chapter',
          skipLlm: true
        })
        recordAgentTaskConsistency(bookPath, {
          taskId: task.id,
          generationId: repair.repairGenerationId,
          checkId: finalCheck.check?.id || '',
          title: 'CLI 返修后一致性检查',
          summary: finalCheck.summary,
          issueCount: finalCheck.issues.length,
          applyAction: 'replace_chapter',
          ...skill
        })
      } catch (error) {
        if (isCliCancelError(error, input.signal)) throw error
        if (!repairRecorded) {
          recordAgentTaskRepairFailure(
            bookPath,
            {
              taskId: task.id,
              sourceGenerationId: generationId,
              checkId: check?.id || '',
              issueCount: issues.length,
              ...skill
            },
            error
          )
        }
        throw error
      }
    }

    const chapterFilePath = join(bookPath, '正文', volumeName, `${chapterName}.txt`)
    const output = {
      success: true,
      bookName: safeName(bookName),
      volumeName,
      chapterName,
      filePath: chapterFilePath,
      wordCount: countWords(finalText),
      content: finalText,
      taskId: task.id,
      generationId,
      repairGenerationId: repair?.repairGenerationId || '',
      ...skill,
      review: generation.review,
      repaired: Boolean(repair?.repairGenerationId),
      check: finalCheck.check,
      issues: finalCheck.issues,
      providerId: provider.providerId || '',
      model: provider.model || ''
    }
    recordNovelChapterWrite({
      booksDir,
      bookName: safeName(bookName),
      bookPath,
      chapter: {
        ...output,
        mode: autoEdit ? 'auto_edit' : 'writing'
      }
    })
    return output
  } catch (error) {
    if (isCliCancelError(error, input.signal)) {
      cancelAgentTask(bookPath, task.id, {
        bookName: safeName(bookName),
        title: `CLI 写作 ${chapterName}`,
        type: 'cli_write',
        generationId,
        ...skill,
        content: error?.message || abortMessage(input.signal)
      })
      throw createCliCancelError(error?.message || abortMessage(input.signal))
    }
    failAgentTask(bookPath, task.id, error, {
      bookName: safeName(bookName),
      title: `CLI 写作 ${chapterName}`,
      type: 'cli_write',
      ...skill
    })
    throw error
  }
}

function normalizeRepairIssueInput(value) {
  const raw = Array.isArray(value) ? value : []
  return raw
    .map((issue) => {
      if (typeof issue === 'string') {
        return { severity: 'medium', message: cleanText(issue) }
      }
      if (!issue || typeof issue !== 'object') return null
      return {
        ...issue,
        severity: cleanText(issue.severity || issue.level || 'medium').toLowerCase() || 'medium',
        message: cleanText(issue.message || issue.title || issue.type || issue.reason),
        evidence: cleanText(issue.evidence),
        reference: cleanText(issue.reference),
        suggestion: cleanText(issue.suggestion || issue.fix)
      }
    })
    .filter((issue) => issue?.message)
    .slice(0, 20)
}

export async function repairNovelChapter(input = {}) {
  throwIfAborted(input.signal)
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume) || DEFAULT_VOLUME_NAME
  const chapterName = cleanText(input.chapterName || input.chapter) || DEFAULT_CHAPTER_NAME
  const prompt = cleanText(input.prompt || input.instruction) || '请根据一致性检查结果返修正文。'
  const currentText = cleanText(
    input.currentText || input.currentChapterText || input.text || input.content
  )
  const sourceGenerationId = cleanText(input.sourceGenerationId || input.generationId)
  const sourceText = cleanText(input.sourceText || input.sourceResult || input.sourceContent)
  const skill = skillRecord(input)
  const issues = normalizeRepairIssueInput(input.issues)
  const check = {
    id: cleanText(input.checkId),
    summary: cleanText(input.checkSummary || input.summary)
  }
  const targetWords = Number(
    input.targetWords || input.words || countWords(currentText) || DEFAULT_TARGET_WORDS
  )

  if (!bookName) throw new Error('缺少书籍名称')
  if (!currentText && !sourceText) throw new Error('缺少要返修的正文')
  if (!issues.length && !check.summary) throw new Error('缺少一致性检查问题，无法返修')
  if (!Number.isFinite(targetWords) || targetWords <= 0) throw new Error('目标字数无效')

  const bookPath = ensureBookExists(booksDir, bookName)
  const existingTaskId = cleanText(input.taskId)
  const task = existingTaskId
    ? { id: existingTaskId }
    : createAgentTask(bookPath, {
        bookName: safeName(bookName),
        bookId: safeName(bookName),
        chapterId: chapterName,
        sessionId: `cli-repair:${safeName(bookName)}:${chapterName}`,
        generationId: sourceGenerationId,
        sourceGenerationId,
        ...skill,
        title: `CLI 返修 ${chapterName}`,
        type: cleanText(input.taskType) || 'cli_repair',
        agentMode: 'repairing',
        modelId: input.modelId || input.providerId || '',
        executionMode: 'preview',
        instruction: prompt
      })

  try {
    const provider = resolveTextProvider(input)
    const bookContext = await loadEditorAgentBookContext(bookPath, {
      title: chapterName,
      chapterId: chapterName,
      instruction: prompt,
      contextText: check.summary,
      currentChapterText: currentText || sourceText
    })
    const bookContextText = formatEditorAgentBookContext(bookContext)
    const taskMemory = loadEditorAgentTaskMemory(bookPath, {
      currentTaskId: task.id,
      chapterId: chapterName,
      sourceGenerationId,
      limit: 6
    })
    const taskMemoryText = formatEditorAgentTaskMemory(taskMemory)
    const repair = await runRepairLoop(
      {
        bookName: safeName(bookName),
        volumeName,
        chapterName,
        prompt,
        targetWords,
        currentText: currentText || sourceText,
        bookContext,
        bookContextText,
        taskMemory,
        taskMemoryText,
        ...skill,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        stream: input.stream !== false,
        onChunk: input.onChunk,
        signal: input.signal
      },
      provider,
      sourceGenerationId,
      check,
      issues,
      {
        bookPath,
        taskId: task.id,
        onTaskProgress: input.onTaskProgress
      }
    )
    throwIfAborted(input.signal)
    recordAgentTaskRepair(bookPath, {
      taskId: task.id,
      sourceGenerationId,
      repairGenerationId: repair.repairGenerationId,
      checkId: check.id,
      issueCount: issues.length,
      review: repair.review,
      result: repair.text,
      steps: repair.steps,
      ...skill
    })

    return {
      success: true,
      bookName: safeName(bookName),
      volumeName,
      chapterName,
      taskId: task.id,
      sourceGenerationId,
      repairGenerationId: repair.repairGenerationId,
      generation: {
        id: repair.repairGenerationId,
        taskId: task.id,
        sourceGenerationId,
        checkId: check.id,
        ...skill,
        bookId: safeName(bookName),
        chapterId: chapterName,
        title: `CLI 返修 ${chapterName}`,
        type: 'cli_repair',
        prompt,
        modelId: input.modelId || input.providerId || '',
        modelUsed: repair.steps.find((step) => step.modelUsed)?.modelUsed || provider.model || '',
        result: repair.text,
        status: 'generated',
        agentMode: 'repairing',
        bookContext: editorAgentBookContextRecord(bookContext),
        taskMemory: editorAgentTaskMemoryRecord(taskMemory),
        review: repair.review,
        agentSteps: repair.steps,
        repair: {
          checkId: check.id,
          sourceGenerationId,
          issueCount: issues.length,
          summary: check.summary,
          issues
        },
        createdAt: new Date().toISOString()
      },
      content: repair.text,
      wordCount: countWords(repair.text),
      review: repair.review,
      reviewPassed: repair.review?.passed === true,
      checkId: check.id,
      issueCount: issues.length,
      ...skill,
      providerId: provider.providerId || '',
      model: provider.model || ''
    }
  } catch (error) {
    if (isCliCancelError(error, input.signal)) {
      cancelAgentTask(bookPath, task.id, {
        bookName: safeName(bookName),
        title: `CLI 返修 ${chapterName}`,
        type: 'cli_repair',
        generationId: sourceGenerationId,
        sourceGenerationId,
        ...skill,
        content: error?.message || abortMessage(input.signal)
      })
      throw createCliCancelError(error?.message || abortMessage(input.signal))
    }
    recordAgentTaskRepairFailure(
      bookPath,
      {
        taskId: task.id,
        sourceGenerationId,
        checkId: check.id,
        issueCount: issues.length,
        ...skill
      },
      error
    )
    throw error
  }
}

export async function runNovelLifecycle(input = {}) {
  throwIfAborted(input.signal)
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const idea = cleanText(input.idea || input.prompt || input.instruction)
  const outlineCount = Number(input.count || input.outlineCount || 10)
  const writeChapters = Number(input.writeChapters || input.chapters || outlineCount)
  const stages = []

  if (!bookName) throw new Error('缺少书籍名称')
  if (!idea) throw new Error('缺少创作方向')

  const provider = resolveTextProvider(input)

  throwIfAborted(input.signal)
  const research = await researchNovelMarket({
    ...input,
    booksDir,
    bookName: '',
    sources: input.sources || input.source,
    limit: input.marketLimit || input.limit || 8
  })
  stages.push({
    name: 'research',
    status: 'done',
    topicCount: research.topics.length,
    fromCache: research.fromCache
  })

  let bookIdea = null
  let selectedPlan = input.selectedPlan || null
  const selectedPlanId = cleanText(input.selectedPlanId || input.planId || selectedPlan?.id)
  const bookIdeaPayload = buildBookIdeaPayload({
    ...input,
    idea,
    model: provider.model || input.model || input.modelName || '',
    providerId: provider.providerId || input.providerId || ''
  })

  throwIfAborted(input.signal)
  bookIdea = await bookIdeaAiService.generateBookIdeas(bookIdeaPayload, provider.service)
  selectedPlan = resolveLifecycleSelectedPlan(bookIdea, { ...input, selectedPlanId, selectedPlan })
  if (!selectedPlan) {
    throw new Error('AI 没有生成可用立项方案')
  }
  const recordedBookIdea = recordNovelBookIdeaRun({
    booksDir,
    payload: bookIdeaPayload,
    result: {
      ...bookIdea,
      selectedPlanId: selectedPlan.id,
      selectedPlan
    },
    selectedPlanId: selectedPlan.id,
    selectedPlan
  })
  bookIdea = {
    ...bookIdea,
    selectedPlanId: selectedPlan.id,
    selectedPlan,
    runId: recordedBookIdea?.id || ''
  }
  stages.push({
    name: 'book_idea',
    status: 'done',
    runId: bookIdea.runId,
    selectedPlanId: selectedPlan.id,
    planCount: bookIdea.plans.length
  })

  throwIfAborted(input.signal)
  const resolvedBookName = cleanText(bookName || selectedPlan.title) || bookName
  const resolvedType = cleanText(selectedPlan.type || input.type) || 'original'
  const resolvedTypeName = cleanText(selectedPlan.typeName || input.typeName) || '原创'
  const resolvedIntro = cleanText(input.intro || selectedPlan.intro || idea)

  const initialized = await initNovelProject({
    ...input,
    booksDir,
    bookName: resolvedBookName,
    type: resolvedType,
    typeName: resolvedTypeName,
    intro: resolvedIntro,
    bookIdeaRunId: recordedBookIdea?.id || input.bookIdeaRunId,
    selectedPlanId: selectedPlan.id,
    selectedPlan
  })
  stages.push({
    name: 'init',
    status: 'done',
    bookName: initialized.bookName,
    existed: initialized.existed,
    selectedPlanId: selectedPlan.id
  })

  let extraction = null
  throwIfAborted(input.signal)
  if (hasLifecycleExtractionSource(input)) {
    const extractionPayload = buildLifecycleExtractionPayload(
      input,
      initialized.bookPath,
      initialized.bookName
    )
    const extractionSummary = await extractionAiService.createExtraction(
      {
        ...extractionPayload,
        textProvider: provider.service
      },
      provider.service
    )
    const extractionRecord = extractionAiService.getExtractionRecord(
      initialized.bookPath,
      extractionSummary.id
    )
    recordNovelExtractionRun({
      booksDir,
      bookName: initialized.bookName,
      bookPath: initialized.bookPath,
      extraction: extractionRecord
    })
    extraction = {
      ...extractionRecord,
      bookName: initialized.bookName,
      bookPath: initialized.bookPath
    }
    stages.push({
      name: 'extraction',
      status: 'done',
      extractionId: extractionRecord.id,
      sourceBookName: extractionRecord.sourceBookName
    })
  } else {
    stages.push({
      name: 'extraction',
      status: 'skipped',
      reason: '缺少真实来源文本'
    })
  }

  throwIfAborted(input.signal)
  const settingPayload = buildSettingTreePayload(
    input,
    resolvedIntro,
    initialized.bookPath,
    selectedPlan
  )
  const settingTree = await settingTreeAiService.generateSettingTree(
    settingPayload,
    provider.service
  )
  const settingsDocument = writeSettingsDocument(
    booksDir,
    initialized.bookName,
    cloneSettingsCategories(settingTree)
  )
  stages.push({
    name: 'setting',
    status: 'done',
    categoryCount: Array.isArray(settingTree.categories) ? settingTree.categories.length : 0,
    strategy: settingTree.strategy,
    fileName: settingsDocument.fileName || 'settings.json'
  })

  throwIfAborted(input.signal)
  let outline = null
  if (input.resume) {
    outline = loadStoredOutlineForResume(booksDir, initialized.bookName, input.outlineId)
  }
  if (outline) {
    stages.push({
      name: 'outline',
      status: 'skipped',
      outlineId: outline.outlineId,
      count: outline.count,
      reused: true
    })
  } else {
    outline = await generateNovelOutline({
      ...input,
      booksDir,
      bookName: initialized.bookName,
      idea: resolvedIntro,
      count: outlineCount,
      useMarket: true,
      refreshMarket: false,
      saveMode: input.saveMode || 'replace',
      marketLimit: input.marketLimit || input.limit || 8,
      textProvider: provider.service,
      model: provider.model || input.model || input.modelName || '',
      providerId: provider.providerId || input.providerId || ''
    })
    stages.push({
      name: 'outline',
      status: 'done',
      outlineId: outline.outlineId,
      count: outline.count
    })
  }

  throwIfAborted(input.signal)
  const plannedWriteCount =
    Number.isFinite(writeChapters) && writeChapters > 0 ? writeChapters : outline.items.length
  const chapterOutlineCount = Math.min(plannedWriteCount, outline.items.length)
  const chapterOutlineResult = await generateNovelChapterOutlines({
    ...input,
    booksDir,
    bookName: initialized.bookName,
    volumeName: input.volumeName || input.volume || DEFAULT_VOLUME_NAME,
    outlineId: outline.outlineId,
    outlineItems: outline.items,
    chapterOutlineCount,
    chapterOutlineStart: input.start || 1,
    chapterOutlineRequirement: resolvedIntro,
    targetWords: input.targetWords || DEFAULT_TARGET_WORDS,
    previousChapterExcerpt: input.previousChapterExcerpt || ''
  })
  stages.push({
    name: 'chapter_outline',
    status: 'done',
    count: chapterOutlineResult.count
  })

  throwIfAborted(input.signal)
  const writing = await writeNovelChapters({
    ...input,
    booksDir,
    bookName: initialized.bookName,
    volumeName: input.volumeName || input.volume || DEFAULT_VOLUME_NAME,
    prompt: resolvedIntro,
    chapterPlans: outline.items,
    chapterDrafts: chapterOutlineResult.chapterOutlines,
    writeChapters: plannedWriteCount,
    autoEdit: input.autoEdit !== false,
    resume: Boolean(input.resume),
    textProvider: provider.service,
    signal: input.signal
  })
  stages.push({
    name: 'write',
    status: 'done',
    count: writing.count,
    totalWordCount: writing.totalWordCount
  })

  const issueCount = writing.chapters.reduce(
    (sum, item) => sum + Number(item.issues?.length || 0),
    0
  )
  stages.push({
    name: 'check',
    status: 'done',
    checkCount: writing.chapters.filter((item) => item.check?.id).length,
    issueCount
  })

  let exported = null
  if (input.exportResult !== false && input.export !== false) {
    throwIfAborted(input.signal)
    exported = exportNovelBook({
      ...input,
      booksDir,
      bookName: initialized.bookName,
      format: input.format || 'md'
    })
    stages.push({ name: 'export', status: 'done', filePath: exported.filePath || '' })
  }

  return {
    success: true,
    booksDir,
    bookName: initialized.bookName,
    stages,
    bookIdea,
    init: initialized,
    research,
    extraction,
    setting: {
      categories: settingTree.categories,
      strategy: settingTree.strategy,
      usage: settingTree.usage,
      providerId: settingTree.providerId || provider.providerId || '',
      model: settingTree.model || provider.model || '',
      document: settingsDocument
    },
    outline,
    chapterOutlines: chapterOutlineResult.chapterOutlines,
    writing,
    export: exported
  }
}

export function exportNovelBook(input = {}) {
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  if (!bookName) throw new Error('缺少书籍名称')
  ensureBookExists(booksDir, bookName)

  const result = exportBook(booksDir, {
    bookName: safeName(bookName),
    format: input.format || 'txt'
  })
  const exportResult = requireCliExportResult(result)
  recordNovelExport({
    booksDir,
    bookName: safeName(bookName),
    format: input.format || 'txt',
    result: exportResult
  })
  return exportResult
}

export function listNovelTasks(input = {}) {
  const booksDir = ensureBooksDir(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  if (!bookName) throw new Error('缺少书籍名称')
  const bookPath = ensureBookExists(booksDir, bookName)
  const result = listAgentTasks(bookPath, {
    id: input.id || input.taskId,
    taskId: input.taskId,
    generationId: input.generationId,
    chapterId: input.chapterId || input.chapter,
    status: input.status,
    type: input.type,
    agentMode: input.agentMode,
    limit: input.limit
  })
  return {
    success: true,
    bookName: safeName(bookName),
    bookPath,
    count: result.tasks.length,
    tasks: result.tasks
  }
}

export default {
  initNovelProject,
  researchNovelMarket,
  generateNovelOutline,
  writeNovelChapter,
  repairNovelChapter,
  writeNovelChapters,
  runNovelLifecycle,
  exportNovelBook,
  listNovelTasks
}

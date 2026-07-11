import fs from 'node:fs'
import { listAgentTasks } from './editorAgentTaskService.js'

const DEFAULT_TASK_LIMIT = 6
const DEFAULT_EVENT_LIMIT = 4
const MAX_TEXT_LENGTH = 260
const MAX_BLOCK_LENGTH = 3200

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function truncate(value, max = MAX_TEXT_LENGTH) {
  const text = cleanText(String(value || ''))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}...`
}

function eventTime(event = {}, task = {}) {
  return cleanText(event.finishedAt || event.startedAt || task.updatedAt || task.createdAt)
}

function eventLine(event = {}, task = {}) {
  const title = cleanText(event.title || event.type || '事件')
  const status = cleanText(event.status || task.status)
  const content = truncate(event.content || event.summary || '')
  const parts = [title, status ? `状态：${status}` : '', content ? `内容：${content}` : ''].filter(
    Boolean
  )
  return `  - ${parts.join('；')}`
}

function normalizeMemoryTask(task = {}, eventLimit = DEFAULT_EVENT_LIMIT) {
  const events = Array.isArray(task.events) ? task.events : []
  const usefulEvents = events
    .filter((event) => {
      const type = cleanText(event?.type)
      return type && type !== 'task_started'
    })
    .slice(-eventLimit)
  return {
    id: cleanText(task.id),
    title: cleanText(task.title || task.type || '历史任务'),
    status: cleanText(task.status),
    type: cleanText(task.type),
    chapterId: cleanText(task.chapterId),
    generationId: cleanText(task.generationId),
    repairGenerationId: cleanText(task.repairGenerationId),
    updatedAt: cleanText(task.updatedAt || task.createdAt),
    resultPreview: truncate(task.resultPreview || ''),
    error: truncate(task.error || ''),
    review: task.review && typeof task.review === 'object' ? task.review : null,
    events: usefulEvents.map((event) => ({
      type: cleanText(event.type),
      role: cleanText(event.role),
      title: cleanText(event.title || event.type),
      status: cleanText(event.status),
      content: truncate(event.content || ''),
      finishedAt: eventTime(event, task),
      generationId: cleanText(event.generationId),
      repairGenerationId: cleanText(event.repairGenerationId),
      checkId: cleanText(event.checkId),
      issueCount: Number.isFinite(Number(event.issueCount)) ? Number(event.issueCount) : undefined
    }))
  }
}

function taskMemoryBlock(task = {}) {
  const header = [
    `- ${task.title || '历史任务'}`,
    task.chapterId ? `章节：${task.chapterId}` : '',
    task.status ? `状态：${task.status}` : '',
    task.updatedAt ? `时间：${task.updatedAt}` : ''
  ]
    .filter(Boolean)
    .join('；')
  const lines = [header]
  if (task.resultPreview) lines.push(`  - 结果摘要：${task.resultPreview}`)
  if (task.review?.passed === false) {
    const issues = Array.isArray(task.review.issues) ? task.review.issues.join('；') : ''
    lines.push(
      `  - Editor 未通过：${truncate(issues || task.review.revisionInstruction || '未列出原因')}`
    )
  }
  if (task.error) lines.push(`  - 错误：${task.error}`)
  for (const event of task.events || []) {
    lines.push(eventLine(event, task))
  }
  return lines.join('\n')
}

export function formatEditorAgentTaskMemory(memory = {}) {
  if (!memory.loaded || !Array.isArray(memory.tasks) || memory.tasks.length === 0) {
    return '暂无可用历史任务记录。'
  }
  return memory.tasks.map(taskMemoryBlock).join('\n\n').slice(0, MAX_BLOCK_LENGTH)
}

export function summarizeEditorAgentTaskMemory(memory = {}) {
  if (!memory.loaded) {
    return memory.error ? `未读取到历史任务记录：${memory.error}` : '暂无可用历史任务记录。'
  }
  return `已读取 ${memory.taskCount} 条历史任务、${memory.eventCount} 条事件，约 ${memory.contextChars} 字。`
}

export function editorAgentTaskMemoryRecord(memory = {}) {
  return {
    loaded: Boolean(memory.loaded),
    taskCount: Number(memory.taskCount || 0),
    eventCount: Number(memory.eventCount || 0),
    contextChars: Number(memory.contextChars || 0),
    sources: Array.isArray(memory.sources) ? memory.sources : [],
    preview: truncate(memory.block || '', 700),
    error: cleanText(memory.error),
    loadedAt: cleanText(memory.loadedAt)
  }
}

export function loadEditorAgentTaskMemory(bookPath, options = {}) {
  const loadedAt = new Date().toISOString()
  const limit =
    Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
      ? Number(options.limit)
      : DEFAULT_TASK_LIMIT
  const eventLimit =
    Number.isFinite(Number(options.eventLimit)) && Number(options.eventLimit) > 0
      ? Number(options.eventLimit)
      : DEFAULT_EVENT_LIMIT

  try {
    if (!bookPath || !fs.existsSync(bookPath)) {
      return {
        loaded: false,
        taskCount: 0,
        eventCount: 0,
        contextChars: 0,
        tasks: [],
        sources: [],
        block: '',
        error: '作品目录不存在',
        loadedAt
      }
    }
    const response = listAgentTasks(bookPath, { limit: Math.max(limit + 4, limit) })
    const currentTaskId = cleanText(options.currentTaskId || options.taskId)
    const sourceGenerationId = cleanText(options.sourceGenerationId)
    const generationId = cleanText(options.generationId)
    const chapterId = cleanText(options.chapterId)
    const tasks = (Array.isArray(response.tasks) ? response.tasks : [])
      .filter((task) => {
        if (currentTaskId && task.id === currentTaskId) return false
        if (sourceGenerationId && task.repairGenerationId === sourceGenerationId) return false
        if (generationId && task.generationId === generationId) return false
        if (chapterId && task.chapterId && task.chapterId !== chapterId) return false
        return true
      })
      .slice(0, limit)
      .map((task) => normalizeMemoryTask(task, eventLimit))

    const block = formatEditorAgentTaskMemory({ loaded: true, tasks })
    const sources = tasks.map((task) => ({
      type: 'agent_task',
      label: task.title || task.id,
      id: task.id,
      chapterId: task.chapterId,
      updatedAt: task.updatedAt
    }))
    const eventCount = tasks.reduce((sum, task) => sum + (task.events?.length || 0), 0)
    return {
      loaded: tasks.length > 0,
      taskCount: tasks.length,
      eventCount,
      contextChars: block.length,
      tasks,
      sources,
      block,
      error: '',
      loadedAt
    }
  } catch (error) {
    return {
      loaded: false,
      taskCount: 0,
      eventCount: 0,
      contextChars: 0,
      tasks: [],
      sources: [],
      block: '',
      error: error?.message || String(error || '历史任务记录读取失败'),
      loadedAt
    }
  }
}

export default {
  editorAgentTaskMemoryRecord,
  formatEditorAgentTaskMemory,
  loadEditorAgentTaskMemory,
  summarizeEditorAgentTaskMemory
}

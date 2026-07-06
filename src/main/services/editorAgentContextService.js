import fs from 'node:fs'
import { join } from 'node:path'
import { buildBookWritingContextBlock } from './bookWritingContext.js'

const DEFAULT_AGENT_CONTEXT_CHARS = 7000

const CONTEXT_SOURCE_FILES = [
  { type: 'book_meta', label: '书籍信息', file: 'mazi.json', marker: '【书籍信息】' },
  { type: 'characters', label: '人物设定', file: 'characters.json', marker: '【人物设定】' },
  { type: 'entity_profiles', label: '扩展档案', file: 'entity_profiles.json', marker: '【扩展档案】' },
  { type: 'dictionary', label: '词条设定', file: 'dictionary.json', marker: '【词条设定】' },
  { type: 'settings', label: '设定管理', file: 'settings.json', marker: '【设定管理】' },
  { type: 'timelines', label: '时间线摘要', file: 'timelines.json', marker: '【时间线摘要】' }
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function compactText(value = '', maxLength = 900) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text
}

function agentContextSearchText(payload = {}) {
  return [
    payload.title,
    payload.chapterId,
    payload.instruction,
    payload.contextText,
    payload.currentChapterText,
    payload.selectedText
  ].map(cleanText).filter(Boolean).join('\n\n')
}

export function detectEditorAgentBookContextSources(bookPath, contextBlock = '') {
  const block = String(contextBlock || '')
  if (!bookPath || !block) return []

  const sources = CONTEXT_SOURCE_FILES
    .filter((item) => block.includes(item.marker) && fs.existsSync(join(bookPath, item.file)))
    .map((item) => ({
      type: item.type,
      label: item.label,
      path: join(bookPath, item.file)
    }))

  if (block.includes('【拆书知识参考】')) {
    const knowledgePath = join(bookPath, 'knowledge')
    sources.push({
      type: 'knowledge',
      label: '拆书知识参考',
      path: fs.existsSync(knowledgePath) ? knowledgePath : ''
    })
  }

  return sources
}

export function editorAgentBookContextRecord(context = {}) {
  const sources = Array.isArray(context.sources) ? context.sources : []
  return {
    loaded: Boolean(context.loaded),
    sourceCount: Number.isFinite(Number(context.sourceCount))
      ? Number(context.sourceCount)
      : sources.length,
    contextChars: Number.isFinite(Number(context.contextChars)) ? Number(context.contextChars) : 0,
    sources,
    preview: compactText(context.block || '', 700),
    error: cleanText(context.error),
    loadedAt: cleanText(context.loadedAt)
  }
}

export function summarizeEditorAgentBookContext(context = {}) {
  const record = editorAgentBookContextRecord(context)
  if (record.error) return `作品资料读取失败：${record.error}`
  if (!record.loaded) return '未读取到可用作品资料。'

  const labels = record.sources
    .map((item) => cleanText(item.label || item.type))
    .filter(Boolean)
    .join('、')
  return [
    `已读取 ${record.sourceCount} 类作品资料，约 ${record.contextChars} 字。`,
    labels ? `来源：${labels}` : ''
  ].filter(Boolean).join('')
}

export function formatEditorAgentBookContext(context = {}) {
  const block = cleanText(context.block)
  return block || '未读取到可用作品资料。'
}

export async function loadEditorAgentBookContext(bookPath, payload = {}, options = {}) {
  const loadedAt = new Date().toISOString()
  if (!bookPath || !fs.existsSync(bookPath)) {
    return {
      loaded: false,
      block: '',
      sources: [],
      sourceCount: 0,
      contextChars: 0,
      error: '作品目录不存在',
      loadedAt
    }
  }

  try {
    const outlineTitle = cleanText(payload.title || payload.chapterId) || '创作台任务'
    const outlineContent = agentContextSearchText(payload)
    const block = await buildBookWritingContextBlock(bookPath, {
      outlineTitle,
      outlineContent,
      maxTotalChars: Number(options.maxTotalChars) > 0
        ? Number(options.maxTotalChars)
        : DEFAULT_AGENT_CONTEXT_CHARS
    })
    const sources = detectEditorAgentBookContextSources(bookPath, block)

    return {
      loaded: Boolean(block),
      block,
      sources,
      sourceCount: sources.length,
      contextChars: block.length,
      error: '',
      loadedAt
    }
  } catch (error) {
    return {
      loaded: false,
      block: '',
      sources: [],
      sourceCount: 0,
      contextChars: 0,
      error: error?.message || '读取作品资料失败',
      loadedAt
    }
  }
}

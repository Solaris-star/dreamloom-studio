import { postJson } from './webHttpClient.js'

const CLEANUP_INSTRUCTION =
  '请清理这段小说文本中的防盗版乱码、生僻符号和无逻辑字符组合。必须保留正常剧情、描写和对白，不得概括、续写或调整文风。只返回清理后的正文，不要解释。'

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createTextRevisionToken(text) {
  const content = String(text || '')
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `text-${content.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function buildParagraphDiff(originalText, resultText) {
  const before = splitParagraphs(originalText)
  const after = splitParagraphs(resultText)
  const rows = Array.from({ length: before.length + 1 }, () =>
    Array(after.length + 1).fill(0)
  )
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      rows[i][j] =
        before[i] === after[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    }
  }

  const changes = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      changes.push({ type: 'unchanged', before: before[i], after: after[j] })
      i += 1
      j += 1
    } else if (i < before.length && j < after.length && rows[i + 1][j] === rows[i][j + 1]) {
      changes.push({ type: 'changed', before: before[i], after: after[j] })
      i += 1
      j += 1
    } else if (j < after.length && (i >= before.length || rows[i][j + 1] > rows[i + 1][j])) {
      changes.push({ type: 'added', before: '', after: after[j] })
      j += 1
    } else {
      changes.push({ type: 'removed', before: before[i], after: '' })
      i += 1
    }
  }
  return changes
}

export function applyParagraphDiffChoices(changes, choices = []) {
  if (!Array.isArray(changes)) return ''
  return changes
    .map((change, index) => {
      const useResult = change?.type === 'unchanged' || choices[index] !== false
      return String(useResult ? change?.after || '' : change?.before || '').trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

function splitModelBindingId(modelId = '') {
  const [providerId, ...modelParts] = String(modelId || '').trim().split('::')
  return {
    providerId: String(providerId || '').trim(),
    modelName: modelParts.join('::').trim()
  }
}

async function readStoreValue(key, fallback = '') {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error(result?.message || '读取 AI 模型设置失败')
  }
  return result.value ?? fallback
}

async function resolveCleanupModel() {
  const defaults = await readStoreValue('editorModelDefaults', {})
  if (defaults == null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error('AI 模型设置格式不正确')
  }
  const modelId = defaults.writing || defaults.summary || defaults.chat || ''
  const parsed = splitModelBindingId(modelId)
  const providerId =
    parsed.providerId || (await readStoreValue('aiProviders.activeTextId', ''))
  return {
    modelId,
    providerId: String(providerId || ''),
    modelName: parsed.modelName
  }
}

function requireCleanupResponse(response) {
  if (response?.success !== true) {
    throw new Error(response?.message || response?.error || 'AI 清理失败')
  }
  const content = String(response.content ?? response.result ?? response.text ?? '').trim()
  if (!content) throw new Error('AI 返回空内容，已保留原文')
  return content
}

export async function requestEditorTextCleanup({
  text,
  bookId = '',
  chapterId = '',
  selection = null,
  editVersion = '',
  modelId = '',
  providerId = '',
  modelName = ''
}) {
  const content = String(text || '').trim()
  if (!content) throw new Error('待清理内容不能为空')
  const configuredModel =
    modelId || providerId || modelName
      ? { modelId, providerId, modelName }
      : await resolveCleanupModel()
  const response = await postJson(
    '/api/ai/text-task',
    {
      task: 'clean_garbage',
      feature: 'ai_polish',
      title: '编辑器 AI 清理乱码',
      content,
      instruction: CLEANUP_INSTRUCTION,
      bookId,
      chapterId,
      selection,
      editVersion,
      ...configuredModel
    },
    { timeoutMs: 120_000 }
  )
  const cleaned = requireCleanupResponse(response)
  return {
    success: true,
    content: cleaned,
    usage: response.usage || {},
    model: response.model || configuredModel.modelName,
    providerId: response.providerId || configuredModel.providerId
  }
}

export async function cleanEditorText(text, context = {}) {
  const content = String(text || '').trim()
  const result = await requestEditorTextCleanup({ text: content, ...context })
  const cleaned = result.content
  const removedRatio = content.length > 0 ? Math.max(0, 1 - cleaned.length / content.length) : 0
  return {
    ...result,
    content: cleaned,
    diff: buildParagraphDiff(content, cleaned),
    warnings: removedRatio >= 0.3 ? ['AI 结果比原文短 30% 以上，可能误删正常内容'] : [],
    removedRatio
  }
}

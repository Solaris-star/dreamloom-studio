import fs from 'node:fs'
import { join, resolve } from 'node:path'

const WRITING_REFERENCE_ROOTS = ['resources/writing-references']

// 每个 reference 的字符预算：大文件截断注入，避免撑爆上下文
const DEFAULT_MAX_CHARS = 6000
// 单次注入的总预算
const TOTAL_BUDGET_CHARS = 24000

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function candidateRoots() {
  const roots = WRITING_REFERENCE_ROOTS.map((dir) => resolve(process.cwd(), dir))
  if (process.resourcesPath) {
    for (const dir of WRITING_REFERENCE_ROOTS) {
      roots.push(resolve(process.resourcesPath, dir))
    }
  }
  return Array.from(new Set(roots))
}

function normalizeReferencePath(value = '') {
  let path = cleanText(value)
  if (!path) return ''
  path = path.replace(/^\/+/, '')
  if (path.startsWith('resources/writing-references/')) {
    path = path.slice('resources/writing-references/'.length)
  }
  if (path.startsWith('references/')) {
    path = path.slice('references/'.length)
  }
  return path
}

function findReferenceFile(rawPath = '') {
  const normalized = normalizeReferencePath(rawPath)
  if (!normalized) return null
  const candidates = [normalized, `${normalized}.md`]
  for (const root of candidateRoots()) {
    for (const candidate of candidates) {
      const filePath = join(root, candidate)
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return filePath
        }
      } catch {
        // ignore stat failures
      }
    }
  }
  return null
}

function extractMarkdownSection(content = '', maxChars = DEFAULT_MAX_CHARS) {
  const text = String(content || '').trim()
  if (text.length <= maxChars) return text
  // 从头截断到预算，再回退到最后一个段落边界
  let slice = text.slice(0, maxChars)
  const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'))
  if (lastBreak > maxChars * 0.6) slice = slice.slice(0, lastBreak)
  return `${slice}\n\n（注：参考资料过长，已截断。完整内容见 resources/writing-references/）`
}

export function loadWritingReference(rawPath = '', maxChars = DEFAULT_MAX_CHARS) {
  const filePath = findReferenceFile(rawPath)
  if (!filePath) return null
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return {
      path: normalizeReferencePath(rawPath),
      file: filePath,
      chars: content.length,
      content: extractMarkdownSection(content, maxChars)
    }
  } catch {
    return null
  }
}

export function buildWritingReferenceBlock(referencePaths = [], options = {}) {
  const paths = Array.isArray(referencePaths) ? referencePaths.map(cleanText).filter(Boolean) : []
  if (!paths.length) return { block: '', loaded: [], missing: [], chars: 0 }

  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : DEFAULT_MAX_CHARS
  const totalBudget = Number.isFinite(options.totalBudgetChars)
    ? options.totalBudgetChars
    : TOTAL_BUDGET_CHARS

  const loaded = []
  const missing = []
  const sections = []
  let used = 0

  for (const rawPath of paths) {
    if (used >= totalBudget) {
      missing.push({ path: rawPath, reason: 'budget' })
      continue
    }
    const reference = loadWritingReference(rawPath, maxChars)
    if (!reference) {
      missing.push({ path: rawPath, reason: 'not-found' })
      continue
    }
    const remaining = totalBudget - used
    const section = reference.content.slice(0, remaining)
    if (!section.trim()) {
      missing.push({ path: rawPath, reason: 'budget' })
      continue
    }
    loaded.push({ path: reference.path, file: reference.file, chars: section.length })
    sections.push(`【参考资料：${reference.path}】\n${section}`)
    used += section.length
  }

  if (!sections.length) return { block: '', loaded, missing, chars: 0 }

  const block = ['以下是与本次写作任务直接相关的方法论参考资料，写作时请遵循其中的规则与技法：', ...sections].join('\n\n')
  return { block, loaded, missing, chars: block.length }
}

export default {
  loadWritingReference,
  buildWritingReferenceBlock
}

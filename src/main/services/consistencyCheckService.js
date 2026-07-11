import fs from 'fs'
import { basename, dirname, join } from 'path'
import { randomUUID } from 'crypto'

const CHECK_STORE_FILE = 'consistency-checks.json'
const MAX_CONTEXT_ITEMS = 80
const MAX_LLM_TEXT_CHARS = 12000

const MALE_TERMS = ['男儿身', '男子', '男人', '少年', '公子', '男性', '男的']
const FEMALE_TERMS = ['女儿身', '女子', '女人', '少女', '姑娘', '女性', '女的']
const DAY_TERMS = ['白天', '白日', '正午', '日光', '太阳底下', '烈日']
const NIGHT_TERMS = ['夜间', '夜里', '夜晚', '夜色', '晚上', '子夜', '月下']
const ONLY_TERMS = ['只能', '仅能', '只可', '必须', '不可缺少', '限定']
const USE_TERMS = ['施展', '发动', '使用', '催动', '运行', '施法']

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isAbortSignal(signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
}

function abortMessage(signal, fallback = '一致性检查已停止') {
  const reason = signal?.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  if (reason?.message) return reason.message
  return fallback
}

function throwIfAborted(signal) {
  if (!isAbortSignal(signal) || !signal.aborted) return
  const error = new Error(abortMessage(signal))
  error.name = 'AbortError'
  error.cancelled = true
  throw error
}

function safeReadJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`读取 JSON 文件失败：${filePath} ${error?.message || ''}`.trim())
  }
}

function safeWriteJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function truncate(value, max = 240) {
  const text = cleanText(String(value || ''))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}...`
}

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readArrayFile(filePath, fallback, fileName) {
  const existed = Boolean(filePath && fs.existsSync(filePath))
  const data = safeReadJson(filePath, fallback)
  if (existed && !Array.isArray(data)) throw new Error(`${fileName} 格式错误，应为数组`)
  return data
}

function readPlainObjectFile(filePath, fallback, fileName) {
  const existed = Boolean(filePath && fs.existsSync(filePath))
  const data = safeReadJson(filePath, fallback)
  if (existed && !isPlainObject(data)) throw new Error(`${fileName} 格式错误，应为对象`)
  return data
}

function readSettingsFile(filePath) {
  const existed = Boolean(filePath && fs.existsSync(filePath))
  const data = safeReadJson(filePath, {})
  if (existed && (!isPlainObject(data) || !Array.isArray(data.categories))) {
    throw new Error('settings.json 格式错误，应包含 categories 数组')
  }
  return data
}

function normalizeGender(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (/女/.test(text)) return 'female'
  if (/男/.test(text)) return 'male'
  return ''
}

function chineseNumberToInt(value) {
  const text = cleanText(value)
  if (!text) return null
  const digitText = text.replace(/[岁\s]/g, '')
  if (/^\d+$/.test(digitText)) return Number(digitText)

  const map = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  }

  let result = 0
  let section = 0
  let number = 0
  for (const char of digitText) {
    if (Object.prototype.hasOwnProperty.call(map, char)) {
      number = map[char]
    } else if (char === '十') {
      section += (number || 1) * 10
      number = 0
    } else if (char === '百') {
      section += (number || 1) * 100
      number = 0
    }
  }
  result = section + number
  return Number.isFinite(result) && result > 0 ? result : null
}

function normalizeAge(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const text = cleanText(value)
  if (!text) return null
  const matched = text.match(/[零〇一二两三四五六七八九十百\d]{1,5}/)
  return matched ? chineseNumberToInt(matched[0]) : null
}

function normalizeHeightCm(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 3 ? Math.round(value) : Math.round(value * 100)
  }
  const text = cleanText(value)
  if (!text) return null
  const cm = text.match(/(\d{2,3})\s*(?:cm|厘米|公分)?/i)
  if (cm) return Number(cm[1])
  const meter = text.match(/(\d)(?:\.|米)(\d{1,2})/)
  if (meter) return Number(meter[1]) * 100 + Number(meter[2].padEnd(2, '0'))
  return null
}

function findNearbyPhrases(text, name, pattern, limit = 6) {
  const cleanName = cleanText(name)
  if (!cleanName || cleanName.length < 2) return []
  const regexes = [
    new RegExp(`${escapeRegExp(cleanName)}[^。！？\n]{0,40}?${pattern}`, 'g'),
    new RegExp(`${pattern}[^。！？\n]{0,40}?${escapeRegExp(cleanName)}`, 'g')
  ]
  const matches = []
  const seen = new Set()
  for (const regex of regexes) {
    let match
    while ((match = regex.exec(text)) && matches.length < limit) {
      if (seen.has(match[0])) continue
      seen.add(match[0])
      matches.push({
        text: match[0],
        groups: match.slice(1).filter((group) => group !== undefined)
      })
    }
  }
  return matches
}

function issueBase({
  type,
  severity = 'medium',
  message,
  evidence,
  reference,
  expected,
  actual,
  suggestion,
  source = 'rules'
}) {
  return {
    id: randomUUID(),
    source,
    type,
    severity,
    message,
    evidence: truncate(evidence, 320),
    reference: truncate(reference, 320),
    expected,
    actual,
    suggestion: truncate(suggestion, 240)
  }
}

function loadBookFacts(bookPath) {
  const meta = readPlainObjectFile(join(bookPath, 'mazi.json'), {}, 'mazi.json')
  const characters = readArrayFile(join(bookPath, 'characters.json'), [], 'characters.json')
  const dictionary = flattenDictionary(
    readArrayFile(join(bookPath, 'dictionary.json'), [], 'dictionary.json')
  )
  const settings = flattenSettings(readSettingsFile(join(bookPath, 'settings.json')))
  const timelines = readArrayFile(join(bookPath, 'timelines.json'), [], 'timelines.json')
  return { meta, characters, dictionary, settings, timelines }
}

function flattenDictionary(nodes, out = []) {
  for (const node of normalizeList(nodes)) {
    const name = cleanText(node?.name)
    if (name) out.push({ name, introduction: cleanText(node?.introduction), type: 'dictionary' })
    flattenDictionary(node?.children, out)
  }
  return out
}

function flattenSettings(data) {
  const out = []
  const walk = (nodes, path = []) => {
    for (const node of normalizeList(nodes)) {
      const categoryName = cleanText(node?.name)
      const nextPath = categoryName ? [...path, categoryName] : path
      if (categoryName && cleanText(node?.introduction)) {
        out.push({
          name: categoryName,
          introduction: cleanText(node.introduction),
          path: nextPath,
          type: 'category'
        })
      }
      for (const item of normalizeList(node?.items)) {
        const name = cleanText(item?.name)
        if (name)
          out.push({
            name,
            introduction: cleanText(item?.introduction),
            path: nextPath,
            type: 'setting'
          })
      }
      walk(node?.children, nextPath)
    }
  }
  walk(data?.categories)
  return out
}

function checkCharacterFacts(text, characters) {
  const issues = []
  for (const character of normalizeList(characters)) {
    const name = cleanText(character?.name)
    if (name.length < 2 || !text.includes(name)) continue

    const expectedAge = normalizeAge(character?.age)
    if (expectedAge != null) {
      const ageMatches = findNearbyPhrases(
        text,
        name,
        '([零〇一二两三四五六七八九十百\\d]{1,5})\\s*岁'
      )
      for (const match of ageMatches) {
        const actualAge = chineseNumberToInt(match.groups[0])
        if (actualAge != null && actualAge !== expectedAge) {
          issues.push(
            issueBase({
              type: 'character_age',
              severity: 'high',
              message: `${name} 的正文年龄与人物档案不一致`,
              evidence: match.text,
              reference: `人物档案：${name}，年龄 ${expectedAge} 岁`,
              expected: expectedAge,
              actual: actualAge,
              suggestion: '按人物档案修正文中年龄，或先更新人物档案。'
            })
          )
        }
      }
    }

    const expectedGender = normalizeGender(character?.gender)
    if (expectedGender) {
      const oppositeTerms = expectedGender === 'female' ? MALE_TERMS : FEMALE_TERMS
      const matches = findNearbyPhrases(
        text,
        name,
        `(${oppositeTerms.map(escapeRegExp).join('|')})`
      )
      for (const match of matches) {
        issues.push(
          issueBase({
            type: 'character_gender',
            severity: 'high',
            message: `${name} 的正文性别表述与人物档案不一致`,
            evidence: match.text,
            reference: `人物档案：${name}，性别 ${character.gender}`,
            expected: character.gender,
            actual: match.groups[0],
            suggestion: '按人物档案修正文中称谓，或先更新人物档案。'
          })
        )
      }
    }

    const expectedHeight = normalizeHeightCm(character?.height)
    if (expectedHeight != null) {
      const heightMatches = findNearbyPhrases(text, name, '(\\d{2,3})\\s*(?:cm|厘米|公分)')
      for (const match of heightMatches) {
        const actualHeight = Number(match.groups[0])
        if (Number.isFinite(actualHeight) && Math.abs(actualHeight - expectedHeight) >= 6) {
          issues.push(
            issueBase({
              type: 'character_height',
              severity: 'medium',
              message: `${name} 的正文身高与人物档案差异较大`,
              evidence: match.text,
              reference: `人物档案：${name}，身高 ${expectedHeight} cm`,
              expected: expectedHeight,
              actual: actualHeight,
              suggestion: '核对身高是否属于有意变化。'
            })
          )
        }
      }
    }
  }
  return issues
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function checkRuleLimitedSetting(text, item) {
  const name = cleanText(item?.name)
  const intro = cleanText(item?.introduction)
  if (name.length < 2 || !intro || !text.includes(name)) return []

  const issues = []
  const introSaysNightOnly =
    hasAny(intro, NIGHT_TERMS) &&
    (hasAny(intro, ONLY_TERMS) || /白[天日].{0,8}(?:无法|不能|不可)/.test(intro))
  if (introSaysNightOnly) {
    const phrasePattern = `(?:${DAY_TERMS.map(escapeRegExp).join('|')})[^。！？\n]{0,24}${escapeRegExp(name)}[^。！？\n]{0,24}(?:${USE_TERMS.map(escapeRegExp).join('|')})|${escapeRegExp(name)}[^。！？\n]{0,24}(?:${DAY_TERMS.map(escapeRegExp).join('|')})[^。！？\n]{0,24}(?:${USE_TERMS.map(escapeRegExp).join('|')})`
    const regex = new RegExp(phrasePattern, 'g')
    let match
    while ((match = regex.exec(text)) && issues.length < 4) {
      issues.push(
        issueBase({
          type: 'setting_condition',
          severity: 'high',
          message: `${name} 的使用条件与设定不一致`,
          evidence: match[0],
          reference: `设定：${name}：${intro}`,
          expected: '夜间或满足设定条件',
          actual: '白天或日光环境使用',
          suggestion: '调整使用时间，或在设定中解释例外原因。'
        })
      )
    }
  }
  return issues
}

function checkSettingFacts(text, facts) {
  const issues = []
  for (const item of [...normalizeList(facts.settings), ...normalizeList(facts.dictionary)]) {
    issues.push(...checkRuleLimitedSetting(text, item))
  }
  return issues
}

function buildFactContext(facts = {}) {
  const sections = []
  const metaLines = []
  if (facts.meta?.name) metaLines.push(`书名：${facts.meta.name}`)
  if (facts.meta?.type) metaLines.push(`类型：${facts.meta.type}`)
  if (facts.meta?.intro) metaLines.push(`简介：${truncate(facts.meta.intro, 600)}`)
  if (metaLines.length) sections.push(`【作品信息】\n${metaLines.join('\n')}`)

  const characterLines = normalizeList(facts.characters)
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => {
      const bits = [`姓名：${cleanText(item?.name)}`]
      if (item?.gender) bits.push(`性别：${item.gender}`)
      if (item?.age) bits.push(`年龄：${item.age}`)
      if (item?.height) bits.push(`身高：${item.height}`)
      if (item?.biography || item?.introduction)
        bits.push(`档案：${truncate(item.biography || item.introduction, 220)}`)
      return bits.filter(Boolean).join('；')
    })
    .filter(Boolean)
  if (characterLines.length) sections.push(`【人物档案】\n${characterLines.join('\n')}`)

  const settingLines = [...normalizeList(facts.settings), ...normalizeList(facts.dictionary)]
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => `「${item.name}」：${truncate(item.introduction, 220)}`)
  if (settingLines.length) sections.push(`【设定与词条】\n${settingLines.join('\n')}`)

  const timelineLines = normalizeList(facts.timelines)
    .slice(0, 12)
    .flatMap((line) => {
      const title = cleanText(line?.title || line?.name || '时间线')
      return normalizeList(line?.nodes)
        .slice(0, 18)
        .map(
          (node) =>
            `${title}｜${cleanText(node?.title)}：${truncate(node?.desc || node?.content, 160)}`
        )
    })
    .filter(Boolean)
  if (timelineLines.length) sections.push(`【时间线】\n${timelineLines.join('\n')}`)

  return sections.join('\n\n')
}

function parseLlmJson(raw) {
  const text = cleanText(raw)
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1] || text
  try {
    return JSON.parse(source)
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function normalizeLlmIssues(parsed) {
  const rows = Array.isArray(parsed?.issues) ? parsed.issues : []
  return rows
    .map((item) => {
      const message = cleanText(item?.message || item?.issue || item?.reason)
      if (!message) return null
      return issueBase({
        source: 'llm',
        type: cleanText(item?.type) || 'semantic_consistency',
        severity: cleanText(item?.severity) || 'medium',
        message,
        evidence: item?.evidence || item?.quote || '',
        reference: item?.reference || item?.fact || '',
        expected: item?.expected,
        actual: item?.actual,
        suggestion: item?.suggestion || item?.fix || ''
      })
    })
    .filter(Boolean)
}

async function runLlmCheck({ text, facts, payload, textProvider }) {
  if (!textProvider?.chat) {
    return { llmChecked: false, llmMessage: '未配置文本 AI 服务，已仅执行规则检查。', issues: [] }
  }
  const context = buildFactContext(facts)
  throwIfAborted(payload.signal)
  const result = await textProvider.chat({
    messages: [
      {
        role: 'system',
        content:
          '你是一名小说连续性检查编辑。你只基于用户给出的作品资料和正文检查矛盾，不编造资料。请只输出 JSON，不要 Markdown。'
      },
      {
        role: 'user',
        content: [
          '请检查正文是否与作品资料冲突。重点看人物年龄、性别、能力限制、地点、时间顺序、前后因果。',
          '返回格式：{"summary":"简短结论","issues":[{"type":"问题类型","severity":"low|medium|high","message":"问题说明","evidence":"正文证据","reference":"资料依据","expected":"应当如何","actual":"正文如何","suggestion":"修改建议"}]}',
          `章节：${payload.volumeName || ''} ${payload.chapterName || payload.chapterTitle || ''}`,
          `作品资料：\n${context || '无可用资料'}`,
          `正文：\n${truncate(text, MAX_LLM_TEXT_CHARS)}`
        ].join('\n\n')
      }
    ],
    model: payload.model || payload.modelName || undefined,
    temperature: 0.1,
    max_tokens: Number(payload.maxTokens || 2200),
    requestId: `consistency_${Date.now()}_${randomUUID()}`,
    signal: payload.signal
  })
  throwIfAborted(payload.signal)
  const parsed = parseLlmJson(result?.content)
  return {
    llmChecked: true,
    llmMessage: parsed?.summary || '',
    issues: normalizeLlmIssues(parsed),
    providerId: result?.providerId || '',
    model: result?.model || '',
    usage: result?.usage || {},
    rawOutput: result?.content || ''
  }
}

function checkStorePath(bookPath) {
  return join(bookPath, CHECK_STORE_FILE)
}

function readCheckStore(bookPath) {
  const data = safeReadJson(checkStorePath(bookPath), { checks: [] })
  if (Array.isArray(data)) return { checks: data }
  if (isPlainObject(data) && Array.isArray(data.checks)) return { checks: data.checks }
  throw new Error('一致性检查记录格式错误，应包含 checks 数组')
}

function writeCheckRecord(bookPath, record) {
  const store = readCheckStore(bookPath)
  const checks = [record, ...store.checks.filter((item) => item?.id !== record.id)].slice(0, 200)
  safeWriteJson(checkStorePath(bookPath), { checks })
}

function resolveChapterText(bookPath, payload = {}) {
  const inlineText = cleanText(payload.text || payload.content || payload.chapterText)
  if (inlineText) return inlineText
  const volumeName = cleanText(payload.volumeName || payload.volume)
  const chapterName = cleanText(payload.chapterName || payload.chapterTitle || payload.chapter)
  if (!volumeName || !chapterName) return ''
  const chapterPath = join(bookPath, '正文', volumeName, `${chapterName}.txt`)
  if (!fs.existsSync(chapterPath)) return ''
  return fs.readFileSync(chapterPath, 'utf-8')
}

function uniqueIssues(issues) {
  const seen = new Set()
  return issues.filter((issue) => {
    const key = [issue.source, issue.type, issue.message, issue.evidence, issue.reference].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function runConsistencyCheck(payload = {}, options = {}) {
  const signal = payload.signal || options.signal
  throwIfAborted(signal)
  const bookPath = cleanText(payload.bookPath || options.bookPath)
  if (!bookPath || !fs.existsSync(bookPath)) throw new Error('作品目录不存在，无法执行一致性检查')
  const text = resolveChapterText(bookPath, payload)
  if (!text) throw new Error('待检查正文为空')

  throwIfAborted(signal)
  const facts = loadBookFacts(bookPath)
  const ruleIssues = [
    ...checkCharacterFacts(text, facts.characters),
    ...checkSettingFacts(text, facts)
  ]

  const wantsLlm = payload.useLlm === true || payload.aiCheck === true || payload.enableLlm === true
  let llmResult = { llmChecked: false, llmMessage: '', issues: [] }
  if (wantsLlm && !payload.skipLlm) {
    llmResult = await runLlmCheck({
      text,
      facts,
      payload: { ...payload, signal },
      textProvider: options.textProvider || payload.textProvider
    })
  }

  throwIfAborted(signal)
  const issues = uniqueIssues([...ruleIssues, ...normalizeList(llmResult.issues)])
  const now = new Date().toISOString()
  const record = {
    id: payload.id || randomUUID(),
    createdAt: now,
    bookName: cleanText(facts.meta?.name || payload.bookName) || basename(bookPath),
    bookPath,
    source: cleanText(payload.source),
    generationId: cleanText(payload.generationId),
    taskType: cleanText(payload.taskType),
    applyAction: cleanText(payload.applyAction),
    volumeName: cleanText(payload.volumeName || payload.volume),
    chapterName: cleanText(payload.chapterName || payload.chapterTitle || payload.chapter),
    chapterId: cleanText(payload.chapterId),
    textLength: text.length,
    ruleChecked: true,
    llmChecked: Boolean(llmResult.llmChecked),
    llmMessage: cleanText(llmResult.llmMessage),
    providerId: llmResult.providerId || '',
    model: llmResult.model || '',
    usage: llmResult.usage || {},
    summary: issues.length ? `发现 ${issues.length} 个可能矛盾` : '未发现明确矛盾',
    issues
  }

  const shouldPersist =
    payload.persist !== false &&
    payload.save !== false &&
    options.persist !== false &&
    options.save !== false
  record.persisted = shouldPersist
  if (shouldPersist) writeCheckRecord(bookPath, record)
  return { success: true, check: record, issues, summary: record.summary }
}

export function listConsistencyChecks(payload = {}) {
  const bookPath = cleanText(payload.bookPath)
  if (!bookPath || !fs.existsSync(bookPath)) throw new Error('作品目录不存在，无法读取检查记录')
  const store = readCheckStore(bookPath)
  return { success: true, checks: store.checks }
}

export default {
  runConsistencyCheck,
  listConsistencyChecks
}

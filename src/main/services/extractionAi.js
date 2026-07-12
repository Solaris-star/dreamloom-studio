import fs from 'fs'
import { join } from 'path'
import vectorService from './vectorService.js'

const EXTRACTION_MODEL_REQUEST_TIMEOUT_MS = 180000
const EXTRACTION_WAIT_PROGRESS_INTERVAL_MS = 15000

export const EXTRACTION_DIMENSIONS = [
  'narrative',
  'plot',
  'character',
  'novelFeatures',
  'emotion',
  'humor',
  'chapterOutline',
  'storyAssets',
  'characterSetting',
  'relationship',
  'worldbuilding',
  'goldenFinger',
  'powerSystem',
  'timeline',
  'locationFaction',
  'foreshadowing'
]

export const EXTRACTION_DIMENSION_LABELS = {
  narrative: '文风叙事',
  plot: '情节设计',
  character: '人物塑造',
  novelFeatures: '小说特点',
  emotion: '读者情绪',
  humor: '热梗搞笑',
  chapterOutline: '章节大纲',
  storyAssets: '作品资料',
  characterSetting: '角色设定',
  relationship: '人物关系',
  worldbuilding: '世界观',
  goldenFinger: '金手指',
  powerSystem: '力量体系',
  timeline: '时间线',
  locationFaction: '地点势力',
  foreshadowing: '伏笔线索'
}

const EXTRACTION_RUN_MODES = ['append', 'replace', 'fillMissing']

const DIMENSION_PROMPTS = {
  narrative: {
    system:
      '你是一名资深中文小说编辑，擅长分析文风与叙事手法。请从给定文本中提取文风叙事维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本的文风与叙事手法，提取创作知识。包括：叙事视角、语言风格特征、修辞手法、节奏控制、场景转换技巧等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  plot: {
    system:
      '你是一名资深中文小说编辑，擅长分析情节设计。请从给定文本中提取情节设计维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本的情节设计，提取创作知识。包括：情节结构、伏笔设置、悬念构建、冲突设计、转折技巧、信息释放节奏等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  character: {
    system:
      '你是一名资深中文小说编辑，擅长分析人物塑造。请从给定文本中提取人物塑造维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本的人物塑造，提取创作知识。包括：人物出场方式、性格刻画手法、对话风格、人物关系构建、成长弧线、配角功能等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  novelFeatures: {
    system:
      '你是一名资深中文小说编辑，擅长分析小说独特特点。请从给定文本中提取小说特点维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本的独特特点，提取创作知识。包括：题材创新点、世界观设定亮点、金手指/系统设计、升级体系、差异化卖点等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  emotion: {
    system:
      '你是一名资深中文小说编辑，擅长分析读者情绪引导。请从给定文本中提取读者情绪维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本对读者情绪的引导手法，提取创作知识。包括：爽点设计、情绪铺垫、期待感营造、共情触发、情绪节奏控制等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  humor: {
    system:
      '你是一名资深中文小说编辑，擅长分析幽默与热梗运用。请从给定文本中提取热梗搞笑维度的创作知识，以JSON格式输出。',
    user: '请分析以下小说文本中的幽默与热梗运用，提取创作知识。包括：搞笑桥段设计、网络热梗融入、吐槽风格、反差萌、玩梗技巧等。以JSON格式输出，格式：{"knowledge": [{"point": "要点", "detail": "详细说明", "example": "原文示例"}]}'
  },
  chapterOutline: {
    system:
      '你是一名资深中文小说编辑，擅长提炼章节大纲。请从给定文本中提炼章节大纲维度的结构化信息，以JSON格式输出。',
    user: '请提炼以下小说文本的章节大纲结构，提取结构化信息。包括：每章核心事件、关键转折、章末钩子、章节功能定位等。以JSON格式输出，格式：{"chapters": [{"title": "章节标题", "events": "核心事件", "turning": "关键转折", "hook": "章末钩子", "function": "章节功能"}]}'
  },
  storyAssets: {
    system:
      '你是一名小说资料整理助手，擅长从正文中提取作者写作可用的作品资料。请只基于给定文本，不要补充原文没有依据的信息。请以JSON格式输出。',
    user: '请从以下小说文本中一次性提取作品资料。必须按字段分类，缺少的类别返回空数组。输出格式：{"characters":[{"name":"角色名","identity":"身份","faction":"阵营","personality":"性格","goal":"目标","abilities":["能力"],"currentStatus":"当前状态","evidence":"原文依据"}],"relationships":[{"source":"角色A","target":"角色B","relation":"关系","attitude":"态度","conflict":"冲突或利益","trend":"变化趋势","evidence":"原文依据"}],"settings":[{"name":"设定名","category":"世界观/规则/术语/限制","rule":"内容","constraint":"限制","evidence":"原文依据"}],"goldenFingers":[{"name":"能力或系统名","trigger":"触发条件","effect":"效果","cost":"代价","limits":"限制","upgrade":"升级方式","usage":"已展示用法","evidence":"原文依据"}],"systems":[{"name":"体系名","levels":["等级或阶段"],"source":"能力来源","progression":"提升方式","limits":"限制","skills":["技能"],"evidence":"原文依据"}],"events":[{"time":"时间点","chapter":"章节或位置","event":"事件","characters":["角色"],"result":"结果","impact":"影响","conflictRisk":"时间矛盾风险"}],"locations":[{"name":"名称","kind":"地点/组织/势力","scope":"范围","members":["成员"],"resources":["资源"],"goal":"目标","relationToProtagonist":"与主角关系","evidence":"原文依据"}],"clues":[{"title":"伏笔标题","setup":"埋设方式","characters":["角色"],"readerKnows":"读者已知","protagonistKnows":"主角已知","payoff":"回收方向","risk":"提前暴露风险","evidence":"原文依据"}]}'
  },
  characterSetting: {
    system:
      '你是一名小说资料整理助手，擅长从正文中提取角色设定。请只基于给定文本，不要补充原文没有依据的信息。请以JSON格式输出。',
    user: '请从以下小说文本中提取角色设定。每个角色尽量包含：姓名、别名、身份、阵营、性格、目标、能力、秘密、弱点、当前状态、首次或最近出现位置、原文依据。以JSON格式输出，格式：{"characters": [{"name": "角色名", "aliases": ["别名"], "identity": "身份", "faction": "阵营", "personality": "性格", "goal": "目标", "abilities": ["能力"], "secret": "秘密", "weakness": "弱点", "currentStatus": "当前状态", "evidence": "原文依据"}]}'
  },
  relationship: {
    system:
      '你是一名小说资料整理助手，擅长从正文中提取人物关系。请只记录文本里能看出的关系，并标明依据。请以JSON格式输出。',
    user: '请从以下小说文本中提取人物关系。每条关系包含：角色A、角色B、关系类型、当前态度、冲突或利益、变化趋势、原文依据。以JSON格式输出，格式：{"relationships": [{"source": "角色A", "target": "角色B", "relation": "关系类型", "attitude": "当前态度", "conflict": "冲突或利益", "trend": "变化趋势", "evidence": "原文依据"}]}'
  },
  worldbuilding: {
    system:
      '你是一名小说资料整理助手，擅长提取世界观与规则。请区分明确设定和推测，不要把推测写成事实。请以JSON格式输出。',
    user: '请从以下小说文本中提取世界观设定。包括：世界结构、时代背景、核心规则、重要术语、限制条件、禁止写错的点、原文依据。以JSON格式输出，格式：{"settings": [{"name": "设定名", "category": "世界结构/规则/术语/限制", "rule": "设定内容", "constraint": "限制或禁忌", "evidence": "原文依据"}]}'
  },
  goldenFinger: {
    system:
      '你是一名小说资料整理助手，擅长提取主角特殊能力、系统、外挂和成长机制。请只基于文本证据。请以JSON格式输出。',
    user: '请从以下小说文本中提取金手指设定。包括：能力名称、触发条件、效果、代价、限制、升级方式、已展示用法、未说明但需要后续确认的问题。以JSON格式输出，格式：{"goldenFingers": [{"name": "能力或系统名", "trigger": "触发条件", "effect": "效果", "cost": "代价", "limits": "限制", "upgrade": "升级方式", "usage": "已展示用法", "openQuestions": ["待确认问题"], "evidence": "原文依据"}]}'
  },
  powerSystem: {
    system:
      '你是一名小说资料整理助手，擅长提取力量体系、等级体系和能力规则。请把规则、等级和限制分清楚。请以JSON格式输出。',
    user: '请从以下小说文本中提取力量体系。包括：体系名称、等级/阶段、能力来源、修炼或提升方式、战力限制、已出现技能、风险和原文依据。以JSON格式输出，格式：{"systems": [{"name": "体系名", "levels": ["等级或阶段"], "source": "能力来源", "progression": "提升方式", "limits": "限制", "skills": ["技能"], "risk": "风险", "evidence": "原文依据"}]}'
  },
  timeline: {
    system:
      '你是一名小说资料整理助手，擅长从正文中提取事件时间线。请按事件顺序输出，无法确定时间点时写“未明”。请以JSON格式输出。',
    user: '请从以下小说文本中提取时间线。每个事件包含：时间点、章节或位置、事件、参与角色、事件结果、后续影响、是否存在时间矛盾。以JSON格式输出，格式：{"events": [{"time": "时间点", "chapter": "章节或位置", "event": "事件", "characters": ["角色"], "result": "结果", "impact": "后续影响", "conflictRisk": "时间矛盾风险"}]}'
  },
  locationFaction: {
    system:
      '你是一名小说资料整理助手，擅长提取地点、组织和势力资料。请把地点和势力分开记录。请以JSON格式输出。',
    user: '请从以下小说文本中提取地点、组织和势力。包括：名称、类型、位置或活动范围、成员、资源、目标、与主角关系、原文依据。以JSON格式输出，格式：{"items": [{"name": "名称", "kind": "地点/组织/势力", "scope": "范围", "members": ["成员"], "resources": ["资源"], "goal": "目标", "relationToProtagonist": "与主角关系", "evidence": "原文依据"}]}'
  },
  foreshadowing: {
    system:
      '你是一名小说资料整理助手，擅长提取伏笔、线索和信息差。请标明读者、主角、相关角色分别知道什么。请以JSON格式输出。',
    user: '请从以下小说文本中提取伏笔线索。包括：伏笔标题、埋设方式、相关角色、读者已知、主角已知、角色已知、预计回收方向、提前暴露风险、原文依据。以JSON格式输出，格式：{"clues": [{"title": "伏笔标题", "setup": "埋设方式", "characters": ["角色"], "readerKnows": "读者已知", "protagonistKnows": "主角已知", "characterKnows": "角色已知", "payoff": "预计回收方向", "risk": "提前暴露风险", "evidence": "原文依据"}]}'
  }
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw || 'null')
    return parsed == null ? fallback : parsed
  } catch (error) {
    throw new Error(`拆书任务记录读取失败：${error.message}`)
  }
}

function safeWriteJson(filePath, data) {
  const dir = join(filePath, '..')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function readExtractionRecords(filePath) {
  const data = safeReadJson(filePath, { extractions: [] })
  if (Array.isArray(data)) return data.filter((record) => record != null)
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.extractions)) {
    return data.extractions.filter((record) => record != null)
  }
  throw new Error('拆书任务记录格式异常，已停止读取拆书任务')
}

function writeExtractionRecords(filePath, records) {
  if (!Array.isArray(records)) {
    throw new Error('拆书任务记录格式异常，已停止写入以免覆盖原始记录')
  }
  safeWriteJson(filePath, { extractions: records })
}

function updateExtractionRecord(filePath, record) {
  if (!record?.id) return
  const records = readExtractionRecords(filePath)
  const index = records.findIndex((item) => item?.id === record.id)
  if (index === -1) {
    writeExtractionRecords(filePath, [...records, record])
    return
  }
  records[index] = record
  writeExtractionRecords(filePath, records)
}

const CHINESE_NUMBER_VALUES = {
  零: 0,
  〇: 0,
  '○': 0,
  一: 1,
  二: 2,
  两: 2,
  俩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

const CHINESE_SPECIAL_NUMBERS = {
  廿: 20,
  卅: 30,
  卌: 40,
  皕: 200
}

const CHINESE_SMALL_UNITS = {
  十: 10,
  百: 100,
  千: 1000
}

const CHINESE_LARGE_UNITS = {
  万: 10000,
  亿: 100000000
}

function parseChineseNumber(raw) {
  const text = String(raw || '').replace(/\s+/g, '')
  if (!text) return NaN
  if (/^\d+$/.test(text)) return parseInt(text, 10)

  let result = 0
  let section = 0
  let number = 0
  let matched = false

  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(CHINESE_NUMBER_VALUES, char)) {
      number = number * 10 + CHINESE_NUMBER_VALUES[char]
      matched = true
      continue
    }

    const special = CHINESE_SPECIAL_NUMBERS[char]
    if (special) {
      section += special
      number = 0
      matched = true
      continue
    }

    const smallUnit = CHINESE_SMALL_UNITS[char]
    if (smallUnit) {
      section += (number || 1) * smallUnit
      number = 0
      matched = true
      continue
    }

    const largeUnit = CHINESE_LARGE_UNITS[char]
    if (largeUnit) {
      section += number
      result += (section || 1) * largeUnit
      section = 0
      number = 0
      matched = true
      continue
    }

    return NaN
  }

  return matched ? result + section + number : NaN
}

function parseChapterName(name) {
  const cleanedName = String(name || '')
    .replace(/\.(txt|json)$/i, '')
    .trim()
  const match = cleanedName.match(
    /^第\s*([零〇○一二两俩三四五六七八九十百千万亿廿卅卌皕\d]+)\s*([章回集节部卷])\s*(.*)$/
  )
  if (!match) return null

  const [, rawNumber, suffix, description] = match
  const number = parseChineseNumber(rawNumber)
  if (!Number.isFinite(number) || number <= 0) return null

  return {
    number,
    suffix,
    description: description || ''
  }
}

function compareChapterLikeNames(a, b) {
  const left = parseChapterName(a)
  const right = parseChapterName(b)

  if (left && right && left.number !== right.number) {
    return left.number - right.number
  }
  if (left && !right) return -1
  if (!left && right) return 1

  return String(a || '').localeCompare(String(b || ''), 'zh-CN', { numeric: true })
}

function splitChapters(text) {
  const parts = text.split(/^第[一二三四五六七八九十百千万零\d]+章/m)
  const matches = text.match(/^第[一二三四五六七八九十百千万零\d]+章/gm) || []
  const chapters = []
  for (let i = 0; i < matches.length; i++) {
    const content = (parts[i + 1] || '').trim()
    if (content) {
      chapters.push({
        index: i + 1,
        title: matches[i].trim(),
        content
      })
    }
  }
  if (!chapters.length && text.trim()) {
    chapters.push({ index: 1, title: '全文', content: text.trim() })
  }
  return chapters
}

function normalizePositiveInteger(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.floor(number))
}

function normalizeChapterScope(options = {}, totalChapterCount = 0) {
  const total = normalizePositiveInteger(totalChapterCount)
  if (!total) {
    return {
      start: 0,
      end: 0,
      totalChapterCount: 0,
      selectedChapterCount: 0,
      limited: false,
      label: '未读取到章节'
    }
  }

  const scope =
    options.chapterScope && typeof options.chapterScope === 'object' ? options.chapterScope : {}
  const rawStart = options.chapterStart ?? options.startChapter ?? scope.start ?? scope.from
  const rawEnd = options.chapterEnd ?? options.endChapter ?? scope.end ?? scope.to
  const rawLimit = options.chapterLimit ?? scope.limit
  const start = Math.min(Math.max(1, normalizePositiveInteger(rawStart, 1) || 1), total)
  const limit = normalizePositiveInteger(rawLimit)
  let end =
    rawEnd == null || rawEnd === ''
      ? limit
        ? start + limit - 1
        : total
      : normalizePositiveInteger(rawEnd, total)
  end = Math.min(Math.max(1, end || total), total)
  if (end < start) end = start

  const selectedChapterCount = end - start + 1
  const limited = start > 1 || end < total
  return {
    start,
    end,
    totalChapterCount: total,
    selectedChapterCount,
    limited,
    label: limited ? `第 ${start}-${end} 章，共 ${selectedChapterCount} 章` : `整本 ${total} 章`
  }
}

function selectChaptersForExtraction(chapters = [], options = {}) {
  const scope = normalizeChapterScope(options, chapters.length)
  if (!chapters.length) return { chapters: [], scope }
  const selected = chapters.slice(Math.max(0, scope.start - 1), scope.end)
  return { chapters: selected, scope }
}

function groupChaptersForExtraction(chapters) {
  const groups = []
  const size = 4
  for (let i = 0; i < chapters.length; i += size) {
    const slice = chapters.slice(i, i + size)
    const title = slice.map((c) => c.title).join(' / ')
    const content = slice.map((c) => `${c.title}\n${c.content}`).join('\n\n')
    const startIndex = slice[0]?.index || i + 1
    const endIndex = slice[slice.length - 1]?.index || Math.min(i + size, chapters.length)
    groups.push({
      title,
      content,
      chapterRange: startIndex === endIndex ? String(startIndex) : `${startIndex}-${endIndex}`,
      chapterTitles: slice.map((c) => c.title)
    })
  }
  return groups
}

function nowIso() {
  return new Date().toISOString()
}

function clampPercent(value) {
  const number = Math.round(Number(value) || 0)
  return Math.max(0, Math.min(100, number))
}

function toPlainText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join('；')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !String(key).startsWith('_'))
      .map(([key, val]) => `${key}：${toPlainText(val)}`)
      .filter((line) => line.trim())
      .join('；')
  }
  return ''
}

function normalizeExtractionItems(parsed, fallbackText, meta) {
  const categoryKeys = [
    ['characters', 'characterSetting', '角色设定'],
    ['relationships', 'relationship', '人物关系'],
    ['settings', 'worldbuilding', '世界观'],
    ['goldenFingers', 'goldenFinger', '金手指'],
    ['systems', 'powerSystem', '力量体系'],
    ['events', 'timeline', '时间线'],
    ['locations', 'locationFaction', '地点势力'],
    ['clues', 'foreshadowing', '伏笔线索']
  ]
  if (
    meta.dimension === 'storyAssets' &&
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed)
  ) {
    const rows = []
    for (const [key, subDimension, subLabel] of categoryKeys) {
      const list = Array.isArray(parsed?.[key]) ? parsed[key] : []
      list.forEach((item, index) => {
        const raw = item && typeof item === 'object' ? item : { value: item }
        const text = toPlainText(raw)
        if (!text) return
        rows.push({
          ...raw,
          _id: `${meta.extractionId}_${subDimension}_${meta.groupIndex}_${index}`,
          _dimension: subDimension,
          _dimensionLabel: subLabel,
          _group: meta.groupTitle,
          _groupIndex: meta.groupIndex,
          _chapterRange: meta.chapterRange,
          _sourceBookName: meta.sourceBookName,
          _assetCategory: key,
          _text: text
        })
      })
    }
    if (rows.length) return rows
  }

  const rawItems =
    parsed?.knowledge ||
    parsed?.chapters ||
    parsed?.items ||
    parsed?.characters ||
    parsed?.relationships ||
    parsed?.settings ||
    parsed?.goldenFingers ||
    parsed?.systems ||
    parsed?.events ||
    parsed?.clues ||
    (Array.isArray(parsed) ? parsed : null)
  const list = Array.isArray(rawItems) ? rawItems : parsed ? [parsed] : []
  const items = list
    .map((item, index) => {
      const raw = item && typeof item === 'object' ? item : { value: item }
      const text = toPlainText(raw)
      return {
        ...raw,
        _id: `${meta.extractionId}_${meta.dimension}_${meta.groupIndex}_${index}`,
        _dimension: meta.dimension,
        _dimensionLabel: EXTRACTION_DIMENSION_LABELS[meta.dimension] || meta.dimension,
        _group: meta.groupTitle,
        _groupIndex: meta.groupIndex,
        _chapterRange: meta.chapterRange,
        _sourceBookName: meta.sourceBookName,
        _text: text
      }
    })
    .filter((item) => item._text)

  if (items.length) return items
  const text = String(fallbackText || '').trim()
  if (!text) return []
  return [
    {
      _id: `${meta.extractionId}_${meta.dimension}_${meta.groupIndex}_raw`,
      _dimension: meta.dimension,
      _dimensionLabel: EXTRACTION_DIMENSION_LABELS[meta.dimension] || meta.dimension,
      _group: meta.groupTitle,
      _groupIndex: meta.groupIndex,
      _chapterRange: meta.chapterRange,
      _sourceBookName: meta.sourceBookName,
      _text: text
    }
  ]
}

function flattenResultItems(results = {}) {
  const rows = []
  for (const [dimension, payload] of Object.entries(results || {})) {
    const groups = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.groups)
        ? payload.groups
        : []
    const directItems = Array.isArray(payload?.items) ? payload.items : []
    for (const item of directItems) {
      const text = item?._text || toPlainText(item)
      if (!text) continue
      rows.push({
        dimension: item?._dimension || dimension,
        sourceDimension: dimension,
        item,
        text,
        group: item?._group || '',
        chapterRange: item?._chapterRange || ''
      })
    }
    if (!directItems.length) {
      for (const group of groups) {
        const items = Array.isArray(group?.items) ? group.items : []
        for (const item of items) {
          const text = item?._text || toPlainText(item)
          if (!text) continue
          rows.push({
            dimension: item?._dimension || dimension,
            sourceDimension: dimension,
            item,
            text,
            group: item?._group || group.groupTitle || '',
            chapterRange: item?._chapterRange || group.chapterRange || ''
          })
        }
      }
    }
  }
  return rows
}

function normalizeRunMode(mode) {
  return EXTRACTION_RUN_MODES.includes(mode) ? mode : 'append'
}

function isSupersededExtraction(record = {}) {
  return record.lifecycleStatus === 'superseded' || record.superseded === true
}

function activeExtractionRecords(records = []) {
  return records.filter((record) => record?.id && !isSupersededExtraction(record))
}

function hasUsableDimensionResult(records = [], dimension) {
  return activeExtractionRecords(records).some((record) => {
    const payload = record?.results?.[dimension]
    if (!payload) return false
    return flattenResultItems({ [dimension]: payload }).length > 0
  })
}

async function deleteVectorsForRecords(bookPath, records = []) {
  if (!vectorService?.deleteBySource) return []
  const deleted = []
  for (const record of records) {
    if (!record?.id) continue
    try {
      await vectorService.deleteBySource(bookPath, record.id)
      deleted.push(record.id)
    } catch {
      // 向量索引清理失败不影响拆书结果切换。
    }
  }
  return deleted
}

function summarizeExtractionRecord(record = {}) {
  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
    : Object.keys(record.dimensions || {})
  const dimensionSummaries = Object.fromEntries(
    dimensions.map((dimension) => {
      const meta = Array.isArray(record.dimensions) ? {} : record.dimensions?.[dimension] || {}
      const result = record.results?.[dimension]
      const itemCount = result ? flattenResultItems({ [dimension]: result }).length : 0
      return [
        dimension,
        {
          key: dimension,
          label: result?.label || meta.label || EXTRACTION_DIMENSION_LABELS[dimension] || dimension,
          status: meta.status || (result?.completed ? 'completed' : 'recorded'),
          itemCount: itemCount || Number(result?.count ?? meta.itemCount ?? 0),
          failedGroups: Number(result?.failedGroups ?? meta.failedGroups ?? 0),
          chunkCount: Number(meta.chunkCount ?? result?.groups?.length ?? 0),
          progress: meta.progress || null
        }
      ]
    })
  )
  return {
    id: record.id,
    bookPath: record.bookPath,
    sourceBookName: record.sourceBookName,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    runMode: record.runMode || 'append',
    chapterScope: record.chapterScope || record.stats?.chapterScope || null,
    lifecycleStatus: record.lifecycleStatus || 'active',
    superseded: Boolean(record.superseded),
    supersededAt: record.supersededAt || '',
    supersededBy: record.supersededBy || '',
    replacedExtractionIds: Array.isArray(record.replacedExtractionIds)
      ? record.replacedExtractionIds
      : [],
    skippedDimensions: Array.isArray(record.skippedDimensions) ? record.skippedDimensions : [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    currentStep: record.currentStep || '',
    error: record.error || '',
    dimensions: dimensionSummaries,
    totalGroups: Number(record.totalGroups || 0),
    totalChunks: Number(record.totalChunks || 0),
    progress: record.progress || {},
    stats: record.stats || {},
    subTasks: Object.values(record.subTasks || {}).map((task) => ({
      id: task.id,
      dimension: task.dimension,
      label: task.label,
      status: task.status,
      currentGroup: task.currentGroup || '',
      extractedCount: Number(task.extractedCount || 0),
      failedGroups: Number(task.failedGroups || 0),
      progress: task.progress || null
    })),
    logs: Array.isArray(record.logs) ? record.logs.slice(-12) : [],
    hasDetail: Boolean(record.results && Object.keys(record.results).length)
  }
}

function extractionDetailPreview(record = {}, options = {}) {
  const previewLimit = Math.max(1, Math.min(20, Number(options.previewLimit) || 5))
  const summary = summarizeExtractionRecord(record)
  const results = {}
  for (const [dimension, value] of Object.entries(record.results || {})) {
    const groups = Array.isArray(value) ? value : Array.isArray(value?.groups) ? value.groups : []
    const items = flattenResultItems({ [dimension]: value })
      .slice(0, previewLimit)
      .map((row) => row.item)
    results[dimension] = {
      label:
        value?.label ||
        summary.dimensions?.[dimension]?.label ||
        EXTRACTION_DIMENSION_LABELS[dimension] ||
        dimension,
      count: Number(value?.count ?? summary.dimensions?.[dimension]?.itemCount ?? items.length),
      completed: Boolean(value?.completed),
      failedGroups: Number(value?.failedGroups ?? 0),
      groupCount: groups.length,
      groups: groups.slice(0, previewLimit).map((group) => ({
        groupTitle: group.groupTitle || '',
        groupIndex: group.groupIndex,
        chapterRange: group.chapterRange || '',
        status: group.status || '',
        count: Number(group.count || (Array.isArray(group.items) ? group.items.length : 0))
      })),
      items
    }
  }
  return { ...summary, results }
}

function extractionResultPage(record = {}, options = {}) {
  const page = Math.max(1, Number(options.page) || 1)
  const pageSize = Math.max(1, Math.min(50, Number(options.pageSize) || 10))
  const keyword = String(options.keyword || '')
    .trim()
    .toLowerCase()
  const summary = summarizeExtractionRecord(record)
  const resultKeys = Object.keys(record.results || {})
  const requestedDimension = String(options.dimension || '')
  const fallbackDimension =
    resultKeys.find((key) => Number(summary.dimensions?.[key]?.itemCount || 0) > 0) ||
    resultKeys[0] ||
    ''
  const dimension =
    requestedDimension && record.results?.[requestedDimension]
      ? requestedDimension
      : fallbackDimension
  const payload = dimension ? { [dimension]: record.results?.[dimension] } : record.results
  let rows = flattenResultItems(payload)

  if (keyword) {
    rows = rows.filter((row) => {
      const haystack = [
        row.dimension,
        row.group,
        row.chapterRange,
        row.text,
        row.item?.title,
        row.item?.name,
        row.item?.point,
        row.item?.character,
        row.item?.events
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }

  const total = rows.length
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize).map((row, index) => ({
    id: row.item?._id || `${record.id || 'extraction'}_${dimension || 'all'}_${start + index}`,
    dimension: row.dimension,
    dimensionLabel: EXTRACTION_DIMENSION_LABELS[row.dimension] || row.dimension,
    group: row.group || '',
    chapterRange: row.chapterRange || '',
    text: row.text || '',
    item: row.item || {}
  }))

  return {
    success: true,
    extraction: summary,
    dimension,
    dimensions: summary.dimensions,
    items,
    total,
    page,
    pageSize,
    keyword: options.keyword || ''
  }
}

function parseJsonFromAiResponse(text) {
  if (!text || typeof text !== 'string') return null
  let cleaned = text.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    cleaned = fenced[1].trim()
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    const objStart = cleaned.indexOf('{')
    const objEnd = cleaned.lastIndexOf('}')
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.slice(objStart, objEnd + 1))
      } catch {
        return null
      }
    }
    const arrStart = cleaned.indexOf('[')
    const arrEnd = cleaned.lastIndexOf(']')
    if (arrStart !== -1 && arrEnd > arrStart) {
      try {
        return JSON.parse(cleaned.slice(arrStart, arrEnd + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function getKnowledgeDir(bookPath) {
  return join(bookPath, 'knowledge')
}

function getExtractionsPath(bookPath) {
  return join(getKnowledgeDir(bookPath), 'extractions.json')
}

function emitProgress(onProgress, record, patch = {}) {
  if (!onProgress) return
  const subTasks = Object.values(record.subTasks || {})
  const totalSubTasks = record.progress?.totalSubTasks || subTasks.length || 1
  const completedSubTasks = subTasks.filter((task) => task.status === 'completed').length
  const failedSubTasks = subTasks.filter((task) => task.status === 'failed').length
  const groupTotal = record.stats?.totalGroups || record.totalGroups || 1
  const groupDone = subTasks.reduce((sum, task) => sum + Number(task.progress?.current || 0), 0)
  const basePercent = totalSubTasks
    ? (groupDone / Math.max(1, totalSubTasks * groupTotal)) * 100
    : 0
  const overallPercent = patch.overallPercent != null ? patch.overallPercent : basePercent
  const payload = {
    extractionId: record.id,
    bookPath: record.bookPath,
    status: record.status,
    currentStep: record.currentStep || '',
    overallPercent: clampPercent(overallPercent),
    progress: {
      ...(record.progress || {}),
      totalSubTasks,
      completedSubTasks,
      failedSubTasks,
      percent: clampPercent(overallPercent)
    },
    stats: record.stats || {},
    subTasks,
    logs: (record.logs || []).slice(-30),
    ...patch
  }
  onProgress(payload)
}

function addExtractionLog(record, level, message, extra = {}) {
  const log = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: nowIso(),
    level,
    message,
    ...extra
  }
  record.logs = [...(record.logs || []), log].slice(-120)
  return log
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
}

function createExtractionAbortError(message, cancelled = false) {
  const error = new Error(message)
  error.name = 'AbortError'
  if (cancelled) error.cancelled = true
  return error
}

function runModelRequest(requestFactory, timeoutMs, externalSignal) {
  if (externalSignal?.aborted) {
    return Promise.reject(createExtractionAbortError('拆书任务已取消', true))
  }
  const controller = new AbortController()
  const effectiveTimeout =
    Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : EXTRACTION_MODEL_REQUEST_TIMEOUT_MS
  let timer = null
  let rejectGuard = null
  let timedOut = false
  let externallyAborted = false

  const abortFromExternal = () => {
    externallyAborted = true
    controller.abort(externalSignal?.reason)
    rejectGuard?.(createExtractionAbortError('拆书任务已取消', true))
  }

  externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true })

  const guard = new Promise((_, reject) => {
    rejectGuard = reject
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(
        new Error(`模型请求超时（${formatDuration(effectiveTimeout)}），已跳过当前章节组。`)
      )
    }, effectiveTimeout + 5000)
  })

  return Promise.race([Promise.resolve().then(() => requestFactory(controller.signal)), guard])
    .catch((error) => {
      if (externallyAborted) {
        throw createExtractionAbortError('拆书任务已取消', true)
      }
      if (timedOut) {
        throw new Error(
          `模型请求超时（${formatDuration(effectiveTimeout)}），已跳过当前章节组。`
        )
      }
      throw error
    })
    .finally(() => {
      if (timer) clearTimeout(timer)
      externalSignal?.removeEventListener?.('abort', abortFromExternal)
    })
}

async function readSourceText(bookPath, onlineText) {
  if (onlineText && typeof onlineText === 'string' && onlineText.trim()) {
    return onlineText.trim()
  }
  const volumesDir = join(bookPath, '正文')
  if (!fs.existsSync(volumesDir)) {
    throw new Error('书籍正文目录不存在')
  }
  const volumeDirs = fs
    .readdirSync(volumesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(compareChapterLikeNames)
  const allText = []
  for (const vol of volumeDirs) {
    const volPath = join(volumesDir, vol)
    const files = fs
      .readdirSync(volPath, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith('.txt'))
      .map((f) => f.name)
      .sort(compareChapterLikeNames)
    for (const file of files) {
      try {
        const content = fs.readFileSync(join(volPath, file), 'utf-8')
        if (content.trim()) {
          allText.push(content.trim())
        }
      } catch {
        continue
      }
    }
  }
  if (!allText.length) {
    for (const vol of volumeDirs) {
      const volPath = join(volumesDir, vol)
      const files = fs
        .readdirSync(volPath, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.json'))
        .map((f) => f.name)
        .sort(compareChapterLikeNames)
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(join(volPath, file), 'utf-8'))
          const content = String(data?.content || data?.text || data?.plainText || '').trim()
          if (content) {
            allText.push(`${data?.title || file.replace(/\.json$/i, '')}\n${content}`)
          }
        } catch {
          continue
        }
      }
    }
  }
  if (!allText.length) {
    throw new Error('未找到任何章节内容')
  }
  return allText.join('\n\n')
}

export class ExtractionAiService {
  async createExtraction(options = {}, fallbackTextProvider) {
    const {
      bookPath,
      onlineText,
      sourceText,
      sourceBookName,
      sourceType,
      sourceUrl,
      dimensions,
      runMode,
      chapterStart,
      chapterEnd,
      chapterLimit,
      chapterScope,
      onProgress,
      textProvider
    } = options
    const signal = options.signal
    const activeTextProvider = textProvider || fallbackTextProvider
    if (!activeTextProvider?.chat) {
      throw new Error('文本 AI 服务不可用')
    }
    if (!bookPath) {
      throw new Error('书籍路径不能为空')
    }

    const requestedDimensions =
      Array.isArray(dimensions) && dimensions.length
        ? dimensions.filter((d) => EXTRACTION_DIMENSIONS.includes(d))
        : [...EXTRACTION_DIMENSIONS]
    const normalizedRunMode = normalizeRunMode(runMode)
    const extractionsPath = getExtractionsPath(bookPath)
    const existingRecords = readExtractionRecords(extractionsPath)
    const targetDimensions =
      normalizedRunMode === 'fillMissing'
        ? requestedDimensions.filter(
            (dimension) => !hasUsableDimensionResult(existingRecords, dimension)
          )
        : requestedDimensions

    if (!targetDimensions.length) {
      const message =
        normalizedRunMode === 'fillMissing'
          ? '所选内容已有可用拆书结果，无需补拆。'
          : '未指定有效的提取维度'
      throw new Error(message)
    }

    const replacedRecords =
      normalizedRunMode === 'replace' ? activeExtractionRecords(existingRecords) : []
    const skippedDimensions =
      normalizedRunMode === 'fillMissing'
        ? requestedDimensions.filter((dimension) => !targetDimensions.includes(dimension))
        : []

    const extractionId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const knowledgeDir = getKnowledgeDir(bookPath)

    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true })
    }

    const text = await readSourceText(bookPath, sourceText || onlineText)
    const allChapters = splitChapters(text)
    const { chapters, scope: effectiveChapterScope } = selectChaptersForExtraction(allChapters, {
      chapterStart,
      chapterEnd,
      chapterLimit,
      chapterScope
    })
    const groups = groupChaptersForExtraction(chapters)

    if (!groups.length) {
      throw new Error('未能从所选范围中分割出章节')
    }
    const effectiveSourceBookName = sourceBookName || '未知书籍'

    const dimensionMap = Object.fromEntries(
      targetDimensions.map((dimension) => [
        dimension,
        {
          key: dimension,
          label: EXTRACTION_DIMENSION_LABELS[dimension] || dimension,
          status: 'pending',
          chunkCount: 0,
          itemCount: 0,
          failedGroups: 0,
          progress: { current: 0, total: groups.length, percent: 0 }
        }
      ])
    )
    const subTasks = Object.fromEntries(
      targetDimensions.map((dimension) => [
        dimension,
        {
          id: `${extractionId}_${dimension}`,
          dimension,
          label: EXTRACTION_DIMENSION_LABELS[dimension] || dimension,
          status: 'pending',
          currentGroup: '',
          extractedCount: 0,
          failedGroups: 0,
          errors: [],
          progress: { current: 0, total: groups.length, percent: 0 }
        }
      ])
    )

    const extractionRecord = {
      id: extractionId,
      bookPath,
      sourceBookName: effectiveSourceBookName,
      sourceType,
      sourceUrl,
      runMode: normalizedRunMode,
      chapterScope: effectiveChapterScope,
      replacedExtractionIds: replacedRecords.map((record) => record.id),
      skippedDimensions,
      lifecycleStatus: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      dimensions: dimensionMap,
      totalGroups: groups.length,
      totalChunks: groups.length * targetDimensions.length,
      currentStep: '准备拆书任务',
      status: 'running',
      progress: {
        totalSubTasks: targetDimensions.length,
        completedSubTasks: 0,
        failedSubTasks: 0,
        percent: 0
      },
      stats: {
        chapterCount: chapters.length,
        sourceChapterCount: allChapters.length,
        chapterScope: effectiveChapterScope,
        totalGroups: groups.length,
        totalChunks: groups.length * targetDimensions.length,
        completedGroups: 0,
        failedGroups: 0,
        totalExtractedCount: 0,
        vectorizedCount: 0,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      },
      subTasks,
      logs: [],
      results: {}
    }

    addExtractionLog(
      extractionRecord,
      'info',
      `已读取 ${allChapters.length} 章，本次处理 ${effectiveChapterScope.label}，按 ${groups.length} 组文本开始提取。`
    )

    writeExtractionRecords(extractionsPath, [...existingRecords, extractionRecord])
    if (skippedDimensions.length) {
      addExtractionLog(
        extractionRecord,
        'info',
        `已跳过已有结果：${skippedDimensions.map((dimension) => EXTRACTION_DIMENSION_LABELS[dimension] || dimension).join('、')}。`
      )
    }

    emitProgress(onProgress, extractionRecord, {
      status: 'running',
      currentStep: '已创建任务，准备调用模型',
      overallPercent: 1
    })

    try {
      for (const dimension of targetDimensions) {
        const promptConfig = DIMENSION_PROMPTS[dimension]
        if (!promptConfig) continue

        const dimensionLabel = EXTRACTION_DIMENSION_LABELS[dimension] || dimension
        const dimensionGroups = []
        const dimensionItems = []
        const dimensionErrors = []
        const task = extractionRecord.subTasks[dimension]
        extractionRecord.currentStep = `正在提取：${dimensionLabel}`
        extractionRecord.updatedAt = nowIso()
        extractionRecord.dimensions[dimension].status = 'processing'
        task.status = 'processing'
        addExtractionLog(extractionRecord, 'info', `开始处理「${dimensionLabel}」。`, { dimension })
        updateExtractionRecord(extractionsPath, extractionRecord)
        emitProgress(onProgress, extractionRecord, {
          status: 'extracting',
          dimension,
          dimensionLabel,
          currentStep: extractionRecord.currentStep
        })

        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi]
          task.currentGroup = group.title
          task.progress = {
            current: gi,
            total: groups.length,
            percent: clampPercent((gi / groups.length) * 100)
          }
          extractionRecord.dimensions[dimension].progress = task.progress
          extractionRecord.updatedAt = nowIso()
          addExtractionLog(extractionRecord, 'info', `正在分析「${group.title}」。`, {
            dimension,
            groupIndex: gi,
            groupTitle: group.title
          })
          updateExtractionRecord(extractionsPath, extractionRecord)
          emitProgress(onProgress, extractionRecord, {
            status: 'extracting',
            dimension,
            dimensionLabel,
            groupTitle: group.title,
            groupIndex: gi + 1,
            groupTotal: groups.length,
            currentStep: `正在分析：${dimensionLabel} · ${group.title}`
          })

          const messages = [
            { role: 'system', content: promptConfig.system },
            {
              role: 'user',
              content: `${promptConfig.user}\n\n---\n\n${group.content}`
            }
          ]

          let waitTimer = null
          const waitStartedAt = Date.now()
          const requestTimeoutMs = Number(
            options.requestTimeoutMs || EXTRACTION_MODEL_REQUEST_TIMEOUT_MS
          )
          try {
            task.waitingSince = nowIso()
            task.waitingSeconds = 0
            waitTimer = setInterval(() => {
              const waitingText = formatDuration(Date.now() - waitStartedAt)
              task.waitingSeconds = Math.round((Date.now() - waitStartedAt) / 1000)
              extractionRecord.currentStep = `等待模型返回：${dimensionLabel} · ${group.title}（${waitingText}）`
              extractionRecord.updatedAt = nowIso()
              updateExtractionRecord(extractionsPath, extractionRecord)
              emitProgress(onProgress, extractionRecord, {
                status: 'extracting',
                dimension,
                dimensionLabel,
                groupTitle: group.title,
                groupIndex: gi + 1,
                groupTotal: groups.length,
                currentStep: extractionRecord.currentStep,
                waitingSeconds: task.waitingSeconds
              })
            }, EXTRACTION_WAIT_PROGRESS_INTERVAL_MS)

            const result = await runModelRequest(
              (requestSignal) => activeTextProvider.chat({
                messages,
                temperature: 0.3,
                max_tokens: 4000,
                timeoutMs: requestTimeoutMs,
                signal: requestSignal,
                requestId: `extraction_${extractionId}_${dimension}_${gi}`
              }),
              requestTimeoutMs,
              signal
            )

            const parsed = parseJsonFromAiResponse(result.content)
            const normalizedItems = normalizeExtractionItems(parsed, result.content, {
              extractionId,
              dimension,
              groupTitle: group.title,
              groupIndex: gi,
              chapterRange: group.chapterRange,
              sourceBookName: effectiveSourceBookName
            })
            const groupResult = {
              groupTitle: group.title,
              groupIndex: gi,
              chapterRange: group.chapterRange,
              chapterTitles: group.chapterTitles,
              status: normalizedItems.length ? 'completed' : 'empty',
              count: normalizedItems.length,
              items: normalizedItems,
              raw: parsed || result.content
            }
            dimensionGroups.push(groupResult)
            dimensionItems.push(...normalizedItems)
            task.extractedCount = dimensionItems.length
            extractionRecord.stats.totalExtractedCount += normalizedItems.length
            if (result.usage) {
              const usage = extractionRecord.stats.tokenUsage
              usage.prompt_tokens += Number(
                result.usage.prompt_tokens || result.usage.input_tokens || 0
              )
              usage.completion_tokens += Number(
                result.usage.completion_tokens || result.usage.output_tokens || 0
              )
              usage.total_tokens += Number(result.usage.total_tokens || 0)
            }
            addExtractionLog(
              extractionRecord,
              normalizedItems.length ? 'success' : 'warning',
              normalizedItems.length
                ? `「${group.title}」提取到 ${normalizedItems.length} 条内容。`
                : `「${group.title}」没有提取到可用内容。`,
              { dimension, groupIndex: gi, count: normalizedItems.length }
            )
          } catch (err) {
            if (err?.cancelled || signal?.aborted) {
              throw createExtractionAbortError('拆书任务已取消', true)
            }
            const errorMessage = err?.message || '模型请求失败'
            const error = {
              groupTitle: group.title,
              groupIndex: gi,
              chapterRange: group.chapterRange,
              message: errorMessage,
              time: nowIso()
            }
            dimensionErrors.push(error)
            task.errors.push(error)
            task.failedGroups += 1
            extractionRecord.stats.failedGroups += 1
            addExtractionLog(
              extractionRecord,
              'error',
              `「${group.title}」处理失败：${errorMessage}`,
              { dimension, groupIndex: gi }
            )
            console.error(`提取维度 ${dimension} 第 ${gi + 1} 组失败:`, errorMessage)
          } finally {
            if (waitTimer) clearInterval(waitTimer)
            task.waitingSince = ''
            task.waitingSeconds = 0
            extractionRecord.stats.completedGroups += 1
            task.progress = {
              current: gi + 1,
              total: groups.length,
              percent: clampPercent(((gi + 1) / groups.length) * 100)
            }
            extractionRecord.dimensions[dimension].progress = task.progress
            extractionRecord.dimensions[dimension].chunkCount = dimensionGroups.length
            extractionRecord.dimensions[dimension].itemCount = dimensionItems.length
            extractionRecord.dimensions[dimension].failedGroups = dimensionErrors.length
            extractionRecord.updatedAt = nowIso()
            updateExtractionRecord(extractionsPath, extractionRecord)
            emitProgress(onProgress, extractionRecord, {
              status: 'extracting',
              dimension,
              dimensionLabel,
              groupTitle: group.title,
              groupIndex: gi + 1,
              groupTotal: groups.length,
              extractedCount: dimensionItems.length,
              totalExtractedCount: extractionRecord.stats.totalExtractedCount,
              progress: {
                current: gi + 1,
                total: groups.length,
                percent: task.progress.percent
              }
            })
          }
        }

        if (dimensionItems.length && vectorService?.addChunks && options.embeddingConfig?.apiKey) {
          try {
            const chunks = dimensionItems.map((item) => ({
              id: item._id,
              text: item._text || toPlainText(item),
              sourceExtractionId: extractionId,
              sourceBookName: effectiveSourceBookName,
              dimension,
              chapterRange: item._chapterRange || ''
            }))
            const vectorResult = await vectorService.addChunks(
              bookPath,
              chunks,
              options.embeddingConfig
            )
            extractionRecord.stats.vectorizedCount += Number(vectorResult?.added || 0)
          } catch (err) {
            console.error(`向量化维度 ${dimension} 失败:`, err.message)
            addExtractionLog(
              extractionRecord,
              'warning',
              `「${dimensionLabel}」向量索引写入失败：${err.message}`,
              {
                dimension
              }
            )
          }
        }

        extractionRecord.results[dimension] = {
          label: dimensionLabel,
          count: dimensionItems.length,
          completed: true,
          failedGroups: dimensionErrors.length,
          groups: dimensionGroups,
          items: dimensionItems,
          errors: dimensionErrors
        }

        task.status = dimensionErrors.length === groups.length ? 'failed' : 'completed'
        task.currentGroup = ''
        task.extractedCount = dimensionItems.length
        task.failedGroups = dimensionErrors.length
        task.progress = { current: groups.length, total: groups.length, percent: 100 }
        extractionRecord.dimensions[dimension] = {
          ...extractionRecord.dimensions[dimension],
          status: task.status,
          chunkCount: dimensionGroups.length,
          itemCount: dimensionItems.length,
          failedGroups: dimensionErrors.length,
          progress: task.progress
        }
        extractionRecord.progress.completedSubTasks = Object.values(
          extractionRecord.subTasks
        ).filter((item) => item.status === 'completed').length
        extractionRecord.progress.failedSubTasks = Object.values(extractionRecord.subTasks).filter(
          (item) => item.status === 'failed'
        ).length
        addExtractionLog(
          extractionRecord,
          task.status === 'failed' ? 'error' : 'success',
          task.status === 'failed'
            ? `「${dimensionLabel}」全部失败，请检查模型或文本。`
            : `「${dimensionLabel}」完成，共 ${dimensionItems.length} 条内容。`,
          { dimension, count: dimensionItems.length }
        )
        emitProgress(onProgress, extractionRecord, {
          status: 'completed',
          dimension,
          dimensionLabel,
          currentStep: `${dimensionLabel} 已完成`,
          extractedCount: dimensionItems.length,
          totalExtractedCount: extractionRecord.stats.totalExtractedCount,
          progress: { current: groups.length, total: groups.length, percent: 100 }
        })
      }

      if (!flattenResultItems(extractionRecord.results).length) {
        throw new Error('模型没有返回可用拆书内容，请换一个模型或缩小提取范围后重试')
      }
      extractionRecord.status = extractionRecord.stats.failedGroups > 0 ? 'partial' : 'completed'
      extractionRecord.currentStep = extractionRecord.status === 'partial' ? '部分完成' : '拆书完成'
      extractionRecord.progress.percent = 100
      addExtractionLog(
        extractionRecord,
        extractionRecord.status === 'partial' ? 'warning' : 'success',
        extractionRecord.status === 'partial'
          ? `拆书部分完成，共生成 ${extractionRecord.stats.totalExtractedCount} 条内容，失败 ${extractionRecord.stats.failedGroups} 组。`
          : `拆书完成，共生成 ${extractionRecord.stats.totalExtractedCount} 条内容。`
      )
    } catch (err) {
      extractionRecord.status = 'failed'
      extractionRecord.error = err.message
      extractionRecord.currentStep = '拆书失败'
      addExtractionLog(extractionRecord, 'error', err.message || '拆书失败')
    }
    extractionRecord.updatedAt = nowIso()

    emitProgress(onProgress, extractionRecord, {
      status: extractionRecord.status,
      currentStep: extractionRecord.currentStep,
      error: extractionRecord.error || '',
      overallPercent: extractionRecord.status === 'failed' ? extractionRecord.progress.percent : 100
    })

    const current = readExtractionRecords(extractionsPath)
    if (replacedRecords.length && extractionRecord.status !== 'failed') {
      for (let i = 0; i < current.length; i += 1) {
        const record = current[i]
        if (!replacedRecords.some((item) => item.id === record?.id)) continue
        current[i] = {
          ...record,
          lifecycleStatus: 'superseded',
          superseded: true,
          supersededAt: nowIso(),
          supersededBy: extractionId
        }
      }
      await deleteVectorsForRecords(bookPath, replacedRecords)
      addExtractionLog(
        extractionRecord,
        'info',
        `已将 ${replacedRecords.length} 次旧拆书记录标记为已替换。`
      )
    }
    const idx = current.findIndex((e) => e.id === extractionId)
    if (idx !== -1) {
      current[idx] = extractionRecord
    }
    writeExtractionRecords(extractionsPath, current)

    if (extractionRecord.status === 'failed') {
      return {
        success: false,
        ...summarizeExtractionRecord(extractionRecord),
        message: extractionRecord.error || '拆书失败'
      }
    }
    return { success: true, ...summarizeExtractionRecord(extractionRecord) }
  }

  listExtractions(bookPath) {
    if (!bookPath) return { success: true, extractions: [] }
    const extractionsPath = getExtractionsPath(bookPath)
    return {
      success: true,
      extractions: readExtractionRecords(extractionsPath).map(summarizeExtractionRecord)
    }
  }

  getExtraction(bookPath, extractionId, options = {}) {
    if (!bookPath || !extractionId) {
      throw new Error('参数不完整')
    }
    const extractionsPath = getExtractionsPath(bookPath)
    const target = readExtractionRecords(extractionsPath).find(
      (record) => record.id === extractionId
    )
    if (!target) {
      throw new Error('拆书任务不存在')
    }
    return { success: true, extraction: extractionDetailPreview(target, options) }
  }

  getExtractionRecord(bookPath, extractionId) {
    if (!bookPath || !extractionId) {
      throw new Error('参数不完整')
    }
    const extractionsPath = getExtractionsPath(bookPath)
    const target = readExtractionRecords(extractionsPath).find(
      (record) => record.id === extractionId
    )
    if (!target) {
      throw new Error('拆书任务不存在')
    }
    return target
  }

  getExtractionResultPage(bookPath, extractionId, options = {}) {
    if (!bookPath || !extractionId) {
      throw new Error('参数不完整')
    }
    const extractionsPath = getExtractionsPath(bookPath)
    const target = readExtractionRecords(extractionsPath).find(
      (record) => record.id === extractionId
    )
    if (!target) {
      throw new Error('拆书任务不存在')
    }
    return extractionResultPage(target, options)
  }

  async deleteExtraction(bookPath, extractionId) {
    if (!bookPath || !extractionId) {
      throw new Error('参数不完整')
    }
    const extractionsPath = getExtractionsPath(bookPath)
    const existing = readExtractionRecords(extractionsPath)
    const target = existing.find((e) => e.id === extractionId)
    if (!target) {
      throw new Error('拆书任务不存在')
    }

    if (vectorService?.deleteBySource) {
      try {
        await vectorService.deleteBySource(bookPath, extractionId)
      } catch {
        // 删除索引失败不影响任务记录删除。
      }
    }

    const updated = existing.filter((e) => e.id !== extractionId)
    writeExtractionRecords(extractionsPath, updated)
    return { success: true, deletedId: extractionId }
  }

  async searchKnowledge(bookPath, { query, dimensions, topK = 5 } = {}, embeddingConfig = null) {
    if (!bookPath || !query) {
      throw new Error('书籍路径和查询内容不能为空')
    }
    const targetDimensions =
      Array.isArray(dimensions) && dimensions.length ? dimensions : [...EXTRACTION_DIMENSIONS]

    if (!vectorService?.search || !embeddingConfig) {
      return this.searchStoredKnowledge(bookPath, { query, dimensions: targetDimensions, topK })
    }

    const results = []
    for (const dim of targetDimensions) {
      try {
        const hits = await vectorService.search(bookPath, query, embeddingConfig, {
          limit: topK,
          filter: `dimension = '${String(dim).replace(/'/g, "''")}'`
        })
        if (Array.isArray(hits)) {
          results.push(
            ...hits.map((h) => ({
              ...h,
              _dimension: dim,
              _dimensionLabel: EXTRACTION_DIMENSION_LABELS[dim] || dim
            }))
          )
        }
      } catch {
        continue
      }
    }

    if (results.length) {
      results.sort((a, b) => (a._distance || 0) - (b._distance || 0))
      return results.slice(0, topK * targetDimensions.length)
    }
    return this.searchStoredKnowledge(bookPath, { query, dimensions: targetDimensions, topK })
  }

  searchStoredKnowledge(bookPath, { query, dimensions, topK = 5 } = {}) {
    const q = String(query || '')
      .trim()
      .toLowerCase()
    const targetDimensions =
      Array.isArray(dimensions) && dimensions.length ? new Set(dimensions) : null
    const records = activeExtractionRecords(readExtractionRecords(getExtractionsPath(bookPath)))
    const limit = Number(topK) || 5
    const rows = records
      .flatMap((record) =>
        flattenResultItems(record.results).map((row) => ({
          ...row,
          sourceExtractionId: record.id,
          sourceBookName: record.sourceBookName || row.item?._sourceBookName || '',
          metadata: {
            sourceExtractionId: record.id,
            sourceBookName: record.sourceBookName || row.item?._sourceBookName || '',
            dimension: row.dimension,
            group: row.group,
            chapterRange: row.chapterRange
          }
        }))
      )
      .filter((row) => !targetDimensions || targetDimensions.has(row.dimension))
      .map((row) => {
        const haystack = `${row.dimension} ${row.group} ${row.text}`.toLowerCase()
        const score = q
          ? q
              .split(/[\s，。！？、；,.!?;:]+/)
              .filter(Boolean)
              .reduce((sum, token) => sum + (haystack.includes(token) ? token.length : 0), 0)
          : 1
        return { ...row, _score: score }
      })
      .filter((row) => !q || row._score > 0)
      .sort((a, b) => b._score - a._score)

    return rows.slice(0, limit * (targetDimensions?.size || EXTRACTION_DIMENSIONS.length))
  }
}

const extractionAiService = new ExtractionAiService()

export default extractionAiService

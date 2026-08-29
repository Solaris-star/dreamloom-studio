// AI 味检测服务 —— 移植自 oh-story-claudecode（MIT License, Copyright (c) 2025-2026 oh-story-claudecode）
// 原项目: skills/story-deslop/scripts/check-ai-patterns.js
// 移植说明：去掉 CLI 外壳，保留全部 24 类检测规则与真人语料校准的阈值；
// 阈值均来自原项目对《万疆》20 章 + demo 前 20 章真人正文的校准，勿随意改动。

const STOP_CHARS = new Set(['。', '！', '？', '!', '?', '\n'])
const SOFT_SEPARATORS = new Set(['，', ',', '、', '；', ';', '：', ':'])
const HARD_SEPARATORS = new Set(['。', '.', '！', '!', '？', '?'])
const MAX_NEGATIVE_SPAN = 80
const MAX_POSITIVE_SPAN = 80

const STUTTER_MIN_RUN = 6
const STUTTER_MAX_SENTENCE = 5
const LONG_PARAGRAPH_CHARS = 200

const MICRO_TIC_PATTERN = /了(?:[一两三几半])?[下阵圈道声眼口气会]/g
const MICRO_TIC_MIN_HITS = 5
const MICRO_TIC_PER_KILO = 6

const STOCK_REACTION_PATTERNS = [
  /(?:指尖|手指|指节|手背|掌心|拳头|袖口|衣角|裙角|下唇|嘴唇|唇角|嘴角|眉头|眼底|眸光|目光|视线|肩膀|呼吸)[^。！？!?\n]{0,16}(?:轻轻|微微|缓缓|悄然|不自觉|无意识|下意识|攥紧|握紧|收紧|绞紧|泛白|发白|叩|敲|摩挲|抿紧|抿成|移开|垂下|躲开|一颤|颤了?一下|停了?一下|顿了?一下)/g,
  /(?:语气|声音)[^。！？!?\n]{0,12}(?:平静|冷静|平淡|冷淡|淡漠|平直)[^。！？!?\n]{0,12}(?:像|仿佛|如同|好像)[^。！？!?\n]{0,16}(?:念|读|报|说|陈述|宣判|背诵)/g,
  /(?:胸口|心口)[^。！？!?\n]{0,16}(?:像|仿佛|如同|好像)[^。！？!?\n]{0,16}(?:撞|锤|压|攥|堵)[^。！？!?\n]{0,8}(?:一下|一记|一拳)?/g,
  /(?:声音|嗓音|语气)[^。！？!?\n]{0,12}(?:放轻|压低|发紧|发颤|很轻|轻了些)/g,
  /(?:喉结|喉头|喉咙)[^。！？!?\n]{0,10}(?:滚|动|紧|堵|发涩|发干)/g,
  /(?:眼眶|眼圈|鼻子)[^。！？!?\n]{0,8}(?:发红|红了|发热|发酸|一酸)/g,
  /(?:抿了?下唇|抿了?抿唇|抿了?下嘴|抿着笑)/g
]
const STOCK_REACTION_MIN_HITS = 4
const STOCK_REACTION_PER_KILO = 1.5

const ACTION_LIST_VERB_PATTERN =
  /伸手|抬手|探手|拿起|拿过|取出|取过|掏出|摸出|抓起|攥住|握住|捏住|按住|推开|拉开|打开|关上|放下|递给|挑开|掀开|扯开|拧开|倒出|端起|转身|回头|抬头|低头|弯腰|俯身|走到|走向|坐下|站起|看向|看着|盯着|扫过/g
const ACTION_LIST_MIN_HITS = 5
const ACTION_LIST_MIN_SEPARATORS = 4

const ABSTRACT_SUMMARY_PATTERNS = [
  /这一刻[，,]?[^\n。！？!?]{0,24}(?:终于|才)(?:明白|意识到)/g,
  /从这一刻开始/g,
  /(?:命运|宿命)[^\n。！？!?]{0,28}(?:齿轮|棋局|獠牙|改写|推向|安排)/g,
  /早已[^\n。！？!?]{0,8}(?:布好|安排好)[^\n。！？!?]{0,8}(?:棋局|局)/g,
  /前所未有的(?:决意|清醒|勇气|力量|恐惧|平静|信念)/g,
  /(?:反击|复仇|战争|较量|故事|命运)[^\n。！？!?]{0,12}才刚刚开始/g,
  /(?:新的开始|全新的开始)/g
]
const ABSTRACT_SUMMARY_MIN_HITS = 3
const ABSTRACT_SUMMARY_PER_KILO = 4

const CLICHE_PATTERNS = [
  /仿佛|犹如|宛若|如同/g,
  /一丝|一抹|些许|几分|隐约/g,
  /深吸一口气|缓缓|微微|轻轻|淡淡/g,
  /眼中闪过|嘴角勾起|眸光微微一闪|指节泛白|目光锐利|眼神锐利/g,
  /心中涌起一股|心头一震|心中一动|心下了然|心中暗道|心中一凛/g,
  /不容置疑|不容置喙|不易察觉|显而易见|毫无疑问|不可否认/g,
  /声音不大[，,]?却带着|语气平静无波|平静无波|声音平直|听不出情绪/g,
  /不知何时|唾手可得|无声翻涌|沉默(?:在[^。！？!?\n]{0,16})?蔓延|难以言说/g,
  /散发着一股|冰冷的光|格外刺眼|深邃而冰冷/g
]
const CLICHE_DENSITY_MIN_HITS = 8
const CLICHE_DENSITY_PER_KILO = 12

const METAPHOR_MARKER_PATTERN =
  /好像|像是|仿佛|宛如|如同|犹如|(?<![不头图画影录摄肖])像(?![头像素])/g
const METAPHOR_LIKE_PHRASE_PATTERN =
  /(?:死|水|冰|火|潮水|石头|木头|机器|纸|铁|鬼|死人|刀|针|网|墙)一样/g
const METAPHOR_DENSITY_MIN_HITS = 7
const METAPHOR_DENSITY_PER_KILO = 3

const REASONING_CHAIN_PATTERNS = [
  { key: 'mental', core: true, pattern: /(?<![不没未无])(?:他|她|我)?(?:知道|明白|意识到|清楚|判断|确认|分析)/g },
  { key: 'connector', core: true, pattern: /这意味着|也就是说|换句话说|真正的问题(?:在于)?|问题在于|关键在于|在这种情况下|按照这个逻辑|只有这样|想到这里/g },
  { key: 'modal', core: true, pattern: /(?:(?<!不)(?:必须|需要|应该|只要|就会|可能|可以|能够|无法)|不能)[^。！？!?\n]{0,16}(?:判断|确认|承担|维持|稳住|控制|扩大|失控|带来|造成|理解|默认|回家|进门|核对|筛选|减少|建立|风险|结果|秩序|责任)/g },
  { key: 'abstract', core: false, pattern: /(?:任务|条件|风险|来源|逻辑|局面|结果|责任|秩序|规则|信息不足|决策能力)/g }
]
const REASONING_CHAIN_MIN_HITS = 8
const REASONING_CHAIN_CORE_MIN_HITS = 4
const REASONING_CHAIN_MIN_BUCKETS = 2
const REASONING_CHAIN_PER_KILO = 18

const NOTICE_FORMAL_PATTERNS = [
  /不得|必须|不可|禁止|严禁|应当|须|需|务必/g,
  /当前|本公告|本规则|本系统|提示|任务失败|临时权限|权限|状态|等级/g,
  /维持|公共区域|秩序|优先|惩罚|处罚|违规|指令|执行/g,
  /被视为|同样计入|计入|承担|责任|单位|撤回|转发|截图/g
]
const NOTICE_FORMAL_CORE_PATTERN =
  /不得|必须|不可|禁止|严禁|应当|须|需|务必|被视为|同样计入|计入/g
const NOTICE_FORMAL_MIN_LINES = 4
const NOTICE_FORMAL_MIN_HITS = 12
const NOTICE_FORMAL_CORE_MIN_HITS = 5
const NOTICE_FORMAL_PER_KILO = 60

const OVERCOMPRESSED_PROSE_PARTICLE_PATTERN = /[的了就着过呢吧啊呀嘛]/g
const OVERCOMPRESSED_PROSE_MIN_CHARS = 1200
const OVERCOMPRESSED_PROSE_MIN_PARAS = 45
const OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS = 15
const OVERCOMPRESSED_PROSE_SHORT_RATIO = 0.58
const OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO = 85

const LOW_CONNECTIVE_FUNCTION_TERMS = [
  '的', '了', '就', '在', '是', '也', '都', '还', '又', '把', '被', '给',
  '这个', '那个', '里面', '以后', '时候', '现在', '因为', '所以', '但是',
  '不过', '然后', '已经', '还是', '起来', '出来', '下去'
]
const LOW_CONNECTIVE_PLAIN_TERMS = [
  '的', '了', '就', '也', '还', '又', '这个', '那个', '东西', '事情',
  '时候', '里面', '以后', '一下', '一点', '有点', '还是'
]
const LOW_CONNECTIVE_MIN_CHARS = 800
const LOW_CONNECTIVE_FUNCTION_PER_KILO = 100
const LOW_CONNECTIVE_PLAIN_PER_KILO = 65
const LOW_CONNECTIVE_LONG_SENTENCE_CHARS = 30
const LOW_CONNECTIVE_LONG_SENTENCE_RATIO = 0.08

const COMPACT_EITHER_OR_PREV = new Set(['不', '就', '也'])
const TAG_PARTICLES = new Set(['吗', '吧', '嘛'])
const AFFIRMATION_TAG_PARTICLES = new Set(['的', '啊', '呀', '呢'])
const AFFIRMATION_TAG_BOUNDARY = new Set([
  '', '，', ',', '。', '.', '！', '!', '？', '?', '、', '；', ';', '：', ':', '\n', '\r', '\t', ' '
])

const QUOTE_PAIRS = [
  ['「', '」'], ['『', '』'], ['【', '】'], ['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"]
]

const VOICE_CONTRAST_PATTERN = /声音(?:并)?不[大高响亮][^。！？!?\n]{0,16}[却但偏]/g

const NEGATION_PARADE_PATTERNS = [
  /(?:没有[^。！？!?\n，,]{1,12}[，,]){2}/g,
  /(?<![沉淹埋出隐湮吞覆漫泯])没(?!有?过?多久)(?:有)?[^。！？!?\n，,]{1,12}[，,]\s*没(?!有?过?多久)(?:有)?[^。！？!?\n，,]{1,16}[，,。.][^。！？!?\n，,]{0,6}只(?:是|会|有)/g
]
const CROSS_NEGATION_START = /^不是[^。！？!?\n]{1,24}[。！？!?]?$/
const CROSS_NEGATION_MIDDLE = /^(?:也|还)不是[^。！？!?\n]{1,24}[。！？!?]?$/
const CROSS_NEGATION_END = /^只是[^。！？!?\n]{1,32}[。！？!?]?$/

const DECISION_FRAME_PATTERN = /至于([\u3400-\u9fff]{1,3})不\1[，,]\s*怎么\1/g
const REPEATED_NEGATIVE_VERB_PATTERN =
  /不([\u3400-\u9fff]{1,2})([\u3400-\u9fff]{2,8})[，,]\s*不\1([\u3400-\u9fff]{2,8})/g

const REVERSE_NOT_IS_PATTERN = /是([^。！？!?\n，,]{1,12})[，,]\s*(?:而)?不是([^。！？!?\n]{1,20})/g
const REVERSE_NOT_IS_PREV_EXCLUDE = new Set([
  ...COMPACT_EITHER_OR_PREV, '还', '只', '可', '但', '于', '倒', '像', '若', '要',
  '正', '便', '总', '老', '更', '最', '算', '怕', '凡', '或', '即', '自', '竟',
  '原', '本', '仍', '许', '净', '光', '单', '尽'
])

const TRAILER_ENDING_PATTERN =
  /没人知道|谁也不知道|谁也没想到|殊不知|(?:这)?才刚刚开(?:始|头)|正(?:朝着|向着)[^。！？!?\n]{0,24}(?:压|涌|袭|逼)(?:了?过去|了?过来|来)|(?<!正式)拉开(?:序幕|帷幕)|即将(?:开始|来临|降临)/g
const TRAILER_SUMMARY_PATTERN =
  /这一(?:夜|天|刻|战|年|局|役)[，,]?[^。！？!?，,\n]{0,6}(?<!命中)(?<!是)注定[^。！？!?\n]{0,8}[。！]|就这样[，,][^。！？!?，,\n]{0,8}(?:一切|全部)[^。！？!?，,\n]{0,4}(?:结束了|落幕|收场)[。！]|这一切[，,]?[^。！？!?，,\n]{0,6}(?:都)?(?:说明|意味着|结束了)(?!的)(?:(?!什么)[^。！？!?\n]){0,6}[。！]|(?:新的篇章|新的旅程|崭新的篇章|新的人生)[^。！？!?\n]{0,6}(?:开始|拉开|展开)|命运[^。！？!?\n]{0,6}齿轮/g
const TRAILER_ENDING_WINDOW_CHARS = 600

const QUOTE_EMPHASIS_MIN_HITS = 3
const QUOTE_EMPHASIS_MAX_VISIBLE = 4
const QUOTE_EMPHASIS_SPEECH_VERB_PATTERN = /[说道问喊答念叫回吼骂写读唱嘀咕]/

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeRegExpCharClass(text) {
  return text.replace(/[\\\]^-]/g, '\\$&')
}

const QUOTE_SOURCES = QUOTE_PAIRS.map(
  ([open, close]) => `${escapeRegExp(open)}[^${escapeRegExpCharClass(close)}\\n]*${escapeRegExp(close)}`
)

// ---- 对外主入口 ----

export function scanAiFlavor(input = '') {
  const lines = String(input || '').split(/\r?\n/)
  const findings = []
  let fence = null
  let inFrontMatter = hasYamlFrontMatter(lines)
  let block = []
  const proseLines = []

  const flushBlock = () => {
    if (block.length === 0) return
    findings.push(...scanBlock(block))
    block = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (inFrontMatter) {
      if (index > 0 && trimmed === '---') inFrontMatter = false
      continue
    }

    const fenceMarker = parseFenceMarker(trimmed)
    if (fence) {
      if (fenceMarker && fenceMarker.char === fence.char && fenceMarker.length >= fence.length) {
        fence = null
      }
      continue
    }

    if (fenceMarker) {
      flushBlock()
      fence = fenceMarker
      continue
    }

    block.push({ text: line, lineNo: index + 1 })
    proseLines.push({ text: line, lineNo: index + 1 })
  }

  flushBlock()
  findings.push(...scanProsePatterns(proseLines))
  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return findings
}

export function hasBlockingFindings(findings = []) {
  return findings.some((f) => f.severity === 'blocking')
}

export function summarizeAiFlavorFindings(findings = [], maxItems = 8) {
  const rows = Array.isArray(findings) ? findings : []
  if (!rows.length) return ''
  const blocking = rows.filter((f) => f.severity === 'blocking')
  const advisory = rows.filter((f) => f.severity === 'advisory')
  const parts = []
  if (blocking.length) {
    parts.push(
      `AI 味硬性问题 ${blocking.length} 处（必须修改）：\n${blocking
        .slice(0, maxItems)
        .map((f, i) => `${i + 1}. 第${f.line}行 [${f.type}] ${f.message} 原文：${f.excerpt || ''}`)
        .join('\n')}`
    )
  }
  if (advisory.length) {
    parts.push(
      `AI 味提示 ${advisory.length} 处（按读感判断）：\n${advisory
        .slice(0, maxItems)
        .map((f, i) => `${i + 1}. 第${f.line}行 [${f.type}] ${f.message}`)
        .join('\n')}`
    )
  }
  return parts.join('\n\n')
}

// ---- 段落级检测 ----

function scanProsePatterns(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue

    const dashPattern = /——|—|--+/g
    let dash
    while ((dash = dashPattern.exec(text)) !== null) {
      findings.push({
        line: lineNo,
        column: dash.index + 1,
        type: 'em-dash',
        severity: 'blocking',
        message:
          '破折号按功能改写：打断→动作 beat/短句，拖长音→省略或动作，插入说明→逗号/冒号；勿一律改句号。',
        excerpt: compact(text.slice(Math.max(0, dash.index - 8), dash.index + dash[0].length + 8))
      })
    }

    if (trimmed.length > LONG_PARAGRAPH_CHARS) {
      findings.push({
        line: lineNo,
        column: 1,
        type: 'long-paragraph',
        severity: 'advisory',
        message: `段落过长（${trimmed.length} 字）：按镜头/新动作/新线索/视线切换断段，别一段到底。`,
        excerpt: compact(trimmed.slice(0, 40))
      })
    }
  }

  findings.push(...findVoiceContrast(proseLines))
  findings.push(...findNegationParade(proseLines))
  findings.push(...findFormulaicParallelism(proseLines))
  findings.push(...findReverseNotIs(proseLines))
  findings.push(...findTrailerEnding(proseLines))
  findings.push(...findQuoteEmphasisTic(proseLines))
  findings.push(...findPeriodStutter(proseLines))
  findings.push(...findMicroActionTic(proseLines))
  findings.push(...findStockReactionTic(proseLines))
  findings.push(...findActionListTic(proseLines))
  findings.push(...findAbstractSummaryTic(proseLines))
  findings.push(...findClicheDensityTic(proseLines))
  findings.push(...findMetaphorDensityTic(proseLines))
  findings.push(...findReasoningChainTic(proseLines))
  findings.push(...findNoticeFormalityTic(proseLines))
  findings.push(...findOvercompressedProseTic(proseLines))
  findings.push(...findLowConnectiveDensityTic(proseLines))
  return findings
}

function findVoiceContrast(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const masked = maskQuoted(text)
    VOICE_CONTRAST_PATTERN.lastIndex = 0
    let match
    while ((match = VOICE_CONTRAST_PATTERN.exec(masked)) !== null) {
      findings.push({
        line: lineNo,
        column: match.index + 1,
        type: 'voice-contrast',
        severity: 'blocking',
        message:
          '音量反差腔：「声音不大/不高…却/但…」是 AI 高频反差模板；删掉音量铺垫，直接写声音落进场子的具体效果（谁停了手、哪排安静了）。',
        excerpt: compact(text.slice(match.index, match.index + match[0].length))
      })
    }
  }

  return findings
}

function findNegationParade(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const masked = maskQuoted(text)

    const spans = []
    for (const pattern of NEGATION_PARADE_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(masked)) !== null) {
        spans.push([match.index, match.index + match[0].length])
      }
    }
    spans.sort((a, b) => a[0] - b[0])

    let lastEnd = -1
    for (const [start, end] of spans) {
      if (start < lastEnd) {
        lastEnd = Math.max(lastEnd, end)
        continue
      }
      lastEnd = end
      findings.push({
        line: lineNo,
        column: start + 1,
        type: 'negation-parade',
        severity: 'blocking',
        message:
          '否定排比：「没有X，没有Y…」/「没X，没有Y，只是Z」是 AI 高频排比模板；删掉否定清单，直接写现场实际有什么，最多留一个最有信息量的否定。',
        excerpt: compact(text.slice(start, end))
      })
    }
  }

  return findings
}

function findFormulaicParallelism(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    for (const [pattern, message] of [
      [
        DECISION_FRAME_PATTERN,
        '「至于X不X，怎么X」把同一决定拆成工整栏目；若只是复述细纲，压成角色当下的一次判断或直接动作。'
      ],
      [
        REPEATED_NEGATIVE_VERB_PATTERN,
        '同动词「不V A，不V B」容易写成否定清单；含台词也要按语境复核，保留真正有功能的一项即可。'
      ]
    ]) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        findings.push({
          line: lineNo,
          column: match.index + 1,
          type: 'formulaic-parallelism',
          severity: 'advisory',
          message,
          excerpt: compact(match[0])
        })
      }
    }
  }

  const window = []
  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed) continue
    if (isDivider(trimmed) || isStructural(trimmed)) {
      window.length = 0
      continue
    }
    if (window.length && lineNo - window[window.length - 1].lineNo > 2) window.length = 0
    window.push({ text: maskQuoted(trimmed), original: trimmed, lineNo })
    if (window.length > 3) window.shift()
    if (window.length !== 3) continue
    if (
      !CROSS_NEGATION_START.test(window[0].text) ||
      !CROSS_NEGATION_MIDDLE.test(window[1].text) ||
      !CROSS_NEGATION_END.test(window[2].text)
    )
      continue
    findings.push({
      line: window[0].lineNo,
      column: 1,
      type: 'formulaic-parallelism',
      severity: 'advisory',
      message:
        '跨段「不是… / 也不是… / 只是…」可能是工整否定铺排，也可能承担辩解或悬念排除；通读语境，只在重复细纲或拖慢画面时改写。',
      excerpt: compact(window.map((entry) => entry.original).join(' / '))
    })
  }

  return findings
}

function findReverseNotIs(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const masked = maskQuoted(text)
    REVERSE_NOT_IS_PATTERN.lastIndex = 0
    let match
    while ((match = REVERSE_NOT_IS_PATTERN.exec(masked)) !== null) {
      const start = match.index
      if (REVERSE_NOT_IS_PREV_EXCLUDE.has(masked[start - 1])) continue
      if (masked[start + 1] === '不') continue
      if (isAffirmationTagAt(masked, start)) continue
      if (/^[吗么吧]/.test(match[2])) continue
      findings.push({
        line: lineNo,
        column: start + 1,
        type: 'reverse-not-is',
        severity: 'blocking',
        message:
          '反序对比腔：「是A，不是B」与「不是A，是B」同族；删掉后置否定，直接写 A 的具体表现，或用细节让读者自己对比。',
        excerpt: compact(text.slice(start, start + match[0].length))
      })
    }
  }

  return findings
}

function findTrailerEnding(proseLines) {
  const windowLines = []
  let accumulated = 0

  for (let i = proseLines.length - 1; i >= 0 && accumulated < TRAILER_ENDING_WINDOW_CHARS; i -= 1) {
    const { text } = proseLines[i]
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    windowLines.unshift(proseLines[i])
    accumulated += visibleLength(stripQuoted(trimmed))
  }

  const findings = []
  for (const { text, lineNo } of windowLines) {
    const masked = maskQuoted(text)
    TRAILER_ENDING_PATTERN.lastIndex = 0
    let match
    while ((match = TRAILER_ENDING_PATTERN.exec(masked)) !== null) {
      findings.push({
        line: lineNo,
        column: match.index + 1,
        type: 'trailer-ending',
        severity: 'blocking',
        message:
          '预告式总结收尾：「没人知道/才刚刚开始/正朝着…压了过去」是 AI 章尾预告腔；结尾停在具体动作、画面或一句台词上，悬念让事件自己挂住，别替读者预告下一章。',
        excerpt: compact(text.slice(match.index, match.index + match[0].length))
      })
    }
    TRAILER_SUMMARY_PATTERN.lastIndex = 0
    let summaryMatch
    while ((summaryMatch = TRAILER_SUMMARY_PATTERN.exec(masked)) !== null) {
      findings.push({
        line: lineNo,
        column: summaryMatch.index + 1,
        type: 'trailer-summary',
        severity: 'blocking',
        message:
          '章尾状态总结体：「这一夜注定…/这一切都结束了/新的人生才刚刚开始/命运的齿轮」是把细纲的收束状态原样写成了总结句；收束状态是规划口径，正文落到最后一个具体动作、画面或台词上，别替读者盖章。',
        excerpt: compact(text.slice(summaryMatch.index, summaryMatch.index + summaryMatch[0].length))
      })
    }
  }

  return findings
}

function findQuoteEmphasisTic(proseLines) {
  let hits = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    if (visibleLength(stripQuoted(trimmed)) === 0) continue
    const ranges = quotedRanges(text)

    for (const [start, end] of ranges) {
      if (text[start] === '【') continue
      if (ranges.some(([s2, e2]) => s2 <= start && end <= e2 && (s2 !== start || e2 !== end))) continue
      const inner = text.slice(start + 1, end - 1)
      const visible = visibleLength(inner)
      if (visible < 1 || visible > QUOTE_EMPHASIS_MAX_VISIBLE) continue
      if (/[。！？!?…，,；;：:]/.test(inner)) continue
      const before = text.slice(Math.max(0, start - 6), start)
      const after = text.slice(end, end + 3)
      if (QUOTE_EMPHASIS_SPEECH_VERB_PATTERN.test(before) || QUOTE_EMPHASIS_SPEECH_VERB_PATTERN.test(after))
        continue
      hits += 1
      if (firstLine === null) firstLine = lineNo
      if (samples.length < 6 && !samples.includes(inner)) samples.push(inner)
    }
  }

  if (hits < QUOTE_EMPHASIS_MIN_HITS) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'quote-emphasis-tic',
      severity: 'advisory',
      message: `引号强调滥用：叙述里 1-4 字短词加引号强调 ${hits} 处；只留真正反讽/转述必要的一两处，其余去掉引号直接写，或换成具体动作让读者自己品。`,
      excerpt: compact(samples.join(' '))
    }
  ]
}

function findMicroActionTic(proseLines) {
  let hits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)
    MICRO_TIC_PATTERN.lastIndex = 0
    let match
    while ((match = MICRO_TIC_PATTERN.exec(narrative)) !== null) {
      hits += 1
      if (firstLine === null) firstLine = lineNo
      if (samples.length < 6 && !samples.includes(match[0])) samples.push(match[0])
    }
  }

  if (narrativeChars === 0 || hits < MICRO_TIC_MIN_HITS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < MICRO_TIC_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'micro-action-tic',
      severity: 'advisory',
      message: `微动作复读：「了下/了一下」式轻量补语 ${hits} 处（${perKilo.toFixed(1)}/千字）；同一反应模板高密度复现是机械指纹，合并动作 beat、换具体细节，别每个动作都补一个轻反应尾巴。`,
      excerpt: compact(samples.join(' '))
    }
  ]
}

function findStockReactionTic(proseLines) {
  let hits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)

    for (const pattern of STOCK_REACTION_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1
        if (firstLine === null) firstLine = lineNo
        const sample = sentenceAround(narrative, match.index)
        if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample)
      }
    }
  }

  if (narrativeChars === 0 || hits < STOCK_REACTION_MIN_HITS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < STOCK_REACTION_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'stock-reaction-tic',
      severity: 'advisory',
      message: `套式反应细节：指尖/指节/喉结/眼圈/声音放轻等通用反应或“平静得像在念”式语气比喻 ${hits} 处（${perKilo.toFixed(1)}/千字）；逐处做删除测试，只标注情绪、不改变选择、关系、物件或动作结果的删掉，不要换部位或同义动作。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findActionListTic(proseLines) {
  const findings = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed).trim()
    if (!narrative) continue

    ACTION_LIST_VERB_PATTERN.lastIndex = 0
    const verbs = []
    let match
    while ((match = ACTION_LIST_VERB_PATTERN.exec(narrative)) !== null) {
      verbs.push(match[0])
    }

    if (verbs.length < ACTION_LIST_MIN_HITS) continue
    const separators = (narrative.match(/[，、；;]/g) || []).length
    if (separators < ACTION_LIST_MIN_SEPARATORS) continue

    findings.push({
      line: lineNo,
      column: 1,
      type: 'action-list-tic',
      severity: 'advisory',
      message: `监控摄像头式动作清单：同段连续动作动词 ${verbs.length} 个、分隔符 ${separators} 个；合并琐碎步骤，只保留有情绪/情节功能的动作，必要时用角色犹豫、误判或环境反馈做缓冲。`,
      excerpt: compact(verbs.slice(0, 8).join(' '))
    })
  }

  return findings
}

function findAbstractSummaryTic(proseLines) {
  let hits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)

    for (const pattern of ABSTRACT_SUMMARY_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1
        if (firstLine === null) firstLine = lineNo
        const sample = compact(match[0])
        if (samples.length < 6 && !samples.includes(sample)) samples.push(sample)
      }
    }
  }

  if (narrativeChars === 0 || hits < ABSTRACT_SUMMARY_MIN_HITS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < ABSTRACT_SUMMARY_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'abstract-summary-tic',
      severity: 'advisory',
      message: `抽象总结复读：命运/棋局/这一刻终于明白/才刚刚开始等作者总结 ${hits} 处（${perKilo.toFixed(1)}/千字）；回到角色当下可见的文件、动作、对话或物理后果，别替读者盖章。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findClicheDensityTic(proseLines) {
  let hits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)

    for (const pattern of CLICHE_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1
        if (firstLine === null) firstLine = lineNo
        if (samples.length < 8 && !samples.includes(match[0])) samples.push(match[0])
      }
    }
  }

  if (narrativeChars === 0 || hits < CLICHE_DENSITY_MIN_HITS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < CLICHE_DENSITY_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'cliche-density-tic',
      severity: 'advisory',
      message: `套词密度过高：高危 AI 套词 ${hits} 处（${perKilo.toFixed(1)}/千字）；不要同义词轮换，改成角色当下可见的动作、物件、对话和具体后果。`,
      excerpt: compact(samples.join(' '))
    }
  ]
}

function findMetaphorDensityTic(proseLines) {
  let hits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)

    METAPHOR_MARKER_PATTERN.lastIndex = 0
    let match
    while ((match = METAPHOR_MARKER_PATTERN.exec(narrative)) !== null) {
      hits += 1
      if (firstLine === null) firstLine = lineNo
      const sample = sentenceAround(narrative, match.index)
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample)
    }

    METAPHOR_LIKE_PHRASE_PATTERN.lastIndex = 0
    while ((match = METAPHOR_LIKE_PHRASE_PATTERN.exec(narrative)) !== null) {
      const prefix = narrative.slice(Math.max(0, match.index - 8), match.index)
      if (/好像|像是|像|仿佛|宛如|如同|犹如/.test(prefix)) continue
      hits += 1
      if (firstLine === null) firstLine = lineNo
      const sample = sentenceAround(narrative, match.index)
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample)
    }
  }

  if (narrativeChars === 0 || hits < METAPHOR_DENSITY_MIN_HITS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < METAPHOR_DENSITY_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'metaphor-density-tic',
      severity: 'advisory',
      message: `比喻密度过高：像/好像/仿佛/如同等比喻标记 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留最有叙事功能的少数比喻，其余回到具体动作、物件、声音或后果，不要换成新比喻。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findReasoningChainTic(proseLines) {
  let hits = 0
  let coreHits = 0
  let narrativeChars = 0
  let firstLine = null
  const samples = []
  const buckets = new Set()

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue
    const narrative = stripQuoted(trimmed)
    narrativeChars += visibleLength(narrative)

    for (const { pattern, key, core } of REASONING_CHAIN_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1
        if (core) coreHits += 1
        buckets.add(key)
        if (firstLine === null) firstLine = lineNo
        const sample = compact(match[0])
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample)
      }
    }
  }

  if (narrativeChars === 0 || hits < REASONING_CHAIN_MIN_HITS) return []
  if (coreHits < REASONING_CHAIN_CORE_MIN_HITS || buckets.size < REASONING_CHAIN_MIN_BUCKETS) return []
  const perKilo = (hits / narrativeChars) * 1000
  if (perKilo < REASONING_CHAIN_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'reasoning-chain-tic',
      severity: 'advisory',
      message: `解释链密度过高：知道/明白/这意味着/必须/需要等判断链 ${hits} 处（${perKilo.toFixed(1)}/千字）；像逻辑报告时，把判断落到角色当下可见的动作、物件、对话和现场反馈。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findNoticeFormalityTic(proseLines) {
  let hits = 0
  let noticeChars = 0
  let noticeLines = 0
  let coreHits = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!/^【[^】]+】$/.test(trimmed)) continue
    noticeLines += 1
    noticeChars += visibleLength(trimmed)

    NOTICE_FORMAL_CORE_PATTERN.lastIndex = 0
    while (NOTICE_FORMAL_CORE_PATTERN.exec(trimmed) !== null) coreHits += 1

    for (const pattern of NOTICE_FORMAL_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(trimmed)) !== null) {
        hits += 1
        if (firstLine === null) firstLine = lineNo
        const sample = compact(match[0])
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample)
      }
    }
  }

  if (
    noticeLines < NOTICE_FORMAL_MIN_LINES ||
    noticeChars === 0 ||
    hits < NOTICE_FORMAL_MIN_HITS ||
    coreHits < NOTICE_FORMAL_CORE_MIN_HITS
  )
    return []
  const perKilo = (hits / noticeChars) * 1000
  if (perKilo < NOTICE_FORMAL_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'system-notice-formality-tic',
      severity: 'advisory',
      message: `系统公告公文腔过密：方括号规则行中硬规则词 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留为角色看见的屏幕/公告/规则载体，只在载体内部白话化部分硬词，或补角色当场看懂的具体后果，不改成叙述者解释。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findOvercompressedProseTic(proseLines) {
  let narrativeChars = 0
  let narrativeParas = 0
  let shortParas = 0
  let particles = 0
  let firstLine = null
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed) || /^【[^】]+】$/.test(trimmed)) continue
    const narrative = stripQuoted(trimmed).trim()
    const len = visibleLength(narrative)
    if (len === 0) continue

    if (firstLine === null) firstLine = lineNo
    narrativeParas += 1
    narrativeChars += len
    if (len <= OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS) {
      shortParas += 1
      if (samples.length < 6) samples.push(narrative)
    }

    OVERCOMPRESSED_PROSE_PARTICLE_PATTERN.lastIndex = 0
    while (OVERCOMPRESSED_PROSE_PARTICLE_PATTERN.exec(narrative) !== null) particles += 1
  }

  if (narrativeChars < OVERCOMPRESSED_PROSE_MIN_CHARS || narrativeParas < OVERCOMPRESSED_PROSE_MIN_PARAS)
    return []
  const shortRatio = shortParas / narrativeParas
  if (shortRatio < OVERCOMPRESSED_PROSE_SHORT_RATIO) return []
  const particlePerKilo = (particles / narrativeChars) * 1000
  if (particlePerKilo >= OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'overcompressed-prose-tic',
      severity: 'advisory',
      message: `过度精炼短段：叙述段 ${narrativeParas} 个，其中 ${shortParas} 个≤${OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS}字（${(shortRatio * 100).toFixed(0)}%），自然连接 ${particlePerKilo.toFixed(1)}/千字偏少；先通读判断，确有提纲感再补断裂处和必要结构虚词，有意短镜头可留，别机械注水。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findLowConnectiveDensityTic(proseLines) {
  let bodyChars = 0
  let functionHits = 0
  let plainHits = 0
  let firstLine = null
  const sentences = []
  const samples = []

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue

    const narrative = stripQuoted(trimmed).trim()
    const narrativeLen = visibleLength(narrative)
    if (narrativeLen === 0) continue

    if (firstLine === null) firstLine = lineNo
    bodyChars += narrativeLen
    functionHits += countTerms(narrative, LOW_CONNECTIVE_FUNCTION_TERMS)
    plainHits += countTerms(narrative, LOW_CONNECTIVE_PLAIN_TERMS)

    for (const sentence of splitSentences(narrative)) {
      const len = visibleLength(sentence)
      if (len === 0) continue
      sentences.push(len)
      if (len <= 12 && samples.length < 6) samples.push(sentence)
    }
  }

  if (bodyChars < LOW_CONNECTIVE_MIN_CHARS || sentences.length === 0) return []
  const functionPerKilo = (functionHits / bodyChars) * 1000
  if (functionPerKilo >= LOW_CONNECTIVE_FUNCTION_PER_KILO) return []
  const plainPerKilo = (plainHits / bodyChars) * 1000
  if (plainPerKilo >= LOW_CONNECTIVE_PLAIN_PER_KILO) return []
  const longSentenceRatio =
    sentences.filter((len) => len >= LOW_CONNECTIVE_LONG_SENTENCE_CHARS).length / sentences.length
  if (longSentenceRatio >= LOW_CONNECTIVE_LONG_SENTENCE_RATIO) return []

  return [
    {
      line: firstLine,
      column: 1,
      type: 'low-connective-density-tic',
      severity: 'advisory',
      message: `低连接密度：引号外叙述功能词 ${functionPerKilo.toFixed(1)}/千字、白话连接 ${plainPerKilo.toFixed(1)}/千字，且≥${LOW_CONNECTIVE_LONG_SENTENCE_CHARS}字承接句仅 ${(longSentenceRatio * 100).toFixed(0)}%；容易像提纲/电报体。通读后补必要连接和中长句群，别机械注水。`,
      excerpt: compact(samples.join(' | '))
    }
  ]
}

function findPeriodStutter(proseLines) {
  const findings = []
  let runLen = 0
  let runStartLine = null
  let runSample = []

  const flush = () => {
    if (runLen >= STUTTER_MIN_RUN) {
      findings.push({
        line: runStartLine,
        column: 1,
        type: 'period-stutter',
        severity: 'advisory',
        message: `碎句号：连续 ${runLen} 个短句无呼吸；按目标句长把碎句合并成中长句、补回画面与连接（见本 skill 句长/疏密节奏规则）。`,
        excerpt: compact(runSample.join(' '))
      })
    }
    runLen = 0
    runStartLine = null
    runSample = []
  }

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim()
    if (!trimmed) continue
    if (isDivider(trimmed) || isStructural(trimmed)) {
      flush()
      continue
    }
    const narrative = stripQuoted(trimmed)
    if (visibleLength(narrative) === 0) {
      flush()
      continue
    }
    for (const sentence of splitSentences(narrative)) {
      if (visibleLength(sentence) <= STUTTER_MAX_SENTENCE) {
        if (runLen === 0) runStartLine = lineNo
        runLen += 1
        if (runSample.length < 6) runSample.push(sentence)
      } else {
        flush()
      }
    }
  }
  flush()
  return findings
}

function isDivider(trimmed) {
  return /^-{3,}$/.test(trimmed) || /^[*_]{3,}$/.test(trimmed)
}

function isStructural(trimmed) {
  return (
    /^(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed) ||
    /^第[零一二三四五六七八九十百千万\d]+章(?:\s|_|$)/.test(trimmed)
  )
}

function stripQuoted(text) {
  let out = text
  for (const src of QUOTE_SOURCES) out = out.replace(new RegExp(src, 'g'), '')
  return out
}

function maskQuoted(text) {
  let out = text
  for (const src of QUOTE_SOURCES) {
    out = out.replace(new RegExp(src, 'g'), (m) => '？'.repeat(m.length))
  }
  return out
}

function quotedRanges(text) {
  const ranges = []
  for (const src of QUOTE_SOURCES) {
    const re = new RegExp(src, 'g')
    let match
    while ((match = re.exec(text)) !== null) ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

function insideRanges(pos, ranges) {
  return ranges.some(([start, end]) => pos >= start && pos < end)
}

function splitSentences(trimmed) {
  return trimmed
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function sentenceAround(text, index) {
  let start = index
  while (start > 0 && !STOP_CHARS.has(text[start - 1])) start -= 1
  let end = index
  while (end < text.length && !STOP_CHARS.has(text[end])) end += 1
  return compact(text.slice(start, end).trim())
}

function visibleLength(sentence) {
  const matched = sentence.match(/[一-鿿Ａ-ｚA-Za-z0-9]/g)
  return matched ? matched.length : 0
}

function countTerms(text, terms) {
  let count = 0
  for (const term of terms) {
    let index = text.indexOf(term)
    while (index !== -1) {
      count += 1
      index = text.indexOf(term, index + term.length)
    }
  }
  return count
}

function parseFenceMarker(trimmedLine) {
  const match = /^(?:`{3,}|~{3,})/.exec(trimmedLine)
  if (!match) return null
  return { char: match[0][0], length: match[0].length }
}

function hasYamlFrontMatter(lines) {
  if (!lines[0] || lines[0].trim() !== '---') return false
  let sawYamlField = false
  for (let i = 1; i < Math.min(lines.length, 40); i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed === '---') return sawYamlField
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawYamlField = true
  }
  return false
}

function scanBlock(block) {
  const text = block.map((entry) => entry.text).join('\n')
  const lineStarts = []
  let cursor = 0

  for (const entry of block) {
    lineStarts.push({ offset: cursor, lineNo: entry.lineNo })
    cursor += entry.text.length + 1
  }

  return findNotIsComparisons(text, (offset) => positionForOffset(lineStarts, offset))
}

function positionForOffset(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const current = lineStarts[mid]
    const next = lineStarts[mid + 1]

    if (offset < current.offset) {
      high = mid - 1
    } else if (next && offset >= next.offset) {
      low = mid + 1
    } else {
      return {
        line: current.lineNo,
        column: offset - current.offset + 1
      }
    }
  }

  return { line: lineStarts[0].lineNo, column: 1 }
}

function findNotIsComparisons(text, getPosition) {
  const findings = []
  const quoted = quotedRanges(text)
  let offset = 0

  while (offset < text.length) {
    const start = text.indexOf('不是', offset)
    if (start === -1) break

    if (insideRanges(start, quoted)) {
      offset = start + 2
      continue
    }

    if (start > 0 && text[start - 1] === '是') {
      offset = start + 2
      continue
    }

    const candidate = text.slice(start)
    const markerEnd = findPositiveFlipEnd(candidate)

    if (markerEnd === -1) {
      offset = start + 2
      continue
    }

    const raw = trimTrailingNoise(extractFinding(candidate, markerEnd))
    if (raw.length >= 4) {
      const position = getPosition(start)
      findings.push({
        line: position.line,
        column: position.column,
        type: 'not-is-comparison',
        severity: 'blocking',
        message: '高频 AI 对比句式；删掉否定铺垫，直接写后项，或改成动作/细节呈现。',
        excerpt: compact(raw)
      })
    }

    offset = start + Math.max(raw.length, 2)
  }

  return findings
}

function findPositiveFlipEnd(candidate) {
  let index = 2
  let scanned = 0
  let crossedSeparator = false

  while (index < candidate.length && scanned <= MAX_NEGATIVE_SPAN) {
    const char = candidate[index]

    if (startsWithAt(candidate, index, '而是')) return index + 2

    if (SOFT_SEPARATORS.has(char)) {
      const next = skipGap(candidate, index + 1)
      if (startsWithAt(candidate, next, '而是')) return next + 2
      if (
        candidate[next] === '是' &&
        !TAG_PARTICLES.has(candidate[next + 1]) &&
        !isAffirmationTagAt(candidate, next)
      )
        return next + 1
      crossedSeparator = true
    }

    if (HARD_SEPARATORS.has(char)) {
      const next = skipGap(candidate, index + 1)
      if (
        candidate[next] === '是' &&
        !TAG_PARTICLES.has(candidate[next + 1]) &&
        !isAffirmationTagAt(candidate, next)
      )
        return next + 1
      if (char !== '.') break
      crossedSeparator = true
    }

    if (STOP_CHARS.has(char)) break

    if (char === '是' && !COMPACT_EITHER_OR_PREV.has(candidate[index - 1]) && !crossedSeparator) {
      return index + 1
    }

    index += 1
    scanned += 1
  }

  return -1
}

function extractFinding(candidate, markerEnd) {
  let end = markerEnd
  const limit = Math.min(candidate.length, markerEnd + MAX_POSITIVE_SPAN)

  while (end < limit) {
    if (STOP_CHARS.has(candidate[end])) break
    end += 1
  }

  return candidate.slice(0, end)
}

function startsWithAt(text, index, needle) {
  return text.slice(index, index + needle.length) === needle
}

function isAffirmationTagAt(text, index) {
  if (text[index] !== '是') return false
  const particle = text[index + 1]
  if (!AFFIRMATION_TAG_PARTICLES.has(particle)) return false
  const boundary = text[index + 2] || ''
  return AFFIRMATION_TAG_BOUNDARY.has(boundary)
}

function skipGap(text, index) {
  while (index < text.length && (isInlineSpace(text[index]) || text[index] === '\n')) index += 1
  return index
}

function isInlineSpace(char) {
  return char === ' ' || char === '\t' || char === '\r'
}

function trimTrailingNoise(text) {
  return text.replace(/[\s|）)】\]]+$/u, '')
}

function compact(text) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}

export default {
  scanAiFlavor,
  hasBlockingFindings,
  summarizeAiFlavorFindings
}

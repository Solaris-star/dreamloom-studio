/**
 * 纯 JavaScript PDF 文本重建算法模块。
 *
 * 不依赖 Vue、不依赖 DOM、不包含 ?url、不直接导入 pdfjs-dist。
 * 可由 Node 脚本直接 import 测试。
 *
 * 输入: PDF.js 的 TextItem 数组(每页一组) + 页面尺寸。
 * 输出: 清洗后的纯文本 + 诊断统计 + warnings。
 *
 * 核心流水线:
 *   TextItem → 行 → 段落 → 页(去页眉页脚/页码/目录)→ 跨页拼接 → 章节候选
 */

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/
const DIGIT_REGEX = /[0-9]/
const PAGE_NUMBER_REGEX = /^(?:[一二三四五六七八九十百千零〇\d]+|[-\s\d]{1,8})$/
const ZH_PAGE_NUMBER_REGEX = /^第\s*([一二三四五六七八九十百千零〇\d]+)\s*[页頁]\s*$/
const TOC_DOTS_REGEX = /[.．·•*\s]{3,}\s*\d+$/

/**
 * 单个 TextItem 的归一化表示。
 * PDF.js 原始 item: { str, transform:[a,b,c,d,e,f], width, height, hasEOL }
 * transform 是 6 元素仿射矩阵 [a, b, c, d, e, f]:
 *   x = e (水平位移), y = f (垂直位移), fontSize ≈ |d| (或 Math.hypot(a,d))
 */
function normalizeItem(rawItem) {
  const str = String(rawItem.str ?? '')
  const t = rawItem.transform || [1, 0, 0, 1, 0, 0]
  const x = Number(t[4]) || 0
  const y = Number(t[5]) || 0
  const fontSize = Math.abs(Number(t[3]) || Number(t[0]) || rawItem.height || 0)
  const width = Number(rawItem.width) || 0
  const height = Number(rawItem.height) || 0
  return {
    str,
    x,
    y,
    fontSize,
    width,
    height,
    endX: x + width,
    hasEOL: Boolean(rawItem.hasEOL),
    raw: rawItem
  }
}

/**
 * 将一页的 TextItem 数组组装成视觉行。
 *
 * 规则:
 *  - PDF.js 通常按阅读顺序给出 items,但同一行可能被拆成多个 item。
 *  - hasEOL 是强换行信号。
 *  - y 差超过动态容差时换行(容差与 fontSize 成比例)。
 *  - x 明显回退(比上一 item 起点小很多)时换行。
 *  - 同一行内按 x 位置和原始顺序拼接。
 */
function itemsToLines(items, pageHeight) {
  if (!Array.isArray(items) || items.length === 0) return []
  const normalized = items.map(normalizeItem).filter((it) => it.str.length > 0)
  if (normalized.length === 0) return []

  const lines = []
  let current = null

  for (const item of normalized) {
    const startNew =
      !current ||
      item.hasEOL ||
      Math.abs(item.y - current.y) > Math.max(2, item.fontSize * 0.5) ||
      (current.endX > item.x && item.x < current.x - Math.max(2, item.fontSize))

    if (startNew) {
      if (current) lines.push(current)
      current = {
        items: [item],
        x: item.x,
        y: item.y,
        endX: item.endX,
        fontSize: item.fontSize,
        yTolerance: Math.max(2, item.fontSize * 0.5)
      }
    } else {
      current.items.push(item)
      current.endX = Math.max(current.endX, item.endX)
    }
  }
  if (current) lines.push(current)

  // 每行的 items 按 x 排序后拼字串
  return lines.map((line) => {
    const sorted = [...line.items].sort((a, b) => a.x - b.x)
    const text = joinItems(sorted)
    return {
      text,
      x: line.x,
      y: line.y,
      endX: line.endX,
      fontSize: line.fontSize,
      width: line.endX - line.x,
      items: line.items
    }
  })
}

/**
 * 拼接同一行的 items。
 * 中文之间不插空格;英文/数字单词间根据 x gap 插空格;标点前不插多余空格。
 */
function joinItems(items) {
  let result = ''
  let prev = null
  for (const item of items) {
    if (prev) {
      const gap = item.x - prev.endX
      const lastChar = result.slice(-1)
      const firstChar = item.str[0] || ''
      const needSpace = shouldInsertSpace(lastChar, firstChar, gap, prev.fontSize)
      if (needSpace) result += ' '
    }
    result += item.str
    prev = item
  }
  return result.replace(/\s+$/g, '')
}

function shouldInsertSpace(prevChar, nextChar, gap, fontSize) {
  if (!prevChar || !nextChar) return false
  // 标点前不插空格
  if (/[，。、；：！？》）】」』,.;:!?)\]]/.test(nextChar)) return false
  if (/[（【「『(]/.test(prevChar)) return false
  const prevIsCJK = CJK_REGEX.test(prevChar)
  const nextIsCJK = CJK_REGEX.test(nextChar)
  // 中文之间不插空格;但 gap 超过 0.2 字宽(约半角空格,常见于章节标题排版)时补一个
  if (prevIsCJK && nextIsCJK) {
    return gap > fontSize * 0.2
  }
  // 中英切换:PDF 排版里通常已有空格,但 gap 明显时补一个
  if (prevIsCJK !== nextIsCJK) {
    return gap > fontSize * 0.15
  }
  // 英文/数字之间:gap 足够大才插
  return gap > fontSize * 0.25
}

/**
 * 把行合并成段落,返回段落数组。
 * 处理硬换行 → 自然段的判定。
 */
function linesToParagraphs(lines, options = {}) {
  if (!lines.length) return []
  const paragraphs = []
  let buffer = []

  const medianFontSize = median(lines.map((l) => l.fontSize)) || 12
  const pageWidth = options.pageWidth || 0
  // 右边界估算:取行 endX 的 90 分位
  const rightBoundary = pageWidth
    ? pageWidth * 0.92
    : quantile(lines.map((l) => l.endX).sort((a, b) => a - b), 0.9) || 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const text = line.text.trim()
    if (!text) {
      // 空白行 → 段落边界
      if (buffer.length) {
        paragraphs.push(buffer.join('\n'))
        buffer = []
      }
      continue
    }

    const isFirstLine = buffer.length === 0
    const prevLine = i > 0 ? lines[i - 1] : null

    const indent = line.x - (prevLine ? prevLine.x : line.x)
    const lineSpacing = prevLine ? Math.abs(line.y - prevLine.y) : medianFontSize
    const prevEndsWithPunct = /[。！？…」』\.\!\?]$/.test(
      (buffer[buffer.length - 1] || '').trim().slice(-1)
    )
    const isChapterLine = isChapterTitleLine(text)
    const prevIsChapter = prevLine && isChapterTitleLine(prevLine.text.trim())

    // 强制新段落的信号
    const startNewParagraph =
      isFirstLine ||
      isChapterLine ||
      (prevIsChapter && !isChapterLine) ||
      // 首行缩进(约一个全角字符)
      indent > medianFontSize * 0.8 ||
      // 行间距明显大于中位行距(1.6 倍)
      lineSpacing > medianFontSize * 1.6

    if (startNewParagraph) {
      if (buffer.length) {
        paragraphs.push(mergeContinuation(buffer, { medianFontSize, rightBoundary }))
        buffer = []
      }
    }

    buffer.push(text)
  }
  if (buffer.length) {
    paragraphs.push(mergeContinuation(buffer, { medianFontSize, rightBoundary }))
  }
  return paragraphs.filter(Boolean)
}

/**
 * 判断一行是否是章节标题。
 */
function isChapterTitleLine(text) {
  const t = String(text || '').trim()
  if (!t || t.length > 90) return false
  return (
    /^第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+[章回节卷集部]/.test(t) ||
    /^卷\s*[0-9０-９零一二三四五六七八九十百千万两〇]+/.test(t) ||
    /^(序章|楔子|引子|尾声|后记|番外)/.test(t) ||
    /^Chapter\s+\d+/i.test(t) ||
    /^CHAPTER\s+\d+/.test(t) ||
    /^\d+\s*[.、]\s*\S+/.test(t)
  )
}

/**
 * 合并续行。
 * 中文续行不插空格;英文续行插一个空格;处理 hyphenation。
 */
function mergeContinuation(lines, options = {}) {
  const { medianFontSize = 12, rightBoundary = 0 } = options
  if (!lines.length) return ''
  let result = lines[0]
  for (let i = 1; i < lines.length; i++) {
    const prev = result
    const next = lines[i]
    const lastChar = prev.slice(-1)
    const firstChar = next[0] || ''

    // 英文断词: prev 以 "xxx-" 结尾,next 以字母开头 → 拼词
    if (/[a-zA-Z]-$/.test(prev) && /^[a-zA-Z]/.test(next)) {
      result = prev.replace(/-$/, '') + next
      continue
    }

    const prevIsCJK = CJK_REGEX.test(lastChar)
    const nextIsCJK = CJK_REGEX.test(firstChar)

    if (prevEndsComplete(prev) || shouldBreakParagraph(prev, next, medianFontSize, rightBoundary)) {
      // 真正的段落结束,保留换行
      result = prev + '\n' + next
    } else if (prevIsCJK && nextIsCJK) {
      // 中文续行:直接拼
      result = prev + next
    } else if (!prevIsCJK && !nextIsCJK) {
      // 英文续行:插空格
      result = prev + ' ' + next
    } else {
      // 中英切换:插空格
      result = prev + ' ' + next
    }
  }
  return result
}

function prevEndsComplete(text) {
  return /[。！？…」』]$/.test(text.trim().slice(-1))
}

function shouldBreakParagraph(prev, next, medianFontSize, rightBoundary) {
  // 如果 prev 明显没到右边界(短行),很可能是段落结束
  // 但诗歌/题记也是短行,这里只做粗判,段落边界判定主要靠 linesToParagraphs 的 indent/spacing
  return false
}

/**
 * 跨页续段:上一页末尾段 + 下一页首段,判断是否合并。
 */
function mergeCrossPage(prevPageLastParagraph, nextPageFirstParagraph, options = {}) {
  if (!prevPageLastParagraph || !nextPageFirstParagraph) {
    return { merged: null, prev: prevPageLastParagraph, next: nextPageFirstParagraph }
  }
  const prev = prevPageLastParagraph
  const next = nextPageFirstParagraph
  const lastChar = prev.slice(-1)
  const firstChar = next[0] || ''

  // 上一段以句末标点结束 → 不合并
  if (/[。！？…」』]/.test(lastChar)) {
    return { merged: null, prev, next }
  }
  // 下一段是章节标题 → 不合并
  if (isChapterTitleLine(next)) {
    return { merged: null, prev, next }
  }
  // 下一段首行缩进 → 不合并(新段落)
  if (options.nextPageFirstIndent && options.nextPageFirstIndent > (options.medianFontSize || 12) * 0.8) {
    return { merged: null, prev, next }
  }

  const prevIsCJK = CJK_REGEX.test(lastChar)
  const nextIsCJK = CJK_REGEX.test(firstChar)
  if (prevIsCJK && nextIsCJK) {
    return { merged: prev + next, prev: null, next: null }
  }
  // 英文断词
  if (/[a-zA-Z]-$/.test(prev) && /^[a-zA-Z]/.test(next)) {
    return { merged: prev.replace(/-$/, '') + next, prev: null, next: null }
  }
  return { merged: prev + ' ' + next, prev: null, next: null }
}

/**
 * 页眉/页脚/页码检测与清理。
 * 候选:每页最前 N 行和最后 N 行。
 * 只删除高置信度的(跨多页重复 或 纯页码)。
 */
function detectHeadersFooters(pages, options = {}) {
  const topN = options.topN || 2
  const bottomN = options.bottomN || 2
  const minRepeatPages = options.minRepeatPages || 3

  const topCandidates = new Map() // normalizedText → Set(pageIndex)
  const bottomCandidates = new Map()

  const pagesWithLines = pages.filter((p) => p.lines && p.lines.length > 0)
  if (pagesWithLines.length < minRepeatPages) {
    return {
      removedHeaderCount: 0,
      removedFooterCount: 0,
      removedPageNumberCount: 0,
      cleanedPages: pages
    }
  }

  for (const page of pagesWithLines) {
    const lines = page.lines
    const topLines = lines.slice(0, topN)
    const bottomLines = lines.slice(-bottomN)
    for (const line of topLines) {
      const key = normalizeHeaderFooter(line.text)
      if (!key) continue
      if (!topCandidates.has(key)) topCandidates.set(key, new Set())
      topCandidates.get(key).add(page.index)
    }
    for (const line of bottomLines) {
      const key = normalizeHeaderFooter(line.text)
      if (!key) continue
      if (!bottomCandidates.has(key)) bottomCandidates.set(key, new Set())
      bottomCandidates.get(key).add(page.index)
    }
  }

  const headerKeys = new Set()
  const footerKeys = new Set()
  const pageNumberKeys = new Set()

  for (const [key, pageSet] of topCandidates) {
    if (pageSet.size >= minRepeatPages) {
      if (isPageNumber(key)) pageNumberKeys.add(key)
      else headerKeys.add(key)
    }
  }
  for (const [key, pageSet] of bottomCandidates) {
    if (pageSet.size >= minRepeatPages) {
      if (isPageNumber(key)) pageNumberKeys.add(key)
      else footerKeys.add(key)
    }
  }

  let removedHeaderCount = 0
  let removedFooterCount = 0
  let removedPageNumberCount = 0

  const cleanedPages = pages.map((page) => {
    if (!page.lines || page.lines.length === 0) return page
    const lines = page.lines
    const newLines = []
    let pageRemovedHeader = 0
    let pageRemovedFooter = 0
    let pageRemovedPageNum = 0

    // 从顶部删
    for (let i = 0; i < Math.min(topN, lines.length); i++) {
      const key = normalizeHeaderFooter(lines[i].text)
      if (headerKeys.has(key)) {
        pageRemovedHeader++
        continue
      }
      if (pageNumberKeys.has(key) || isPageNumber(lines[i].text.trim())) {
        pageRemovedPageNum++
        continue
      }
      newLines.push(lines[i])
    }
    // 中间行直接保留(避免重复处理)
    if (lines.length > topN + bottomN) {
      newLines.push(...lines.slice(topN, lines.length - bottomN))
    }
    // 从底部删
    for (let i = Math.max(topN, lines.length - bottomN); i < lines.length; i++) {
      const key = normalizeHeaderFooter(lines[i].text)
      if (footerKeys.has(key)) {
        pageRemovedFooter++
        continue
      }
      if (pageNumberKeys.has(key) || isPageNumber(lines[i].text.trim())) {
        pageRemovedPageNum++
        continue
      }
      newLines.push(lines[i])
    }

    removedHeaderCount += pageRemovedHeader
    removedFooterCount += pageRemovedFooter
    removedPageNumberCount += pageRemovedPageNum
    return { ...page, lines: newLines }
  })

  return {
    removedHeaderCount,
    removedFooterCount,
    removedPageNumberCount,
    cleanedPages
  }
}

function normalizeHeaderFooter(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60)
}

function isPageNumber(text) {
  const t = String(text || '').trim()
  if (!t || t.length > 12) return false
  if (PAGE_NUMBER_REGEX.test(t) && /\d|零|一|二|三|四|五|六|七|八|九|十/.test(t)) return true
  if (ZH_PAGE_NUMBER_REGEX.test(t)) return true
  return false
}

/**
 * 目录页检测。
 * 高置信度:含"目录"/"Contents" + 多行符合"章节标题 + 点线 + 页码"。
 */
function isTocPage(lines) {
  if (!lines || lines.length < 3) return false
  const allText = lines.map((l) => l.text).join(' ')
  const hasTocKeyword = /目录|目錄|Contents|CONTENTS|目录/.test(allText)
  let tocEntryCount = 0
  for (const line of lines) {
    if (TOC_DOTS_REGEX.test(line.text) || /^第\s*[一二三四五六七八九十百千零〇\d]+[章回节卷]/.test(line.text.trim()) && /\d+$/.test(line.text.trim())) {
      tocEntryCount++
    }
  }
  return hasTocKeyword && tocEntryCount >= 3
}

/**
 * 复杂版式检测:多栏或竖排。
 * 简单启发式:同一页内 x 坐标方差极大,或存在大量 y 相近但 x 跨度大的行。
 */
function detectComplexLayout(lines, pageWidth, pageHeight) {
  if (!lines || lines.length < 10) return false
  const xs = lines.map((l) => l.x).sort((a, b) => a - b)
  const medianX = median(xs) || 0
  // 如果有大量行的 x 明显小于中位 x(左栏)又有大量明显大于(右栏)
  const leftCount = xs.filter((x) => x < medianX - 50).length
  const rightCount = xs.filter((x) => x > medianX + 50).length
  return leftCount > lines.length * 0.2 && rightCount > lines.length * 0.2
}

/**
 * 主入口:把多页 TextItem 数组重建为完整文本。
 *
 * @param {Array} pages - [{ items: TextItem[], width, height, index }]
 * @param {Object} options - { onProgress, signal }
 * @returns {Object} { text, pageCount, textPageCount, skippedPageCount, warnings, stats }
 */
export function rebuildBookText(pages, options = {}) {
  const warnings = []
  const signal = options.signal
  let pageCount = pages.length
  let skippedPageCount = 0
  let textPageCount = 0

  if (!pages.length) {
    return {
      text: '',
      pageCount: 0,
      textPageCount: 0,
      skippedPageCount: 0,
      warnings: ['PDF 中未检测到任何页面'],
      stats: {}
    }
  }

  // Phase 1: 每页 items → lines
  const pageLines = []
  let complexLayoutDetected = false
  for (const page of pages) {
    if (signal?.aborted) throw makeAbortError()
    const lines = itemsToLines(page.items || [], page.height)
    pageLines.push({ ...page, lines })
    if (detectComplexLayout(lines, page.width, page.height)) {
      complexLayoutDetected = true
    }
    if (lines.length === 0) skippedPageCount++
    else textPageCount++
  }

  if (complexLayoutDetected) {
    warnings.push('检测到复杂或多栏排版,部分段落顺序可能需要人工检查。')
  }

  // Phase 2: 目录页过滤
  let tocSkipped = 0
  const contentPages = pageLines.filter((page) => {
    if (isTocPage(page.lines)) {
      tocSkipped++
      skippedPageCount++
      return false
    }
    return true
  })
  if (tocSkipped > 0) {
    warnings.push(`识别到 ${tocSkipped} 页目录,已跳过。`)
  }

  // Phase 3: 页眉页脚页码清理
  const {
    removedHeaderCount,
    removedFooterCount,
    removedPageNumberCount,
    cleanedPages
  } = detectHeadersFooters(contentPages)
  if (removedHeaderCount > 0) {
    warnings.push(`已清理 ${removedHeaderCount} 处重复页眉。`)
  }
  if (removedFooterCount > 0) {
    warnings.push(`已清理 ${removedFooterCount} 处重复页脚。`)
  }
  if (removedPageNumberCount > 0) {
    warnings.push(`已清理 ${removedPageNumberCount} 处页码。`)
  }

  // Phase 4: 每页 lines → paragraphs
  const pageParagraphs = cleanedPages.map((page) => {
    if (signal?.aborted) throw makeAbortError()
    return {
      ...page,
      paragraphs: linesToParagraphs(page.lines, {
        pageWidth: page.width,
        pageHeight: page.height
      })
    }
  })

  // Phase 5: 跨页拼接
  const allParagraphs = []
  for (let i = 0; i < pageParagraphs.length; i++) {
    if (signal?.aborted) throw makeAbortError()
    const page = pageParagraphs[i]
    if (i > 0 && allParagraphs.length > 0 && page.paragraphs.length > 0) {
      const prev = allParagraphs[allParagraphs.length - 1]
      const next = page.paragraphs[0]
      const nextPageFirstLine = page.lines[0]
      const nextIndent = nextPageFirstLine ? nextPageFirstLine.x : 0
      const medianFontSize = median(page.lines.map((l) => l.fontSize)) || 12
      const { merged, prev: newPrev, next: newNext } = mergeCrossPage(prev, next, {
        nextPageFirstIndent: nextIndent,
        medianFontSize
      })
      if (merged) {
        allParagraphs[allParagraphs.length - 1] = merged
        allParagraphs.push(...page.paragraphs.slice(1))
      } else {
        if (newPrev) allParagraphs[allParagraphs.length - 1] = newPrev
        if (newNext) allParagraphs.push(newNext, ...page.paragraphs.slice(1))
        else allParagraphs.push(...page.paragraphs.slice(1))
      }
    } else {
      allParagraphs.push(...page.paragraphs)
    }
  }

  // Phase 6: 空白页 warning
  const emptyPages = pageLines.filter((p) => p.lines.length === 0).length
  if (emptyPages > 0 && emptyPages < pages.length) {
    warnings.push(`有 ${emptyPages} 页未提取到文字,可能是封面、插图或扫描页。`)
  }

  // Phase 7: 扫描件诊断
  const { isScanned, reason } = diagnoseScanned(pages, pageLines)
  if (isScanned) {
    return {
      text: '',
      pageCount,
      textPageCount,
      skippedPageCount,
      warnings: ['未检测到可提取的文字。该文件可能是扫描版或图片型 PDF,当前暂不支持 OCR。'],
      stats: { isScanned: true, reason }
    }
  }

  const text = allParagraphs.join('\n\n')
  return {
    text,
    pageCount,
    textPageCount,
    skippedPageCount,
    warnings,
    stats: {
      removedHeaderCount,
      removedFooterCount,
      removedPageNumberCount,
      tocSkipped,
      emptyPages,
      complexLayoutDetected
    }
  }
}

/**
 * 扫描件综合诊断。
 * 不能只靠单阈值。
 */
function diagnoseScanned(originalPages, pageLines) {
  const total = originalPages.length
  const pagesWithText = pageLines.filter((p) => p.lines.length > 0).length
  const textRatio = total > 0 ? pagesWithText / total : 0

  // 统计所有非空字符
  let totalChars = 0
  for (const page of pageLines) {
    for (const line of page.lines) {
      totalChars += line.text.replace(/\s/g, '').length
    }
  }

  const avgCharsPerPage = total > 0 ? totalChars / total : 0

  // 绝大多数页面都没有 TextItem
  if (pagesWithText === 0) {
    return { isScanned: true, reason: 'all_pages_empty' }
  }
  // 有文字页面比例 < 15% 且总字符量极少
  if (textRatio < 0.15 && totalChars < 100) {
    return { isScanned: true, reason: 'low_text_ratio_and_chars' }
  }
  // 每页平均文字量 < 10 字符(极低)
  if (avgCharsPerPage < 10 && pagesWithText < total * 0.2) {
    return { isScanned: true, reason: 'very_low_avg_chars' }
  }
  return { isScanned: false }
}

/**
 * warnings 去重 + 数量上限。
 */
export function dedupeWarnings(warnings, maxDisplay = 20) {
  if (!Array.isArray(warnings)) return []
  const seen = new Set()
  const result = []
  for (const w of warnings) {
    const text = String(w || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= maxDisplay) break
  }
  return result
}

function makeAbortError() {
  const err = new Error('PDF 解析已取消')
  err.code = 'PDF_PARSE_ABORTED'
  return err
}

// ===== 工具函数 =====

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return 0
  const pos = (sortedArr.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sortedArr[base + 1] !== undefined
    ? sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base])
    : sortedArr[base]
}

/**
 * 导出内部函数供单元测试。
 */
export const __internals__ = {
  normalizeItem,
  itemsToLines,
  joinItems,
  shouldInsertSpace,
  linesToParagraphs,
  mergeContinuation,
  mergeCrossPage,
  detectHeadersFooters,
  normalizeHeaderFooter,
  isPageNumber,
  isTocPage,
  detectComplexLayout,
  isChapterTitleLine,
  diagnoseScanned,
  median,
  quantile
}

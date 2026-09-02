import assert from 'node:assert/strict'

import {
  __internals__,
  dedupeWarnings,
  rebuildBookText,
  rebuildPdfPages
} from '../src/renderer/src/service/pdfTextLayout.js'

const {
  detectComplexLayout,
  detectHeadersFooters,
  isChapterTitleLine,
  isPageNumber,
  itemsToLines,
  joinItems,
  linesToParagraphs,
  mergeContinuation,
  mergeCrossPage,
  shouldInsertSpace
} = __internals__

/**
 * 构造 PDF.js TextItem。
 * transform = [a,b,c,d,e,f]: fontSize≈|d|(t[3]), x=t[4], y=t[5]
 */
function item(str, x, y, fontSize = 12, width = null, extra = {}) {
  const w = width ?? str.length * fontSize
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width: w, height: fontSize, ...extra }
}

function page(items, index = 0, width = 595, height = 842) {
  return { items, width, height, index }
}

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${passed} - ${name}`)
}

console.log('pdf text layout tests')

// 1. 中文标题同行拆分重建:"第"+"1"+"章"+"初见" → "第1章 初见"
test('中文标题同行拆分重建', () => {
  const lines = itemsToLines([
    item('第', 100, 700, 16, 16),
    item('1', 116, 700, 16, 9),
    item('章', 125, 700, 16, 16),
    item('初见', 145, 700, 16, 32)
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, '第1章 初见')
})

// 2. 中文相邻 item 之间不插空格
test('中文之间不插空格', () => {
  const lines = itemsToLines([item('风吹', 100, 700), item('进来', 124, 700)])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, '风吹进来')
})

// 3. 英文按 x gap 插空格
test('英文按 gap 插空格', () => {
  const lines = itemsToLines([item('Hello', 100, 700, 12, 30), item('world', 140, 700, 12, 30)])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].text, 'Hello world')
  // gap 极小时不插
  const tight = joinItems([item('Hel', 100, 700, 12, 20), item('lo', 121, 700, 12, 10)])
  assert.equal(tight, 'Hello')
})

// 4. 标点前不插空格
test('标点前不插空格', () => {
  assert.equal(shouldInsertSpace('说', '，', 8, 12), false)
  assert.equal(joinItems([item('他说', 100, 700), item('，然后走了', 130, 700)]), '他说，然后走了')
})

// 5. 硬换行中文合并为一段
test('硬换行中文合并为段落', () => {
  const paragraphs = linesToParagraphs([
    { text: '风吹进来', x: 100, y: 700, endX: 148, fontSize: 12 },
    { text: '非常柔和', x: 100, y: 685, endX: 148, fontSize: 12 }
  ])
  assert.equal(paragraphs.length, 1)
  assert.equal(paragraphs[0], '风吹进来非常柔和')
})

// 6. 首行缩进触发新段落
test('首行缩进触发新段落', () => {
  const paragraphs = linesToParagraphs([
    { text: '他说完了。', x: 100, y: 700, endX: 160, fontSize: 12 },
    { text: '第二段开头', x: 112, y: 685, endX: 172, fontSize: 12 }
  ])
  assert.equal(paragraphs.length, 2)
  assert.equal(paragraphs[0], '他说完了。')
  assert.equal(paragraphs[1], '第二段开头')
})

// 7. 章节标题行不与正文合并
test('章节标题独立成段', () => {
  assert.equal(isChapterTitleLine('第1章 初见'), true)
  assert.equal(isChapterTitleLine('Chapter 3 Storm'), true)
  assert.equal(isChapterTitleLine('普通正文一行'), false)
  const paragraphs = linesToParagraphs([
    { text: '第1章 初见', x: 100, y: 700, endX: 180, fontSize: 12 },
    { text: '风吹进来', x: 100, y: 685, endX: 148, fontSize: 12 }
  ])
  assert.equal(paragraphs.length, 2)
  assert.equal(paragraphs[0], '第1章 初见')
  assert.equal(paragraphs[1], '风吹进来')
})

// 8. 跨页续段合并:段中截断(无标点结尾)→ 下页首段直接拼接
test('跨页续段合并', () => {
  const result = rebuildBookText([
    page([item('风吹进来', 100, 700), item('带着桂花香', 100, 685)], 0),
    page([item('飘进旧书铺', 100, 700), item('落在柜台上', 100, 685)], 1)
  ])
  // 第一页两行合成一段"风吹进来带着桂花香"(无句末标点),跨页与下页首段合并
  assert.ok(
    result.text.replace(/\n/g, '').includes('带着桂花香飘进旧书铺'),
    `unexpected: ${result.text}`
  )
})

// 9. 上一页段落以句末标点结束 → 不跨页合并
test('句末标点结束不跨页合并', () => {
  const { merged, prev, next } = mergeCrossPage('风吹进来。', '新的段落')
  assert.equal(merged, null)
  assert.equal(prev, '风吹进来。')
  assert.equal(next, '新的段落')
})

// 10. 英文 hyphenation 还原
test('英文断词还原', () => {
  assert.equal(mergeContinuation(['inter-', 'national']), 'international')
  assert.equal(mergeCrossPage('inter-', 'national').merged, 'international')
})

// 11. 跨多页重复页眉删除
test('重复页眉删除', () => {
  const result = rebuildBookText([
    page([item('旧城故事', 100, 780, 10), item('第一页正文内容', 100, 700), item('第一页第二行', 100, 685)], 0),
    page([item('旧城故事', 100, 780, 10), item('第二页正文内容', 100, 700), item('第二页第二行', 100, 685)], 1),
    page([item('旧城故事', 100, 780, 10), item('第三页正文内容', 100, 700), item('第三页第二行', 100, 685)], 2)
  ])
  assert.equal(result.stats.removedHeaderCount, 3)
  assert.ok(!result.text.includes('旧城故事'))
  assert.ok(result.text.includes('第一页正文内容'))
  assert.ok(result.warnings.some((w) => w.includes('页眉')))
})

// 12. 重复页脚删除
test('重复页脚删除', () => {
  const result = rebuildBookText([
    page([item('甲页正文一', 100, 700), item('甲页正文二', 100, 685), item('本书排版制作', 100, 60, 9)], 0),
    page([item('乙页正文一', 100, 700), item('乙页正文二', 100, 685), item('本书排版制作', 100, 60, 9)], 1),
    page([item('丙页正文一', 100, 700), item('丙页正文二', 100, 685), item('本书排版制作', 100, 60, 9)], 2)
  ])
  assert.equal(result.stats.removedFooterCount, 3)
  assert.ok(!result.text.includes('本书排版制作'))
  assert.ok(result.text.includes('乙页正文一'))
})

// 13. 纯页码删除(单次出现也删,因为形态确定)
test('纯页码删除', () => {
  assert.equal(isPageNumber('3'), true)
  assert.equal(isPageNumber('- 3 -'), true)
  assert.equal(isPageNumber('第3页'), true)
  assert.equal(isPageNumber('正文一行不是页码'), false)
  const result = rebuildBookText([
    page([item('甲页正文', 100, 700), item('第二章内容', 100, 685), item('1', 100, 60, 10)], 0),
    page([item('乙页正文', 100, 700), item('继续叙述', 100, 685), item('2', 100, 60, 10)], 1),
    page([item('丙页正文', 100, 700), item('故事继续', 100, 685), item('3', 100, 60, 10)], 2)
  ])
  assert.ok(result.stats.removedPageNumberCount >= 3)
  assert.ok(!/\n3\n|\n3$/.test(result.text))
})

// 14. 只出现一次的顶部短句不是页眉,不删
test('偶然短句不删', () => {
  const pages = [
    { index: 0, lines: [{ text: '作者题记', x: 100 }, { text: '正文开始', x: 100 }, { text: '继续正文', x: 100 }] },
    { index: 1, lines: [{ text: '第二页', x: 100 }, { text: '正文继续', x: 100 }, { text: '更多内容', x: 100 }] },
    { index: 2, lines: [{ text: '第三页', x: 100 }, { text: '正文再续', x: 100 }, { text: '结尾内容', x: 100 }] }
  ]
  const { cleanedPages, removedHeaderCount } = detectHeadersFooters(pages)
  assert.equal(removedHeaderCount, 0)
  assert.ok(cleanedPages[0].lines.some((l) => l.text === '作者题记'))
})

// 15. 目录页识别与跳过
test('目录页过滤', () => {
  const tocPage = page(
    [
      item('目录', 260, 760, 18, 36),
      item('第一章 初见......1', 120, 700, 12, 150),
      item('第二章 再会......12', 120, 680, 12, 150),
      item('第三章 离别......30', 120, 660, 12, 150)
    ],
    0
  )
  const contentPage = page([item('第1章 初见', 100, 700, 16, 96), item('风吹进来', 100, 680)], 1)
  const result = rebuildBookText([tocPage, contentPage])
  assert.equal(result.stats.tocSkipped, 1)
  assert.ok(!result.text.includes('......1'))
  assert.ok(result.text.includes('风吹进来'))
  assert.ok(result.warnings.some((w) => w.includes('目录')))
})

// 16. 空白页产生 warning 但不影响导入
test('空白页 warning', () => {
  const lines = []
  for (let i = 0; i < 5; i += 1) {
    lines.push(item(`第${i}行正文内容比较长一些便于统计`, 100, 700 - i * 15))
  }
  const result = rebuildBookText([page([], 0), page(lines, 1)])
  assert.equal(result.stats.emptyPages, 1)
  assert.ok(result.text.includes('第0行正文内容'))
  assert.ok(result.warnings.some((w) => w.includes('未提取到文字')))
})

// 17. 全扫描件诊断
test('全扫描件诊断', () => {
  const result = rebuildBookText([page([], 0), page([], 1), page([], 2)])
  assert.equal(result.text, '')
  assert.equal(result.stats.isScanned, true)
  assert.ok(result.warnings.some((w) => w.includes('扫描版')))
})

// 18. 部分页无文字 → 仍可导入
test('部分扫描仍可导入', () => {
  const content = []
  for (let i = 0; i < 6; i += 1) {
    content.push(item(`第${i}行正文内容比较长一些便于统计字数`, 100, 700 - i * 15))
  }
  const pages = [page(content, 0), page([], 1), page(content.map((it) => ({ ...it })), 2), page([], 3)]
  const result = rebuildBookText(pages)
  assert.equal(result.stats.isScanned, undefined)
  assert.ok(result.text.includes('第0行正文内容'))
  assert.equal(result.stats.emptyPages, 2)
})

// 19. 多栏排版 warning
test('多栏排版 warning', () => {
  const twoColumnItems = []
  for (let i = 0; i < 12; i += 1) {
    const x = i % 2 === 0 ? 100 : 400
    twoColumnItems.push(item(`栏内容第${i}行`, x, 700 - i * 15))
  }
  assert.equal(detectComplexLayout(
    itemsToLines(twoColumnItems, 842),
    595,
    842
  ), true)
  const result = rebuildBookText([page(twoColumnItems, 0)])
  assert.ok(result.warnings.some((w) => w.includes('多栏') || w.includes('复杂')))
})

// 20. warnings 去重与上限
test('warnings 去重与上限', () => {
  assert.deepEqual(
    dedupeWarnings(['a', 'a', 'b', 'c', 'c', 'd', 'e', 'f'], 5),
    ['a', 'b', 'c', 'd', 'e']
  )
  assert.deepEqual(dedupeWarnings(null), [])
  assert.deepEqual(dedupeWarnings([' ', 'x']), ['x'])
})

// 21. 下一页首段是章节标题 → 不跨页合并
test('章节标题不跨页合并', () => {
  const { merged } = mergeCrossPage('正文还没结束', '第2章 再会')
  assert.equal(merged, null)
  const result = rebuildBookText([
    page([item('正文还没结束', 100, 700)], 0),
    page([item('第2章 再会', 100, 700, 16, 96), item('灯火亮起', 100, 680)], 1)
  ])
  assert.ok(!result.text.includes('正文还没结束第2章'))
  assert.ok(result.text.includes('第2章 再会'))
})

console.log(`pdf text layout tests passed (${passed} cases)`)

// ===== rebuildPdfPages 用例 =====

// P1. 每页严格对应一章,标题第N页
test('rebuildPdfPages 每页对应一章', () => {
  const result = rebuildPdfPages([
    page([item('第一页正文', 100, 700)], 0),
    page([item('第二页正文', 100, 700)], 1),
    page([item('第三页正文', 100, 700)], 2)
  ])
  assert.equal(result.chapters.length, 3)
  assert.deepEqual(
    result.chapters.map((c) => c.title),
    ['第1页', '第2页', '第3页']
  )
  assert.equal(result.pageCount, 3)
  assert.equal(result.textPageCount, 3)
  assert.equal(result.skippedPageCount, 0)
  assert.equal(result.stats.emptyPages, 0)
})

// P2. 空白页保留为第N页空章,页码不偏移
test('rebuildPdfPages 空白页保留为空章', () => {
  const result = rebuildPdfPages([
    page([item('有文字', 100, 700)], 0),
    page([], 1),
    page([item('第二页有文字', 100, 700)], 2)
  ])
  assert.equal(result.chapters.length, 3)
  assert.deepEqual(
    result.chapters.map((c) => c.title),
    ['第1页', '第2页', '第3页']
  )
  assert.equal(result.chapters[1].content, '')
  assert.equal(result.textPageCount, 2)
  assert.equal(result.stats.emptyPages, 1)
  assert.ok(result.warnings.some((w) => w.includes('1 页未提取到文字')))
})

// P3. 不删除页眉页码,内容原样保留
test('rebuildPdfPages 不删除页眉页码', () => {
  const result = rebuildPdfPages([
    page(
      [
        item('页眉:第一章', 100, 800, 10),
        item('正文内容', 100, 700, 12),
        item('— 1 —', 280, 50, 10)
      ],
      0
    )
  ])
  assert.equal(result.chapters.length, 1)
  // 页眉和页码都要保留,不静默丢弃
  assert.ok(result.chapters[0].content.includes('页眉:第一章'))
  assert.ok(result.chapters[0].content.includes('正文内容'))
  assert.ok(result.chapters[0].content.includes('— 1 —'))
})

// P4. 不跨页合并,每页独立
test('rebuildPdfPages 不跨页合并', () => {
  const result = rebuildPdfPages([
    page([item('正文还没结束', 100, 100)], 0),
    page([item('第2章 再会', 100, 700, 16, 96), item('灯火亮起', 100, 680)], 1)
  ])
  assert.equal(result.chapters.length, 2)
  // 两页不合并
  assert.ok(!result.chapters[0].content.includes('第2章 再会'))
  assert.ok(result.chapters[1].content.includes('第2章 再会'))
})

// P5. 空 pages 输入返回空结果
test('rebuildPdfPages 空输入', () => {
  const result = rebuildPdfPages([])
  assert.equal(result.chapters.length, 0)
  assert.equal(result.pageCount, 0)
  assert.equal(result.textPageCount, 0)
  assert.equal(result.text, '')
})

// P6. onProgress 回调按页推进
test('rebuildPdfPages onProgress 推进', () => {
  const progress = []
  rebuildPdfPages(
    [page([item('a', 100, 700)], 0), page([item('b', 100, 700)], 1)],
    { onProgress: (p) => progress.push(p) }
  )
  assert.equal(progress.length, 2)
  assert.equal(progress[0].current, 1)
  assert.equal(progress[1].current, 2)
})

console.log(`pdf rebuildPdfPages tests passed (${passed} cases)`)

import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5188'
const OUT = join(process.cwd(), 'reports/acceptance/screenshots-ui')
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '430x932', width: 430, height: 932 },
  { name: '1440x900', width: 1440, height: 900 }
]

const findings = []
function note(level, area, message, extra = {}) {
  findings.push({ level, area, message, ...extra })
  console.log(`[${level}] ${area}: ${message}`)
}

async function mockAuth(page) {
  for (const pattern of ['**/api/auth/status', '**/api/bookshelf-auth/status']) {
    await page.route(pattern, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, authenticated: true, passwordConfigured: false })
      })
    })
  }
}

async function createBook(request, name) {
  await request.post(`${BASE}/api/books/delete`, { data: { name } }).catch(() => {})
  const created = await request.post(`${BASE}/api/books/create`, {
    data: {
      name,
      intro: 'UI 验收书',
      type: 'xuanhuan',
      typeName: '玄幻',
      bookRole: 'original'
    }
  })
  const json = await created.json().catch(() => ({}))
  await request.post(`${BASE}/api/chapters/save`, {
    data: {
      bookName: name,
      volumeName: '正文',
      chapterName: '第1章',
      content: '林川走在青石长街上，夜雨落在旧书铺门前。不要剧透。'
    }
  })
  // seed banned word
  await request.post(`${BASE}/api/banned-words/add`, {
    data: { bookName: name, word: '剧透' }
  }).catch(async () => {
    // fallback path variants
    await request.post(`${BASE}/api/editor/banned-words/add`, {
      data: { bookName: name, word: '剧透' }
    }).catch(() => {})
  })
  return json
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    const horizontalOverflow = docWidth > viewportWidth + 2
    const texts = Array.from(document.querySelectorAll('h1,h2,h3,button,a,label,span,p'))
      .filter((el) => {
        const t = (el.textContent || '').trim()
        if (!t || t.length < 2) return false
        // crude english mixed check for zh locale
        return /^[A-Za-z][A-Za-z0-9 _/\-]{2,}$/.test(t) && !/API|AI|DLS|Token|URL|HTTP|JSON|ID/.test(t)
      })
      .map((el) => (el.textContent || '').trim())
      .slice(0, 30)
    const overlaps = []
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], .el-button')
    ).slice(0, 200)
    const rects = candidates
      .map((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return null
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)
          return null
        return { el, r, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) }
      })
      .filter(Boolean)
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
        const overlapY = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        if (overlapX > 8 && overlapY > 8) {
          const areaA = a.r.width * a.r.height
          const areaB = b.r.width * b.r.height
          const overlapArea = overlapX * overlapY
          if (overlapArea > Math.min(areaA, areaB) * 0.6) {
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue
            overlaps.push({ a: a.label, b: b.label })
          }
        }
      }
    }
    return {
      horizontalOverflow,
      docWidth,
      viewportWidth,
      englishish: texts,
      overlaps: overlaps.slice(0, 20)
    }
  })
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await mockAuth(page)
  const request = context.request

  const bookName = 'UI验收创作台'
  await createBook(request, bookName)

  // 1/3 Home + AI settings chinese
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const homeText = await page.locator('body').innerText()
  if (/创作起笔|AI 服务|模型|提示词|首页/.test(homeText)) {
    note('PASS', '中文首页', '首页主文案为中文')
  } else {
    note('P2', '中文首页', '首页主文案疑似缺失中文')
  }
  if (/\bSettings\b|\bDashboard\b|\bCreate\b|\bGenerate\b/.test(homeText)) {
    note('P2', '中文混杂', '首页仍有明显英文词', { sample: homeText.match(/\b[A-Z][a-z]+\b/g)?.slice(0, 10) })
  }
  await page.screenshot({ path: join(OUT, 'home-1440.png'), fullPage: true })

  await page.goto(`${BASE}/#/settings/models`, { waitUntil: 'networkidle' }).catch(async () => {
    await page.goto(`${BASE}/#/settings/general`, { waitUntil: 'networkidle' })
  })
  await page.waitForTimeout(500)
  const settingsText = await page.locator('body').innerText()
  if (/系统设置|模型|服务|保存|版本/.test(settingsText)) {
    note('PASS', 'AI设置中文', '设置页中文正常')
  } else {
    note('P2', 'AI设置中文', '设置页中文不足')
  }
  await page.screenshot({ path: join(OUT, 'settings-1440.png'), fullPage: true })

  // 4 nav collapse icon only
  await page.goto(`${BASE}/#/knowledge`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const collapseBtn = page.getByRole('button', { name: /收起侧栏|展开侧栏|收起|展开/ }).first()
  if (await collapseBtn.count()) {
    const before = await page.locator('.app-sidebar').evaluate((el) => el.className)
    await collapseBtn.click().catch(() => {})
    await page.waitForTimeout(300)
    const collapsed = await page.locator('.app-sidebar.collapsed').count()
    const labelsHidden = await page.locator('.app-sidebar.collapsed .app-menu-label').evaluateAll((els) =>
      els.every((el) => getComputedStyle(el).display === 'none')
    )
    if (collapsed > 0 && labelsHidden) note('PASS', '导航收缩', '收缩后仅显示 icon（label display:none）')
    else note('P2', '导航收缩', '收缩态未确认只显示 icon', { before, collapsed, labelsHidden })
  } else {
    note('P2', '导航收缩', '未找到收起侧栏按钮')
  }
  await page.screenshot({ path: join(OUT, 'bookshelf-collapsed-1440.png'), fullPage: true })

  // 5 bookshelf import/export/download
  const bookshelfText = await page.locator('body').innerText()
  const hasImport = /导入|本地文件导入|下载小说|下载书籍/.test(bookshelfText)
  await page.goto(`${BASE}/#/import-export/import`, { waitUntil: 'networkidle' })
  const ieText = await page.locator('body').innerText()
  const hasExport = /导出|备份|导入/.test(ieText)
  await page.goto(`${BASE}/#/novel-download?name=${encodeURIComponent(bookName)}`, {
    waitUntil: 'networkidle'
  })
  const dlText = await page.locator('body').innerText()
  const hasDownload = /小说下载|书源|下载/.test(dlText)
  if (hasImport && hasExport && hasDownload) {
    note('PASS', '书架能力', '导入/导出/小说下载入口可用')
  } else {
    note('P1', '书架能力', '导入/导出/下载入口不完整', { hasImport, hasExport, hasDownload })
  }

  // 6 market fake data
  await page.goto(`${BASE}/#/market/overview`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const marketText = await page.locator('body').innerText()
  const hasExampleLabel =
    /示例内容|【示例】|不是实时市场数据|非实时示例|暂无真实市场数据/.test(marketText)
  const fakeScoreWithoutLabel =
    /机会指数|热度|销量|评价/.test(marketText) && !hasExampleLabel && /9[0-9]|100/.test(marketText)
  if (hasExampleLabel || /刷新|创建灵感/.test(marketText)) {
    note('PASS', '市场灵感', hasExampleLabel ? '空/示例态有明确标注，非伪造实时' : '页面可访问，待有数据时再验')
  }
  if (fakeScoreWithoutLabel) note('P1', '市场灵感', '疑似展示未标注的伪造热度/分数')
  await page.screenshot({ path: join(OUT, 'market-1440.png'), fullPage: true })

  // 10 legacy routes
  for (const [from, expectPath] of [
    ['/#/market-inspiration', /#\/market\/overview/],
    ['/#/knowledge-library', /#\/knowledge/],
    ['/#/creative-library', /#\/knowledge/]
  ]) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    const url = page.url()
    if (expectPath.test(url)) note('PASS', '旧路由', `${from} -> ${url}`)
    else note('P1', '旧路由', `${from} 未正确重定向`, { url })
  }

  // 2 editor theme + character/banned highlights + floating assistant
  await page.goto(
    `${BASE}/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`,
    { waitUntil: 'networkidle' }
  )
  await page.waitForTimeout(1200)
  const hasProse = (await page.locator('.ProseMirror').count()) > 0
  if (!hasProse) note('P0', '创作台', '编辑器未出现 .ProseMirror')
  else note('PASS', '创作台', '编辑器 ProseMirror 已加载')

  // theme switch if present
  const themeBtn = page.getByTestId('editor-theme')
  if (await themeBtn.count()) {
    await themeBtn.click().catch(() => {})
    await page.waitForTimeout(200)
    const option = page.locator('[data-theme-option]').first()
    if (await option.count()) {
      const key = await option.getAttribute('data-theme-option')
      await option.click()
      await page.waitForTimeout(300)
      const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim())
      if (bg) note('PASS', '主题', `切换主题后 --bg-primary=${bg}`, { key })
      else note('P2', '主题', '切换主题后 CSS 变量为空')
    } else {
      note('P2', '主题', '主题下拉无选项')
    }
  } else {
    note('P2', '主题', '未找到编辑器主题切换控件')
  }

  // enable character + banned hints
  const charSwitch = page.locator('.character-highlight-switch').first()
  const banSwitch = page.locator('.banned-words-hint-switch').first()
  if (await charSwitch.count()) {
    await charSwitch.click({ force: true }).catch(() => {})
  }
  if (await banSwitch.count()) {
    await banSwitch.click({ force: true }).catch(() => {})
  }
  await page.waitForTimeout(800)
  const charDeco = await page.locator('.character-hint-decoration, [data-text-hint="character"]').count()
  const banDeco = await page.locator('.banned-word-decoration, [data-text-hint="banned-word"]').count()
  if (charDeco > 0) note('PASS', '人物高亮', `检测到 ${charDeco} 处人物高亮装饰`)
  else note('P1', '人物高亮', '开启后未检测到人物高亮装饰（可能缺角色名数据）')
  if (banDeco > 0) note('PASS', '禁词提示', `检测到 ${banDeco} 处禁词装饰`)
  else note('P1', '禁词提示', '开启后未检测到禁词装饰')

  // floating assistant drag/snap/persist
  const float = page.getByTestId('editor-floating-assistant')
  const handle = page.getByTestId('editor-floating-drag-handle')
  if ((await float.count()) && (await handle.count())) {
    const before = await float.boundingBox()
    const box = await handle.boundingBox()
    if (box && before) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(40, before.y + 40, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const after = await float.boundingBox()
      const stored = await page.evaluate(() => localStorage.getItem('dreamloom.editor.floatingAssistant.position.v1'))
      if (after && Math.abs(after.x - before.x) > 10) note('PASS', '悬浮助手', '可拖拽并移动位置')
      else note('P1', '悬浮助手', '拖拽后位置未明显变化')
      if (stored) {
        note('PASS', '悬浮助手', '位置已写入 localStorage')
        const parsed = JSON.parse(stored)
        if (parsed.side === 'left' || parsed.x <= 40) note('PASS', '悬浮助手', '吸附到左侧')
      } else {
        note('P1', '悬浮助手', '拖拽后未保存位置')
      }
      // reload persist
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      const stored2 = await page.evaluate(() => localStorage.getItem('dreamloom.editor.floatingAssistant.position.v1'))
      if (stored2) note('PASS', '悬浮助手', '刷新后位置仍保留')
      else note('P1', '悬浮助手', '刷新后位置丢失')
    }
  } else {
    note('P1', '悬浮助手', '未找到悬浮助手/拖动手柄')
  }
  await page.screenshot({ path: join(OUT, 'editor-1440.png'), fullPage: true })

  // multi-viewport screenshots + layout + axe (subset)
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const route of [
      { key: 'home', path: '/#/dashboard' },
      { key: 'bookshelf', path: '/#/knowledge' },
      { key: 'market', path: '/#/market/overview' },
      { key: 'settings', path: '/#/settings/general' },
      {
        key: 'editor',
        path: `/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`
      }
    ]) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      const shot = join(OUT, `${route.key}-${vp.name}.png`)
      await page.screenshot({ path: shot, fullPage: true })
      const layout = await collectLayout(page)
      if (layout.horizontalOverflow) {
        note('P1', '布局溢出', `${route.key}@${vp.name} 横向溢出`, layout)
      }
      if (layout.overlaps.length > 8) {
        note('P1', '按钮重叠', `${route.key}@${vp.name} 可疑重叠 ${layout.overlaps.length}`, {
          sample: layout.overlaps.slice(0, 5)
        })
      }
      if (layout.englishish.length > 8) {
        note('P2', '英文混杂', `${route.key}@${vp.name} 明显英文片段偏多`, {
          sample: layout.englishish.slice(0, 10)
        })
      }
      if (route.key === 'home' || route.key === 'editor') {
        try {
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
          const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
          if (critical.length) {
            note('P2', 'Axe', `${route.key}@${vp.name} ${critical.length} serious/critical`, {
              ids: critical.map((v) => v.id)
            })
          } else {
            note('PASS', 'Axe', `${route.key}@${vp.name} 无 serious/critical`)
          }
        } catch (error) {
          note('P3', 'Axe', `${route.key}@${vp.name} 分析失败: ${error.message}`)
        }
      }
    }
  }

  // performance trace on editor
  await page.setViewportSize({ width: 1440, height: 900 })
  await context.tracing.start({ screenshots: true, snapshots: true })
  const t0 = Date.now()
  await page.goto(
    `${BASE}/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`,
    { waitUntil: 'networkidle' }
  )
  await page.waitForTimeout(1000)
  const t1 = Date.now()
  await context.tracing.stop({ path: join(OUT, 'editor-performance-trace.zip') })
  note('PASS', 'Performance', `创作台加载约 ${t1 - t0}ms，trace 已保存`)

  // tab switch duplicate request probe
  const counts = {}
  page.on('request', (req) => {
    const u = req.url()
    if (!u.includes('/api/')) return
    const key = u.replace(BASE, '').split('?')[0]
    counts[key] = (counts[key] || 0) + 1
  })
  await page.goto(`${BASE}/#/knowledge`, { waitUntil: 'networkidle' })
  await page.goto(`${BASE}/#/knowledge/materials`, { waitUntil: 'networkidle' })
  await page.goto(`${BASE}/#/knowledge`, { waitUntil: 'networkidle' })
  await page.goto(`${BASE}/#/knowledge/materials`, { waitUntil: 'networkidle' })
  const hot = Object.entries(counts)
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (hot.length) note('P2', '重复请求', 'tab 往返出现较高频 API', { hot })
  else note('PASS', '重复请求', 'tab 往返未观察到异常高频重复')

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    bookName,
    findings,
    summary: {
      P0: findings.filter((f) => f.level === 'P0').length,
      P1: findings.filter((f) => f.level === 'P1').length,
      P2: findings.filter((f) => f.level === 'P2').length,
      P3: findings.filter((f) => f.level === 'P3').length,
      PASS: findings.filter((f) => f.level === 'PASS').length
    }
  }
  writeFileSync(join(OUT, 'ui-check-findings.json'), JSON.stringify(report, null, 2))
  writeFileSync(
    join(process.cwd(), 'reports/acceptance/UI-INTERACTION-ACCEPTANCE.md'),
    renderMarkdown(report)
  )
  console.log('\nSUMMARY', report.summary)
  await browser.close()
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# 创作台界面与交互验收报告')
  lines.push('')
  lines.push(`- 时间：${report.generatedAt}`)
  lines.push(`- 服务：${report.base}`)
  lines.push(`- 验收书：${report.bookName}`)
  lines.push('')
  lines.push('## 结果汇总')
  lines.push('')
  lines.push('| 级别 | 数量 |')
  lines.push('| --- | ---: |')
  for (const k of ['P0', 'P1', 'P2', 'P3', 'PASS']) {
    lines.push(`| ${k} | ${report.summary[k] || 0} |`)
  }
  lines.push('')
  lines.push('## 发现项')
  lines.push('')
  for (const f of report.findings) {
    lines.push(`- **${f.level}** 〔${f.area}〕 ${f.message}`)
  }
  lines.push('')
  lines.push('## 截图')
  lines.push('')
  lines.push('- `reports/acceptance/screenshots-ui/`')
  lines.push('- performance trace: `reports/acceptance/screenshots-ui/editor-performance-trace.zip`')
  lines.push('')
  return lines.join('\n')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

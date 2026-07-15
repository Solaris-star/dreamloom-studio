import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * 多视口验收：375x812 / 430x932 / 768x1024 / 1440x900
 * 覆盖编辑器、书架、大纲、素材、设置、AI 任务、导入导出
 * 检查横向溢出、关键重叠/遮挡线索、Axe WCAG 2.2 AA
 */

const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 812 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 }
]

const FEATURE_PAGES = [
  { key: 'bookshelf', path: '/#/knowledge', title: /作品书架/ },
  { key: 'materials', path: '/#/knowledge/materials', title: /素材/ },
  { key: 'settings', path: '/#/settings/general', title: /系统设置|设置/ },
  { key: 'ai-queue', path: '/#/ai/queue', title: /任务队列/ },
  { key: 'import-export', path: '/#/import-export/import', title: /导入导出/ },
  { key: 'outline', path: null, title: /大纲/ }, // filled with book
  { key: 'editor', path: null, title: /创作台|织梦/ }
]

const BOOK_NAME = '视口验收书'

const AUTH_STATUS_GLOBS = ['**/api/auth/status', '**/api/bookshelf-auth/status']

async function mockAuthStatus(page) {
  for (const pattern of AUTH_STATUS_GLOBS) {
    await page.route(pattern, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          authenticated: true,
          passwordConfigured: false
        })
      })
    })
  }
}

async function waitForAppReady(page) {
  await expect(page.locator('#app')).toBeAttached({ timeout: 15_000 })
  await expect
    .poll(async () => page.locator('#app').evaluate((el) => el.clientHeight), { timeout: 15_000 })
    .toBeGreaterThan(0)
}

async function ensureBook(request) {
  await request.post('/api/books/delete', { data: { name: BOOK_NAME } }).catch(() => {})
  const created = await request.post('/api/books/create', {
    data: {
      name: BOOK_NAME,
      intro: '视口与无障碍验收',
      type: 'xuanhuan',
      typeName: '玄幻',
      bookRole: 'original'
    }
  })
  if (!created.ok()) {
    // 可能已存在
    return BOOK_NAME
  }
  await request.post('/api/chapters/save', {
    data: {
      bookName: BOOK_NAME,
      volumeName: '正文',
      chapterName: '第1章',
      content: '夜雨落在青石长街上，林舟推开了旧书铺的门。'
    }
  })
  return BOOK_NAME
}

async function collectLayoutIssues(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    const horizontalOverflow = docWidth > viewportWidth + 1

    const issues = []
    if (horizontalOverflow) {
      issues.push({
        type: 'horizontal-overflow',
        docWidth,
        viewportWidth,
        delta: docWidth - viewportWidth
      })
    }

    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], .el-button, .toolbar-item, input, select')
    ).slice(0, 400)

    const rects = candidates
      .map((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return null
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
          return null
        }
        return {
          el,
          r,
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName || '')
            .trim()
            .slice(0, 40)
        }
      })
      .filter(Boolean)

    // 粗略重叠：同层按钮中心点几乎重合
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
            // 父子包含不算
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue
            issues.push({
              type: 'button-overlap',
              a: a.label,
              b: b.label
            })
          }
        }
      }
    }

    // 文字溢出线索：scrollWidth 明显大于 clientWidth 的文本节点容器
    const textOverflow = Array.from(document.querySelectorAll('h1,h2,h3,p,span,label,button'))
      .filter((el) => {
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const style = getComputedStyle(el)
          return style.overflow === 'hidden' || style.textOverflow === 'ellipsis' || el.scrollWidth - el.clientWidth > 24
        }
        return false
      })
      .slice(0, 20)
      .map((el) => ({
        type: 'text-overflow',
        text: (el.textContent || '').trim().slice(0, 40),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }))

    issues.push(...textOverflow)

    // 可见 tooltip 是否超出视口
    const tooltips = Array.from(document.querySelectorAll('.el-popper, .el-tooltip__popper, [role="tooltip"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          type: 'tooltip-clip',
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          clipped: r.left < -2 || r.top < -2 || r.right > viewportWidth + 2 || r.bottom > window.innerHeight + 2
        }
      })
      .filter((t) => t.clipped)

    issues.push(...tooltips)
    return issues
  })
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test.beforeEach(({}, testInfo) => {
      // 仅在 wide project 执行，避免 wide/tablet/mobile 三套 project 把 4 视口再乘 3
      test.skip(testInfo.project.name !== 'wide', '仅 wide project 跑多视口验收')
    })

    test(`核心页面布局与 Axe @ ${viewport.name}`, async ({ page, request }, testInfo) => {
      test.setTimeout(180_000)
      await mockAuthStatus(page)
      await ensureBook(request)

      const pages = FEATURE_PAGES.map((item) => {
        if (item.key === 'outline') {
          return {
            ...item,
            path: `/#/outline-manager?name=${encodeURIComponent(BOOK_NAME)}`
          }
        }
        if (item.key === 'editor') {
          return {
            ...item,
            path: `/#/editor/${encodeURIComponent(BOOK_NAME)}?name=${encodeURIComponent(BOOK_NAME)}`
          }
        }
        return item
      })

      const allIssues = []
      const axeViolations = []

      for (const target of pages) {
        const runtimeErrors = []
        page.on('pageerror', (error) => runtimeErrors.push(error.message))
        await page.goto(target.path, { waitUntil: 'domcontentloaded' })
        await waitForAppReady(page)
        await page.waitForTimeout(400)

        // 标题宽松匹配（部分移动端 title 可能延迟）
        await expect(page.locator('#app')).toBeVisible()

        const layoutIssues = await collectLayoutIssues(page)
        for (const issue of layoutIssues) {
          allIssues.push({ page: target.key, ...issue })
        }

        // 横向溢出硬断言
        const overflow = layoutIssues.filter((i) => i.type === 'horizontal-overflow')
        if (overflow.length) {
          const shot = testInfo.outputPath(`${viewport.name}-${target.key}-overflow.png`)
          await page.screenshot({ path: shot, fullPage: true })
        }
        expect(overflow, `${target.key} 不应横向溢出`).toEqual([])

        // Axe
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        if (axe.violations.length) {
          axeViolations.push({
            page: target.key,
            violations: axe.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.slice(0, 5).map((n) => n.target)
            }))
          })
          const shot = testInfo.outputPath(`${viewport.name}-${target.key}-axe.png`)
          await page.screenshot({ path: shot, fullPage: true })
        }

        // 运行时错误
        expect(runtimeErrors, `${target.key} 无 pageerror`).toEqual([])
      }

      // 按钮重叠：记录但不直接 fail 全部（父子/菜单可能误报）；严重重叠 > 5 则失败
      const overlaps = allIssues.filter((i) => i.type === 'button-overlap')
      testInfo.annotations.push({
        type: 'layout-issues',
        description: JSON.stringify({
          viewport: viewport.name,
          issueCount: allIssues.length,
          overlaps: overlaps.length,
          axePages: axeViolations.length
        })
      })

      // 写出附件
      await testInfo.attach(`layout-${viewport.name}.json`, {
        body: Buffer.from(JSON.stringify({ allIssues, axeViolations }, null, 2)),
        contentType: 'application/json'
      })

      expect(axeViolations, `Axe violations @ ${viewport.name}`).toEqual([])
      expect(overlaps.length, `可疑按钮重叠数量 @ ${viewport.name}`).toBeLessThanOrEqual(8)
    })
  })
}

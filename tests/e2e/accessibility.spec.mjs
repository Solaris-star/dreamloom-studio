import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  { path: '/#/', name: '首页' },
  { path: '/#/knowledge', name: '作品书架' },
  { path: '/#/knowledge/images', name: '图库' },
  { path: '/#/ai/creation-starter', name: 'AI 工坊' },
  { path: '/#/settings/general', name: '系统设置' },
  { path: '/#/route-that-does-not-exist', name: '404 页面' }
]

test.beforeEach(async ({ page }) => {
  for (const pattern of ['**/api/auth/status', '**/api/bookshelf-auth/status']) {
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
})

for (const target of pages) {
  test(`${target.name}没有 WCAG 2.2 AA 自动检查错误`, async ({ page }) => {
    await page.goto(target.path, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#app')).toBeVisible()
    await page.waitForTimeout(500)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    expect(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target)
      }))
    ).toEqual([])
  })
}

test('键盘可以跳到主要内容', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app')).toBeVisible()
  await page.evaluate(() => document.activeElement?.blur())

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: '跳到主要内容' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(page.locator('#app-main')).toBeFocused()
})

test('减少动态效果偏好会关闭持续动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/market/overview', { waitUntil: 'domcontentloaded' })

  const continuouslyAnimated = await page.locator('*').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element)
        return (
          style.animationName !== 'none' &&
          (style.animationIterationCount === 'infinite' ||
            Number(style.animationIterationCount) > 1)
        )
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        animationName: getComputedStyle(element).animationName
      }))
  )

  expect(continuouslyAnimated).toEqual([])
})

test('创作台面板控制与目录入口可被辅助技术区分', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'wide', '按钮命名巡检在宽屏执行')
  const bookName = `织梦工坊无障碍 ${testInfo.project.name}`
  await request.post('/api/books/delete', { data: { name: bookName } })
  const created = await request.post('/api/books/create', {
    data: {
      name: bookName,
      intro: '无障碍命名检查',
      type: 'xuanhuan',
      typeName: '玄幻',
      bookRole: 'original'
    }
  })
  expect(created.ok()).toBeTruthy()
  await request.post('/api/chapters/save', {
    data: {
      bookName,
      volumeName: '正文',
      chapterName: '第1章',
      content: '夜雨落在青石长街上。'
    }
  })

  await page.goto(`/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`)
  await expect(page.getByLabel('创作台快捷操作')).toBeVisible()

  // 面板控制 vs 目录入口：名称互不冲突
  await expect(page.getByTestId('editor-toggle-chapter-panel')).toHaveAttribute(
    'aria-label',
    /展开章节面板|收起章节面板/
  )
  await expect(page.getByRole('button', { name: '打开章节目录' })).toBeVisible()
  await expect(page.getByRole('button', { name: '章节目录', exact: true })).toHaveCount(0)

  // 稳定选择器覆盖常用排版控件
  await expect(page.getByTestId('editor-font-family')).toBeVisible()
  await expect(page.getByTestId('editor-font-size')).toBeVisible()
  await expect(page.getByTestId('editor-line-height')).toBeVisible()
  await expect(page.getByTestId('editor-theme')).toBeVisible()

  await request.post('/api/books/delete', { data: { name: bookName } })
})

import { expect, test } from '@playwright/test'

const pages = [
  { path: '/#/', title: '织梦工坊' },
  { path: '/#/knowledge', title: '创作库' },
  { path: '/#/knowledge/images', title: '图库' },
  { path: '/#/ai/creation-starter', title: 'AI 工坊' },
  { path: '/#/analytics/overview', title: '数据中心' },
  { path: '/#/settings/general', title: '系统设置' },
  { path: '/#/route-that-does-not-exist', title: '页面不存在' }
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/bookshelf-auth/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        authenticated: true,
        passwordConfigured: false
      })
    })
  })
})

for (const target of pages) {
  test(`${target.title}页面可正常打开`, async ({ page }) => {
    const runtimeErrors = []

    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 500) {
        runtimeErrors.push(`http ${response.status()}: ${response.url()}`)
      }
    })

    await page.goto(target.path, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(new RegExp(target.title))
    await expect(page.locator('#app')).toBeVisible()
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error|页面加载失败/)
    await page.waitForTimeout(800)

    const viewport = page.viewportSize()
    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth
    }))
    expect(layout.bodyWidth).toBeLessThanOrEqual(viewport.width + 1)
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width + 1)
    expect(runtimeErrors).toEqual([])
  })
}

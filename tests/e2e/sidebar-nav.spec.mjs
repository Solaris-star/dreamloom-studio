import { expect, test } from '@playwright/test'

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

async function openDashboard(page) {
  await page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app')).toBeAttached({ timeout: 15_000 })
  await expect(page.getByTestId('nav-item-dashboard')).toBeVisible({ timeout: 20_000 })
}

test.describe('主导航收缩与入口', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthStatus(page)
  })

  test('桌面端可收起/展开且刷新保持，按钮只有图标', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'wide', '桌面收缩巡检在宽屏执行')

    await openDashboard(page)

    // 先确保展开态
    await page.evaluate(() => {
      localStorage.setItem('sidebarWidth', '156')
      localStorage.removeItem('sidebarWidth:lastExpanded')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openDashboard(page)

    const toggle = page.getByTestId('sidebar-collapse-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-label', '收起侧栏')
    await expect(page.locator('.app-sidebar')).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).not.toHaveText(/收起|展开|收缩/)

    await toggle.focus()
    await expect(toggle).toBeFocused()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', '展开侧栏')
    await expect(page.locator('.app-sidebar')).toHaveClass(/collapsed/)
    await expect(page.locator('.app-sidebar')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.app-menu-label:visible')).toHaveCount(0)

    await expect(page.getByTestId('nav-item-dashboard')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('nav-item-dashboard')).toHaveClass(/active/)

    const storedWidth = await page.evaluate(() => localStorage.getItem('sidebarWidth'))
    expect(storedWidth).toBe('64')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await openDashboard(page)
    await expect(page.locator('.app-sidebar')).toHaveClass(/collapsed/)
    await expect(page.getByTestId('sidebar-collapse-toggle')).toHaveAttribute(
      'aria-label',
      '展开侧栏'
    )

    await page.getByTestId('sidebar-collapse-toggle').click()
    await expect(page.locator('.app-sidebar')).not.toHaveClass(/collapsed/)
    await expect(page.getByTestId('sidebar-collapse-toggle')).toHaveAttribute(
      'aria-label',
      '收起侧栏'
    )
    await expect(page.getByTestId('nav-item-dashboard')).toContainText('首页')

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }))
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewport + 1)
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1)
  })

  test('移动端隐藏桌面收缩控件且显示底部标签', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '移动端底部导航巡检')

    await page.addInitScript(() => {
      localStorage.setItem('sidebarWidth', '64')
    })

    await openDashboard(page)

    await expect(page.getByTestId('sidebar-collapse-toggle')).toBeHidden()
    await expect(page.getByTestId('nav-item-dashboard')).toBeVisible()
    await expect(page.getByTestId('nav-item-dashboard')).toContainText('首页')
    await expect(page.getByTestId('nav-item-editor')).toContainText('创作台')

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }))
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewport + 1)
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1)
  })

  test('主导航不含导入导出/小说下载重复入口', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'wide', '入口清单巡检在宽屏执行')

    await openDashboard(page)

    const nav = page.getByRole('navigation', { name: '主导航' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button', { name: '导入导出' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: '小说下载' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: '首页' })).toBeVisible()
    await expect(nav.getByRole('button', { name: '创作库' })).toBeVisible()
  })
})

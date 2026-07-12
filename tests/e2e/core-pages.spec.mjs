import { expect, test } from '@playwright/test'

import { pageOpenCases } from './page-catalog.mjs'

const pageCheckBookName = '织梦工坊页面巡检'

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

for (const target of pageOpenCases) {
  test(`${target.title}页面可正常打开`, async ({ page, request }) => {
    const runtimeErrors = []
    const needsBook = target.path.includes('__book__')

    if (needsBook) {
      await request.post('/api/books/delete', { data: { name: pageCheckBookName } })
      const createResponse = await request.post('/api/books/create', {
        data: {
          name: pageCheckBookName,
          intro: '仅用于页面打开巡检',
          type: 'xuanhuan',
          typeName: '玄幻',
          bookRole: 'original'
        }
      })
      expect(createResponse.ok()).toBeTruthy()
      const createResult = await createResponse.json()
      expect(createResult.success).toBe(true)

      if (target.routeName === 'RelationshipDesign') {
        const graphResponse = await request.post('/api/studio/relationships/create', {
          data: {
            bookName: pageCheckBookName,
            relationshipName: '__page_check__',
            relationshipData: { nodes: [], lines: [] }
          }
        })
        expect(graphResponse.ok()).toBeTruthy()
        expect((await graphResponse.json()).success).toBe(true)
      }

      if (target.routeName === 'OrganizationDesign') {
        const graphResponse = await request.post('/api/studio/organizations/create', {
          data: {
            bookName: pageCheckBookName,
            organizationName: '__page_check__',
            organizationData: { nodes: [], lines: [] }
          }
        })
        expect(graphResponse.ok()).toBeTruthy()
        expect((await graphResponse.json()).success).toBe(true)
      }
    }

    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 500) {
        runtimeErrors.push(`http ${response.status()}: ${response.url()}`)
      }
    })

    const targetPath = target.path.replaceAll('__book__', encodeURIComponent(pageCheckBookName))
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' })
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

    if (needsBook) {
      await request.post('/api/books/delete', { data: { name: pageCheckBookName } })
    }
  })
}

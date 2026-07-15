import { expect, test } from '@playwright/test'

import { pageOpenCases } from './page-catalog.mjs'

const pageCheckBookName = '织梦工坊页面巡检'

/** 真实认证接口是 /api/auth/status；同时兼容旧 mock 路径避免回归遗漏 */
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

function expectedTitlePattern(title) {
  // 标题格式：`<meta.title> | 织梦工坊 | Dreamloom Studio`
  // 对含正则特殊字符的标题做转义，避免「·」等字符影响匹配
  const escaped = String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}.*织梦工坊`)
}

async function waitForAppReady(page) {
  // #app 在异步路由组件落点前可能 height=0，Playwright 会判为 hidden；
  // 先等节点挂载，再等实际渲染高度，避免竞态误判。
  await expect(page.locator('#app')).toBeAttached({ timeout: 15_000 })
  await expect
    .poll(async () => page.locator('#app').evaluate((el) => el.clientHeight), {
      timeout: 15_000
    })
    .toBeGreaterThan(0)
  await expect(page.locator('#app')).toBeVisible()
}

for (const target of pageOpenCases) {
  test(`${target.title}页面可正常打开`, async ({ page, request }) => {
    const runtimeErrors = []
    const needsBook = target.path.includes('__book__')

    await mockAuthStatus(page)

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
    await waitForAppReady(page)
    await expect(page).toHaveTitle(expectedTitlePattern(target.title))
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error|页面加载失败/)

    if (target.routeName === 'OutlineManager') {
      await expect(page.getByTestId('outline-manager-page')).toBeVisible()
      await expect(page.getByTestId('outline-manager-content')).toBeVisible()
      await expect(page.getByTestId('outline-manager-create')).toBeVisible()
    }

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

test('路由切换与浏览器前进后退会更新 document.title', async ({ page, request }) => {
  await mockAuthStatus(page)
  await request.post('/api/books/delete', { data: { name: pageCheckBookName } })
  const createResponse = await request.post('/api/books/create', {
    data: {
      name: pageCheckBookName,
      intro: '仅用于标题巡检',
      type: 'xuanhuan',
      typeName: '玄幻',
      bookRole: 'original'
    }
  })
  expect(createResponse.ok()).toBeTruthy()

  try {
    const sequence = [
      { path: '/#/dashboard', title: '首页' },
      { path: '/#/knowledge', title: '作品书架' },
      {
        path: `/#/outline-manager?name=${encodeURIComponent(pageCheckBookName)}`,
        title: '大纲管理'
      },
      {
        path: `/#/editor/${encodeURIComponent(pageCheckBookName)}?name=${encodeURIComponent(pageCheckBookName)}`,
        title: '创作台'
      },
      { path: '/#/settings/general', title: '系统设置' }
    ]

    for (const step of sequence) {
      await page.goto(step.path, { waitUntil: 'domcontentloaded' })
      await waitForAppReady(page)
      await expect(page).toHaveTitle(expectedTitlePattern(step.title))
    }

    // 浏览器后退：settings -> editor -> outline
    await page.goBack()
    await waitForAppReady(page)
    await expect(page).toHaveTitle(expectedTitlePattern('创作台'))
    await expect(page).toHaveTitle(new RegExp(pageCheckBookName))

    await page.goBack()
    await waitForAppReady(page)
    await expect(page).toHaveTitle(expectedTitlePattern('大纲管理'))
    await expect(page.getByTestId('outline-manager-page')).toBeVisible()

    // 浏览器前进：outline -> editor
    await page.goForward()
    await waitForAppReady(page)
    await expect(page).toHaveTitle(expectedTitlePattern('创作台'))
    await expect(page).toHaveTitle(new RegExp(pageCheckBookName))
  } finally {
    await request.post('/api/books/delete', { data: { name: pageCheckBookName } })
  }
})

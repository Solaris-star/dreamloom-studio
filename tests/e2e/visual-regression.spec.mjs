import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function testBookName(projectName) {
  return `织梦工坊视觉测试 ${projectName}`
}

async function postApi(request, path, body) {
  const response = await request.post(path, { data: body })
  expect(response.ok(), `${path} 应返回成功的 HTTP 状态`).toBeTruthy()
  return response.json()
}

async function createTestBook(request, projectName) {
  const bookName = testBookName(projectName)
  const directoryResponse = await request.get('/api/books/dir')
  expect(directoryResponse.ok()).toBeTruthy()
  const directoryResult = await directoryResponse.json()
  expect(resolve(directoryResult.booksDir)).toBe(
    resolve(join(tmpdir(), 'dreamloom-studio-e2e-books'))
  )

  await postApi(request, '/api/books/delete', { name: bookName })
  const created = await postApi(request, '/api/books/create', {
    name: bookName,
    intro: '一个关于旧书铺、雨夜和无名信件的故事。',
    type: 'xuanhuan',
    typeName: '玄幻',
    bookRole: 'original'
  })
  expect(created.success).toBe(true)

  await postApi(request, '/api/chapters/save', {
    bookName,
    volumeName: '第一卷 雨夜来信',
    chapterName: '第1章 旧书铺',
    content:
      '夜雨落在青石长街上，林舟推开了旧书铺的门。\n柜台后的灯火轻轻摇晃，照见一本没有书名的旧册。'
  })
  await postApi(request, '/api/chapters/upsert', {
    bookName,
    volumeName: '第一卷 雨夜来信',
    chapterName: '第2章 无名信',
    content:
      '天亮以后，他在书页夹层里发现了一封没有署名的信。\n信纸上只有一句话：不要让故事停在这里。'
  })

  return bookName
}

async function openEditor(page, bookName) {
  await page.goto(`/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`)
  await expect(page.getByLabel('创作台快捷操作')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toContainText(/夜雨落在青石长街上|天亮以后/)

  // 使用 aria-label / data-testid，避免 .toolbar-item.nth() 依赖 DOM 顺序
  await page.getByTestId('editor-font-size').click()
  await page.getByRole('option', { name: '18px' }).click()
  await page.getByTestId('editor-line-height').click()
  await page.getByRole('option', { name: '1.8' }).click()
  // 段落间距 / 页宽在窄屏可能收进「更多」菜单，宽屏直接点稳定 testid
  const paragraphSpacing = page.getByTestId('editor-paragraph-spacing')
  if (await paragraphSpacing.isVisible()) {
    await paragraphSpacing.click()
    await page.getByRole('option', { name: '1', exact: true }).click()
  }
  const pageWidth = page.getByTestId('editor-page-width')
  if (await pageWidth.isVisible()) {
    await pageWidth.click()
    await page.getByRole('option', { name: '自适应 (中)' }).click()
  }
}

async function expectPageScreenshot(page, name) {
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.01
  })
}

test.beforeEach(async ({ page, request }, testInfo) => {
  await postApi(request, '/api/store/set', {
    key: 'config.locale',
    value: 'zh-CN'
  })
  // 真实认证接口是 /api/auth/status；同时兼容旧 mock 路径
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
  await createTestBook(request, testInfo.project.name)
})

test.afterEach(async ({ request }, testInfo) => {
  const result = await postApi(request, '/api/books/delete', {
    name: testBookName(testInfo.project.name)
  })
  expect(result.success || result.existed === false).toBeTruthy()
})

test('宽屏核心页面视觉基准', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'wide', '仅生成宽屏视觉基准')

  await page.goto('/#/')
  await expect(page.locator('.writing-row').filter({ hasText: testBookName('wide') })).toBeVisible()
  await expectPageScreenshot(page, 'wide-home.png')

  await page.goto('/#/knowledge')
  await expect(page.locator('.book-card').filter({ hasText: testBookName('wide') })).toBeVisible()
  await expectPageScreenshot(page, 'wide-bookshelf.png')

  await page.goto('/#/knowledge/images')
  await expect(page.getByRole('button', { name: '上传图片' })).toBeVisible()
  await expectPageScreenshot(page, 'wide-gallery.png')
})

test('宽屏创作台视觉基准', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'wide', '仅生成宽屏视觉基准')
  await openEditor(page, testBookName('wide'))
  await expectPageScreenshot(page, 'wide-editor.png')

  await page.getByLabel('创作台快捷操作').getByRole('button', { name: '打开章节目录' }).click()
  await expect(page.getByRole('dialog', { name: '章节目录' })).toBeVisible()
  await expectPageScreenshot(page, 'wide-editor-catalog.png')

  await page.keyboard.press('Escape')
  await page.getByLabel('创作台快捷操作').getByLabel('进入专注模式').click()
  await expect(page.locator('.editor-container')).toHaveClass(/is-focus-mode/)
  await expectPageScreenshot(page, 'wide-editor-focus.png')
})

test('手机创作台视觉基准', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '仅生成手机视觉基准')
  await openEditor(page, testBookName('mobile'))
  await expectPageScreenshot(page, 'mobile-editor.png')

  await page.getByLabel('创作台快捷操作').getByRole('button', { name: '创作工具', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '创作工具' })).toBeVisible()
  await expectPageScreenshot(page, 'mobile-editor-tools.png')
})

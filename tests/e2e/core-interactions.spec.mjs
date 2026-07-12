import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function testBookName(projectName) {
  return `织梦工坊 E2E ${projectName}`
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
    intro: '仅用于 Playwright 自动测试',
    type: 'xuanhuan',
    typeName: '玄幻',
    bookRole: 'original'
  })
  expect(created.success).toBe(true)

  const firstChapter = await postApi(request, '/api/chapters/save', {
    bookName,
    volumeName: '正文',
    chapterName: '第1章',
    content: '夜雨落在青石长街上，林舟推开了旧书铺的门。'
  })
  expect(firstChapter.success).toBe(true)

  const secondChapter = await postApi(request, '/api/chapters/upsert', {
    bookName,
    volumeName: '正文',
    chapterName: '第2章',
    content: '天亮以后，他在书页夹层里发现了一封没有署名的信。'
  })
  expect(secondChapter.success).toBe(true)
  return bookName
}

async function removeTestBook(request, projectName) {
  const result = await postApi(request, '/api/books/delete', {
    name: testBookName(projectName)
  })
  expect(result.success || result.existed === false).toBeTruthy()
}

async function openEditor(page, bookName) {
  await page.goto(`/#/editor/${encodeURIComponent(bookName)}?name=${encodeURIComponent(bookName)}`)
  await expect(page.getByLabel('创作台快捷操作')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toContainText(/夜雨落在青石长街上|天亮以后/)
}

test.beforeEach(async ({ page, request }, testInfo) => {
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
  await createTestBook(request, testInfo.project.name)
})

test.afterEach(async ({ request }, testInfo) => {
  await removeTestBook(request, testInfo.project.name)
})

test('首页继续写作可以进入创作台', async ({ page }, testInfo) => {
  const bookName = testBookName(testInfo.project.name)
  await page.goto('/#/')

  const row = page.locator('.writing-row').filter({ hasText: bookName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '继续写' }).click()

  await expect(page).toHaveURL(/#\/editor\//)
  await expect(page).toHaveTitle(new RegExp(bookName))
})

test('书架筛选和本地导入入口可以操作', async ({ page }, testInfo) => {
  const bookName = testBookName(testInfo.project.name)
  await page.goto('/#/knowledge')

  await page.getByTitle('筛选书架').click()
  await expect(page.getByRole('button', { name: /我的作品/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.locator('.book-card').filter({ hasText: bookName }).click()
  await expect(page.locator('.preview-card')).toContainText(bookName)

  await page.getByText('添加书籍', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '添加书籍' })).toBeVisible()
  await page.getByRole('tab', { name: '本地文件导入' }).click()
  await expect(page.getByRole('dialog', { name: '添加书籍' })).toContainText(/TXT|MD|DOCX/)
})

test('创作台目录和章节切换可以操作', async ({ page }, testInfo) => {
  const bookName = testBookName(testInfo.project.name)
  await openEditor(page, bookName)

  await page.getByRole('button', { name: '章节目录' }).click()
  const catalog = page.getByRole('dialog', { name: '章节目录' })
  await expect(catalog).toBeVisible()
  await expect(catalog.getByRole('button', { name: /第2章/ })).toBeVisible()
  await catalog.getByRole('button', { name: /第1章/ }).click()
  await expect(page.locator('.ProseMirror')).toContainText('夜雨落在青石长街上')

  await page.getByRole('button', { name: '章节目录' }).click()
  await catalog.getByRole('button', { name: /第2章/ }).click()
  await expect(page.locator('.ProseMirror')).toContainText('天亮以后')

  await page.getByRole('button', { name: '上一章' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('夜雨落在青石长街上')
  await page.getByRole('button', { name: '下一章' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('天亮以后')
})

test('创作台阅读设置和专注模式可以恢复', async ({ page }, testInfo) => {
  await openEditor(page, testBookName(testInfo.project.name))

  await page.getByRole('button', { name: '阅读设置' }).click()
  await expect(page.getByRole('dialog', { name: '阅读设置' })).toBeVisible()
  await page.getByRole('button', { name: '完成' }).click()

  const enterFocus = page.getByLabel('进入专注模式')
  await enterFocus.click()
  await expect(page.locator('.editor-container')).toHaveClass(/is-focus-mode/)
  await expect(page.getByLabel('退出专注模式')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.editor-container')).not.toHaveClass(/is-focus-mode/)
})

test('手机创作工具使用全屏抽屉', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '仅检查手机布局')
  await openEditor(page, testBookName(testInfo.project.name))

  await page.getByRole('button', { name: '创作工具' }).click()
  const drawer = page.getByRole('dialog', { name: '创作工具' })
  await expect(drawer).toBeVisible()
  await expect(drawer).toHaveCSS('width', `${page.viewportSize().width}px`)
})

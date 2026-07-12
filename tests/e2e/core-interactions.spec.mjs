import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function testBookName(projectName) {
  return `织梦工坊 E2E ${projectName}`
}

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

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

test('清理回收站需要确认且不会重复提交', async ({ page }) => {
  let clearRequests = 0
  await page.route('**/api/settings/storage-stats', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        booksDir: 'D:\\books',
        booksSize: 1024,
        storeSize: 128,
        trashSize: 64
      })
    })
  })
  await page.route('**/api/settings/clear-trash', async (route) => {
    clearRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, bytesBefore: 64, bytesAfter: 0 })
    })
  })

  await page.goto('/#/settings/storage')
  const clearButton = page.getByRole('button', { name: '清理回收站' })
  await clearButton.click()
  const confirmDialog = page.getByRole('dialog', { name: '清理回收站' })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole('button', { name: '取消' }).click()
  await expect.poll(() => clearRequests).toBe(0)

  await clearButton.click()
  await confirmDialog.getByRole('button', { name: '确认清理' }).click()
  await expect(clearButton).toBeDisabled()
  await expect(page.getByText('回收站已清理')).toBeVisible()
  await expect.poll(() => clearRequests).toBe(1)
})

test('清理回收站失败时保留页面并显示原因', async ({ page }) => {
  await page.route('**/api/settings/storage-stats', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        booksDir: 'D:\\books',
        booksSize: 0,
        storeSize: 0,
        trashSize: 64
      })
    })
  })
  await page.route('**/api/settings/clear-trash', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '清理服务暂时不可用' })
    })
  })

  await page.goto('/#/settings/storage')
  await page.getByRole('button', { name: '清理回收站' }).click()
  await page.getByRole('dialog', { name: '清理回收站' }).getByRole('button', {
    name: '确认清理'
  }).click()

  await expect(page.getByText('清理服务暂时不可用')).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/storage/)
  await expect(page.getByRole('button', { name: '清理回收站' })).toBeEnabled()
})

test('图库连续拖入时不会重复上传', async ({ page }, testInfo) => {
  let importRequests = 0
  const bookName = testBookName(testInfo.project.name)
  await page.route('**/api/assets/import', async (route) => {
    importRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item: {
          id: 'e2e-upload-image',
          name: '连续上传.png',
          bookName,
          bookFolderName: bookName,
          type: 'attachment',
          isImage: true
        }
      })
    })
  })

  await page.goto('/#/knowledge/images')
  const dropZone = page.locator('.manager-grid.images-grid')
  await dropZone.evaluate(
    (element, payload) => {
      const transfer = new DataTransfer()
      const bytes = Uint8Array.from(atob(payload.split(',')[1]), (character) =>
        character.charCodeAt(0)
      )
      transfer.items.add(new File([bytes], '连续上传.png', { type: 'image/png' }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
    },
    onePixelPng
  )

  await expect(page.getByText('图片正在上传，请稍候')).toBeVisible()
  await expect(page.getByText('成功上传 1 张图片')).toBeVisible()
  await expect.poll(() => importRequests).toBe(1)
})

test('图库删除检查引用期间不会重复提交', async ({ page, request }, testInfo) => {
  const bookName = testBookName(testInfo.project.name)
  const imported = await postApi(request, '/api/assets/import', {
    dataUrl: onePixelPng,
    fileName: '引用保护.png',
    bookName,
    type: 'attachment'
  })
  expect(imported.success).toBe(true)

  let referenceRequests = 0
  let deleteRequests = 0
  await page.route('**/api/assets/references', async (route) => {
    referenceRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        references: [
          {
            file: 'mazi.json',
            fields: ['$.coverUrl'],
            usages: [{ type: 'cover', label: '作品封面' }]
          }
        ]
      })
    })
  })
  await page.route('**/api/assets/delete', async (route) => {
    deleteRequests += 1
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, item: { id: imported.item.id } })
    })
  })

  await page.goto('/#/knowledge/images')
  const card = page.locator('.image-card').filter({ hasText: '引用保护.png' })
  await expect(card).toBeVisible()
  const deleteButton = card.getByTitle('删除图片')
  await deleteButton.click()
  await deleteButton.click({ force: true })

  await expect(page.getByText(/该图片仍被引用，不能删除.*作品封面/)).toBeVisible()
  await expect.poll(() => referenceRequests).toBe(1)
  expect(deleteRequests).toBe(0)
})

test('AI 工坊运行期间不会重复提交或切换任务', async ({ page }) => {
  let taskRequests = 0
  await page.route('**/api/ai/text-task', async (route) => {
    taskRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        content: '林舟推门后，看见柜台上放着一封没有署名的信。'
      })
    })
  })

  await page.goto('/#/ai/text-tools')
  const input = page.locator('.main-input-block textarea')
  const taskSelect = page.locator('.setup-strip .el-select').first()
  const submitButton = page.getByRole('button', { name: '续写' })
  await input.fill('林舟推开旧书铺的门。')

  await submitButton.click()
  await submitButton.click({ force: true })

  await expect(input).toBeDisabled()
  await expect(taskSelect.locator('input')).toBeDisabled()
  await expect(page.locator('.generation-status-card').getByText('生成完成')).toBeVisible()
  await expect.poll(() => taskRequests).toBe(1)
  await expect(input).toBeEnabled()
})

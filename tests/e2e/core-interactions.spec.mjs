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

async function openFirstChapter(page) {
  await page.getByRole('button', { name: '章节目录' }).click()
  const catalog = page.getByRole('dialog', { name: '章节目录' })
  await catalog.getByRole('button', { name: /第1章/ }).click()
  await expect(page.locator('.ProseMirror')).toContainText('夜雨落在青石长街上')
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

test('主导航和子导航可以连续切换且不会产生运行时异常', async ({ page }) => {
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto('/#/')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  const routes = [
    { name: '地图设计', path: /#\/map-list(?:\?|$)/ },
    { name: '创作库', path: /#\/knowledge$/ },
    { name: '素材箱', path: /#\/knowledge\/materials$/ },
    { name: '图库', path: /#\/knowledge\/images$/ },
    { name: '提示词', path: /#\/knowledge\/prompts$/ },
    { name: '回收站', path: /#\/knowledge\/trash$/ },
    { name: 'AI 工坊', path: /#\/ai\/creation-starter$/ },
    { name: '文本处理', path: /#\/ai\/text-tools$/ },
    { name: '剧情规划', path: /#\/ai\/plot$/ },
    { name: '人物世界', path: /#\/ai\/world$/ },
    { name: '图像生成', path: /#\/ai\/image$/ },
    { name: '任务队列', path: /#\/ai\/queue$/ },
    { name: '提示词调用', path: /#\/ai\/prompts$/ },
    { name: '生成历史', path: /#\/ai\/history$/ },
    { name: '市场灵感', path: /#\/market\/overview$/ },
    { name: '数据中心', path: /#\/analytics\/overview$/ },
    { name: '系统设置', path: /#\/settings\/general$/ },
    { name: '首页', path: /#\/dashboard$/ }
  ]

  for (const route of routes) {
    await navigation.getByRole('button', { name: route.name, exact: true }).click()
    await expect(page).toHaveURL(route.path)
    await expect(page.locator('#app-main')).toBeVisible()
    await page.waitForTimeout(250)
  }

  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible()
  await page.getByRole('button', { name: '展开侧栏' }).click()
  await expect(page.getByRole('button', { name: '收起侧栏' })).toBeVisible()
  expect(runtimeErrors).toEqual([])
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

test('自动保存只写入连续输入后的最终正文', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '自动保存时序仅在桌面项目执行')
  const savedContents = []
  await openEditor(page, testBookName(testInfo.project.name))
  await openFirstChapter(page)
  await page.route('**/api/chapters/save', async (route) => {
    const body = route.request().postDataJSON()
    savedContents.push(body.content)
    await route.continue()
  })

  const editor = page.locator('.ProseMirror')
  await editor.fill('第一次输入')
  await page.waitForTimeout(500)
  await editor.fill('第二次输入')
  await page.waitForTimeout(500)
  await editor.fill('最终正文内容')

  await expect.poll(() => savedContents.length, { timeout: 8_000 }).toBe(1)
  await expect(page.locator('.save-state')).toHaveText('已保存')
  expect(savedContents).toEqual(['最终正文内容'])

  const response = await page.request.post('/api/chapters/read', {
    data: {
      bookName: testBookName(testInfo.project.name),
      volumeName: '正文',
      chapterName: '第1章'
    }
  })
  expect(response.ok()).toBeTruthy()
  expect((await response.json()).content).toBe('最终正文内容')
})

test('章节切换会先保存尚未到期的正文', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '自动保存时序仅在桌面项目执行')
  const savedContents = []
  await openEditor(page, testBookName(testInfo.project.name))
  await openFirstChapter(page)
  await page.route('**/api/chapters/save', async (route) => {
    savedContents.push(route.request().postDataJSON().content)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
    await route.continue()
  })

  await page.locator('.ProseMirror').fill('切换章节前必须保存的正文')
  await page.getByRole('button', { name: '下一章' }).click()

  await expect(page.locator('.ProseMirror')).toContainText('天亮以后')
  expect(savedContents).toContain('切换章节前必须保存的正文')
})

test('保存失败会阻止章节切换并保留恢复副本', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '自动保存故障仅在桌面项目执行')
  const bookName = testBookName(testInfo.project.name)
  await openEditor(page, bookName)
  await openFirstChapter(page)
  await page.route('**/api/chapters/save', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '模拟章节保存失败' })
    })
  })

  await page.locator('.ProseMirror').fill('保存失败后仍需保留的正文')
  await page.getByRole('button', { name: '下一章' }).click()

  await expect(page.locator('.ProseMirror')).toContainText('保存失败后仍需保留的正文')
  await expect(page.locator('.save-state')).toHaveText('保存失败')
  await expect(page.getByText('当前内容保存失败，已取消切换，请重试')).toBeVisible()
  const recoveryDrafts = await page.evaluate(() =>
    Object.entries(localStorage).filter(
      ([key, value]) => key.includes('recovery') && value.includes('保存失败后仍需保留的正文')
    )
  )
  expect(recoveryDrafts.length).toBeGreaterThan(0)
})

test('离线保存会保留正文并在网络恢复后完成换章', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '自动保存故障仅在桌面项目执行')
  const bookName = testBookName(testInfo.project.name)
  await openEditor(page, bookName)
  await openFirstChapter(page)
  const saveRoute = async (route) => route.abort('internetdisconnected')
  await page.route('**/api/chapters/save', saveRoute)

  await page.locator('.ProseMirror').fill('离线期间不能丢失的正文')
  await page.getByRole('button', { name: '下一章' }).click()

  await expect(page.locator('.ProseMirror')).toContainText('离线期间不能丢失的正文')
  await expect(page.locator('.save-state')).toHaveText('离线待保存')
  const draftsWhileOffline = await page.evaluate(() =>
    Object.entries(localStorage).filter(
      ([key, value]) => key.includes('recovery') && value.includes('离线期间不能丢失的正文')
    )
  )
  expect(draftsWhileOffline.length).toBeGreaterThan(0)

  await page.unroute('**/api/chapters/save', saveRoute)
  await page.getByRole('button', { name: '下一章' }).click()

  await expect(page.locator('.ProseMirror')).toContainText('天亮以后')
  const savedResponse = await page.request.post('/api/chapters/read', {
    data: { bookName, volumeName: '正文', chapterName: '第1章' }
  })
  expect(savedResponse.ok()).toBeTruthy()
  expect((await savedResponse.json()).content).toBe('离线期间不能丢失的正文')
  const draftsAfterRecovery = await page.evaluate(() =>
    Object.entries(localStorage).filter(
      ([key, value]) => key.includes('recovery') && value.includes('离线期间不能丢失的正文')
    )
  )
  expect(draftsAfterRecovery).toEqual([])
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

test('导入书籍期间不会重复提交', async ({ page }) => {
  let importRequests = 0
  await page.route('**/api/import/preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        preview: {
          bookName: '导入防重复测试',
          fileName: 'import-guard.txt',
          chapterCount: 1,
          wordCount: 8,
          chapters: [{ index: 1, title: '第1章', wordCount: 8, preview: '测试正文' }]
        }
      })
    })
  })
  await page.route('**/api/import/book', async (route) => {
    importRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        bookName: '导入防重复测试',
        bookPath: 'D:\\books\\导入防重复测试',
        task: { id: 'import-guard', type: 'import' }
      })
    })
  })

  await page.goto('/#/import-export/import')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'import-guard.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第1章\n测试正文', 'utf8')
  })
  await expect(page.getByText('导入防重复测试', { exact: true })).toBeVisible()

  const importButton = page.getByRole('button', { name: '写入书库' })
  await importButton.click()
  await expect(importButton).toBeDisabled()
  await importButton.dispatchEvent('click')
  await expect(page.getByText('已导入：导入防重复测试')).toBeVisible()
  await expect.poll(() => importRequests).toBe(1)
})

test('恢复备份需要确认且失败时不会显示成功', async ({ page }) => {
  let restoreRequests = 0
  await page.route('**/api/backup/inspect', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        summary: { bookCount: 1, maziCount: 1, fileCount: 2, totalSize: 128, books: [] }
      })
    })
  })
  await page.route('**/api/backup/restore', async (route) => {
    restoreRequests += 1
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '备份内容校验失败' })
    })
  })

  await page.goto('/#/import-export/backup')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'restore-test.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('intercepted backup')
  })
  await page.getByRole('button', { name: '检查结构' }).click()
  await expect(page.getByText('备份包结构可恢复')).toBeVisible()

  await page.getByRole('button', { name: '恢复', exact: true }).click()
  const confirmDialog = page.getByRole('dialog', { name: '确认恢复备份' })
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole('button', { name: '取消' }).click()
  await expect.poll(() => restoreRequests).toBe(0)

  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page
    .locator('.el-message-box:visible')
    .last()
    .getByRole('button', { name: '确认恢复' })
    .click()
  await expect(page.getByText('备份内容校验失败')).toBeVisible()
  await expect(page.getByText(/已恢复 .*本书到当前书库/)).toHaveCount(0)
  await expect.poll(() => restoreRequests).toBe(1)
})

test('市场灵感写操作不会重复提交或保留旧成功结果', async ({ page }) => {
  let saveRequests = 0
  const insight = {
    id: 'market-action-guard',
    title: '市场操作防重复测试',
    channel: 'all',
    tags: ['悬疑'],
    heatScore: 80,
    growthScore: 70,
    opportunityScore: 75,
    suitableWriting: '长篇悬疑',
    hook: '旧信引出失踪案',
    sourceStatus: 'fresh'
  }
  const marketResponses = {
    dashboard: {
      success: true,
      sourceStatus: [],
      topOpportunities: [],
      recentTrends: [],
      agentBrief: null
    },
    overview: {
      success: true,
      writableDirections: [insight],
      genreDistribution: [],
      inspirationExpress: [],
      opportunityIndex: { grade: 'A', summary: '适合创作' }
    },
    'hot-rank': { success: true, sources: [], items: [] },
    'keyword-cloud': {
      success: true,
      keywordClusters: [],
      popularCombinations: [],
      defaultCombinationDetail: {}
    },
    'activities-board': { success: true, activities: [] }
  }
  for (const [endpoint, response] of Object.entries(marketResponses)) {
    await page.route(`**/api/market/${endpoint}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(response)
      })
    })
  }
  await page.route('**/api/market/save-inspiration', async (route) => {
    saveRequests += 1
    if (saveRequests === 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500))
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: { id: 'market-save-guard', title: '市场保存防重复测试' }
        })
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '市场灵感保存失败' })
    })
  })

  await page.goto('/#/market/overview')
  const actionBar = page.locator('.market-action-bar').first()
  const saveButton = actionBar.getByRole('button', { name: '存入灵感库' })
  await expect(saveButton).toBeEnabled()

  await saveButton.evaluate((button) => {
    button.click()
    button.click()
  })
  await expect.poll(() => saveRequests, { timeout: 1_000 }).toBe(1)
  await expect(page.locator('.result-banner').getByText('已存入灵感库', { exact: true })).toBeVisible()
  await expect.poll(() => saveRequests).toBe(1)

  await saveButton.click()
  await expect(page.getByText('市场灵感保存失败')).toBeVisible()
  await expect(page.locator('.result-banner')).toHaveCount(0)
  await expect.poll(() => saveRequests).toBe(2)
})

test('小说下载不会重复提交或写入失败章节', async ({ page }) => {
  let downloadRequests = 0
  const savedChapters = []
  await page.route('**/api/novel/sources', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'e2e-source', name: '测试书源' }])
    })
  })
  await page.route('**/api/novel/search', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        list: [
          {
            title: '下载保护测试',
            author: '测试作者',
            url: 'https://example.test/book',
            sourceId: 'e2e-source'
          }
        ],
        sourceErrors: []
      })
    })
  })
  await page.route('**/api/novel/chapters', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        chapters: [
          { title: '第一章', url: 'https://example.test/chapter-1' },
          { title: '第二章', url: 'https://example.test/chapter-2' }
        ]
      })
    })
  })
  await page.route('**/api/novel/download', async (route) => {
    downloadRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        chapters: [
          { title: '第一章', content: '可用正文', failed: false },
          { title: '第二章', content: '', failed: true, error: '章节暂时不可用' }
        ]
      })
    })
  })
  await page.route('**/api/books/create', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    })
  })
  await page.route('**/api/chapters/save', async (route) => {
    savedChapters.push((await route.request().postDataJSON()).content)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    })
  })

  await page.goto('/#/novel-download')
  await page.getByPlaceholder(/书名|作者/).fill('下载保护')
  await page.getByRole('button', { name: '搜索' }).click()
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await expect(page.getByText('共 2 章')).toBeVisible()

  const downloadButton = page.getByRole('button', { name: /下载并加入书架/ })
  await downloadButton.evaluate((button) => {
    button.click()
    button.click()
  })
  const confirmDialog = page.getByRole('dialog', { name: /确认下载/ })
  await confirmDialog.getByRole('button', { name: '确定' }).click()

  await expect(page.getByText(/已加入书架/)).toBeVisible()
  await expect.poll(() => downloadRequests).toBe(1)
  expect(savedChapters).toEqual(['第一章\n\n可用正文'])
})

test('写作目标保存不会重复提交或误报成功', async ({ page }) => {
  let createRequests = 0
  let goals = []
  await page.route('**/api/goals/list', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: goals })
    })
  })
  await page.route('**/api/goals/create', async (route) => {
    createRequests += 1
    if (createRequests === 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 400))
      const payload = await route.request().postDataJSON()
      goals = [{ ...payload, id: 'e2e-goal', currentValue: 0 }]
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: goals[0] })
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '写作目标保存失败' })
    })
  })

  await page.goto('/#/analytics/goals')
  await page.getByRole('button', { name: '创建目标' }).click()
  const dialog = page.getByRole('dialog', { name: '创建目标' })
  await dialog.getByLabel('目标名称').fill('每日写作测试')
  const saveButton = dialog.getByRole('button', { name: '保存' })
  await saveButton.evaluate((button) => {
    button.click()
    button.click()
  })
  await expect(saveButton).toBeDisabled()
  await expect(page.getByText('目标已保存')).toBeVisible()
  await expect.poll(() => createRequests).toBe(1)

  await page.getByRole('button', { name: '创建目标' }).click()
  const failedDialog = page.getByRole('dialog', { name: '创建目标' })
  await failedDialog.getByLabel('目标名称').fill('失败目标测试')
  await failedDialog.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('写作目标保存失败')).toBeVisible()
  await expect(failedDialog).toBeVisible()
  await expect.poll(() => createRequests).toBe(2)
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

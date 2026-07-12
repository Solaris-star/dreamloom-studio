import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { rm, truncate, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'

function testBookName(projectName) {
  return `织梦工坊 E2E ${projectName}`
}

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function createDocxBuffer(lines) {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.folder('_rels').file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  const paragraphs = lines
    .map(
      (line) =>
        `<w:p><w:r><w:t>${String(line).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</w:t></w:r></w:p>`
    )
    .join('')
  zip.folder('word').file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`
  )
  zip.folder('word').folder('_rels').file(
    'document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  )
  return zip.generateAsync({ type: 'nodebuffer' })
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
  await expect(page).toHaveURL(/#\/editor\//)
  await expect(page).toHaveTitle(new RegExp(bookName))
  await expect(page.getByLabel('创作台快捷操作')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toContainText(/夜雨落在青石长街上|天亮以后/)
}

async function openFirstChapter(page) {
  await page.getByRole('button', { name: '章节目录' }).click()
  const catalog = page.getByRole('dialog', { name: '章节目录' })
  await catalog.getByRole('button', { name: /第1章/ }).click()
  await expect(page.locator('.ProseMirror')).toContainText('夜雨落在青石长街上')
}

async function mockAgentQueuePage(page, options = {}) {
  const getJob = options.getJob || (() => options.job)
  await page.route('**/api/editor-agent/queue-status', async (route) => {
    const job = getJob()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        queueName: 'novel-agent-writing',
        counts: {
          waiting: job?.state === 'waiting' ? 1 : 0,
          active: job?.state === 'active' ? 1 : 0,
          completed: job?.state === 'completed' ? 1 : 0,
          failed: job?.state === 'failed' ? 1 : 0,
          delayed: 0,
          paused: 0
        },
        workerCount: 1
      })
    })
  })
  await page.route('**/api/editor-agent/queue-jobs', async (route) => {
    const job = getJob()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, jobs: job ? [job] : [] })
    })
  })
  await page.route('**/api/editor-agent/queue-job', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, job: getJob() || null })
    })
  })
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

test('创作台资料入口携带当前书籍并打开对应页面', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '资料入口巡检仅在桌面项目执行')
  test.setTimeout(60_000)
  const runtimeErrors = []
  const bookName = testBookName(testInfo.project.name)
  const entries = [
    { buttonName: '大纲管理', pageTitle: '大纲管理', path: 'outline-manager' },
    { buttonName: '设定管理', pageTitle: '设定管理', path: 'setting-manager' },
    { buttonName: '词条字典', pageTitle: '词典', path: 'dictionary' },
    { buttonName: '人物谱', pageTitle: '角色档案', path: 'character-profile' },
    { buttonName: '时间线', pageTitle: '时间线', path: 'timeline' }
  ]
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await openEditor(page, bookName)

  for (const [index, entry] of entries.entries()) {
    await page.getByRole('button', { name: entry.buttonName, exact: true }).click()

    await expect(page).toHaveURL((url) => {
      return (
        url.hash.startsWith(`#/${entry.path}`) &&
        new URLSearchParams(url.hash.split('?')[1]).get('name') === bookName
      )
    })
    await expect(page).toHaveTitle(new RegExp(entry.pageTitle))
    await expect(page.locator('#app-main')).toBeVisible()

    if (index < entries.length - 1) {
      await page.goBack()
      await expect(page).toHaveURL(/#\/editor\//)
      await expect(page).toHaveTitle(new RegExp(bookName))
      await expect(page.getByLabel('创作台快捷操作')).toBeVisible()
    }
  }

  expect(runtimeErrors).toEqual([])
})

test('主导航和子导航可以连续切换且不会产生运行时异常', async ({ page }, testInfo) => {
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

  if (testInfo.project.name !== 'mobile') {
    await page.getByRole('button', { name: '收起侧栏' }).click()
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible()
    await page.getByRole('button', { name: '展开侧栏' }).click()
    await expect(page.getByRole('button', { name: '收起侧栏' })).toBeVisible()
  }
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

test('在线拆书搜索结果可以通过选择按钮操作', async ({ page }) => {
  await page.route('**/api/novel/search', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        list: [
          {
            title: '雨夜旧书铺',
            author: '测试作者',
            url: 'https://example.test/books/rainy-night',
            sourceId: 'test-source'
          }
        ],
        sourceErrors: []
      })
    })
  })

  await page.goto('/#/knowledge-library/all')
  await page.getByRole('button', { name: '拆书', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建拆书知识' })
  await dialog.locator('.el-radio').filter({ hasText: '在线书籍' }).click()
  await dialog.getByPlaceholder('输入书名关键词').fill('雨夜')
  await dialog.getByRole('button', { name: '搜索', exact: true }).click()

  const selectButton = dialog.getByRole('button', { name: '选择', exact: true })
  await expect(selectButton).toBeVisible()
  await selectButton.focus()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: '已选', exact: true })).toBeVisible()
})

test('DOCX 可以预览导入且损坏文件不会加入书架', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'DOCX 浏览器解析仅在桌面项目执行')
  const importedBookName = 'DOCX 浏览器导入'
  const docxBuffer = await createDocxBuffer([
    '第1章 雨夜',
    '林舟推开旧书铺的门。',
    '第2章 来信',
    '柜台上放着一封没有署名的信。'
  ])

  await postApi(request, '/api/books/delete', { name: importedBookName })
  try {
    await page.goto('/#/knowledge')
    await page.getByText('添加书籍', { exact: true }).click()
    const addBookDialog = page.getByRole('dialog', { name: '添加书籍' })
    await addBookDialog.getByRole('tab', { name: '本地文件导入' }).click()
    const fileInput = addBookDialog.locator('input[type="file"]').first()

    await fileInput.setInputFiles({
      name: `${importedBookName}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer
    })

    const readyRow = addBookDialog.locator('.local-import-item').filter({ hasText: importedBookName })
    await expect(readyRow).toContainText('DOCX')
    await expect(readyRow).toContainText('2 章')
    await expect(readyRow).toContainText('第1章 雨夜')
    await expect(readyRow).toContainText('第2章 来信')
    await readyRow.getByRole('button', { name: '查看完整预览' }).click()
    await expect(readyRow).toContainText('林舟推开旧书铺的门。')

    await readyRow.getByRole('button', { name: '加入书架' }).click()
    await page.getByRole('dialog', { name: '确认导入' }).getByRole('button', {
      name: '导入'
    }).click()
    await expect(readyRow).toContainText('已加入')

    await fileInput.setInputFiles({
      name: '损坏文档.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('not-a-docx', 'utf8')
    })
    const brokenRow = addBookDialog.locator('.local-import-item').filter({ hasText: '损坏文档' })
    await expect(brokenRow).toContainText('DOCX 文件内容损坏')
    await expect(brokenRow.getByRole('button', { name: '加入书架' })).toBeDisabled()
  } finally {
    await postApi(request, '/api/books/delete', { name: importedBookName })
  }
})

test('TXT 和 Markdown 可以生成完整章节预览', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '文件导入预览仅在桌面项目执行')
  const cases = [
    {
      name: '雨夜来信.txt',
      mimeType: 'text/plain',
      content: '第1章 雨夜\n林舟推开旧书铺的门。\n第2章 来信\n柜台上放着一封信。'
    },
    {
      name: '旧城手记.md',
      mimeType: 'text/markdown',
      content: '# 旧城手记\n## 第1章 旧城\n钟声越过屋脊。\n## 第2章 归人\n长街尽头亮起一盏灯。',
      previewLines: ['钟声越过屋脊。', '长街尽头亮起一盏灯。']
    }
  ]

  await page.goto('/#/import-export/import')
  const fileInput = page.locator('input[type="file"]').first()
  for (const item of cases) {
    await fileInput.setInputFiles({
      name: item.name,
      mimeType: item.mimeType,
      buffer: Buffer.from(item.content, 'utf8')
    })
    const preview = page.locator('.preview-box')
    await expect(preview).toContainText(item.name)
    await expect(preview).toContainText('2 章')
    const previewLines = item.previewLines || [item.content.split('\n')[1], item.content.split('\n')[3]]
    await expect(preview).toContainText(previewLines[0])
    await expect(preview).toContainText(previewLines[1])
  }
})

test('空文件和超限文件会在页面直接提示且不请求预览', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '文件导入校验仅在桌面项目执行')
  let previewRequests = 0
  await page.route('**/api/import/preview', async (route) => {
    previewRequests += 1
    await route.continue()
  })

  await page.goto('/#/import-export/import')
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles({
    name: '空书.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(0)
  })
  await expect(page.getByText('导入文件不能为空')).toBeVisible()

  const oversizedPath = testInfo.outputPath('超限书稿.txt')
  await writeFile(oversizedPath, '')
  await truncate(oversizedPath, 50 * 1024 * 1024 + 1)
  try {
    await fileInput.setInputFiles(oversizedPath)
    await expect(page.getByText('导入文件不能超过 50 MB')).toBeVisible()
    expect(previewRequests).toBe(0)
    await expect(page.locator('.preview-box')).toHaveCount(0)
  } finally {
    await rm(oversizedPath, { force: true })
  }
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

test('AI 整章清理返回期间正文变化时不会应用旧结果', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'AI 清理并发巡检仅在桌面项目执行')
  let releaseResponse
  let markRequestStarted
  const responseGate = new Promise((resolve) => {
    releaseResponse = resolve
  })
  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve
  })

  await page.route('**/api/ai/text-task', async (route) => {
    markRequestStarted()
    await responseGate
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        content: '这是过期的 AI 清理结果，不应写入正文。',
        usage: {}
      })
    })
  })

  await openEditor(page, testBookName(testInfo.project.name))
  await page.getByRole('button', { name: 'AI 润色 / 清理' }).click()
  await page.getByRole('menuitem', { name: 'AI 清理乱码 (整章)' }).click()
  await requestStarted
  await expect(page.getByText('整章清理：处理中')).toBeVisible()

  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('用户等待期间新增的正文。')
  releaseResponse()

  await expect(page.getByText('正文在 AI 处理期间已经变化，本次结果未应用')).toBeVisible()
  await expect(editor).toContainText('用户等待期间新增的正文。')
  await expect(editor).not.toContainText('这是过期的 AI 清理结果')
  await expect(page.getByRole('dialog', { name: /AI 润色结果/ })).toHaveCount(0)
})

test('AI 整章清理先显示逐段差异并在确认前创建快照', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'AI 清理预览巡检仅在桌面项目执行')
  const snapshotPayloads = []

  await page.route('**/api/ai/text-task', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        content: '天亮以后，他在书页夹层里发现了一封没有署名的旧信。',
        usage: {}
      })
    })
  })
  await page.route('**/api/editor-snapshots/create', async (route) => {
    const payload = route.request().postDataJSON()
    snapshotPayloads.push(payload)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        snapshot: { id: 'ai-cleanup-snapshot', ...payload }
      })
    })
  })

  await openEditor(page, testBookName(testInfo.project.name))
  const editor = page.locator('.ProseMirror')
  await page.getByRole('button', { name: 'AI 润色 / 清理' }).click()
  await page.getByRole('menuitem', { name: 'AI 清理乱码 (整章)' }).click()

  const preview = page.getByRole('dialog', { name: /AI 润色结果/ })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('逐段差异')
  await expect(preview).toContainText('原文：')
  await expect(preview).toContainText('结果：')
  await expect(editor).not.toContainText('没有署名的旧信')

  await preview.getByRole('button', { name: '确认替换整章' }).click()
  await expect(preview).toBeHidden()
  await expect(editor).toContainText('没有署名的旧信')
  expect(snapshotPayloads).toHaveLength(1)
  expect(snapshotPayloads[0]).toMatchObject({
    reason: 'ai_apply',
    name: 'AI 清理前备份'
  })
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

test('素材保存不会重复提交且失败后保留输入', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '素材写操作巡检仅在桌面项目执行')
  let createRequests = 0
  await page.route('**/api/knowledge/create', async (route) => {
    createRequests += 1
    const payload = await route.request().postDataJSON()
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        createRequests === 1
          ? { success: true, item: { ...payload, id: 'e2e-material-success' } }
          : { success: false, message: '素材保存测试失败' }
      )
    })
  })

  await page.goto('/#/knowledge/materials')
  await page.getByRole('button', { name: '新增素材', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: '新增素材' })
  await dialog.getByLabel('标题').fill('雨夜旧书铺素材')
  await dialog.getByLabel('内容').fill('门后的木楼梯传来脚步声。')
  let saveButton = dialog.getByRole('button', { name: '保存', exact: true })
  await saveButton.evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(saveButton).toBeDisabled()
  await expect(page.getByText('素材已保存')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect.poll(() => createRequests).toBe(1)

  await page.getByRole('button', { name: '新增素材', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: '新增素材' })
  await dialog.getByLabel('标题').fill('失败后保留的素材')
  await dialog.getByLabel('内容').fill('这段内容不能因请求失败而丢失。')
  saveButton = dialog.getByRole('button', { name: '保存', exact: true })
  await saveButton.click()

  await expect(page.getByText('素材保存测试失败')).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('标题')).toHaveValue('失败后保留的素材')
  await expect(dialog.getByLabel('内容')).toHaveValue('这段内容不能因请求失败而丢失。')
  await expect(saveButton).toBeEnabled()
  await expect.poll(() => createRequests).toBe(2)
})

test('提示词保存不会重复提交且失败后保留输入', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提示词写操作巡检仅在桌面项目执行')
  let createRequests = 0
  await page.route('**/api/prompts/create', async (route) => {
    createRequests += 1
    const payload = await route.request().postDataJSON()
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        createRequests === 1
          ? {
              success: true,
              preset: { ...payload.preset, id: 'e2e-prompt-success', scope: 'global' }
            }
          : { success: false, message: '提示词保存测试失败' }
      )
    })
  })

  await page.goto('/#/knowledge/prompts')
  await page.getByRole('button', { name: '新增提示词', exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: '新增提示词' })
  await dialog.getByLabel('标题').fill('场景续写提示词')
  await dialog.getByLabel('Prompt 内容').fill('请续写 {{content}}，保持人物行动连续。')
  let saveButton = dialog.getByRole('button', { name: '保存', exact: true })
  await saveButton.evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(saveButton).toBeDisabled()
  await expect(page.getByText('提示词已保存')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect.poll(() => createRequests).toBe(1)

  await page.getByRole('button', { name: '新增提示词', exact: true }).first().click()
  dialog = page.getByRole('dialog', { name: '新增提示词' })
  await dialog.getByLabel('标题').fill('失败后保留的提示词')
  await dialog.getByLabel('Prompt 内容').fill('请求失败后仍应保留 {{content}}。')
  saveButton = dialog.getByRole('button', { name: '保存', exact: true })
  await saveButton.click()

  await expect(page.getByText('提示词保存测试失败')).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('标题')).toHaveValue('失败后保留的提示词')
  await expect(dialog.getByLabel('Prompt 内容')).toHaveValue('请求失败后仍应保留 {{content}}。')
  await expect(saveButton).toBeEnabled()
  await expect(page.getByText('提示词已保存')).toHaveCount(0)
  await expect.poll(() => createRequests).toBe(2)
})

test('任务队列停止失败时不会重复请求或误报成功', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '任务队列写操作巡检仅在桌面项目执行')
  let cancelRequests = 0
  await mockAgentQueuePage(page, {
    job: {
      id: 'write:e2e-active',
      name: 'write',
      state: 'active',
      data: { bookName: testBookName(testInfo.project.name), chapterName: '第1章' }
    }
  })
  await page.route('**/api/editor-agent/queue-cancel', async (route) => {
    cancelRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: '停止任务测试失败' })
    })
  })

  await page.goto('/#/ai/queue')
  await page.locator('.job-row').click()
  const stopButton = page.locator('#app-main').getByRole('button', { name: '停止', exact: true })
  await stopButton.click()
  const confirm = page.getByRole('dialog', { name: '停止队列任务' })
  await confirm.getByRole('button', { name: '停止', exact: true }).click()
  await stopButton.click({ force: true })

  await expect(page.getByText('停止任务测试失败')).toBeVisible()
  await expect(page.getByText(/任务已停止|已请求停止任务/)).toHaveCount(0)
  await expect(stopButton).toBeEnabled()
  await expect.poll(() => cancelRequests).toBe(1)
})

test('失败任务重试不会重复提交并会刷新状态', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '任务队列写操作巡检仅在桌面项目执行')
  let retryRequests = 0
  let state = 'failed'
  await mockAgentQueuePage(page, {
    getJob: () => ({
      id: 'write:e2e-failed',
      name: 'write',
      state,
      failedReason: state === 'failed' ? '模型服务暂时不可用' : '',
      data: { bookName: testBookName(testInfo.project.name), chapterName: '第2章' }
    })
  })
  await page.route('**/api/editor-agent/queue-retry', async (route) => {
    retryRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    state = 'waiting'
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        retried: true,
        jobId: 'write:e2e-failed',
        previousState: 'failed'
      })
    })
  })

  await page.goto('/#/ai/queue')
  await page.locator('.job-row').click()
  const retryButton = page.locator('#app-main').getByRole('button', { name: '重试', exact: true })
  await retryButton.click()
  const confirm = page.getByRole('dialog', { name: '重试队列任务' })
  await confirm.getByRole('button', { name: '重试', exact: true }).click()
  await retryButton.click({ force: true })

  await expect(page.getByText('任务已重新加入队列')).toBeVisible()
  await expect.poll(() => retryRequests).toBe(1)
  await expect(page.locator('.job-row')).toContainText('等待中')
  await expect(
    page.locator('#app-main').getByRole('button', { name: '重试', exact: true })
  ).toHaveCount(0)
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

test('AI 工坊请求失败后保留输入并恢复操作', async ({ page }) => {
  let taskRequests = 0
  await page.route('**/api/ai/text-task', async (route) => {
    taskRequests += 1
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'AI 服务暂时不可用'
      })
    })
  })

  await page.goto('/#/ai/text-tools')
  const input = page.locator('.main-input-block textarea')
  const originalText = '林舟推开旧书铺的门。'
  await input.fill(originalText)
  await page.getByRole('button', { name: '续写' }).click()

  const status = page.locator('.generation-status-card')
  await expect(status.getByText('生成失败，输入内容已保留')).toBeVisible()
  await expect(status).toContainText('AI 服务暂时不可用')
  await expect(input).toHaveValue(originalText)
  await expect(input).toBeEnabled()
  await expect(page.getByText('生成完成')).toHaveCount(0)
  await expect.poll(() => taskRequests).toBe(1)

  await input.fill(`${originalText}他听见楼上传来脚步声。`)
  await expect(input).toHaveValue(`${originalText}他听见楼上传来脚步声。`)
})

test('AI 图像生成失败后保留提示词且不会重复请求', async ({ page }) => {
  let imageRequests = 0
  await page.route('**/api/ai/image-task', async (route) => {
    imageRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: '图像服务暂时不可用'
      })
    })
  })

  await page.goto('/#/ai/image')
  const input = page.locator('.main-input-block textarea')
  const prompt = '雨夜中的旧书铺，门前挂着一盏暖黄色纸灯。'
  const submitButton = page.getByRole('button', { name: '生成图像' })
  await input.fill(prompt)
  await submitButton.click()
  await submitButton.click({ force: true })

  const status = page.locator('.generation-status-card')
  await expect(status.getByText('生成失败，输入内容已保留')).toBeVisible()
  await expect(status).toContainText('图像服务暂时不可用')
  await expect(input).toHaveValue(prompt)
  await expect(input).toBeEnabled()
  await expect(page.getByText('图片已生成')).toHaveCount(0)
  await expect(page.locator('.result-drawer')).toHaveCount(0)
  await expect.poll(() => imageRequests).toBe(1)
})

test('系统设置分类和主题按钮可以连续操作', async ({ page }) => {
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto('/#/settings/general')
  const settingsNavigation = page.getByRole('navigation', { name: '设置分类' })
  const tabs = [
    ['个人信息', /#\/settings\/profile$/],
    ['编辑器设置', /#\/settings\/editor$/],
    ['主题外观', /#\/settings\/appearance$/],
    ['存储', /#\/settings\/storage$/],
    ['隐私安全', /#\/settings\/privacy$/],
    ['通知', /#\/settings\/notifications$/],
    ['快捷键', /#\/settings\/shortcuts$/],
    ['数据管理', /#\/settings\/data$/],
    ['关于', /#\/settings\/about$/]
  ]

  for (const [name, path] of tabs) {
    await settingsNavigation.getByRole('button', { name, exact: true }).click()
    await expect(page).toHaveURL(path)
    await expect(page.locator('.settings-section')).toBeVisible()
  }

  await settingsNavigation.getByRole('button', { name: '主题外观', exact: true }).click()
  const themeButton = page.getByRole('button', { name: '切换到绿色' })
  await themeButton.click()
  await expect(themeButton).toHaveClass(/active/)
  await expect(page.getByText('已切换到绿色')).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('编辑器设置保存不会重复提交或误报成功', async ({ page }) => {
  let saveRequests = 0
  await page.route('**/api/store/set', async (route) => {
    const payload = route.request().postDataJSON()
    if (payload.key !== 'editorSettings') {
      await route.continue()
      return
    }
    saveRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        key: payload.key,
        message: '测试保存失败'
      })
    })
  })

  await page.goto('/#/settings/editor')
  const saveButton = page.getByRole('button', { name: '保存编辑器设置' })
  await saveButton.click()
  await saveButton.click({ force: true })

  await expect(page.getByText('测试保存失败')).toBeVisible()
  await expect(page.getByText('已保存编辑器设置')).toHaveCount(0)
  await expect.poll(() => saveRequests).toBe(1)
  await expect(saveButton).toBeEnabled()
})

test('书籍导出失败时不会重复提交或误报完成', async ({ page }) => {
  const runtimeErrors = []
  let exportRequests = 0
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await page.route('**/api/export/book', async (route) => {
    exportRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: '测试导出失败'
      })
    })
  })

  await page.goto('/#/import-export/export')
  await page.getByRole('combobox').click()
  await page.getByRole('option').first().click()

  const exportButton = page.locator('.form-grid').getByRole('button', { name: '导出', exact: true })
  await expect(exportButton).toBeEnabled()
  await exportButton.click()
  await exportButton.click({ force: true })

  await expect(page.getByText('测试导出失败')).toBeVisible()
  await expect(page.getByText('导出完成')).toHaveCount(0)
  await expect.poll(() => exportRequests).toBe(1)
  await expect(exportButton).toBeEnabled()
  expect(runtimeErrors).toEqual([])
})

test('创建备份失败时不会重复提交或触发下载', async ({ page }) => {
  const runtimeErrors = []
  let backupRequests = 0
  let downloads = 0
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('download', () => {
    downloads += 1
  })
  await page.route('**/api/backup/create', async (route) => {
    backupRequests += 1
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: '测试备份失败'
      })
    })
  })

  await page.goto('/#/import-export/backup')
  const backupButton = page.getByRole('button', { name: '创建备份', exact: true })
  await expect(backupButton).toBeEnabled()
  await backupButton.click()
  await backupButton.click({ force: true })

  await expect(page.getByText('测试备份失败')).toBeVisible()
  await expect(page.getByText('备份完成')).toHaveCount(0)
  await expect.poll(() => backupRequests).toBe(1)
  await expect(backupButton).toBeEnabled()
  expect(downloads).toBe(0)
  expect(runtimeErrors).toEqual([])
})

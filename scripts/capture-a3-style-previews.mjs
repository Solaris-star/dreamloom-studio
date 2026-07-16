import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5190'
const OUT = path.resolve('reports/a3-style-previews')
fs.mkdirSync(OUT, { recursive: true })

const {
  applyVisualStyle,
  getAvailableVisualStyles
} = await import(
  pathToFileURL(path.resolve('src/renderer/src/service/visualStyleService.js')).href
)

const styles = getAvailableVisualStyles()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
const page = await context.newPage()

// Broad API stubs so SPA can settle
await page.route('**/api/**', async (route) => {
  const url = route.request().url()
  const method = route.request().method()
  let body = { success: true }

  if (url.includes('/api/auth/status') || url.includes('/api/bookshelf-auth/status')) {
    body = {
      success: true,
      authenticated: true,
      passwordConfigured: false,
      openAuth: true
    }
  } else if (url.includes('/api/store/get')) {
    const post = route.request().postDataJSON?.() || {}
    let value = null
    if (post.key === 'config.theme') value = 'light'
    if (post.key === 'config.visualStyle') value = page.__desiredStyle || 'classic'
    if (post.key === 'config.locale') value = 'zh-CN'
    body = { success: true, key: post.key, value }
  } else if (url.includes('/api/store/set')) {
    body = { success: true }
  } else if (url.includes('/api/books')) {
    body = {
      success: true,
      books: [
        {
          id: 'demo-1',
          name: '织梦样例',
          folderName: '织梦样例',
          type: 'urban',
          typeName: '都市',
          totalWords: 12800,
          updatedAt: new Date().toISOString(),
          coverColor: '#6f7a68'
        }
      ]
    }
  } else if (url.includes('/api/statistics') || url.includes('/api/analytics')) {
    body = {
      success: true,
      todayWords: 1280,
      streakDays: 5,
      totalAiCalls: 12,
      totalAiTokens: 48000,
      last7Days: [
        { date: 'd1', delta: 200 },
        { date: 'd2', delta: 400 },
        { date: 'd3', delta: 350 },
        { date: 'd4', delta: 500 },
        { date: 'd5', delta: 280 },
        { date: 'd6', delta: 620 },
        { date: 'd7', delta: 1280 }
      ]
    }
  } else if (method === 'GET' || method === 'POST') {
    body = { success: true, data: [], items: [], list: [], providers: [] }
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
})

async function forceStyle(key) {
  page.__desiredStyle = key
  await page.evaluate((styleKey) => {
    document.documentElement.dataset.visualStyle = styleKey
  }, key)
  // Apply tokens in page context by reusing serialized token map
  const tokensScript = fs.readFileSync(
    'src/renderer/src/service/visualStyleService.js',
    'utf8'
  )
  // safer: call node-side apply against a proxy object then set vars
  const styleProps = {}
  const fakeRoot = {
    style: {
      setProperty(name, value) {
        styleProps[name] = String(value)
      }
    },
    dataset: {},
    setAttribute() {}
  }
  applyVisualStyle(key, fakeRoot)
  await page.evaluate(
    ({ key, props }) => {
      const root = document.documentElement
      root.dataset.visualStyle = key
      root.setAttribute('data-visual-style', key)
      for (const [name, value] of Object.entries(props)) {
        root.style.setProperty(name, value)
      }
    },
    { key, props: styleProps }
  )
}

const results = []
for (const style of styles) {
  await forceStyle(style.key)
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await forceStyle(style.key)
  await page.waitForTimeout(1200)

  // Wait for either bento or home header
  try {
    await page.waitForSelector('.home-page, .dashboard-header, [data-testid="home-bento-strip"]', {
      timeout: 8000
    })
  } catch {
    // continue and still screenshot for diagnosis
  }

  const homeShot = path.join(OUT, `${style.key}-home.png`)
  await page.screenshot({ path: homeShot, fullPage: false })

  await page.goto(`${BASE}/#/settings/appearance`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await forceStyle(style.key)
  await page.waitForTimeout(1000)
  try {
    await page.waitForSelector('.system-settings, .theme-board, [data-testid="visual-style-board"]', {
      timeout: 8000
    })
  } catch {}

  const option = page.locator(`[data-visual-style-option="${style.key}"]`)
  if (await option.count()) {
    await option.first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)
    await forceStyle(style.key)
  }

  const settingsShot = path.join(OUT, `${style.key}-settings.png`)
  await page.screenshot({ path: settingsShot, fullPage: false })

  const info = await page.evaluate(() => ({
    visual: document.documentElement.dataset.visualStyle || '',
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 200),
    hasBento: !!document.querySelector('[data-testid="home-bento-strip"]'),
    hasSettings: !!document.querySelector('.system-settings, .theme-board')
  }))

  results.push({
    style: style.key,
    name: style.name,
    home: homeShot,
    settings: settingsShot,
    homeBytes: fs.statSync(homeShot).size,
    settingsBytes: fs.statSync(settingsShot).size,
    ...info
  })
  console.log(
    'captured',
    style.key,
    'bytes',
    results.at(-1).homeBytes,
    results.at(-1).settingsBytes,
    'visual',
    info.visual,
    'title',
    info.title
  )
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(results, null, 2))
console.log('done', OUT)

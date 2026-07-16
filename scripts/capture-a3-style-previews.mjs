import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5190'
const OUT = path.resolve('reports/a3-style-previews')
fs.mkdirSync(OUT, { recursive: true })

const styles = [
  { key: 'classic', name: '经典和纸' },
  { key: 'apple', name: 'Apple 极简' },
  { key: 'brutal', name: '粗犷野兽' },
  { key: 'pixel', name: '像素复古' }
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } })

await page.route('**/api/auth/status', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, authenticated: true, openAuth: true })
  })
})
await page.route('**/api/bookshelf-auth/status', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, authenticated: true, hasPassword: false })
  })
})
await page.route('**/api/store/get', async (route) => {
  const post = route.request().postDataJSON?.() || {}
  let value = null
  if (post.key === 'config.theme') value = 'light'
  if (post.key === 'config.visualStyle') value = globalThis.__style || 'classic'
  if (post.key === 'config.locale') value = 'zh-CN'
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, key: post.key, value })
  })
})
await page.route('**/api/store/set', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true })
  })
})
await page.route('**/api/**', async (route) => {
  if (route.request().url().includes('/api/store/')) return route.fallback()
  if (route.request().url().includes('/api/auth/')) return route.fallback()
  if (route.request().url().includes('/api/bookshelf-auth/')) return route.fallback()
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [], books: [], items: [], list: [] })
  })
})

const results = []
for (const style of styles) {
  globalThis.__style = style.key
  await page.addInitScript((key) => {
    try {
      localStorage.setItem('config.visualStyle', key)
    } catch {}
  }, style.key)

  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(800)

  // Force apply visual style on document root in case store async lags
  await page.evaluate(async (key) => {
    document.documentElement.dataset.visualStyle = key
    // best-effort: call app store if exposed later; tokens via CSS attribute selectors still apply
    const event = new CustomEvent('dreamloom:set-visual-style', { detail: key })
    window.dispatchEvent(event)
  }, style.key)

  // Prefer settings page for style cards, but also capture home bento
  await page.goto(`${BASE}/#/settings/appearance`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(900)

  // Click the style option if present to ensure CSS variables applied
  const option = page.locator(`[data-visual-style-option="${style.key}"]`)
  if (await option.count()) {
    await option.first().click()
    await page.waitForTimeout(500)
  } else {
    await page.evaluate((key) => {
      document.documentElement.dataset.visualStyle = key
    }, style.key)
  }

  const settingsShot = path.join(OUT, `${style.key}-settings.png`)
  await page.screenshot({ path: settingsShot, fullPage: false })

  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(700)
  await page.evaluate((key) => {
    document.documentElement.dataset.visualStyle = key
  }, style.key)
  const homeShot = path.join(OUT, `${style.key}-home.png`)
  await page.screenshot({ path: homeShot, fullPage: false })

  results.push({
    style: style.key,
    name: style.name,
    settings: settingsShot,
    home: homeShot,
    dataAttr: await page.evaluate(() => document.documentElement.dataset.visualStyle || '')
  })
  console.log('captured', style.key, results.at(-1).dataAttr)
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(results, null, 2))
console.log('done', OUT)

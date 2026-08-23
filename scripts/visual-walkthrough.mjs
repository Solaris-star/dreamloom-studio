#!/usr/bin/env node
/**
 * 用户视角视觉巡查：
 * - 种一本演示书（含章节、作者介绍），走完整用户动线
 * - 每个页面截图（zh-CN，原生视觉）
 * - 收集 console / page error / API 4xx-5xx 响应
 *
 * 用法：node scripts/visual-walkthrough.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const BOOKS_DIR = '/tmp/dreamloom-visual-walkthrough-books'
const RUNTIME_DIR = '/tmp/dreamloom-visual-walkthrough-runtime'
const OUT_DIR = '/tmp/dreamloom-walk'
const outDir = OUT_DIR
mkdirSync(OUT_DIR, { recursive: true })

const HOST = '127.0.0.1'
const PORT = 4188
const BASE = `http://${HOST}:${PORT}`
const WS_PORT = 4189
mkdirSync(BOOKS_DIR, { recursive: true })
mkdirSync(RUNTIME_DIR, { recursive: true })

// --- 启动 dev server ---
function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [
      join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--config', join(projectRoot, 'vite.web.config.mjs'),
      '--host', HOST,
      '--port', String(PORT),
    ], {
      cwd: RUNTIME_DIR,
      env: {
        ...process.env,
        NOVEL_BOOKS_DIR: BOOKS_DIR,
        NOVEL_OPEN_BROWSER: 'false',
        NOVEL_ALLOW_OPEN_AUTH: 'true',
        NOVEL_AUTH_REDIS: 'false',
        NOVEL_AUTH_STRICT: 'false',
        PLAYWRIGHT_TEST: 'true',
        MARKET_TREND_SCHEDULER: '0',
        AGENT_TASK_WS_PORT: String(WS_PORT),
        AGENT_TASK_WS_ENABLED: 'false',
        NO_PROXY: '127.0.0.1,localhost',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let ready = false
    const t = setTimeout(() => { if (!ready) { proc.kill(); reject(new Error('server start timeout')) } }, 30_000)
    proc.stdout.on('data', (buf) => {
      const text = buf.toString()
      if (!ready && /ready in|Local:\s+http/.test(text)) {
        ready = true
        clearTimeout(t)
        setTimeout(() => resolve(proc), 1500)
      }
    })
    proc.stderr.on('data', (buf) => process.stderr.write(buf))
  })
}

const BOOK_NAME = 'DemoBook_StarRiver'
const chapterSamples = [
  { title: '第1章 星陨之夜', content: `暮色下沉，洛河以北的黑石城压进一片铁灰。\n\n沈墨提着一盏灯笼站在城楼下，看着远处那颗坠落的星辰在天际划出一道血色的弧度，最后没入北荒深处。\n\n"又是一颗……" 守城的老兵喃喃。\n\n他收回目光，指节在灯柄上微微用力。这一夜不会有风，只有北荒深处的血腥气慢慢漫过来，像是某种预告。\n\n"小沈。" 老兵忽然开口，"今晚守后半夜，你回去睡吧。"\n\n"再站一刻。" 沈墨说，"星落的时候，总要多看一眼。"\n\n他知道，三年后当星河倒卷、天地翻覆，他会想起今夜站在这里看见的景象。` },
  { title: '第2章 老槐树下的礼物', content: `老槐树下埋着一只猪蹄盒子，盒子里躺着一把生锈的剑。\n\n沈墨把那把剑拿起来的时候，铁锈簌簌地掉，露出里面一线冰白的刃。他记得父亲在旁边说的话：\n\n"剑要生锈，才认得主人的手。"\n\n那年他七岁，听不懂这句话。但他一直记得父亲转身走进雨里，背影被灯影拉得老长。` },
  { title: '第3章 城南书肆', content: `城南书肆的老板娘姓橘，单名一个蓝字，皮肤白皙，性格却像火。\n\n"你又来蹭书看？" 她瞥他一眼。\n\n"我买。" 沈墨从怀里摸出三枚铜钱。\n\n"这点钱，只够看半个时辰。"\n\n"半个时辰就够了。"\n\n他翻开《星野志》，翻到被人折了角的那一页——北荒星图。` },
]

async function seedBooks(baseUrl, fetchFn) {
  await fetchFn(`${baseUrl}/api/books/delete`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: BOOK_NAME }) }).catch(() => {})
  const createResp = await fetchFn(`${baseUrl}/api/books/create`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      name: BOOK_NAME,
      intro: '一只星陨引发的逆天修仙路，主角沈墨自北荒小城起步，踏过魔宗、仙门、妖域三界，见证千年星河倒卷。',
      type: 'xuanhuan',
      typeName: '玄幻',
      bookRole: 'original',
    }),
  })
  const created = await createResp.json()
  if (!created.success) throw new Error('book create failed: ' + JSON.stringify(created))
  for (const c of chapterSamples) {
    const chResp = await fetchFn(`${baseUrl}/api/chapters/create`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ bookName: BOOK_NAME, chapterName: c.title, content: c.content }),
    })
    const ch = await chResp.json().catch(() => ({}))
    if (!ch.success) console.log(' chapter create warn:', ch.message || chResp.status)
  }
}

async function walk(baseUrl, browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
  })
  // Mock auth, since dev server 可能未真正启用 auth
  await context.route('**/api/auth/status', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, authenticated: true, passwordConfigured: false }),
  }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push({ where: page.url(), what: 'pageerror: ' + e.message }))
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ where: page.url(), what: 'console: ' + m.text() }) })
  page.on('response', async (r) => {
    if (r.status() >= 500) errors.push({ where: page.url(), what: `http ${r.status()} ${r.url()}` })
  })

  const kp = encodeURIComponent(BOOK_NAME)
  const stops = [
    { path: '/#/', slug: '01-home' },
    { path: '/#/knowledge', slug: '02-bookshelf' },
    { path: '/#/knowledge/materials', slug: '03-materials' },
    { path: '/#/knowledge/images', slug: '04-gallery' },
    { path: '/#/knowledge/prompts', slug: '05-prompts' },
    { path: `/#/editor/${kp}?name=${kp}`, slug: '06-editor' },
    { path: `/#/timeline?name=${kp}`, slug: '07-timeline' },
    { path: `/#/character-profile?name=${kp}`, slug: '08-character' },
    { path: `/#/dictionary?name=${kp}`, slug: '09-dictionary' },
    { path: `/#/setting-manager?name=${kp}`, slug: '10-setting' },
    { path: `/#/outline-manager?name=${kp}`, slug: '11-outline' },
    { path: `/#/map-list?name=${kp}`, slug: '12-map-list' },
    { path: `/#/relationship-list?name=${kp}`, slug: '13-relationship-list' },
    { path: `/#/events-sequence?name=${kp}`, slug: '14-events-sequence' },
    { path: `/#/organization-list?name=${kp}`, slug: '15-organization-list' },
    { path: '/#/ai/creation-starter', slug: '16-ai-starter' },
    { path: '/#/ai/text-tools', slug: '17-ai-text-tools' },
    { path: '/#/ai/plot', slug: '18-ai-plot' },
    { path: '/#/ai/world', slug: '19-ai-world' },
    { path: '/#/ai/image', slug: '20-ai-image' },
    { path: '/#/ai/queue', slug: '21-ai-queue' },
    { path: '/#/ai/prompts', slug: '22-ai-prompts' },
    { path: '/#/ai/history', slug: '23-ai-history' },
    { path: '/#/market/overview', slug: '24-market' },
    { path: '/#/analytics/overview', slug: '25-analytics' },
    { path: '/#/settings/general', slug: '26-settings' },
    { path: '/#/import-export/import', slug: '27-import-export' },
    { path: `/#/knowledge/books/${encodeURIComponent('__page_check__')}`, slug: '28-asset-studio' },
    { path: '/#/user-guide', slug: '29-user-guide' },
  ]

  const report = []
  for (const stop of stops) {
    const before = errors.length
    await page.goto(baseUrl + stop.path, { waitUntil: 'domcontentloaded' })
    await page.locator('#app').waitFor({ timeout: 15_000 }).catch(() => {})
    // 等真实渲染完成
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const shotPath = join(outDir, `${stop.slug}.png`)
    await page.screenshot({ path: shotPath, fullPage: false })
    const errs = errors.slice(before)
    report.push({ stop: stop.slug, path: stop.path, errors: errs.length, shot: shotPath })
    console.log(`  [${errs.length ? '✗' : '✓'}] ${stop.slug} → ${errs.length} err`)
    errs.forEach((e) => console.log('      ', e.what.slice(0, 200)))
  }

  await context.close()
  return { report, errors }
}

async function main() {
  console.log('[walkthrough] start dev server')
  const server = await startServer()
  console.log('[walkthrough] server up, seed book')
  await seedBooks(BASE, fetch)

  console.log('[walkthrough] launch browser')
  const browser = await chromium.launch({ headless: true })
  let report, errors
  try {
    ({ report, errors } = await walk(BASE, browser))
  } finally {
    await browser.close()
    server.kill()
  }

  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ report, errors }, null, 2))
  console.log('\n[walkthrough] done')
  console.log(`[walkthrough] report: ${join(outDir, 'report.json')}`)
  console.log(`[walkthrough] shots:  ${outDir}`)
  const pages = report.length
  const withErr = report.filter((r) => r.errors > 0).length
  const totalErr = errors.length
  console.log(`[walkthrough] pages=${pages} pages-with-errors=${withErr} total-errors=${totalErr}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

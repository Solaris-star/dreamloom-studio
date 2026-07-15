#!/usr/bin/env node
/**
 * Dreamloom Studio 生产/并发验收压测
 *
 * 场景：
 *  1. 登录 /api/auth/login
 *  2. 书籍列表 /api/books/list
 *  3. 章节读取 /api/chapters/read
 *  4. 章节保存 /api/chapters/save
 *  5. AI 任务提交 /api/ai/text-task 或 /api/editor-agent/queue-write
 *  6. WebSocket 连接 agent-tasks
 *
 * 并发：10 / 50 / 100 / 300
 *
 * 用法：
 *   node tests/load/run-acceptance-load.mjs
 *   BASE_URL=http://127.0.0.1:5174 WS_URL=ws://127.0.0.1:8787 \
 *   LOAD_PASSWORD=xxx LOAD_CONNECTIONS=10,50,100,300 \
 *   node tests/load/run-acceptance-load.mjs
 *
 * 可选：
 *   DURATION_SEC=15
 *   BOOK_NAME=压测验收书
 *   REPORT_DIR=reports/acceptance
 *   SKIP_AI=1
 *   SKIP_WS=1
 *   OPEN_AUTH=1   # 无密码开放认证（本地）
 */

import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

const BASE_URL = String(process.env.BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '')
const WS_URL = String(process.env.WS_URL || 'ws://127.0.0.1:8787').replace(/\/$/, '')
const WS_PATH = String(process.env.AGENT_TASK_WS_PATH || '/agent-tasks')
const PASSWORD = process.env.LOAD_PASSWORD || process.env.NOVEL_BOOKSHELF_PASSWORD || 'load-test-password-123'
const BOOK_NAME = process.env.BOOK_NAME || '压测验收书'
const VOLUME_NAME = process.env.VOLUME_NAME || '正文'
const CHAPTER_NAME = process.env.CHAPTER_NAME || '第1章'
const DURATION_SEC = Number(process.env.DURATION_SEC || 15)
const CONNECTIONS = String(process.env.LOAD_CONNECTIONS || '10,50,100,300')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const REPORT_DIR = resolve(projectRoot, process.env.REPORT_DIR || 'reports/acceptance')
const SKIP_AI = ['1', 'true', 'yes'].includes(String(process.env.SKIP_AI || '').toLowerCase())
const SKIP_WS = ['1', 'true', 'yes'].includes(String(process.env.SKIP_WS || '').toLowerCase())
const OPEN_AUTH = ['1', 'true', 'yes'].includes(String(process.env.OPEN_AUTH || '').toLowerCase())

mkdirSync(REPORT_DIR, { recursive: true })
mkdirSync(join(REPORT_DIR, 'screenshots'), { recursive: true })

function nowIso() {
  return new Date().toISOString()
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function summarizeLatencies(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0
  }
}

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() || []
  if (raw.length) return raw
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function extractSessionCookie(setCookieHeaders) {
  for (const line of setCookieHeaders) {
    const match = String(line).match(/dreamloom_session=([^;]+)/)
    if (match) return `dreamloom_session=${match[1]}`
  }
  return ''
}

async function jsonRequest(url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers
    }
  }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const started = performance.now()
  const response = await fetch(url, init)
  const text = await response.text()
  const elapsed = performance.now() - started
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return {
    ok: response.ok,
    status: response.status,
    json,
    headers: response.headers,
    elapsed,
    setCookie: parseSetCookie(response.headers)
  }
}

async function login() {
  if (OPEN_AUTH) {
    const status = await jsonRequest(`${BASE_URL}/api/auth/status`)
    return { cookie: '', status, openAuth: true }
  }
  const result = await jsonRequest(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: { password: PASSWORD }
  })
  const cookie = extractSessionCookie(result.setCookie)
  return { cookie, status: result, openAuth: false }
}

async function ensureSeedData(cookie) {
  // create book if missing
  const list = await jsonRequest(`${BASE_URL}/api/books/list`, {
    method: 'POST',
    body: {},
    cookie
  })
  const books = list.json?.books || list.json?.items || list.json?.data || []
  const exists = Array.isArray(books)
    ? books.some((b) => (b?.name || b?.bookName || b) === BOOK_NAME)
    : false

  if (!exists) {
    const created = await jsonRequest(`${BASE_URL}/api/books/create`, {
      method: 'POST',
      body: {
        name: BOOK_NAME,
        intro: '并发验收压测种子书',
        type: 'xuanhuan',
        typeName: '玄幻',
        bookRole: 'original'
      },
      cookie
    })
    if (!created.ok && created.status !== 409) {
      console.warn('[seed] create book failed', created.status, created.json)
    }
  }

  const saved = await jsonRequest(`${BASE_URL}/api/chapters/save`, {
    method: 'POST',
    body: {
      bookName: BOOK_NAME,
      volumeName: VOLUME_NAME,
      chapterName: CHAPTER_NAME,
      content: `压测种子内容 ${nowIso()}\n夜雨落在青石长街上。`
    },
    cookie
  })
  if (!saved.ok) {
    console.warn('[seed] save chapter failed', saved.status, saved.json)
  }
  return { list, saved }
}

async function runAutocannonScenario({
  name,
  path,
  method = 'POST',
  body,
  cookie,
  connections,
  duration = DURATION_SEC
}) {
  const autocannon = (await import('autocannon')).default
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json'
  }
  if (cookie) headers.cookie = cookie

  const result = await autocannon({
    url: `${BASE_URL}${path}`,
    connections,
    duration,
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    timeout: 30,
    pipelining: 1
  })

  const latency = result.latency || {}
  const requests = result.requests || {}
  const errors = Number(result.errors || 0) + Number(result.timeouts || 0) + Number(result.non2xx || 0)
  const total = Number(requests.total || 0)
  // autocannon 提供 p50/p90/p97_5/p99，不直接给 p95；用 p97_5 近似 p95 并保留 p90
  const p50 = Number(latency.p50 || 0)
  const p90 = Number(latency.p90 || 0)
  const p97_5 = Number(latency.p97_5 || 0)
  const p99 = Number(latency.p99 || 0)
  return {
    name,
    path,
    method,
    connections,
    duration,
    throughputRps: Number(requests.average || 0),
    totalRequests: total,
    errors,
    timeouts: Number(result.timeouts || 0),
    non2xx: Number(result.non2xx || 0),
    errorRate: total ? errors / total : 0,
    latencyMs: {
      p50,
      p90,
      p95: p97_5 || p90, // 近似
      p97_5,
      p99,
      mean: Number(latency.mean || latency.average || 0),
      max: Number(latency.max || 0)
    },
    throughputBytes: Number(result.throughput?.average || 0),
    raw: {
      '2xx': result['2xx'],
      '4xx': result['4xx'],
      '5xx': result['5xx']
    }
  }
}

async function measureLoginBurst(connections, durationSec = Math.min(DURATION_SEC, 10)) {
  const samples = []
  let errors = 0
  let ok = 0
  const endAt = Date.now() + durationSec * 1000
  const workers = Array.from({ length: connections }, async () => {
    while (Date.now() < endAt) {
      try {
        const res = await jsonRequest(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          body: { password: PASSWORD }
        })
        samples.push(res.elapsed)
        if (res.ok && res.json?.success !== false) ok += 1
        else errors += 1
      } catch {
        errors += 1
      }
    }
  })
  await Promise.all(workers)
  const total = ok + errors
  const lat = summarizeLatencies(samples)
  return {
    name: 'login',
    path: '/api/auth/login',
    method: 'POST',
    connections,
    duration: durationSec,
    throughputRps: total / durationSec,
    totalRequests: total,
    errors,
    timeouts: 0,
    non2xx: errors,
    errorRate: total ? errors / total : 0,
    latencyMs: {
      p50: lat.p50,
      p95: lat.p95,
      p99: lat.p99,
      mean: lat.avg,
      max: lat.max
    }
  }
}

async function measureWebsocket(connections, holdMs = 5000, cookie = '') {
  const samples = []
  let errors = 0
  let ok = 0

  // 优先使用 progress-server 返回的 accessToken URL；开放认证下 cookie 也可
  let url = `${WS_URL}${WS_PATH}?bookName=${encodeURIComponent(BOOK_NAME)}`
  try {
    const info = await jsonRequest(`${BASE_URL}/api/editor-agent/progress-server`, {
      method: 'POST',
      body: {},
      cookie
    })
    if (info.json?.url) {
      const u = new URL(info.json.url)
      u.searchParams.set('bookName', BOOK_NAME)
      url = u.toString()
    }
  } catch {
    // fall back to raw WS_URL
  }

  async function oneConnect() {
    const started = performance.now()
    return new Promise((resolvePromise) => {
      let settled = false
      let ws
      try {
        // Node 22+ 全局 WebSocket；否则回退 undici
        const WSImpl = globalThis.WebSocket
        if (!WSImpl) throw new Error('WebSocket API unavailable in this Node runtime')
        ws = new WSImpl(url)
      } catch (error) {
        errors += 1
        samples.push(performance.now() - started)
        resolvePromise({ ok: false, error: String(error?.message || error) })
        return
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        errors += 1
        samples.push(performance.now() - started)
        try {
          ws.close()
        } catch {}
        resolvePromise({ ok: false, error: 'timeout' })
      }, 8000)
      ws.addEventListener('open', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        ok += 1
        samples.push(performance.now() - started)
        setTimeout(() => {
          try {
            ws.close()
          } catch {}
          resolvePromise({ ok: true })
        }, holdMs)
      })
      ws.addEventListener('error', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        errors += 1
        samples.push(performance.now() - started)
        resolvePromise({ ok: false, error: 'ws-error' })
      })
    })
  }

  const batchSize = Math.min(connections, 50)
  const results = []
  for (let i = 0; i < connections; i += batchSize) {
    const slice = Array.from({ length: Math.min(batchSize, connections - i) }, () => oneConnect())
    results.push(...(await Promise.all(slice)))
  }
  const lat = summarizeLatencies(samples)
  return {
    name: 'websocket',
    path: WS_PATH,
    method: 'WS',
    connections,
    duration: holdMs / 1000,
    throughputRps: ok / Math.max(1, holdMs / 1000),
    totalRequests: connections,
    errors,
    timeouts: results.filter((r) => r.error === 'timeout').length,
    non2xx: errors,
    errorRate: connections ? errors / connections : 0,
    latencyMs: {
      p50: lat.p50,
      p95: lat.p95,
      p99: lat.p99,
      mean: lat.avg,
      max: lat.max
    },
    connected: ok
  }
}

async function sampleProcessMetrics(pid) {
  if (!pid) return null
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('ps', ['-p', String(pid), '-o', '%cpu=,%mem=,rss='], {
      encoding: 'utf8'
    }).trim()
    const [cpu, mem, rss] = out.split(/\s+/).map(Number)
    return { pid, cpuPercent: cpu, memPercent: mem, rssKb: rss }
  } catch {
    return null
  }
}

async function sampleRedis() {
  try {
    const { execFileSync } = await import('node:child_process')
    const ping = execFileSync('redis-cli', ['ping'], { encoding: 'utf8' }).trim()
    const info = execFileSync('redis-cli', ['info', 'memory'], { encoding: 'utf8' })
    const used = (info.match(/used_memory_human:([^\r\n]+)/) || [])[1] || ''
    const clients = execFileSync('redis-cli', ['info', 'clients'], { encoding: 'utf8' })
    const connected = (clients.match(/connected_clients:(\d+)/) || [])[1] || ''
    return { ping, usedMemoryHuman: used.trim(), connectedClients: Number(connected) || 0 }
  } catch (error) {
    return { ping: 'FAIL', error: String(error?.message || error) }
  }
}

async function measureEventLoopDelay(ms = 1000) {
  const { monitorEventLoopDelay } = await import('node:perf_hooks')
  const h = monitorEventLoopDelay({ resolution: 10 })
  h.enable()
  await new Promise((r) => setTimeout(r, ms))
  h.disable()
  return {
    meanMs: h.mean / 1e6,
    p50Ms: h.percentile(50) / 1e6,
    p95Ms: h.percentile(95) / 1e6,
    p99Ms: h.percentile(99) / 1e6,
    maxMs: h.max / 1e6
  }
}

async function verifyWriteIntegrity(cookie, marker) {
  const content = `并发写校验 ${marker} ${randomBytes(4).toString('hex')}`
  const save = await jsonRequest(`${BASE_URL}/api/chapters/save`, {
    method: 'POST',
    body: {
      bookName: BOOK_NAME,
      volumeName: VOLUME_NAME,
      chapterName: CHAPTER_NAME,
      content
    },
    cookie
  })
  const read = await jsonRequest(`${BASE_URL}/api/chapters/read`, {
    method: 'POST',
    body: {
      bookName: BOOK_NAME,
      volumeName: VOLUME_NAME,
      chapterName: CHAPTER_NAME
    },
    cookie
  })
  const text = String(read.json?.content || read.json?.data?.content || '')
  return {
    saveOk: save.ok && save.json?.success !== false,
    readOk: read.ok,
    lost: !text.includes(content),
    contentLength: text.length,
    marker
  }
}

async function main() {
  const startedAt = nowIso()
  console.log(`[load] base=${BASE_URL} ws=${WS_URL}${WS_PATH}`)
  console.log(`[load] connections=${CONNECTIONS.join(',')} duration=${DURATION_SEC}s`)

  const health = await jsonRequest(`${BASE_URL}/api/auth/status`).catch((e) => ({
    ok: false,
    error: String(e)
  }))
  if (!health.ok && !health.status) {
    console.error('[load] 服务不可达，请先启动 web 服务', health)
    process.exit(2)
  }

  const loginResult = await login()
  let cookie = loginResult.cookie
  if (!OPEN_AUTH && !cookie && loginResult.status?.status === 503) {
    // 尝试设置密码（仅当开放/本地允许 access-key）
    console.warn('[load] 登录返回 503，尝试 /api/auth/access-key 设置密码')
    const setKey = await jsonRequest(`${BASE_URL}/api/auth/access-key`, {
      method: 'POST',
      body: { password: PASSWORD, accessKey: PASSWORD }
    })
    console.warn('[load] access-key result', setKey.status, setKey.json)
    const retry = await login()
    cookie = retry.cookie
  }
  if (!OPEN_AUTH && !cookie) {
    // open auth 环境：无 cookie 也可能已认证
    const status = await jsonRequest(`${BASE_URL}/api/auth/status`, { cookie })
    if (!status.json?.authenticated) {
      console.error('[load] 无法登录，status=', loginResult.status?.status, loginResult.status?.json)
      process.exit(3)
    }
  }
  process.env.LOAD_COOKIE = cookie

  await ensureSeedData(cookie)
  const redisBefore = await sampleRedis()
  const eventLoopIdle = await measureEventLoopDelay(500)

  const report = {
    startedAt,
    env: {
      baseUrl: BASE_URL,
      wsUrl: `${WS_URL}${WS_PATH}`,
      bookName: BOOK_NAME,
      durationSec: DURATION_SEC,
      connections: CONNECTIONS,
      openAuth: OPEN_AUTH,
      skipAi: SKIP_AI,
      skipWs: SKIP_WS
    },
    baseline: {
      authStatus: health.json || health,
      redis: redisBefore,
      eventLoopIdleMs: eventLoopIdle
    },
    scenarios: [],
    integrity: [],
    notes: []
  }

  for (const connections of CONNECTIONS) {
    console.log(`\n[load] === connections=${connections} ===`)
    const group = { connections, results: [], metrics: {} }

    // 1 login
    if (OPEN_AUTH) {
      group.results.push({
        name: 'login',
        skipped: true,
        reason: 'OPEN_AUTH=1，跳过密码登录压测'
      })
    } else {
      group.results.push(await measureLoginBurst(Math.min(connections, 100)))
    }

    // 2 books list
    group.results.push(
      await runAutocannonScenario({
        name: 'books-list',
        path: '/api/books/list',
        method: 'POST',
        body: {},
        cookie,
        connections
      })
    )

    // 3 chapter read
    group.results.push(
      await runAutocannonScenario({
        name: 'chapter-read',
        path: '/api/chapters/read',
        method: 'POST',
        body: {
          bookName: BOOK_NAME,
          volumeName: VOLUME_NAME,
          chapterName: CHAPTER_NAME
        },
        cookie,
        connections
      })
    )

    // 4 chapter save
    group.results.push(
      await runAutocannonScenario({
        name: 'chapter-save',
        path: '/api/chapters/save',
        method: 'POST',
        body: {
          bookName: BOOK_NAME,
          volumeName: VOLUME_NAME,
          chapterName: CHAPTER_NAME,
          content: `压测保存 c=${connections} t=${Date.now()}\n` + '字'.repeat(200)
        },
        cookie,
        connections
      })
    )

    // 5 AI task submit
    if (SKIP_AI) {
      group.results.push({ name: 'ai-task', skipped: true, reason: 'SKIP_AI=1' })
    } else {
      // 优先 text-task（不依赖 worker）；失败再记 queue-write
      group.results.push(
        await runAutocannonScenario({
          name: 'ai-text-task',
          path: '/api/ai/text-task',
          method: 'POST',
          body: {
            feature: 'polish',
            text: '夜雨落在青石长街上，林舟推开了旧书铺的门。',
            bookName: BOOK_NAME
          },
          cookie,
          connections: Math.min(connections, 50),
          duration: Math.min(DURATION_SEC, 10)
        })
      )
      group.results.push(
        await runAutocannonScenario({
          name: 'ai-queue-write',
          path: '/api/editor-agent/queue-write',
          method: 'POST',
          body: {
            bookName: BOOK_NAME,
            volumeName: VOLUME_NAME,
            chapterName: CHAPTER_NAME,
            prompt: '写一段雨夜开场，不超过 80 字',
            taskId: `load-${connections}-${Date.now()}`
          },
          cookie,
          connections: Math.min(connections, 30),
          duration: Math.min(DURATION_SEC, 8)
        })
      )
    }

    // 6 websocket
    if (SKIP_WS) {
      group.results.push({ name: 'websocket', skipped: true, reason: 'SKIP_WS=1' })
    } else {
      group.results.push(await measureWebsocket(connections, 3000, cookie))
    }

    group.metrics.redis = await sampleRedis()
    group.metrics.eventLoopMs = await measureEventLoopDelay(800)
    group.integrity = await verifyWriteIntegrity(cookie, `c${connections}`)
    report.integrity.push(group.integrity)
    report.scenarios.push(group)

    for (const r of group.results) {
      if (r.skipped) {
        console.log(`  - ${r.name}: SKIP (${r.reason})`)
        continue
      }
      console.log(
        `  - ${r.name}: rps=${(r.throughputRps || 0).toFixed(1)} p50=${r.latencyMs?.p50?.toFixed?.(1) ?? r.latencyMs?.p50} p95=${r.latencyMs?.p95?.toFixed?.(1) ?? r.latencyMs?.p95} p99=${r.latencyMs?.p99?.toFixed?.(1) ?? r.latencyMs?.p99} err=${((r.errorRate || 0) * 100).toFixed(2)}%`
      )
    }
    console.log(
      `  integrity lost=${group.integrity.lost} saveOk=${group.integrity.saveOk} redis=${group.metrics.redis?.ping}`
    )
  }

  report.finishedAt = nowIso()
  report.redisAfter = await sampleRedis()

  const jsonPath = join(REPORT_DIR, `load-results-${Date.now()}.json`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  const mdPath = join(REPORT_DIR, 'load-results.md')
  writeFileSync(mdPath, renderMarkdown(report))
  console.log(`\n[load] report: ${jsonPath}`)
  console.log(`[load] markdown: ${mdPath}`)
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# 并发压测结果')
  lines.push('')
  lines.push(`- 开始：${report.startedAt}`)
  lines.push(`- 结束：${report.finishedAt}`)
  lines.push(`- BASE_URL：${report.env.baseUrl}`)
  lines.push(`- WS：${report.env.wsUrl}`)
  lines.push(`- 时长：${report.env.durationSec}s / 组`)
  lines.push('')
  lines.push('## 基线')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(report.baseline, null, 2))
  lines.push('```')
  lines.push('')
  for (const group of report.scenarios) {
    lines.push(`## 并发 ${group.connections}`)
    lines.push('')
    lines.push('| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |')
    for (const r of group.results) {
      if (r.skipped) {
        lines.push(`| ${r.name} | - | - | - | - | - | SKIP: ${r.reason} |`)
        continue
      }
      lines.push(
        `| ${r.name} | ${(r.throughputRps || 0).toFixed(1)} | ${Number(r.latencyMs?.p50 || 0).toFixed(1)} | ${Number(r.latencyMs?.p95 || 0).toFixed(1)} | ${Number(r.latencyMs?.p99 || 0).toFixed(1)} | ${((r.errorRate || 0) * 100).toFixed(2)}% | errors=${r.errors || 0} |`
      )
    }
    lines.push('')
    lines.push(
      `- 写入完整性：lost=${group.integrity?.lost} saveOk=${group.integrity?.saveOk} readOk=${group.integrity?.readOk}`
    )
    lines.push(`- Redis：\`${JSON.stringify(group.metrics?.redis || {})}\``)
    lines.push(
      `- Event Loop(ms)：mean=${group.metrics?.eventLoopMs?.meanMs?.toFixed?.(2)} p95=${group.metrics?.eventLoopMs?.p95Ms?.toFixed?.(2)} p99=${group.metrics?.eventLoopMs?.p99Ms?.toFixed?.(2)}`
    )
    lines.push('')
  }
  return lines.join('\n')
}

main().catch((error) => {
  console.error('[load] fatal', error)
  process.exit(1)
})

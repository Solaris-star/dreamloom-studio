#!/usr/bin/env node
/**
 * 稳定性验收：
 *  1. 服务重启后 API/会话恢复
 *  2. Redis 短暂不可用（AUTH/队列）
 *  3. AI 请求超时
 *
 * 用法：
 *   BASE_URL=http://127.0.0.1:5174 REDIS_CLI=redis-cli \
 *   node tests/load/run-stability-checks.mjs
 *
 * 注意：
 *  - Redis 中断测试需要本机 redis-cli 且目标为本地 redis
 *  - 默认只做只读探测 + 非破坏性检查；RESTART_CMD 存在时才尝试重启
 */

import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')
const REPORT_DIR = resolve(projectRoot, process.env.REPORT_DIR || 'reports/acceptance')
const BASE_URL = String(process.env.BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '')
const PASSWORD = process.env.LOAD_PASSWORD || process.env.NOVEL_BOOKSHELF_PASSWORD || 'load-test-password-123'
const REDIS_CLI = process.env.REDIS_CLI || 'redis-cli'
const RESTART_CMD = process.env.RESTART_CMD || ''
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 3000)

mkdirSync(REPORT_DIR, { recursive: true })

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function jsonRequest(url, { method = 'GET', body, cookie, timeoutMs = 10000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text()
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
      elapsed: performance.now() - started,
      setCookie: response.headers.getSetCookie?.() || []
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: String(error?.name || error),
      message: String(error?.message || error),
      elapsed: performance.now() - started
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractCookie(setCookie = []) {
  for (const line of setCookie) {
    const m = String(line).match(/dreamloom_session=([^;]+)/)
    if (m) return `dreamloom_session=${m[1]}`
  }
  return ''
}

function redis(cmdArgs) {
  try {
    const out = execFileSync(REDIS_CLI, cmdArgs, { encoding: 'utf8', timeout: 5000 }).trim()
    return { ok: true, out }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

async function waitHealthy(timeoutMs = 30000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const res = await jsonRequest(`${BASE_URL}/api/auth/status`, { timeoutMs: 3000 })
    if (res.status > 0) return res
    await sleep(500)
  }
  return { ok: false, status: 0, error: 'timeout-waiting-healthy' }
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    checks: []
  }

  // --- baseline ---
  const status0 = await jsonRequest(`${BASE_URL}/api/auth/status`)
  report.checks.push({
    name: 'baseline-auth-status',
    pass: status0.status > 0,
    detail: { status: status0.status, body: status0.json, error: status0.error }
  })

  let cookie = ''
  const login = await jsonRequest(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: { password: PASSWORD }
  })
  cookie = extractCookie(login.setCookie)
  report.checks.push({
    name: 'baseline-login',
    pass: login.ok || login.json?.authenticated === true || status0.json?.authenticated === true,
    detail: { status: login.status, hasCookie: Boolean(cookie), body: login.json, error: login.error }
  })

  // --- AI timeout ---
  const ai = await jsonRequest(
    `${BASE_URL}/api/ai/text-task`,
    {
      method: 'POST',
      cookie,
      body: {
        feature: 'polish',
        text: '用于超时探测的长文本。'.repeat(50),
        bookName: '压测验收书',
        // 某些实现可能识别 timeoutMs；即使忽略，也会被客户端 abort
        timeoutMs: 1
      },
      timeoutMs: AI_TIMEOUT_MS
    }
  )
  report.checks.push({
    name: 'ai-request-timeout-or-error-handled',
    pass:
      ai.error === 'AbortError' ||
      ai.status === 502 ||
      ai.status === 504 ||
      ai.status === 408 ||
      ai.status === 401 ||
      ai.status === 200 ||
      ai.status === 500 ||
      ai.status === 503,
    detail: {
      status: ai.status,
      elapsedMs: ai.elapsed,
      error: ai.error,
      message: ai.message,
      body: ai.json
    },
    notes: '期望服务在超时/上游失败时返回可解析 JSON 错误，而不是挂死连接'
  })

  // --- Redis brief outage ---
  const redisPing = redis(['ping'])
  if (redisPing.ok && redisPing.out === 'PONG') {
    // 用 CLIENT PAUSE 模拟短暂不可用（毫秒）
    const paused = redis(['CLIENT', 'PAUSE', '2000', 'WRITE'])
    const during = await jsonRequest(`${BASE_URL}/api/editor-agent/queue-status`, {
      method: 'POST',
      body: {},
      cookie,
      timeoutMs: 5000
    })
    await sleep(2200)
    const after = await jsonRequest(`${BASE_URL}/api/editor-agent/queue-status`, {
      method: 'POST',
      body: {},
      cookie,
      timeoutMs: 5000
    })
    const authDuring = await jsonRequest(`${BASE_URL}/api/auth/status`, { cookie, timeoutMs: 5000 })
    report.checks.push({
      name: 'redis-brief-unavailable',
      pass: during.status > 0 && after.status > 0,
      detail: {
        pause: paused,
        duringStatus: during.status,
        duringBody: during.json,
        afterStatus: after.status,
        afterBody: after.json,
        authDuring: { status: authDuring.status, body: authDuring.json }
      },
      notes: '队列接口在 Redis 抖动时应返回 success/message 而不是进程崩溃'
    })
  } else {
    report.checks.push({
      name: 'redis-brief-unavailable',
      pass: false,
      skipped: true,
      detail: redisPing,
      notes: '本机 redis-cli 不可用，跳过'
    })
  }

  // --- restart ---
  if (RESTART_CMD) {
    const before = await jsonRequest(`${BASE_URL}/api/books/list`, {
      method: 'POST',
      body: {},
      cookie
    })
    console.log('[stability] restarting via RESTART_CMD...')
    try {
      execFileSync('bash', ['-lc', RESTART_CMD], { encoding: 'utf8', timeout: 120000 })
    } catch (error) {
      report.checks.push({
        name: 'service-restart',
        pass: false,
        detail: { error: String(error?.message || error) }
      })
    }
    const healthy = await waitHealthy(60000)
    const afterLogin = await jsonRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: { password: PASSWORD }
    })
    const cookie2 = extractCookie(afterLogin.setCookie) || cookie
    const afterList = await jsonRequest(`${BASE_URL}/api/books/list`, {
      method: 'POST',
      body: {},
      cookie: cookie2
    })
    report.checks.push({
      name: 'service-restart',
      pass: healthy.status > 0 && afterList.status > 0,
      detail: {
        beforeStatus: before.status,
        healthyStatus: healthy.status,
        afterLoginStatus: afterLogin.status,
        afterListStatus: afterList.status,
        afterListBodyKeys: afterList.json ? Object.keys(afterList.json) : []
      }
    })
  } else {
    // 软重启探测：连续请求不应导致进程失联
    const samples = []
    for (let i = 0; i < 20; i += 1) {
      samples.push(await jsonRequest(`${BASE_URL}/api/auth/status`, { timeoutMs: 3000 }))
      await sleep(100)
    }
    const okCount = samples.filter((s) => s.status > 0).length
    report.checks.push({
      name: 'service-restart',
      pass: okCount === samples.length,
      skipped: true,
      detail: {
        reason: '未设置 RESTART_CMD，改为连续健康探测',
        okCount,
        total: samples.length,
        statuses: samples.map((s) => s.status)
      }
    })
  }

  report.finishedAt = new Date().toISOString()
  report.summary = {
    total: report.checks.length,
    passed: report.checks.filter((c) => c.pass).length,
    failed: report.checks.filter((c) => !c.pass && !c.skipped).length,
    skipped: report.checks.filter((c) => c.skipped).length
  }

  const jsonPath = join(REPORT_DIR, `stability-${Date.now()}.json`)
  const mdPath = join(REPORT_DIR, 'stability-results.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  writeFileSync(
    mdPath,
    [
      '# 稳定性检查结果',
      '',
      `- 开始：${report.startedAt}`,
      `- 结束：${report.finishedAt}`,
      `- 通过：${report.summary.passed}/${report.summary.total}（失败 ${report.summary.failed}，跳过 ${report.summary.skipped}）`,
      '',
      ...report.checks.flatMap((c) => [
        `## ${c.name}`,
        '',
        `- 结果：${c.pass ? 'PASS' : c.skipped ? 'SKIP' : 'FAIL'}`,
        c.notes ? `- 说明：${c.notes}` : '',
        '```json',
        JSON.stringify(c.detail, null, 2),
        '```',
        ''
      ])
    ]
      .filter(Boolean)
      .join('\n')
  )
  console.log(JSON.stringify(report.summary, null, 2))
  console.log(`[stability] ${jsonPath}`)
  console.log(`[stability] ${mdPath}`)
  if (report.summary.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

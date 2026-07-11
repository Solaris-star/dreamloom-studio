import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import marketService from '../src/main/services/marketService.js'

const args = process.argv.slice(2)

function argValue(name, fallback = '') {
  const prefix = `--${name}=`
  const direct = args.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = args.indexOf(`--${name}`)
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1]
  return fallback
}

function hasFlag(name) {
  return args.includes(`--${name}`)
}

function splitList(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

function numberValue(name, fallback) {
  const value = Number(argValue(name, fallback))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function usage() {
  return [
    '用法：node scripts/check-market-sources.mjs [options]',
    '',
    'Options:',
    '  --sources qidian,fanqie,qimao  指定公开来源',
    '  --books-dir <path>             指定书库目录；未传时读取 NOVEL_BOOKS_DIR，仍未配置则使用临时目录',
    '  --limit 8                      每个来源输出条数',
    '  --force                        跳过缓存，重新请求原站',
    '  --twice                        连续运行两次，用第二次验证持久缓存命中',
    '  --timeout-ms 12000             单个请求超时',
    '  --request-interval-ms 800      同一来源多个 URL 之间的等待毫秒数'
  ].join('\n')
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(usage())
  process.exit(0)
}

const sources = splitList(argValue('sources'), ['qidian', 'fanqie', 'qimao'])
const limit = numberValue('limit', 8)
const timeoutMs = numberValue('timeout-ms', 12000)
const requestIntervalMs = numberValue(
  'request-interval-ms',
  Number(process.env.MARKET_TREND_REQUEST_INTERVAL_MS || 800)
)
const force = hasFlag('force')
const twice = hasFlag('twice')
const booksDir = argValue(
  'books-dir',
  process.env.NOVEL_BOOKS_DIR || fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-market-live-'))
)

function formatSourceResult(result = {}) {
  const cache = result.fromCache ? `${result.cacheType || 'cache'} hit` : 'live fetch'
  const lines = [
    `来源：${result.source}`,
    `状态：${result.success ? 'success' : result.skipped ? 'skipped' : 'error'}，${cache}`,
    `时间：${result.fetchedAt || result.cacheCreatedAt || ''}`,
    `URL：${(result.sourceUrls || []).join(' | ') || '无'}`,
    `条数：${Array.isArray(result.topics) ? result.topics.length : 0}，等待次数：${result.waitCount || 0}，重试次数：${result.retryCount || 0}`
  ]
  const failures = Array.isArray(result.failures) ? result.failures : []
  for (const failure of failures.slice(0, 5)) {
    lines.push(
      `失败：${failure.errorType || 'unknown'} ${failure.url || ''} ${failure.message || ''}`
    )
  }
  return lines.join('\n')
}

function formatTopic(topic = {}, index) {
  const rank = topic.extra?.rank || index + 1
  const title = topic.keyword || topic.title || '未命名'
  const author = topic.extra?.author ? `，作者：${topic.extra.author}` : ''
  const category = topic.extra?.category ? `，分类：${topic.extra.category}` : ''
  const heat = topic.extra?.rawHeat ? `，热度：${topic.extra.rawHeat}` : ''
  return `${rank}. ${title}${author}${category}${heat}\n   ${topic.url || '无链接'}`
}

async function runOnce(label, runOptions = {}) {
  console.log(`\n# ${label}`)
  const result = await marketService.refreshMarketTrends(booksDir, {
    sources,
    force: runOptions.force,
    timeoutMs,
    requestIntervalMs
  })
  console.log(`书库目录：${booksDir}`)
  console.log(
    `整体状态：${result.success ? 'success' : 'error'}，清理缓存：${result.cachePrune?.removed || 0}`
  )
  for (const sourceResult of result.results || []) {
    console.log('\n' + formatSourceResult(sourceResult))
    const topics = marketService.listHotTopics(booksDir, {
      source: sourceResult.source,
      limit,
      sortBy: 'capturedAt'
    })
    for (const [index, topic] of topics.entries()) {
      console.log(formatTopic(topic, index))
    }
  }
  return result
}

try {
  await runOnce(force ? '真实来源检查' : '真实来源检查（允许缓存）', { force })
  if (twice) {
    await runOnce('缓存命中检查', { force: false })
  }
} catch (error) {
  console.error(`市场来源检查失败：${error.message || error}`)
  process.exit(1)
}

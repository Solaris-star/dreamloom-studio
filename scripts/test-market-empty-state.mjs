import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import marketService from '../src/main/services/marketService.js'
import marketTrendService from '../src/main/services/marketTrendService.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-market-empty-ux-'))

try {
  const overview = await marketService.getMarketOverview(root, { channel: 'all' })
  assert.equal(overview.success, true)
  assert.equal(overview.dataMode, 'example')
  assert.ok(overview.writableDirections.length > 0)
  assert.ok(overview.writableDirections.every((item) => item.isExample === true))
  assert.ok(overview.writableDirections.every((item) => item.heatScore == null))
  assert.ok(overview.writableDirections.every((item) => item.opportunityScore == null))
  assert.equal(overview.opportunityIndex.isExampleOnly, true)
  assert.equal(overview.opportunityIndex.grade, '示例')
  assert.match(String(overview.opportunityIndex.summary || ''), /不是实时|示例/)
  assert.equal(overview.emptyState?.canRefresh, true)
  assert.equal(overview.emptyState?.canCreate, true)
  assert.equal(overview.emptyState?.canImport, true)

  const offline = await marketService.getMarketOverview(root, { channel: 'all', offline: true })
  assert.equal(offline.emptyState?.reason, 'offline')
  assert.match(String(offline.emptyState?.title || ''), /离线/)

  const rank = await marketService.getMarketHotRank(root, { channel: 'all' })
  assert.equal(rank.dataMode, 'example')
  assert.ok(rank.items.every((item) => item.isExample === true))

  const cloud = await marketService.getMarketKeywordCloud(root, { channel: 'all' })
  assert.equal(cloud.dataMode, 'example')
  assert.ok(cloud.popularCombinations.every((item) => item.isExample === true))
  assert.ok(cloud.popularCombinations.every((item) => item.heatScore == null))

  const dashboard = await marketService.getMarketDashboard(root, { channel: 'all' })
  assert.equal(dashboard.dataMode, 'example')
  assert.equal(dashboard.lastUpdatedAt, '')
  assert.ok(Array.isArray(dashboard.agentBrief?.directions))
  assert.ok(
    dashboard.agentBrief.directions.every(
      (item) => item.isExample === true || item.contentKind === 'example'
    )
  )

  const example = overview.writableDirections[0]
  const saved = await marketService.saveInsightToKnowledge(root, {
    insight: example,
    channel: 'all'
  })
  assert.equal(saved.success, true)
  assert.ok(saved.item?.id || saved.knowledgeItem?.id || saved.duplicate === true)

  const created = await marketService.createHotspot(root, {
    title: '我的自建灵感',
    summary: '用户手写题材，不是市场热度。',
    contentKind: 'user'
  })
  assert.equal(created.success, true)
  assert.equal(created.item.contentKind, 'user')
  assert.equal(created.item.isUserContent, true)
  assert.equal(created.item.sourceName, '用户自建')
  assert.equal(created.item.heatScore, null)

  await marketService.refreshMarketTrends(root, {
    sources: ['weibo'],
    force: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json; charset=utf-8' },
      async text() {
        return JSON.stringify({
          data: [{ title: '重生题材热度上涨', hot: '88万', url: 'https://example.com/live' }]
        })
      },
      async arrayBuffer() {
        return Buffer.from(
          JSON.stringify({
            data: [{ title: '重生题材热度上涨', hot: '88万', url: 'https://example.com/live' }]
          }),
          'utf8'
        )
      }
    })
  })
  const liveOverview = await marketService.getMarketOverview(root, { channel: 'all' })
  assert.equal(liveOverview.dataMode, 'live')
  assert.ok(liveOverview.writableDirections.length > 0)
  assert.ok(liveOverview.writableDirections.every((item) => item.isExample !== true))
  assert.ok(
    liveOverview.writableDirections.some(
      (item) => Number.isFinite(item.heatScore) || Number.isFinite(item.opportunityScore)
    )
  )

  const examples = marketTrendService.listExampleInsights('female')
  assert.ok(examples.length >= 1)
  assert.ok(examples.every((item) => item.isExample === true && item.heatScore == null))

  console.log('市场灵感空状态与示例内容测试通过')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

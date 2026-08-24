import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import {
  QIDIAN_RANK_TYPES,
  buildPlatformHotRank,
  fetchQidianRanking,
  normalizeQidianRecords
} from '../src/main/services/platformRankingService.js'

const sample = {
  bid: '1041637443',
  bName: '捞尸人',
  bAuth: '纯洁滴小龙',
  desc: '人知鬼恐怖，鬼晓人心毒。',
  cat: '都市',
  subCat: '异术超能',
  cnt: '647.12万字',
  rankCnt: '6.9万月票',
  rankNum: 1
}

const normalized = normalizeQidianRecords([sample], {
  rankType: QIDIAN_RANK_TYPES[0],
  channel: 'male'
})
assert.equal(normalized.length, 1)
assert.equal(normalized[0].title, '捞尸人')
assert.equal(normalized[0].rankMetric, '6.9万月票')
assert.equal(normalized[0].heatScore, null)
assert.equal(normalized[0].isExample, false)
assert.match(normalized[0].url, /1041637443/)

let requestUrl = ''
let requestHeaders = null
const successfulFetch = async (url, options) => {
  requestUrl = String(url)
  requestHeaders = options.headers
  return new Response(
    JSON.stringify({
      code: 0,
      msg: 'success',
      data: { total: 1, pageNum: 1, records: [sample] }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

const fetched = await fetchQidianRanking(
  { rankType: 'yuepiao', channel: 'male' },
  { fetchImpl: successfulFetch }
)
assert.equal(fetched.success, true)
assert.equal(fetched.items.length, 1)
assert.match(requestUrl, /m\.qidian\.com\/majax\/rank\/yuepiaolist/)
const csrf = new URL(requestUrl).searchParams.get('_csrfToken')
assert.ok(csrf?.length >= 32)
assert.equal(requestHeaders.Cookie, `_csrfToken=${csrf}`)
assert.equal(new URL(requestUrl).searchParams.get('gender'), 'male')

const root = await fs.mkdtemp(join(os.tmpdir(), 'dreamloom-platform-rank-'))
try {
  const live = await buildPlatformHotRank(
    root,
    { rankType: 'yuepiao', channel: 'male', force: true },
    { fetchImpl: successfulFetch }
  )
  assert.equal(live.dataMode, 'live')
  assert.equal(live.items[0].title, '捞尸人')
  assert.ok(live.rankTypes.length >= 6)

  const cached = await buildPlatformHotRank(root, {
    rankType: 'yuepiao',
    channel: 'male'
  })
  assert.equal(cached.dataMode, 'cached')
  assert.equal(cached.items.length, 1)

  const fallback = await buildPlatformHotRank(
    root,
    { rankType: 'yuepiao', channel: 'male', force: true },
    {
      fetchImpl: async () => {
        throw new Error('上游不可用')
      }
    }
  )
  assert.equal(fallback.dataMode, 'cached')
  assert.equal(fallback.items.length, 1)
  assert.match(fallback.message, /实时刷新失败/)

  const offlineRoot = await fs.mkdtemp(join(os.tmpdir(), 'dreamloom-platform-rank-offline-'))
  try {
    const offline = await buildPlatformHotRank(offlineRoot, {
      rankType: 'yuepiao',
      channel: 'male',
      offline: true
    })
    assert.equal(offline.dataMode, 'empty')
    assert.equal(offline.items.length, 0)
    assert.match(offline.message, /离线/)
  } finally {
    await fs.rm(offlineRoot, { recursive: true, force: true })
  }
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('platform ranking service tests passed')

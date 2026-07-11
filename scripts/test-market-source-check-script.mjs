import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./check-market-sources.mjs', import.meta.url), 'utf-8')

assert.equal(
  source.includes('refreshMarketTrends'),
  true,
  'script must call the real market refresh service'
)
assert.equal(source.includes('listHotTopics'), true, 'script must read persisted real topics')
assert.equal(source.includes('--sources'), true, 'script must allow source selection')
assert.equal(source.includes('--force'), true, 'script must allow bypassing cache')
assert.equal(source.includes('--twice'), true, 'script must support cache verification')
assert.equal(
  /边关小卒|逆光短剧师|七猫惊雷榜/.test(source),
  false,
  'script must not contain canned book rows'
)
assert.equal(
  /fakeFetch|response\(|Mock|mock/.test(source),
  false,
  'script must not use fake source data'
)

console.log('market source check script tests passed')

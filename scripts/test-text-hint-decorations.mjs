import assert from 'node:assert/strict'
import { findTextRanges } from '../src/renderer/src/extensions/TextHintDecorations.js'

assert.deepEqual(findTextRanges('林川看见林川', '林川'), [
  { from: 0, to: 2 },
  { from: 4, to: 6 }
])
assert.deepEqual(findTextRanges('Alice 和 ALICE', 'alice'), [
  { from: 0, to: 5 },
  { from: 8, to: 13 }
])
assert.deepEqual(findTextRanges('人物（甲）登场', '人物（甲）'), [{ from: 0, to: 5 }])
assert.deepEqual(findTextRanges('正文', ''), [])

console.log('text hint decoration tests passed')

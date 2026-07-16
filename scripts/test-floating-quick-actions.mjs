import assert from 'node:assert/strict'
import {
  DEFAULT_FLOATING_QUICK_ACTIONS,
  FLOATING_QUICK_ACTIONS_STORAGE_KEY,
  clampFloatingPoint,
  normalizeFloatingQuickActions,
  readFloatingQuickActions,
  resolveFloatingStyle,
  snapFloatingSide,
  writeFloatingQuickActions
} from '../src/renderer/src/service/floatingQuickActions.js'

assert.equal(snapFloatingSide(100, 1000, 0), 'left')
assert.equal(snapFloatingSide(800, 1000, 0), 'right')
assert.equal(snapFloatingSide(400, 1000, 200), 'left')
assert.equal(snapFloatingSide(500, 1000, 200), 'right')

const clamped = clampFloatingPoint(-100, 9999, {
  fabWidth: 48,
  fabHeight: 200,
  viewportWidth: 1200,
  viewportHeight: 800,
  topInset: 72,
  bottomInset: 56,
  leftInset: 8,
  rightInset: 180
})
assert.equal(clamped.x, 8)
assert.equal(clamped.y, 800 - 200 - 56)

const storage = new Map()
const mockStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value))
}

const initial = readFloatingQuickActions(mockStorage)
assert.equal(initial.visible, true)
assert.equal(initial.side, 'right')

writeFloatingQuickActions(mockStorage, {
  visible: false,
  side: 'left',
  y: 120,
  offset: 24,
  gapToAiBar: 20
})
assert.ok(storage.get(FLOATING_QUICK_ACTIONS_STORAGE_KEY))

const restored = readFloatingQuickActions(mockStorage)
assert.equal(restored.visible, false)
assert.equal(restored.side, 'left')
assert.equal(restored.y, 120)

const styleRight = resolveFloatingStyle(
  { ...DEFAULT_FLOATING_QUICK_ACTIONS, side: 'right', y: 100 },
  {
    viewportWidth: 1440,
    viewportHeight: 900,
    fabWidth: 48,
    fabHeight: 280,
    rightPanelSize: 180,
    isMobile: false
  }
)
assert.equal(styleRight.right, '196px')
assert.equal(styleRight.top, '100px')

const styleLeft = resolveFloatingStyle(
  { side: 'left', y: 80, offset: 20, visible: true },
  {
    viewportWidth: 1440,
    viewportHeight: 900,
    fabWidth: 48,
    fabHeight: 280,
    rightPanelSize: 180,
    isMobile: false
  }
)
assert.equal(styleLeft.left, '20px')

const mobileStyle = resolveFloatingStyle(
  { ...DEFAULT_FLOATING_QUICK_ACTIONS },
  {
    viewportWidth: 390,
    viewportHeight: 800,
    isMobile: true
  }
)
assert.equal(mobileStyle.bottom, 0)
assert.equal(mobileStyle.left, 0)

const normalized = normalizeFloatingQuickActions({ side: 'top', y: -20, visible: 'no' }, {
  height: 600,
  fabHeight: 200,
  topInset: 72,
  bottomInset: 56
})
assert.equal(normalized.side, 'right')
assert.equal(normalized.visible, true)
assert.equal(normalized.y, 72)

console.log('悬浮快捷操作布局测试通过')

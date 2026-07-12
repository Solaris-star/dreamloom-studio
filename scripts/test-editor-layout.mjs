import assert from 'node:assert/strict'
import {
  createEditorLayoutKey,
  getEditorDevice,
  getEditorPanelVisibility,
  normalizeEditorLayout,
  readEditorLayout,
  shouldExitEditorFocusMode
} from '../src/renderer/src/service/editorLayout.js'

assert.equal(getEditorDevice(390), 'mobile')
assert.equal(getEditorDevice(768), 'tablet')
assert.equal(getEditorDevice(1180), 'desktop')
assert.deepEqual(getEditorPanelVisibility('desktop', false), { left: true, right: true })
assert.deepEqual(getEditorPanelVisibility('tablet', false), { left: true, right: true })
assert.deepEqual(getEditorPanelVisibility('mobile', false), { left: false, right: false })
assert.deepEqual(getEditorPanelVisibility('desktop', true), { left: false, right: false })
assert.equal(shouldExitEditorFocusMode({ key: 'Escape' }, true), true)
assert.equal(shouldExitEditorFocusMode({ key: 'Escape', defaultPrevented: true }, true), false)
assert.equal(shouldExitEditorFocusMode({ key: 'Enter' }, true), false)
assert.equal(shouldExitEditorFocusMode({ key: 'Escape' }, false), false)
assert.equal(
  createEditorLayoutKey('我的书', 'mobile'),
  'dreamloom:editor-layout:v2:%E6%88%91%E7%9A%84%E4%B9%A6:mobile'
)

assert.deepEqual(normalizeEditorLayout({}, 'mobile'), {
  left: 0,
  right: 60,
  lastLeft: 240,
  lastRight: 180,
  focus: false,
  fontSize: 18,
  lineHeight: 1.8,
  contentWidth: 760
})

const unsafe = normalizeEditorLayout(
  {
    left: 9999,
    right: -1,
    lastLeft: 'bad',
    fontSize: 100,
    lineHeight: 0,
    contentWidth: 2000,
    focus: 'false'
  },
  'desktop'
)
assert.equal(unsafe.left, 450)
assert.equal(unsafe.right, 60)
assert.equal(unsafe.lastLeft, 240)
assert.equal(unsafe.fontSize, 24)
assert.equal(unsafe.lineHeight, 1.4)
assert.equal(unsafe.contentWidth, 960)
assert.equal(unsafe.focus, false)

const values = new Map([
  ['legacy', JSON.stringify({ left: 300, right: 220 })],
  ['broken', '{']
])
const storage = { getItem: (key) => values.get(key) || null }
assert.equal(readEditorLayout(storage, 'missing', 'desktop', 'legacy').left, 300)
assert.equal(readEditorLayout(storage, 'broken', 'desktop').left, 240)

console.log('编辑器布局状态测试通过')

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
assert.equal(getEditorDevice(1180), 'wide')
assert.deepEqual(getEditorPanelVisibility('wide', false), { left: true, right: true })
assert.deepEqual(getEditorPanelVisibility('tablet', false), { left: true, right: true })
assert.deepEqual(getEditorPanelVisibility('mobile', false), { left: false, right: false })
assert.deepEqual(getEditorPanelVisibility('wide', true), { left: false, right: false })
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
  fontSize: 16,
  lineHeight: 1.6,
  pageWidth: '80%',
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
  'wide'
)
assert.equal(unsafe.left, 450)
assert.equal(unsafe.right, 60)
assert.equal(unsafe.lastLeft, 240)
assert.equal(unsafe.fontSize, 24)
assert.equal(unsafe.lineHeight, 1.4)
// 旧像素 contentWidth 迁移到最近百分比档
assert.equal(unsafe.pageWidth, '100%')
assert.equal(unsafe.focus, false)

// 百分比页宽保留；像素映射
assert.equal(normalizeEditorLayout({ pageWidth: '70%' }, 'mobile').pageWidth, '70%')
assert.equal(normalizeEditorLayout({ contentWidth: 680 }, 'mobile').pageWidth, '70%')
assert.equal(normalizeEditorLayout({ contentWidth: 760 }, 'mobile').pageWidth, '80%')
assert.equal(normalizeEditorLayout({ pageWidth: '90%' }, 'wide').pageWidth, '90%')

const values = new Map([
  ['legacy-wide', JSON.stringify({ left: 320, right: 200 })],
  ['legacy', JSON.stringify({ left: 300, right: 220 })],
  ['broken', '{']
])
const storage = { getItem: (key) => values.get(key) || null }
assert.equal(
  readEditorLayout(storage, 'missing', 'wide', ['legacy-wide', 'legacy']).left,
  320
)
assert.equal(readEditorLayout(storage, 'missing', 'wide', ['missing-old', 'legacy']).left, 300)
assert.equal(readEditorLayout(storage, 'broken', 'wide').left, 240)

console.log('编辑器布局状态测试通过')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  HIGH_FREQUENCY_AI_SUB_LABELS,
  HIGH_FREQUENCY_KNOWLEDGE_SUB_LABELS,
  PRIMARY_NAV_LABELS,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_DEFAULT,
  SIDEBAR_LAST_EXPANDED_KEY,
  SIDEBAR_WIDTH_KEY,
  collapseToggleLabel,
  isSidebarCollapsed,
  nextSidebarWidthOnToggle,
  normalizeSidebarWidth,
  readSidebarWidth,
  rememberExpandedWidth,
  writeSidebarWidth
} from '../src/renderer/src/service/sidebarLayout.js'

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(key)
    }
  }
}

assert.equal(isSidebarCollapsed(64), true)
assert.equal(isSidebarCollapsed(156), false)
assert.equal(collapseToggleLabel(true), '展开侧栏')
assert.equal(collapseToggleLabel(false), '收起侧栏')

assert.equal(normalizeSidebarWidth(undefined), SIDEBAR_EXPANDED_DEFAULT)
assert.equal(normalizeSidebarWidth(40), SIDEBAR_COLLAPSED_WIDTH)
assert.equal(normalizeSidebarWidth(200), 200)
assert.equal(normalizeSidebarWidth(999), 280)

const storage = createMemoryStorage({ [SIDEBAR_WIDTH_KEY]: '64' })
assert.equal(readSidebarWidth(storage), SIDEBAR_COLLAPSED_WIDTH)

rememberExpandedWidth(180, storage)
assert.equal(storage.getItem(SIDEBAR_LAST_EXPANDED_KEY), '180')
assert.equal(nextSidebarWidthOnToggle(64, storage), 180)
assert.equal(nextSidebarWidthOnToggle(180, storage), SIDEBAR_COLLAPSED_WIDTH)
assert.equal(writeSidebarWidth(64, storage), SIDEBAR_COLLAPSED_WIDTH)
assert.equal(storage.getItem(SIDEBAR_WIDTH_KEY), String(SIDEBAR_COLLAPSED_WIDTH))

assert.deepEqual(PRIMARY_NAV_LABELS, [
  '首页',
  '创作台',
  '创作库',
  'AI 工坊',
  '地图设计',
  '市场灵感',
  '数据中心',
  '系统设置'
])
assert.ok(!PRIMARY_NAV_LABELS.includes('导入导出'))
assert.ok(!PRIMARY_NAV_LABELS.includes('小说下载'))
assert.deepEqual(HIGH_FREQUENCY_AI_SUB_LABELS, ['创作起笔', '文本处理', '剧情规划', '任务队列'])
assert.deepEqual(HIGH_FREQUENCY_KNOWLEDGE_SUB_LABELS, ['作品书架', '素材箱', '图库', '提示词'])

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const layoutSource = fs.readFileSync(
  path.join(rootDir, 'src/renderer/src/layouts/AppLayout.vue'),
  'utf8'
)

assert.match(layoutSource, /data-testid="sidebar-collapse-toggle"/)
assert.match(layoutSource, /collapseAriaExpanded/)
assert.match(layoutSource, /:aria-expanded="collapseAriaExpanded"/)
assert.match(layoutSource, /class="app-sidebar-toggle"/)
assert.match(layoutSource, /:aria-label="collapseToggleText"/)
assert.match(layoutSource, /&:focus-visible/)
assert.doesNotMatch(layoutSource, /app-menu-label">\{\{\s*sidebarWidth < 100 \? '展开' : '收起'\s*\}\}/)
assert.doesNotMatch(layoutSource, /收缩|Expand Sidebar|Collapse Sidebar/i)
assert.doesNotMatch(layoutSource, />收起<|>展开</)
assert.match(layoutSource, /PanelLeftOpen/)
assert.match(layoutSource, /PanelLeftClose/)
assert.match(layoutSource, /app-nav-tooltip/)
assert.match(layoutSource, /from '@renderer\/service\/sidebarLayout'/)

for (const label of PRIMARY_NAV_LABELS) {
  assert.match(layoutSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('sidebar layout 检查通过')

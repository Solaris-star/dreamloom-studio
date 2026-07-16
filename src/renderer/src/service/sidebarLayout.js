/**
 * 主导航侧栏宽度与收缩状态工具（纯函数，便于单测）
 */

export const SIDEBAR_WIDTH_KEY = 'sidebarWidth'
export const SIDEBAR_LAST_EXPANDED_KEY = 'sidebarWidth:lastExpanded'
export const SIDEBAR_COLLAPSED_WIDTH = 64
export const SIDEBAR_EXPANDED_DEFAULT = 156
export const SIDEBAR_EXPANDED_MIN = 120
export const SIDEBAR_EXPANDED_MAX = 280
export const SIDEBAR_COLLAPSE_THRESHOLD = 100
export const MOBILE_MEDIA_QUERY = '(max-width: 760px)'

export function isSidebarCollapsed(width) {
  return Number(width) < SIDEBAR_COLLAPSE_THRESHOLD
}

export function collapseToggleLabel(collapsed) {
  return collapsed ? '展开侧栏' : '收起侧栏'
}

export function normalizeSidebarWidth(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return SIDEBAR_EXPANDED_DEFAULT
  if (value < SIDEBAR_COLLAPSE_THRESHOLD) return SIDEBAR_COLLAPSED_WIDTH
  return Math.max(SIDEBAR_EXPANDED_MIN, Math.min(SIDEBAR_EXPANDED_MAX, Math.round(value)))
}

export function readSidebarWidth(storage = globalThis.localStorage) {
  try {
    return normalizeSidebarWidth(storage?.getItem?.(SIDEBAR_WIDTH_KEY))
  } catch {
    return SIDEBAR_EXPANDED_DEFAULT
  }
}

export function resolveExpandedWidth(storage = globalThis.localStorage) {
  try {
    const restored = Number(storage?.getItem?.(SIDEBAR_LAST_EXPANDED_KEY))
    if (Number.isFinite(restored) && restored >= SIDEBAR_EXPANDED_MIN) {
      return Math.min(SIDEBAR_EXPANDED_MAX, Math.round(restored))
    }
  } catch {
    // ignore
  }
  return SIDEBAR_EXPANDED_DEFAULT
}

export function nextSidebarWidthOnToggle(currentWidth, storage = globalThis.localStorage) {
  if (isSidebarCollapsed(currentWidth)) {
    return resolveExpandedWidth(storage)
  }
  return SIDEBAR_COLLAPSED_WIDTH
}

export function rememberExpandedWidth(width, storage = globalThis.localStorage) {
  if (isSidebarCollapsed(width)) return
  try {
    storage?.setItem?.(SIDEBAR_LAST_EXPANDED_KEY, String(Math.round(Number(width))))
  } catch {
    // ignore
  }
}

export function writeSidebarWidth(width, storage = globalThis.localStorage) {
  const next = normalizeSidebarWidth(width)
  try {
    storage?.setItem?.(SIDEBAR_WIDTH_KEY, String(next))
  } catch {
    // ignore
  }
  return next
}

/** 主导航一级入口文案（中文），不含导入导出 / 小说下载 */
export const PRIMARY_NAV_LABELS = [
  '首页',
  '创作台',
  '创作库',
  'AI 工坊',
  '地图设计',
  '市场灵感',
  '数据中心',
  '系统设置'
]

export const HIGH_FREQUENCY_AI_SUB_LABELS = ['创作起笔', '文本处理', '剧情规划', '任务队列']

export const HIGH_FREQUENCY_KNOWLEDGE_SUB_LABELS = ['作品书架', '素材箱', '图库', '提示词']

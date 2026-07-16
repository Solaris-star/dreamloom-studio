export const DEFAULT_EDITOR_LAYOUT = Object.freeze({
  left: 240,
  right: 180,
  lastLeft: 240,
  lastRight: 180,
  focus: false,
  fontSize: 16,
  lineHeight: 1.6,
  // 与顶栏「页宽」一致：百分比，而非固定像素（移动端固定 px 会失效）
  pageWidth: '80%',
  // 兼容旧字段 contentWidth（像素）
  contentWidth: 760
})

/** 顶栏可选页宽 */
export const EDITOR_PAGE_WIDTH_OPTIONS = Object.freeze(['100%', '90%', '80%', '70%'])

/**
 * 规范化页宽：优先百分比；旧版 contentWidth 像素迁移到最近档位。
 */
export function normalizeEditorPageWidth(value, fallbackPx) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (EDITOR_PAGE_WIDTH_OPTIONS.includes(trimmed)) return trimmed
    if (trimmed.endsWith('%')) {
      const n = Number(trimmed.slice(0, -1))
      if (Number.isFinite(n)) {
        if (n >= 95) return '100%'
        if (n >= 85) return '90%'
        if (n >= 75) return '80%'
        return '70%'
      }
    }
  }
  const px = Number(value ?? fallbackPx)
  if (Number.isFinite(px)) {
    if (px >= 920) return '100%'
    if (px >= 820) return '90%'
    if (px >= 700) return '80%'
    if (px > 0) return '70%'
  }
  return DEFAULT_EDITOR_LAYOUT.pageWidth
}

export function getEditorDevice(width) {
  const value = Number(width)
  if (Number.isFinite(value) && value < 768) return 'mobile'
  if (Number.isFinite(value) && value < 1180) return 'tablet'
  return 'wide'
}

export function getEditorPanelVisibility(device, focusMode = false) {
  if (focusMode) return { left: false, right: false }
  if (device === 'mobile') return { left: false, right: false }
  return { left: true, right: true }
}

export function shouldExitEditorFocusMode(event, focusMode = false) {
  return focusMode === true && event?.key === 'Escape' && !event.defaultPrevented
}

export function createEditorLayoutKey(bookName, device) {
  const safeBookName = encodeURIComponent(String(bookName || 'default').trim() || 'default')
  const safeDevice = ['mobile', 'tablet', 'wide'].includes(device) ? device : 'wide'
  return `dreamloom:editor-layout:v2:${safeBookName}:${safeDevice}`
}

function clamp(value, fallback, min, max) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeEditorLayout(value = {}, device = 'wide') {
  const defaults =
    device === 'mobile'
      ? { ...DEFAULT_EDITOR_LAYOUT, left: 0, right: 60, lastLeft: 240, lastRight: 180 }
      : DEFAULT_EDITOR_LAYOUT

  const pageWidth = normalizeEditorPageWidth(
    value.pageWidth !== undefined ? value.pageWidth : value.contentWidth,
    value.contentWidth
  )

  // 保留 contentWidth 仅作兼容回读；真实生效字段是 pageWidth（百分比）
  const contentWidthFromPage =
    pageWidth === '100%' ? 960 : pageWidth === '90%' ? 860 : pageWidth === '70%' ? 680 : 760

  return {
    left: clamp(value.left, defaults.left, 0, 450),
    right: clamp(value.right, defaults.right, 60, 320),
    lastLeft: clamp(value.lastLeft, defaults.lastLeft, 180, 450),
    lastRight: clamp(value.lastRight, defaults.lastRight, 80, 320),
    focus: value.focus === true,
    fontSize: clamp(value.fontSize, defaults.fontSize, 14, 24),
    lineHeight: clamp(value.lineHeight, defaults.lineHeight, 1.4, 2.2),
    pageWidth,
    contentWidth: clamp(value.contentWidth, contentWidthFromPage, 320, 1200)
  }
}

export function readEditorLayout(storage, key, device, legacyKeys = []) {
  const fallbackKeys = Array.isArray(legacyKeys) ? legacyKeys : [legacyKeys]
  const serialized =
    storage?.getItem(key) ||
    fallbackKeys.reduce(
      (value, legacyKey) => value || (legacyKey ? storage?.getItem(legacyKey) : ''),
      ''
    )
  if (!serialized) return normalizeEditorLayout({}, device)

  try {
    return normalizeEditorLayout(JSON.parse(serialized), device)
  } catch {
    return normalizeEditorLayout({}, device)
  }
}

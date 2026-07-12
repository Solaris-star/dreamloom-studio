export const DEFAULT_EDITOR_LAYOUT = Object.freeze({
  left: 240,
  right: 180,
  lastLeft: 240,
  lastRight: 180,
  focus: false,
  fontSize: 18,
  lineHeight: 1.8,
  contentWidth: 760
})

export function getEditorDevice(width) {
  const value = Number(width)
  if (Number.isFinite(value) && value < 768) return 'mobile'
  if (Number.isFinite(value) && value < 1180) return 'tablet'
  return 'desktop'
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
  const safeDevice = ['mobile', 'tablet', 'desktop'].includes(device) ? device : 'desktop'
  return `dreamloom:editor-layout:v2:${safeBookName}:${safeDevice}`
}

function clamp(value, fallback, min, max) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeEditorLayout(value = {}, device = 'desktop') {
  const defaults =
    device === 'mobile'
      ? { ...DEFAULT_EDITOR_LAYOUT, left: 0, right: 60, lastLeft: 240, lastRight: 180 }
      : DEFAULT_EDITOR_LAYOUT

  return {
    left: clamp(value.left, defaults.left, 0, 450),
    right: clamp(value.right, defaults.right, 60, 320),
    lastLeft: clamp(value.lastLeft, defaults.lastLeft, 180, 450),
    lastRight: clamp(value.lastRight, defaults.lastRight, 80, 320),
    focus: value.focus === true,
    fontSize: clamp(value.fontSize, defaults.fontSize, 14, 24),
    lineHeight: clamp(value.lineHeight, defaults.lineHeight, 1.4, 2.2),
    contentWidth: clamp(value.contentWidth, defaults.contentWidth, 640, 960)
  }
}

export function readEditorLayout(storage, key, device, legacyKey = '') {
  const serialized = storage?.getItem(key) || (legacyKey ? storage?.getItem(legacyKey) : '')
  if (!serialized) return normalizeEditorLayout({}, device)

  try {
    return normalizeEditorLayout(JSON.parse(serialized), device)
  } catch {
    return normalizeEditorLayout({}, device)
  }
}

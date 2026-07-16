export const FLOATING_QUICK_ACTIONS_STORAGE_KEY = 'dreamloom:editor-floating-actions:v1'

export const DEFAULT_FLOATING_QUICK_ACTIONS = Object.freeze({
  visible: true,
  side: 'right',
  y: null,
  offset: 20,
  gapToAiBar: 16
})

const VALID_SIDES = new Set(['left', 'right'])

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

export function normalizeFloatingQuickActions(value = {}, viewport = {}) {
  const width = Number(viewport.width)
  const height = Number(viewport.height)
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1280
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 800
  const fabWidth = clamp(viewport.fabWidth, 48, 96)
  const fabHeight = clamp(viewport.fabHeight, 48, 360)
  const topInset = clamp(viewport.topInset, 8, 200)
  const bottomInset = clamp(viewport.bottomInset, 8, 240)
  const maxY = Math.max(topInset, safeHeight - fabHeight - bottomInset)

  const side = VALID_SIDES.has(value.side) ? value.side : DEFAULT_FLOATING_QUICK_ACTIONS.side
  const visible = value.visible !== false
  const offset = clamp(value.offset, 8, 48)
  const gapToAiBar = clamp(value.gapToAiBar, 8, 48)
  const y =
    value.y === null || value.y === undefined ? null : clamp(value.y, topInset, maxY)

  return {
    visible,
    side,
    y,
    offset,
    gapToAiBar,
    maxY,
    minY: topInset,
    fabWidth,
    fabHeight,
    viewportWidth: safeWidth,
    viewportHeight: safeHeight
  }
}

export function readFloatingQuickActions(storage) {
  try {
    const raw = storage?.getItem?.(FLOATING_QUICK_ACTIONS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_FLOATING_QUICK_ACTIONS }
    return normalizeFloatingQuickActions(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_FLOATING_QUICK_ACTIONS }
  }
}

export function writeFloatingQuickActions(storage, value = {}) {
  const next = normalizeFloatingQuickActions(value)
  const payload = {
    visible: next.visible,
    side: next.side,
    y: next.y,
    offset: next.offset,
    gapToAiBar: next.gapToAiBar
  }
  storage?.setItem?.(FLOATING_QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(payload))
  return payload
}

/**
 * 根据拖拽中心点吸附到最近左右边缘。
 * rightEdgeReserve：右侧 AI 助手栏占用宽度，吸附右侧时要留在栏左侧。
 */
export function snapFloatingSide(centerX, viewportWidth, rightEdgeReserve = 0) {
  const width = Number(viewportWidth)
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1280
  const reserve = Math.max(0, Number(rightEdgeReserve) || 0)
  const effectiveRight = Math.max(0, safeWidth - reserve)
  const mid = effectiveRight / 2
  return centerX <= mid ? 'left' : 'right'
}

export function resolveFloatingStyle(state, options = {}) {
  const viewport = {
    width: options.viewportWidth,
    height: options.viewportHeight,
    fabWidth: options.fabWidth,
    fabHeight: options.fabHeight,
    topInset: options.topInset,
    bottomInset: options.bottomInset
  }
  const normalized = normalizeFloatingQuickActions(state, viewport)
  const rightPanelSize = Math.max(0, Number(options.rightPanelSize) || 0)
  const isMobile = options.isMobile === true
  const isDragging = options.isDragging === true

  if (isMobile) {
    return {
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'auto',
      bottom: 0,
      transform: 'none',
      zIndex: 120
    }
  }

  if (!normalized.visible && !options.showReopenChip) {
    return { display: 'none' }
  }

  const y =
    normalized.y === null || normalized.y === undefined
      ? Math.round((normalized.viewportHeight - normalized.fabHeight) / 2)
      : normalized.y

  if (isDragging && Number.isFinite(options.dragX) && Number.isFinite(options.dragY)) {
    return {
      position: 'fixed',
      left: `${Math.round(options.dragX)}px`,
      top: `${Math.round(options.dragY)}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      zIndex: 140
    }
  }

  if (normalized.side === 'left') {
    return {
      position: 'fixed',
      left: `${normalized.offset}px`,
      top: `${y}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      zIndex: 120
    }
  }

  const right = Math.max(normalized.offset, rightPanelSize + normalized.gapToAiBar)
  return {
    position: 'fixed',
    right: `${right}px`,
    top: `${y}px`,
    left: 'auto',
    bottom: 'auto',
    transform: 'none',
    zIndex: 120
  }
}

export function clampFloatingPoint(x, y, bounds = {}) {
  const width = clamp(bounds.fabWidth, 40, 120)
  const height = clamp(bounds.fabHeight, 40, 400)
  const viewportWidth = clamp(bounds.viewportWidth, width, 10000)
  const viewportHeight = clamp(bounds.viewportHeight, height, 10000)
  const topInset = clamp(bounds.topInset, 0, 240)
  const bottomInset = clamp(bounds.bottomInset, 0, 240)
  const leftInset = clamp(bounds.leftInset, 0, 240)
  const rightInset = clamp(bounds.rightInset, 0, 480)

  const minX = leftInset
  const maxX = Math.max(minX, viewportWidth - width - rightInset)
  const minY = topInset
  const maxY = Math.max(minY, viewportHeight - height - bottomInset)

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY)
  }
}

<template>
  <div
    ref="rootRef"
    class="floating-quick-actions"
    :class="{ dragging: dragging, 'is-mobile-bar': isMobile }"
    :style="positionStyle"
    aria-label="创作台快捷操作"
    data-testid="editor-floating-assistant"
    @pointerdown="handlePointerDown"
  >
    <button
      class="action-btn drag-handle"
      type="button"
      title="拖动悬浮助手"
      aria-label="拖动悬浮助手"
      data-testid="editor-floating-drag-handle"
      @pointerdown.stop="handlePointerDown"
    >
      <GripVertical :size="16" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="返回首页"
      aria-label="返回首页"
      @click="emit('home')"
    >
      <House :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="打开章节目录"
      aria-label="打开章节目录"
      data-testid="editor-open-catalog"
      @click="emit('catalog')"
    >
      <ListTree :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="上一章"
      aria-label="上一章"
      @click="emit('prev-chapter')"
    >
      <ChevronUp :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="下一章"
      aria-label="下一章"
      @click="emit('next-chapter')"
    >
      <ChevronDown :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="阅读设置"
      aria-label="阅读设置"
      @click="emit('reading-settings')"
    >
      <Type :size="18" />
    </button>
    <button
      class="action-btn mobile-only"
      type="button"
      title="创作工具"
      aria-label="创作工具"
      @click="emit('tools')"
    >
      <WandSparkles :size="18" />
    </button>
    <button
      class="action-btn"
      :class="{ active: focusMode }"
      type="button"
      :title="focusMode ? '退出专注模式' : '进入专注模式'"
      :aria-label="focusMode ? '退出专注模式' : '进入专注模式'"
      :aria-pressed="focusMode"
      @click="emit('toggle-focus')"
    >
      <Minimize2
        v-if="focusMode"
        :size="18"
      />
      <Maximize2
        v-else
        :size="18"
      />
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  House,
  ListTree,
  Maximize2,
  Minimize2,
  Type,
  WandSparkles
} from 'lucide-vue-next'

const STORAGE_KEY = 'dreamloom.editor.floatingAssistant.position.v1'
const EDGE_SNAP_PX = 28
const MARGIN = 12

const props = defineProps({
  focusMode: {
    type: Boolean,
    default: false
  },
  rightPanelSize: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits([
  'home',
  'catalog',
  'prev-chapter',
  'next-chapter',
  'reading-settings',
  'tools',
  'toggle-focus'
])

const rootRef = ref(null)
const dragging = ref(false)
const isMobile = ref(false)
const pos = ref({ x: null, y: null, side: 'right' })

let pointerId = null
let startX = 0
let startY = 0
let originX = 0
let originY = 0
let moved = false

function readViewport() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0
  }
}

function updateMobileFlag() {
  isMobile.value = readViewport().width < 768
}

function defaultPosition() {
  const { width, height } = readViewport()
  const el = rootRef.value
  const boxW = el?.offsetWidth || 44
  const boxH = el?.offsetHeight || 220
  const rightOffset = Math.max(MARGIN, Number(props.rightPanelSize) || 0) + 20
  return {
    x: Math.max(MARGIN, width - boxW - rightOffset),
    y: Math.max(MARGIN, Math.round(height * 0.42 - boxH / 2)),
    side: 'right'
  }
}

function loadPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const x = Number(parsed.x)
    const y = Number(parsed.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      x,
      y,
      side: parsed.side === 'left' ? 'left' : 'right'
    }
  } catch {
    return null
  }
}

function savePosition(next) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        x: Math.round(next.x),
        y: Math.round(next.y),
        side: next.side || 'right',
        updatedAt: Date.now()
      })
    )
  } catch {
    // ignore quota / private mode
  }
}

function clampPosition(next) {
  const { width, height } = readViewport()
  const el = rootRef.value
  const boxW = el?.offsetWidth || 44
  const boxH = el?.offsetHeight || 220
  const maxX = Math.max(MARGIN, width - boxW - MARGIN)
  const maxY = Math.max(MARGIN, height - boxH - MARGIN)
  let x = Math.min(maxX, Math.max(MARGIN, Number(next.x) || MARGIN))
  let y = Math.min(maxY, Math.max(MARGIN, Number(next.y) || MARGIN))
  let side = next.side === 'left' ? 'left' : 'right'

  // 吸附左右边缘
  if (x <= MARGIN + EDGE_SNAP_PX) {
    x = MARGIN
    side = 'left'
  } else if (x >= maxX - EDGE_SNAP_PX) {
    x = maxX
    side = 'right'
  }

  return { x, y, side }
}

function ensurePosition() {
  if (isMobile.value) {
    pos.value = { x: null, y: null, side: 'right' }
    return
  }
  const saved = loadPosition()
  pos.value = clampPosition(saved || defaultPosition())
}

const positionStyle = computed(() => {
  if (isMobile.value || pos.value.x == null || pos.value.y == null) {
    return undefined
  }
  return {
    left: `${Math.round(pos.value.x)}px`,
    top: `${Math.round(pos.value.y)}px`,
    right: 'auto',
    bottom: 'auto',
    transform: 'none'
  }
})

function handlePointerDown(event) {
  if (isMobile.value) return
  // 只允许从拖动手柄开始，避免误触按钮
  const target = event.target
  const isHandle =
    target?.closest?.('.drag-handle') || target?.classList?.contains?.('floating-quick-actions')
  if (!isHandle) return
  if (event.button != null && event.button !== 0) return

  const el = rootRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dragging.value = true
  moved = false
  pointerId = event.pointerId
  startX = event.clientX
  startY = event.clientY
  originX = rect.left
  originY = rect.top
  pos.value = { x: originX, y: originY, side: pos.value.side || 'right' }

  try {
    el.setPointerCapture?.(pointerId)
  } catch {
    // ignore
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  event.preventDefault()
}

function handlePointerMove(event) {
  if (!dragging.value) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
  pos.value = clampPosition({
    x: originX + dx,
    y: originY + dy,
    side: pos.value.side
  })
}

function handlePointerUp() {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
  if (pointerId != null && rootRef.value?.releasePointerCapture) {
    try {
      rootRef.value.releasePointerCapture(pointerId)
    } catch {
      // ignore
    }
  }
  pointerId = null
  if (moved) {
    const next = clampPosition(pos.value)
    pos.value = next
    savePosition(next)
  }
}

function handleResize() {
  updateMobileFlag()
  ensurePosition()
  if (!isMobile.value && pos.value.x != null) {
    const next = clampPosition(pos.value)
    pos.value = next
    savePosition(next)
  }
}

watch(
  () => props.rightPanelSize,
  () => {
    if (!isMobile.value && !loadPosition()) {
      pos.value = clampPosition(defaultPosition())
    }
  }
)

onMounted(() => {
  updateMobileFlag()
  ensurePosition()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
})
</script>

<style scoped>
.floating-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-color, #dedbd5);
  border-radius: 6px;
  background: var(--bg-soft, var(--bg-primary, #ffffff));
  color: var(--text-base);
  box-shadow: 0 6px 20px var(--shadow-color, rgba(34, 30, 24, 0.12));
  touch-action: none;
  user-select: none;
  z-index: 120;
}

.floating-quick-actions.dragging {
  opacity: 0.96;
  box-shadow: 0 10px 28px rgba(34, 30, 24, 0.18);
  cursor: grabbing;
}


.action-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: var(--text-base, #333333);
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.action-btn:hover,
.action-btn:focus-visible,
.action-btn.active {
  color: var(--el-color-primary, #9b3a32);
  background-color: var(--bg-mute, #f5f7fa);
  outline: none;
}

.drag-handle {
  cursor: grab;
  color: var(--text-gray, #888);
}

.dragging .drag-handle {
  cursor: grabbing;
}

.mobile-only {
  display: none;
}

@media (max-width: 767px) {
  .floating-quick-actions,
  .floating-quick-actions.is-mobile-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    transform: none;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 2px max(6px, env(safe-area-inset-right)) calc(2px + env(safe-area-inset-bottom))
      max(6px, env(safe-area-inset-left));
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: 0 -2px 10px rgba(34, 30, 24, 0.06);
    box-sizing: border-box;
    touch-action: manipulation;
  }

  .drag-handle {
    display: none;
  }

  .action-btn {
    width: 34px;
    height: 34px;
  }

  .mobile-only {
    display: flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-btn {
    transition: none;
  }
}
</style>

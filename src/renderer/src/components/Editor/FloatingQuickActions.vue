<template>
  <div
    ref="rootRef"
    class="floating-quick-actions"
    :class="{
      dragging: isDragging,
      'is-hidden': !state.visible && !isTouchLayout,
      'is-mobile': isTouchLayout
    }"
    :style="rootStyle"
    role="toolbar"
    aria-label="创作台快捷操作"
    data-testid="editor-floating-quick-actions"
    @pointerdown="onPointerDown"
  >
    <template v-if="state.visible || isTouchLayout">
      <button
        class="drag-handle"
        type="button"
        title="拖拽移动悬浮助手"
        aria-label="拖拽移动悬浮助手"
        data-testid="editor-floating-drag-handle"
        @pointerdown.stop="onHandlePointerDown"
        @keydown="onKeyboardMove"
      >
        <GripVertical :size="16" />
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

      <div class="position-menu desktop-only">
        <button
          class="action-btn menu-btn"
          type="button"
          title="位置选项"
          aria-label="悬浮助手位置选项"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          data-testid="editor-floating-position-menu"
          @click.stop="menuOpen = !menuOpen"
          @keydown.escape="menuOpen = false"
        >
          <MoreVertical :size="16" />
        </button>
        <div
          v-if="menuOpen"
          class="position-menu-panel"
          role="menu"
          aria-label="悬浮助手位置"
        >
          <button
            type="button"
            role="menuitem"
            @click="moveToSide('left')"
          >
            移动到左侧
          </button>
          <button
            type="button"
            role="menuitem"
            @click="moveToSide('right')"
          >
            移动到右侧
          </button>
          <button
            type="button"
            role="menuitem"
            @click="restoreDefaultPosition"
          >
            恢复默认位置
          </button>
          <button
            type="button"
            role="menuitem"
            @click="hideAssistant"
          >
            关闭悬浮助手
          </button>
        </div>
      </div>

      <div
        class="page-jump-actions"
        role="group"
        aria-label="页面跳转"
      >
        <button
          class="action-btn"
          type="button"
          title="向上翻页"
          aria-label="向上翻页"
          data-testid="editor-page-up"
          @click="emit('page-up')"
        >
          <ArrowUpToLine :size="18" />
        </button>
        <button
          class="action-btn"
          type="button"
          title="向下翻页"
          aria-label="向下翻页"
          data-testid="editor-page-down"
          @click="emit('page-down')"
        >
          <ArrowDownToLine :size="18" />
        </button>
      </div>

      <!-- 移动端阅读模式：上一章 / 下一章 -->
      <div
        class="chapter-jump-actions"
        role="group"
        aria-label="章节跳转"
      >
        <button
          class="action-btn"
          type="button"
          title="上一章"
          aria-label="上一章"
          data-testid="editor-prev-chapter"
          @click="emit('prev-chapter')"
        >
          <ChevronLeft :size="18" />
        </button>
        <button
          class="action-btn"
          type="button"
          title="下一章"
          aria-label="下一章"
          data-testid="editor-next-chapter"
          @click="emit('next-chapter')"
        >
          <ChevronRight :size="18" />
        </button>
      </div>
    </template>

    <button
      v-else
      class="reopen-chip"
      type="button"
      title="显示悬浮助手"
      aria-label="显示悬浮助手"
      data-testid="editor-floating-reopen"
      @click="showAssistant"
    >
      <Sparkles :size="16" />
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ListTree,
  Maximize2,
  Minimize2,
  MoreVertical,
  Sparkles,
  Type,
  WandSparkles
} from 'lucide-vue-next'
import {
  DEFAULT_FLOATING_QUICK_ACTIONS,
  clampFloatingPoint,
  readFloatingQuickActions,
  resolveFloatingStyle,
  snapFloatingSide,
  writeFloatingQuickActions
} from '@renderer/service/floatingQuickActions'

const props = defineProps({
  focusMode: {
    type: Boolean,
    default: false
  },
  rightPanelSize: {
    type: Number,
    default: 180
  },
  readingMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'catalog',
  'reading-settings',
  'tools',
  'toggle-focus',
  'page-up',
  'page-down',
  'prev-chapter',
  'next-chapter'
])

const rootRef = ref(null)
const menuOpen = ref(false)
const isDragging = ref(false)
const dragX = ref(0)
const dragY = ref(0)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 800)
const fabWidth = ref(48)
const fabHeight = ref(280)

const state = reactive(readFloatingQuickActions(typeof localStorage !== 'undefined' ? localStorage : null))

const isMobile = computed(() => viewportWidth.value < 768)

// 触摸优化布局：窄屏 或 粗指针（iPad/平板无鼠标）。两者都启用底栏 + 大按钮。
// 桌面 hover-capable 设备保持右侧悬浮坞 + 拖拽。
const isCoarsePointer = ref(false)
let coarsePointerMedia = null

function updateCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  isCoarsePointer.value = window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

if (typeof window !== 'undefined' && window.matchMedia) {
  coarsePointerMedia = window.matchMedia('(hover: none) and (pointer: coarse)')
  updateCoarsePointer()
}

// 触摸布局 = 窄屏或 iPad 等粗指针宽屏
const isTouchLayout = computed(() => isMobile.value || isCoarsePointer.value)

const rootStyle = computed(() =>
  resolveFloatingStyle(state, {
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
    fabWidth: fabWidth.value,
    fabHeight: fabHeight.value,
    topInset: 72,
    bottomInset: isTouchLayout.value ? 12 + safeAreaBottom() : 56,
    rightPanelSize: props.rightPanelSize,
    isMobile: isTouchLayout.value,
    isDragging: isDragging.value,
    dragX: dragX.value,
    dragY: dragY.value,
    showReopenChip: !state.visible
  })
)

let pointerId = null
let startClientX = 0
let startClientY = 0
let originX = 0
let originY = 0
let moved = false
let suppressClickUntil = 0

function safeAreaBottom() {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return 0
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;bottom:0;padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom || '0') || 0
  probe.remove()
  return value
}

function measureFab() {
  const el = rootRef.value
  if (!el) return
  fabWidth.value = Math.max(40, el.offsetWidth || 48)
  fabHeight.value = Math.max(40, el.offsetHeight || 48)
}

function persist() {
  writeFloatingQuickActions(localStorage, {
    visible: state.visible,
    side: state.side,
    y: state.y,
    offset: state.offset,
    gapToAiBar: state.gapToAiBar
  })
}

function updateViewport() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  nextTick(measureFab)
}

function rightReserve() {
  // 右侧 AI 助手栏 + 间距，避免吸附后遮挡
  return Math.max(0, Number(props.rightPanelSize) || 0) + (state.gapToAiBar || 16)
}

function currentFixedPoint() {
  const el = rootRef.value
  if (!el) {
    return {
      x: state.side === 'left' ? state.offset : viewportWidth.value - fabWidth.value - rightReserve(),
      y:
        state.y === null || state.y === undefined
          ? Math.round((viewportHeight.value - fabHeight.value) / 2)
          : state.y
    }
  }
  const rect = el.getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

function onHandlePointerDown(event) {
  if (isTouchLayout.value || !state.visible) return
  if (event.button !== undefined && event.button !== 0) return
  beginDrag(event)
}

function onPointerDown(event) {
  // 仅在拖拽手柄上启动拖拽；避免按钮点击被劫持
  if (event.target?.closest?.('.drag-handle')) return
  if (event.target?.closest?.('button')) {
    menuOpen.value = false
  }
}

function beginDrag(event) {
  menuOpen.value = false
  measureFab()
  const point = currentFixedPoint()
  isDragging.value = true
  moved = false
  pointerId = event.pointerId
  startClientX = event.clientX
  startClientY = event.clientY
  originX = point.x
  originY = point.y
  dragX.value = point.x
  dragY.value = point.y

  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  } catch {
    // ignore
  }

  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp, { passive: false })
  window.addEventListener('pointercancel', onPointerUp, { passive: false })
  document.body.style.userSelect = 'none'
  document.body.style.webkitUserSelect = 'none'
  event.preventDefault()
}

function onPointerMove(event) {
  if (!isDragging.value) return
  if (pointerId !== null && event.pointerId !== pointerId) return
  event.preventDefault()

  const deltaX = event.clientX - startClientX
  const deltaY = event.clientY - startClientY
  if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true

  const clamped = clampFloatingPoint(originX + deltaX, originY + deltaY, {
    fabWidth: fabWidth.value,
    fabHeight: fabHeight.value,
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
    topInset: 72,
    bottomInset: 56 + safeAreaBottom(),
    leftInset: 8,
    rightInset: Math.max(8, rightReserve())
  })
  dragX.value = clamped.x
  dragY.value = clamped.y
}

function onPointerUp(event) {
  if (!isDragging.value) return
  if (pointerId !== null && event.pointerId !== pointerId) return

  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  document.body.style.userSelect = ''
  document.body.style.webkitUserSelect = ''

  const centerX = dragX.value + fabWidth.value / 2
  state.side = snapFloatingSide(centerX, viewportWidth.value, rightReserve())
  state.y = dragY.value
  isDragging.value = false
  pointerId = null
  persist()
  if (moved) suppressClickUntil = Date.now() + 250
  nextTick(measureFab)
}

function moveToSide(side) {
  state.side = side === 'left' ? 'left' : 'right'
  menuOpen.value = false
  persist()
}

function restoreDefaultPosition() {
  state.side = DEFAULT_FLOATING_QUICK_ACTIONS.side
  state.y = DEFAULT_FLOATING_QUICK_ACTIONS.y
  state.offset = DEFAULT_FLOATING_QUICK_ACTIONS.offset
  state.gapToAiBar = DEFAULT_FLOATING_QUICK_ACTIONS.gapToAiBar
  menuOpen.value = false
  persist()
}

function hideAssistant() {
  state.visible = false
  menuOpen.value = false
  persist()
}

function showAssistant() {
  state.visible = true
  persist()
  nextTick(measureFab)
}

function onKeyboardMove(event) {
  if (isTouchLayout.value || !state.visible) return
  const step = event.shiftKey ? 24 : 12
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveToSide('left')
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveToSide('right')
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    measureFab()
    const current =
      state.y === null || state.y === undefined
        ? Math.round((viewportHeight.value - fabHeight.value) / 2)
        : state.y
    const nextY = event.key === 'ArrowUp' ? current - step : current + step
    const clamped = clampFloatingPoint(0, nextY, {
      fabWidth: fabWidth.value,
      fabHeight: fabHeight.value,
      viewportWidth: viewportWidth.value,
      viewportHeight: viewportHeight.value,
      topInset: 72,
      bottomInset: 56 + safeAreaBottom(),
      leftInset: 8,
      rightInset: 8
    })
    state.y = clamped.y
    persist()
  }
  if (event.key === 'Home') {
    event.preventDefault()
    restoreDefaultPosition()
  }
}

function onDocumentClick(event) {
  if (!menuOpen.value) return
  if (rootRef.value?.contains(event.target)) return
  menuOpen.value = false
}

function onRootClickCapture(event) {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault()
    event.stopPropagation()
  }
}

onMounted(() => {
  updateViewport()
  updateCoarsePointer()
  window.addEventListener('resize', updateViewport)
  coarsePointerMedia?.addEventListener?.('change', updateCoarsePointer)
  document.addEventListener('click', onDocumentClick)
  rootRef.value?.addEventListener('click', onRootClickCapture, true)
  nextTick(measureFab)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  coarsePointerMedia?.removeEventListener?.('change', updateCoarsePointer)
  document.removeEventListener('click', onDocumentClick)
  rootRef.value?.removeEventListener('click', onRootClickCapture, true)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  document.body.style.userSelect = ''
  document.body.style.webkitUserSelect = ''
})

watch(
  () => props.rightPanelSize,
  () => nextTick(measureFab)
)
</script>

<style scoped>
.floating-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-color, #dedbd5);
  border-radius: 6px;
  background: var(--bg-primary, #ffffff);
  box-shadow: 0 6px 20px rgba(34, 30, 24, 0.12);
  touch-action: none;
  z-index: 120;
}

.floating-quick-actions.dragging {
  opacity: 0.92;
  box-shadow: 0 10px 28px rgba(34, 30, 24, 0.2);
  cursor: grabbing;
}

.floating-quick-actions.is-hidden {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.drag-handle {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  color: var(--text-secondary, #888);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:focus-visible,
.action-btn:focus-visible,
.menu-btn:focus-visible,
.reopen-chip:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--el-color-primary, #9b3a32) 55%, transparent);
  outline-offset: 1px;
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
}

.mobile-only {
  display: none;
}

.desktop-only {
  display: block;
}

.page-jump-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
  margin-top: 2px;
  border-top: 1px solid var(--border-color, #dedbd5);
}

/* 章节跳转：默认（桌面悬浮坞）不显示，避免拥挤；触摸底栏展示 */
.chapter-jump-actions {
  display: none;
}

.position-menu {
  position: relative;
}

.position-menu-panel {
  position: absolute;
  right: calc(100% + 8px);
  bottom: 0;
  min-width: 148px;
  padding: 6px;
  border: 1px solid var(--border-color, #dedbd5);
  border-radius: 8px;
  background: var(--bg-primary, #fff);
  box-shadow: 0 8px 24px rgba(34, 30, 24, 0.14);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 20;
}

.position-menu-panel button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-base, #333);
  cursor: pointer;
}

.position-menu-panel button:hover,
.position-menu-panel button:focus-visible {
  background: var(--bg-mute, #f5f7fa);
  color: var(--el-color-primary, #9b3a32);
  outline: none;
}

.reopen-chip {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color, #dedbd5);
  border-radius: 999px;
  background: var(--bg-primary, #fff);
  box-shadow: 0 6px 18px rgba(34, 30, 24, 0.14);
  color: var(--el-color-primary, #9b3a32);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

@media (max-width: 767px) {
  .floating-quick-actions {
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

  .drag-handle,
  .desktop-only {
    display: none;
  }

  .action-btn {
    width: 40px;
    height: 40px;
  }

  .mobile-only {
    display: flex;
  }

  .page-jump-actions {
    flex-direction: row;
    padding-top: 0;
    padding-left: 4px;
    margin-top: 0;
    margin-left: 2px;
    border-top: 0;
    border-left: 1px solid var(--border-color, #dedbd5);
  }

  .chapter-jump-actions {
    display: flex;
    flex-direction: row;
    gap: 2px;
    padding-left: 4px;
    margin-left: 2px;
    border-left: 1px solid var(--border-color, #dedbd5);
  }
}

/* iPad 等粗指针平板：同款底栏布局（JS is-touch-layout 驱动 is-mobile class） */
@media (hover: none) and (pointer: coarse) {
  .floating-quick-actions.is-mobile .chapter-jump-actions {
    display: flex;
    flex-direction: row;
    gap: 2px;
    padding-left: 4px;
    margin-left: 2px;
    border-left: 1px solid var(--border-color, #dedbd5);
  }

  .floating-quick-actions.is-mobile .action-btn {
    width: 40px;
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-btn {
    transition: none;
  }
}
</style>

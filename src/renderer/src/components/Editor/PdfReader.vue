<template>
  <div
    class="pdf-reader"
    data-testid="pdf-reader-root"
  >
    <!-- 顶部工具条：只读标识 + 页码 + 缩放 -->
    <div class="pdf-toolbar">
      <span
        class="pdf-readonly-badge"
        data-testid="pdf-readonly-badge"
      >
        <Lock :size="13" /> PDF 只读
      </span>
      <span
        class="pdf-page-indicator"
        data-testid="pdf-page-indicator"
      >
        {{ currentPage }} / {{ pageCount || '…' }}
      </span>
      <span
        v-if="outlineTitle"
        class="pdf-outline-hint"
        data-testid="pdf-outline-hint"
      >{{
        outlineTitle
      }}</span>
      <span class="pdf-toolbar-spacer" />
      <div class="pdf-zoom-controls">
        <button
          class="pdf-tool-btn"
          type="button"
          title="缩小"
          aria-label="缩小"
          data-testid="pdf-zoom-out"
          :disabled="!canZoomOut"
          @click="zoomOut"
        >
          <ZoomOut :size="16" />
        </button>
        <span
          class="pdf-zoom-value"
          data-testid="pdf-zoom-value"
        >{{ zoomPercent }}%</span>
        <button
          class="pdf-tool-btn"
          type="button"
          title="放大"
          aria-label="放大"
          data-testid="pdf-zoom-in"
          :disabled="!canZoomIn"
          @click="zoomIn"
        >
          <ZoomIn :size="16" />
        </button>
        <button
          class="pdf-tool-btn"
          type="button"
          title="适应宽度"
          aria-label="适应宽度"
          data-testid="pdf-zoom-fit"
          @click="fitWidth"
        >
          <MoveHorizontal :size="16" />
        </button>
      </div>
      <div class="pdf-mode-controls">
        <button
          class="pdf-tool-btn"
          type="button"
          :class="{ active: viewMode === 'single' }"
          title="单页模式（点击页面左右区域翻页）"
          aria-label="单页模式"
          data-testid="pdf-mode-single"
          :aria-pressed="viewMode === 'single'"
          @click="setViewMode('single')"
        >
          <BookOpenText :size="16" />
        </button>
        <button
          class="pdf-tool-btn"
          type="button"
          :class="{ active: viewMode === 'continuous' }"
          title="连续滚动模式"
          aria-label="连续滚动模式"
          data-testid="pdf-mode-continuous"
          :aria-pressed="viewMode === 'continuous'"
          @click="setViewMode('continuous')"
        >
          <Rows3 :size="16" />
        </button>
      </div>
    </div>

    <!-- 错误 / 加载态 -->
    <div
      v-if="loadError"
      class="pdf-state pdf-state-error"
      data-testid="pdf-error"
    >
      <FileWarning :size="28" />
      <p>{{ loadError }}</p>
    </div>
    <div
      v-else-if="loading"
      class="pdf-state"
      data-testid="pdf-loading"
    >
      <span class="pdf-spinner" />
      <p>{{ loadingMessage }}</p>
    </div>

    <!-- 连续纸页滚动区 -->
    <div
      v-show="!loadError && viewMode === 'continuous'"
      ref="scrollContainerRef"
      class="pdf-scroll-container"
      data-testid="pdf-scroll-container"
      @scroll.passive="handleScrollThrottled"
    >
      <div
        class="pdf-pages-stack"
        :style="{ width: stackWidth, padding: stackPadding }"
      >
        <div
          v-for="page in pageCount"
          :key="page"
          :ref="(el) => setPageEl(page, el)"
          class="pdf-page-slot"
          :data-page="page"
          :style="pageSlotStyle"
        >
          <div class="pdf-page-number">
            {{ page }}
          </div>
        </div>
        <div
          v-if="pageCount"
          class="pdf-end-mark"
        >
          — 全书完 · 共 {{ pageCount }} 页 —
        </div>
      </div>
    </div>

    <!-- 单页模式：整页展示 + 点击左右翻页 -->
    <div
      v-if="!loadError && viewMode === 'single'"
      class="pdf-single-view"
      data-testid="pdf-single-view"
      tabindex="0"
      role="region"
      aria-label="单页阅读区（点击左右区域翻页）"
      @keydown="handleSingleKeydown"
    >
      <div
        class="pdf-single-stage"
        :style="pageSlotStyle"
      >
        <div
          :ref="(el) => setPageEl(currentPage, el)"
          class="pdf-page-slot pdf-page-slot--single"
          :data-page="currentPage"
        >
          <div class="pdf-page-number">
            {{ currentPage }}
          </div>
        </div>
      </div>
      <button
        type="button"
        class="pdf-single-tap-zone pdf-single-tap-zone--left"
        aria-label="上一页"
        data-testid="pdf-tap-prev"
        :disabled="currentPage <= 1"
        @click="goPrevPage"
      />
      <button
        type="button"
        class="pdf-single-tap-zone pdf-single-tap-zone--right"
        aria-label="下一页"
        data-testid="pdf-tap-next"
        :disabled="currentPage >= pageCount"
        @click="goNextPage"
      />
      <div class="pdf-single-hint">
        点击左右区域翻页 · ← → 键翻页
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { FileWarning, Lock, MoveHorizontal, ZoomIn, ZoomOut, BookOpenText, Rows3 } from 'lucide-vue-next'
import { buildPdfFileUrl, getPdfOutline } from '@renderer/service/importExport'

const props = defineProps({
  bookName: { type: String, required: true },
  /** 外部已拿到的 outline（可选，避免重复请求） */
  outline: { type: Array, default: null }
})

const emit = defineEmits(['progress'])

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
const FIT_WIDTH = 'fit-width'
const RENDER_PADDING = 2 // 视口上下各多渲染 N 页
const PAGE_GAP = 18
const PDF_VIEW_MODE_KEY = 'dreamloom:pdf-view-mode:v1'

const scrollContainerRef = ref(null)
const loading = ref(true)
const loadingMessage = ref('正在加载 PDF…')
const loadError = ref('')
const pageCount = ref(0)
const outline = ref(Array.isArray(props.outline) ? props.outline : [])
const currentPage = ref(1)
const zoomMode = ref(FIT_WIDTH)
const zoomScale = ref(1)
// 阅读模式：continuous 连续滚动（默认）/ single 单页点击翻页
const viewMode = ref(readSavedViewMode())

function readSavedViewMode() {
  try {
    const raw = localStorage.getItem(PDF_VIEW_MODE_KEY)
    return raw === 'single' ? 'single' : 'continuous'
  } catch {
    return 'continuous'
  }
}

function setViewMode(mode) {
  const next = mode === 'single' ? 'single' : 'continuous'
  if (next === viewMode.value) return
  viewMode.value = next
  try {
    localStorage.setItem(PDF_VIEW_MODE_KEY, next)
  } catch {
    // ignore
  }
  if (next === 'single') {
    // 单页模式：只保留当前页渲染，其余页canvas移除省内存
    for (const [page, record] of pageRegistry) {
      if (page !== currentPage.value) removeCanvas(record)
    }
    renderedPages.clear()
    void nextTick(() => renderPage(currentPage.value))
  } else {
    // 回到连续模式：重新挂滚动渲染 + 对齐当前页
    void nextTick(() => {
      setupObservers()
      void scrollToPage(currentPage.value, { immediate: true })
    })
  }
}

// 每页尺寸（PDF 点），index 0 = 第 1 页
const pageSizes = ref([])
// 已渲染页码 Set
const renderedPages = new Set()
// page -> { el, canvas, renderTask, rendering }
const pageRegistry = new Map()
let pdfDocument = null
let loadingTask = null
let resizeObserver = null
let intersectionObserver = null
let scrollThrottleTimer = null
let progressSaveTimer = null
let destroyed = false

// ===== 布局计算 =====

const basePageWidth = computed(() => {
  // 用第一页宽度做布局基准（绝大多数 PDF 页面同宽）
  const first = pageSizes.value[0]
  return first ? first.width : 595
})

const fitScale = computed(() => {
  const container = scrollContainerRef.value
  const scrollbarReserve = container && container.scrollWidth > container.clientWidth ? 16 : 0
  const available = container ? Math.max(200, container.clientWidth - 96 - scrollbarReserve) : 800
  return Math.max(0.1, available / Math.max(1, basePageWidth.value))
})

const scale = computed(() =>
  zoomMode.value === FIT_WIDTH ? fitScale.value : zoomScale.value
)

const zoomPercent = computed(() => Math.round(scale.value * 100))
const canZoomIn = computed(() => {
  const idx = ZOOM_LEVELS.indexOf(zoomScale.value)
  return zoomMode.value === FIT_WIDTH || idx < ZOOM_LEVELS.length - 1
})
const canZoomOut = computed(() => {
  const idx = ZOOM_LEVELS.indexOf(zoomScale.value)
  return zoomMode.value === FIT_WIDTH || idx > 0
})

const pageSlotStyle = computed(() => {
  const first = pageSizes.value[0]
  const aspect = first ? first.height / first.width : 1.414
  return {
    width: `${Math.round(basePageWidth.value * scale.value)}px`,
    height: `${Math.round(basePageWidth.value * scale.value * aspect)}px`
  }
})

const stackWidth = computed(() => 'fit-content')
const stackPadding = computed(() => '28px 0px')

// ===== 进度持久化 =====

function progressKey() {
  return `pdfProgress:${props.bookName}`
}

function readSavedProgress() {
  try {
    const raw = localStorage.getItem(progressKey())
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const page = Number(parsed?.pageIndex)
    return Number.isInteger(page) && page >= 0 ? page : null
  } catch {
    return null
  }
}

function scheduleSaveProgress() {
  if (progressSaveTimer) return
  progressSaveTimer = setTimeout(() => {
    progressSaveTimer = null
    if (destroyed) return
    try {
      localStorage.setItem(
        progressKey(),
        JSON.stringify({ pageIndex: currentPage.value - 1, updatedAt: Date.now() })
      )
    } catch {
      // 存储失败忽略
    }
    emit('progress', { pageIndex: currentPage.value - 1, pageCount: pageCount.value })
  }, 600)
}

// ===== PDF 加载 =====

async function loadPdfjs() {
  // legacy 构建：内置 getOrInsertComputed/Math.sumPrecise 等 polyfill，兼容 Safari/iOS 等旧内核
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default || workerUrl
  return pdfjs
}

async function loadDocument() {
  loading.value = true
  loadingMessage.value = '正在加载 PDF…'
  loadError.value = ''
  try {
    // outline 优先用外部传入，否则请求后端
    if (!outline.value.length) {
      try {
        const result = await getPdfOutline(props.bookName)
        outline.value = result.outline || []
        if (result.pageCount) pageCount.value = result.pageCount
      } catch (error) {
        console.warn('[PdfReader] 加载目录失败:', error?.message)
      }
    }

    const pdfjs = await loadPdfjs()
    if (destroyed) return

    loadingTask = pdfjs.getDocument({
      url: buildPdfFileUrl(props.bookName),
      cMapUrl: '/pdfjs-runtime/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs-runtime/standard_fonts/',
      enableXfa: false,
      useWasm: false,
      stopAtErrors: false,
      // 按需加载：服务端已支持 HTTP Range（206）。
      // 关闭自动后台全量拉取——pdfjs 只请求目录 + 当前渲染页所在的数据块，
      // 大 PDF（10MB+）弱网下首屏不再「全量下载后才能看」。
      disableAutoFetch: true,
      disableStream: false,
      rangeChunkSize: 262144
    })
    pdfDocument = await loadingTask.promise
    if (destroyed) {
      void pdfDocument?.destroy?.()
      return
    }

    const count = pdfDocument.numPages || 0
    if (!count) throw new Error('PDF 文档不包含任何页面')
    if (!pageCount.value) pageCount.value = count

    // 读取第 1 页尺寸作为布局基准
    const firstPage = await pdfDocument.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1 })
    pageSizes.value = [{ width: viewport.width, height: viewport.height }]

    loading.value = false

    await nextTick()
    setupObservers()

    // 恢复上次阅读页
    const saved = readSavedProgress()
    if (saved != null && saved > 0 && saved < count) {
      await scrollToPage(saved + 1, { immediate: true })
    }
  } catch (error) {
    if (destroyed) return
    console.error('[PdfReader] PDF 加载失败:', error)
    loading.value = false
    loadError.value = `PDF 加载失败：${error?.message || '未知错误'}`
  }
}

// ===== 渲染（懒渲染：IntersectionObserver + 滚动窗口兜底）=====

function setPageEl(page, el) {
  if (!el) {
    pageRegistry.delete(page)
    return
  }
  pageRegistry.set(page, { el, canvas: null, renderTask: null, rendering: false })
}

function setupObservers() {
  teardownObservers()
  const container = scrollContainerRef.value
  if (!container) return

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const page = Number(entry.target.dataset.page)
        if (!Number.isInteger(page)) continue
        if (entry.isIntersecting) {
          renderPage(page)
        }
      }
    },
    { root: container, rootMargin: '120% 0px' }
  )
  for (const [page, record] of pageRegistry) {
    if (record.el) intersectionObserver.observe(record.el)
  }

  resizeObserver = new ResizeObserver(() => {
    // fit-width 下容器尺寸变化 → 重算布局 + 清理已渲染页（下一轮滚动重新渲染）
    if (zoomMode.value === FIT_WIDTH) {
      renderedPages.clear()
      for (const [, record] of pageRegistry) {
        removeCanvas(record)
      }
      renderVisiblePages()
    }
  })
  resizeObserver.observe(container)
  renderVisiblePages()
}

function teardownObservers() {
  intersectionObserver?.disconnect()
  intersectionObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
}

function pageSlotTop(page) {
  const record = pageRegistry.get(page)
  if (!record?.el) return null
  const containerRect = scrollContainerRef.value?.getBoundingClientRect()
  const elRect = record.el.getBoundingClientRect()
  if (!containerRect) return null
  return elRect.top - containerRect.top + scrollContainerRef.value.scrollTop
}

function renderVisiblePages() {
  const container = scrollContainerRef.value
  if (!container || !pdfDocument) return
  const scrollTop = container.scrollTop
  const viewHeight = container.clientHeight
  const pageHeight = Number(String(pageSlotStyle.value.height).replace('px', '')) || 800
  const firstVisible = Math.max(1, Math.floor(scrollTop / (pageHeight + PAGE_GAP)) - RENDER_PADDING)
  const lastVisible = Math.min(
    pageCount.value,
    Math.ceil((scrollTop + viewHeight) / (pageHeight + PAGE_GAP)) + RENDER_PADDING
  )
  for (let page = firstVisible; page <= lastVisible; page += 1) {
    renderPage(page)
  }
}

async function renderPage(page) {
  if (!pdfDocument || renderedPages.has(page) || destroyed) return
  const record = pageRegistry.get(page)
  if (!record?.el || record.rendering) return
  record.rendering = true
  renderedPages.add(page)
  try {
    const pdfPage = await pdfDocument.getPage(page)
    if (destroyed || !pageRegistry.has(page)) return
    const viewport = pdfPage.getViewport({ scale: scale.value })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.className = 'pdf-page-canvas'
    canvas.dataset.page = page
    canvas.setAttribute('aria-label', `第 ${page} 页`)
    removeCanvas(record)
    record.canvas = canvas
    record.el.appendChild(canvas)

    record.renderTask = pdfPage.render({ canvasContext: context, viewport })
    await record.renderTask.promise
  } catch (error) {
    renderedPages.delete(page)
    if (error?.name !== 'RenderingCancelledException') {
      console.warn(`[PdfReader] 第 ${page} 页渲染失败:`, error?.message)
    }
  } finally {
    const current = pageRegistry.get(page)
    if (current) current.rendering = false
  }
}

function removeCanvas(record) {
  if (!record) return
  if (record.renderTask) {
    try {
      record.renderTask.cancel()
    } catch {
      // ignore
    }
    record.renderTask = null
  }
  if (record.canvas) {
    record.canvas.remove()
    record.canvas = null
  }
}

// ===== 滚动 / 翻页 =====

function handleScrollThrottled() {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => {
    scrollThrottleTimer = null
    if (destroyed) return
    const top = pageSlotTop(currentPage.value)
    const container = scrollContainerRef.value
    if (!container) return
    // 当前页 = 视口顶部 1/3 处所在页
    const probe = container.scrollTop + container.clientHeight / 3
    const pageHeight = Number(String(pageSlotStyle.value.height).replace('px', '')) || 800
    const page = Math.min(pageCount.value, Math.max(1, Math.floor(probe / (pageHeight + PAGE_GAP)) + 1))
    if (page !== currentPage.value) {
      currentPage.value = page
      scheduleSaveProgress()
    }
    renderVisiblePages()
    void top
  }, 120)
}

/** 滚动到指定页（1-based）。 */
async function scrollToPage(page, options = {}) {
  const target = Math.min(Math.max(1, page), Math.max(1, pageCount.value))
  currentPage.value = target
  scheduleSaveProgress()
  const container = scrollContainerRef.value
  if (!container) return
  await nextTick()
  if (viewMode.value === 'single') {
    // 单页模式：不操作隐藏的滚动容器，只渲染当前页
    renderPage(target)
    return
  }
  const top = pageSlotTop(target)
  if (top == null) {
    // 布局尚未完成（如极远页），用估算高度直接定位
    const pageHeight = Number(String(pageSlotStyle.value.height).replace('px', '')) || 800
    container.scrollTop = (target - 1) * (pageHeight + PAGE_GAP) + 28
  } else {
    container.scrollTop = top - 12
  }
  if (options.immediate !== true) {
    // 平滑滚动（从目录点进来时）
    // scrollTop 已直接设置，这里补充渲染目标页周边
  }
  renderPage(target)
  renderVisiblePages()
}

/** 翻页：按视口高度滚动一屏。 */
function scrollByViewport(direction) {
  const container = scrollContainerRef.value
  if (!container) return
  const delta = container.clientHeight * 0.88
  container.scrollBy({ top: direction === 'up' ? -delta : delta, behavior: 'smooth' })
}

function goPrevPage() {
  if (currentPage.value <= 1) {
    if (viewMode.value === 'single') ElMessageLite('已经是第一页了')
    return
  }
  void scrollToPage(currentPage.value - 1)
  if (viewMode.value === 'single') {
    renderedPages.clear()
    void nextTick(() => renderPage(currentPage.value))
  }
}

function goNextPage() {
  if (currentPage.value >= pageCount.value) {
    if (viewMode.value === 'single') ElMessageLite('已经是最后一页了')
    return
  }
  void scrollToPage(currentPage.value + 1)
  if (viewMode.value === 'single') {
    renderedPages.clear()
    void nextTick(() => renderPage(currentPage.value))
  }
}

/** 轻提示（单页模式边界），不引入 Element Plus 依赖 */
let boundaryToast = null
function ElMessageLite(message) {
  if (boundaryToast) clearTimeout(boundaryToast)
  const stage = document.querySelector('.pdf-single-view .pdf-single-hint')
  if (stage) {
    stage.textContent = message
    boundaryToast = setTimeout(() => {
      if (stage.isConnected) stage.textContent = '点击左右区域翻页 · ← → 键翻页'
    }, 1500)
  }
}

/** 单页模式键盘翻页：← → / PageUp PageDown / 空格 */
function handleSingleKeydown(event) {
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
    event.preventDefault()
    goNextPage()
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
    event.preventDefault()
    goPrevPage()
  }
}

// ===== 缩放 =====

function zoomIn() {
  const current = zoomMode.value === FIT_WIDTH ? nearestLevel(scale.value) : zoomScale.value
  const next = ZOOM_LEVELS.find((level) => level > current + 0.01)
  applyZoom(next ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1])
}

function zoomOut() {
  const current = zoomMode.value === FIT_WIDTH ? nearestLevel(scale.value) : zoomScale.value
  const prev = [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.01)
  applyZoom(prev ?? ZOOM_LEVELS[0])
}

function fitWidth() {
  zoomMode.value = FIT_WIDTH
  rerenderAll()
}

function applyZoom(level) {
  zoomMode.value = 'fixed'
  zoomScale.value = level
  rerenderAll()
}

function nearestLevel(value) {
  return ZOOM_LEVELS.reduce(
    (best, level) => (Math.abs(level - value) < Math.abs(best - value) ? level : best),
    ZOOM_LEVELS[0]
  )
}

function rerenderAll() {
  renderedPages.clear()
  for (const [, record] of pageRegistry) {
    removeCanvas(record)
  }
  void nextTick(() => {
    renderVisiblePages()
    // 保持当前页在视口内
    void scrollToPage(currentPage.value, { immediate: true })
  })
}

// ===== 对外（Editor 集成）=====

defineExpose({
  scrollToPage,
  getCurrentPage: () => currentPage.value,
  getPageCount: () => pageCount.value,
  goPrevPage,
  goNextPage,
  scrollByViewport
})

// ===== 生命周期 =====

onMounted(() => {
  void loadDocument()
})

onBeforeUnmount(() => {
  destroyed = true
  teardownObservers()
  if (scrollThrottleTimer) clearTimeout(scrollThrottleTimer)
  if (progressSaveTimer) clearTimeout(progressSaveTimer)
  for (const [, record] of pageRegistry) {
    removeCanvas(record)
  }
  pageRegistry.clear()
  renderedPages.clear()
  try {
    pdfDocument?.destroy?.()
  } catch {
    // ignore
  }
  try {
    loadingTask?.destroy?.()
  } catch {
    // ignore
  }
  pdfDocument = null
  loadingTask = null
})

watch(
  () => props.bookName,
  (next, prev) => {
    if (!next || next === prev) return
    // 切书：完全重载
    destroyed = false
    outline.value = []
    pageCount.value = 0
    pageSizes.value = []
    currentPage.value = 1
    renderedPages.clear()
    for (const [, record] of pageRegistry) removeCanvas(record)
    pageRegistry.clear()
    try {
      pdfDocument?.destroy?.()
    } catch {
      // ignore
    }
    try {
      loadingTask?.destroy?.()
    } catch {
      // ignore
    }
    pdfDocument = null
    loadingTask = null
    void loadDocument()
  }
)

const outlineTitle = computed(() => {
  const current = currentPage.value - 1
  let matched = ''
  for (const item of outline.value) {
    if (Number.isInteger(item.pageIndex) && item.pageIndex <= current) {
      matched = item.title
    } else {
      break
    }
  }
  return matched
})
</script>

<style scoped>
.pdf-reader {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--pdf-reader-bg, #eceef1);
  overflow: hidden;
}

[data-color-scheme='dark'] .pdf-reader {
  --pdf-reader-bg: #16181d;
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--pdf-toolbar-bg, rgba(255, 255, 255, 0.92));
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 13px;
  color: #1d1d1f;
  z-index: 2;
}

[data-color-scheme='dark'] .pdf-toolbar {
  --pdf-toolbar-bg: rgba(28, 30, 36, 0.94);
  color: #f5f5f7;
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.pdf-readonly-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(138, 90, 58, 0.14);
  color: #8a5a3a;
  font-size: 12px;
  font-weight: 600;
}

[data-color-scheme='dark'] .pdf-readonly-badge {
  background: rgba(200, 145, 105, 0.2);
  color: #d8a97e;
}

.pdf-page-indicator {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.pdf-outline-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
  opacity: 0.65;
}

.pdf-toolbar-spacer {
  flex: 1;
}

.pdf-zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pdf-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}

.pdf-tool-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.07);
}

[data-color-scheme='dark'] .pdf-tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.pdf-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pdf-zoom-value {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.pdf-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
}

/* ===== 单页模式 ===== */
.pdf-single-view {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  outline: none;
}

.pdf-single-stage {
  position: relative;
}

.pdf-page-slot--single {
  margin: 0 auto;
}

.pdf-single-tap-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 34%;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.pdf-single-tap-zone--left {
  left: 0;
}

.pdf-single-tap-zone--right {
  right: 0;
}

.pdf-single-tap-zone:disabled {
  cursor: default;
  opacity: 0.55;
}

.pdf-single-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  background: color-mix(in srgb, var(--pdf-reader-bg, #eceef1) 82%, transparent);
  border: 1px solid rgba(0, 0, 0, 0.08);
  pointer-events: none;
  white-space: nowrap;
  z-index: 5;
}

.pdf-mode-controls {
  display: flex;
  gap: 2px;
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid rgba(0, 0, 0, 0.1);
}

.pdf-tool-btn.active {
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 14%, transparent);
  color: var(--el-color-primary, #409eff);
}

.pdf-pages-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  margin: 0 auto;
  box-sizing: border-box;
}

.pdf-page-slot {
  position: relative;
  background: #fff;
  border-radius: 4px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 4px 14px rgba(0, 0, 0, 0.08);
  flex: none;
}

[data-color-scheme='dark'] .pdf-page-slot {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.5),
    0 4px 14px rgba(0, 0, 0, 0.4);
}

.pdf-page-slot :deep(canvas.pdf-page-canvas) {
  display: block;
  border-radius: 4px;
  width: 100%;
  height: 100%;
}

.pdf-page-number {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

[data-color-scheme='dark'] .pdf-page-number {
  color: rgba(255, 255, 255, 0.4);
}

.pdf-end-mark {
  padding: 26px 0 34px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
  letter-spacing: 2px;
}

[data-color-scheme='dark'] .pdf-end-mark {
  color: rgba(255, 255, 255, 0.35);
}

.pdf-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(0, 0, 0, 0.55);
  font-size: 14px;
  padding: 40px;
}

[data-color-scheme='dark'] .pdf-state {
  color: rgba(255, 255, 255, 0.6);
}

.pdf-state-error {
  color: #c0392b;
}

.pdf-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid rgba(0, 0, 0, 0.15);
  border-top-color: #0a84ff;
  animation: pdf-spin 0.9s linear infinite;
}

[data-color-scheme='dark'] .pdf-spinner {
  border-color: rgba(255, 255, 255, 0.2);
}

@keyframes pdf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<template>
  <!-- 外层 wrap：非滚动，承载固定定位的页码指示器（不能放进滚动容器，否则翻页时会跟着滑走） -->
  <div class="reading-flow-wrap">
    <div
      ref="scrollRef"
      class="reading-flow"
      :class="{ 'is-paged': isPaged }"
      data-testid="editor-reading-flow"
      :data-loaded-blocks="loadedBlockCount"
      :data-total-blocks="totalBlockCount"
      :data-paged="isPaged ? 'true' : 'false'"
      :data-paged-current="isPaged ? pageIndex + 1 : ''"
      :data-paged-total="isPaged ? pageCount : ''"
      :data-active-section="activeSectionKey || ''"
      tabindex="0"
      :aria-label="isPaged ? '横向翻页阅读区' : '纵向阅读区'"
      @scroll.passive="handleScroll"
      @keydown="handleKeydown"
      @click="handleTapToPage"
      @wheel.passive="handleWheel"
      @touchstart.passive="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend.passive="handleTouchEnd"
    >
      <!-- ===== 左右翻页：所有章节汇入同一条多列纸带 ===== -->
      <article
        v-if="isPaged"
        ref="paperRef"
        class="reading-flow__paper reading-flow__paper--paged"
        :class="{ 'is-note': contentType === 'note' }"
      >
        <!-- eslint-disable vue/no-v-html -->
        <template
          v-for="section in normalizedSections"
          :key="section.key"
        >
          <h3
            v-if="normalizedSections.length > 1 || section.label"
            class="reading-flow__section-title"
            :data-section-title="section.key"
          >
            {{ section.label }}
          </h3>
          <div
            class="reading-flow__paged-content"
            :data-section-content="section.key"
            v-html="section.html"
          />
        </template>
      <!-- eslint-enable vue/no-v-html -->
      </article>

      <!-- ===== 纵向滚动：逐章分块懒加载 ===== -->
      <article
        v-else
        class="reading-flow__paper"
        :class="{ 'is-note': contentType === 'note' }"
      >
        <template
          v-for="section in sectionChunks"
          :key="section.key"
        >
          <section
            class="reading-flow__section"
            :data-reading-section="section.key"
          >
            <h3
              v-if="normalizedSections.length > 1"
              class="reading-flow__section-title reading-flow__section-title--scroll"
              :data-section-title="section.key"
            >
              {{ section.label }}
            </h3>
            <!-- eslint-disable vue/no-v-html -->
            <div
              v-for="chunk in visibleChunksOf(section)"
              :key="chunk.id"
              class="reading-flow__chunk"
              :data-reading-chunk="chunk.index"
              v-html="chunk.html"
            />
            <!-- eslint-enable vue/no-v-html -->
            <div
              v-if="sectionHasMore(section)"
              class="reading-flow__loader"
              :data-section-loader="section.key"
              role="status"
              aria-live="polite"
            >
              继续向下滑动，动态加载后续内容
            </div>
          </section>
        </template>
        <div
          v-if="sectionChunks.length"
          class="reading-flow__end"
          data-testid="reading-flow-end"
        >
          {{ bookEnd ? '全书完' : '继续下滑，将自动续接下一章' }}
        </div>
      </article>

      <!-- 左右翻页模式的页码指示（位于滚动容器外，固定屏幕底部中央） -->
    </div>
    <div
      v-if="isPaged && pageCount > 0"
      class="reading-flow__page-indicator"
      data-testid="reading-page-indicator"
      aria-live="polite"
    >
      <template v-if="activeSectionLabel()">
        {{ activeSectionLabel() }} ·
      </template>{{ pageIndex + 1 }} / {{ pageCount }}
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  html: {
    type: String,
    default: ''
  },
  contentType: {
    type: String,
    default: 'chapter'
  },
  blocksPerChunk: {
    type: Number,
    default: 18
  },
  initialChunkCount: {
    type: Number,
    default: 2
  },
  /** 翻页方式：scroll 纵向滚动 / paged 左右翻页 */
  pageMode: {
    type: String,
    default: 'scroll'
  },
  /**
   * 多章拼接：[{ key, label, html }]，按阅读顺序排列。
   * key 建议用章节 path；当前章的 key 与编辑器文件 path 一致。
   * 不传时退化为单章（html prop）。
   */
  sections: {
    type: Array,
    default: null
  },
  /** 跨章标题（单章模式页码指示用） */
  chapterLabel: {
    type: String,
    default: ''
  },
  /** 锚点章：新纸带/整体换章时视口定位到这一章（当前编辑章 path） */
  anchorSectionKey: {
    type: String,
    default: ''
  },
  /** 已到书尾/书首（Editor 依据章节大纲判断），用于结尾文案与提示 */
  bookEnd: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['page-change', 'reach-end', 'active-section-change'])

const scrollRef = ref(null)
const paperRef = ref(null)
const pageIndex = ref(0)
const pageCount = ref(0)
const activeSectionKey = ref('')
let observer = null
let scrollFrame = 0
let resizeObserver = null
let layoutFrame = 0

const isPaged = computed(() => props.pageMode === 'paged')

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/**
 * TipTap 正文已经过编辑器 schema 约束。这里再剥掉可执行节点/事件属性，
 * 然后只按顶层块分片；进入阅读模式时先渲染少量块，后续随滚动追加。
 */
function extractSafeBlocks(html = '') {
  const source = String(html || '').trim()
  if (!source) return []
  if (typeof DOMParser === 'undefined') {
    return source
      .split(/\n{2,}/)
      .map((text) => `<p>${escapeHtml(text)}</p>`)
      .filter(Boolean)
  }

  const documentNode = new DOMParser().parseFromString(`<main id="reading-root">${source}</main>`, 'text/html')
  const root = documentNode.getElementById('reading-root')
  if (!root) return []
  root.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove())
  root.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'contenteditable' || name === 'draggable') {
        node.removeAttribute(attribute.name)
      }
    }
  })

  const blocks = [...root.children].map((node) => node.outerHTML).filter(Boolean)
  if (blocks.length) return blocks
  const text = root.textContent?.trim()
  return text ? [`<p>${escapeHtml(text)}</p>`] : []
}

function createChunks(blocks, blocksPerChunk) {
  const size = Math.max(6, Math.min(48, Number(blocksPerChunk) || 18))
  const result = []
  let pending = []
  let pendingChars = 0

  for (const block of blocks) {
    // 双阈值：段落多或单段很长时都及时切片，避免一次插入超大 DOM。
    if (pending.length && (pending.length >= size || pendingChars + block.length > 12_000)) {
      result.push(pending)
      pending = []
      pendingChars = 0
    }
    pending.push(block)
    pendingChars += block.length
  }
  if (pending.length) result.push(pending)

  return result.map((items, index) => ({
    id: `reading-chunk-${index}`,
    index,
    blockCount: items.length,
    html: items.join('')
  }))
}

// ===== 章节列表（单章兼容 + 多章拼接） =====

const normalizedSections = computed(() => {
  if (Array.isArray(props.sections) && props.sections.length) {
    return props.sections
      .filter((section) => section && (section.html || section.label))
      .map((section, index) => ({
        key: String(section.key || section.path || `section-${index}`),
        label: String(section.label || ''),
        html: String(section.html || '')
      }))
  }
  return [{ key: 'main', label: props.chapterLabel, html: props.html }]
})

const sectionChunks = computed(() =>
  normalizedSections.value.map((section) => ({
    ...section,
    chunks: createChunks(extractSafeBlocks(section.html), props.blocksPerChunk)
  }))
)

const totalBlockCount = computed(() =>
  normalizedSections.value.reduce(
    (total, section) => total + extractSafeBlocks(section.html).length,
    0
  )
)

// 每章已加载的 chunk 数（key -> count）；新章默认 initialChunkCount
const visibleChunkCounts = ref({})

function sectionInitialCount() {
  return Math.max(1, Number(props.initialChunkCount) || 2)
}

function visibleChunksOf(section) {
  const count = visibleChunkCounts.value[section.key] ?? sectionInitialCount()
  return section.chunks.slice(0, count)
}

function sectionHasMore(section) {
  const count = visibleChunkCounts.value[section.key] ?? sectionInitialCount()
  return count < section.chunks.length
}

const loadedBlockCount = computed(() =>
  sectionChunks.value.reduce((total, section) => {
    const count = visibleChunkCounts.value[section.key] ?? sectionInitialCount()
    return total + section.chunks.slice(0, count).reduce((sum, chunk) => sum + chunk.blockCount, 0)
  }, 0)
)

function loadMoreSection(sectionKey, chunkCount = 1) {
  const section = sectionChunks.value.find((item) => item.key === sectionKey)
  if (!section) return false
  const current = visibleChunkCounts.value[sectionKey] ?? sectionInitialCount()
  if (current >= section.chunks.length) return false
  visibleChunkCounts.value = {
    ...visibleChunkCounts.value,
    [sectionKey]: Math.min(section.chunks.length, current + Math.max(1, Number(chunkCount) || 1))
  }
  void nextTick(setupObserver)
  return true
}

// 兼容旧 expose：loadMore() 无参时推进最后一章
function loadMore(chunkCount = 1) {
  const last = sectionChunks.value[sectionChunks.value.length - 1]
  return last ? loadMoreSection(last.key, chunkCount) : false
}

function setupObserver() {
  observer?.disconnect()
  observer = null
  if (isPaged.value || !scrollRef.value || typeof IntersectionObserver === 'undefined') return
  const loaders = scrollRef.value.querySelectorAll('[data-section-loader]')
  if (!loaders.length) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const key = entry.target.getAttribute('data-section-loader')
          if (key) loadMoreSection(key, 1)
        }
      }
    },
    {
      root: scrollRef.value,
      rootMargin: '80% 0px 80% 0px',
      threshold: 0.01
    }
  )
  loaders.forEach((el) => observer.observe(el))
}

// ===== 边界续接（reach-end）=====

const reachCooldown = { prev: 0, next: 0 }
const REACH_COOLDOWN_MS = 1200

function withinCooldown(direction) {
  return Date.now() - reachCooldown[direction] < REACH_COOLDOWN_MS
}

function markReach(direction) {
  reachCooldown[direction] = Date.now()
}

function emitReach(direction) {
  if (withinCooldown(direction)) return
  markReach(direction)
  emit('reach-end', direction)
}

// ===== 滚动模式 =====

function handleScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const element = scrollRef.value
    if (!element) return
    if (isPaged.value) {
      syncPagedFromScroll()
      return
    }
    trackActiveSectionByTop(element)
    // 最后一章接近底部时预取下一章，保证"无缝"
    const last = sectionChunks.value[sectionChunks.value.length - 1]
    const lastLoadedAll = last ? !sectionHasMore(last) : true
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (lastLoadedAll && remaining <= element.clientHeight * 0.8) {
      emitReach('next')
    }
  })
}

/** 滚轮：翻页模式=翻页；滚动模式=到顶后继续上滚触发上一章 */
function handleWheel(event) {
  if (isPaged.value) {
    event.preventDefault()
    if (wheelGuard(event)) return
    void turnPage(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1)
    return
  }
  const element = scrollRef.value
  if (!element) return
  const goingUp = event.deltaY < -2
  if (goingUp && element.scrollTop <= 0) emitReach('prev')
}

let lastWheelTime = 0
function wheelGuard(event) {
  const now = Date.now()
  // 触控板惯性滚轮会连发，200ms 内只翻一页
  if (now - lastWheelTime < 200) return true
  if (Math.abs(event.deltaY) + Math.abs(event.deltaX) < 4) return true
  lastWheelTime = now
  return false
}

async function scrollPage(direction = 1) {
  const element = scrollRef.value
  if (!element) return false
  if (isPaged.value) return turnPage(direction)
  const normalizedDirection = Number(direction) < 0 ? -1 : 1
  // 边界续接：tap 翻页到顶/到底时触发上一章/下一章（移动端没有 wheel 事件）
  if (normalizedDirection < 0 && element.scrollTop <= 0) {
    emitReach('prev')
    return true
  }
  if (normalizedDirection > 0) {
    const last = sectionChunks.value[sectionChunks.value.length - 1]
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (last && sectionHasMore(last) && remaining <= element.clientHeight * 1.5) {
      loadMoreSection(last.key, 2)
      await nextTick()
    } else if (last && !sectionHasMore(last) && remaining <= 4) {
      emitReach('next')
      return true
    }
  }
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  element.scrollBy({
    top: normalizedDirection * Math.max(180, element.clientHeight * 0.86),
    behavior: reduceMotion ? 'auto' : 'smooth'
  })
  return true
}

function handleKeydown(event) {
  if (isPaged.value) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
      event.preventDefault()
      void turnPage(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
      event.preventDefault()
      void turnPage(-1)
    }
    return
  }
  if (event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
    event.preventDefault()
    void scrollPage(1)
  } else if (event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
    event.preventDefault()
    void scrollPage(-1)
  }
}

/**
 * 轻点翻页：
 * - 翻页模式（所有设备）：点左 1/3 上一页、右 2/3 下一页（桌面也生效）
 * - 滚动模式：只在粗指针（手机/平板）生效，点左 1/3 上一屏、右 2/3 下一屏
 * - 拖选文字、点在链接/按钮上时不翻页
 */
function handleTapToPage(event) {
  if (suppressClickUntil && Date.now() < suppressClickUntil) {
    suppressClickUntil = 0
    event.preventDefault?.()
    event.stopPropagation?.()
    return
  }
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  if (!isPaged.value && !coarsePointer) return
  const selection = window.getSelection?.()
  if (selection && !selection.isCollapsed) return
  const target = event.target
  if (target?.closest?.('a, button, img')) return
  const rect = scrollRef.value?.getBoundingClientRect?.()
  if (!rect) return
  const relativeX = event.clientX - rect.left
  const forward = relativeX >= rect.width / 3
  void (isPaged.value ? turnPage(forward ? 1 : -1) : scrollPage(forward ? 1 : -1))
}

// ===== 触摸横滑翻页（跟手拖动 + 松手判定；paged 模式专属） =====

/**
 * 手势状态机：
 * - touchstart 记录起点与当时 scrollLeft，只认「第一根手指、主键」
 * - touchmove 若横向主导（|dx|>|dy| 且 |dx|>8px）则进入拖动：scrollLeft 跟手（阻尼 1:1），
 *   并 preventDefault 阻止原生滚动/回弹（touch-action 已在 CSS 限定 pan-y）
 * - touchend 按总位移与速度判定：|dx| ≥ 48px 或速度 ≥ 0.35px/ms → 翻页；否则回弹。
 *   判定翻页后设置 suppressClickUntil，吞掉浏览器在 tap 位置合成的 click 防双触发。
 * - 滚动模式不拦截：竖向原生滚动不受影响；paged 下若用户竖滑（|dy|>|dx|）也放行。
 */
const TOUCH_TURN_THRESHOLD_PX = 48
const TOUCH_TURN_VELOCITY = 0.35
let touchState = null // { id, x, y, startX, startY, startScrollLeft, startAt, dragging, moved, lastX, lastAt, maxDx }
let suppressClickUntil = 0

function handleTouchStart(event) {
  if (!isPaged.value || event.touches.length !== 1) {
    touchState = null
    return
  }
  const element = scrollRef.value
  if (element) {
    // 程序性翻页动画进行中：用户触摸立即打断动画，钉到目标整页再开始手势，
    // 保证 startScrollLeft 采样自整页位置（否则连翻/快操作时 basePage 会算错）
    if (
      programmaticPage.value >= 0 &&
      Date.now() - programmaticPageAt.value < PROGRAMMATIC_PAGE_WINDOW_MS
    ) {
      const width = pagedViewportWidth()
      if (width > 0) element.scrollLeft = programmaticPage.value * width
    }
  }
  const touch = event.touches[0]
  touchState = {
    id: touch.identifier,
    startX: touch.clientX,
    startY: touch.clientY,
    startScrollLeft: scrollRef.value?.scrollLeft || 0,
    startAt: Date.now(),
    dragging: false,
    moved: false,
    lastX: touch.clientX,
    lastAt: Date.now(),
    maxDx: 0
  }
}

function handleTouchMove(event) {
  const state = touchState
  if (!state || !isPaged.value || event.touches.length !== 1) return
  const touch = event.touches[0]
  if (touch.identifier !== state.id) return
  const element = scrollRef.value
  if (!element) return
  const dx = touch.clientX - state.startX
  const dy = touch.clientY - state.startY
  if (!state.dragging) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    if (Math.abs(dy) > Math.abs(dx)) {
      // 竖向手势：放行原生行为，结束本次手势追踪
      touchState = null
      return
    }
    state.dragging = true
  }
  // 横向拖动跟手：向左滑（dx<0）= scrollLeft 增大 = 下一页方向
  state.moved = true
  state.maxDx = Math.max(state.maxDx, Math.abs(dx))
  event.preventDefault()
  element.scrollLeft = state.startScrollLeft - dx
}

function handleTouchEnd(event) {
  const state = touchState
  touchState = null
  if (!state || !state.dragging || !isPaged.value) return
  if (event.touches.length > 0) return
  const element = scrollRef.value
  if (!element) return
  const width = pagedViewportWidth()
  if (width <= 0) return
  const endTouch = event.changedTouches[0]
  const dx = endTouch ? endTouch.clientX - state.startX : 0
  const dt = Math.max(1, Date.now() - state.startAt)
  const velocity = Math.abs(dx) / dt
  const fastFlick = velocity >= TOUCH_TURN_VELOCITY
  const farDrag = Math.abs(dx) >= TOUCH_TURN_THRESHOLD_PX
  // 从手势起点页计算目标：拖动期间 syncPagedFromScroll 会把 pageIndex 更新成中途值，
  // 不能用 pageIndex+direction（否则拖过大半页时会跳两页）
  const basePage = Math.round(state.startScrollLeft / width)
  suppressClickUntil = Date.now() + 600
  if (!fastFlick && !farDrag) {
    // 未达阈值：吸附回最近的整页（容器无原生 scroll-snap，必须主动回弹）
    goToPage(Math.max(0, Math.min(pageCount.value - 1, Math.round(element.scrollLeft / width))))
    return
  }
  const direction = dx < 0 ? 1 : -1
  const target = basePage + direction
  if (target < 0) {
    emitReach('prev')
    goToPage(0) // scrollLeft 已被钳在 0，视觉无跳变；上一章 prepend 后由锚点补偿接管
    return
  }
  if (target >= pageCount.value) {
    emitReach('next')
    goToPage(pageCount.value - 1) // 末页边界：回弹到当前末页，续接成功后由新章首页接管
    return
  }
  goToPage(target)
}

// ===== 左右翻页（CSS 多列分页） =====

/**
 * 页宽取整：Safari/Chrome 在 columns 布局下存在亚像素列宽，
 * 用 floor 避免 scrollLeft 落在两列之间产生半页内容串列。
 */
function pagedViewportWidth() {
  const element = scrollRef.value
  if (!element) return 0
  const styles = getComputedStyle(element)
  const horizontalPadding =
    Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
  return Math.max(0, Math.floor(element.clientWidth - horizontalPadding))
}

/** 每章起始页 / 起始 offsetTop（锚点补偿与活动章判定用） */
const sectionStartPages = ref({})
const sectionStartTops = ref({})

function collectSectionPositions(width) {
  const element = scrollRef.value
  if (!element) return
  const pages = {}
  const tops = {}
  element.querySelectorAll('[data-section-title]').forEach((el) => {
    const key = el.getAttribute('data-section-title')
    if (!key) return
    if (isPaged.value && width > 0) {
      pages[key] = Math.max(0, Math.round(el.offsetLeft / width))
    }
    tops[key] = el.offsetTop
  })
  sectionStartPages.value = pages
  sectionStartTops.value = tops
}

function activeSectionLabel() {
  if (!activeSectionKey.value) return ''
  const section = normalizedSections.value.find((item) => item.key === activeSectionKey.value)
  return section?.label || ''
}

/** 测量总页数并采集各章起始页 */
async function measurePagedPages() {
  const element = scrollRef.value
  if (!element || !isPaged.value) return
  const width = pagedViewportWidth()
  if (width <= 0) return
  const total = Math.max(1, Math.round(element.scrollWidth / width))
  pageCount.value = total
  if (pageIndex.value > total - 1) pageIndex.value = total - 1
  collectSectionPositions(width)
}

/** 滚动位置 → 页码（动画过程中实时同步指示） */
function syncPagedFromScroll() {
  const element = scrollRef.value
  if (!element || !isPaged.value) return
  const width = pagedViewportWidth()
  if (width <= 0) return
  let next = Math.round(element.scrollLeft / width)
  // 程序性翻页动画期间，scrollLeft 是中途值：只要还没越过目标页中线，
  // 就不要用中途值回写 pageIndex（否则 tap/键盘连翻会被打回上一页）
  if (programmaticPage.value >= 0 && Date.now() - programmaticPageAt.value < PROGRAMMATIC_PAGE_WINDOW_MS) {
    const target = programmaticPage.value
    if (next !== target && Math.abs(element.scrollLeft - target * width) > width * 0.5) {
      return // 动画尚未过半，忽略中途采样
    }
  }
  if (next !== pageIndex.value) {
    pageIndex.value = next
    trackActiveSectionByPage()
    emit('page-change', { pageIndex: next, pageCount: pageCount.value })
  }
}

// 程序性翻页动画保护：goToPage 后 700ms 内 scroll 事件的中途值不回写 pageIndex
const programmaticPage = ref(-1)
const programmaticPageAt = ref(0)
const PROGRAMMATIC_PAGE_WINDOW_MS = 700

/** 翻页核心：整页平移，带边界续接 */
function turnPage(direction = 1) {
  const element = scrollRef.value
  if (!element || !isPaged.value) return Promise.resolve(false)
  const normalizedDirection = Number(direction) < 0 ? -1 : 1
  const width = pagedViewportWidth()
  if (width <= 0) return Promise.resolve(false)
  const target = pageIndex.value + normalizedDirection
  if (target < 0) {
    emitReach('prev')
    return Promise.resolve(false)
  }
  if (target >= pageCount.value) {
    emitReach('next')
    return Promise.resolve(false)
  }
  goToPage(target)
  return Promise.resolve(true)
}

function goToPage(target, behavior) {
  const element = scrollRef.value
  if (!element) return
  pageIndex.value = target
  programmaticPage.value = target
  programmaticPageAt.value = Date.now()
  const width = pagedViewportWidth()
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  element.scrollTo({
    left: target * width,
    behavior: behavior || (reduceMotion ? 'auto' : 'smooth')
  })
  trackActiveSectionByPage()
  emit('page-change', { pageIndex: target, pageCount: pageCount.value })
}

// ===== 活动章节跟踪（退出阅读模式时回到视野所在章） =====

function setActiveSection(key) {
  const normalized = key === 'main' ? '' : key
  if (normalized !== activeSectionKey.value) {
    activeSectionKey.value = normalized
    emit('active-section-change', normalized)
  }
}

function trackActiveSectionByPage() {
  const width = pagedViewportWidth()
  if (width <= 0) return
  const current = pageIndex.value
  let hit = ''
  for (const section of normalizedSections.value) {
    const start = sectionStartPages.value[section.key]
    if (Number.isFinite(start) && start <= current) hit = section.key
    else break
  }
  setActiveSection(hit)
}

function trackActiveSectionByTop(element) {
  const probe = element.scrollTop + element.clientHeight * 0.35
  let hit = ''
  for (const section of normalizedSections.value) {
    const start = sectionStartTops.value[section.key] ?? 0
    if (start <= probe) hit = section.key
    else break
  }
  setActiveSection(hit)
}

// ===== 章节集合变化：锚点补偿 / 前后章续接定位 =====

let lastSectionKeys = []

async function handleSectionsChange() {
  const element = scrollRef.value
  if (!element) return
  const sections = normalizedSections.value
  const newKeys = sections.map((item) => item.key)
  // 锚点 = 显式指定章（整体换章）或当前视野章（续接）
  const anchorKey =
    props.anchorSectionKey && newKeys.includes(props.anchorSectionKey)
      ? props.anchorSectionKey
      : activeSectionKey.value || newKeys[0]
  const anchorKnown = lastSectionKeys.includes(anchorKey)
  const anchorStillPresent = newKeys.includes(anchorKey)

  if (isPaged.value) {
    await nextTick()
    await measurePagedPages()
    if (!anchorKnown || !anchorStillPresent) {
      // 整体换章（目录跳转/进入阅读模式）：定位到锚点章首页
      const anchorPage = sectionStartPages.value[anchorKey] ?? 0
      goToPage(anchorPage, 'auto')
    } else {
      const anchorIdx = newKeys.indexOf(anchorKey)
      const insertedBefore = newKeys.slice(0, Math.max(0, anchorIdx)).filter((key) => !lastSectionKeys.includes(key))
      const insertedAfter = newKeys.slice(anchorIdx + 1).filter((key) => !lastSectionKeys.includes(key))
      const anchorPage = sectionStartPages.value[anchorKey] ?? 0
      if (insertedBefore.length) {
        // 回翻续上前一章：落在上一章末尾（锚点章前移了，视口保持原内容）
        goToPage(Math.max(0, anchorPage - 1), 'auto')
      } else if (insertedAfter.length) {
        // 前翻续上下一章：落在第一张新页（无缝衔接下一章开头）
        const firstNew = insertedAfter[0]
        goToPage(sectionStartPages.value[firstNew] ?? anchorPage)
      } else {
        // 纯重排（字号/裁剪窗口）：保持当前页
        goToPage(Math.min(pageIndex.value, pageCount.value - 1), 'auto')
      }
    }
  } else {
    await nextTick()
    collectSectionPositions(0)
    if (!anchorKnown || !anchorStillPresent) {
      // 整体换章：锚点章顶部对齐视口
      const anchorTop = sectionStartTops.value[anchorKey] ?? 0
      element.scrollTop = anchorTop
    } else {
      const anchorIdx = newKeys.indexOf(anchorKey)
      const insertedBefore = newKeys.slice(0, Math.max(0, anchorIdx)).filter((key) => !lastSectionKeys.includes(key))
      if (insertedBefore.length) {
        // 回翻：视口顶对齐锚点章（上一章末尾从上方露出）
        const anchorTop = sectionStartTops.value[anchorKey] ?? 0
        element.scrollTop = Math.max(0, anchorTop - 12)
      }
      // 追加/裁剪在滚动模式下由文档流自然承接，无需补偿
    }
    setupObserver()
  }
  lastSectionKeys = newKeys
}

// ===== 生命周期 =====

function schedulePagedMeasure() {
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0
    void measurePagedPages().then(() => {
      if (isPaged.value) trackActiveSectionByPage()
    })
  })
}

function setupPagedObservers() {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!scrollRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    if (isPaged.value) schedulePagedMeasure()
    else collectSectionPositions(0)
  })
  resizeObserver.observe(scrollRef.value)
  if (paperRef.value) resizeObserver.observe(paperRef.value)
}

let pagedEntered = false

async function enterPagedMode() {
  pageIndex.value = 0
  pageCount.value = 0
  await nextTick()
  await measurePagedPages()
  // 定位到锚点章首页（整体换章场景）
  const anchorPage = sectionStartPages.value[props.anchorSectionKey] ?? 0
  goToPage(anchorPage, 'auto')
  setupPagedObservers()
}

watch(isPaged, (enabled) => {
  if (enabled) {
    pagedEntered = true
    void enterPagedMode()
  } else {
    pagedEntered = false
    setupObserver()
  }
}, { immediate: true })

// 章节内容变化（含多章拼接）：重置新章 chunk 计数 + 重排定位
watch(
  () => normalizedSections.value.map((item) => `${item.key}:${item.html.length}`).join('|'),
  () => {
    // 新增章节给默认计数；已有章节保留（避免已加载内容塌缩）
    const known = new Set(Object.keys(visibleChunkCounts.value))
    for (const section of normalizedSections.value) {
      if (!known.has(section.key)) {
        visibleChunkCounts.value = {
          ...visibleChunkCounts.value,
          [section.key]: sectionInitialCount()
        }
      }
    }
    // 移除已不存在的章节计数
    const validKeys = new Set(normalizedSections.value.map((item) => item.key))
    for (const key of Object.keys(visibleChunkCounts.value)) {
      if (!validKeys.has(key)) delete visibleChunkCounts.value[key]
    }
    void handleSectionsChange()
  },
  { immediate: true }
)

// 排版参数变化（字号/行高/页宽引起的 paper 重排走 ResizeObserver）
watch(
  () => [props.blocksPerChunk, props.initialChunkCount],
  () => {
    visibleChunkCounts.value = {}
    void nextTick(() => {
      if (scrollRef.value && !isPaged.value) scrollRef.value.scrollTop = 0
      setupObserver()
    })
  }
)

onMounted(() => {
  setupObserver()
  setupPagedObservers()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
})

defineExpose({
  scrollPage,
  loadMore,
  turnPage,
  /** 供测试/外层读取翻页状态 */
  getPagedState: () => ({
    pageIndex: pageIndex.value,
    pageCount: pageCount.value,
    pageWidth: pagedViewportWidth()
  }),
  getState: () => ({
    totalBlocks: totalBlockCount.value,
    loadedBlocks: loadedBlockCount.value,
    sectionCount: normalizedSections.value.length,
    activeSectionKey: activeSectionKey.value,
    pageMode: props.pageMode,
    pageIndex: pageIndex.value,
    pageCount: pageCount.value,
    scrollTop: scrollRef.value?.scrollTop || 0,
    hasMore: sectionChunks.value.some((section) => sectionHasMore(section))
  })
})
</script>

<style scoped>
.reading-flow {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  padding: 28px clamp(12px, 3vw, 40px);
  box-sizing: border-box;
  background: var(--bg-primary);
  user-select: text;
  position: relative;
}

/* ===== 左右翻页模式 ===== */
.reading-flow.is-paged {
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  /* 翻页时横向滚动，平滑插值由 JS 控制 */
  scroll-behavior: auto;
  overscroll-behavior-x: contain;
  /* 横向手势交给 JS 跟手翻页（touchmove 里 preventDefault），竖向放行系统行为 */
  touch-action: pan-y;
}

.reading-flow__paper--paged {
  column-width: var(--reading-column-width, 100vw);
  column-gap: var(--reading-column-gap, 40px);
  height: 100%;
  width: auto;
  max-width: none;
  min-height: 0;
  /* 页内留白：横向由 column gap 承担，上下保留呼吸感 */
  padding: 28px 24px;
  border: none;
  box-shadow: none;
  box-sizing: border-box;
}

.reading-flow__paged-content {
  max-width: 100%;
}

.reading-flow__paper--paged :deep(img) {
  break-inside: avoid;
  page-break-inside: avoid;
  max-height: 60vh;
  object-fit: contain;
}

.reading-flow__paper--paged :deep(h1),
.reading-flow__paper--paged :deep(h2),
.reading-flow__paper--paged :deep(h3),
.reading-flow__paper--paged :deep(h4) {
  break-after: avoid-column;
}

/* 外层 wrap：flex 容器，指示器以 sticky 悬浮在滚动区底部（不随横向滚动移动） */
.reading-flow-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reading-flow__page-indicator {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  border: 1px solid var(--border-color);
  pointer-events: none;
  z-index: 5;
  white-space: nowrap;
  max-width: 86%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 章节分隔标题 ===== */
.reading-flow__section-title {
  margin: 0 0 1.2em;
  font-size: 1.15em;
  font-weight: 600;
  line-height: 1.4;
  text-indent: 0;
  color: var(--text-base);
  letter-spacing: 0.02em;
}

/* 翻页纸带中：每章从新列（新页）开始，保证 prepend 定位精确 */
.reading-flow__paper--paged .reading-flow__section-title {
  break-before: column;
  margin-top: 0;
}

.reading-flow__section-title--scroll {
  padding-top: 0.6em;
  border-top: 1px dashed var(--border-color);
}

.reading-flow__section:first-child .reading-flow__section-title--scroll {
  border-top: none;
  padding-top: 0;
}

.reading-flow__section {
  content-visibility: auto;
  contain-intrinsic-size: auto 720px;
}

/* ===== 纵向滚动模式（原样保留） ===== */
.reading-flow__paper {
  width: 100%;
  max-width: var(--editor-paper-width, 80%);
  min-height: 100%;
  margin: 0 auto;
  padding: var(--editor-paper-margin, 64px clamp(28px, 6vw, 72px));
  box-sizing: border-box;
  background: var(--bg-primary);
  color: var(--text-base);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 18px rgba(20, 18, 14, 0.08);
  font-size: var(--editor-reading-font-size, 16px);
  line-height: var(--editor-reading-line-height, 1.6);
  overflow-wrap: anywhere;
}

.reading-flow__chunk {
  content-visibility: auto;
  contain-intrinsic-size: auto 720px;
}

.reading-flow__paper :deep(p) {
  min-height: 1em;
  margin: 0 0 0.72em;
  text-indent: 2em;
}

.reading-flow__paper.is-note :deep(p) {
  text-indent: 0;
}

.reading-flow__paper :deep(h1),
.reading-flow__paper :deep(h2),
.reading-flow__paper :deep(h3) {
  margin: 1.6em 0 0.9em;
  line-height: 1.3;
  text-indent: 0;
}

.reading-flow__paper :deep(h4) {
  margin: 1.25em 0 0.7em;
  line-height: 1.35;
  text-indent: 0;
}

.reading-flow__paper :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1em auto;
}

.reading-flow__loader,
.reading-flow__end {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 12px;
  text-indent: 0;
}

@media (max-width: 767px) {
  .reading-flow {
    padding: 12px 8px calc(96px + env(safe-area-inset-bottom));
  }

  .reading-flow__paper {
    max-width: 100%;
    padding: 24px 16px calc(96px + env(safe-area-inset-bottom));
  }

  .reading-flow.is-paged {
    padding: 12px 4px calc(72px + env(safe-area-inset-bottom));
  }
}

/* 平板（iPad 等 768-1024 触摸宽屏）：正文更宽、边距加大，保留书页感 */
@media (hover: none) and (pointer: coarse) and (min-width: 768px) {
  .reading-flow {
    padding: 20px clamp(16px, 4vw, 48px) calc(88px + env(safe-area-inset-bottom));
  }

  .reading-flow__paper {
    max-width: min(100%, 880px);
    padding: 40px clamp(24px, 5vw, 64px) calc(88px + env(safe-area-inset-bottom));
  }
}

@media (prefers-reduced-motion: reduce) {
  .reading-flow {
    scroll-behavior: auto;
  }
}
</style>

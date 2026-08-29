<template>
  <div
    ref="scrollRef"
    class="reading-flow"
    data-testid="editor-reading-flow"
    :data-loaded-blocks="loadedBlockCount"
    :data-total-blocks="blocks.length"
    :data-loaded-chunks="visibleChunkCount"
    :data-total-chunks="chunks.length"
    tabindex="0"
    aria-label="纵向阅读区"
    @scroll.passive="handleScroll"
    @keydown="handleKeydown"
  >
    <article
      class="reading-flow__paper"
      :class="{ 'is-note': contentType === 'note' }"
    >
      <!-- 内容来自 TipTap schema，并在 extractSafeBlocks 中二次剥离可执行节点/属性。 -->
      <!-- eslint-disable vue/no-v-html -->
      <section
        v-for="chunk in visibleChunks"
        :key="chunk.id"
        class="reading-flow__chunk"
        :data-reading-chunk="chunk.index"
        v-html="chunk.html"
      />
      <!-- eslint-enable vue/no-v-html -->

      <div
        v-if="hasMore"
        ref="loadMoreRef"
        class="reading-flow__loader"
        role="status"
        aria-live="polite"
      >
        继续向下滑动，动态加载后续内容
      </div>
      <div
        v-else-if="chunks.length"
        class="reading-flow__end"
      >
        本章已加载完毕
      </div>
    </article>
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
  }
})

const scrollRef = ref(null)
const loadMoreRef = ref(null)
const visibleChunkCount = ref(0)
let observer = null
let scrollFrame = 0

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

const blocks = computed(() => extractSafeBlocks(props.html))
const chunks = computed(() => createChunks(blocks.value, props.blocksPerChunk))
const visibleChunks = computed(() => chunks.value.slice(0, visibleChunkCount.value))
const hasMore = computed(() => visibleChunkCount.value < chunks.value.length)
const loadedBlockCount = computed(() =>
  visibleChunks.value.reduce((total, chunk) => total + chunk.blockCount, 0)
)

function loadMore(chunkCount = 1) {
  if (!hasMore.value) return false
  visibleChunkCount.value = Math.min(
    chunks.value.length,
    visibleChunkCount.value + Math.max(1, Number(chunkCount) || 1)
  )
  void nextTick(setupObserver)
  return true
}

function setupObserver() {
  observer?.disconnect()
  observer = null
  if (!hasMore.value || !scrollRef.value || !loadMoreRef.value || typeof IntersectionObserver === 'undefined') {
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore(1)
    },
    {
      root: scrollRef.value,
      rootMargin: '80% 0px 80% 0px',
      threshold: 0.01
    }
  )
  observer.observe(loadMoreRef.value)
}

function handleScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const element = scrollRef.value
    if (!element || !hasMore.value) return
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remaining <= element.clientHeight * 1.25) loadMore(1)
  })
}

async function scrollPage(direction = 1) {
  const element = scrollRef.value
  if (!element) return false
  const normalizedDirection = Number(direction) < 0 ? -1 : 1
  if (normalizedDirection > 0) {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (hasMore.value && remaining <= element.clientHeight * 1.5) {
      loadMore(2)
      await nextTick()
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
  if (event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
    event.preventDefault()
    void scrollPage(1)
  } else if (event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
    event.preventDefault()
    void scrollPage(-1)
  }
}

function resetReadingFlow() {
  visibleChunkCount.value = Math.min(
    chunks.value.length,
    Math.max(1, Number(props.initialChunkCount) || 2)
  )
  void nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = 0
    setupObserver()
  })
}

watch(
  () => [props.html, props.blocksPerChunk, props.initialChunkCount],
  resetReadingFlow,
  { immediate: true }
)

onMounted(setupObserver)

onBeforeUnmount(() => {
  observer?.disconnect()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})

defineExpose({
  scrollPage,
  loadMore,
  getState: () => ({
    totalBlocks: blocks.value.length,
    loadedBlocks: loadedBlockCount.value,
    totalChunks: chunks.value.length,
    loadedChunks: visibleChunkCount.value,
    hasMore: hasMore.value,
    scrollTop: scrollRef.value?.scrollTop || 0
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
}

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
.reading-flow__paper :deep(h3),
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
}

@media (prefers-reduced-motion: reduce) {
  .reading-flow {
    scroll-behavior: auto;
  }
}
</style>

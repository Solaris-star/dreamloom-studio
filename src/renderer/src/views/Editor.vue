<template>
  <div
    class="editor-container"
    :class="{
      'is-focus-mode': focusMode,
      'is-reading-mode': readingMode,
      'are-side-panels-hidden': !panelVisibility.left,
      'is-pdf-book': isPdfBook
    }"
    :style="editorReadingStyle"
  >
    <el-splitter>
      <el-splitter-panel
        v-model:size="leftPanelSize"
        class="editor-left-panel"
        :min="leftPanelSize === 0 ? 0 : 180"
        :max="450"
        collapsible
      >
        <!-- 左侧面板：笔记章节 -->
        <NoteChapter
          ref="noteChapterRef"
          :book-name="bookName"
        />
      </el-splitter-panel>
      <el-splitter-panel class="editor-main-panel">
        <!-- 中间编辑区：PDF 书籍替换为只读逐页阅读器 -->
        <PdfReader
          v-if="isPdfBook"
          ref="pdfReaderRef"
          :book-name="bookName"
          :outline="pdfOutline.length ? pdfOutline : null"
          @progress="handlePdfProgress"
        />
        <EditorPanel
          v-else
          ref="editorPanelRef"
          :book-name="bookName"
          :left-collapsed="leftPanelSize === 0"
          :right-collapsed="rightPanelSize === 0"
          :reading-mode="readingMode"
          :page-mode="readingMode ? readingSettings.pageMode : 'scroll'"
          @toggle-left="toggleLeftPanel"
          @toggle-right="toggleRightPanel"
          @refresh-notes="refreshNotes"
          @refresh-chapters="refreshChapters"
          @cleanup-task-state="handleCleanupTaskState"
          @reading-style-changed="handleReadingStyleChanged"
          @reading-reach-end="handleReadingReachEnd"
          @reading-active-chapter="handleReadingActiveChapter"
          @editing-chapter-change="handleEditingPathChange"
        />
      </el-splitter-panel>
      <el-splitter-panel
        v-model:size="rightPanelSize"
        class="editor-right-panel"
        :min="60"
        :max="320"
      >
        <!-- 右侧工具栏 -->
        <EditorToolbar
          :cleanup-task-state="cleanupTaskState"
          @trigger-ai="handleAiTrigger"
          @banned-words-changed="handleBannedWordsChanged"
        />
      </el-splitter-panel>
    </el-splitter>

    <!-- 正文内随手可点的上/下章 + 阅读模式切换；窄屏底栏已提供同款功能，阅读模式下隐藏避免遮挡正文 -->
    <div
      v-if="!isTouchLayout && !isPdfBook"
      class="editor-inline-nav"
      role="toolbar"
      aria-label="章节导航与阅读模式"
    >
      <button
        type="button"
        class="inline-nav-btn"
        title="上一章 (Alt+←)"
        aria-label="上一章"
        @click="handlePrevChapter"
      >
        <ChevronLeft :size="16" />
      </button>
      <button
        type="button"
        class="inline-nav-btn mode-btn"
        :class="{ active: readingMode }"
        :title="readingMode ? '切换到编辑模式' : '切换到阅读模式'"
        :aria-label="readingMode ? '切换到编辑模式' : '切换到阅读模式'"
        :aria-pressed="readingMode"
        data-testid="editor-reading-mode-toggle"
        @click="toggleReadingMode"
      >
        <BookOpen
          v-if="!readingMode"
          :size="16"
        />
        <PenLine
          v-else
          :size="16"
        />
        <span class="inline-nav-label">{{ readingMode ? '阅读中' : '编辑中' }}</span>
      </button>
      <button
        type="button"
        class="inline-nav-btn"
        title="下一章 (Alt+→)"
        aria-label="下一章"
        @click="handleNextChapter"
      >
        <ChevronRight :size="16" />
      </button>
    </div>

    <!-- 划词批注：气泡 / 汇总坞 / 统一发送审阅（PDF 只读书籍不启用） -->
    <EditorAnnotations
      v-if="!isPdfBook"
      :reading-mode="readingMode"
      :book-name="bookName"
    />

    <FloatingQuickActions
      v-if="!isPdfBook"
      class="editor-quick-actions"
      :focus-mode="focusMode"
      :right-panel-size="rightPanelSize"
      :reading-mode="readingMode"
      @catalog="openCatalog"
      @toggle-reading="toggleReadingMode"
      @reading-settings="openReadingSettings"
      @tools="mobileToolsVisible = true"
      @toggle-focus="toggleFocusMode"
      @page-up="scrollPage(-1)"
      @page-down="scrollPage(1)"
      @prev-chapter="handlePrevChapter"
      @next-chapter="handleNextChapter"
    />

    <el-drawer
      v-model="catalogVisible"
      class="catalog-drawer"
      :title="isPdfBook ? '目录' : '章节目录'"
      direction="rtl"
      :size="catalogDrawerSize"
    >
      <!-- PDF 书籍：扁平书签目录，点击跳页 -->
      <div
        v-if="isPdfBook"
        class="catalog-list pdf-catalog-list"
        data-testid="pdf-catalog-list"
      >
        <template v-if="pdfOutline.length">
          <button
            v-for="(item, index) in pdfOutline"
            :key="item.id || `pdf-catalog-${index}`"
            class="catalog-chapter pdf-catalog-item"
            :class="{ current: currentPdfOutlineIndex === index }"
            :style="{ paddingLeft: `${10 + Math.min(item.level || 0, 4) * 16}px` }"
            type="button"
            :title="item.title"
            @click="selectPdfOutlineItem(item)"
          >
            <span class="pdf-catalog-title">{{ item.title }}</span>
            <small>第 {{ (item.pageIndex ?? 0) + 1 }} 页</small>
          </button>
        </template>
        <el-empty
          v-else
          description="暂无目录"
        />
      </div>
      <div
        v-else-if="chapterOutline.length"
        class="catalog-list"
      >
        <section
          v-for="volume in chapterOutline"
          :key="volume.id"
          class="catalog-volume"
        >
          <h3>{{ volume.name }}</h3>
          <button
            v-for="chapter in volume.chapters"
            :key="chapter.path"
            class="catalog-chapter"
            :class="{ current: chapter.current }"
            type="button"
            @click="selectCatalogChapter(chapter.path)"
          >
            <span>{{ chapter.name }}</span>
            <small v-if="chapter.wordCount">{{ chapter.wordCount }} 字</small>
          </button>
        </section>
      </div>
      <el-empty
        v-else
        description="暂无章节"
      />
    </el-drawer>

    <!-- PDF 书籍：底部轻量导航（目录 + 翻页），替代编辑模式的悬浮助手 -->
    <div
      v-if="isPdfBook && pdfNavVisible"
      class="pdf-bottom-nav"
      role="toolbar"
      aria-label="PDF 阅读导航"
    >
      <button
        type="button"
        class="pdf-nav-btn"
        title="上一页"
        aria-label="上一页"
        data-testid="pdf-prev-page"
        @click="pdfReaderRef?.goPrevPage?.()"
      >
        <ChevronLeft :size="18" />
      </button>
      <button
        type="button"
        class="pdf-nav-btn pdf-nav-catalog"
        title="目录"
        aria-label="打开目录"
        data-testid="pdf-open-catalog"
        @click="openCatalog"
      >
        <ListTree :size="18" />
        <span class="pdf-nav-label">目录</span>
      </button>
      <span
        class="pdf-nav-page"
        data-testid="pdf-nav-page"
      >{{ pdfCurrentPage }} / {{ pdfPageCount }}</span>
      <button
        type="button"
        class="pdf-nav-btn"
        title="下一页"
        aria-label="下一页"
        data-testid="pdf-next-page"
        @click="pdfReaderRef?.goNextPage?.()"
      >
        <ChevronRight :size="18" />
      </button>
    </div>

    <el-drawer
      v-model="mobileToolsVisible"
      class="mobile-tools-drawer"
      title="创作工具"
      direction="btt"
      size="100%"
    >
      <EditorToolbar
        :cleanup-task-state="cleanupTaskState"
        @trigger-ai="handleMobileAiTrigger"
        @banned-words-changed="handleBannedWordsChanged"
      />
    </el-drawer>

    <el-dialog
      v-model="readingSettingsVisible"
      title="阅读设置"
      width="min(420px, 92vw)"
      class="reading-settings-dialog"
      :append-to-body="true"
    >
      <div class="reading-setting theme-setting">
        <span>阅读主题</span>
        <div
          class="theme-chip-row"
          role="listbox"
          aria-label="阅读主题"
        >
          <button
            v-for="theme in availableThemes"
            :key="theme.key"
            type="button"
            class="theme-chip"
            :class="{ active: themeStore.currentTheme === theme.key }"
            role="option"
            :aria-selected="themeStore.currentTheme === theme.key"
            :data-theme-option="theme.key"
            :aria-label="`切换到${theme.name}`"
            @click="handleReadingThemeChange(theme.key)"
          >
            <span
              class="theme-swatch"
              :style="{
                background: theme.preview,
                '--theme-swatch-accent': theme.previewPrimary || theme.previewAccent
              }"
              aria-hidden="true"
            />
            <span>{{ theme.name }}</span>
          </button>
        </div>
      </div>
      <div class="reading-setting">
        <span>字号</span>
        <el-slider
          v-model="readingSettings.fontSize"
          :min="12"
          :max="48"
          :step="1"
          show-input
        />
      </div>
      <div class="reading-setting">
        <span>行高</span>
        <el-slider
          v-model="readingSettings.lineHeight"
          :min="1.4"
          :max="2.2"
          :step="0.1"
          show-input
        />
      </div>
      <div class="reading-setting">
        <span>页宽</span>
        <el-select
          v-model="readingSettings.pageWidth"
          class="reading-page-width"
          aria-label="页宽"
          data-testid="reading-page-width"
        >
          <el-option
            v-for="option in pageWidthOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
      <div class="reading-setting">
        <span>翻页方式</span>
        <div
          class="margin-chip-row"
          role="listbox"
          aria-label="翻页方式"
        >
          <button
            v-for="option in pageModeOptions"
            :key="option.value"
            type="button"
            class="margin-chip"
            :class="{ active: readingSettings.pageMode === option.value }"
            role="option"
            :aria-selected="readingSettings.pageMode === option.value"
            :data-page-mode-option="option.value"
            :data-testid="`reading-page-mode-${option.value}`"
            @click="readingSettings.pageMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="reading-setting margin-setting">
        <span>页边距</span>
        <div
          class="margin-chip-row"
          role="listbox"
          aria-label="页边距"
        >
          <button
            v-for="option in pageMarginOptions"
            :key="option.value"
            type="button"
            class="margin-chip"
            :class="{ active: readingSettings.pageMargin === option.value }"
            role="option"
            :aria-selected="readingSettings.pageMargin === option.value"
            :data-margin-option="option.value"
            @click="readingSettings.pageMargin = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <template #footer>
        <el-button @click="resetReadingSettings">
          恢复默认
        </el-button>
        <el-button
          type="primary"
          @click="finishReadingSettings"
        >
          完成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {
  computed,
  ref,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onBeforeUnmount,
  watch,
  provide,
  shallowRef
} from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { BookOpen, PenLine, ChevronLeft, ChevronRight, ListTree } from 'lucide-vue-next'

defineOptions({ name: 'Editor' })
import NoteChapter from '@renderer/components/Editor/NoteChapter.vue'
import EditorPanel from '@renderer/components/Editor/EditorPanel.vue'
import EditorToolbar from '@renderer/components/Editor/EditorToolbar.vue'
import FloatingQuickActions from '@renderer/components/Editor/FloatingQuickActions.vue'
import EditorAnnotations from '@renderer/components/Editor/EditorAnnotations.vue'
import PdfReader from '@renderer/components/Editor/PdfReader.vue'
import {
  createEditorLayoutKey,
  getEditorDevice,
  getEditorPanelVisibility,
  normalizeEditorLayout,
  normalizeEditorPageWidth,
  readEditorLayout,
  shouldExitEditorFocusMode
} from '@renderer/service/editorLayout'
import { useThemeStore } from '@renderer/stores/theme'
import { readBooksDir } from '@renderer/service/books'
import { getPdfOutline } from '@renderer/service/importExport'
import { listChapterTree, readChapterContent } from '@renderer/service/editor'

const route = useRoute()
const themeStore = useThemeStore()
const availableThemes = computed(() => themeStore.getAvailableThemes())

async function handleReadingThemeChange(themeKey) {
  if (!themeKey || themeKey === themeStore.currentTheme) return
  await themeStore.setTheme(themeKey)
}

const bookName = computed(() => String(route.query.name || route.params.bookId || '').trim())
const cleanupTaskState = ref({ selection: 'idle', chapter: 'idle' })

function handleCleanupTaskState(state) {
  cleanupTaskState.value = {
    selection: state?.selection || 'idle',
    chapter: state?.chapter || 'idle'
  }
}

function handleBannedWordsChanged(words) {
  editorPanelRef.value?.refreshBannedWordHints?.(words)
}

// keep-alive 下用 activated/deactivated 绑定窗口事件，避免停用页仍监听刷新
function handleAiTrigger(command, arg) {
  if (editorPanelRef.value) {
    if (command === 'polish') {
      editorPanelRef.value.handlePolishCommand(arg)
    } else if (command === 'continue') {
      editorPanelRef.value.handleContinueClick()
    } else if (command === 'scene') {
      editorPanelRef.value.handleAISceneImageClick()
    }
  }
}

function handleMobileAiTrigger(command, arg) {
  mobileToolsVisible.value = false
  nextTick(() => handleAiTrigger(command, arg))
}

onMounted(() => {
  // document.title 统一由路由 meta.title / afterEach 管理，避免覆盖 keep-alive 往返后的标题
  void nextTick(() => {
    refreshNotes()
  })
})

const editorPanelRef = ref(null)
const viewportWidth = ref(window.innerWidth)
// 触摸设备（手机/iPad）：底栏 FloatingQuickActions 已提供上/下章 + 阅读模式，隐藏 inline-nav 胶囊避免遮挡正文
const coarsePointerMedia = window.matchMedia('(hover: none) and (pointer: coarse)')
const isTouchLayout = ref(coarsePointerMedia.matches)
coarsePointerMedia.addEventListener('change', (event) => {
  isTouchLayout.value = event.matches
})
const editorDevice = computed(() => getEditorDevice(viewportWidth.value))
const storageKey = computed(() => createEditorLayoutKey(bookName.value, editorDevice.value))
const legacyStorageKey = computed(
  () => `dreamloom:editor-layout:${encodeURIComponent(bookName.value || 'default')}`
)
const legacyWideStorageKey = computed(
  () =>
    `dreamloom:editor-layout:v2:${encodeURIComponent(bookName.value || 'default')}:desktop`
)
const leftPanelSize = ref(240)
const rightPanelSize = ref(180)
const lastLeftPanelSize = ref(240)
const lastRightPanelSize = ref(180)
const focusMode = ref(false)
const readingMode = ref(false)
const panelVisibility = computed(() =>
  getEditorPanelVisibility(editorDevice.value, focusMode.value, readingMode.value)
)
const catalogVisible = ref(false)
const readingSettingsVisible = ref(false)
const mobileToolsVisible = ref(false)
const chapterOutline = ref([])
const readingSettings = ref({
  fontSize: 16,
  lineHeight: 1.6,
  pageWidth: '80%',
  pageMargin: 'normal',
  pageMode: 'scroll'
})

const pageWidthOptions = [
  { label: '自适应 (极宽)', value: '100%' },
  { label: '自适应 (宽)', value: '90%' },
  { label: '自适应 (中)', value: '80%' },
  { label: '自适应 (窄)', value: '70%' }
]

// 翻页方式：scroll = 纵向滚动（默认，保持老习惯）；paged = 左右翻页（左右键/点击/滚轮/tap）
const PAGE_MODES = ['scroll', 'paged']
const pageModeOptions = [
  { label: '上下滚动', value: 'scroll' },
  { label: '左右翻页', value: 'paged' }
]

function normalizePageMode(value) {
  return PAGE_MODES.includes(value) ? value : 'scroll'
}

// 书页页边距：映射到稿纸内边距（上下 / 左右）
const pageMarginOptions = [
  { label: '紧凑', value: 'compact', padding: '40px clamp(20px, 4vw, 40px)' },
  { label: '标准', value: 'normal', padding: '64px clamp(28px, 6vw, 72px)' },
  { label: '宽松', value: 'loose', padding: '88px clamp(40px, 8vw, 104px)' }
]

const DEFAULT_PAGE_MARGIN = 'normal'

function normalizePageMargin(value) {
  return pageMarginOptions.some((option) => option.value === value) ? value : DEFAULT_PAGE_MARGIN
}

// ===== 跨章无缝阅读引擎（Editor 层负责预取与章节顺序） =====
// readingSections: [{ key, label, html }]，ReadingFlow 只管渲染；
// 当前章内容由 EditorPanel 实时替换（key === editorStore.file.path）。

const MAX_PREFETCH_SECTIONS = 6 // 纸带上限：当前章前后各若干章，防止超长书 DOM 爆炸
const PREFETCH_AHEAD = 1 // 向前/向后各多保留 1 章缓冲

const readingSectionsRef = shallowRef([])
provide('readingPrefetchedSections', readingSectionsRef)
const readingBookEndRef = ref(false)
provide('readingBookEnd', readingBookEndRef)

/** 扁平章节列表缓存：[{ volumeName, name, path }]，从 NoteChapter 大纲同步 */
const flatChapters = shallowRef([])
const flatChaptersDirty = ref(true)

function syncFlatChaptersFromOutline() {
  const outline = noteChapterRef.value?.getChapterOutline?.()
  if (!Array.isArray(outline)) return false
  const list = []
  for (const volume of outline) {
    for (const chapter of volume.chapters || []) {
      if (chapter.path) list.push({ volumeName: volume.name, name: chapter.name, path: chapter.path })
    }
  }
  if (!list.length) return false
  flatChapters.value = list
  flatChaptersDirty.value = false
  return true
}

function flatIndexByPath(path) {
  return flatChapters.value.findIndex((item) => item.path === path)
}

const readingPrefetchInflight = new Set()

async function fetchSectionChapter(chapter) {
  const res = await readChapterContent(bookName.value, chapter.volumeName, chapter.name)
  return { key: chapter.path, label: chapter.name, html: res.content || '' }
}

/** 以当前章为中心重建纸带（进入阅读模式/切章时调用） */
async function rebuildReadingSections(centerPath) {
  if (!centerPath) return
  if (flatChaptersDirty.value && !syncFlatChaptersFromOutline()) return
  const centerIndex = flatIndexByPath(centerPath)
  if (centerIndex < 0) return
  const from = Math.max(0, centerIndex - PREFETCH_AHEAD)
  const to = Math.min(flatChapters.value.length, centerIndex + PREFETCH_AHEAD + 1)
  const targets = flatChapters.value.slice(from, to)
  const entries = await Promise.all(
    targets
      .filter((chapter) => !readingPrefetchInflight.has(chapter.path))
      .map(async (chapter) => {
        readingPrefetchInflight.add(chapter.path)
        try {
          return await fetchSectionChapter(chapter)
        } catch {
          return null
        } finally {
          readingPrefetchInflight.delete(chapter.path)
        }
      })
  )
  readingSectionsRef.value = entries.filter(Boolean)
}

/** reach-end：向后追加下一章 / 向前插入上一章（带窗口滑动与去重） */
async function extendReadingSections(direction) {
  const current = readingSectionsRef.value
  if (!current.length) return
  if (flatChaptersDirty.value && !syncFlatChaptersFromOutline()) return
  const firstIndex = flatIndexByPath(current[0]?.key)
  const lastIndex = flatIndexByPath(current[current.length - 1]?.key)
  if (firstIndex < 0 && lastIndex < 0) return

  if (direction === 'next') {
    const nextChapter = flatChapters.value[lastIndex + 1]
    if (!nextChapter) {
      readingBookEndRef.value = true
      return
    }
    if (current.some((section) => section.key === nextChapter.path)) return
    if (readingPrefetchInflight.has(nextChapter.path)) return
    readingPrefetchInflight.add(nextChapter.path)
    try {
      const section = await fetchSectionChapter(nextChapter)
      const next = [...current, section].slice(-MAX_PREFETCH_SECTIONS)
      readingSectionsRef.value = next
    } catch {
      // 单章预取失败静默：ReadingFlow 会再次触发 reach-end 重试
    } finally {
      readingPrefetchInflight.delete(nextChapter.path)
    }
  } else if (direction === 'prev') {
    const prevChapter = flatChapters.value[firstIndex - 1]
    if (!prevChapter) {
      ElMessage.info('已经是第一章了')
      return
    }
    if (current.some((section) => section.key === prevChapter.path)) return
    if (readingPrefetchInflight.has(prevChapter.path)) return
    readingPrefetchInflight.add(prevChapter.path)
    try {
      const section = await fetchSectionChapter(prevChapter)
      const next = [section, ...current].slice(0, MAX_PREFETCH_SECTIONS)
      readingSectionsRef.value = next
    } catch {
      // 静默重试
    } finally {
      readingPrefetchInflight.delete(prevChapter.path)
    }
  }
}

let reachEndHandlerBusy = false
async function handleReadingReachEnd(direction) {
  if (reachEndHandlerBusy) return
  reachEndHandlerBusy = true
  try {
    await extendReadingSections(direction)
  } finally {
    reachEndHandlerBusy = false
  }
}

// 阅读模式下当前编辑章变化 → 以新章为中心重建纸带（目录跳转/切换章节）
// 当前编辑章路径由 EditorPanel 通过 reading-active-chapter 上报（editorStore 只在 Panel 层使用）
const currentEditingPath = ref('')
function handleEditingPathChange(path) {
  currentEditingPath.value = String(path || '')
}
watch(
  [readingMode, currentEditingPath],
  async ([enabled, path]) => {
    if (!enabled) {
      readingSectionsRef.value = []
      readingBookEndRef.value = false
      return
    }
    if (path) await rebuildReadingSections(path)
  }
)

// 视野章变化（用户翻页跨章）：只记录，退出阅读模式时据此切回视野章
const readingActiveChapter = ref('')
function handleReadingActiveChapter(path) {
  readingActiveChapter.value = String(path || '')
}


function pageMarginPadding(value) {
  const matched = pageMarginOptions.find((option) => option.value === normalizePageMargin(value))
  return matched ? matched.padding : pageMarginOptions[1].padding
}

const marginStorageKey = computed(() => `${storageKey.value}:page-margin`)

const editorReadingStyle = computed(() => ({
  '--editor-reading-font-size': `${readingSettings.value.fontSize}px`,
  '--editor-reading-line-height': String(readingSettings.value.lineHeight),
  // 百分比页宽，移动端也能真正变窄/变宽
  '--editor-paper-width': readingSettings.value.pageWidth || '80%',
  // 书页页边距
  '--editor-paper-margin': pageMarginPadding(readingSettings.value.pageMargin)
}))
const catalogDrawerSize = computed(() => (viewportWidth.value < 768 ? '100%' : '380px'))

let isLoadingLayout = false

function parseFontSizePx(value, fallback = 16) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const matched = String(value ?? '').match(/(\d+(?:\.\d+)?)/)
  const n = matched ? Number(matched[1]) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

function parseLineHeight(value, fallback = 1.6) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toReadingSettings(source = {}) {
  return {
    fontSize: parseFontSizePx(source.fontSize, 16),
    lineHeight: parseLineHeight(source.lineHeight, 1.6),
    pageWidth: normalizeEditorPageWidth(source.pageWidth ?? source.contentWidth, source.contentWidth),
    pageMargin: normalizePageMargin(source.pageMargin ?? readingSettings.value.pageMargin),
    pageMode: normalizePageMode(source.pageMode ?? readingSettings.value.pageMode)
  }
}

function applyReadingSettingsToEditor(settings = readingSettings.value, { syncState = true } = {}) {
  const next = toReadingSettings(settings)
  if (syncState) {
    const current = readingSettings.value
    if (
      current.fontSize !== next.fontSize ||
      current.lineHeight !== next.lineHeight ||
      current.pageWidth !== next.pageWidth ||
      current.pageMargin !== next.pageMargin ||
      current.pageMode !== next.pageMode
    ) {
      readingSettings.value = next
    }
  }
  editorPanelRef.value?.applyReadingStyleSettings?.({
    fontSize: `${next.fontSize}px`,
    lineHeight: String(next.lineHeight),
    pageWidth: next.pageWidth
  })
}

function openReadingSettings() {
  const fromPanel = editorPanelRef.value?.getReadingStyleSettings?.()
  if (fromPanel) {
    readingSettings.value = toReadingSettings(fromPanel)
  }
  readingSettingsVisible.value = true
}

function finishReadingSettings() {
  applyReadingSettingsToEditor(readingSettings.value)
  persistLayout()
  readingSettingsVisible.value = false
}

// 阅读模式：正文只读、隐光标/选区高亮，仅专心看排版（与专注模式正交，可叠加）
function toggleReadingMode() {
  const next = !readingMode.value
  // 退出阅读模式时：若视野已跨章（与编辑目标不同步），先切回视野所在章，
  // 左右翻页阅读模式下：退出时若视野章已跨章，自动切回视野章，
  // 保证回到编辑模式时看到的就是刚才读到的章节；纵向滚动模式保持当前编辑章不变以防误切。
  if (!next && readingMode.value && readingSettings.pageMode === 'paged') {
    const activePath = readingActiveChapter.value
    const editingPath = currentEditingPath.value
    if (activePath && editingPath && activePath !== editingPath) {
      noteChapterRef.value?.selectChapterByPath?.(activePath)
    }
    readingActiveChapter.value = ''
  }
  readingMode.value = next
  editorPanelRef.value?.setEditable?.(!next)
  ElMessage.info(next ? '已进入阅读模式' : '已回到编辑模式')
}

function loadPageMargin() {
  try {
    const saved = localStorage.getItem(marginStorageKey.value)
    if (saved) readingSettings.value.pageMargin = normalizePageMargin(saved)
  } catch {
    // ignore storage errors
  }
}

function persistPageMargin() {
  if (!bookName.value) return
  try {
    localStorage.setItem(marginStorageKey.value, normalizePageMargin(readingSettings.value.pageMargin))
  } catch {
    // ignore storage errors
  }
}

/**
 * 阅读排版偏好（字号/行高/页宽/页边距）是跨设备的全局口味，
 * 不随 wide/tablet/mobile 布局分键存储，避免浏览器缩放切换设备档时字号跳变。
 */
const GLOBAL_READING_PREFS_KEY = 'dreamloom:editor-reading-prefs:v1'

function readGlobalReadingPrefs() {
  try {
    const raw = localStorage.getItem(GLOBAL_READING_PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeGlobalReadingPrefs(prefs) {
  try {
    localStorage.setItem(GLOBAL_READING_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore storage errors
  }
}

function mergeGlobalReadingPrefs(base = {}) {
  const saved = readGlobalReadingPrefs()
  return {
    fontSize: saved.fontSize ?? base.fontSize ?? 16,
    lineHeight: saved.lineHeight ?? base.lineHeight ?? 1.6,
    pageWidth: saved.pageWidth ?? base.pageWidth ?? '80%',
    pageMargin: saved.pageMargin ?? base.pageMargin ?? 'normal',
    pageMode: normalizePageMode(saved.pageMode ?? base.pageMode)
  }
}

function loadLayout() {
  isLoadingLayout = true
  const data = readEditorLayout(
    localStorage,
    storageKey.value,
    editorDevice.value,
    editorDevice.value === 'wide'
      ? [legacyWideStorageKey.value, legacyStorageKey.value]
      : []
  )
  leftPanelSize.value = data.left
  rightPanelSize.value = data.right
  lastLeftPanelSize.value = data.lastLeft
  lastRightPanelSize.value = data.lastRight
  focusMode.value = data.focus
  // 字号等排版偏好优先用全局 prefs；首次无 prefs 时把当前设备档的值迁移过去
  const merged = mergeGlobalReadingPrefs(toReadingSettings(data))
  if (!readGlobalReadingPrefs().fontSize) {
    writeGlobalReadingPrefs(merged)
  }
  readingSettings.value = merged
  loadPageMargin()
  nextTick(() => {
    // 与顶栏 menubar 同步，避免 CSS 变量被内联 !important 盖掉
    applyReadingSettingsToEditor(readingSettings.value)
    isLoadingLayout = false
  })
}

// 监听 storageKey 变化重新加载
watch(storageKey, () => {
  loadLayout()
}, { immediate: true })

function persistLayout() {
  if (isLoadingLayout || !bookName.value) return
  // 排版偏好独立于设备布局保存，浏览器缩放切档时继续沿用同一字号/行高/页宽
  writeGlobalReadingPrefs(readingSettings.value)
  const layout = normalizeEditorLayout(
    {
      left: leftPanelSize.value,
      right: rightPanelSize.value,
      lastLeft: lastLeftPanelSize.value,
      lastRight: lastRightPanelSize.value,
      focus: focusMode.value,
      fontSize: readingSettings.value.fontSize,
      lineHeight: readingSettings.value.lineHeight,
      pageWidth: readingSettings.value.pageWidth
    },
    editorDevice.value
  )
  localStorage.setItem(storageKey.value, JSON.stringify(layout))
  persistPageMargin()
}

function toggleLeftPanel() {
  if (leftPanelSize.value > 0) {
    lastLeftPanelSize.value = leftPanelSize.value
    leftPanelSize.value = 0
  } else {
    leftPanelSize.value = lastLeftPanelSize.value || 240
  }
}

function toggleRightPanel() {
  if (rightPanelSize.value > 60) {
    lastRightPanelSize.value = rightPanelSize.value
    rightPanelSize.value = 60
  } else {
    rightPanelSize.value = lastRightPanelSize.value || 150
  }
}

function toggleFocusMode() {
  focusMode.value = !focusMode.value
  if (focusMode.value) {
    if (leftPanelSize.value > 0) lastLeftPanelSize.value = leftPanelSize.value
    if (rightPanelSize.value > 60) lastRightPanelSize.value = rightPanelSize.value
    leftPanelSize.value = 0
    rightPanelSize.value = 60
  } else {
    leftPanelSize.value = lastLeftPanelSize.value || 240
    rightPanelSize.value = lastRightPanelSize.value || 180
  }
}

const noteChapterRef = ref(null)

// ===== PDF 书籍（只读逐页阅读）=====
const pdfReaderRef = ref(null)
const isPdfBook = ref(false)
const pdfOutline = ref([])
const pdfPageCount = ref(0)
const pdfCurrentPage = ref(1)
const pdfNavVisible = ref(true)
const currentPdfOutlineIndex = computed(() => {
  if (!pdfOutline.value.length) return -1
  const current = pdfCurrentPage.value - 1
  let matched = -1
  for (let index = 0; index < pdfOutline.value.length; index += 1) {
    const pageIndex = Number(pdfOutline.value[index]?.pageIndex)
    if (Number.isInteger(pageIndex) && pageIndex <= current) matched = index
    else break
  }
  return matched
})

async function detectPdfBook() {
  const name = bookName.value
  isPdfBook.value = false
  pdfOutline.value = []
  pdfPageCount.value = 0
  pdfCurrentPage.value = 1
  if (!name) return
  try {
    const books = await readBooksDir()
    const meta = books.find((book) => book.name === name || book.folderName === name)
    // 书架 meta 标记 format:'pdf' 即走 PDF 阅读器
    if (meta && String(meta.format || '').toLowerCase() === 'pdf') {
      isPdfBook.value = true
      pdfPageCount.value = Number(meta.pdfPageCount) || 0
      if (Array.isArray(meta.pdfOutline) && meta.pdfOutline.length) {
        pdfOutline.value = meta.pdfOutline
      }
      return
    }
    if (meta) return // 列表里有这本书且不是 PDF → 普通模式
    // 书不在列表（书架缓存未过期/刚导入）：直接问 PDF API（读 mazi.json，无缓存）
    try {
      const result = await getPdfOutline(name)
      if (result?.success) {
        isPdfBook.value = true
        pdfPageCount.value = Number(result.pageCount) || 0
        pdfOutline.value = Array.isArray(result.outline) ? result.outline : []
      }
    } catch {
      // 非 PDF 书或接口失败 → 普通模式
    }
  } catch (error) {
    console.warn('[Editor] PDF 探测失败，按普通书籍处理:', error?.message)
  }
}

watch(
  () => bookName.value,
  () => {
    void detectPdfBook()
  },
  { immediate: true }
)

// PdfReader 每次翻页节流回报进度
function handlePdfProgress(payload = {}) {
  if (Number.isInteger(payload.pageIndex)) {
    pdfCurrentPage.value = payload.pageIndex + 1
  }
  if (Number.isInteger(payload.pageCount) && payload.pageCount) {
    pdfPageCount.value = payload.pageCount
  }
}

async function selectPdfOutlineItem(item) {
  const pageIndex = Number(item?.pageIndex)
  if (!Number.isInteger(pageIndex)) return
  await pdfReaderRef.value?.scrollToPage?.(pageIndex + 1)
  catalogVisible.value = false
}

function refreshNotes() {
  noteChapterRef.value && noteChapterRef.value.reloadNotes && noteChapterRef.value.reloadNotes()
}

function refreshChapters() {
  noteChapterRef.value &&
    noteChapterRef.value.reloadChapters &&
    noteChapterRef.value.reloadChapters()
}

function handlePrevChapter() {
  noteChapterRef.value?.prevChapter?.()
}

function handleNextChapter() {
  noteChapterRef.value?.nextChapter?.()
}

function scrollPage(direction) {
  void editorPanelRef.value?.scrollPage?.(direction)
}

onBeforeRouteLeave(async () => {
  if (isPdfBook.value) return true // PDF 只读，无需保存
  const saved = await editorPanelRef.value?.saveBeforeLeave?.()
  if (saved === false) {
    ElMessage.error('当前内容保存失败，已取消离开，请重试')
    return false
  }
  return true
})

function openCatalog() {
  catalogVisible.value = true
}

// 目录列表跟随章节树实时刷新：大书首载（数千章）尚未完成时点开目录，
// 旧实现点击瞬间抓死快照，抽屉会停留在「暂无章节」且不再更新。
// 现在抽屉打开期间持续同步，树加载完成后列表自动填充。
const outlineSource = () => noteChapterRef.value?.getChapterOutline?.() ?? []
watch(
  [catalogVisible, outlineSource],
  ([visible, outline]) => {
    if (visible) chapterOutline.value = outline
  },
  { immediate: true }
)
// 兜底：树在抽屉打开后才完成加载时，定时补拉；一旦拿到内容即停，
// 避免大书（2000+ 章）列表每 500ms 全量重渲染
let outlinePollTimer = null
function stopOutlinePoll() {
  if (outlinePollTimer) {
    clearInterval(outlinePollTimer)
    outlinePollTimer = null
  }
}
watch(catalogVisible, (visible) => {
  stopOutlinePoll()
  if (visible && !chapterOutline.value.length) {
    outlinePollTimer = setInterval(() => {
      const outline = outlineSource()
      if (outline.length) {
        chapterOutline.value = outline
        stopOutlinePoll()
      }
    }, 500)
  }
})
onBeforeUnmount(stopOutlinePoll)

async function selectCatalogChapter(path) {
  const selected = await noteChapterRef.value?.selectChapterByPath?.(path)
  if (selected) catalogVisible.value = false
}

function resetReadingSettings() {
  applyReadingSettingsToEditor({
    fontSize: 16,
    lineHeight: 1.6,
    pageWidth: '80%',
    pageMargin: 'normal',
    pageMode: 'scroll'
  })
  persistLayout()
}

/** 顶栏 menubar 改字号/行高/页宽时同步全局偏好 + 弹窗状态，修复两侧调节不同步 */
function handleReadingStyleChanged(payload = {}) {
  const next = toReadingSettings({
    fontSize: parseFontSizePx(payload.fontSize, readingSettings.value.fontSize),
    lineHeight: parseLineHeight(payload.lineHeight, readingSettings.value.lineHeight),
    pageWidth: payload.pageWidth ?? readingSettings.value.pageWidth,
    pageMargin: readingSettings.value.pageMargin,
    pageMode: readingSettings.value.pageMode
  })
  readingSettings.value = next
  writeGlobalReadingPrefs(next)
}

function handleViewportResize() {
  viewportWidth.value = window.innerWidth
}

function handleEditorKeydown(event) {
  // Alt + ←/→ 快速上/下章
  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    if (event.key === 'ArrowLeft') handlePrevChapter()
    else handleNextChapter()
    return
  }
  if (!shouldExitEditorFocusMode(event, focusMode.value)) return
  event.preventDefault()
  toggleFocusMode()
}

function attachWindowListeners() {
  window.addEventListener('refresh-chapters-requested', refreshChapters)
  window.addEventListener('resize', handleViewportResize)
  window.addEventListener('keydown', handleEditorKeydown)
}

function detachWindowListeners() {
  window.removeEventListener('refresh-chapters-requested', refreshChapters)
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('keydown', handleEditorKeydown)
}

watch(
  [leftPanelSize, rightPanelSize, lastLeftPanelSize, lastRightPanelSize, focusMode],
  () => {
    if (isLoadingLayout) return
    persistLayout()
  }
)

// 阅读设置：立刻同步到 EditorPanel 内联样式（覆盖 !important），并持久化
watch(
  readingSettings,
  () => {
    if (isLoadingLayout) return
    applyReadingSettingsToEditor(readingSettings.value, { syncState: false })
    persistLayout()
  },
  { deep: true }
)

onActivated(() => {
  detachWindowListeners()
  attachWindowListeners()
  handleViewportResize()
})

onDeactivated(detachWindowListeners)
onBeforeUnmount(detachWindowListeners)

// function handleSelectFile(file) {
//   // 预留：可做高亮、聚焦等
// }
</script>

<style lang="scss" scoped>
.editor-container {
  height: 100vh;
  background-color: var(--bg-primary);
  position: relative;
  overflow: hidden;
}

.editor-quick-actions {
/* 位置由 FloatingQuickActions 内部 fixed + 本地偏好控制 */
    z-index: 120;
}

@media (prefers-reduced-motion: reduce) {
  .editor-quick-actions {
    transition: none;
  }
}

.editor-container.are-side-panels-hidden {
  :deep(.editor-left-panel),
  :deep(.editor-right-panel),
  :deep(.el-splitter-bar) {
    display: none;
  }

  :deep(.editor-main-panel) {
    width: 100% !important;
    flex-basis: 100% !important;
  }
}

/* 正文内的上/下章 + 阅读模式切换：素墨扁平胶囊 */
.editor-inline-nav {
  position: absolute;
  top: 56px; /* 避开 toolbar 区域，防止遮挡点击 */
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 10px rgba(20, 18, 14, 0.08);
  z-index: 110;
}

.inline-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-base);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}

/* 防止 SVG 图标拦截点击事件 */
.inline-nav-btn svg {
  pointer-events: none;
}

.inline-nav-btn:hover,
.inline-nav-btn:focus-visible {
  color: var(--el-color-primary);
  background: var(--bg-mute);
  outline: none;
}

.inline-nav-btn.mode-btn.active {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.inline-nav-label {
  font-size: 12px;
}

@media (max-width: 900px) {
  .editor-inline-nav {
    top: auto;
    bottom: calc(52px + env(safe-area-inset-bottom));
  }
}

/* 阅读模式：只隐光标不改交互——文字仍可选中复制 */
.editor-container.is-reading-mode {
  :deep(.editor-content .tiptap) {
    caret-color: transparent;
    cursor: default;
  }
}

/* ===== PDF 只读阅读器 ===== */

/* PDF 模式下隐藏左右面板与划词层（只读体验） */
.editor-container.is-pdf-book {
  :deep(.editor-left-panel),
  :deep(.editor-right-panel),
  :deep(.el-splitter-bar) {
    display: none;
  }

  :deep(.editor-main-panel) {
    width: 100% !important;
    flex-basis: 100% !important;
  }
}

.pdf-catalog-item .pdf-catalog-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* PDF 底部导航条：桌面悬浮胶囊，移动端贴底 */
.pdf-bottom-nav {
  position: absolute;
  bottom: calc(18px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 16px rgba(20, 18, 14, 0.12);
  z-index: 110;
}

.pdf-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  min-width: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-base);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}

.pdf-nav-btn svg {
  pointer-events: none;
}

.pdf-nav-btn:hover,
.pdf-nav-btn:focus-visible {
  color: var(--el-color-primary);
  background: var(--bg-mute);
  outline: none;
}

.pdf-nav-page {
  padding: 0 10px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  min-width: 84px;
  text-align: center;
}

@media (max-width: 767px) {
  .pdf-bottom-nav {
    bottom: calc(12px + env(safe-area-inset-bottom));
    padding: 5px 8px;
  }

  .pdf-nav-page {
    min-width: 76px;
  }
}

.catalog-volume {
  margin-bottom: 20px;
}

.catalog-volume h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.catalog-chapter {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}

.catalog-chapter:hover,
.catalog-chapter:focus-visible,
.catalog-chapter.current {
  background: var(--bg-mute);
  color: var(--el-color-primary);
  outline: none;
}

.catalog-chapter small {
  flex: none;
  color: var(--text-secondary);
}

.reading-setting {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 54px;
}

.reading-setting.theme-setting {
  align-items: start;
  min-height: auto;
  margin-bottom: 8px;
}

.reading-setting.margin-setting {
  align-items: center;
  min-height: auto;
  margin-top: 8px;
}

.theme-chip-row,
.margin-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-base);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1;
}

.theme-chip .theme-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.theme-chip.active,
.theme-chip:hover,
.theme-chip:focus-visible {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--bg-mute);
  outline: none;
}

.margin-chip {
  min-height: 32px;
  padding: 4px 16px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-base);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1;
}

.margin-chip.active,
.margin-chip:hover,
.margin-chip:focus-visible {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--bg-mute);
  outline: none;
}

/* 触摸设备（手机/iPad）：设置弹窗加大点击目标 */
@media (hover: none) and (pointer: coarse) {
  .theme-chip,
  .margin-chip {
    min-height: 40px;
    padding: 6px 14px;
    font-size: 13px;
  }

  .theme-chip .theme-swatch {
    width: 16px;
    height: 16px;
  }
}

/* 书页化：稿纸变成一张有墨线边框与轻投影的书页，四周留白 */
:deep(.editor-content) {
  padding: 28px clamp(12px, 3vw, 40px);
  box-sizing: border-box;
}

:deep(.editor-content .tiptap) {
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
  font-size: var(--editor-reading-font-size) !important;
  line-height: var(--editor-reading-line-height) !important;
}

.reading-page-width {
  width: 100%;
}

:deep([class*="collapse"]) {
  display: none !important;
}

@media (min-width: 768px) {
  /* 宽屏位置由悬浮组件内部计算，避免与 AI 栏硬编码冲突 */
}

@media (max-width: 767px) {
  .editor-container {
    /* 更矮的底栏：按钮 40 + padding + safe-area */
    padding-bottom: calc(52px + env(safe-area-inset-bottom));
    overflow-x: hidden;
  }

  .editor-quick-actions {
    /* 窄屏底部导航条由组件内部 fixed 处理 */
  }

  :deep(.editor-left-panel),
  :deep(.editor-right-panel),
  :deep(.el-splitter-bar) {
    display: none;
  }

  :deep(.el-splitter) {
    display: block;
  }

  :deep(.editor-main-panel) {
    width: 100% !important;
    height: 100%;
    min-width: 0;
  }

  :deep(.editor-content) {
    padding: 12px 8px calc(96px + env(safe-area-inset-bottom));
  }

  :deep(.editor-content .tiptap) {
    /* 为底部快捷栏和软键盘留出滚动空间，避免输入遮挡正文 */
    padding: 24px 16px calc(96px + env(safe-area-inset-bottom));
  }

  .reading-setting {
    grid-template-columns: 1fr;
    gap: 4px;
    margin-bottom: 12px;
  }

  :global(.mobile-tools-drawer .el-drawer__body) {
    padding: 0;
  }
}
</style>

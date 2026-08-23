<template>
  <div
    class="editor-container"
    :class="{
      'is-focus-mode': focusMode,
      'is-reading-mode': readingMode,
      'are-side-panels-hidden': !panelVisibility.left
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
        <!-- 中间编辑区 -->
        <EditorPanel
          ref="editorPanelRef"
          :book-name="bookName"
          :left-collapsed="leftPanelSize === 0"
          :right-collapsed="rightPanelSize === 0"
          @toggle-left="toggleLeftPanel"
          @toggle-right="toggleRightPanel"
          @refresh-notes="refreshNotes"
          @refresh-chapters="refreshChapters"
          @cleanup-task-state="handleCleanupTaskState"
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

    <!-- 正文内随手可点的上/下章 + 阅读模式切换 -->
    <div
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

    <!-- 划词批注：气泡 / 汇总坞 / 统一发送审阅 -->
    <EditorAnnotations
      :reading-mode="readingMode"
      :book-name="bookName"
    />

    <FloatingQuickActions
      class="editor-quick-actions"
      :focus-mode="focusMode"
      :right-panel-size="rightPanelSize"
      @home="handleHome"
      @catalog="openCatalog"
      @reading-settings="openReadingSettings"
      @tools="mobileToolsVisible = true"
      @toggle-focus="toggleFocusMode"
    />

    <el-drawer
      v-model="catalogVisible"
      class="catalog-drawer"
      title="章节目录"
      direction="rtl"
      :size="catalogDrawerSize"
    >
      <div
        v-if="chapterOutline.length"
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
          :min="14"
          :max="24"
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
  watch
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { BookOpen, PenLine, ChevronLeft, ChevronRight } from 'lucide-vue-next'

defineOptions({ name: 'Editor' })
import NoteChapter from '@renderer/components/Editor/NoteChapter.vue'
import EditorPanel from '@renderer/components/Editor/EditorPanel.vue'
import EditorToolbar from '@renderer/components/Editor/EditorToolbar.vue'
import FloatingQuickActions from '@renderer/components/Editor/FloatingQuickActions.vue'
import EditorAnnotations from '@renderer/components/Editor/EditorAnnotations.vue'
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

const route = useRoute()
const router = useRouter()
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
  getEditorPanelVisibility(editorDevice.value, focusMode.value)
)
const catalogVisible = ref(false)
const readingSettingsVisible = ref(false)
const mobileToolsVisible = ref(false)
const chapterOutline = ref([])
const readingSettings = ref({
  fontSize: 16,
  lineHeight: 1.6,
  pageWidth: '80%',
  pageMargin: 'normal'
})

const pageWidthOptions = [
  { label: '自适应 (极宽)', value: '100%' },
  { label: '自适应 (宽)', value: '90%' },
  { label: '自适应 (中)', value: '80%' },
  { label: '自适应 (窄)', value: '70%' }
]

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
    pageMargin: normalizePageMargin(source.pageMargin ?? readingSettings.value.pageMargin)
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
      current.pageMargin !== next.pageMargin
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
  readingMode.value = !readingMode.value
  editorPanelRef.value?.setEditable?.(!readingMode.value)
  ElMessage.info(readingMode.value ? '已进入阅读模式' : '已回到编辑模式')
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
  readingSettings.value = toReadingSettings(data)
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

function handleHome() {
  router.push('/')
}

onBeforeRouteLeave(async () => {
  const saved = await editorPanelRef.value?.saveBeforeLeave?.()
  if (saved === false) {
    ElMessage.error('当前内容保存失败，已取消离开，请重试')
    return false
  }
  return true
})

function openCatalog() {
  chapterOutline.value = noteChapterRef.value?.getChapterOutline?.() || []
  catalogVisible.value = true
}

async function selectCatalogChapter(path) {
  const selected = await noteChapterRef.value?.selectChapterByPath?.(path)
  if (selected) catalogVisible.value = false
}

function resetReadingSettings() {
  applyReadingSettingsToEditor({ fontSize: 16, lineHeight: 1.6, pageWidth: '80%', pageMargin: 'normal' })
  persistLayout()
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

@media (max-width: 767px) {
  .editor-inline-nav {
    top: auto;
    bottom: calc(52px + env(safe-area-inset-bottom));
  }
}

/* 阅读模式：正文只读观感——隐光标、禁选区、去交互 */
.editor-container.is-reading-mode {
  :deep(.editor-content .tiptap) {
    caret-color: transparent;
    user-select: none;
    cursor: default;
  }

  :deep(.editor-content .tiptap ::selection) {
    background: transparent;
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
    /* 更矮的底栏：按钮 34 + padding + safe-area */
    padding-bottom: calc(44px + env(safe-area-inset-bottom));
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

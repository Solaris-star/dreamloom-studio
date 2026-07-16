<template>
  <div
    class="editor-container"
    :class="{
      'is-focus-mode': focusMode,
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

    <FloatingQuickActions
      class="editor-quick-actions"
      :focus-mode="focusMode"
      :right-panel-size="rightPanelSize"
      @home="handleHome"
      @catalog="openCatalog"
      @prev-chapter="handlePrevChapter"
      @next-chapter="handleNextChapter"
      @reading-settings="readingSettingsVisible = true"
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
        <span>正文字号</span>
        <el-slider
          v-model="readingSettings.fontSize"
          :min="14"
          :max="24"
          :step="1"
          show-input
        />
      </div>
      <div class="reading-setting">
        <span>正文行高</span>
        <el-slider
          v-model="readingSettings.lineHeight"
          :min="1.4"
          :max="2.2"
          :step="0.1"
          show-input
        />
      </div>
      <div class="reading-setting">
        <span>纸面宽度</span>
        <el-slider
          v-model="readingSettings.contentWidth"
          :min="640"
          :max="960"
          :step="20"
          show-input
        />
      </div>
      <template #footer>
        <el-button @click="resetReadingSettings">
          恢复默认
        </el-button>
        <el-button
          type="primary"
          @click="readingSettingsVisible = false"
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

defineOptions({ name: 'Editor' })
import NoteChapter from '@renderer/components/Editor/NoteChapter.vue'
import EditorPanel from '@renderer/components/Editor/EditorPanel.vue'
import EditorToolbar from '@renderer/components/Editor/EditorToolbar.vue'
import FloatingQuickActions from '@renderer/components/Editor/FloatingQuickActions.vue'
import {
  createEditorLayoutKey,
  getEditorDevice,
  getEditorPanelVisibility,
  normalizeEditorLayout,
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
const panelVisibility = computed(() =>
  getEditorPanelVisibility(editorDevice.value, focusMode.value)
)
const catalogVisible = ref(false)
const readingSettingsVisible = ref(false)
const mobileToolsVisible = ref(false)
const chapterOutline = ref([])
const readingSettings = ref({
  fontSize: 18,
  lineHeight: 1.8,
  contentWidth: 760
})

const editorReadingStyle = computed(() => ({
  '--editor-reading-font-size': `${readingSettings.value.fontSize}px`,
  '--editor-reading-line-height': String(readingSettings.value.lineHeight),
  '--editor-paper-width': `${readingSettings.value.contentWidth}px`
}))
const catalogDrawerSize = computed(() => (viewportWidth.value < 768 ? '100%' : '380px'))

let isLoadingLayout = false

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
  readingSettings.value = {
    fontSize: data.fontSize,
    lineHeight: data.lineHeight,
    contentWidth: data.contentWidth
  }
  nextTick(() => {
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
      ...readingSettings.value
    },
    editorDevice.value
  )
  localStorage.setItem(storageKey.value, JSON.stringify(layout))
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
  readingSettings.value = { fontSize: 18, lineHeight: 1.8, contentWidth: 760 }
}

function handleViewportResize() {
  viewportWidth.value = window.innerWidth
}

function handleEditorKeydown(event) {
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
  [leftPanelSize, rightPanelSize, lastLeftPanelSize, lastRightPanelSize, focusMode, readingSettings],
  persistLayout,
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

.theme-chip-row {
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

:deep(.editor-content .tiptap) {
  width: 100%;
  max-width: var(--editor-paper-width);
  min-height: 100%;
  margin: 0 auto;
  padding: 48px clamp(24px, 6vw, 72px);
  box-sizing: border-box;
  background: var(--bg-primary);
  color: var(--text-base);
  font-size: var(--editor-reading-font-size) !important;
  line-height: var(--editor-reading-line-height) !important;
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

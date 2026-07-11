<template>
  <div
    class="editor-container"
    :class="{ 'is-focus-mode': focusMode }"
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
        <NoteChapter ref="noteChapterRef" :book-name="bookName" />
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
        />
      </el-splitter-panel>
      <el-splitter-panel
        v-model:size="rightPanelSize"
        class="editor-right-panel"
        :min="60"
        :max="320"
      >
        <!-- 右侧工具栏 -->
        <EditorToolbar @trigger-ai="handleAiTrigger" />
      </el-splitter-panel>
    </el-splitter>

    <!-- 左侧面板折叠快捷按钮 -->
    <div 
      class="panel-edge-toggle left-toggle" 
      :style="{ left: leftPanelSize > 0 ? `calc(${leftPanelSize}px - 12px)` : '0' }"
      @click="toggleLeftPanel"
    >
      <el-icon><component :is="leftPanelSize > 0 ? ArrowLeft : ArrowRight" /></el-icon>
    </div>

    <!-- 右侧面板折叠快捷按钮 -->
    <div 
      class="panel-edge-toggle right-toggle" 
      :style="{ right: rightPanelSize > 0 ? `calc(${rightPanelSize}px - 12px)` : '0' }"
      @click="toggleRightPanel"
    >
      <el-icon><component :is="rightPanelSize > 0 ? ArrowRight : ArrowLeft" /></el-icon>
    </div>

    <FloatingQuickActions 
      class="editor-quick-actions"
      :focus-mode="focusMode"
      @home="handleHome"
      @catalog="openCatalog"
      @prev-chapter="handlePrevChapter" 
      @next-chapter="handleNextChapter"
      @reading-settings="readingSettingsVisible = true"
      @toggle-focus="toggleFocusMode"
    />

    <el-drawer
      v-model="catalogVisible"
      class="catalog-drawer"
      title="章节目录"
      direction="rtl"
      :size="catalogDrawerSize"
    >
      <div v-if="chapterOutline.length" class="catalog-list">
        <section v-for="volume in chapterOutline" :key="volume.id" class="catalog-volume">
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
      <el-empty v-else description="暂无章节" />
    </el-drawer>

    <el-dialog v-model="readingSettingsVisible" title="阅读设置" width="min(420px, 92vw)">
      <div class="reading-setting">
        <span>正文字号</span>
        <el-slider v-model="readingSettings.fontSize" :min="14" :max="24" :step="1" show-input />
      </div>
      <div class="reading-setting">
        <span>正文行高</span>
        <el-slider v-model="readingSettings.lineHeight" :min="1.4" :max="2.2" :step="0.1" show-input />
      </div>
      <div class="reading-setting">
        <span>纸面宽度</span>
        <el-slider v-model="readingSettings.contentWidth" :min="640" :max="960" :step="20" show-input />
      </div>
      <template #footer>
        <el-button @click="resetReadingSettings">恢复默认</el-button>
        <el-button type="primary" @click="readingSettingsVisible = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onDeactivated, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'Editor' })
import NoteChapter from '@renderer/components/Editor/NoteChapter.vue'
import EditorPanel from '@renderer/components/Editor/EditorPanel.vue'
import EditorToolbar from '@renderer/components/Editor/EditorToolbar.vue'
import FloatingQuickActions from '@renderer/components/Editor/FloatingQuickActions.vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

// 解析新窗口参数
let bookName = null
if (window.process && window.process.argv) {
  // Electron 传递的 additionalArguments
  for (const arg of window.process.argv) {
    if (arg.startsWith('bookName=')) bookName = decodeURIComponent(arg.replace('bookName=', ''))
  }
}
if (!bookName) {
  // 回退到 hash/query
  bookName = route.query.name
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

onMounted(() => {
  if (bookName) {
    document.title = `${bookName} - 织梦工坊`
  }
  window.addEventListener('refresh-chapters-requested', refreshChapters)
  void nextTick(() => {
    refreshNotes()
  })
})

onDeactivated(() => {
  window.removeEventListener('refresh-chapters-requested', refreshChapters)
})

const editorPanelRef = ref(null)
const storageKey = `dreamloom:editor-layout:${encodeURIComponent(bookName || 'default')}`
const defaultLayout = { left: 240, right: 180, lastLeft: 240, lastRight: 180, focus: false }
const storedLayout = readStoredLayout()
const leftPanelSize = ref(storedLayout.left)
const rightPanelSize = ref(storedLayout.right)
const lastLeftPanelSize = ref(240)
const lastRightPanelSize = ref(180)
const focusMode = ref(Boolean(storedLayout.focus))
const catalogVisible = ref(false)
const readingSettingsVisible = ref(false)
const chapterOutline = ref([])
const viewportWidth = ref(window.innerWidth)
const readingSettings = ref({
  fontSize: Number(storedLayout.fontSize) || 18,
  lineHeight: Number(storedLayout.lineHeight) || 1.8,
  contentWidth: Number(storedLayout.contentWidth) || 760
})

lastLeftPanelSize.value = storedLayout.lastLeft || 240
lastRightPanelSize.value = storedLayout.lastRight || 180

const editorReadingStyle = computed(() => ({
  '--editor-reading-font-size': `${readingSettings.value.fontSize}px`,
  '--editor-reading-line-height': String(readingSettings.value.lineHeight),
  '--editor-paper-width': `${readingSettings.value.contentWidth}px`
}))
const catalogDrawerSize = computed(() => (viewportWidth.value < 768 ? '100%' : '380px'))

function readStoredLayout() {
  try {
    return { ...defaultLayout, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }
  } catch {
    return { ...defaultLayout }
  }
}

function persistLayout() {
  localStorage.setItem(storageKey, JSON.stringify({
    left: leftPanelSize.value,
    right: rightPanelSize.value,
    lastLeft: lastLeftPanelSize.value,
    lastRight: lastRightPanelSize.value,
    focus: focusMode.value,
    ...readingSettings.value
  }))
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
  if (viewportWidth.value < 768) {
    leftPanelSize.value = 0
    rightPanelSize.value = 60
  }
}

watch(
  [leftPanelSize, rightPanelSize, lastLeftPanelSize, lastRightPanelSize, focusMode, readingSettings],
  persistLayout,
  { deep: true }
)

onMounted(() => {
  window.addEventListener('resize', handleViewportResize)
  handleViewportResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
})

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
  position: absolute;
  right: 20px;
  bottom: 24px;
  z-index: 120;
  transition: right 180ms ease;
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

:deep(.editor-content .tiptap) {
  width: min(100%, var(--editor-paper-width));
  min-height: 100%;
  margin: 0 auto;
  padding: 48px clamp(24px, 6vw, 72px);
  box-sizing: border-box;
  background: var(--bg-primary);
  font-size: var(--editor-reading-font-size) !important;
  line-height: var(--editor-reading-line-height) !important;
}

:deep([class*="collapse"]) {
  display: none !important;
}

.panel-edge-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--wabi-line, #e6e1da);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  z-index: 101;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  color: var(--text-gray, #666666);
  transition: background-color 0.2s, color 0.2s, border-color 0.2s, left 0.3s, right 0.3s;

  &:hover {
    color: var(--primary-color, #409eff);
    border-color: var(--primary-color, #409eff);
  }
}

@media (min-width: 768px) {
  .editor-container:not(.is-focus-mode) .editor-quick-actions {
    right: calc(v-bind(rightPanelSize) * 1px + 20px);
  }
}

@media (max-width: 767px) {
  .editor-container {
    padding-bottom: calc(53px + env(safe-area-inset-bottom));
  }

  .editor-quick-actions {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
  }

  .panel-edge-toggle {
    display: none;
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
  }

  :deep(.editor-content .tiptap) {
    padding: 32px 20px 80px;
  }

  .reading-setting {
    grid-template-columns: 1fr;
    gap: 4px;
    margin-bottom: 12px;
  }
}
</style>

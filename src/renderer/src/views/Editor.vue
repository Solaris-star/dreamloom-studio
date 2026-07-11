<template>
  <div class="editor-container">
    <el-splitter>
      <el-splitter-panel v-model:size="leftPanelSize" :min="leftPanelSize === 0 ? 0 : 180" :max="450" collapsible>
        <!-- 左侧面板：笔记章节 -->
        <NoteChapter ref="noteChapterRef" :book-name="bookName" />
      </el-splitter-panel>
      <el-splitter-panel>
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
      <el-splitter-panel v-model:size="rightPanelSize" :min="60" :max="320">
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
      :style="{ right: rightPanelSize > 0 ? `calc(${rightPanelSize}px + 20px)` : '20px' }"
      @prev-chapter="handlePrevChapter" 
      @next-chapter="handleNextChapter" 
    />
  </div>
</template>

<script setup>
import { ref, nextTick, onActivated, onDeactivated, onMounted } from 'vue'
import { useRoute } from 'vue-router'

defineOptions({ name: 'Editor' })
import NoteChapter from '@renderer/components/Editor/NoteChapter.vue'
import EditorPanel from '@renderer/components/Editor/EditorPanel.vue'
import EditorToolbar from '@renderer/components/Editor/EditorToolbar.vue'
import FloatingQuickActions from '@renderer/components/Editor/FloatingQuickActions.vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

const route = useRoute()

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
    document.title = `${bookName} - 织梦书房`
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
const leftPanelSize = ref(240)
const rightPanelSize = ref(150)
const lastLeftPanelSize = ref(240)
const lastRightPanelSize = ref(150)

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
</style>

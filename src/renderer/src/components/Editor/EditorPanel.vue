<template>
  <div class="editor-panel">
    <!-- 菜单栏 -->
    <EditorMenubar
      v-model="menubarState"
      :editor="editor"
      :book-name="bookName"
      :left-collapsed="leftCollapsed"
      :right-collapsed="rightCollapsed"
      @toggle-left="$emit('toggle-left')"
      @toggle-right="$emit('toggle-right')"
      @toggle-search="toggleSearchPanel"
      @save="saveContent"
      @export="handleExport"
      @update-style="handleStyleUpdate"
    />
    <!-- 章节标题 -->
    <div class="chapter-title">
      <el-input
        v-model="chapterTitle"
        :placeholder="t('editorPanel.chapterTitle')"
        maxlength="20"
        class="chapter-title-input"
        @blur="handleTitleBlur"
      />
      <span class="save-state" :class="`is-${editorStore.saveStatus}`">
        {{ saveStatusText }}
      </span>
      <el-button
        v-if="editorStore.file?.type === 'chapter'"
        text
        @click="openVersionHistory"
      >
        历史版本
      </el-button>
      <!-- 人物高亮开关 -->
      <el-switch
        v-if="editorStore.file?.type === 'chapter'"
        v-model="characterHighlightEnabled"
        :active-text="t('editorPanel.characterHighlight')"
        :inactive-text="t('editorPanel.characterHighlight')"
        inline-prompt
        style="--el-switch-off-color: #999999"
        class="character-highlight-switch"
        @change="handleCharacterHighlightChange"
      />
      <!-- 禁词提示开关 -->
      <el-switch
        v-if="editorStore.file?.type === 'chapter'"
        v-model="bannedWordsHintEnabled"
        :active-text="t('editorPanel.bannedWordsHint')"
        :inactive-text="t('editorPanel.bannedWordsHint')"
        inline-prompt
        style="--el-switch-off-color: #999999"
        class="banned-words-hint-switch"
        @change="handleBannedWordsHintChange"
      />
    </div>
    <!-- 正文内容编辑区（含右上角 AI 润色按钮） -->
    <div class="editor-content-wrap">
      <EditorContent class="editor-content" :editor="editor" />
    </div>
    <!-- AI 润色结果确认弹框（段落 / 整章共用） -->
    <el-dialog
      v-model="polishDialogVisible"
      :title="
        polishMode === 'chapter'
          ? t('editorPanel.aiPolishResultChapter')
          : t('editorPanel.aiPolishResultSelection')
      "
      width="80%"
      class="polish-dialog"
      destroy-on-close
      @closed="resetPolishResult"
    >
      <div class="polish-dialog-body">
        <div class="polish-block">
          <div class="polish-label">{{ t('editorPanel.originalText') }}</div>
          <div class="polish-content original">{{ polishOriginalText }}</div>
        </div>
        <div class="polish-block">
          <div class="polish-label">{{ t('editorPanel.polishedText') }}</div>
          <div class="polish-content polished">{{ polishResultText }}</div>
        </div>
      </div>
      <div v-if="cleanupDiff.length" class="cleanup-diff">
        <div class="polish-label">逐段差异</div>
        <div
          v-for="(change, index) in cleanupDiff"
          :key="`${change.type}-${index}`"
          class="cleanup-diff-row"
          :class="`is-${change.type}`"
        >
          <div v-if="change.before" class="cleanup-before">原文：{{ change.before }}</div>
          <div v-if="change.after" class="cleanup-after">结果：{{ change.after }}</div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="polishDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button @click="copyPolishedText">{{ t('editorPanel.copyOneClick') }}</el-button>
          <el-button type="primary" @click="confirmPolishReplace">
            {{
              polishMode === 'chapter'
                ? t('editorPanel.confirmReplaceChapter')
                : t('editorPanel.confirmReplace')
            }}
          </el-button>
        </span>
      </template>
    </el-dialog>
    <el-drawer v-model="versionDrawerVisible" title="正文历史版本" size="420px">
      <div class="version-toolbar">
        <el-button type="primary" @click="createNamedVersion">保存命名版本</el-button>
      </div>
      <el-empty v-if="!versionSnapshots.length" description="暂无历史版本" />
      <div v-else class="version-list">
        <div v-for="item in versionSnapshots" :key="item.id" class="version-item">
          <div>
            <strong>{{ item.name || versionReasonLabel(item.reason) }}</strong>
            <div class="version-time">{{ formatVersionTime(item.createdAt) }}</div>
          </div>
          <div class="version-actions">
            <el-button text type="primary" @click="restoreVersion(item)">恢复</el-button>
            <el-button text type="danger" @click="removeVersion(item)">删除</el-button>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- AI 续写：续写要求输入弹框 -->
    <el-dialog
      v-model="continuePromptDialogVisible"
      :title="t('editorPanel.aiContinue')"
      width="520px"
      class="continue-prompt-dialog"
      destroy-on-close
      :close-on-click-modal="false"
      @close="continuePromptDialogVisible = false"
    >
      <el-form label-width="80px" @submit.prevent="confirmContinuePrompt">
        <el-form-item :label="t('editorPanel.continuePrompt')">
          <el-input
            v-model="continuePromptText"
            type="textarea"
            :rows="4"
            :placeholder="t('editorPanel.continuePromptPlaceholder')"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('editorPanel.canContinue')">
          <span class="continue-words-tip">
            {{ t('editorPanel.continueAllowWords', { words: continueAllowWords }) }}
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button :disabled="continueLoading" @click="continuePromptDialogVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button type="primary" :loading="continueLoading" @click="confirmContinuePrompt">
            {{ t('common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- AI 续写：结果展示弹框 -->
    <el-dialog
      v-model="continueResultDialogVisible"
      :title="t('editorPanel.aiContinueResult')"
      width="80%"
      class="continue-result-dialog"
      destroy-on-close
      @close="continueResultDialogVisible = false"
    >
      <div class="continue-result-body">
        <div class="continue-block">
          <div class="continue-label">{{ t('editorPanel.continueContent') }}</div>
          <div class="continue-content">{{ continueResultText }}</div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="continueResultDialogVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button @click="copyContinueText">{{ t('editorMenubar.copy') }}</el-button>
          <el-button type="primary" @click="confirmContinueInsert">
            {{ t('editorPanel.confirmInsertEnd') }}
          </el-button>
        </span>
      </template>
    </el-dialog>
    <!-- 编辑器内容配置组件（隐藏，仅提供逻辑） -->
    <ChapterEditorContent
      ref="chapterEditorContentRef"
      :editor-store="editorStore"
      :menubar-state="menubarState"
      :is-composing="isComposing"
      :get-font-family="getFontFamily"
      :auto-save-content="autoSaveContent"
    />
    <NoteEditorContent
      ref="noteEditorContentRef"
      :editor-store="editorStore"
      :menubar-state="menubarState"
      :is-composing="isComposing"
      :get-font-family="getFontFamily"
      :auto-save-content="autoSaveContent"
    />
    <!-- 码字进度 -->
    <EditorProgress
      v-if="editorStore.file?.type === 'chapter'"
      :current-words="contentWordCount"
      :target-words="editorStore.chapterTargetWords"
      :book-name="bookName"
    />
    <!-- 编辑器统计 -->
    <EditorStats
      v-if="editorStore.file?.type === 'chapter'"
      ref="editorStatsRef"
      :book-name="bookName"
      :content-word-count="contentWordCount"
      :file-type="editorStore.file?.type"
    />

    <AISceneImageDialog
      v-model="sceneDialogVisible"
      :book-name="bookName"
      :excerpt="sceneExcerpt"
    />

    <!-- 搜索面板 -->
    <SearchPanel :visible="searchPanelVisible" :editor="editor" @close="closeSearchPanel" />
  </div>
</template>

<script setup>
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  computed,
  nextTick
} from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { EditorContent } from '@tiptap/vue-3'
import { createEditorSaveQueue } from '../../service/editorSaveQueue'
import {
  createEditorSnapshot,
  deleteEditorSnapshot,
  listBannedWords,
  listChapterTree,
  listEditorSnapshots,
  readChapterContent,
  readCharactersDocument,
  saveChapterDocument,
  writeNoteDocument
} from '../../service/editor'
import { cleanEditorText, createTextRevisionToken } from '../../service/editorTextCleanup'
import { restoreChapterVersion } from '../../service/chapterVersionRestore'
import { continueWriteWithAI, polishTextWithAI } from '../../service/editorText'
import { getStoreValue, setStoreValue } from '../../service/webStore'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@renderer/stores/editor'
import SearchPanel from '@renderer/components/Editor/SearchPanel.vue'
import EditorMenubar from '@renderer/components/Editor/EditorMenubar.vue'
import EditorStats from '@renderer/components/Editor/EditorStats.vue'
import EditorProgress from '@renderer/components/Editor/EditorProgress.vue'
import ChapterEditorContent from '@renderer/components/Editor/ChapterEditorContent.vue'
import NoteEditorContent from '@renderer/components/Editor/NoteEditorContent.vue'
import AISceneImageDialog from '@renderer/components/Editor/AISceneImageDialog.vue'

const editorStore = useEditorStore()
const { t } = useI18n()

const props = defineProps({
  bookName: String,
  leftCollapsed: {
    type: Boolean,
    default: false
  },
  rightCollapsed: {
    type: Boolean,
    default: false
  }
})

watch(
  () => props.bookName,
  (name) => {
    if (name) {
      editorStore.currentBookName = name
      // 书籍切换时，加载对应书籍的人物高亮开关状态
      loadCharacterHighlightState(name)
      // 书籍切换时，加载对应书籍的禁词提示开关状态
      loadBannedWordsHintState(name)
    }
  },
  { immediate: true }
)

// 计算属性
const contentWordCount = computed(() => editorStore.contentWordCount)
const MIN_CONTINUE_WORDS_WITHOUT_PREVIOUS = 200
const PREVIOUS_CHAPTER_CONTEXT_LENGTH = 1200
/** AI 场景图：选区有效字数（与全书统计一致，不含空白） */
const SCENE_SELECTION_MIN_WORDS = 100
const SCENE_SELECTION_MAX_WORDS = 1000

function getPlainTextWordCount(text) {
  if (!text) return 0
  return String(text).replace(/[\s\n\r\t]/g, '').length
}

const continueAllowWords = computed(() => {
  const targetWords = Number(editorStore.chapterTargetWords) || 0
  const currentWords = Number(contentWordCount.value) || 0
  const maxTotal = Math.floor(targetWords * 1.2)
  const allow = maxTotal - currentWords
  return allow > 0 ? allow : 0
})

// EditorStats 组件引用
const editorStatsRef = ref(null)

const chapterTitle = computed({
  get: () => editorStore.chapterTitle,
  set: (val) => editorStore.setChapterTitle(val)
})

// 字体映射表：为每种字体提供完整的字体族配置（包含回退字体）
const fontFamilyMap = {
  inherit: '',
  SimSun: "'STSong', 'SimSun', 'NSimSun', '宋体', serif",
  SimHei: "'SimHei', '黑体', 'STHeiti', sans-serif",
  KaiTi: "'STKaiti', 'KaiTi', '楷体', serif",
  FangSong: "'FangSong', '仿宋', 'STFangsong', serif",
  SourceHanSans: "'Noto Sans CJK SC', 'Source Han Sans SC', '思源黑体', 'PingFang SC', sans-serif",
  SourceHanSerif: "'Noto Serif CJK SC', 'Source Han Serif SC', '思源宋体', 'SimSun', serif",
  PingFang: "'PingFang SC', '苹方', 'Hiragino Sans GB', 'STHeiti', sans-serif"
}

// 菜单栏状态
const menubarState = ref({
  fontFamily: 'SimHei',
  fontSize: '16px',
  lineHeight: '1.6',
  paragraphSpacing: '0.5em', // 段落之间间距
  pageWidth: '80%', // 页边距/页宽
  isBold: false,
  isItalic: false
})

const editor = ref(null)
let saveTimer = ref(null)
let styleUpdateTimer = null
let isComposing = false // 是否正在进行输入法输入（composition）
let compositionStartHandler = null
let compositionEndHandler = null
let isTitleSaving = false

// 编辑器内容组件引用
const chapterEditorContentRef = ref(null)
const noteEditorContentRef = ref(null)

// 人物高亮相关状态
const characterHighlightEnabled = ref(false) // 人物高亮开关状态，默认关闭
const characters = ref([]) // 人物数据列表
const defaultHighlightColor = '#ffeb3b' // 默认高亮颜色（黄色）

/**
 * 将人物高亮颜色变淡，避免过于刺眼
 * @param {string} hex - 如 #ffeb3b
 * @returns {string} 混合白色后的浅色 hex
 */
function lightenHighlightColor(hex) {
  if (!hex || typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return hex || defaultHighlightColor
  }
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const mix = 0.58 // 约 58% 向白色混合，使高亮更淡
  const r2 = Math.round(r + (255 - r) * mix)
  const g2 = Math.round(g + (255 - g) * mix)
  const b2 = Math.round(b + (255 - b) * mix)
  return '#' + [r2, g2, b2].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// 禁词提示相关状态
const bannedWordsHintEnabled = ref(false) // 禁词提示开关状态，默认关闭
const bannedWords = ref([]) // 禁词数据列表

async function handleTitleBlur() {
  const fileType = editorStore.file?.type
  if (!fileType || (fileType !== 'chapter' && fileType !== 'note')) return
  if (isTitleSaving) return
  try {
    isTitleSaving = true
    await saveFile(false)
  } finally {
    isTitleSaving = false
  }
}

// 搜索面板状态
const searchPanelVisible = ref(false)

// AI 润色：加载中、弹框可见、原文/润色结果；mode 为 selection | chapter，选中时记录替换范围
const polishLoading = ref(false)
const polishDialogVisible = ref(false)
const polishMode = ref('chapter') // 'selection' | 'chapter'
const polishOriginalText = ref('')
const polishResultText = ref('')
const cleanupDiff = ref([])
const cleanupTaskState = ref({
  selection: 'idle',
  chapter: 'idle'
})
let cleanupRequestSequence = 0
const polishSourceDocument = ref('')
const polishSourceFilePath = ref('')

// AI 续写相关状态
const continueLoading = ref(false)
const versionDrawerVisible = ref(false)
const versionSnapshots = ref([])
const lastAutoSnapshotContentByChapter = new Map()
const saveStatusText = computed(() => {
  const labels = {
    idle: '',
    saving: '正在保存',
    saved: '已保存',
    error: '保存失败',
    offline: '离线待保存'
  }
  return labels[editorStore.saveStatus] || ''
})

const saveQueue = createEditorSaveQueue({
  persist: persistSaveSnapshot,
  onStatusChange({ status, error, savedAt, filePath }) {
    if (editorStore.file?.path !== filePath) return
    editorStore.setSaveState(status, { error: error?.message, savedAt })
  }
})
const continuePromptDialogVisible = ref(false)
const continuePromptText = ref('')
const continueResultDialogVisible = ref(false)
const continueResultText = ref('')
const polishReplaceFrom = ref(0)
const polishReplaceTo = ref(0)

// AI 场景图（选中文本）
const sceneDialogVisible = ref(false)
const sceneExcerpt = ref('')

// 获取当前编辑器内容组件
function getEditorContentComponent() {
  const isNote = editorStore.file?.type === 'note'
  return isNote ? noteEditorContentRef.value : chapterEditorContentRef.value
}

/** 销毁 TipTap 前：取消防抖自动保存，并把当前笔记 HTML 写入 store 快照（消除竞态空窗） */
function prepareEditorDestroy() {
  noteEditorContentRef.value?.cancelNoteAutoSaveTimer?.()
  const f = editorStore.file
  if (f?.type === 'note' && f.path && editor.value && noteEditorContentRef.value) {
    const html = noteEditorContentRef.value.getSaveContent(editor.value)
    if (typeof html === 'string') {
      editorStore.updateNoteDraftHtml(f.path, html)
    }
  }
}

// 获取完整的字体族配置
function getFontFamily(fontKey) {
  return fontKey === 'inherit' || !fontKey
    ? ''
    : fontFamilyMap[fontKey] || `'${fontKey}', sans-serif`
}

// 更新编辑器样式
function updateEditorStyle() {
  if (!editor.value) return

  // TipTap的DOM结构：editor.view.dom 就是 .tiptap 元素
  const editorElement = editor.value.view.dom
  if (editorElement) {
    // 使用setProperty with 'important' 确保样式优先级最高
    // 获取完整的字体族配置（包含回退字体）
    const fullFontFamily = getFontFamily(menubarState.value.fontFamily)
    editorElement.style.setProperty('font-family', fullFontFamily, 'important')
    editorElement.style.setProperty('font-size', menubarState.value.fontSize, 'important')
    editorElement.style.setProperty('line-height', menubarState.value.lineHeight, 'important')
    editorElement.style.setProperty(
      '--paragraph-spacing',
      menubarState.value.paragraphSpacing ?? '0',
      'important'
    )
    editorElement.style.setProperty('max-width', menubarState.value.pageWidth ?? '80%', 'important')
    editorElement.style.setProperty('margin', '0 auto', 'important')
    // 根据文件类型设置首行缩进（章节：2em；笔记：0）
    const isChapter = editorStore.file?.type === 'chapter'
    editorElement.style.setProperty('text-indent', isChapter ? '2em' : '0', 'important')
  }
}

// 处理样式更新
function handleStyleUpdate() {
  updateEditorStyle()
  // 防抖保存设置
  if (styleUpdateTimer) clearTimeout(styleUpdateTimer)
  styleUpdateTimer = setTimeout(() => {
    editorStore.saveEditorSettings({
      fontFamily: menubarState.value.fontFamily,
      fontSize: menubarState.value.fontSize,
      lineHeight: menubarState.value.lineHeight,
      paragraphSpacing: menubarState.value.paragraphSpacing,
      pageWidth: menubarState.value.pageWidth,
      globalBoldMode: menubarState.value.isBold,
      globalItalicMode: menubarState.value.isItalic
    })
  }, 500)
}

// 处理导出事件
function handleExport() {
  // 导出功能已在 EditorMenubar 组件中实现，这里只需要处理事件
}

// 监听 store 内容变化，回显到编辑器
watch(
  () => editorStore.file,
  async (newFile, oldFile) => {
    // 如果编辑器不存在且新文件存在，初始化编辑器
    if (!editor.value && newFile) {
      try {
        await initEditor()
        await nextTick()
        setupCompositionHandlers()
        // 初始化后，initEditor 已经设置了内容，这里不需要再次设置
        // 如果是章节编辑器，等待内容渲染完成后加载状态并应用高亮/划线
        if (newFile?.type === 'chapter' && props.bookName) {
          await nextTick()
          await nextTick()
          await new Promise((resolve) => setTimeout(resolve, 50))
          await loadCharacterHighlightState(props.bookName)
          await loadBannedWordsHintState(props.bookName)
        }
        return
      } catch (error) {
        console.error('初始化编辑器失败:', error)
        return
      }
    }

    if (!newFile) return

    // 如果文件类型发生变化，需要重新初始化编辑器
    const fileTypeChanged = newFile?.type !== oldFile?.type

    if (fileTypeChanged && editor.value) {
      try {
        prepareEditorDestroy()
        // 销毁旧编辑器
        editor.value.destroy()
        editor.value = null
        // 等待一下确保完全销毁
        await nextTick()
        // 重新初始化编辑器（initEditor 内部会设置内容）
        await initEditor()
        // 等待编辑器完全初始化
        await nextTick()
        setupCompositionHandlers()
        // 重新初始化后，initEditor 已经设置了内容，这里不需要再次设置
        // 如果是章节编辑器，等待内容渲染完成后加载状态并应用高亮/划线
        if (newFile?.type === 'chapter' && props.bookName) {
          await nextTick()
          await nextTick()
          await new Promise((resolve) => setTimeout(resolve, 50))
          await loadCharacterHighlightState(props.bookName)
          await loadBannedWordsHintState(props.bookName)
        }
        return
      } catch (error) {
        console.error('重新初始化编辑器失败:', error)
        // 出错时尝试恢复编辑器
        if (oldFile) {
          try {
            await initEditor()
          } catch (retryError) {
            console.error('恢复编辑器失败:', retryError)
          }
        }
        return
      }
    }

    // 只有在文件路径变化且编辑器已存在时才设置内容
    if (editor.value && newFile?.path !== oldFile?.path) {
      // 文件变化时，先开始编辑会话（设置初始化标志），再设置内容
      const newContent = editorStore.content || ''
      const isNote = newFile?.type === 'note'

      // 先开始编辑会话，设置 isInitializing = true，避免加载已有内容时被计入码字速度
      editorStore.startEditingSession(newContent)

      // 根据文件类型使用对应的内容设置方法
      if (isNote) {
        noteEditorContentRef.value.setNoteContent(editor.value, newContent)
      } else {
        chapterEditorContentRef.value.setChapterContent(editor.value, newContent)
      }

      // 书籍总字数由 EditorStats 组件通过 watch fileType 自动加载

      // 更新样式
      updateEditorStyle()

      // 如果开启了人物高亮，重新应用高亮
      if (characterHighlightEnabled.value && !isNote) {
        nextTick(() => {
          loadCharacters().then(() => {
            applyCharacterHighlights()
            // 确保定时器在运行
            if (!characterHighlightTimer) {
              startCharacterHighlightTimer()
            }
          })
        })
      }

      // 如果开启了禁词提示，重新应用划线
      if (bannedWordsHintEnabled.value && !isNote) {
        nextTick(() => {
          loadBannedWords().then(() => {
            applyBannedWordsStrikes()
            // 确保定时器在运行
            if (!bannedWordsHintTimer) {
              startBannedWordsHintTimer()
            }
          })
        })
      }

      // 如果全局格式模式开启，应用到新内容
      nextTick(() => {
        if (!editor.value) return
        const docSize = editor.value.state.doc.content.size
        if (docSize === 0) return

        if (menubarState.value.isBold || menubarState.value.isItalic) {
          setTimeout(() => {
            if (!editor.value) return
            const currentDocSize = editor.value.state.doc.content.size
            if (currentDocSize === 0) return

            let chain = editor.value.chain().focus().selectAll()
            if (menubarState.value.isBold) {
              chain = chain.setBold()
            }
            if (menubarState.value.isItalic) {
              chain = chain.setItalic()
            }
            chain.run()

            // 恢复光标到最开始并回到顶部
            editor.value.chain().focus().setTextSelection(0).run()
            const scrollContainers = document.querySelectorAll('.editor-content, .editor-content .tiptap, .tiptap, .editor-content-wrap')
            scrollContainers.forEach(el => { if (el) el.scrollTop = 0 })
          }, 100)
        } else {
          // 没有全局样式格式化时，也需要回到顶部
          setTimeout(() => {
            if (!editor.value) return
            editor.value.chain().focus().setTextSelection(0).run()
            const scrollContainers = document.querySelectorAll('.editor-content, .editor-content .tiptap, .tiptap, .editor-content-wrap')
            scrollContainers.forEach(el => { if (el) el.scrollTop = 0 })
          }, 100)
        }
      })
    }
  }
)

// 键盘快捷键处理
function handleKeydown(event) {
  // Cmd/Ctrl + F: 打开搜索面板
  if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
    event.preventDefault()
    if (!searchPanelVisible.value) {
      searchPanelVisible.value = true
    }
  }

  // Cmd/Ctrl + S: 保存内容
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    saveContent()
  }
}

const RECOVERY_DRAFT_PREFIX = 'dreamloom:editor-recovery-draft:'

function recoveryDraftKey(bookName, filePath) {
  return `${RECOVERY_DRAFT_PREFIX}${encodeURIComponent(bookName || '')}:${encodeURIComponent(filePath || '')}`
}

function saveRecoveryDraft() {
  const file = editorStore.file
  if (!file?.path) return
  try {
    const component = getEditorContentComponent()
    const content = editor.value && component
      ? component.getSaveContent(editor.value)
      : editorStore.content
    localStorage.setItem(
      recoveryDraftKey(props.bookName, file.path),
      JSON.stringify({
        bookName: props.bookName,
        filePath: file.path,
        fileType: file.type,
        title: editorStore.chapterTitle,
        content,
        savedAt: Date.now()
      })
    )
  } catch (error) {
    console.error('保存浏览器恢复副本失败:', error)
  }
}

async function offerRecoveryDraft() {
  const file = editorStore.file
  if (!file?.path || !editor.value) return
  const key = recoveryDraftKey(props.bookName, file.path)
  let draft
  try {
    draft = JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    localStorage.removeItem(key)
    return
  }
  if (!draft || typeof draft.content !== 'string') return

  const component = getEditorContentComponent()
  const currentContent = component?.getSaveContent(editor.value)
  if (draft.content === currentContent) {
    localStorage.removeItem(key)
    return
  }

  try {
    await ElMessageBox.confirm(
      '检测到浏览器关闭前留下的未确认正文。恢复后请检查内容并重新保存。',
      '恢复未保存正文',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '保留当前正文',
        type: 'warning'
      }
    )
    editor.value.commands.setContent(draft.content)
    if (file.type === 'note') {
      editorStore.updateNoteDraftHtml(file.path, draft.content)
    } else {
      editorStore.setContent(draft.content)
    }
    editorStore.setSaveState('offline', { error: '已恢复浏览器副本，请重新保存' })
  } catch {
    localStorage.removeItem(key)
  }
}

// 浏览器关闭时异步请求无法保证完成，先同步保留恢复副本。
function handleWindowClose() {
  // 清除定时器
  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (styleUpdateTimer) clearTimeout(styleUpdateTimer)

  // 同步保存编辑器设置（窗口关闭时无法使用 async/await）
  editorStore
    .saveEditorSettings({
      fontFamily: menubarState.value.fontFamily,
      fontSize: menubarState.value.fontSize,
      lineHeight: menubarState.value.lineHeight,
      paragraphSpacing: menubarState.value.paragraphSpacing,
      pageWidth: menubarState.value.pageWidth,
      globalBoldMode: menubarState.value.isBold,
      globalItalicMode: menubarState.value.isItalic
    })
    .catch((error) => {
      console.error('保存编辑器设置失败:', error)
    })

  saveRecoveryDraft()
}

// 初始化编辑器的函数
async function initEditor() {
  if (editor.value) {
    prepareEditorDestroy()
    // 如果编辑器已存在，先销毁
    editor.value.destroy()
    editor.value = null
  }

  // 加载编辑器设置
  await editorStore.loadEditorSettings()

  // 应用加载的设置
  if (editorStore.editorSettings) {
    const settings = editorStore.editorSettings
    // 只在值为 undefined 或 null 时才使用默认值，避免覆盖空字符串等有效值
    menubarState.value = {
      fontFamily:
        settings.fontFamily !== undefined && settings.fontFamily !== null
          ? settings.fontFamily
          : 'SimHei',
      fontSize:
        settings.fontSize !== undefined && settings.fontSize !== null ? settings.fontSize : '16px',
      lineHeight:
        settings.lineHeight !== undefined && settings.lineHeight !== null
          ? settings.lineHeight
          : '1.6',
      paragraphSpacing:
        settings.paragraphSpacing !== undefined && settings.paragraphSpacing !== null
          ? settings.paragraphSpacing
          : '0.5em',
      pageWidth:
        settings.pageWidth !== undefined && settings.pageWidth !== null
          ? settings.pageWidth
          : '80%',
      isBold: settings.globalBoldMode !== undefined ? settings.globalBoldMode : false,
      isItalic: settings.globalItalicMode !== undefined ? settings.globalItalicMode : false
    }
  }

  // 获取对应的编辑器内容组件
  const editorContentComponent = getEditorContentComponent()
  if (!editorContentComponent) {
    console.error('编辑器内容组件未找到')
    return
  }

  // 使用组件提供的方法创建编辑器
  editor.value = editorContentComponent.createEditor()

  // 设置初始内容
  const initialContent = editorStore.content || ''

  // 如果有初始内容，先开始编辑会话（设置初始化标志），再设置内容
  if (initialContent) {
    editorStore.startEditingSession(initialContent)
  }

  if (editorStore.file?.name) {
    editorStore.setChapterTitle(editorStore.file.name)
  }

  // 根据文件类型使用对应的内容设置方法
  const isNote = editorStore.file?.type === 'note'
  if (isNote) {
    noteEditorContentRef.value.setNoteContent(editor.value, initialContent)
  } else {
    chapterEditorContentRef.value.setChapterContent(editor.value, initialContent)
  }

  // 等待DOM渲染完成后应用样式
  await nextTick()
  updateEditorStyle()

  // 如果加载了加粗或倾斜状态，应用到所有内容
  if (menubarState.value.isBold || menubarState.value.isItalic) {
    if (initialContent) {
      // 等待编辑器完全初始化后再应用格式
      await nextTick()

      // 给编辑器更多时间来渲染内容
      setTimeout(() => {
        if (!editor.value) return

        // 确保有内容再应用格式
        const docSize = editor.value.state.doc.content.size
        if (docSize === 0) return

        // 保存当前选择位置
        const currentFrom = editor.value.state.selection.from
        const currentTo = editor.value.state.selection.to

        // 在同一个命令链中选择所有内容并应用格式
        let chain = editor.value.chain().focus().selectAll()

        if (menubarState.value.isBold) {
          chain = chain.setBold()
        }
        if (menubarState.value.isItalic) {
          chain = chain.setItalic()
        }

        chain.run()

        // 恢复之前的选择位置（如果有的话）
        if (docSize > 0) {
          const newFrom = Math.min(currentFrom, docSize - 1)
          const newTo = Math.min(currentTo, docSize - 1)
          editor.value.chain().focus().setTextSelection({ from: newFrom, to: newTo }).run()
        }
      }, 100)
    }
  }

  // 注意：startEditingSession 已经在上面调用过了，这里不需要重复调用

  // 设置输入法事件监听器
  setupCompositionHandlers()
}

// 设置输入法事件监听器的函数
function setupCompositionHandlers() {
  if (!editor.value || !editor.value.view || !editor.value.view.dom) return

  const editorElement = editor.value.view.dom

  // 先移除旧的监听器（如果存在）
  if (compositionStartHandler) {
    editorElement.removeEventListener('compositionstart', compositionStartHandler)
  }
  if (compositionEndHandler) {
    editorElement.removeEventListener('compositionend', compositionEndHandler)
  }

  // compositionstart: 开始输入法输入
  compositionStartHandler = () => {
    isComposing = true
  }
  editorElement.addEventListener('compositionstart', compositionStartHandler)

  // compositionend: 输入法确认（回车或选择）
  compositionEndHandler = () => {
    isComposing = false
    // 输入法确认后，立即更新字数统计
    if (editor.value) {
      const content = editor.value.getText()
      editorStore.setContent(content)
    }
  }
  editorElement.addEventListener('compositionend', compositionEndHandler)
}

onMounted(async () => {
  // 书籍总字数由 EditorStats 组件通过 watch fileType 自动加载
  // registerExternalSaveHandler / keydown 在 onActivated 中注册，避免 keep-alive 停用后仍响应快捷键

  // 延迟初始化编辑器，等待文件加载完成
  // 如果 file 已经存在，立即初始化；否则等待 file 变化后再初始化
  if (editorStore.file) {
    await initEditor()
    await nextTick()
    setupCompositionHandlers()

    // 等待编辑器内容完全渲染后再加载状态并应用高亮/划线
    // 确保内容已经设置完成，特别是对于章节编辑器
    if (editorStore.file?.type === 'chapter') {
      // 多等待几个 tick，确保内容已经渲染到 DOM
      await nextTick()
      await nextTick()
      // 额外等待一小段时间，确保 TipTap 编辑器内容已经完全渲染
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    // 在编辑器初始化完成后，加载当前书籍的人物高亮和禁词提示开关状态
    // 这样 loadCharacterHighlightState 和 loadBannedWordsHintState 中的自动应用逻辑才能正常工作
    if (props.bookName && editor.value && editorStore.file?.type === 'chapter') {
      await loadCharacterHighlightState(props.bookName)
      await loadBannedWordsHintState(props.bookName)
    }
    await offerRecoveryDraft()
  }
  // 如果 file 不存在，watch 会在文件加载后触发初始化

  // 监听窗口关闭事件，确保设置被保存（组件在 keep-alive 中仍可能收到 beforeunload）
  window.addEventListener('beforeunload', handleWindowClose)
})

onActivated(async () => {
  editorStore.registerExternalSaveHandler(saveFile)
  document.addEventListener('keydown', handleKeydown)
  await nextTick()
  resumeChapterDecorationTimers()
})

onDeactivated(async () => {
  editorStore.registerExternalSaveHandler(null)
  document.removeEventListener('keydown', handleKeydown)

  stopCharacterHighlightTimer()
  stopBannedWordsHintTimer()

  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (styleUpdateTimer) clearTimeout(styleUpdateTimer)

  await editorStore.saveEditorSettings({
    fontFamily: menubarState.value.fontFamily,
    fontSize: menubarState.value.fontSize,
    lineHeight: menubarState.value.lineHeight,
    paragraphSpacing: menubarState.value.paragraphSpacing,
    pageWidth: menubarState.value.pageWidth,
    globalBoldMode: menubarState.value.isBold,
    globalItalicMode: menubarState.value.isItalic
  })

  await autoSaveContent()
})

onBeforeUnmount(async () => {
  editorStore.registerExternalSaveHandler(null)
  // 移除窗口关闭监听器
  window.removeEventListener('beforeunload', handleWindowClose)

  // 移除输入法事件监听器
  if (editor.value && editor.value.view && editor.value.view.dom) {
    const editorElement = editor.value.view.dom
    if (compositionStartHandler) {
      editorElement.removeEventListener('compositionstart', compositionStartHandler)
    }
    if (compositionEndHandler) {
      editorElement.removeEventListener('compositionend', compositionEndHandler)
    }
  }

  // 停止人物高亮定时器
  stopCharacterHighlightTimer()

  // 停止禁词提示定时器
  stopBannedWordsHintTimer()

  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (styleUpdateTimer) clearTimeout(styleUpdateTimer)

  // 保存编辑器设置
  await editorStore.saveEditorSettings({
    fontFamily: menubarState.value.fontFamily,
    fontSize: menubarState.value.fontSize,
    lineHeight: menubarState.value.lineHeight,
    paragraphSpacing: menubarState.value.paragraphSpacing,
    pageWidth: menubarState.value.pageWidth,
    globalBoldMode: menubarState.value.isBold,
    globalItalicMode: menubarState.value.isItalic
  })

  // 保存最后的内容
  await autoSaveContent()

  // 重置编辑会话
  editorStore.resetEditingSession()

  // 移除键盘事件监听器
  document.removeEventListener('keydown', handleKeydown)

  // 销毁编辑器
  editor.value && editor.value.destroy()
})

// 保存内容的通用函数
async function persistSaveSnapshot(snapshot) {
  const common = {
    bookName: snapshot.bookName,
    newName: snapshot.title,
    content: snapshot.content
  }
  if (snapshot.file.type === 'note') {
    return writeNoteDocument({
      ...common,
      notebookName: snapshot.file.notebook,
      noteName: snapshot.file.name
    })
  }
  const result = await saveChapterDocument({
    ...common,
    volumeName: snapshot.file.volume,
    chapterName: snapshot.file.name
  })
  const snapshotKey = `${snapshot.bookName}\n${snapshot.filePath}`
  if (
    result?.success &&
    snapshot.content !== lastAutoSnapshotContentByChapter.get(snapshotKey)
  ) {
    try {
      await createEditorSnapshot({
        bookId: snapshot.bookName,
        chapterId: snapshot.filePath,
        chapterName: snapshot.file.name,
        contentBefore: snapshot.content,
        reason: 'auto_save'
      })
      lastAutoSnapshotContentByChapter.set(snapshotKey, snapshot.content)
    } catch (error) {
      console.error('创建章节自动快照失败:', error)
    }
  }
  return result
}

async function loadVersionSnapshots() {
  const file = editorStore.file
  if (!file || file.type !== 'chapter') {
    versionSnapshots.value = []
    return
  }
  versionSnapshots.value = await listEditorSnapshots({
    bookId: props.bookName,
    chapterId: file.path
  })
}

async function openVersionHistory() {
  try {
    await loadVersionSnapshots()
    versionDrawerVisible.value = true
  } catch (error) {
    ElMessage.error(error?.message || '读取历史版本失败')
  }
}

async function createNamedVersion() {
  try {
    const { value } = await ElMessageBox.prompt('请输入版本名称', '保存命名版本', {
      inputPlaceholder: '例如：第一稿完成',
      inputValidator: (text) => Boolean(String(text || '').trim()) || '请输入版本名称'
    })
    await createEditorSnapshot({
      bookId: props.bookName,
      chapterId: editorStore.file.path,
      chapterName: editorStore.file.name,
      contentBefore: editor.value?.getHTML() || editorStore.content,
      reason: 'manual',
      name: String(value).trim()
    })
    await loadVersionSnapshots()
    ElMessage.success('命名版本已保存')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '保存命名版本失败')
    }
  }
}

async function restoreVersion(item) {
  try {
    await ElMessageBox.confirm('恢复后会覆盖当前正文，当前内容会先保存为备份。', '恢复版本', {
      type: 'warning',
      confirmButtonText: '恢复',
      cancelButtonText: '取消'
    })
    const chapterId = editorStore.file?.path
    const chapterName = editorStore.file?.name
    if (!chapterId || editorStore.file?.type !== 'chapter') {
      throw new Error('当前没有可恢复的章节')
    }
    const currentContent = editor.value?.getHTML() || editorStore.content
    await restoreChapterVersion({
      expectedChapterId: chapterId,
      getCurrentChapterId: () => editorStore.file?.path,
      currentContent,
      restoredContent: item.contentBefore || '<p></p>',
      createBackup: (contentBefore) =>
        createEditorSnapshot({
          bookId: props.bookName,
          chapterId,
          chapterName,
          contentBefore,
          reason: 'before_restore',
          name: '恢复前备份'
        }),
      applyContent(content) {
        editor.value?.commands.setContent(content)
        editorStore.setContent(content)
      },
      persistContent: () => saveFile(false)
    })
    await loadVersionSnapshots()
    ElMessage.success('历史版本已恢复')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '恢复历史版本失败')
    }
  }
}

async function removeVersion(item) {
  try {
    await ElMessageBox.confirm('确定删除这个历史版本吗？', '删除版本', {
      type: 'warning'
    })
    await deleteEditorSnapshot(item.id, {
      bookId: props.bookName,
      chapterId: editorStore.file.path
    })
    await loadVersionSnapshots()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '删除历史版本失败')
    }
  }
}

function versionReasonLabel(reason) {
  return {
    auto_save: '自动快照',
    before_restore: '恢复前备份',
    ai_apply: 'AI 操作前备份',
    manual: '命名版本'
  }[reason] || '历史版本'
}

function formatVersionTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN')
}

async function saveFile(showMessage = false) {
  const file = editorStore.file
  if (!file) {
    if (showMessage) ElMessage.warning(t('editorPanel.noChapterOrNoteSelected'))
    return false
  }

  const isNote = file.type === 'note'
  let contentToSave

  if (editor.value) {
    const editorContentComponent = getEditorContentComponent()
    if (editorContentComponent) {
      contentToSave = editorContentComponent.getSaveContent(editor.value)
      if (isNote) {
        const textContent = noteEditorContentRef.value.htmlToPlainText(contentToSave)
        editorStore.setContent(textContent)
        editorStore.updateNoteDraftHtml(file.path, contentToSave)
      } else {
        editorStore.setContent(contentToSave)
      }
    }
  }

  if (contentToSave === undefined) {
    if (isNote) {
      const draft = editorStore.getNoteDraftForPersist(file.path)
      if (draft === null) {
        return false
      }
      contentToSave = draft
    } else {
      contentToSave = editorStore.content
    }
  }

  const snapshot = {
    bookName: props.bookName,
    title: editorStore.chapterTitle,
    content: contentToSave,
    file: { ...file },
    filePath: file.path
  }

  const result = await saveQueue.enqueue(snapshot)
  if (result?.superseded) return true

  if (result?.success) {
    localStorage.removeItem(recoveryDraftKey(snapshot.bookName, snapshot.filePath))
    const isStillCurrentFile = editorStore.file?.path === snapshot.filePath
    if (result.name && result.name !== file.name && isStillCurrentFile) {
      editorStore.setFile({ ...snapshot.file, name: result.name })
      if (file.type === 'note') {
        emit('refresh-notes')
      } else if (file.type === 'chapter') {
        emit('refresh-chapters')
      }
    }
    if (showMessage && file.type === 'chapter' && editorStatsRef.value) {
      await editorStatsRef.value.loadBookTotalWords(true)
    }
    if (showMessage) ElMessage.success(t('editorPanel.saveSuccess'))
    return true
  } else {
    if (editorStore.file?.path === snapshot.filePath) {
      editorStore.setSaveState(result?.error?.offline ? 'offline' : 'error', {
        error: result?.message
      })
    }
    if (showMessage) ElMessage.error(result?.message || t('editorPanel.saveFailed'))
    else ElMessage.error(result?.message || t('editorPanel.autoSaveFailed'))
    return false
  }
}

// 手动保存内容
async function saveContent() {
  await saveFile(true)
}

// 搜索面板控制
function toggleSearchPanel() {
  searchPanelVisible.value = !searchPanelVisible.value
}

function closeSearchPanel() {
  searchPanelVisible.value = false
}

/**
 * 将润色后的纯文本转为编辑器 HTML（按双换行分段为 <p>，段内 \n 转 <br>）
 * @param {string} text - 纯文本
 * @returns {string} HTML
 */
function plainTextToEditorHtml(text) {
  if (!text || !text.trim()) return '<p></p>'
  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  const paragraphs = text.trim().split(/\n\n+/)
  return (
    paragraphs.map((p) => '<p>' + escape(p.trim()).replace(/\n/g, '<br>') + '</p>').join('') ||
    '<p></p>'
  )
}

function normalizeAppendText(appendText) {
  const cleaned = String(appendText || '').trim()
  if (!cleaned) return ''
  // 插入到章节末尾时，尽量从新段落开始
  return `\n\n${cleaned}`
}

async function getPreviousChapterContextInfo() {
  const currentFile = editorStore.file
  if (!props.bookName || !currentFile || currentFile.type !== 'chapter') {
    return { hasPrevious: false, contextText: '' }
  }
  try {
    const chaptersTree = await listChapterTree(props.bookName)
    if (!Array.isArray(chaptersTree) || chaptersTree.length === 0) {
      return { hasPrevious: false, contextText: '' }
    }

    const flatChapters = []
    chaptersTree.forEach((volume) => {
      if (!volume || volume.type !== 'volume' || !Array.isArray(volume.children)) return
      volume.children.forEach((chapter) => {
        if (!chapter || chapter.type !== 'chapter') return
        flatChapters.push({
          name: chapter.name,
          path: chapter.path,
          volumeName: volume.name
        })
      })
    })

    if (flatChapters.length === 0) {
      return { hasPrevious: false, contextText: '' }
    }

    const currentIndex = flatChapters.findIndex(
      (chapter) =>
        chapter.path === currentFile.path ||
        (chapter.name === currentFile.name && chapter.volumeName === currentFile.volume)
    )
    if (currentIndex <= 0) {
      return { hasPrevious: false, contextText: '' }
    }

    const previousChapter = flatChapters[currentIndex - 1]
    const readRes = await readChapterContent(
      props.bookName,
      previousChapter.volumeName,
      previousChapter.name
    )
    if (!readRes?.success || !readRes.content) {
      return { hasPrevious: true, contextText: '' }
    }

    const previousText = String(readRes.content).trim()
    if (!previousText) {
      return { hasPrevious: true, contextText: '' }
    }

    const tailContext = previousText.slice(-PREVIOUS_CHAPTER_CONTEXT_LENGTH)
    return { hasPrevious: true, contextText: tailContext }
  } catch (error) {
    console.error('获取上一章上下文失败:', error)
    return { hasPrevious: false, contextText: '' }
  }
}

  async function handleCleanGarbageSelection() {
    if (cleanupTaskState.value.selection === 'running') {
      ElMessage.info('选段清理正在进行，请稍候')
      return
    }
    if (!editor.value) return
    const { from, to, empty } = editor.value.state.selection
    if (empty) {
      ElMessage.warning('请先在正文中选中需要清理乱码的段落')
      return
    }
    const text = editor.value.state.doc.textBetween(from, to, '\n')
    if (getPlainTextWordCount(text) < 5) {
      ElMessage.warning('选中的内容太短')
      return
    }
    const requestId = ++cleanupRequestSequence
    const sourceDocument = editor.value.getText()
    const sourceFilePath = editorStore.file?.path || ''
    cleanupTaskState.value.selection = 'running'
    try {
      const res = await cleanEditorText(text, {
        bookId: props.bookName,
        chapterId: sourceFilePath,
        selection: { from, to },
        editVersion: createTextRevisionToken(sourceDocument)
      })
      if (
        requestId !== cleanupRequestSequence ||
        editorStore.file?.path !== sourceFilePath ||
        editor.value?.getText() !== sourceDocument
      ) {
        cleanupTaskState.value.selection = 'idle'
        ElMessage.warning('正文在 AI 处理期间已经变化，本次结果未应用')
        return
      }
      polishMode.value = 'selection'
      polishOriginalText.value = text
      polishResultText.value = res.content || ''
      cleanupDiff.value = res.diff
      polishReplaceFrom.value = from
      polishReplaceTo.value = to
      polishSourceDocument.value = sourceDocument
      polishSourceFilePath.value = sourceFilePath
      polishDialogVisible.value = true
      cleanupTaskState.value.selection = 'success'
    } catch (e) {
      cleanupTaskState.value.selection = 'error'
      ElMessage.error(e?.message || '清理乱码请求出错')
    }
  }

  async function handleCleanGarbageChapter() {
    if (cleanupTaskState.value.chapter === 'running') {
      ElMessage.info('整章清理正在进行，请稍候')
      return
    }
    if (!editor.value) return
    const fullText = editor.value.getText()
    if (getPlainTextWordCount(fullText) < 10) {
      ElMessage.warning('本章内容太少')
      return
    }
    const requestId = ++cleanupRequestSequence
    const sourceFilePath = editorStore.file?.path || ''
    cleanupTaskState.value.chapter = 'running'
    try {
      const res = await cleanEditorText(fullText, {
        bookId: props.bookName,
        chapterId: sourceFilePath,
        editVersion: createTextRevisionToken(fullText)
      })
      if (
        requestId !== cleanupRequestSequence ||
        editorStore.file?.path !== sourceFilePath ||
        editor.value?.getText() !== fullText
      ) {
        cleanupTaskState.value.chapter = 'idle'
        ElMessage.warning('正文在 AI 处理期间已经变化，本次结果未应用')
        return
      }
      polishMode.value = 'chapter'
      polishOriginalText.value = fullText
      polishResultText.value = res.content || ''
      cleanupDiff.value = res.diff
      polishSourceDocument.value = fullText
      polishSourceFilePath.value = sourceFilePath
      polishDialogVisible.value = true
      cleanupTaskState.value.chapter = 'success'
    } catch (e) {
      cleanupTaskState.value.chapter = 'error'
      ElMessage.error(e?.message || '清理乱码请求出错')
    }
  }

/** 下拉选择：润色选中文本 / 润色整章 */
function handlePolishCommand(command) {
  if (command === 'selection') {
    handlePolishSelection()
  } else if (command === 'chapter') {
    handlePolishChapter()
  } else if (command === 'clean_selection') {
    handleCleanGarbageSelection()
  } else if (command === 'clean_chapter') {
    handleCleanGarbageChapter()
  }
}

function handleContinueClick() {
  const targetWords = Number(editorStore.chapterTargetWords) || 0
  const currentWords = Number(contentWordCount.value) || 0
  if (targetWords > 0 && currentWords >= targetWords) {
    ElMessage.warning(t('editorPanel.chapterReachedTarget'))
    return
  }
  if (continueAllowWords.value <= 0) {
    ElMessage.warning(t('editorPanel.continueWordsNotEnough'))
    return
  }
  continuePromptText.value = ''
  continuePromptDialogVisible.value = true
}

async function confirmContinuePrompt() {
  const ed = editor.value
  if (!ed) {
    ElMessage.warning(t('editorPanel.editorNotReady'))
    return
  }
  const fullText = ed.getText() || ''
  const currentWords = getPlainTextWordCount(fullText)
  const previousInfo = await getPreviousChapterContextInfo()
  if (!previousInfo.hasPrevious && currentWords < MIN_CONTINUE_WORDS_WITHOUT_PREVIOUS) {
    ElMessage.warning(
      t('editorPanel.noContinuableContent', { min: MIN_CONTINUE_WORDS_WITHOUT_PREVIOUS })
    )
    return
  }

  let sourceText = fullText.trim()
  if (!sourceText) {
    if (previousInfo.contextText) {
      sourceText = previousInfo.contextText
      ElMessage.info(t('editorPanel.chapterEmptyUsePrevious'))
    } else {
      ElMessage.warning(
        t('editorPanel.noContinuableContent', { min: MIN_CONTINUE_WORDS_WITHOUT_PREVIOUS })
      )
      return
    }
  }

  const maxAddWords = continueAllowWords.value
  if (!maxAddWords || maxAddWords <= 0) {
    ElMessage.warning(t('editorPanel.continueWordsNotEnough'))
    return
  }
  continueLoading.value = true
  try {
    const res = await continueWriteWithAI({
      text: sourceText,
      prompt: continuePromptText.value,
      maxAddWords
    })
    if (!res?.success) {
      ElMessage.error(res?.message || t('editorPanel.continueFailed'))
      return
    }
    const content = (res.content || '').trim()
    if (!content) {
      ElMessage.error(t('editorPanel.continueEmpty'))
      return
    }
    // 兜底：若 AI 返回过长，仍展示结果；后续插入时会导致超限，但主约束已通过 maxAddWords 尽量控制
    continueResultText.value = content
    continuePromptDialogVisible.value = false
    continueResultDialogVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || t('editorPanel.continueRequestError'))
  } finally {
    continueLoading.value = false
  }
}

async function copyContinueText() {
  if (!continueResultText.value) return
  try {
    await navigator.clipboard.writeText(continueResultText.value)
    ElMessage.success(t('editorPanel.copiedToClipboard'))
  } catch {
    ElMessage.error(t('editorPanel.copyFailed'))
  }
}

function confirmContinueInsert() {
  const ed = editor.value
  const text = continueResultText.value
  if (!ed || !text) return

  const appendText = normalizeAppendText(text)
  if (!appendText) return

  // 追加到章节末尾：先聚焦到末尾，再插入纯文本（TipTap 会按换行分段）
  ed.chain().focus('end').insertContent(appendText).run()

  // 额外安全：若插入后已超过 120% 上限，这里不拦截（按需求“前置控制字数”）
  const targetWords = Number(editorStore.chapterTargetWords) || 0
  const maxTotal = Math.floor(targetWords * 1.2)
  const afterText = ed.getText()
  const afterWords = getPlainTextWordCount(afterText)
  if (maxTotal > 0 && afterWords > maxTotal) {
    ElMessage.warning(t('editorPanel.insertedButOverLimit', { max: maxTotal }))
  } else {
    ElMessage.success(t('editorPanel.insertedContinueContent'))
  }

  continueResultDialogVisible.value = false
  continueResultText.value = ''
}

/** 润色选中文本：根据当前选区获取范围与文本 */
async function handlePolishSelection() {
  const ed = editor.value
  if (!ed) {
    ElMessage.warning(t('editorPanel.editorNotReady'))
    return
  }
  const { state } = ed
  const { from, to } = state.selection
  if (from === to) {
    ElMessage.warning(t('editorPanel.selectTextToPolish'))
    return
  }
  const text = state.doc.textBetween(from, to, '\n')
  if (!text.trim()) {
    ElMessage.warning(t('editorPanel.selectedTextEmpty'))
    return
  }
  polishLoading.value = true
  try {
    const res = await polishTextWithAI(text)
    if (!res.success) {
      ElMessage.error(res.message || t('editorPanel.polishFailed'))
      return
    }
    polishMode.value = 'selection'
    polishOriginalText.value = text
    polishResultText.value = res.content || ''
    cleanupDiff.value = []
    polishReplaceFrom.value = from
    polishReplaceTo.value = to
    polishDialogVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || t('editorPanel.polishRequestError'))
  } finally {
    polishLoading.value = false
  }
}

/** AI 场景图：校验选区字数后打开场景图抽屉（图像服务在抽屉内选择） */
function handleAISceneImageClick() {
  const ed = editor.value
  if (!ed) {
    ElMessage.warning(t('editorPanel.editorNotReady'))
    return
  }
  const { state } = ed
  const { from, to } = state.selection
  if (from === to) {
    ElMessage.warning(t('editorPanel.selectTextToGenerateScene'))
    return
  }
  const text = state.doc.textBetween(from, to, '\n')
  if (!text.trim()) {
    ElMessage.warning(t('editorPanel.selectedTextEmptySimple'))
    return
  }
  const words = getPlainTextWordCount(text)
  if (words < SCENE_SELECTION_MIN_WORDS) {
    ElMessage.warning(
      t('editorPanel.sceneSelectionTooShort', { current: words, min: SCENE_SELECTION_MIN_WORDS })
    )
    return
  }
  if (words > SCENE_SELECTION_MAX_WORDS) {
    ElMessage.warning(
      t('editorPanel.sceneSelectionTooLong', { current: words, max: SCENE_SELECTION_MAX_WORDS })
    )
    return
  }
  const name = (props.bookName || '').trim()
  if (!name) {
    ElMessage.error(t('editorPanel.invalidBookName'))
    return
  }
  sceneExcerpt.value = text
  sceneDialogVisible.value = true
}

/** 润色整章 */
async function handlePolishChapter() {
  const ed = editor.value
  if (!ed) {
    ElMessage.warning(t('editorPanel.editorNotReady'))
    return
  }
  const fullText = ed.getText()
  if (!fullText || !fullText.trim()) {
    ElMessage.warning(t('editorPanel.chapterContentEmptyCannotPolish'))
    return
  }
  polishLoading.value = true
  try {
    const res = await polishTextWithAI(fullText)
    if (!res.success) {
      ElMessage.error(res.message || t('editorPanel.polishFailed'))
      return
    }
    polishMode.value = 'chapter'
    polishOriginalText.value = fullText
    polishResultText.value = res.content || ''
    cleanupDiff.value = []
    polishDialogVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || t('editorPanel.polishRequestError'))
  } finally {
    polishLoading.value = false
  }
}

/** 一键复制：将润色后的文本复制到剪贴板 */
async function copyPolishedText() {
  if (!polishResultText.value) return
  try {
    await navigator.clipboard.writeText(polishResultText.value)
    ElMessage.success(t('editorPanel.copiedToClipboard'))
  } catch {
    ElMessage.error(t('editorPanel.copyFailed'))
  }
}

/** 确认替换：根据 polishMode 替换选中文本或整章 */
async function confirmPolishReplace() {
  const ed = editor.value
  if (!ed || !polishResultText.value) return
  const sourceFilePath = polishSourceFilePath.value
  const sourceDocument = polishSourceDocument.value
  if (
    sourceFilePath &&
    (editorStore.file?.path !== sourceFilePath || ed.getText() !== sourceDocument)
  ) {
    ElMessage.warning('正文在 AI 处理期间已经变化，请重新发起操作')
    return
  }
  const originalLength = polishOriginalText.value.trim().length
  const resultLength = polishResultText.value.trim().length
  if (originalLength > 0 && resultLength < originalLength * 0.7) {
    try {
      await ElMessageBox.confirm(
        'AI 结果比原文短 30% 以上，可能误删正常内容。仍要替换吗？',
        '确认替换',
        {
          type: 'warning',
          confirmButtonText: '仍要替换',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }
  }
  if (cleanupDiff.value.length && editorStore.file?.type === 'chapter') {
    try {
      await createEditorSnapshot({
        bookId: props.bookName,
        chapterId: editorStore.file.path,
        chapterName: editorStore.file.name,
        contentBefore: ed.getHTML(),
        reason: 'ai_apply',
        name: 'AI 清理前备份'
      })
    } catch (error) {
      ElMessage.error(error?.message || '创建 AI 清理前备份失败')
      return
    }
  }
  if (
    sourceFilePath &&
    (editorStore.file?.path !== sourceFilePath || ed.getText() !== sourceDocument)
  ) {
    ElMessage.warning('创建备份期间正文已经变化，本次结果未应用')
    return
  }
  if (polishMode.value === 'selection') {
    ed.chain()
      .focus()
      .insertContentAt(
        { from: polishReplaceFrom.value, to: polishReplaceTo.value },
        polishResultText.value
      )
      .run()
    ElMessage.success(t('editorPanel.replacedWithPolishedText'))
  } else {
    const html = plainTextToEditorHtml(polishResultText.value)
    ed.chain().focus().setContent(html).run()
    ElMessage.success(t('editorPanel.replacedWholeChapterWithPolish'))
  }
  polishDialogVisible.value = false
  polishOriginalText.value = ''
  polishResultText.value = ''
  polishSourceDocument.value = ''
  polishSourceFilePath.value = ''
  cleanupDiff.value = []
}

function resetPolishResult() {
  polishOriginalText.value = ''
  polishResultText.value = ''
  polishSourceDocument.value = ''
  polishSourceFilePath.value = ''
  cleanupDiff.value = []
}

// 自动保存内容
async function autoSaveContent() {
  return saveFile(false)
}

// 加载人物数据
async function loadCharacters() {
  if (!props.bookName) return
  try {
    const data = await readCharactersDocument(props.bookName)
    characters.value = Array.isArray(data) ? data : []
  } catch (error) {
    console.error('加载人物数据失败:', error)
    characters.value = []
  }
}

// 清除所有人物高亮（不改变光标位置）
function clearCharacterHighlights() {
  updateTextHintDecorations({ characters: [] })
}

// 应用人物高亮（不改变光标位置）
function applyCharacterHighlights() {
  const hints =
    characterHighlightEnabled.value && editorStore.file?.type === 'chapter'
      ? characters.value
          .filter((item) => String(item?.name || '').trim())
          .map((item) => ({
            text: item.name.trim(),
            color: lightenHighlightColor(item.markerColor || defaultHighlightColor)
          }))
      : []
  updateTextHintDecorations({ characters: hints })
}

// 加载人物高亮开关状态（按书籍）
async function loadCharacterHighlightState(bookName) {
  if (!bookName) {
    characterHighlightEnabled.value = false
    // 清除高亮并停止定时器
    clearCharacterHighlights()
    stopCharacterHighlightTimer()
    return
  }

  try {
    const key = `characterHighlight_${bookName}`
    const savedState = await getStoreValue(key, false)
    // 如果该书籍有保存的状态，使用保存的状态；否则默认关闭
    const newState = savedState === true
    characterHighlightEnabled.value = newState

    // 如果状态是开启的，加载人物数据并应用高亮
    if (newState) {
      await loadCharacters()
      // 等待编辑器初始化完成后再应用高亮
      await nextTick()
      // 确保编辑器内容已经设置完成（检查文档是否有内容）
      if (editor.value && editorStore.file?.type === 'chapter') {
        // 等待内容渲染完成
        await nextTick()
        // 检查文档是否有内容，如果有内容则应用高亮
        const docSize = editor.value.state.doc.content.size
        if (docSize > 0) {
          applyCharacterHighlights()
          startCharacterHighlightTimer()
        }
      }
    } else {
      // 如果状态是关闭的，确保清除高亮并停止定时器
      clearCharacterHighlights()
      stopCharacterHighlightTimer()
    }
  } catch (error) {
    console.error('加载人物高亮状态失败:', error)
    characterHighlightEnabled.value = false
    clearCharacterHighlights()
    stopCharacterHighlightTimer()
  }
}

// 保存人物高亮开关状态（按书籍）
async function saveCharacterHighlightState(bookName, enabled) {
  if (!bookName) return

  try {
    const key = `characterHighlight_${bookName}`
    await setStoreValue(key, enabled)
  } catch (error) {
    console.error('保存人物高亮状态失败:', error)
  }
}

// 处理人物高亮开关变化
async function handleCharacterHighlightChange(enabled) {
  // 保存开关状态到当前书籍的设置中
  if (props.bookName) {
    await saveCharacterHighlightState(props.bookName, enabled)
  }

  if (enabled) {
    // 开启高亮：加载人物数据并应用高亮
    await loadCharacters()
    applyCharacterHighlights()
    // 启动定时器，定时检查并更新高亮
    startCharacterHighlightTimer()
  } else {
    // 关闭高亮：清除高亮并停止定时器
    clearCharacterHighlights()
    stopCharacterHighlightTimer()
  }
}

// 启动人物高亮定时器
function startCharacterHighlightTimer() {
  applyCharacterHighlights()
}

// 停止人物高亮定时器
function stopCharacterHighlightTimer() {
  return undefined
}

// 加载禁词数据
async function loadBannedWords() {
  if (!props.bookName) return
  try {
    bannedWords.value = await listBannedWords(props.bookName)
  } catch (error) {
    console.error('加载禁词数据失败:', error)
    bannedWords.value = []
  }
}

// 清除所有禁词划线（不改变光标位置）
function clearBannedWordsStrikes() {
  updateTextHintDecorations({ bannedWords: [] })
}

// 应用禁词划线（不改变光标位置）
function applyBannedWordsStrikes() {
  const hints =
    bannedWordsHintEnabled.value && editorStore.file?.type === 'chapter'
      ? bannedWords.value.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  updateTextHintDecorations({ bannedWords: hints })
}

function updateTextHintDecorations(patch = {}) {
  if (!editor.value?.commands?.setTextHints) return
  const current = {
    characters:
      characterHighlightEnabled.value && editorStore.file?.type === 'chapter'
        ? characters.value
            .filter((item) => String(item?.name || '').trim())
            .map((item) => ({
              text: item.name.trim(),
              color: lightenHighlightColor(item.markerColor || defaultHighlightColor)
            }))
        : [],
    bannedWords:
      bannedWordsHintEnabled.value && editorStore.file?.type === 'chapter'
        ? bannedWords.value.map((item) => String(item || '').trim()).filter(Boolean)
        : []
  }
  editor.value.commands.setTextHints({ ...current, ...patch })
}

// 加载禁词提示开关状态（按书籍）
async function loadBannedWordsHintState(bookName) {
  if (!bookName) {
    bannedWordsHintEnabled.value = false
    // 清除划线并停止定时器
    clearBannedWordsStrikes()
    stopBannedWordsHintTimer()
    return
  }

  try {
    const key = `bannedWordsHint_${bookName}`
    const savedState = await getStoreValue(key, false)
    // 如果该书籍有保存的状态，使用保存的状态；否则默认关闭
    const newState = savedState === true
    bannedWordsHintEnabled.value = newState

    // 如果状态是开启的，加载禁词数据并应用划线
    if (newState) {
      await loadBannedWords()
      // 等待编辑器初始化完成后再应用划线
      await nextTick()
      // 确保编辑器内容已经设置完成（检查文档是否有内容）
      if (editor.value && editorStore.file?.type === 'chapter') {
        // 等待内容渲染完成
        await nextTick()
        // 检查文档是否有内容，如果有内容则应用划线
        const docSize = editor.value.state.doc.content.size
        if (docSize > 0) {
          applyBannedWordsStrikes()
          startBannedWordsHintTimer()
        }
      }
    } else {
      // 如果状态是关闭的，确保清除划线并停止定时器
      clearBannedWordsStrikes()
      stopBannedWordsHintTimer()
    }
  } catch (error) {
    console.error('加载禁词提示状态失败:', error)
    bannedWordsHintEnabled.value = false
    clearBannedWordsStrikes()
    stopBannedWordsHintTimer()
  }
}

// 保存禁词提示开关状态（按书籍）
async function saveBannedWordsHintState(bookName, enabled) {
  if (!bookName) return

  try {
    const key = `bannedWordsHint_${bookName}`
    await setStoreValue(key, enabled)
  } catch (error) {
    console.error('保存禁词提示状态失败:', error)
  }
}

// 处理禁词提示开关变化
async function handleBannedWordsHintChange(enabled) {
  // 保存开关状态到当前书籍的设置中
  if (props.bookName) {
    await saveBannedWordsHintState(props.bookName, enabled)
  }

  if (enabled) {
    // 开启提示：加载禁词数据并应用划线
    await loadBannedWords()
    applyBannedWordsStrikes()
    // 启动定时器，定时检查并更新划线
    startBannedWordsHintTimer()
  } else {
    // 关闭提示：清除划线并停止定时器
    clearBannedWordsStrikes()
    stopBannedWordsHintTimer()
  }
}

// 启动禁词提示定时器
function startBannedWordsHintTimer() {
  applyBannedWordsStrikes()
}

// 停止禁词提示定时器
function stopBannedWordsHintTimer() {
  return undefined
}

/** keep-alive 从子页回到编辑器时恢复人物高亮/禁词定时器（停用阶段已停掉，避免后台空跑） */
function resumeChapterDecorationTimers() {
  if (!editor.value || editorStore.file?.type !== 'chapter') return
  const docSize = editor.value.state.doc.content.size
  if (docSize <= 0) return
  if (characterHighlightEnabled.value) {
    startCharacterHighlightTimer()
  }
  if (bannedWordsHintEnabled.value) {
    startBannedWordsHintTimer()
  }
}

const emit = defineEmits(['refresh-notes', 'refresh-chapters', 'toggle-left', 'toggle-right'])

// 监听当前文件类型，动态设置首行缩进和编辑器模式
watch(
  () => editorStore.file,
  async (file) => {
    if (editor.value) {
      const isChapter = file?.type === 'chapter'
      const style = document.querySelector('.tiptap')
      if (style) {
        style.style.textIndent = isChapter ? '2em' : '0'
      }

      // 如果切换到笔记模式，需要重新初始化编辑器以加载 NoteOutlineParagraph 扩展
      // 但这里我们已经在 onMounted 中根据文件类型加载了扩展
      // 所以只需要确保内容正确加载即可
    }
  },
  { immediate: true }
)

defineExpose({
  getEditorContentComponent,
  handlePolishCommand,
  handleContinueClick,
  handleAISceneImageClick,
  saveBeforeLeave: () => saveFile(false)
})
</script>

<style lang="scss" scoped>
.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-primary);
  color: var(--text-base);
  min-height: 0;
  overflow: hidden;
}
.chapter-title {
  padding: 8px 15px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  gap: 12px;
}
.chapter-title-input {
  font-size: 20px;
  font-weight: bold;
  flex: 1;
}
.character-highlight-switch,
.banned-words-hint-switch {
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .chapter-title {
    gap: 8px;
    padding: 8px 12px;
  }

  .chapter-title-input {
    min-width: 0;
  }

  .character-highlight-switch,
  .banned-words-hint-switch {
    display: none;
  }
}

/* 编辑区包裹层：用于固定右上角 AI 润色按钮 */
.editor-content-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-content {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg-primary);
  white-space: pre-wrap; // 保证Tab缩进和换行显示
  font-family: inherit, monospace;
}

:deep(.character-hint-decoration) {
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

:deep(.banned-word-decoration) {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: #c2413a;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

/* 编辑区右上角固定容器，保证按钮始终在编辑区右上角 */
.ai-polish-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

/* AI 润色按钮：默认半透明，悬停不透明 */
.ai-polish-btn {
  min-width: 100px;
  max-width: 132px;
  height: auto;
  justify-content: center;
  white-space: normal;
  line-height: 1.2;
  opacity: 0.45;
  transition: opacity 0.2s ease;
  &:hover {
    opacity: 1;
  }
}

.ai-continue-btn {
  min-width: 100px;
  max-width: 132px;
  height: auto;
  justify-content: center;
  white-space: normal;
  line-height: 1.2;
  opacity: 0.45;
  transition: opacity 0.2s ease;
  &:hover {
    opacity: 1;
  }
}

.ai-scene-btn {
  min-width: 100px;
  max-width: 152px;
  height: auto;
  justify-content: center;
  white-space: normal;
  line-height: 1.2;
  opacity: 0.45;
  transition: opacity 0.2s ease;
  &:hover {
    opacity: 1;
  }
}
.continue-words-tip {
  color: var(--el-text-color-regular);
  font-size: 12px;
}

.continue-result-body {
  min-height: 320px;
}
.continue-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.continue-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.continue-content {
  min-height: 320px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  background: var(--el-color-success-light-9);
  color: var(--el-text-color-primary);
}

/* AI 润色结果弹框：左右布局 */
.polish-dialog-body {
  display: flex;
  flex-direction: row;
  gap: 16px;
  min-height: 320px;
}
.polish-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.polish-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.polish-content {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  &.original {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
  }
  &.polished {
    background: var(--el-color-primary-light-9);
    color: var(--el-text-color-primary);
  }
}

::v-deep(.tiptap) {
  height: max-content;
  min-height: 100%;
  white-space: pre-wrap; // 保证Tab缩进和换行显示
  padding-bottom: 40px;
  // 字体、字号、行高、段落间距通过 updateEditorStyle 设置到根元素（--paragraph-spacing）

  &:focus {
    outline: none;
  }

  // 段落之间间距：由菜单栏「段落间距」控制，通过 CSS 变量 --paragraph-spacing 应用
  p {
    margin-bottom: var(--paragraph-spacing, 0);
  }

  // 加粗样式 - 确保在所有情况下都生效
  strong,
  b,
  [data-type='bold'] {
    font-weight: 700;
    font-style: normal;
  }

  // 倾斜样式 - 确保在所有情况下都生效
  em,
  i,
  [data-type='italic'] {
    font-style: italic;
    font-weight: inherit;
  }

  // 同时加粗和倾斜
  strong em,
  strong i,
  b em,
  b i,
  em strong,
  i strong,
  em b,
  i b {
    font-weight: 700;
    font-style: italic;
  }

  // 删除线样式 - 用于禁词提示
  s,
  strike,
  del,
  [data-type='strike'] {
    text-decoration: line-through;
    color: red;
  }

  // 搜索高亮样式 - 使用选择高亮
  ::selection {
    background-color: #409eff;
    color: white;
  }

  // // 搜索匹配文本的高亮样式（仅用于搜索功能，不使用 data-color）
  // .search-highlight:not([data-color]) {
  //   background-color: #ffeb3b !important;
  //   color: #000 !important;
  //   padding: 1px 2px;
  //   border-radius: 2px;
  //   border: 1px solid #f4d03f;
  // }

  // .search-highlight-current {
  //   background-color: #409eff !important;
  //   color: white !important;
  //   padding: 1px 2px;
  //   border-radius: 2px;
  //   box-shadow: 0 0 4px rgba(64, 158, 255, 0.5);
  // }

  // Tiptap highlight扩展的样式（支持多颜色）
  // 确保有 data-color 属性的 mark 元素使用 TipTap 扩展设置的颜色
  // TipTap 扩展会通过内联 style 设置 background-color，优先级高于类选择器
  // mark.search-highlight[data-color] {
  //   // padding: 1px 2px;
  //   // border-radius: 2px;
  //   // 移除强制背景色，让内联样式生效
  //   // background-color: unset !important;
  //   // 颜色由 TipTap 扩展通过 style 属性设置
  // }

  // 笔记大纲样式（段落间距与正文一致，使用 --paragraph-spacing）
  p[data-note-outline] {
    position: relative;
    margin-top: 6px;
    margin-bottom: var(--paragraph-spacing, 6px);
    // 缩进通过 renderHTML 中的 style 属性控制（padding-left: level * 24px）
    // 但需要为控制按钮留出空间
    min-height: 24px;
    line-height: 1.6;
    display: block;
    width: 100%;

    &:hover {
      .note-outline-controls {
        opacity: 1 !important;
        pointer-events: auto !important;
      }
    }
  }

  // 控制按钮容器（使用全局样式，因为是通过装饰器添加的）
  :global(.note-outline-controls) {
    position: absolute;
    left: -50px;
    top: 50%;
    transform: translateY(-50%);
    height: 20px;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
    z-index: 10;

    .note-outline-toggle {
      width: 16px;
      height: 16px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 10px;
      color: var(--text-base, #333);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 2px;
      transition: background-color 0.2s;
      flex-shrink: 0;

      &:hover {
        background-color: var(--bg-mute, rgba(0, 0, 0, 0.05));
      }
    }

    .note-outline-spacer {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .note-outline-drag-handle {
      width: 12px;
      height: 12px;
      cursor: grab !important;
      font-size: 10px;
      color: var(--text-mute, #999);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      user-select: none;
      flex-shrink: 0;
      pointer-events: auto !important;

      &:hover {
        cursor: grab !important;
        color: var(--text-base, #333);
      }

      &:active {
        cursor: grabbing !important;
      }
    }
  }

  // 当段落悬停时显示控制按钮
  p[data-note-outline]:hover ~ :global(.note-outline-controls),
  p[data-note-outline]:hover :global(.note-outline-controls) {
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  // 确保段落悬停时，控制按钮可以交互
  p[data-note-outline]:hover {
    :global(.note-outline-controls) {
      opacity: 1 !important;
      pointer-events: auto !important;

      .note-outline-drag-handle {
        pointer-events: auto !important;
        cursor: grab !important;
      }
    }
  }
}
:deep(.el-drawer__header) {
  margin-bottom: 0px;
  padding-bottom: 20px;
}
:deep(.el-drawer__body) {
  padding: 0px;
}
</style>

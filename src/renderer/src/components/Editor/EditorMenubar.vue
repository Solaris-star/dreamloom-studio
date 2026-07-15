<template>
  <div class="editor-menubar">
    <div
      class="panel-toggles"
      aria-label="面板缩放"
    >
      <el-tooltip
        :content="leftCollapsed ? '展开章节面板' : '收起章节面板'"
        placement="bottom"
        :show-after="200"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item panel-toggle-btn"
          data-testid="editor-toggle-chapter-panel"
          :type="leftCollapsed ? 'primary' : 'default'"
          :aria-label="leftCollapsed ? '展开章节面板' : '收起章节面板'"
          :aria-pressed="!leftCollapsed"
          @click="emit('toggle-left')"
        >
          <PanelLeftOpen
            v-if="leftCollapsed"
            :size="15"
          />
          <PanelLeftClose
            v-else
            :size="15"
          />
          <span class="panel-toggle-label">目录</span>
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="rightCollapsed ? '展开 AI 助手' : '收起 AI 助手'"
        placement="bottom"
        :show-after="200"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item panel-toggle-btn"
          data-testid="editor-toggle-ai-panel"
          :type="rightCollapsed ? 'primary' : 'default'"
          :aria-label="rightCollapsed ? '展开 AI 助手' : '收起 AI 助手'"
          :aria-pressed="!rightCollapsed"
          @click="emit('toggle-right')"
        >
          <PanelRightOpen
            v-if="rightCollapsed"
            :size="15"
          />
          <PanelRightClose
            v-else
            :size="15"
          />
          <span class="panel-toggle-label">AI</span>
        </el-button>
      </el-tooltip>
    </div>
    <div class="toolbar-left">
      <el-tooltip
        :content="t('editorMenubar.font')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          v-model="fontFamily"
          class="toolbar-item toolbar-primary"
          data-testid="editor-font-family"
          aria-label="字体"
          size="small"
          style="width: 82px"
        >
          <el-option
            label="宋体"
            value="SimSun"
          />
          <el-option
            label="黑体"
            value="SimHei"
          />
          <el-option
            label="楷体"
            value="KaiTi"
          />
          <el-option
            label="仿宋"
            value="FangSong"
          />
          <el-option
            label="思源黑体"
            value="SourceHanSans"
          />
          <el-option
            label="思源宋体"
            value="SourceHanSerif"
          />
          <el-option
            label="苹方"
            value="PingFang"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        v-if="isNoteEditor"
        :content="t('editorMenubar.heading')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          :model-value="headingLevel"
          class="toolbar-item toolbar-secondary"
          data-testid="editor-heading"
          aria-label="标题级别"
          size="small"
          style="width: 70px"
          @change="handleHeadingChange"
        >
          <el-option
            :label="t('editorMenubar.body')"
            value="0"
          />
          <el-option
            :label="t('editorMenubar.heading1')"
            value="1"
          />
          <el-option
            :label="t('editorMenubar.heading2')"
            value="2"
          />
          <el-option
            :label="t('editorMenubar.heading3')"
            value="3"
          />
          <el-option
            :label="t('editorMenubar.heading4')"
            value="4"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.fontSize')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          v-model="fontSize"
          class="toolbar-item toolbar-primary"
          data-testid="editor-font-size"
          aria-label="字号"
          size="small"
          style="width: 62px"
        >
          <el-option
            label="12px"
            value="12px"
          />
          <el-option
            label="13px"
            value="13px"
          />
          <el-option
            label="14px"
            value="14px"
          />
          <el-option
            label="15px"
            value="15px"
          />
          <el-option
            label="16px"
            value="16px"
          />
          <el-option
            label="18px"
            value="18px"
          />
          <el-option
            label="20px"
            value="20px"
          />
          <el-option
            label="22px"
            value="22px"
          />
          <el-option
            label="24px"
            value="24px"
          />
          <el-option
            label="26px"
            value="26px"
          />
          <el-option
            label="28px"
            value="28px"
          />
          <el-option
            label="30px"
            value="30px"
          />
          <el-option
            label="32px"
            value="32px"
          />
          <el-option
            label="34px"
            value="34px"
          />
          <el-option
            label="36px"
            value="36px"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.lineHeight')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          v-model="lineHeight"
          class="toolbar-item toolbar-primary"
          data-testid="editor-line-height"
          aria-label="行距"
          size="small"
          style="width: 50px"
        >
          <el-option
            label="1.4"
            value="1.4"
          />
          <el-option
            label="1.6"
            value="1.6"
          />
          <el-option
            label="1.8"
            value="1.8"
          />
          <el-option
            label="2"
            value="2"
          />
          <el-option
            label="2.2"
            value="2.2"
          />
          <el-option
            label="2.4"
            value="2.4"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.paragraphSpacing')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          v-model="paragraphSpacing"
          class="toolbar-item toolbar-secondary"
          data-testid="editor-paragraph-spacing"
          aria-label="段落间距"
          size="small"
          style="width: 60px"
        >
          <el-option
            :label="t('editorMenubar.none')"
            value="0"
          />
          <el-option
            label="0.25"
            value="0.25em"
          />
          <el-option
            label="0.5"
            value="0.5em"
          />
          <el-option
            label="0.75"
            value="0.75em"
          />
          <el-option
            label="1"
            value="1em"
          />
          <el-option
            label="1.5"
            value="1.5em"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        content="页边距/页宽"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-select
          v-model="pageWidth"
          class="toolbar-item toolbar-secondary"
          data-testid="editor-page-width"
          aria-label="页宽"
          size="small"
          style="width: 105px"
        >
          <el-option
            label="自适应 (极宽)"
            value="100%"
          />
          <el-option
            label="自适应 (宽)"
            value="90%"
          />
          <el-option
            label="自适应 (中)"
            value="80%"
          />
          <el-option
            label="自适应 (窄)"
            value="70%"
          />
        </el-select>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.bold')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          class="toolbar-item toolbar-primary"
          data-testid="editor-bold"
          aria-label="加粗"
          size="small"
          :type="isBold ? 'primary' : 'default'"
          @click="handleToggleBold"
        >
          <b>B</b>
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.italic')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          class="toolbar-item toolbar-primary"
          data-testid="editor-italic"
          aria-label="倾斜"
          :type="isItalic ? 'primary' : 'default'"
          size="small"
          @click="handleToggleItalic"
        >
          <i>I</i>
        </el-button>
      </el-tooltip>
      <el-popover
        v-if="isNoteEditor"
        v-model:visible="highlightPopoverVisible"
        placement="bottom"
        :width="230"
        trigger="click"
        popper-style="padding: 6px;"
      >
        <template #reference>
          <el-button
            size="small"
            class="toolbar-item toolbar-secondary"
            data-testid="editor-highlight"
            :title="t('editorMenubar.highlight')"
            :aria-label="t('editorMenubar.highlight')"
            :type="isHighlight ? 'primary' : 'default'"
          >
            <SvgIcon
              name="highlight"
              :size="12"
            />
          </el-button>
        </template>
        <div class="highlight-color-picker">
          <div class="highlight-colors">
            <div
              v-for="color in highlightColors"
              :key="color.value"
              class="highlight-color-item"
              :class="{ active: isHighlightColorActive(color.value) }"
              :title="color.label"
              @click="applyHighlight(color.value)"
            >
              <div
                :style="{ backgroundColor: color.value }"
                class="hightlight-color-item-main"
              />
            </div>
            <div class="highlight-color-split" />
            <div
              :class="{ active: !isHighlight }"
              class="highlight-color-item highlight-color-none"
              :title="t('editorMenubar.noHighlight')"
            >
              <SvgIcon
                class="hightlight-color-item-main"
                :size="20"
                name="ban"
                @click="removeHighlight"
              />
            </div>
          </div>
        </div>
      </el-popover>
      <el-tooltip
        v-if="!isNoteEditor"
        :content="t('editorMenubar.oneClickFormat')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-secondary"
          data-testid="editor-format"
          :aria-label="t('editorMenubar.oneClickFormat')"
          @click="handleFormatContent"
        >
          <el-icon><Tickets /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.undo')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-primary"
          data-testid="editor-undo"
          :aria-label="t('editorMenubar.undo')"
          :disabled="!canUndo"
          @click="handleUndo"
        >
          <Undo :size="12" />
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.redo')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-primary"
          data-testid="editor-redo"
          :aria-label="t('editorMenubar.redo')"
          :disabled="!canRedo"
          @click="handleRedo"
        >
          <Redo :size="12" />
        </el-button>
      </el-tooltip>
      <el-dropdown
        split-button
        size="small"
        class="copy-menu toolbar-secondary"
        data-testid="editor-copy"
        @click="handleCopyContent"
      >
        <el-tooltip
          :content="t('editorMenubar.copyPlainText')"
          placement="bottom"
          :show-after="TOOLTIP_SHOW_AFTER"
          :disabled="isMobileViewport"
        >
          <el-icon><DocumentCopy /></el-icon>
        </el-tooltip>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleCopyContent">
              {{ t('editorMenubar.copyPlainText') }}
            </el-dropdown-item>
            <el-dropdown-item @click="handleCopyRichContent">
              {{ t('editorMenubar.copyRichText') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip
        :content="t('editorMenubar.search')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-primary"
          data-testid="editor-search"
          :aria-label="t('editorMenubar.search')"
          @click="handleToggleSearchPanel"
        >
          <el-icon><Search /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
    <div class="toolbar-right">
      <el-tooltip
        content="配色"
        placement="bottom"
        :show-after="200"
        :disabled="isMobileViewport"
      >
        <el-dropdown
          trigger="click"
          @command="handleThemeChange"
        >
          <el-button
            size="small"
            class="toolbar-item theme-switcher-btn toolbar-primary"
            data-testid="editor-theme"
            aria-label="主题"
          >
            <Palette :size="14" />
            <span class="theme-switcher-label">{{ currentThemeName }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="theme-switcher-menu">
              <el-dropdown-item
                v-for="theme in availableThemes"
                :key="theme.key"
                :command="theme.key"
                :class="{ 'is-active-theme': themeStore.currentTheme === theme.key }"
              >
                <span
                  class="theme-swatch"
                  :style="{ background: theme.preview }"
                />
                <span>{{ theme.name }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-tooltip>
      <el-tooltip
        :content="t('editorMenubar.save')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-primary"
          data-testid="editor-save"
          :aria-label="t('editorMenubar.save')"
          @click="handleSave"
        >
          <SvgIcon
            name="save"
            :size="12"
          />
        </el-button>
      </el-tooltip>
      <el-tooltip
        v-if="!isNoteEditor"
        :content="t('editorMenubar.export')"
        placement="bottom"
        :show-after="TOOLTIP_SHOW_AFTER"
        :disabled="isMobileViewport"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-secondary"
          data-testid="editor-export"
          :aria-label="t('editorMenubar.export')"
          @click="handleExport"
        >
          <SvgIcon
            name="export"
            :size="12"
          />
        </el-button>
      </el-tooltip>
      <el-dropdown
        class="toolbar-more"
        trigger="click"
        :teleported="true"
      >
        <el-button
          size="small"
          class="toolbar-item toolbar-more-btn"
          data-testid="editor-more-menu"
          aria-label="更多编辑操作"
        >
          <MoreHorizontal :size="14" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu class="toolbar-more-menu">
            <el-dropdown-item @click="paragraphSpacing = '1em'">
              段落间距 1
            </el-dropdown-item>
            <el-dropdown-item @click="pageWidth = '80%'">
              页宽 自适应 (中)
            </el-dropdown-item>
            <el-dropdown-item
              v-if="!isNoteEditor"
              divided
              @click="handleFormatContent"
            >
              {{ t('editorMenubar.oneClickFormat') }}
            </el-dropdown-item>
            <el-dropdown-item
              v-if="!isNoteEditor"
              @click="handleExport"
            >
              {{ t('editorMenubar.export') }}
            </el-dropdown-item>
            <el-dropdown-item
              divided
              @click="handleCopyContent"
            >
              {{ t('editorMenubar.copyPlainText') }}
            </el-dropdown-item>
            <el-dropdown-item @click="handleCopyRichContent">
              {{ t('editorMenubar.copyRichText') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { DocumentCopy, Search, Tickets } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Redo, Undo, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Palette, MoreHorizontal } from 'lucide-vue-next'
import dayjs from 'dayjs'
import { useEditorStore } from '@renderer/stores/editor'
import { useThemeStore } from '@renderer/stores/theme'
import SvgIcon from '@renderer/components/SvgIcon.vue'
import { buildBookTextExport, downloadBookTextExport } from '@renderer/service/editorExport'
import {
  getEditorCopyHtml,
  getEditorCopyText,
  writePlainTextToClipboard,
  writeRichTextToClipboard
} from '@renderer/service/editorClipboard'
import { toggleEditorSelectionMark } from '@renderer/service/editorSelectionFormat'

const TOOLTIP_SHOW_AFTER = 2000
const MOBILE_BREAKPOINT = 767
const isMobileViewport = ref(false)

function updateMobileViewport() {
  if (typeof window === 'undefined') return
  isMobileViewport.value = window.innerWidth <= MOBILE_BREAKPOINT
}

onMounted(() => {
  updateMobileViewport()
  window.addEventListener('resize', updateMobileViewport)
})

const { t } = useI18n()

const props = defineProps({
  editor: {
    type: Object,
    default: null
  },
  bookName: {
    type: String,
    default: ''
  },
  modelValue: {
    type: Object,
    default: () => ({
      fontFamily: 'SimHei',
      fontSize: '16px',
      lineHeight: '1.6',
      paragraphSpacing: '0.5em',
      isBold: false,
      isItalic: false
    })
  },
  leftCollapsed: {
    type: Boolean,
    default: false
  },
  rightCollapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'toggle-search',
  'save',
  'export',
  'update-style',
  'toggle-left',
  'toggle-right'
])

const editorStore = useEditorStore()

// 判断是否为笔记编辑器
const isNoteEditor = computed(() => editorStore.file?.type === 'note')

/**
 * 撤销/回退按钮依赖编辑器内部 history 状态，而 TipTap editor 的 state 不是 Vue 响应式数据，
 * 仅用 computed(() => editor.can().undo()) 不会在输入、撤销、换章等 transaction 后重新求值，导致按钮状态滞后或一直不变。
 * 通过监听 editor 的 transaction 事件，驱动一次“刻度”更新，让下面两个 computed 在每次事务后重新计算。
 */
const historyStateTick = ref(0)
let currentEditor = null
let transactionHandler = null
watch(
  () => props.editor,
  (ed) => {
    if (currentEditor && transactionHandler && typeof currentEditor.off === 'function') {
      currentEditor.off('transaction', transactionHandler)
      currentEditor = null
      transactionHandler = null
    }
    if (ed && typeof ed.on === 'function') {
      currentEditor = ed
      transactionHandler = () => {
        historyStateTick.value += 1
      }
      ed.on('transaction', transactionHandler)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateMobileViewport)
  }
  if (currentEditor && transactionHandler && typeof currentEditor.off === 'function') {
    currentEditor.off('transaction', transactionHandler)
  }
})

// 检查是否可以撤销（依赖 historyStateTick 以便在每次 transaction 后更新）
const canUndo = computed(() => {
  if (!props.editor) return false
  historyStateTick.value // 依赖刻度，使输入/撤销/换章等后重新求值
  return props.editor.can().undo()
})

// 检查是否可以回退（同上）
const canRedo = computed(() => {
  if (!props.editor) return false
  historyStateTick.value
  return props.editor.can().redo()
})

// 使用 computed 来双向绑定
const fontFamily = computed({
  get: () => props.modelValue.fontFamily,
  set: (val) => {
    emit('update:modelValue', { ...props.modelValue, fontFamily: val })
    emit('update-style')
  }
})

const fontSize = computed({
  get: () => props.modelValue.fontSize,
  set: (val) => {
    emit('update:modelValue', { ...props.modelValue, fontSize: val })
    emit('update-style')
  }
})

const lineHeight = computed({
  get: () => props.modelValue.lineHeight,
  set: (val) => {
    emit('update:modelValue', { ...props.modelValue, lineHeight: val })
    emit('update-style')
  }
})

const paragraphSpacing = computed({
  get: () => props.modelValue.paragraphSpacing ?? '0.5em',
  set: (val) => {
    emit('update:modelValue', { ...props.modelValue, paragraphSpacing: val })
    emit('update-style')
  }
})

const pageWidth = computed({
  get: () => props.modelValue.pageWidth ?? '80%',
  set: (val) => {
    emit('update:modelValue', { ...props.modelValue, pageWidth: val })
    emit('update-style')
  }
})

const isBold = computed(() => {
  historyStateTick.value
  return props.editor?.isActive('bold') || false
})

const isItalic = computed(() => {
  historyStateTick.value
  return props.editor?.isActive('italic') || false
})

// 高亮状态（仅笔记编辑器）
const isHighlight = computed(() => {
  if (!props.editor) return false
  const isNoteEditor = editorStore.file?.type === 'note'
  if (isNoteEditor) {
    // 笔记编辑器：根据当前选中文本的格式
    return props.editor.isActive('highlight')
  }
  return false
})

// 当前选中的标题级别
const headingLevel = computed(() => {
  if (!props.editor) return '0'
  // 检查当前是否在 heading 节点中
  if (props.editor.isActive('heading')) {
    const level = props.editor.getAttributes('heading').level
    return String(level || 1)
  }
  return '0' // 正文/段落
})

function toggleFormat(markType) {
  toggleEditorSelectionMark(props.editor, markType)
}

function handleToggleBold() {
  toggleFormat('bold')
}

function handleToggleItalic() {
  toggleFormat('italic')
}

// 高亮颜色选择器显示状态
const highlightPopoverVisible = ref(false)

// 高亮颜色选项（5个浅色、亮色）
const highlightColors = [
  { value: '#ffeb3b', label: t('editorMenubar.colorYellow') },
  { value: '#a8e6cf', label: t('editorMenubar.colorGreen') },
  { value: '#a8c8ec', label: t('editorMenubar.colorBlue') },
  { value: '#ffb3ba', label: t('editorMenubar.colorPink') },
  { value: '#dda0dd', label: t('editorMenubar.colorPurple') }
]

// 检查当前高亮是否使用指定颜色
function isHighlightColorActive(color) {
  if (!props.editor || !isHighlight.value) return false
  const attrs = props.editor.getAttributes('highlight')
  // 如果没有 color 属性，默认是黄色
  const currentColor = attrs.color || '#ffeb3b'
  return currentColor === color
}

// 应用高亮颜色
function applyHighlight(color) {
  if (!props.editor) return
  const isNoteEditor = editorStore.file?.type === 'note'
  if (isNoteEditor) {
    // 使用 setHighlight 确保应用正确的颜色
    props.editor.chain().focus().setHighlight({ color }).run()
    highlightPopoverVisible.value = false
  }
}

// 移除高亮
function removeHighlight() {
  if (!props.editor) return
  const isNoteEditor = editorStore.file?.type === 'note'
  if (isNoteEditor) {
    props.editor.chain().focus().unsetHighlight().run()
    highlightPopoverVisible.value = false
  }
}

function handleHeadingChange(level) {
  if (!props.editor) return
  const levelNum = parseInt(level, 10)

  if (levelNum === 0) {
    // 切换回段落
    if (isNoteEditor.value) {
      // 笔记编辑器：使用 noteOutlineParagraph（没有 paragraph 节点类型）
      // setNode 会自动处理当前节点类型，无需手动查找
      props.editor.chain().focus().setNode('noteOutlineParagraph', { level: 0 }).run()
    } else {
      // 章节编辑器：使用 paragraph
      props.editor.commands.setParagraph()
    }
  } else {
    // 设置为对应的标题级别
    if (isNoteEditor.value) {
      // 笔记编辑器：使用 setHeading 而不是 toggleHeading
      // toggleHeading 内部会调用 toggleNode(this.name, 'paragraph')，导致报错
      // setHeading 只是简单地调用 setNode，更安全
      props.editor.commands.setHeading({ level: levelNum })
    } else {
      // 章节编辑器：使用 toggleHeading（可以正常切换 heading 和 paragraph）
      props.editor.commands.toggleHeading({ level: levelNum })
    }
  }
}

// 一键排版功能（仅章节编辑器）
function handleFormatContent() {
  if (!props.editor) return

  try {
    // 获取当前文本内容
    const text = props.editor.getText()

    // 执行排版处理
    const formattedText = formatText(text)

    // 将排版后的文本设置回编辑器
    // 章节编辑器使用纯文本格式，需要通过 HTML 转换
    const formattedHtml = plainTextToHtml(formattedText)

    // 保存当前光标位置
    const { from } = props.editor.state.selection

    // 设置新内容
    props.editor.commands.setContent(formattedHtml)

    // 恢复光标位置（如果可能）
    const newDocSize = props.editor.state.doc.content.size
    if (newDocSize > 0) {
      const newPosition = Math.min(from, newDocSize - 1)
      props.editor.commands.setTextSelection(newPosition)
    }

    ElMessage.success(t('editorMenubar.formatDone'))
  } catch (error) {
    console.error('排版失败:', error)
    ElMessage.error(
      t('editorMenubar.formatFailed', { reason: error.message || t('common.unknownError') })
    )
  }
}

// 文本排版处理函数
function formatText(text) {
  if (!text) return ''

  // 1. 按行分割
  const lines = text.split('\n')

  // 2. 处理每一行
  const processedLines = lines.map((line) => {
    // 清理行首行尾空格
    return line.trim()
  })

  // 3. 合并连续空行（最多保留一个空行）
  const mergedLines = []
  let lastWasEmpty = false

  for (const line of processedLines) {
    if (line === '') {
      // 如果是空行，且上一个不是空行，则添加
      if (!lastWasEmpty) {
        mergedLines.push('')
        lastWasEmpty = true
      }
    } else {
      mergedLines.push(line)
      lastWasEmpty = false
    }
  }

  // 4. 清理开头和结尾的空行
  while (mergedLines.length > 0 && mergedLines[0] === '') {
    mergedLines.shift()
  }
  while (mergedLines.length > 0 && mergedLines[mergedLines.length - 1] === '') {
    mergedLines.pop()
  }

  // 5. 合并为文本
  return mergedLines.join('\n')
}

// 将纯文本转换为 HTML（用于章节模式）
function plainTextToHtml(text) {
  if (!text) return ''
  // 1. 按行分割
  const lines = text.split('\n')
  // 2. 每行处理缩进和空格
  const htmlLines = lines.map((line) => {
    // 替换Tab为8个&nbsp;
    let html = line.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
    // 替换连续空格为 &nbsp;
    html = html.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
    // 包裹为<p>
    return html ? `<p>${html}</p>` : ''
  })
  // 3. 拼接
  return htmlLines.join('')
}

async function handleCopyContent() {
  if (!props.editor) return
  try {
    await writePlainTextToClipboard(getEditorCopyText(props.editor.state))
    ElMessage.success(t('editorMenubar.copiedContent'))
  } catch (error) {
    ElMessage.error(error?.message || t('editorMenubar.copyFailed'))
  }
}

async function handleCopyRichContent() {
  if (!props.editor) return
  try {
    await writeRichTextToClipboard({
      text: getEditorCopyText(props.editor.state),
      html: getEditorCopyHtml(props.editor)
    })
    ElMessage.success(t('editorMenubar.copiedRichContent'))
  } catch (error) {
    ElMessage.error(error?.message || t('editorMenubar.copyFailed'))
  }
}

function handleToggleSearchPanel() {
  emit('toggle-search')
}

// 撤销操作
function handleUndo() {
  if (!props.editor || !canUndo.value) return
  props.editor.commands.undo()
}

// 回退操作
function handleRedo() {
  if (!props.editor || !canRedo.value) return
  props.editor.commands.redo()
}

function handleSave() {
  emit('save')
}

// 导出书籍全部内容
async function handleExport() {
  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
      t('editorMenubar.exportConfirmContent'),
      t('editorMenubar.exportConfirmTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    // 生成时间戳：YYMMDDHHmm（例如：2511041729 表示 2025年11月04日17点29分）
    const timestamp = dayjs().format('YYMMDDHHmm')

    // 显示加载提示
    const loadingMessage = ElMessage({
      message: t('editorMenubar.exporting'),
      type: 'info',
      duration: 0,
      showClose: false
    })

    try {
      const { content, totalChapters, failedChapters } = await buildBookTextExport(props.bookName)

      if (totalChapters === 0) {
        loadingMessage.close()
        ElMessage.warning(t('editorMenubar.noExportableContent'))
        return
      }

      downloadBookTextExport(props.bookName, timestamp, content)

      loadingMessage.close()
      if (failedChapters.length > 0) {
        ElMessage.warning(`已导出 ${totalChapters} 章，另有 ${failedChapters.length} 章读取失败`)
      } else {
        ElMessage.success(t('editorMenubar.exportSuccess', { count: totalChapters }))
      }
      emit('export', { success: true, totalChapters, failedChapters })
    } catch (error) {
      loadingMessage.close()
      console.error('导出失败:', error)
      ElMessage.error(
        t('editorMenubar.exportFailed', { reason: error.message || t('common.unknownError') })
      )
      emit('export', { success: false, error })
    }
  } catch (error) {
    // 用户取消了确认对话框
    if (error !== 'cancel') {
      console.error('导出操作失败:', error)
      ElMessage.error(
        t('editorMenubar.exportActionFailed', { reason: error.message || t('common.unknownError') })
      )
      emit('export', { success: false, error })
    }
  }
}

</script>

<style lang="scss" scoped>
.editor-menubar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 15px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-soft);
  flex-wrap: nowrap;
  min-width: 0;

  .panel-toggles,
  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .toolbar-left {
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  .panel-toggles {
    padding-right: 8px;
    margin-right: 2px;
    border-right: 1px solid var(--border-color);
  }

  .el-button--small {
    padding: 5px 8px;
    min-width: 24px;
  }
}
.toolbar-item {
  margin: 0;
}

.panel-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 600;
}

.panel-toggle-label {
  font-size: 12px;
  line-height: 1;
}


.theme-switcher-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.theme-switcher-label {
  font-size: 12px;
  line-height: 1;
  max-width: 3.5em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  border-radius: 50%;
  border: 1px solid var(--border-color, #d0d0d0);
  vertical-align: middle;
}

:deep(.theme-switcher-menu .is-active-theme) {
  color: var(--el-color-primary);
  font-weight: 600;
}

.toolbar-more {
  display: none;
}

@media (max-width: 900px) {
  .editor-menubar {
    .panel-toggle-label,
    .theme-switcher-label {
      display: none;
    }
  }
}

@media (max-width: 767px) {
  .editor-menubar {
    justify-content: flex-start;
    gap: 6px;
    padding: 6px 10px;
    overflow-x: hidden;

    .panel-toggles {
      padding-right: 6px;
      margin-right: 0;
    }

    .toolbar-left {
      flex: 1 1 auto;
      min-width: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .toolbar-right {
      flex-shrink: 0;
    }

    .panel-toggle-label,
    .theme-switcher-label {
      display: none;
    }

    .toolbar-secondary {
      display: none !important;
    }

    .toolbar-more {
      display: inline-flex;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .highlight-color-item {
    transition: none !important;
  }

  .highlight-color-item:hover {
    transform: none;
  }
}

.highlight-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.highlight-color-item {
  padding: 5px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;

  .hightlight-color-item-main {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
  }

  &:hover {
    transform: scale(1.15);
    background: #e3e3e3;
    .hightlight-color-item-main {
      border-color: var(--el-color-primary);
    }
  }

  &.active {
    background: #e3e3e3;
    .hightlight-color-item-main {
      border-color: var(--el-color-primary);
    }
  }

  &.highlight-color-none {
    .hightlight-color-item-main {
      border-color: transparent;
      &:hover,
      &.active {
        border-color: transparent;
      }
    }
  }
}

.highlight-color-split {
  width: 1px;
  height: 15px;
  background: #999;
}
</style>

# 🚀 TipTap 富文本编辑器在小说写作中的应用实践

> 💡 本文详细介绍如何在 Electron + Vue 3 项目中集成 TipTap 富文本编辑器，实现专业的写作体验，包括自定义扩展、实时统计、自动保存等核心功能。

## 📋 目录

- [项目背景](#项目背景)
- [TipTap 技术架构](#tiptap-技术架构)
- [核心功能实现](#核心功能实现)
- [自定义扩展开发](#自定义扩展开发)
- [性能优化策略](#性能优化策略)
- [用户体验优化](#用户体验优化)
- [总结与展望](#总结与展望)

## 🎯 项目背景

在开发 织梦书房 小说写作软件时，我们需要一个功能强大、可扩展性强的富文本编辑器。经过技术选型对比，最终选择了基于 ProseMirror 的 TipTap 编辑器，它提供了：

- 🎨 **丰富的编辑功能**: 支持粗体、斜体、对齐等基础格式
- 🔧 **高度可扩展**: 支持自定义扩展和插件
- ⚡ **优秀的性能**: 基于 ProseMirror 的高性能架构
- 🎯 **Vue 3 集成**: 原生支持 Vue 3 Composition API

![编辑器界面](static/editor.png)

_专业的写作编辑器界面 - 基于 TipTap 的富文本编辑器_

## 🏗️ TipTap 技术架构

### 技术栈选择

```javascript
// package.json 依赖
{
  "@tiptap/vue-3": "^2.12.0",
  "@tiptap/starter-kit": "^2.12.0",
  "@tiptap/extension-bold": "^2.12.0",
  "@tiptap/extension-italic": "^2.12.0",
  "@tiptap/extension-text-align": "^2.12.0"
}
```

### 核心架构设计

```javascript
// src/renderer/src/components/EditorPanel.vue
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import TextAlign from '@tiptap/extension-text-align'

const editor = new Editor({
  extensions: [
    StarterKit,
    Bold,
    Italic,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TabInsert, // 自定义 Tab 键扩展
    Collapsible // 自定义折叠扩展
  ],
  content: editorStore.content,
  editorProps: {
    attributes: {
      style: () =>
        `font-family: ${fontFamily.value}; font-size: ${fontSize.value}; line-height: ${lineHeight.value}; text-align: ${align.value}; white-space: pre-wrap;`
    }
  },
  onUpdate: ({ editor }) => {
    const content = editor.getText()
    editorStore.setContent(content)
    // 防抖自动保存
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      autoSaveContent()
    }, 1000)
  }
})
```

## 🔧 核心功能实现

### 1. 编辑器初始化与配置

```javascript
// 编辑器配置
const editorConfig = {
  extensions: [
    StarterKit,
    Bold,
    Italic,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TabInsert,
    Collapsible
  ],
  content: editorStore.content,
  editorProps: {
    attributes: {
      style: () => getEditorStyle()
    }
  },
  onUpdate: handleContentUpdate,
  onFocus: handleEditorFocus,
  onBlur: handleEditorBlur
}

// 获取编辑器样式
function getEditorStyle() {
  return `
    font-family: ${fontFamily.value}; 
    font-size: ${fontSize.value}; 
    line-height: ${lineHeight.value}; 
    text-align: ${align.value}; 
    white-space: pre-wrap;
    padding: 20px;
    min-height: 500px;
    outline: none;
  `
}
```

### 2. 工具栏功能实现

```vue
<template>
  <div class="editor-toolbar">
    <!-- 字体选择 -->
    <el-select v-model="fontFamily" class="toolbar-item" size="small">
      <el-option label="默认" value="inherit" />
      <el-option label="宋体" value="SimSun" />
      <el-option label="微软雅黑" value="Microsoft YaHei" />
      <el-option label="楷体" value="KaiTi" />
      <el-option label="黑体" value="SimHei" />
    </el-select>

    <!-- 字号选择 -->
    <el-select v-model="fontSize" class="toolbar-item" size="small">
      <el-option label="12px" value="12px" />
      <el-option label="14px" value="14px" />
      <el-option label="16px" value="16px" />
      <el-option label="18px" value="18px" />
      <el-option label="20px" value="20px" />
    </el-select>

    <!-- 行高选择 -->
    <el-select v-model="lineHeight" class="toolbar-item" size="small">
      <el-option label="1.2" value="1.2" />
      <el-option label="1.4" value="1.4" />
      <el-option label="1.6" value="1.6" />
      <el-option label="1.8" value="1.8" />
      <el-option label="2.0" value="2" />
    </el-select>

    <!-- 格式按钮 -->
    <el-button
      class="toolbar-item"
      size="small"
      :type="isBold ? 'primary' : 'default'"
      @click="toggleBold"
    >
      <b>B</b>
    </el-button>
    <el-button
      class="toolbar-item"
      size="small"
      :type="isItalic ? 'primary' : 'default'"
      @click="toggleItalic"
    >
      <i>I</i>
    </el-button>

    <!-- 操作按钮 -->
    <el-button size="small" class="toolbar-item" @click="copyContent">
      <el-icon><DocumentCopy /></el-icon>
    </el-button>
    <el-button size="small" class="toolbar-item" type="primary" @click="saveContent">
      保存
    </el-button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { DocumentCopy } from '@element-plus/icons-vue'

const fontFamily = ref('inherit')
const fontSize = ref('16px')
const lineHeight = ref('1.6')
const align = ref('left')

// 格式状态
const isBold = computed(() => editor.value?.isActive('bold'))
const isItalic = computed(() => editor.value?.isActive('italic'))

// 切换格式
function toggleBold() {
  editor.value?.chain().focus().toggleBold().run()
}

function toggleItalic() {
  editor.value?.chain().focus().toggleItalic().run()
}

// 复制内容
function copyContent() {
  const content = editor.value?.getText()
  if (content) {
    navigator.clipboard.writeText(content)
    ElMessage.success('内容已复制到剪贴板')
  }
}
</script>
```

### 3. 实时统计功能

```javascript
// src/renderer/src/stores/editor.js
export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const typingStartTime = ref(null)
  const initialWordCount = ref(0)
  const typingSpeed = ref({
    perMinute: 0,
    perHour: 0
  })

  // 计算当前字数
  const chapterWords = computed(() => {
    return content.value.length
  })

  // 开始计时
  function startTypingTimer() {
    if (!typingStartTime.value) {
      typingStartTime.value = Date.now()
      initialWordCount.value = chapterWords.value
    }
  }

  // 更新码字速度
  function updateTypingSpeed() {
    if (!typingStartTime.value) return

    const now = Date.now()
    const timeElapsed = (now - typingStartTime.value) / 1000
    const wordsTyped = chapterWords.value - initialWordCount.value

    if (timeElapsed > 0) {
      typingSpeed.value = {
        perMinute: Math.round((wordsTyped / timeElapsed) * 60),
        perHour: Math.round((wordsTyped / timeElapsed) * 3600)
      }
    }
  }

  // 设置内容时触发统计
  function setContent(newContent) {
    content.value = newContent
    startTypingTimer()
    updateTypingSpeed()
  }

  return {
    content,
    chapterWords,
    typingSpeed,
    setContent,
    resetTypingTimer
  }
})
```

## 🔧 自定义扩展开发

### 1. Tab 键插入扩展

```javascript
// src/renderer/src/extensions/TabInsert.js
import { Extension } from '@tiptap/core'

export const TabInsert = Extension.create({
  name: 'tabInsert',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        this.editor.commands.insertContent('\t')
        return true
      }
    }
  }
})
```

### 2. 折叠功能扩展

```javascript
// src/renderer/src/extensions/Collapsible.js
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export const Collapsible = Extension.create({
  name: 'collapsible',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('collapsible'),
        props: {
          handleDOMEvents: {
            keydown: (view, event) => {
              // 处理折叠逻辑
              if (event.key === 'Tab' && event.shiftKey) {
                // 处理 Shift+Tab 折叠
                return true
              }
              return false
            }
          }
        }
      })
    ]
  }
})
```

### 3. 自定义样式扩展

```javascript
// src/renderer/src/extensions/CustomStyles.js
import { Extension } from '@tiptap/core'

export const CustomStyles = Extension.create({
  name: 'customStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          customStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-custom-style'),
            renderHTML: (attributes) => {
              if (!attributes.customStyle) return {}
              return {
                'data-custom-style': attributes.customStyle,
                style: attributes.customStyle
              }
            }
          }
        }
      }
    ]
  }
})
```

## ⚡ 性能优化策略

### 1. 防抖自动保存

```javascript
// 防抖自动保存实现
let saveTimer = null

function handleContentUpdate({ editor }) {
  const content = editor.getText()
  editorStore.setContent(content)

  // 防抖保存
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    autoSaveContent()
  }, 1000)
}

async function autoSaveContent() {
  try {
    const file = editorStore.file
    if (!file) return

    const content = editorStore.content
    await window.electron.writeFile(file.path, content)
    console.log('自动保存成功')
  } catch (error) {
    console.error('自动保存失败:', error)
  }
}
```

### 2. 内容渲染优化

```javascript
// 纯文本转 HTML 优化
function plainTextToHtml(text) {
  if (!text) return ''

  const lines = text.split('\n')
  const htmlLines = lines.map((line) => {
    // 替换 Tab 为空格
    let html = line.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    // 替换连续空格
    html = html.replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
    return html ? `<p>${html}</p>` : ''
  })

  return htmlLines.join('')
}
```

### 3. 内存管理

```javascript
// 组件销毁时清理资源
onBeforeUnmount(async () => {
  if (saveTimer) clearTimeout(saveTimer)

  // 保存最后的内容
  await autoSaveContent()

  // 重置码字统计
  editorStore.resetTypingTimer()

  // 销毁编辑器
  editor.value && editor.value.destroy()
})
```

## 🎨 用户体验优化

### 1. 响应式工具栏

```vue
<template>
  <div class="editor-stats">
    <span class="word-count">章节字数：{{ chapterWords }}</span>
    <span v-if="typingSpeed.perMinute > 0" class="typing-speed">
      码字速度：{{ typingSpeed.perMinute }}字/分钟 ({{ typingSpeed.perHour }}字/小时)
    </span>
  </div>
</template>

<style lang="scss" scoped>
.editor-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: var(--bg-soft);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.word-count {
  font-weight: 500;
}

.typing-speed {
  color: var(--text-muted);
}
</style>
```

### 2. 快捷键支持

```javascript
// 快捷键配置
const keyboardShortcuts = {
  'Ctrl+S': () => saveContent(),
  'Ctrl+B': () => toggleBold(),
  'Ctrl+I': () => toggleItalic(),
  'Ctrl+Z': () => editor.value?.chain().focus().undo().run(),
  'Ctrl+Y': () => editor.value?.chain().focus().redo().run()
}

// 注册快捷键
onMounted(() => {
  document.addEventListener('keydown', (event) => {
    const key = getKeyCombination(event)
    const handler = keyboardShortcuts[key]
    if (handler) {
      event.preventDefault()
      handler()
    }
  })
})

function getKeyCombination(event) {
  const keys = []
  if (event.ctrlKey) keys.push('Ctrl')
  if (event.shiftKey) keys.push('Shift')
  if (event.altKey) keys.push('Alt')
  keys.push(event.key.toUpperCase())
  return keys.join('+')
}
```

### 3. 主题适配

```scss
// 编辑器主题样式
.editor-content {
  .ProseMirror {
    background-color: var(--bg-primary);
    color: var(--text-base);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    min-height: 500px;
    padding: 20px;

    &:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px var(--primary-color-alpha);
    }

    p {
      margin: 0 0 1em 0;
      line-height: 1.6;
    }

    p:last-child {
      margin-bottom: 0;
    }
  }
}
```

## 📊 功能特性总结

### ✅ 已实现功能

- ✅ **基础编辑**: 文本输入、删除、选择
- ✅ **格式控制**: 粗体、斜体、对齐方式
- ✅ **字体设置**: 字体族、字号、行高
- ✅ **实时统计**: 字数统计、码字速度
- ✅ **自动保存**: 防抖机制、本地存储
- ✅ **快捷键**: 常用操作快捷键支持
- ✅ **主题适配**: 多主题模式支持

### 🚀 技术亮点

1. **高性能**: 基于 ProseMirror 的高性能架构
2. **可扩展**: 支持自定义扩展和插件
3. **用户友好**: 直观的工具栏和统计信息
4. **数据安全**: 自动保存和错误处理机制

## 📝 总结与展望

TipTap 富文本编辑器在 织梦书房 项目中的成功应用，展示了如何利用现代化的前端技术构建专业的写作工具。通过合理的架构设计、性能优化和用户体验优化，我们实现了一个功能完整、性能优秀的编辑器。

### 🎯 技术价值

- **架构设计**: 模块化的扩展系统
- **性能优化**: 防抖、懒加载等优化策略
- **用户体验**: 实时统计、快捷键等交互优化
- **可维护性**: 清晰的代码结构和状态管理

### 🔮 未来规划

- **更多格式**: 支持更多文本格式和样式
- **协作功能**: 多人协作编辑支持
- **版本控制**: 更完善的版本管理功能
- **插件生态**: 支持第三方插件扩展

---

### 📚 相关链接

- **项目地址**: [GitHub - 织梦书房](https://github.com/zhimeng-shufang/zhimeng-shufang)，给个 Star 哦~
- **TipTap 官网**: [https://tiptap.dev](https://tiptap.dev)
- **技术栈**: TipTap + Vue 3 + Electron + Element Plus

### 🏷️ 标签

`#TipTap` `#富文本编辑` `#Vue3` `#Electron` `#小说写作` `#前端开发` `#性能优化`

---

> 💡 **如果这篇文章对你有帮助，请给个 ⭐️ 支持一下！**

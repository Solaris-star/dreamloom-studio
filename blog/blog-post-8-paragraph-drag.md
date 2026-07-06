# 🎯 小说笔记编辑中的段落拖拽移动：基于 ProseMirror 的交互式重排技术

> 💡 本文深入探讨了在小说写作软件的笔记编辑器中实现段落拖拽移动功能的技术方案，包括拖拽锚点、子段落联动、全局事件处理等核心功能的完整实现，为开发者提供一套完整的段落重排解决方案。

## 📋 目录
- [项目背景](#项目背景)
- [技术架构设计](#技术架构设计)
- [核心功能实现](#核心功能实现)
- [拖拽锚点装饰系统](#拖拽锚点装饰系统)
- [段落移动算法](#段落移动算法)
- [全局事件处理](#全局事件处理)
- [技术亮点总结](#技术亮点总结)
- [总结与展望](#总结与展望)

## 🎯 项目背景

在小说创作过程中，作者经常需要调整笔记的结构和顺序。传统的文本编辑器通常只支持复制粘贴来移动段落，操作繁琐且容易出错。因此，我们在 织梦书房 的笔记编辑器中设计了一个直观的段落拖拽移动功能，让作者能够通过拖拽快速调整段落顺序，提升创作效率。

### 🎨 段落拖拽功能展示

![笔记编辑器](static/note-editor.png)

*段落拖拽移动功能 - 支持拖拽锚点快速调整段落顺序*

### ✨ 核心功能特性
- 🖱️ **拖拽锚点**: 每个段落左侧显示拖拽锚点（⋮⋮），悬停时显示
- 📦 **子段落联动**: 拖拽父段落时，所有子段落（缩进级别更大的段落）会一起移动
- 🎯 **精确定位**: 支持在段落上方或下方插入，根据鼠标位置自动判断
- 🌐 **全局支持**: 支持拖拽到编辑器外的区域（如侧边栏），仍能正确放置
- 🎨 **视觉反馈**: 拖拽时显示段落预览，提供清晰的视觉反馈

## 🏗️ 技术架构设计

### 核心技术栈
- **TipTap 3.7.0**: 基于 ProseMirror 的富文本编辑器框架
- **ProseMirror**: 底层文档模型和插件系统
- **Vue 3.5.13**: 渐进式 JavaScript 框架
- **Decoration System**: ProseMirror 的装饰系统，用于添加拖拽锚点

### 系统架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   编辑器视图     │    │   ProseMirror   │    │   拖拽扩展      │
│   EditorView    │◄──►│   Plugin        │◄──►│ NoteDragHandle  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
    ┌─────────────────────────────────────────────────────┐
    │        拖拽事件处理与段落移动算法                     │
    └─────────────────────────────────────────────────────┘
```

### 📁 核心组件

段落拖拽功能通过 TipTap Extension 实现，主要包含：

- **NoteDragHandle Extension**: 拖拽锚点扩展
- **Decoration System**: 装饰系统，为每个段落添加拖拽锚点
- **Event Handlers**: 处理拖拽相关事件（mousedown, dragstart, dragover, drop, dragend）

## 🔧 核心功能实现

### 1. 拖拽扩展初始化

段落拖拽功能通过 TipTap Extension 实现，在编辑器初始化时注册：

```javascript
// src/renderer/src/components/NoteEditorContent.vue
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

// 段落拖拽锚点扩展
const NoteDragHandle = Extension.create({
  name: 'noteDragHandle',
  addProseMirrorPlugins() {
    const key = new PluginKey('note-drag-handle')
    let draggingPos = null // 拖拽起点位置
    
    // 段落移动核心算法
    function moveParagraphAtPoint(view, clientX, clientY) {
      // ... 移动逻辑
    }
    
    return [
      new Plugin({
        key,
        // ... 插件配置
      })
    ]
  }
})
```

### 2. 拖拽锚点装饰系统

使用 ProseMirror 的 Decoration 系统为每个段落添加拖拽锚点：

```javascript
// 构建装饰（拖拽锚点）
function buildDecorations(doc, schema) {
  const decorations = []
  const paragraphType = schema.nodes.noteOutlineParagraph
  
  doc.descendants((node, nodePos) => {
    if (node.type === paragraphType) {
      // 为段落添加相对定位类
      const nodeDeco = Decoration.node(nodePos, nodePos + node.nodeSize, {
        class: 'has-note-drag-handle'
      })
      decorations.push(nodeDeco)
      
      // 创建拖拽锚点元素
      const handle = document.createElement('span')
      handle.className = 'note-outline-drag-handle'
      handle.dataset.pos = String(nodePos)
      handle.setAttribute('draggable', 'true')
      handle.title = '拖动以移动该段落'
      handle.textContent = '⋮⋮'
      
      // 将锚点作为 widget 挂载在段首
      const widget = Decoration.widget(nodePos + 1, handle, { side: -1 })
      decorations.push(widget)
    }
    return true
  })
  
  return DecorationSet.create(doc, decorations)
}
```

**关键点**：
- 使用 `Decoration.node` 为段落添加样式类
- 使用 `Decoration.widget` 在段首插入拖拽锚点
- 通过 `dataset.pos` 存储段落位置，便于后续定位

### 3. 拖拽事件处理

处理拖拽的各个阶段事件：

```javascript
handleDOMEvents: {
  // 鼠标按下：初始化拖拽
  mousedown: (view, event) => {
    const target = event.target
    if (!target.classList.contains('note-outline-drag-handle')) return false
    
    const pos = Number(target.dataset.pos || -1)
    if (pos < 0) return false
    
    // 选中整个段落节点
    const node = state.doc.nodeAt(pos)
    const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos))
    view.dispatch(tr)
    
    // 记录拖拽起点
    draggingPos = pos
    return true
  },
  
  // 拖拽开始：设置拖拽预览
  dragstart: (view, event) => {
    const target = event.target
    if (!target.classList.contains('note-outline-drag-handle')) return false
    
    const pos = Number(target.dataset.pos || -1)
    const nodeDom = view.nodeDOM(pos)
    
    // 克隆节点作为拖拽预览
    const clone = nodeDom.cloneNode(true)
    clone.style.position = 'fixed'
    clone.style.pointerEvents = 'none'
    clone.style.top = '-10000px'
    // ... 设置样式
    
    // 设置拖拽预览图
    event.dataTransfer.setDragImage(clone, 8, 8)
    return true
  },
  
  // 拖拽悬停：允许放置
  dragover: (view, event) => {
    if (draggingPos != null) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      return true
    }
    return false
  },
  
  // 放置：执行移动
  drop: (view, event) => {
    if (draggingPos == null) return false
    event.preventDefault()
    moveParagraphAtPoint(view, event.clientX, event.clientY)
    draggingPos = null
    return true
  }
}
```

## 🎯 段落移动算法

### 核心移动逻辑

段落移动的核心算法需要考虑多个因素：

1. **子段落识别**: 识别需要一起移动的子段落
2. **目标位置计算**: 根据鼠标位置计算插入位置
3. **边界检查**: 防止移动到无效位置

```javascript
function moveParagraphAtPoint(view, clientX, clientY) {
  const { state } = view
  const rect = view.dom.getBoundingClientRect()
  
  // 坐标限制在编辑器范围内
  const clampedX = Math.max(rect.left + 1, Math.min(clientX, rect.right - 1))
  const clampedY = Math.max(rect.top + 1, Math.min(clientY, rect.bottom - 1))
  
  // 获取鼠标位置对应的文档位置
  const posInfo = view.posAtCoords({ left: clampedX, top: clampedY })
  if (!posInfo) return false
  
  const $from = state.doc.resolve(draggingPos)
  const sourceIndex = $from.index(0)
  const sourceNode = state.doc.child(sourceIndex)
  const sourceLevel = sourceNode.attrs.level || 0
  
  // 计算目标位置
  const $pos = state.doc.resolve(posInfo.pos)
  let targetIndex = $pos.index(0)
  
  // 判断是插入在段落上方还是下方
  const domAt = view.nodeDOM($pos.before(1))
  let insertAfter = false
  if (domAt) {
    const tRect = domAt.getBoundingClientRect()
    const midY = tRect.top + tRect.height / 2
    insertAfter = clampedY >= midY
  }
  
  // 查找所有需要移动的子段落
  let moveCount = 1 // 至少移动源段落本身
  let nextIndex = sourceIndex + 1
  
  while (nextIndex < state.doc.childCount) {
    const nextNode = state.doc.child(nextIndex)
    if (nextNode.type.name === 'noteOutlineParagraph') {
      const nextLevel = nextNode.attrs.level || 0
      // 如果下一段落的层级大于源段落，说明是子段落
      if (nextLevel > sourceLevel) {
        moveCount++
        nextIndex++
      } else {
        break // 遇到同级或更高级的段落，停止查找
      }
    } else {
      break
    }
  }
  
  // 检查目标位置是否在移动范围内
  if (!insertAfter && targetIndex >= sourceIndex && targetIndex < sourceIndex + moveCount) {
    return true // 不需要移动
  }
  
  // 执行移动操作
  const children = []
  state.doc.forEach((child) => {
    children.push(child)
  })
  
  // 移除源段落及其子段落
  const movedParagraphs = children.splice(sourceIndex, moveCount)
  
  // 计算目标插入位置
  let destIndex = targetIndex
  if (sourceIndex < targetIndex) {
    destIndex -= moveCount // 调整目标位置
  }
  
  // 在目标位置插入
  if (insertAfter) {
    children.splice(destIndex + 1, 0, ...movedParagraphs)
  } else {
    children.splice(destIndex, 0, ...movedParagraphs)
  }
  
  // 创建新文档并应用变更
  const newDoc = state.doc.type.create(state.doc.attrs, Fragment.from(children))
  const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content)
  view.dispatch(tr.scrollIntoView())
  return true
}
```

**算法要点**：
- **子段落识别**: 通过比较 `level` 属性识别子段落
- **位置计算**: 根据鼠标 Y 坐标判断插入位置（上方/下方）
- **边界处理**: 防止移动到自身范围内
- **文档重建**: 使用 Fragment 重建文档结构

## 🌐 全局事件处理

为了支持拖拽到编辑器外的区域（如侧边栏），需要监听全局事件：

```javascript
view(editorView) {
  let lastPoint = null
  
  // 全局放置事件
  const onDocDrop = (e) => {
    if (draggingPos == null) return
    e.preventDefault()
    moveParagraphAtPoint(editorView, e.clientX, e.clientY)
    draggingPos = null
  }
  
  // 全局拖拽悬停事件
  const onDocDragOver = (e) => {
    if (draggingPos == null) return
    e.preventDefault()
    lastPoint = { x: e.clientX, y: e.clientY }
  }
  
  // 全局拖拽结束事件（兜底处理）
  const onDocDragEnd = () => {
    if (draggingPos != null && lastPoint) {
      // 如果没有触发 drop，也在 dragend 时执行移动
      moveParagraphAtPoint(editorView, lastPoint.x, lastPoint.y)
    }
    draggingPos = null
    lastPoint = null
  }
  
  // 注册全局事件监听
  document.addEventListener('drop', onDocDrop)
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('dragend', onDocDragEnd)
  
  return {
    destroy() {
      // 清理事件监听
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('dragend', onDocDragEnd)
    }
  }
}
```

**关键点**：
- 使用 `document` 级别的事件监听，覆盖整个页面
- 在 `dragend` 中兜底处理，确保即使没有触发 `drop` 也能完成移动
- 在插件销毁时清理事件监听，避免内存泄漏

## 🎨 样式设计

拖拽锚点的样式设计需要考虑用户体验：

```scss
// 拖拽锚点样式
.note-outline-drag-handle {
  width: 12px;
  height: 12px;
  cursor: grab !important;
  font-size: 10px;
  color: var(--text-mute, #999);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  
  // 悬停时显示
  &:hover {
    cursor: grab !important;
    color: var(--text-base, #333);
  }
  
  // 拖拽时显示抓取手势
  &:active {
    cursor: grabbing !important;
  }
}

// 段落悬停时显示拖拽锚点
p[data-note-outline]:hover {
  .note-outline-drag-handle {
    opacity: 1;
    pointer-events: auto;
  }
}
```

## 🎯 技术亮点总结

### 1. 基于 ProseMirror 插件系统
- **扩展性强**: 通过 Extension 机制，易于集成和维护
- **性能优秀**: 利用 ProseMirror 的文档模型，移动操作高效
- **状态管理**: 自动处理文档变更和装饰更新

### 2. 子段落联动机制
- **智能识别**: 自动识别子段落（通过 level 属性）
- **批量移动**: 父段落移动时，所有子段落一起移动
- **结构保持**: 保持段落层级关系不变

### 3. 全局事件支持
- **跨区域拖拽**: 支持拖拽到编辑器外的区域
- **兜底处理**: 在 dragend 中处理未触发 drop 的情况
- **事件清理**: 插件销毁时自动清理事件监听

### 4. 用户体验优化
- **视觉反馈**: 拖拽时显示段落预览
- **精确定位**: 根据鼠标位置判断插入位置
- **边界保护**: 防止移动到无效位置

## 🔮 总结与展望

本文详细介绍了在小说写作软件的笔记编辑器中实现段落拖拽移动功能的技术方案。通过 ProseMirror 的插件系统、Decoration 装饰系统和精心设计的移动算法，我们实现了一个功能完善、用户体验优秀的段落重排功能。

### 技术优势
- ✅ **基于标准**: 使用 ProseMirror 标准 API，稳定可靠
- ✅ **性能优秀**: 利用文档模型，移动操作高效
- ✅ **扩展性强**: 易于扩展和维护
- ✅ **用户友好**: 直观的拖拽操作，支持子段落联动

### 未来优化方向
- 🔮 **动画效果**: 添加平滑的移动动画
- 🔮 **多选拖拽**: 支持同时拖拽多个段落
- 🔮 **撤销重做**: 优化撤销重做机制
- 🔮 **键盘快捷键**: 支持键盘快捷键移动段落

通过这套技术方案，我们为小说创作者提供了一个强大而直观的段落重排工具，大大提升了笔记整理的效率。

---

### 📚 相关链接
- **项目地址**: [GitHub - 织梦书房](https://github.com/zhimeng-shufang/zhimeng-shufang)，给个 Star 哦~
- **TipTap 官网**: [https://tiptap.dev](https://tiptap.dev)
- **ProseMirror 文档**: [https://prosemirror.net](https://prosemirror.net)

### 🏷️ 标签
`#ProseMirror` `#TipTap` `#段落拖拽` `#Vue3` `#Electron` `#小说写作` `#富文本编辑` `#前端开发`

---

> 💡 **如果这篇文章对你有帮助，请给个 ⭐️ 支持一下！**


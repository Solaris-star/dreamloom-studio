# 📚 从零构建桌面写作软件的书籍管理系统：Electron + Vue 3 实战指南

> 💡 本文深入探讨了基于 Electron + Vue 3 技术栈的桌面写作软件中书籍管理系统的设计与实现，涵盖了书籍的创建、编辑、删除等核心功能的完整技术方案，为开发者提供一套完整的书籍管理解决方案。

## 📋 目录

- [项目背景](#项目背景)
- [技术架构概览](#技术架构概览)
- [书籍管理核心功能实现](#书籍管理核心功能实现)
- [核心功能实现细节](#核心功能实现细节)
- [用户体验优化](#用户体验优化)
- [技术亮点总结](#技术亮点总结)
- [扩展性考虑](#扩展性考虑)
- [总结与展望](#总结与展望)

## 🎯 项目背景

织梦书房 是一款专为小说创作者设计的桌面写作软件，其核心功能之一就是完善的书籍管理系统。作者需要一个直观、高效的书籍管理界面来组织和管理自己的创作项目，包括书籍的创建、编辑、删除以及元数据管理等功能。

### 📖 书籍管理界面

![书籍管理](static/home.png)

_直观的书籍管理界面 - 支持创建、编辑、删除等操作_

### ✨ 功能特性

- 📝 **书籍创建**: 支持多种类型书籍创建
- ✏️ **书籍编辑**: 实时编辑书籍信息和元数据
- 🗑️ **书籍删除**: 安全删除确认机制
- 📊 **数据统计**: 字数统计和更新记录
- 🎨 **界面美观**: 书籍卡片式展示
- 🔄 **实时同步**: 状态管理和数据同步

## 🏗️ 技术架构概览

### 核心技术栈

- **Electron 35.0.3**: 跨平台桌面应用框架
- **Vue 3.5.13**: 渐进式 JavaScript 框架
- **Element Plus 2.10.1**: 企业级 UI 组件库
- **Pinia 3.0.1**: Vue 3 官方推荐的状态管理库

### 系统架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   渲染进程      │    │   主进程        │    │   文件系统      │
│   (Vue 3)      │◄──►│   (Node.js)     │◄──►│   (本地存储)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 📁 项目目录结构

```
织梦书房/
├── src/
│   ├── main/           # Electron 主进程
│   │   └── index.js    # 主进程入口文件
│   ├── preload/        # 预加载脚本
│   │   └── index.js    # IPC 通信接口
│   └── renderer/       # 渲染进程 (Vue 应用)
│       ├── src/
│       │   ├── components/    # 组件库
│       │   │   ├── Bookshelf.vue    # 书籍列表组件
│       │   │   └── Book.vue         # 书籍卡片组件
│       │   ├── views/         # 页面视图
│       │   ├── stores/        # 状态管理
│       │   │   └── index.js   # Pinia 状态管理
│       │   ├── service/       # 服务层
│       │   │   └── books.js   # 书籍相关 API
│       │   └── utils/         # 工具函数
│       └── assets/            # 静态资源
```

## 🔧 书籍管理核心功能实现

### 1. 📊 书籍数据结构设计

每本书籍包含以下核心信息：

```javascript
const bookData = {
  id: 'unique_id', // 唯一标识
  name: '书籍名称', // 书名
  type: 'novel', // 类型
  typeName: '小说', // 类型名称
  targetCount: 100000, // 目标字数
  intro: '书籍简介', // 简介
  createdAt: '2024-01-01', // 创建时间
  updatedAt: '2024-01-01', // 更新时间
  totalWords: 50000 // 当前字数
}
```

> 💡 **完整数据结构请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

### 2. 🗂️ 主进程文件操作层

在主进程中实现文件系统操作，确保数据持久化：

```javascript
// src/main/index.js
import { ipcMain } from 'electron'
import fs from 'fs'
import { join } from 'path'

// 创建书籍
ipcMain.handle('create-book', async (event, bookInfo) => {
  const safeName = bookInfo.name.replace(/[\\/:*?"<>|]/g, '_')
  const booksDir = store.get('booksDir')
  const bookPath = join(booksDir, safeName)

  // 创建书籍目录结构
  if (!fs.existsSync(bookPath)) {
    fs.mkdirSync(bookPath)
  }

  // 写入元数据文件
  const meta = {
    ...bookInfo,
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString()
  }
  fs.writeFileSync(join(bookPath, 'mazi.json'), JSON.stringify(meta, null, 2))

  // 创建默认目录结构
  const textPath = join(bookPath, '正文')
  const notesPath = join(bookPath, '笔记')
  fs.mkdirSync(textPath, { recursive: true })
  fs.mkdirSync(notesPath, { recursive: true })

  return true
})

// 删除书籍
ipcMain.handle('delete-book', async (event, { name }) => {
  const booksDir = store.get('booksDir')
  const bookPath = join(booksDir, name)
  if (fs.existsSync(bookPath)) {
    fs.rmSync(bookPath, { recursive: true })
    return true
  }
  return false
})

// 编辑书籍
ipcMain.handle('edit-book', async (event, bookInfo) => {
  const booksDir = store.get('booksDir')
  const bookPath = join(booksDir, bookInfo.name)
  if (fs.existsSync(bookPath)) {
    const metaPath = join(bookPath, 'mazi.json')
    const existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const mergedMeta = { ...existingMeta, ...bookInfo }
    fs.writeFileSync(metaPath, JSON.stringify(mergedMeta, null, 2))
    return true
  }
  return false
})
```

> 💡 **完整主进程代码请查看**: [src/main/index.js](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/main/index.js)

### 3. 🔌 渲染进程服务层

在渲染进程中封装 API 调用，提供统一的接口：

```javascript
// src/renderer/src/service/books.js
export function createBook(bookInfo) {
  return window.electron.createBook(bookInfo)
}

export function updateBook(bookInfo) {
  return window.electron.editBook(bookInfo)
}

export async function deleteBook(name) {
  const dir = await getBookDir()
  return window.electron.deleteBook(dir, name)
}

export async function readBooksDir() {
  const mainStore = useMainStore()
  const dir = await getBookDir()
  if (!dir) return []
  const books = await window.electron.readBooksDir(dir)
  mainStore.setBooks(books)
  return books
}
```

> 💡 **完整服务层代码请查看**: [src/renderer/src/service/books.js](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/service/books.js)

### 4. 🎨 用户界面组件设计

#### 4.1 📚 书籍列表组件 (Bookshelf.vue)

```vue
<template>
  <div class="bookshelf">
    <!-- 顶部操作栏 -->
    <div class="top-bar">
      <el-button type="primary" @click="handleNewBook">
        <el-icon><Plus /></el-icon>
        新建书籍
      </el-button>
    </div>

    <!-- 书籍列表 -->
    <div class="books-box">
      <Book
        v-for="book in books"
        :key="book.id"
        :name="book.name"
        :type="book.type"
        :type-name="book.typeName"
        :total-words="book.totalWords"
        :updated-at="book.updatedAt"
        @on-open="onOpen(book)"
        @on-edit="onEdit(book)"
        @on-delete="onDelete(book)"
      />
    </div>
  </div>
</template>
```

> 💡 **完整书籍列表组件代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

#### 4.2 📖 书籍卡片组件 (Book.vue)

```vue
<template>
  <div class="book" @click="emit('onOpen')" @contextmenu.prevent="showMenu($event)">
    <div class="spine"></div>
    <div class="cover-bg">
      <div class="title-block">
        <div class="vertical-title">{{ name }}</div>
      </div>
    </div>
    <div class="info">
      <div class="type">{{ typeName }}</div>
      <div class="stats">
        <div class="word-count">字数：{{ totalWords }}</div>
        <div class="update-time">更新：{{ updatedAt }}</div>
      </div>
    </div>
  </div>
</template>
```

> 💡 **完整书籍卡片组件代码请查看**: [src/renderer/src/components/Book.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Book.vue)

### 5. 🗃️ 状态管理设计

使用 Pinia 进行全局状态管理：

```javascript
// src/renderer/src/stores/index.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMainStore = defineStore('main', () => {
  const books = ref([])

  function setBooks(newBooks) {
    books.value = newBooks
  }

  function addBook(book) {
    books.value.push(book)
  }

  function removeBook(bookId) {
    const index = books.value.findIndex((book) => book.id === bookId)
    if (index > -1) {
      books.value.splice(index, 1)
    }
  }

  return {
    books,
    setBooks,
    addBook,
    removeBook
  }
})
```

> 💡 **完整状态管理代码请查看**: [src/renderer/src/stores/index.js](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/stores/index.js)

## ⚙️ 核心功能实现细节

### 1. 📝 书籍创建流程

```javascript
async function handleConfirm() {
  formRef.value.validate(async (valid) => {
    if (valid) {
      // 校验同名书籍
      const exists = books.value.some(
        (b) => b.name === form.value.name && (!isEdit.value || b.id !== editBookId.value)
      )
      if (exists) {
        ElMessage.error('已存在同名书籍，不能重复创建！')
        return
      }

      const randomId = Date.now().toString() + Math.floor(Math.random() * 10000).toString()
      const bookData = {
        id: randomId,
        name: form.value.name,
        type: form.value.type,
        typeName: BOOK_TYPES.find((item) => item.value === form.value.type)?.label,
        targetCount: form.value.targetCount,
        intro: form.value.intro
      }

      await createBook(bookData)
      dialogVisible.value = false
      await readBooksDir()
    }
  })
}
```

> 💡 **完整创建流程代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

### 2. ✏️ 书籍编辑功能

```javascript
function onEdit(book) {
  isEdit.value = true
  editBookId.value = book.id
  dialogVisible.value = true
  form.value.name = book.name
  form.value.type = book.type
  form.value.targetCount = book.targetCount
  form.value.intro = book.intro
}
```

> 💡 **完整编辑功能代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

### 3. 🗑️ 书籍删除确认

```javascript
async function onDelete(book) {
  try {
    await ElMessageBox.confirm(`确定要删除《${book.name}》吗？此操作不可恢复！`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteBook(book.name)
    ElMessage.success('删除成功')
    await readBooksDir()
  } catch (e) {
    // 用户取消删除
    console.log(e)
  }
}
```

> 💡 **完整删除功能代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

## 🎨 用户体验优化

### 1. 🖱️ 右键菜单支持

```javascript
function showMenu(e) {
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true
  document.addEventListener('click', hideMenu)
}

function hideMenu() {
  menuVisible.value = false
  document.removeEventListener('click', hideMenu)
}
```

> 💡 **完整右键菜单代码请查看**: [src/renderer/src/components/Book.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Book.vue)

### 2. ✅ 表单验证

```javascript
const rules = ref({
  name: [{ required: true, message: '请输入书籍名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'blur' }],
  targetCount: [{ required: true, message: '请输入目标字数', trigger: 'blur' }],
  intro: [{ required: true, message: '请输入简介', trigger: 'blur' }]
})
```

> 💡 **完整表单验证代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

### 3. 💬 错误处理与用户反馈

```javascript
// 创建成功提示
ElMessage.success('创建成功')

// 删除确认
await ElMessageBox.confirm(`确定要删除《${book.name}》吗？此操作不可恢复！`, '删除确认', {
  confirmButtonText: '删除',
  cancelButtonText: '取消',
  type: 'warning'
})
```

> 💡 **完整错误处理代码请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

## ⚡ 技术亮点总结

### 1. 🔄 跨进程通信设计

- 使用 Electron 的 IPC 机制实现主进程与渲染进程的安全通信
- 通过 contextBridge 暴露安全的 API 接口

### 2. 🗂️ 文件系统管理

- 自动创建标准化的书籍目录结构
- 元数据 JSON 文件存储，便于扩展和维护
- 文件名安全处理，避免特殊字符冲突

### 3. 🗃️ 状态管理优化

- 使用 Pinia 实现响应式状态管理
- 统一的数据流，确保 UI 与数据同步

### 4. 🎨 用户体验设计

- 直观的书籍卡片展示
- 右键菜单快速操作
- 完善的表单验证和错误提示

## 🔮 扩展性考虑

### 1. 📚 书籍类型扩展

```javascript
const BOOK_TYPES = [
  { value: 'novel', label: '小说' },
  { value: 'essay', label: '散文' },
  { value: 'poetry', label: '诗歌' },
  { value: 'script', label: '剧本' }
]
```

> 💡 **完整书籍类型配置请查看**: [src/renderer/src/constants/config.js](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/constants/config.js)

### 2. 📊 元数据扩展

```javascript
const bookMeta = {
  // 基础信息
  id: 'unique_id',
  name: '书籍名称',
  type: 'novel',

  // 扩展信息
  tags: ['标签1', '标签2'],
  status: 'writing', // writing, completed, paused
  coverImage: 'cover.jpg',
  wordCountGoal: 100000,

  // 统计信息
  currentWordCount: 50000,
  chaptersCount: 10,
  lastModified: '2024-01-01'
}
```

> 💡 **完整元数据结构请查看**: [src/renderer/src/components/Bookshelf.vue](https://github.com/zhimeng-shufang/zhimeng-shufang/blob/main/src/renderer/src/components/Bookshelf.vue)

## 📝 总结与展望

通过 Electron + Vue 3 技术栈，我们成功构建了一个功能完善、用户体验优秀的书籍管理系统。该系统不仅满足了基本的 CRUD 操作需求，还在用户体验、数据安全、扩展性等方面进行了深度优化。

### 🎯 关键成功因素

- **🏗️ 架构清晰**: 主进程负责文件操作，渲染进程负责 UI 交互
- **🔒 数据安全**: 通过 IPC 机制确保跨进程通信的安全性
- **🎨 用户体验**: 直观的界面设计和流畅的操作体验
- **🔧 可维护性**: 模块化的代码结构和统一的状态管理

### 🚀 技术价值

- **跨平台支持**: 基于 Electron 实现 Windows、macOS、Linux 全平台支持
- **高性能**: 使用 Vue 3 的 Composition API 和 Pinia 状态管理
- **可扩展**: 模块化的组件设计和清晰的代码结构
- **用户友好**: 完善的错误处理和用户反馈机制

这个书籍管理系统为整个写作软件奠定了坚实的基础，为后续的功能扩展提供了良好的架构支持。

---

### 📚 相关链接

- **项目地址**: [GitHub - 织梦书房](https://github.com/zhimeng-shufang/zhimeng-shufang)，给个 Star 哦~
- **Electron 官方文档**: [Electron Documentation](https://www.electronjs.org/docs)
- **Vue 3 官方文档**: [Vue 3 Documentation](https://vuejs.org/)
- **Pinia 状态管理**: [Pinia Documentation](https://pinia.vuejs.org/)

### 🏷️ 标签

`#Electron` `#Vue3` `#书籍管理` `#桌面应用` `#前端开发` `#状态管理` `#用户体验`

---

> 💡 **如果这篇文章对你有帮助，请给个 ⭐️ 支持一下！**

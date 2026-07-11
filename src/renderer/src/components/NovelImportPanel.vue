<template>
  <section class="novel-import-panel">
    <el-alert
      v-if="errorMsg"
      class="inline-alert"
      type="error"
      :title="errorMsg"
      show-icon
      closable
      @close="errorMsg = ''"
    />
    <el-alert
      v-if="sourceWarningText"
      class="inline-alert"
      type="warning"
      :title="sourceWarningText"
      show-icon
      closable
      @close="sourceErrors = []"
    />

    <main class="import-body" :class="{ 'has-selected-book': selectedBook }">
      <section class="result-panel">
        <div class="panel-title">
          <div>
            <h3>搜索结果</h3>
            <p>
              {{
                searchResult.length ? `${searchResult.length} 本书` : '选择书源并搜索书名或作者。'
              }}
            </p>
          </div>
        </div>

        <div v-if="searchResult.length" class="result-list">
          <article
            v-for="book in searchResult"
            :key="`${book.sourceId}:${book.url}`"
            class="result-item"
            :class="{
              selected: selectedBook?.url === book.url && selectedBook?.sourceId === book.sourceId
            }"
            @click="handleSelectBook(book)"
          >
            <div>
              <h4>{{ book.title || '未命名小说' }}</h4>
              <p>
                {{ book.author || '未知作者' }} · {{ book.sourceName || sourceName(book.sourceId) }}
              </p>
            </div>
            <el-button
              size="small"
              :loading="loadingChapters && selectedBook?.url === book.url"
              @click.stop="handleSelectBook(book)"
            >
              选择
            </el-button>
          </article>
        </div>

        <div v-else-if="!searching" class="soft-empty">
          <strong>还没有搜索结果</strong>
          <span>输入书名或作者后，会在这里显示可导入的小说。</span>
        </div>
      </section>

      <aside v-if="selectedBook" class="download-panel">
        <span class="type-pill">{{
          selectedBook.sourceName || sourceName(selectedBook.sourceId)
        }}</span>
        <h3>《{{ selectedBook.title }}》</h3>
        <p>{{ selectedBook.author || '未知作者' }} · {{ chapterList.length || '正在读取' }} 章</p>
        <div class="chapter-preview">
          <span v-for="chapter in chapterList.slice(0, 5)" :key="chapter.url">{{
            chapter.title
          }}</span>
        </div>
        <div v-if="chapterList.length" class="chapter-range">
          <div class="range-head">
            <el-checkbox v-model="limitChapterCount" @change="markLimitTouched"
              >只导入前</el-checkbox
            >
            <el-input-number
              v-model="chapterLimit"
              :disabled="!limitChapterCount"
              :min="1"
              :max="chapterList.length"
              size="small"
              controls-position="right"
              @change="markLimitTouched"
            />
            <span>章</span>
          </div>
          <p>本次将处理 {{ selectedChapterCount }} / {{ chapterList.length }} 章。</p>
        </div>
        <el-progress v-if="downloading" :percentage="progressPercent" :stroke-width="8" />
        <div class="download-actions">
          <el-button
            type="primary"
            :loading="downloading"
            :disabled="!chapterList.length"
            @click="handleDownloadToBookshelf"
          >
            {{
              downloading
                ? `导入中 ${downloadProgress.current}/${downloadProgress.total}`
                : '下载并加入书架'
            }}
          </el-button>
          <el-button :loading="downloading" :disabled="!chapterList.length" @click="handleExportTxt"
            >导出 TXT</el-button
          >
          <el-button @click="clearSelection">取消选择</el-button>
        </div>
      </aside>
    </main>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BOOK_TYPES } from '@renderer/constants/config'
import { createBook, getBookDir, readBooksDir, setBookDir } from '@renderer/service/books'
import { createChapterDocument, saveChapterDocument } from '@renderer/service/editor'
import {
  downloadNovelChapters,
  exportDownloadedNovelTextFile,
  getNovelBookInfo,
  getNovelChapterList,
  getNovelSources,
  normalizeDownloadedChapters,
  uniqueDownloadedBookName,
  searchNovel
} from '@renderer/service/novel'

const emit = defineEmits(['imported'])

const sources = ref([])
const currentSourceId = ref('')
const keyword = ref('')
const searching = ref(false)
const loadingChapters = ref(false)
const searchResult = ref([])
const selectedBook = ref(null)
const chapterList = ref([])
const limitChapterCount = ref(false)
const chapterLimit = ref(30)
const chapterLimitTouched = ref(false)
const downloading = ref(false)
const downloadProgress = ref({ current: 0, total: 0 })
const errorMsg = ref('')
const sourceErrors = ref([])

const progressPercent = computed(() => {
  const { current, total } = downloadProgress.value
  if (total <= 0) return 0
  return Math.round((current / total) * 100)
})

const sourceWarningText = computed(() => {
  if (!sourceErrors.value.length) return ''
  return `部分书源搜索失败：${sourceErrors.value.slice(0, 3).join('；')}`
})

const selectedChapterList = computed(() => {
  const list = chapterList.value || []
  if (!limitChapterCount.value) return list
  const limit = clampChapterLimit()
  return list.slice(0, limit)
})

const selectedChapterCount = computed(() => selectedChapterList.value.length)

async function getBooksDir() {
  return getBookDir()
}

async function setBooksDir(dir) {
  return setBookDir(dir)
}

async function loadSources() {
  try {
    sources.value = await getNovelSources()
    if (sources.value.length && !currentSourceId.value) {
      currentSourceId.value =
        sources.value.find((source) => source.id === 'all')?.id || sources.value[0].id
    }
  } catch (error) {
    errorMsg.value = error?.message || '读取书源失败'
  }
}

async function handleSearch() {
  const value = keyword.value.trim()
  if (!value) {
    ElMessage.warning('请输入书名或作者')
    return
  }
  searching.value = true
  errorMsg.value = ''
  sourceErrors.value = []
  searchResult.value = []
  selectedBook.value = null
  chapterList.value = []
  try {
    const result = await searchNovel(value, currentSourceId.value)
    sourceErrors.value = result.sourceErrors
    if (result.list.length) {
      searchResult.value = result.list
    } else {
      errorMsg.value = result.message || '没有找到相关小说'
    }
  } catch (error) {
    errorMsg.value = error?.message || '搜索失败'
  } finally {
    searching.value = false
  }
}

function setKeyword(value) {
  keyword.value = String(value || '')
}

defineExpose({
  sources,
  currentSourceId,
  searching,
  setKeyword,
  handleSearch
})

async function handleSelectBook(book) {
  selectedBook.value = book
  chapterList.value = []
  errorMsg.value = ''
  downloading.value = false
  loadingChapters.value = true
  downloadProgress.value = { current: 0, total: 0 }
  try {
    const [chapterResult, infoResult] = await Promise.allSettled([
      getNovelChapterList(book.url, book.sourceId),
      book.coverUrl
        ? Promise.resolve({ success: true, info: { coverUrl: book.coverUrl } })
        : getNovelBookInfo(book.url, book.sourceId)
    ])
    if (infoResult.status === 'fulfilled') {
      selectedBook.value = {
        ...book,
        coverUrl: readBookInfoCoverUrl(infoResult.value, book.coverUrl || '')
      }
    }
    if (chapterResult.status === 'rejected') {
      throw chapterResult.reason
    }
    const chapters = requireChapterListResult(chapterResult.value)
    chapterList.value = chapters
    applyDefaultChapterLimit(chapters.length)
  } catch (error) {
    errorMsg.value = error?.message || '读取章节目录失败'
  } finally {
    loadingChapters.value = false
  }
}

function clearSelection() {
  selectedBook.value = null
  chapterList.value = []
  chapterLimitTouched.value = false
  downloading.value = false
  downloadProgress.value = { current: 0, total: 0 }
}

function sanitizeChapterFileName(title, fallback) {
  const name = String(title || fallback || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return name || fallback || '第1章'
}

function makeUniqueChapterName(title, usedNames, fallback) {
  const base = sanitizeChapterFileName(title, fallback)
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`
    const candidate = `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
  }

  const candidate = `${base.slice(0, 66)}_${Date.now()}`
  usedNames.add(candidate)
  return candidate
}

function requireDownloadedBookCreateResult(result, expectedBookName) {
  if (result?.success !== true) {
    throw new Error(result?.message || '创建下载书失败')
  }
  if (typeof result.bookName !== 'string' || result.bookName !== expectedBookName) {
    throw new Error('创建下载书失败：接口返回的作品名不一致')
  }
  if (typeof result.bookPath !== 'string' || !result.bookPath.trim()) {
    throw new Error('创建下载书失败：接口没有返回作品路径')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('创建下载书失败：数据库写入未确认')
  }
  return result
}

function requireDownloadedChapterContentResult(result, fallback = '下载失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error(`${fallback}：正文为空`)
  }
  return { ...result, content }
}

function requireDownloadedChaptersResult(result, fallback = '下载失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (!Array.isArray(result.chapters)) {
    throw new Error(`${fallback}：接口返回章节格式不正确`)
  }
  if (!result.chapters.length) {
    throw new Error(result.message || fallback)
  }
  return result
}

function requireChapterListResult(result, fallback = '读取章节目录失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (!Array.isArray(result.chapters)) {
    throw new Error(`${fallback}：接口返回章节格式不正确`)
  }
  if (!result.chapters.length) {
    throw new Error(result.message || fallback)
  }
  return result.chapters
}

function readBookInfoCoverUrl(result, fallback = '') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || '读取书籍详情失败')
  }
  if (!result.info || typeof result.info !== 'object' || Array.isArray(result.info)) {
    throw new Error('读取书籍详情失败：接口返回格式不正确')
  }
  const coverUrl = result.info.coverUrl
  if (coverUrl != null && typeof coverUrl !== 'string') {
    throw new Error('读取书籍详情失败：封面格式不正确')
  }
  return coverUrl || fallback
}

function requireImportedBookVisible(books, expected = {}) {
  if (!Array.isArray(books)) {
    throw new Error('导入失败：书架刷新结果格式不正确')
  }
  const expectedName = String(expected.name || '').trim()
  const expectedId = String(expected.id || '').trim()
  const found = books.some((book) => {
    const names = [book?.name, book?.folderName, book?.id].map((value) =>
      String(value || '').trim()
    )
    return (
      (expectedName && names.includes(expectedName)) || (expectedId && names.includes(expectedId))
    )
  })
  if (!found) {
    throw new Error('导入失败：书架刷新后未找到新作品')
  }
  return true
}

async function handleDownloadToBookshelf() {
  const book = selectedBook.value
  const targetChapters = selectedChapterList.value
  if (!book || !targetChapters.length) return

  const booksDir = await getBooksDir().catch((error) => {
    errorMsg.value = error?.message || '读取书架目录失败'
    return ''
  })
  if (!booksDir) {
    ElMessage.warning('请先设置书架目录')
    return
  }
  try {
    await setBooksDir(booksDir)
  } catch (error) {
    errorMsg.value = error?.message || '保存书架目录失败'
    return
  }

  try {
    const rangeText =
      targetChapters.length === chapterList.value.length
        ? `共 ${targetChapters.length} 章`
        : `本次导入前 ${targetChapters.length} 章，原书共 ${chapterList.value.length} 章`
    await ElMessageBox.confirm(
      `确定下载《${book.title}》并加入书架吗？${rangeText}。`,
      '确认导入',
      {
        confirmButtonText: '导入',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
  } catch {
    return
  }

  downloading.value = true
  downloadProgress.value = { current: 0, total: targetChapters.length }
  errorMsg.value = ''

  try {
    const downloadedChapters = await downloadChapters(book, targetChapters)
    const chapters = normalizeDownloadedChapters(downloadedChapters)
    if (!chapters.length) {
      ElMessage.error('没有下载到可保存的正文')
      return
    }
    if (chapters.length < downloadedChapters.length) {
      ElMessage.warning(
        `已跳过 ${downloadedChapters.length - chapters.length} 章失败或空正文，保存 ${chapters.length} 章`
      )
    }
    const imported = await createDownloadedBook(book, chapters)
    requireImportedBookVisible(await readBooksDir(), imported)
    ElMessage.success(`《${book.title}》已加入书架，共 ${chapters.length} 章`)
    emit('imported', imported)
    clearSelection()
  } catch (error) {
    errorMsg.value = error?.message || '导入失败'
  } finally {
    downloading.value = false
  }
}

async function downloadChapters(book, chaptersToDownload = selectedChapterList.value) {
  const targetChapters = chaptersToDownload || []
  const result = requireDownloadedChaptersResult(
    await downloadNovelChapters(targetChapters, book.sourceId)
  )
  downloadProgress.value = { current: targetChapters.length, total: targetChapters.length }
  return result.chapters
}

async function createDownloadedBook(book, chapters) {
  const existingBooks = await readBooksDir()
  const safeName = uniqueDownloadedBookName(book.title, existingBooks)
  const bookId = Date.now().toString() + Math.floor(Math.random() * 10000).toString()
  const type = 'xuanhua'
  const typeName = BOOK_TYPES.find((item) => item.value === type)?.label || '玄幻'
  const totalWords = chapters.reduce(
    (sum, chapter) => sum + (chapter.content || '').replace(/[\s\n\r\t]/g, '').length,
    0
  )

  const createResult = await createBook({
    id: bookId,
    name: safeName,
    type,
    typeName,
    targetCount: 0,
    totalWords,
    intro: '从网络下载导入的小说，可阅读、拆书或作为参考资料使用。',
    sourceType: 'downloaded',
    downloaded: true,
    bookRole: 'downloaded',
    importedFrom: 'novelDownload',
    password: null,
    coverColor: '#6f7a68',
    coverUrl: null,
    coverImagePath: null,
    coverRemoteUrl: book.coverUrl || null
  })
  requireDownloadedBookCreateResult(createResult, safeName)

  const usedChapterNames = new Set()
  const firstChapterName = makeUniqueChapterName(chapters[0].title, usedChapterNames, '第1章')
  await saveChapter(safeName, '第1章', firstChapterName, chapters[0].content)
  for (let index = 1; index < chapters.length; index++) {
    downloadProgress.value = { current: index + 1, total: chapters.length }
    const chapterName = await createChapterName(safeName)
    const targetChapterName = makeUniqueChapterName(
      chapters[index].title,
      usedChapterNames,
      chapterName
    )
    await saveChapter(safeName, chapterName, targetChapterName, chapters[index].content)
  }

  return { id: bookId, name: safeName, source: 'downloaded' }
}

async function createChapterName(bookName) {
  const result = await createChapterDocument(bookName, '正文')
  return result.chapterName
}

async function saveChapter(bookName, chapterName, targetName, content) {
  const newName = targetName && targetName !== chapterName ? targetName : null
  return saveChapterDocument({
    bookName,
    volumeName: '正文',
    chapterName,
    newName,
    content
  })
}

async function handleExportTxt() {
  const book = selectedBook.value
  const targetChapters = selectedChapterList.value
  if (!book || !targetChapters.length) return
  downloading.value = true
  downloadProgress.value = { current: 0, total: targetChapters.length }
  try {
    const result = requireDownloadedChaptersResult(
      await downloadNovelChapters(targetChapters, book.sourceId)
    )
    const chapters = normalizeDownloadedChapters(result.chapters)
    if (!chapters.length) {
      ElMessage.error('没有下载到可导出的正文')
      return
    }
    if (chapters.length < result.chapters.length) {
      ElMessage.warning(`已跳过 ${result.chapters.length - chapters.length} 章失败或空正文`)
    }
    const content = chapters.map((chapter) => `${chapter.title}\n\n${chapter.content}\n\n`).join('')
    const exportResult = await exportDownloadedNovelTextFile({
      title: book.title,
      content,
      dialogTitle: '保存 TXT',
      textFileLabel: '文本文件'
    })
    if (!exportResult) return
    ElMessage.success('TXT 已导出')
  } catch (error) {
    ElMessage.error(error?.message || '导出失败')
  } finally {
    downloading.value = false
  }
}

function sourceName(id) {
  return sources.value.find((source) => source.id === id)?.name || id || '未知书源'
}

function clampChapterLimit() {
  const total = chapterList.value.length
  const value = Number(chapterLimit.value) || 1
  return Math.min(Math.max(1, value), Math.max(1, total))
}

function markLimitTouched() {
  chapterLimitTouched.value = true
  chapterLimit.value = clampChapterLimit()
}

function applyDefaultChapterLimit(total) {
  if (chapterLimitTouched.value) {
    chapterLimit.value = clampChapterLimit()
    return
  }
  if (total > 200) {
    limitChapterCount.value = true
    chapterLimit.value = Math.min(30, total)
    return
  }
  limitChapterCount.value = false
  chapterLimit.value = Math.min(30, Math.max(1, total))
}

onMounted(() => {
  loadSources()
})

</script>

<style lang="scss" scoped>
.novel-import-panel {
  display: grid;
  gap: 16px;
  color: #3a3731;
}

.result-panel,
.download-panel {
  border: 1px solid rgba(168, 125, 61, 0.16);
  background: rgba(255, 250, 242, 0.9);
  box-shadow: 0 16px 38px rgba(64, 45, 20, 0.07);
}

.inline-alert {
  border-radius: 12px;
}

.import-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;

  &.has-selected-book {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

.result-panel,
.download-panel {
  border-radius: 20px;
  padding: 18px;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;

  h3 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: #756b5b;
    font-size: 13px;
  }
}

.result-list {
  display: grid;
  gap: 10px;
  max-height: 430px;
  overflow: auto;
  padding-right: 4px;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 14px;
  border: 1px solid rgba(168, 125, 61, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.56);
  cursor: pointer;

  &.selected,
  &:hover {
    border-color: rgba(168, 125, 61, 0.34);
    background: #fff6df;
  }

  h4 {
    margin: 0 0 5px;
    color: #3a3731;
    font-size: 15px;
  }

  p {
    margin: 0;
    color: #756b5b;
    font-size: 13px;
  }
}

.soft-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 240px;
  color: #756b5b;
  text-align: center;

  strong {
    color: #3a3731;
  }
}

.download-panel {
  align-self: start;
  position: sticky;
  top: 16px;

  h3 {
    margin: 10px 0 8px;
    color: #3a3731;
    font-size: 20px;
    line-height: 1.4;
  }

  p {
    margin: 0 0 14px;
    color: #756b5b;
  }
}

.type-pill {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(111, 122, 104, 0.1);
  color: var(--wabi-moss-dark);
  font-size: 12px;
}

.chapter-preview {
  display: grid;
  gap: 8px;
  margin: 14px 0 18px;

  span {
    overflow: hidden;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(36, 48, 73, 0.05);
    color: #4d566b;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.chapter-range {
  display: grid;
  gap: 8px;
  margin: 0 0 16px;
  padding: 12px;
  border: 1px solid rgba(168, 125, 61, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);

  p {
    margin: 0;
    color: #756b5b;
    font-size: 12px;
  }
}

.range-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4d4436;
  font-size: 13px;

  :deep(.el-input-number) {
    width: 96px;
  }
}

.download-actions {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

@media (max-width: 980px) {
  .import-body {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <div class="import-export-page">
    <div
      v-if="!embedded"
      class="module-local-actions"
    >
      <el-button
        :loading="loadingBooks || loadingTasks"
        @click="loadData"
      >
        <RefreshCw :size="16" />
        <span>刷新</span>
      </el-button>
    </div>

    <main class="tool-layout">
      <section
        v-if="showSection('import')"
        class="panel panel-wide"
      >
        <div class="panel-title">
          <div>
            <h2>导入</h2>
            <p>选择文件后自动解析书名和章节，确认无误后写入书库。</p>
          </div>
          <FileUp :size="22" />
        </div>

        <div class="form-grid">
          <label class="file-picker">
            <input
              accept=".txt,.md,.markdown,.docx"
              :disabled="previewing || importing"
              type="file"
              @change="handleImportFileChange"
            >
            <Upload :size="20" />
            <span>{{ importForm.fileName || '选择 TXT、Markdown 或 DOCX' }}</span>
          </label>
          <div class="button-row">
            <el-button
              :disabled="!importForm.base64 || importing"
              :loading="previewing"
              @click="handlePreviewImport"
            >
              重新解析
            </el-button>
            <el-button
              type="primary"
              :disabled="!preview || previewing"
              :loading="importing"
              @click="handleImportBook"
            >
              写入书库
            </el-button>
          </div>
        </div>

        <div
          v-if="preview"
          class="preview-box"
        >
          <div class="preview-summary">
            <strong>{{ preview.bookName }}</strong>
            <strong>{{ preview.chapterCount }} 章</strong>
            <span>{{ formatNumber(preview.wordCount) }} 字</span>
            <span>{{ preview.fileName }}</span>
          </div>
          <div class="chapter-preview-list">
            <article
              v-for="chapter in preview.chapters.slice(0, 8)"
              :key="chapter.index"
            >
              <b>{{ chapter.index }}. {{ chapter.title }}</b>
              <small>{{ formatNumber(chapter.wordCount) }} 字</small>
              <p>{{ chapter.preview || '空章节' }}</p>
            </article>
          </div>
        </div>
      </section>

      <section
        v-if="showSection('export')"
        class="panel panel-wide"
      >
        <div class="panel-title">
          <div>
            <h2>导出</h2>
            <p>导出当前书籍为 TXT、Markdown，或生成完整项目包。</p>
          </div>
          <FileDown :size="22" />
        </div>

        <div
          v-if="booksLoadError"
          class="read-error-card"
          role="alert"
        >
          <strong>读取书架失败</strong>
          <span>{{ booksLoadError }}</span>
          <el-button
            type="primary"
            plain
            :loading="loadingBooks"
            @click="retryLoadBooks"
          >
            重试
          </el-button>
        </div>

        <div class="form-grid">
          <el-select
            v-model="exportForm.bookName"
            filterable
            placeholder="选择书籍"
            :disabled="!!booksLoadError"
          >
            <el-option
              v-for="book in books"
              :key="book.folderName || book.name"
              :label="book.name"
              :value="book.name"
            />
          </el-select>
          <el-radio-group v-model="exportForm.format">
            <el-radio-button label="txt">
              TXT
            </el-radio-button>
            <el-radio-button label="md">
              Markdown
            </el-radio-button>
            <el-radio-button label="project">
              项目包
            </el-radio-button>
          </el-radio-group>
          <el-button
            type="primary"
            :disabled="!exportForm.bookName || !!booksLoadError || exporting"
            :loading="exporting"
            @click="handleExport"
          >
            导出
          </el-button>
        </div>

        <div
          v-if="lastExport"
          class="result-box"
        >
          <b>{{ lastExport.fileName }}</b>
          <span>{{ formatSize(lastExport.size) }}</span>
          <small :title="lastExport.filePath">{{ lastExport.filePath }}</small>
        </div>
      </section>

      <section
        v-if="showSection('backup')"
        class="panel panel-wide"
      >
        <div class="panel-title">
          <div>
            <h2>备份与恢复</h2>
            <p>备份会生成 zip，恢复时可加入当前书库，也可写入新目录。</p>
          </div>
          <ArchiveRestore :size="22" />
        </div>

        <div
          v-if="booksLoadError"
          class="read-error-card"
          role="alert"
        >
          <strong>读取书架失败</strong>
          <span>{{ booksLoadError }}</span>
          <el-button
            type="primary"
            plain
            :loading="loadingBooks"
            @click="retryLoadBooks"
          >
            重试
          </el-button>
        </div>

        <div class="form-grid">
          <el-radio-group
            v-model="backupForm.scope"
            :disabled="!!booksLoadError"
          >
            <el-radio-button label="library">
              整个书库
            </el-radio-button>
            <el-radio-button label="book">
              单本书
            </el-radio-button>
          </el-radio-group>
          <el-select
            v-if="backupForm.scope === 'book'"
            v-model="backupForm.bookName"
            filterable
            placeholder="选择书籍"
            :disabled="!!booksLoadError || backingUp"
          >
            <el-option
              v-for="book in books"
              :key="book.folderName || book.name"
              :label="book.name"
              :value="book.name"
            />
          </el-select>
          <el-button
            :disabled="!!booksLoadError"
            :loading="backingUp"
            type="primary"
            @click="handleCreateBackup"
          >
            创建备份
          </el-button>
        </div>

        <div class="restore-box">
          <label class="file-picker">
            <input
              accept=".zip"
              :disabled="inspecting || restoring"
              type="file"
              @change="handleBackupFileChange"
            >
            <Upload :size="20" />
            <span>{{ restoreForm.fileName || '选择备份 zip' }}</span>
          </label>
          <el-radio-group
            v-model="restoreForm.mode"
            @change="handleRestoreModeChange"
          >
            <el-radio-button label="library">
              加入当前书库
            </el-radio-button>
            <el-radio-button label="archive">
              恢复到新目录
            </el-radio-button>
          </el-radio-group>
          <el-input
            v-if="restoreForm.mode === 'archive'"
            v-model="restoreForm.targetDir"
            clearable
            :placeholder="restoreForm.suggestedTargetDir || '恢复到新目录，留空则自动生成'"
          />
          <div class="button-row">
            <el-button
              :disabled="!restoreForm.base64 || restoring"
              :loading="inspecting"
              @click="handleInspectBackup"
            >
              检查结构
            </el-button>
            <el-button
              type="success"
              :disabled="!restoreSummary || inspecting"
              :loading="restoring"
              @click="handleRestoreBackup"
            >
              恢复
            </el-button>
          </div>
        </div>

        <div
          v-if="restoreSummary"
          class="result-box"
        >
          <b>{{ restoreSummary.bookCount || restoreSummary.maziCount }} 本书</b>
          <span>{{ restoreSummary.fileCount }} 个文件</span>
          <span>{{ formatSize(restoreSummary.totalSize) }}</span>
          <small>{{ restoreSummary.maziCount }} 个书籍元数据文件</small>
        </div>
        <div
          v-if="restoreSummary?.books?.length"
          class="restore-book-list"
        >
          <span
            v-for="book in restoreSummary.books"
            :key="book.root || book.name"
          >
            {{ book.name }} · {{ book.fileCount }} 个文件
          </span>
        </div>
      </section>

      <section
        v-if="showSection('jobs')"
        class="panel panel-wide"
      >
        <div class="panel-title">
          <div>
            <h2>任务记录</h2>
            <p>最近的导入、导出和备份操作。</p>
          </div>
          <History :size="22" />
        </div>

        <el-empty
          v-if="tasks.length === 0"
          description="暂无记录"
        />
        <div
          v-else
          class="task-list"
        >
          <article
            v-for="task in tasks"
            :key="task.id"
          >
            <span>{{ taskTypeLabel(task.type) }}</span>
            <b>{{ task.title }}</b>
            <small>{{ formatDate(task.createdAt) }}</small>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArchiveRestore, FileDown, FileUp, History, RefreshCw, Upload } from 'lucide-vue-next'
import {
  createLibraryBackup,
  downloadBase64File,
  downloadTextFile,
  exportBookFile,
  importBookFromFile,
  inspectLibraryBackup,
  listImportExportTasks,
  previewImportBook,
  restoreLibraryBackup
} from '../service/importExport'
import { readBooksDir } from '../service/books'

const route = useRoute()
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})
const books = ref([])
const tasks = ref([])
const preview = ref(null)
const lastExport = ref(null)
const restoreSummary = ref(null)
const previewing = ref(false)
const importing = ref(false)
const exporting = ref(false)
const backingUp = ref(false)
const inspecting = ref(false)
const restoring = ref(false)
const loadingBooks = ref(false)
const loadingTasks = ref(false)
const booksLoadError = ref('')

const importForm = reactive({
  fileName: '',
  base64: '',
  format: ''
})

const exportForm = reactive({
  bookName: '',
  format: 'txt'
})

const backupForm = reactive({
  scope: 'library',
  bookName: ''
})

const restoreForm = reactive({
  fileName: '',
  base64: '',
  mode: 'library',
  targetDir: '',
  suggestedTargetDir: ''
})

const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024

const activeSection = computed(() => {
  if (props.embedded) return 'all'
  const tab = String(route.query.tab || '')
  if (['import', 'export', 'backup', 'jobs'].includes(tab)) return tab
  const segment = route.path.split('/').filter(Boolean).at(-1)
  if (['import', 'export', 'backup', 'jobs'].includes(segment)) return segment
  return 'import'
})

function showSection(section) {
  return activeSection.value === 'all' || activeSection.value === section
}

function requireImportExportSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requirePreviewResult(result) {
  const ok = requireImportExportSuccess(result, '预览失败')
  if (!ok.preview || !Array.isArray(ok.preview.chapters)) {
    throw new Error('预览失败：后端没有返回章节预览')
  }
  return ok.preview
}

function requireImportedBookResult(result) {
  const ok = requireImportExportSuccess(result, '导入失败')
  if (!ok.bookName) {
    throw new Error('导入失败：后端没有返回书名')
  }
  return ok
}

function requireDownloadResult(result, fallback = '导出失败') {
  const ok = requireImportExportSuccess(result, fallback)
  if (!ok.fileName) {
    throw new Error(`${fallback}：后端没有返回文件名`)
  }
  if (!ok.downloadBase64 && typeof ok.content !== 'string') {
    throw new Error(`${fallback}：后端没有返回可下载内容`)
  }
  return ok
}

function requireBackupResult(result) {
  const ok = requireImportExportSuccess(result, '备份失败')
  if (!ok.fileName || !ok.downloadBase64) {
    throw new Error('备份失败：后端没有返回备份文件')
  }
  return ok
}

function requireInspectResult(result) {
  const ok = requireImportExportSuccess(result, '检查失败')
  if (!ok.summary || typeof ok.summary !== 'object') {
    throw new Error('检查失败：后端没有返回备份结构')
  }
  return ok
}

function requireRestoreResult(result) {
  const ok = requireImportExportSuccess(result, '恢复失败')
  if (ok.mode === 'library') {
    if (!Array.isArray(ok.restoredBooks)) {
      throw new Error('恢复失败：后端没有返回恢复书籍')
    }
  } else if (!ok.targetDir) {
    throw new Error('恢复失败：后端没有返回恢复目录')
  }
  return ok
}

function requireTaskListResult(result) {
  const ok = requireImportExportSuccess(result, '加载任务记录失败')
  if (!Array.isArray(ok.items)) {
    throw new Error('加载任务记录失败：后端没有返回任务列表')
  }
  return ok.items
}

async function readFileAsBase64(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return dataUrl.split(',').pop() || ''
}

async function handleImportFileChange(event) {
  const file = event.target.files?.[0]
  if (!file || previewing.value || importing.value) return
  preview.value = null
  importForm.fileName = file.name
  importForm.base64 = ''
  try {
    if (file.size === 0) {
      throw new Error('导入文件不能为空')
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      throw new Error('导入文件不能超过 50 MB')
    }
    importForm.base64 = await readFileAsBase64(file)
    await handlePreviewImport()
  } catch (error) {
    ElMessage.error(error?.message || '读取导入文件失败')
  } finally {
    event.target.value = ''
  }
}

async function handleBackupFileChange(event) {
  const file = event.target.files?.[0]
  if (!file || inspecting.value || restoring.value) return
  restoreSummary.value = null
  restoreForm.fileName = file.name
  restoreForm.base64 = ''
  restoreForm.targetDir = ''
  restoreForm.suggestedTargetDir = ''
  try {
    restoreForm.base64 = await readFileAsBase64(file)
  } catch (error) {
    ElMessage.error(error?.message || '读取备份文件失败')
  } finally {
    event.target.value = ''
  }
}

function importPayload() {
  return {
    fileName: importForm.fileName,
    base64: importForm.base64
  }
}

async function handlePreviewImport() {
  if (previewing.value || importing.value || !importForm.base64) return
  previewing.value = true
  try {
    const result = requirePreviewResult(await previewImportBook(importPayload()))
    preview.value = result
    ElMessage.success('章节预览已生成')
  } catch (error) {
    ElMessage.error(error?.message || '预览失败')
  } finally {
    previewing.value = false
  }
}

async function handleImportBook() {
  if (importing.value || previewing.value || !preview.value) return
  importing.value = true
  try {
    const result = requireImportedBookResult(await importBookFromFile(importPayload()))
    ElMessage.success(`已导入：${result.bookName}`)
    preview.value = null
    importForm.base64 = ''
    await loadData()
  } catch (error) {
    ElMessage.error(error?.message || '导入失败')
  } finally {
    importing.value = false
  }
}

async function handleExport() {
  if (exporting.value) return
  if (booksLoadError.value) {
    ElMessage.error(booksLoadError.value)
    return
  }
  exporting.value = true
  try {
    const result = requireDownloadResult(await exportBookFile({ ...exportForm }), '导出失败')
    lastExport.value = result
    if (result.downloadBase64) {
      downloadBase64File(result.fileName, result.downloadBase64, result.mimeType)
    } else {
      downloadTextFile(result.fileName, result.content, result.mimeType)
    }
    ElMessage.success('导出完成')
    await loadTasks()
  } catch (error) {
    ElMessage.error(error?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function handleCreateBackup() {
  if (backingUp.value) return
  if (booksLoadError.value) {
    ElMessage.error(booksLoadError.value)
    return
  }
  if (backupForm.scope === 'book' && !backupForm.bookName) {
    ElMessage.warning('请选择书籍')
    return
  }
  backingUp.value = true
  try {
    const result = requireBackupResult(await createLibraryBackup({ ...backupForm }))
    downloadBase64File(result.fileName, result.downloadBase64, result.mimeType)
    lastExport.value = result
    ElMessage.success('备份已创建')
    await loadTasks()
  } catch (error) {
    ElMessage.error(error?.message || '备份失败')
  } finally {
    backingUp.value = false
  }
}

async function handleInspectBackup() {
  if (inspecting.value || restoring.value || !restoreForm.base64) return
  inspecting.value = true
  try {
    const result = requireInspectResult(
      await inspectLibraryBackup({
        fileName: restoreForm.fileName,
        base64: restoreForm.base64
      })
    )
    restoreSummary.value = result.summary
    restoreForm.suggestedTargetDir = result.suggestedTargetDir || ''
    if (restoreForm.mode === 'archive' && !restoreForm.targetDir) {
      restoreForm.targetDir = restoreForm.suggestedTargetDir
    }
    ElMessage.success('备份包结构可恢复')
  } catch (error) {
    ElMessage.error(error?.message || '检查失败')
  } finally {
    inspecting.value = false
  }
}

async function handleRestoreBackup() {
  if (restoring.value || inspecting.value || !restoreSummary.value) return
  try {
    await ElMessageBox.confirm(
      restoreForm.mode === 'library'
        ? '恢复内容将写入当前书库。遇到同名书籍时会按备份规则处理，是否继续？'
        : '备份内容将写入指定的新目录，是否继续？',
      '确认恢复备份',
      {
        confirmButtonText: '确认恢复',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }
  if (restoring.value || !restoreSummary.value) return
  restoring.value = true
  try {
    const payload = {
      fileName: restoreForm.fileName,
      base64: restoreForm.base64,
      restoreMode: restoreForm.mode
    }
    if (restoreForm.mode === 'archive') {
      payload.targetDir = restoreForm.targetDir || restoreForm.suggestedTargetDir
    }
    const result = requireRestoreResult(await restoreLibraryBackup(payload))
    if (result.mode === 'library') {
      const count = result.bookCount || result.restoredBooks?.length || 0
      ElMessage.success(`已恢复 ${count} 本书到当前书库`)
    } else {
      ElMessage.success(`已恢复到：${result.targetDir}`)
    }
    restoreSummary.value = null
    await loadData()
  } catch (error) {
    ElMessage.error(error?.message || '恢复失败')
  } finally {
    restoring.value = false
  }
}

function handleRestoreModeChange() {
  if (restoreForm.mode === 'archive' && !restoreForm.targetDir && restoreForm.suggestedTargetDir) {
    restoreForm.targetDir = restoreForm.suggestedTargetDir
  }
}

async function loadBooks() {
  loadingBooks.value = true
  booksLoadError.value = ''
  try {
    books.value = await readBooksDir()
  } catch (error) {
    books.value = []
    exportForm.bookName = ''
    backupForm.bookName = ''
    booksLoadError.value = error?.message || '读取书架失败'
    throw error
  } finally {
    loadingBooks.value = false
  }
  if (!exportForm.bookName && books.value[0]) exportForm.bookName = books.value[0].name
  if (!backupForm.bookName && books.value[0]) backupForm.bookName = books.value[0].name
}

async function retryLoadBooks() {
  try {
    await loadBooks()
  } catch (error) {
    ElMessage.error(error?.message || '读取书架失败')
  }
}

async function loadTasks() {
  loadingTasks.value = true
  try {
    tasks.value = requireTaskListResult(await listImportExportTasks())
  } finally {
    loadingTasks.value = false
  }
}

async function loadData() {
  try {
    await Promise.all([loadBooks(), loadTasks()])
  } catch (error) {
    ElMessage.error(error?.message || '加载失败')
  }
}

function taskTypeLabel(type) {
  const map = {
    import: '导入',
    export: '导出',
    backup: '备份',
    restore: '恢复'
  }
  return map[type] || '任务'
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function formatSize(size) {
  const value = Number(size || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.import-export-page {
  color: var(--text-base);
}

.module-local-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.tool-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
  gap: 18px;
}

.panel {
  background: var(--bg-soft);
  border-radius: 8px;
  box-shadow: var(--neu-shadow-raised);
  padding: 18px;
}

.task-panel {
  grid-column: span 2;
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 16px;

  h2 {
    margin: 0 0 5px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--text-gray);
  }
}

.read-error-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
  border: 1px solid rgba(154, 78, 56, 0.32);
  border-radius: 8px;
  background: rgba(154, 78, 56, 0.08);
  color: #7b3f31;
  line-height: 1.6;
  padding: 10px 12px;

  span {
    min-width: 0;
  }

  :deep(.el-button) {
    flex: 0 0 auto;
  }
}

.form-grid,
.restore-box {
  display: grid;
  gap: 12px;
}

.button-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.file-picker {
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  min-height: 54px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-gray);
  cursor: pointer;

  input {
    display: none;
  }

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
}

.preview-box,
.result-box {
  margin-top: 16px;
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 14px;
}

.restore-book-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;

  span {
    background: var(--bg-primary);
    border-radius: 8px;
    color: var(--text-gray);
    font-size: 13px;
    padding: 6px 10px;
  }
}

.preview-summary,
.result-box {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;

  small {
    color: var(--text-gray);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.chapter-preview-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  max-height: 320px;
  overflow: auto;

  article {
    border-top: 1px solid var(--border-color);
    padding-top: 10px;
  }

  b,
  small {
    display: block;
  }

  small {
    color: var(--text-gray);
    margin: 4px 0;
  }

  p {
    margin: 0;
    color: var(--text-gray);
    line-height: 1.6;
  }
}

.task-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;

  article {
    background: var(--bg-primary);
    border-radius: 8px;
    padding: 12px;
    display: grid;
    gap: 6px;
  }

  span {
    color: var(--primary-color);
    font-size: 13px;
  }

  small {
    color: var(--text-gray);
  }
}

@media (max-width: 980px) {
  .tool-layout {
    grid-template-columns: 1fr;
  }

  .task-panel {
    grid-column: span 1;
  }
}
</style>

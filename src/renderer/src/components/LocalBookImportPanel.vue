<template>
  <section class="local-book-import-panel">
    <el-alert
      v-if="errorMsg"
      class="inline-alert"
      type="error"
      :title="errorMsg"
      show-icon
      closable
      @close="errorMsg = ''"
    />

    <div class="local-import-head">
      <div>
        <h3>本地书籍</h3>
        <p>TXT / MD / DOCX</p>
      </div>
      <div class="local-import-actions">
        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          multiple
          accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          @change="handleFileChange"
        />
        <el-button type="primary" :loading="parsing" @click="openFilePicker">
          <Upload :size="16" />
          选择文件
        </el-button>
        <el-button :loading="batchImporting" :disabled="!readyRows.length" @click="importReadyRows">
          全部加入书架
        </el-button>
      </div>
    </div>

    <label class="file-drop-zone" @dragover.prevent @drop.prevent="handleDrop">
      <input
        class="file-input"
        type="file"
        multiple
        accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        @change="handleFileChange"
      />
      <Upload :size="26" />
      <span>拖入文件，或选择文件</span>
    </label>

    <div v-if="rows.length" class="local-import-list">
      <article v-for="row in rows" :key="row.id" class="local-import-item" :class="row.status">
        <div class="file-state">
          <CheckCircle2 v-if="row.status === 'done'" :size="18" />
          <AlertCircle v-else-if="row.status === 'error'" :size="18" />
          <FileText v-else :size="18" />
        </div>
        <div class="file-main">
          <div class="file-title-line">
            <h4>{{ row.parsed?.title || row.fileName }}</h4>
            <span>{{ row.extension.toUpperCase() }}</span>
          </div>
          <p v-if="row.status === 'error'">{{ row.error }}</p>
          <p v-else>
            {{ formatWords(row.parsed?.totalWords) }} · {{ row.parsed?.chapterCount || 0 }} 章
          </p>
          <div v-if="row.parsed?.chapters?.length" class="chapter-preview">
            <span v-for="chapter in row.parsed.chapters.slice(0, 4)" :key="chapter.title">{{
              chapter.title
            }}</span>
          </div>
        </div>
        <el-button
          v-if="row.status !== 'done'"
          size="small"
          type="primary"
          :loading="row.status === 'importing'"
          :disabled="!canImportRow(row)"
          @click="importRow(row)"
        >
          {{ row.status === 'error' && row.parsed ? '重试' : '加入书架' }}
        </el-button>
        <span v-else class="done-label">已加入</span>
      </article>
    </div>

    <div v-else class="local-import-empty">
      <strong>等待本地文件</strong>
      <span>可一次选择多本书。</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { AlertCircle, CheckCircle2, FileText, Upload } from 'lucide-vue-next'
import { readBooksDir } from '@renderer/service/books'
import { importBookFromFile } from '@renderer/service/importExport'
import {
  getLocalBookFileExtension,
  isSupportedLocalBookFile,
  parseLocalBookFile,
  summarizeLocalBookImportResults,
  uniqueLocalBookName
} from '@renderer/service/localBookImport'

const emit = defineEmits(['imported'])

const fileInputRef = ref(null)
const rows = ref([])
const parsing = ref(false)
const batchImporting = ref(false)
const errorMsg = ref('')

const readyRows = computed(() => rows.value.filter((row) => row.status === 'ready'))

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  await parseFiles(files)
}

async function handleDrop(event) {
  const files = Array.from(event.dataTransfer?.files || [])
  await parseFiles(files)
}

async function parseFiles(files) {
  const targets = files.filter((file) => isSupportedLocalBookFile(file))
  const skipped = files.length - targets.length
  if (skipped > 0) {
    ElMessage.warning(`已跳过 ${skipped} 个不支持的文件`)
  }
  if (!targets.length) {
    if (files.length) errorMsg.value = '请选择 TXT、MD 或 DOCX 文件'
    return
  }

  parsing.value = true
  errorMsg.value = ''
  try {
    for (const file of targets) {
      const row = createPendingRow(file)
      rows.value.unshift(row)
      try {
        row.parsed = await parseLocalBookFile(file)
        row.status = 'ready'
      } catch (error) {
        row.status = 'error'
        row.error = error?.message || '解析失败'
      }
    }
  } finally {
    parsing.value = false
  }
}

async function importReadyRows() {
  const targets = [...readyRows.value]
  if (!targets.length) return
  try {
    await ElMessageBox.confirm(
      `确定将 ${targets.length} 本本地书籍加入书架吗？`,
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

  batchImporting.value = true
  let lastImported = null
  const results = []
  try {
    for (const row of targets) {
      const imported = await importRow(row, {
        silentConfirm: true,
        skipEmit: true,
        silentMessage: true
      })
      results.push({ success: Boolean(imported), row })
      lastImported = imported || lastImported
    }
    if (lastImported) {
      emit('imported', lastImported)
    }
    const summary = summarizeLocalBookImportResults(results)
    if (summary.failed) {
      ElMessage.warning(`导入完成：成功 ${summary.success} 本，失败 ${summary.failed} 本`)
    } else {
      ElMessage.success(`已将 ${summary.success} 本书加入书架`)
    }
  } finally {
    batchImporting.value = false
  }
}

async function importRow(row, options = {}) {
  if (!canImportRow(row)) return
  if (!options.silentConfirm) {
    try {
      await ElMessageBox.confirm(`确定将《${row.parsed.title}》加入书架吗？`, '确认导入', {
        confirmButtonText: '导入',
        cancelButtonText: '取消',
        type: 'info'
      })
    } catch {
      return
    }
  }

  row.status = 'importing'
  row.error = ''
  try {
    const imported = await createImportedBook(row)
    row.status = 'done'
    row.importedBookName = imported.name
    if (!options.silentMessage) {
      ElMessage.success(`《${imported.name}》已加入书架`)
    }
    if (!options.skipEmit) {
      emit('imported', imported)
    }
    return imported
  } catch (error) {
    row.status = 'error'
    row.error = error?.message || '导入失败'
    errorMsg.value = row.error
    return null
  }
}

function canImportRow(row) {
  return Boolean(row?.parsed) && ['ready', 'error'].includes(row.status)
}

async function createImportedBook(row) {
  const parsed = row.parsed
  const existingBooks = await readBooksDir()
  const bookName = uniqueLocalBookName(parsed.title, existingBooks)
  const result = await importBookFromFile({
    fileName: row.fileName,
    format: row.extension,
    bookName,
    chapters: parsed.chapters,
    intro: `从本地 ${row.extension.toUpperCase()} 文件导入，可阅读或作为参考资料使用。`,
    type: 'reference',
    typeName: '参考资料',
    coverColor: '#8a735d'
  })
  await readBooksDir()
  return {
    id: result.task?.id || result.bookName,
    name: result.bookName,
    source: 'file',
    extension: row.extension
  }
}

function createPendingRow(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    extension: getLocalBookFileExtension(file.name),
    status: 'parsing',
    parsed: null,
    error: ''
  }
}

function formatWords(value) {
  const count = Number(value || 0)
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 万字`
  return `${count.toLocaleString('zh-CN')} 字`
}

defineExpose({
  openFilePicker,
  parseFiles
})
</script>

<style lang="scss" scoped>
.local-book-import-panel {
  display: grid;
  gap: 14px;
  color: #3a3731;
}

.inline-alert {
  border-radius: 12px;
}

.local-import-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba(168, 125, 61, 0.16);
  border-radius: 16px;
  background: rgba(255, 250, 242, 0.9);
  box-shadow: 0 16px 38px rgba(64, 45, 20, 0.07);
  padding: 16px;

  h3 {
    margin: 0 0 4px;
    color: #3a3731;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: #756b5b;
    font-size: 13px;
  }
}

.local-import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;

  :deep(.el-button) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.file-drop-zone {
  display: grid;
  min-height: 120px;
  place-items: center;
  gap: 8px;
  border: 1px dashed rgba(111, 122, 104, 0.38);
  border-radius: 16px;
  background: rgba(251, 250, 246, 0.64);
  color: var(--wabi-muted);
  cursor: pointer;
  padding: 18px;

  svg {
    color: var(--wabi-moss-dark);
  }
}

.local-import-list {
  display: grid;
  gap: 10px;
}

.local-import-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  border: 1px solid rgba(168, 125, 61, 0.14);
  border-radius: 14px;
  background: rgba(255, 250, 242, 0.8);
  padding: 14px;

  &.done {
    border-color: rgba(111, 122, 104, 0.34);
  }

  &.error {
    border-color: rgba(154, 78, 56, 0.32);
    background: rgba(154, 78, 56, 0.06);
  }
}

.file-state {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: rgba(111, 122, 104, 0.1);
  color: var(--wabi-moss-dark);
}

.file-main {
  min-width: 0;

  p {
    margin: 6px 0 0;
    color: #756b5b;
    font-size: 13px;
  }
}

.file-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  h4 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #3a3731;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    border: 1px solid rgba(111, 122, 104, 0.16);
    border-radius: 5px;
    background: rgba(111, 122, 104, 0.08);
    color: var(--wabi-moss-dark);
    font-size: 12px;
    padding: 2px 6px;
  }
}

.chapter-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;

  span {
    max-width: 180px;
    overflow: hidden;
    border: 1px solid rgba(111, 122, 104, 0.14);
    border-radius: 5px;
    background: rgba(111, 122, 104, 0.06);
    color: #756b5b;
    font-size: 12px;
    padding: 4px 7px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.done-label {
  align-self: center;
  color: var(--wabi-moss-dark);
  font-size: 13px;
  font-weight: 700;
}

.local-import-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 110px;
  color: #756b5b;
  text-align: center;

  strong {
    color: #3a3731;
  }
}

@media (max-width: 760px) {
  .local-import-head {
    display: grid;
  }

  .local-import-actions {
    justify-content: stretch;

    :deep(.el-button) {
      width: 100%;
    }
  }

  .local-import-item {
    grid-template-columns: 28px minmax(0, 1fr);

    :deep(.el-button),
    .done-label {
      grid-column: 1 / -1;
      justify-self: stretch;
    }
  }
}
</style>

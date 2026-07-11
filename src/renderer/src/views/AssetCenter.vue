<template>
  <div class="asset-center-page">
    <div class="module-local-actions">
      <el-button :loading="loading" @click="loadAssets">
        <RefreshCw :size="16" />
        <span>刷新</span>
      </el-button>
    </div>

    <section class="summary-band">
      <button
        v-for="tab in typeTabs"
        :key="tab.key"
        type="button"
        :class="{ active: filters.type === tab.key }"
        @click="setType(tab.key)"
      >
        <component :is="tab.icon" :size="18" />
        <span>{{ tab.label }}</span>
        <b>{{ typeCount(tab.key) }}</b>
      </button>
    </section>

    <section class="filters-row">
      <el-input v-model="filters.keyword" clearable placeholder="搜索文件名、书名或路径">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select v-model="filters.bookName" clearable filterable placeholder="所有书籍">
        <el-option label="所有书籍" value="" />
        <el-option
          v-for="book in books"
          :key="book.folderName || book.name"
          :label="book.name"
          :value="book.name"
        />
      </el-select>
    </section>

    <main class="asset-layout">
      <section class="asset-list-panel">
        <div class="section-title">
          <div>
            <h2>{{ activeTabLabel }}</h2>
            <p>{{ filteredAssets.length }} 个文件</p>
          </div>
          <el-tag round>{{ summary.total || 0 }}</el-tag>
        </div>

        <div v-if="assetLoadError" class="asset-read-error">
          <span>{{ assetLoadError }}</span>
          <el-button size="small" :loading="loading" @click="loadAssets">重试</el-button>
        </div>
        <el-empty v-else-if="filteredAssets.length === 0" description="暂无素材" />
        <div v-else class="asset-grid">
          <article
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="asset-card"
            :class="{ selected: selectedAsset?.id === asset.id }"
            @click="selectedAsset = asset"
          >
            <div class="asset-preview">
              <img v-if="asset.isImage" :src="assetUrl(asset)" :alt="asset.name" loading="lazy" />
              <FileText v-else :size="34" />
              <span class="asset-type">{{ assetTypeLabel(asset) }}</span>
            </div>
            <div class="asset-info">
              <h3>{{ asset.name }}</h3>
              <p>{{ asset.bookName || '书库' }}</p>
              <small
                >{{ formatSize(asset.size) }} ·
                {{ formatDate(asset.mtime || asset.deletedAt) }}</small
              >
            </div>
          </article>
        </div>
      </section>

      <aside class="detail-panel">
        <template v-if="selectedAsset">
          <div class="detail-preview">
            <img
              v-if="selectedAsset.isImage"
              :src="assetUrl(selectedAsset)"
              :alt="selectedAsset.name"
            />
            <FileText v-else :size="46" />
          </div>
          <h2>{{ selectedAsset.name }}</h2>
          <div class="detail-list">
            <div>
              <span>类型</span>
              <b>{{ assetTypeLabel(selectedAsset) }}</b>
            </div>
            <div>
              <span>书籍</span>
              <b>{{ selectedAsset.bookName || '-' }}</b>
            </div>
            <div>
              <span>大小</span>
              <b>{{ formatSize(selectedAsset.size) }}</b>
            </div>
            <div>
              <span>路径</span>
              <b :title="selectedAsset.relativePath">{{ selectedAsset.relativePath }}</b>
            </div>
          </div>

          <div v-if="selectedAsset.status !== 'trash'" class="action-stack">
            <el-button type="primary" @click="openAttachDialog(selectedAsset)">
              <Link2 :size="16" />
              <span>关联到书籍</span>
            </el-button>
            <el-button type="danger" plain @click="handleDelete(selectedAsset)">
              <Trash2 :size="16" />
              <span>移入回收站</span>
            </el-button>
          </div>
          <div v-else class="action-stack">
            <el-button type="success" @click="handleRestore(selectedAsset)">
              <RotateCcw :size="16" />
              <span>恢复</span>
            </el-button>
          </div>
        </template>
        <el-empty v-else description="选择一个素材查看详情" />
      </aside>
    </main>

    <el-dialog v-model="attachDialogVisible" title="关联到书籍" width="460px">
      <el-form label-position="top">
        <el-form-item label="目标书籍">
          <el-select v-model="attachForm.bookName" filterable placeholder="选择书籍">
            <el-option
              v-for="book in books"
              :key="book.folderName || book.name"
              :label="book.name"
              :value="book.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="作为">
          <el-select v-model="attachForm.type">
            <el-option label="人物图" value="character" />
            <el-option label="场景图" value="scene" />
            <el-option label="地图素材" value="map" />
            <el-option label="附件" value="attachment" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="attachDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAttach">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  FileArchive,
  FileText,
  Images,
  Link2,
  Map,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserRound
} from 'lucide-vue-next'
import {
  attachAssetToBook,
  deleteAsset,
  findAssetReferences,
  getAssetUrl,
  listAssets,
  restoreAsset
} from '../service/assets'

const route = useRoute()
const loading = ref(false)
const assetLoadError = ref('')
const assets = ref([])
const books = ref([])
const selectedAsset = ref(null)
const summary = reactive({
  total: 0,
  byType: {}
})
const filters = reactive({
  type: 'all',
  bookName: '',
  keyword: ''
})
const attachDialogVisible = ref(false)
const attachForm = reactive({
  id: '',
  bookName: '',
  type: 'attachment'
})

const typeTabs = [
  { key: 'all', label: '全部', icon: Images },
  { key: 'character', label: '人物图', icon: UserRound },
  { key: 'scene', label: '场景图', icon: Images },
  { key: 'map', label: '地图素材', icon: Map },
  { key: 'attachment', label: '附件', icon: FileArchive },
  { key: 'trash', label: '回收站', icon: Trash2 }
]

const routeTypeMap = {
  '/assets/covers': 'all',
  '/assets/characters': 'character',
  '/assets/scenes': 'scene',
  '/assets/attachments': 'attachment',
  '/creative-library/assets': 'all'
}
const availableTypes = new Set(typeTabs.map((tab) => tab.key))

const filteredAssets = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return assets.value.filter((asset) => {
    if (
      filters.bookName &&
      asset.bookName !== filters.bookName &&
      asset.bookFolderName !== filters.bookName
    )
      return false
    if (!keyword) return true
    return [asset.name, asset.bookName, asset.type, asset.source, asset.relativePath]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})

const activeTabLabel = computed(() => {
  return typeTabs.find((tab) => tab.key === filters.type)?.label || '素材'
})

watch(
  () => [filters.type],
  () => loadAssets()
)

watch(
  () => [route.path, route.query.type],
  ([path, queryType]) => {
    const routeType = routeTypeMap[path]
    const nextType = availableTypes.has(queryType) ? queryType : routeType
    if (nextType && filters.type !== nextType) {
      filters.type = nextType
      selectedAsset.value = null
    }
  },
  { immediate: true }
)

function setType(type) {
  filters.type = type
  selectedAsset.value = null
}

function typeCount(type) {
  if (type === 'all') return summary.total || 0
  return summary.byType?.[type] || 0
}

function assetTypeLabel(asset) {
  const value = asset.status === 'trash' ? asset.originalType || 'trash' : asset.type
  const map = {
    cover: '封面',
    character: '人物图',
    scene: '场景图',
    map: '地图素材',
    attachment: '附件',
    trash: '回收站'
  }
  return map[value] || value || '素材'
}

function assetUrl(asset) {
  return getAssetUrl(asset)
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
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

async function loadAssets() {
  loading.value = true
  assetLoadError.value = ''
  try {
    const result = await listAssets({
      type: filters.type,
      includeTrash: filters.type === 'trash'
    })
    const checked = requireAssetListResult(result)
    const rows = checked.items
    assets.value = rows
    books.value = checked.books
    Object.assign(summary, normalizeAssetSummary(checked.summary, rows))
    if (selectedAsset.value && !assets.value.some((asset) => asset.id === selectedAsset.value.id)) {
      selectedAsset.value = assets.value[0] || null
    }
  } catch (error) {
    assets.value = []
    books.value = []
    filters.bookName = ''
    selectedAsset.value = null
    Object.assign(summary, { total: 0, byType: {} })
    assetLoadError.value = error?.message || '加载素材失败'
    ElMessage.error(assetLoadError.value)
  } finally {
    loading.value = false
  }
}

function requireAssetListResult(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || '加载素材失败')
  }
  if (!Array.isArray(result.items)) {
    throw new Error(result.message || result.error || '素材接口返回格式不正确')
  }
  if (!Array.isArray(result.books)) {
    throw new Error(result.message || result.error || '素材接口返回书籍列表格式不正确')
  }
  return result
}

function normalizeAssetSummary(value, rows) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      total: Number.isFinite(Number(value.total)) ? Number(value.total) : rows.length,
      byType: value.byType && typeof value.byType === 'object' ? value.byType : {}
    }
  }
  return { total: rows.length, byType: {} }
}

async function handleDelete(asset) {
  try {
    const references = await findAssetReferences(asset.id)
    if (references.length) {
      ElMessage.error(`该素材仍被引用，不能删除：${formatAssetReferences(references)}`)
      return
    }
    await ElMessageBox.confirm(`确定将「${asset.name}」移入回收站吗？`, '移入回收站', {
      type: 'warning',
      confirmButtonText: '移入回收站',
      cancelButtonText: '取消'
    })
    await deleteAsset(asset.id)
    ElMessage.success('已移入回收站')
    selectedAsset.value = null
    await loadAssets()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '删除失败')
  }
}

function formatAssetReferences(references) {
  return references
    .slice(0, 5)
    .map((item) => `${item.file}（${(item.fields || []).join('、')}）`)
    .join('；')
}

async function handleRestore(asset) {
  try {
    const result = await restoreAsset(asset.id)
    if (result?.success !== true || !result.item || !result.restoredPath) {
      throw new Error(result?.message || '恢复失败')
    }
    ElMessage.success('已恢复')
    selectedAsset.value = null
    await loadAssets()
  } catch (error) {
    ElMessage.error(error?.message || '恢复失败')
  }
}

function openAttachDialog(asset) {
  attachForm.id = asset.id
  attachForm.bookName = asset.bookName || books.value[0]?.name || ''
  attachForm.type = asset.type === 'trash' ? 'attachment' : asset.type
  attachDialogVisible.value = true
}

async function handleAttach() {
  if (!attachForm.bookName) {
    ElMessage.warning('请选择目标书籍')
    return
  }
  try {
    await attachAssetToBook({ ...attachForm })
    ElMessage.success('已关联到书籍')
    attachDialogVisible.value = false
    await loadAssets()
  } catch (error) {
    ElMessage.error(error?.message || '关联失败')
  }
}

onMounted(loadAssets)
</script>

<style lang="scss" scoped>
.asset-center-page {
  color: var(--text-base);
}

.module-local-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.summary-band {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;

  button {
    border: 1px solid var(--border-color);
    background: var(--bg-soft);
    color: var(--text-base);
    border-radius: 8px;
    padding: 12px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    cursor: pointer;
    min-width: 0;

    span {
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    b {
      color: var(--primary-color);
    }

    &.active,
    &:hover {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
  }
}

.filters-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 220px;
  gap: 12px;
  margin-bottom: 16px;
}

.asset-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: start;
}

.asset-list-panel,
.detail-panel {
  background: var(--bg-soft);
  border-radius: 8px;
  box-shadow: var(--neu-shadow-raised);
  padding: 18px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;

  h2 {
    margin: 0 0 4px;
    font-size: 17px;
  }

  p {
    margin: 0;
    color: var(--text-gray);
    font-size: 13px;
  }
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}

.asset-read-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 160px;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 14px;
  padding: 18px;
}

.asset-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.2s,
    transform 0.2s;

  &:hover,
  &.selected {
    border-color: var(--primary-color);
    transform: translateY(-2px);
  }
}

.asset-preview {
  position: relative;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(58, 55, 49, 0.06);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.asset-type {
  position: absolute;
  left: 8px;
  top: 8px;
  background: rgba(58, 55, 49, 0.7);
  color: var(--wabi-paper);
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 12px;
}

.asset-info {
  padding: 12px;

  h3 {
    margin: 0 0 6px;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p,
  small {
    margin: 0;
    color: var(--text-gray);
  }

  p {
    font-size: 13px;
    margin-bottom: 4px;
  }
}

.detail-panel {
  position: sticky;
  top: 18px;

  h2 {
    margin: 14px 0;
    font-size: 18px;
    word-break: break-all;
  }
}

.detail-preview {
  min-height: 220px;
  border-radius: 8px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
  }
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;

  div {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 10px;
  }

  span {
    color: var(--text-gray);
  }

  b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .el-button {
    width: 100%;
  }
}

@media (max-width: 980px) {
  .summary-band {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .asset-layout,
  .filters-row {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}
</style>

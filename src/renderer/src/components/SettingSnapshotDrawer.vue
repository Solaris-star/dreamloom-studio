<template>
  <el-drawer
    :model-value="modelValue"
    :title="t('settingSnapshot.title')"
    size="600px"
    direction="rtl"
    class="setting-snapshot-drawer"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="snapshot-content">
      <div class="snapshot-body">
        <div class="snapshot-actions">
          <el-button
            type="primary"
            :loading="creatingSnapshot"
            :disabled="snapshotActionRunning || loadingSnapshots"
            @click="handleCreate"
          >
            {{ t('settingSnapshot.create') }}
          </el-button>
        </div>

        <div
          v-if="snapshotLoadError"
          class="snapshot-read-error"
        >
          <span>{{ snapshotLoadError }}</span>
          <el-button
            type="primary"
            plain
            :loading="loadingSnapshots"
            @click="loadSnapshots"
          >
            {{ t('common.retry') }}
          </el-button>
        </div>

        <div
          v-else-if="loadingSnapshots"
          class="snapshot-loading"
        >
          <el-skeleton
            :rows="4"
            animated
          />
        </div>

        <el-timeline
          v-else-if="snapshotList.length > 0"
          class="snapshot-timeline"
        >
          <el-timeline-item
            v-for="snap in snapshotList"
            :key="snap.id"
            :timestamp="formatTime(snap.createdAt)"
            placement="top"
          >
            <el-card
              shadow="hover"
              class="snapshot-card"
            >
              <div class="snapshot-header">
                <span class="snapshot-name">{{ snap.name }}</span>
                <el-tag
                  size="small"
                  :type="triggerTagType(snap.triggerType)"
                >
                  {{ snap.triggerType }}
                </el-tag>
              </div>
              <div class="snapshot-btns">
                <el-button
                  size="small"
                  :loading="restoringSnapshotId === snap.id"
                  :disabled="snapshotActionRunning && restoringSnapshotId !== snap.id"
                  @click="handleRestore(snap)"
                >
                  {{ t('settingSnapshot.restore') }}
                </el-button>
                <el-button
                  size="small"
                  :disabled="snapshotActionRunning"
                  @click="openDiffDialog(snap)"
                >
                  {{ t('settingSnapshot.diff') }}
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  :loading="deletingSnapshotId === snap.id"
                  :disabled="snapshotActionRunning && deletingSnapshotId !== snap.id"
                  @click="handleDelete(snap)"
                >
                  {{ t('settingSnapshot.delete') }}
                </el-button>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>

        <el-empty
          v-else
          :description="t('settingSnapshot.emptyHint')"
        />
      </div>
    </div>

    <el-dialog
      v-model="diffVisible"
      :title="t('settingSnapshot.diffTitle')"
      width="80%"
      destroy-on-close
      append-to-body
    >
      <div class="diff-select-row">
        <el-select
          v-model="diffLeftId"
          :placeholder="t('settingSnapshot.selectLeft')"
          style="width: 45%"
        >
          <el-option
            v-for="s in snapshotList"
            :key="s.id"
            :label="s.name"
            :value="s.id"
          />
        </el-select>
        <span class="diff-vs">VS</span>
        <el-select
          v-model="diffRightId"
          :placeholder="t('settingSnapshot.selectRight')"
          style="width: 45%"
        >
          <el-option
            v-for="s in snapshotList"
            :key="s.id"
            :label="s.name"
            :value="s.id"
          />
        </el-select>
      </div>
      <el-button
        type="primary"
        :loading="diffLoading"
        :disabled="!diffLeftId || !diffRightId"
        style="margin-top: 12px"
        @click="handleDiff"
      >
        {{ t('settingSnapshot.compare') }}
      </el-button>
      <div
        v-if="diffResult"
        class="diff-result"
      >
        <div class="diff-pane">
          <div class="diff-pane-title">
            新增 {{ diffResult.added.length }}
          </div>
          <el-scrollbar max-height="400px">
            <div
              v-if="diffResult.added.length"
              class="diff-list"
            >
              <div
                v-for="item in diffResult.added"
                :key="`added-${item.path}`"
                class="diff-row diff-added-row"
              >
                <span class="diff-path">{{ item.path }}</span>
                <span class="diff-desc">{{ item.introduction || '无简介' }}</span>
              </div>
            </div>
            <el-empty
              v-else
              description="无新增设定"
              :image-size="64"
            />
          </el-scrollbar>
        </div>
        <div class="diff-pane">
          <div class="diff-pane-title">
            删除 {{ diffResult.removed.length }}
          </div>
          <el-scrollbar max-height="400px">
            <div
              v-if="diffResult.removed.length"
              class="diff-list"
            >
              <div
                v-for="item in diffResult.removed"
                :key="`removed-${item.path}`"
                class="diff-row diff-removed-row"
              >
                <span class="diff-path">{{ item.path }}</span>
                <span class="diff-desc">{{ item.introduction || '无简介' }}</span>
              </div>
            </div>
            <el-empty
              v-else
              description="无删除设定"
              :image-size="64"
            />
          </el-scrollbar>
        </div>
        <div class="diff-pane">
          <div class="diff-pane-title">
            修改 {{ diffResult.modified.length }}
          </div>
          <el-scrollbar max-height="400px">
            <div
              v-if="diffResult.modified.length"
              class="diff-list"
            >
              <div
                v-for="item in diffResult.modified"
                :key="`modified-${item.path}`"
                class="diff-row diff-modified-row"
              >
                <span class="diff-path">{{ item.path }}</span>
                <span class="diff-desc">{{ item.introduction || '无简介' }}</span>
              </div>
            </div>
            <el-empty
              v-else
              description="无修改设定"
              :image-size="64"
            />
          </el-scrollbar>
        </div>
      </div>
    </el-dialog>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import {
  createSettingSnapshot,
  deleteSettingSnapshot,
  diffSettingSnapshots,
  listSettingSnapshots,
  restoreSettingSnapshot
} from '@renderer/service/settingSnapshot'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  bookPath: { type: String, default: '' },
  bookName: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const snapshotList = ref([])
const diffVisible = ref(false)
const diffLeftId = ref('')
const diffRightId = ref('')
const diffLoading = ref(false)
const diffResult = ref(null)
const loadingSnapshots = ref(false)
const snapshotLoadError = ref('')
const creatingSnapshot = ref(false)
const restoringSnapshotId = ref('')
const deletingSnapshotId = ref('')
const snapshotActionRunning = computed(
  () =>
    creatingSnapshot.value ||
    Boolean(restoringSnapshotId.value) ||
    Boolean(deletingSnapshotId.value)
)

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      await loadSnapshots()
    }
  }
)

async function loadSnapshots() {
  loadingSnapshots.value = true
  snapshotLoadError.value = ''
  try {
    snapshotList.value = await listSettingSnapshots(props.bookPath, '读取快照失败')
  } catch (e) {
    snapshotList.value = []
    snapshotLoadError.value = e?.message || t('settingSnapshot.loadFailed')
    ElMessage.error(snapshotLoadError.value)
  } finally {
    loadingSnapshots.value = false
  }
}

function formatTime(iso) {
  if (!iso) return ''
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(iso)
}

function triggerTagType(type) {
  const map = { manual: '', 'ai-refine': 'warning', 'ai-generate': 'success' }
  return map[type] || 'info'
}

async function handleCreate() {
  if (snapshotActionRunning.value) return
  creatingSnapshot.value = true
  try {
    await createSettingSnapshot(
      {
        bookPath: props.bookPath,
        bookName: props.bookName,
        triggerType: 'manual'
      },
      t('settingSnapshot.createFailed')
    )
    ElMessage.success(t('settingSnapshot.createSuccess'))
    await loadSnapshots()
  } catch (e) {
    ElMessage.error(e?.message || t('settingSnapshot.createError'))
  } finally {
    creatingSnapshot.value = false
  }
}

async function handleRestore(snap) {
  if (snapshotActionRunning.value) return
  try {
    await ElMessageBox.confirm(
      t('settingSnapshot.restoreConfirm', { name: snap.name }),
      t('settingSnapshot.restoreTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }

  restoringSnapshotId.value = snap.id
  try {
    await restoreSettingSnapshot(
      {
        bookPath: props.bookPath,
        snapshotId: snap.id
      },
      t('settingSnapshot.restoreFailed')
    )
    ElMessage.success(t('settingSnapshot.restoreSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('settingSnapshot.restoreFailed'))
  } finally {
    restoringSnapshotId.value = ''
  }
}

async function handleDelete(snap) {
  if (snapshotActionRunning.value) return
  try {
    await ElMessageBox.confirm(
      t('settingSnapshot.deleteConfirm', { name: snap.name }),
      t('settingSnapshot.deleteTitle'),
      { type: 'danger' }
    )
  } catch {
    return
  }

  deletingSnapshotId.value = snap.id
  try {
    await deleteSettingSnapshot(
      {
        bookPath: props.bookPath,
        snapshotId: snap.id
      },
      t('settingSnapshot.deleteFailed')
    )
    ElMessage.success(t('settingSnapshot.deleteSuccess'))
    await loadSnapshots()
  } catch (e) {
    ElMessage.error(e?.message || t('settingSnapshot.deleteFailed'))
  } finally {
    deletingSnapshotId.value = ''
  }
}

function openDiffDialog() {
  diffLeftId.value = ''
  diffRightId.value = ''
  diffResult.value = null
  diffVisible.value = true
}

async function handleDiff() {
  if (!diffLeftId.value || !diffRightId.value) return
  diffLoading.value = true
  try {
    diffResult.value = await diffSettingSnapshots(
      {
        bookPath: props.bookPath,
        leftId: diffLeftId.value,
        rightId: diffRightId.value
      },
      t('settingSnapshot.diffFailed')
    )
  } catch (e) {
    ElMessage.error(e?.message || t('settingSnapshot.diffError'))
  } finally {
    diffLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.setting-snapshot-drawer {
  :deep(.el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }
}

.snapshot-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.snapshot-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 16px;
}

.snapshot-actions {
  margin-bottom: 16px;
}

.snapshot-read-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(154, 96, 74, 0.28);
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.08);
  color: #8a4f3b;
  line-height: 1.6;
}

.snapshot-read-error span {
  min-width: 0;
}

.snapshot-loading {
  padding: 8px 0;
}

.snapshot-timeline {
  padding-left: 4px;
}

.snapshot-card {
  .snapshot-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .snapshot-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .snapshot-btns {
    display: flex;
    gap: 8px;
  }
}

.diff-select-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.diff-vs {
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.diff-result {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  align-items: stretch;
}

.diff-pane {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}

.diff-pane-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.diff-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}

.diff-path {
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.diff-desc {
  color: var(--el-text-color-secondary);
  word-break: break-word;
}

.diff-added-row {
  background-color: rgba(111, 122, 104, 0.12);
}

.diff-removed-row {
  background-color: rgba(154, 96, 74, 0.12);
}

.diff-modified-row {
  background-color: rgba(138, 115, 93, 0.13);
}
</style>

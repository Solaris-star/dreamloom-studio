<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('promptPreset.title')"
    width="900px"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="preset-content">
      <div class="preset-toolbar">
        <el-button type="primary" :disabled="!!presetLoadError" @click="openEditDialog(null)">{{
          t('promptPreset.create')
        }}</el-button>
        <el-button :disabled="!!presetLoadError" @click="handleImport">{{
          t('promptPreset.import')
        }}</el-button>
        <el-button :disabled="!!presetLoadError" @click="handleExport">{{
          t('promptPreset.export')
        }}</el-button>
      </div>
      <div v-if="presetLoadError" class="preset-read-error">
        <span>{{ presetLoadError }}</span>
        <el-button size="small" @click="loadPresets">重试</el-button>
      </div>

      <el-tabs v-model="activeCategory" class="preset-tabs">
        <el-tab-pane :label="t('promptPreset.all')" name="all" />
        <el-tab-pane :label="t('promptPreset.continue')" name="continue" />
        <el-tab-pane :label="t('promptPreset.polish')" name="polish" />
        <el-tab-pane :label="t('promptPreset.evolve')" name="evolve" />
        <el-tab-pane :label="t('promptPreset.deconstruct')" name="deconstruct" />
        <el-tab-pane :label="t('promptPreset.settingTree')" name="settingTree" />
        <el-tab-pane :label="t('promptPreset.chat')" name="chat" />
      </el-tabs>

      <div class="preset-list">
        <el-card
          v-for="preset in filteredPresets"
          :key="preset.id"
          shadow="hover"
          class="preset-card"
        >
          <div class="preset-card-header">
            <span class="preset-name">{{ preset.name }}</span>
            <el-tag size="small">{{ preset.category }}</el-tag>
            <el-icon
              class="preset-fav"
              :class="{ active: preset.favorite }"
              @click="toggleFavorite(preset)"
            >
              <StarFilled v-if="preset.favorite" />
              <Star v-else />
            </el-icon>
          </div>
          <div class="preset-preview">{{ preset.systemPrompt?.slice(0, 120) }}</div>
          <div class="preset-card-actions">
            <el-button link type="primary" size="small" @click="openEditDialog(preset)">
              {{ t('promptPreset.edit') }}
            </el-button>
            <el-button link type="success" size="small" @click="handleDuplicate(preset)">
              {{ t('promptPreset.duplicate') }}
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(preset)">
              {{ t('promptPreset.delete') }}
            </el-button>
          </div>
        </el-card>
        <el-empty v-if="filteredPresets.length === 0" :description="t('promptPreset.emptyHint')" />
      </div>
    </div>

    <el-dialog
      v-model="editVisible"
      :title="editingPreset.id ? t('promptPreset.editPreset') : t('promptPreset.newPreset')"
      width="560px"
      destroy-on-close
      append-to-body
    >
      <el-form label-width="100px">
        <el-form-item :label="t('promptPreset.name')">
          <el-input v-model="editingPreset.name" />
        </el-form-item>
        <el-form-item :label="t('promptPreset.category')">
          <el-select v-model="editingPreset.category" style="width: 100%">
            <el-option value="continue" :label="t('promptPreset.continue')" />
            <el-option value="polish" :label="t('promptPreset.polish')" />
            <el-option value="evolve" :label="t('promptPreset.evolve')" />
            <el-option value="deconstruct" :label="t('promptPreset.deconstruct')" />
            <el-option value="settingTree" :label="t('promptPreset.settingTree')" />
            <el-option value="chat" :label="t('promptPreset.chat')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('promptPreset.systemPrompt')">
          <el-input v-model="editingPreset.systemPrompt" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item :label="t('promptPreset.userPrompt')">
          <el-input v-model="editingPreset.userPromptTemplate" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item :label="t('promptPreset.temperature')">
          <el-slider v-model="editingPreset.temperature" :min="0" :max="2" :step="0.1" show-input />
        </el-form-item>
        <el-form-item :label="t('promptPreset.maxTokens')">
          <el-slider
            v-model="editingPreset.maxTokens"
            :min="256"
            :max="8192"
            :step="256"
            show-input
          />
        </el-form-item>
        <el-form-item :label="t('promptPreset.topP')">
          <el-slider v-model="editingPreset.topP" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('promptPreset.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{
          t('promptPreset.save')
        }}</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Star, StarFilled } from '@element-plus/icons-vue'
import {
  createPromptPreset,
  deletePromptPreset,
  exportPromptPresets,
  importPromptPresets,
  listPromptPresets,
  updatePromptPreset
} from '@renderer/service/aiWorkshop'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  bookPath: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const activeCategory = ref('all')
const presetList = ref([])
const presetLoadError = ref('')
const editVisible = ref(false)
const saving = ref(false)
const editingPreset = ref(getEmptyPreset())

function getEmptyPreset() {
  return {
    id: '',
    name: '',
    category: 'continue',
    systemPrompt: '',
    userPromptTemplate: '',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
    favorite: false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      activeCategory.value = 'all'
      await loadPresets()
    }
  }
)

async function loadPresets() {
  presetLoadError.value = ''
  try {
    const result = await listPromptPresets({ bookPath: props.bookPath })
    presetList.value = result.presets
  } catch (error) {
    presetList.value = []
    presetLoadError.value = error?.message || t('promptPreset.loadFailed')
  }
}

const filteredPresets = computed(() => {
  if (activeCategory.value === 'all') return presetList.value
  return presetList.value.filter((p) => p.category === activeCategory.value)
})

function openEditDialog(preset) {
  if (preset) {
    editingPreset.value = { ...preset }
  } else {
    editingPreset.value = getEmptyPreset()
  }
  editVisible.value = true
}

async function handleSave() {
  if (!editingPreset.value.name.trim()) {
    ElMessage.warning(t('promptPreset.nameRequired'))
    return
  }
  saving.value = true
  try {
    const savePreset = editingPreset.value.id ? updatePromptPreset : createPromptPreset
    await savePreset({
      bookPath: props.bookPath,
      preset: editingPreset.value
    })
    ElMessage.success(t('promptPreset.saveSuccess'))
    editVisible.value = false
    await loadPresets()
  } catch (e) {
    ElMessage.error(e?.message || t('promptPreset.saveError'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(preset) {
  try {
    await ElMessageBox.confirm(
      t('promptPreset.deleteConfirm', { name: preset.name }),
      t('promptPreset.deleteTitle'),
      { type: 'danger' }
    )
    await deletePromptPreset({
      bookPath: props.bookPath,
      id: preset.id
    })
    ElMessage.success(t('promptPreset.deleteSuccess'))
    await loadPresets()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e?.message || t('promptPreset.deleteFailed'))
    }
  }
}

async function handleDuplicate(preset) {
  const dup = { ...preset, id: '', name: `${preset.name} (copy)` }
  try {
    await createPromptPreset({
      bookPath: props.bookPath,
      preset: dup
    })
    ElMessage.success(t('promptPreset.duplicateSuccess'))
    await loadPresets()
  } catch (e) {
    ElMessage.error(e?.message || t('promptPreset.duplicateError'))
  }
}

async function toggleFavorite(preset) {
  preset.favorite = !preset.favorite
  try {
    await updatePromptPreset({
      bookPath: props.bookPath,
      preset
    })
  } catch (e) {
    preset.favorite = !preset.favorite
    ElMessage.error(e?.message || t('promptPreset.saveError'))
  }
}

async function handleImport() {
  if (presetLoadError.value) {
    ElMessage.error(presetLoadError.value)
    return
  }
  try {
    await importPromptPresets({ bookPath: props.bookPath })
    ElMessage.success(t('promptPreset.importSuccess'))
    await loadPresets()
  } catch (e) {
    ElMessage.error(e?.message || t('promptPreset.importError'))
  }
}

async function handleExport() {
  if (presetLoadError.value) {
    ElMessage.error(presetLoadError.value)
    return
  }
  try {
    await exportPromptPresets({ bookPath: props.bookPath })
    ElMessage.success(t('promptPreset.exportSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('promptPreset.exportError'))
  }
}
</script>

<style scoped lang="scss">
.preset-content {
  max-height: 65vh;
  overflow-y: auto;
}

.preset-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-read-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 13px;
  line-height: 1.6;
  padding: 8px 10px;
}

.preset-tabs {
  margin-bottom: 12px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-card {
  .preset-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .preset-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .preset-fav {
    cursor: pointer;
    margin-left: auto;
    color: var(--el-text-color-secondary);
    transition: color 0.2s;

    &.active {
      color: var(--el-color-warning);
    }
  }

  .preset-preview {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .preset-card-actions {
    display: flex;
    gap: 4px;
  }
}
</style>

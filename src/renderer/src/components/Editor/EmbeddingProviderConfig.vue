<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('embeddingProvider.title')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="embedding-content">
      <el-button
        type="primary"
        style="margin-bottom: 12px"
        @click="openEditDialog(null)"
      >
        {{ t('embeddingProvider.add') }}
      </el-button>

      <div class="provider-list">
        <el-card
          v-for="provider in providerList"
          :key="provider.id"
          shadow="hover"
          class="provider-card"
        >
          <div class="provider-card-header">
            <span class="provider-name">{{ provider.name }}</span>
            <el-switch
              :model-value="provider.active"
              @change="(val) => handleSetActive(provider, val)"
            />
          </div>
          <div class="provider-info">
            <div class="info-row">
              <span class="info-label">Base URL:</span>
              <span class="info-value">{{ provider.baseUrl }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('embeddingProvider.modelName') }}:</span>
              <span class="info-value">{{ provider.modelName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('embeddingProvider.dimension') }}:</span>
              <span class="info-value">{{ provider.dimension }}</span>
            </div>
          </div>
          <div class="provider-card-actions">
            <el-button
              link
              type="primary"
              size="small"
              @click="openEditDialog(provider)"
            >
              {{ t('embeddingProvider.edit') }}
            </el-button>
            <el-button
              link
              type="success"
              size="small"
              :loading="validatingId === provider.id"
              @click="handleValidate(provider)"
            >
              {{ t('embeddingProvider.validate') }}
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              @click="handleDelete(provider)"
            >
              {{ t('embeddingProvider.delete') }}
            </el-button>
          </div>
        </el-card>

        <el-empty
          v-if="providerList.length === 0"
          :description="t('embeddingProvider.emptyHint')"
        />
      </div>
    </div>

    <el-dialog
      v-model="editVisible"
      :title="
        editingProvider.id
          ? t('embeddingProvider.editProvider')
          : t('embeddingProvider.addProvider')
      "
      width="480px"
      destroy-on-close
      append-to-body
    >
      <el-form label-width="100px">
        <el-form-item :label="t('embeddingProvider.name')">
          <el-input v-model="editingProvider.name" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="editingProvider.baseUrl" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="editingProvider.apiKey"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item :label="t('embeddingProvider.modelName')">
          <div class="model-picker">
            <el-select
              v-model="editingProvider.modelName"
              filterable
              allow-create
              default-first-option
              clearable
              :loading="loadingModels"
              @focus="handleLoadModels"
            >
              <el-option
                v-for="model in availableModels"
                :key="model"
                :label="model"
                :value="model"
              />
            </el-select>
            <el-button
              :loading="loadingModels"
              @click="handleLoadModels"
            >
              读取列表
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('embeddingProvider.dimension')">
          <el-input-number
            v-model="editingProvider.dimension"
            :min="1"
            :max="65536"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">
          {{ t('embeddingProvider.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="handleSave"
        >
          {{
            t('embeddingProvider.save')
          }}
        </el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  addEmbeddingProvider,
  deleteEmbeddingProvider,
  listEmbeddingProviderModels,
  listEmbeddingProviders,
  setActiveEmbeddingProvider,
  validateEmbeddingProvider
} from '@renderer/service/aiProvider'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

defineEmits(['update:modelValue'])
const { t } = useI18n()

const providerList = ref([])
const editVisible = ref(false)
const saving = ref(false)
const validatingId = ref('')
const editingProvider = ref(getEmptyProvider())
const availableModels = ref([])
const loadingModels = ref(false)

function getEmptyProvider() {
  return {
    id: '',
    name: '',
    baseUrl: '',
    apiKey: '',
    modelName: '',
    dimension: 1536,
    active: false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      await loadProviders()
    }
  }
)

async function loadProviders() {
  try {
    const res = await listEmbeddingProviders()
    providerList.value = res.providers
  } catch (error) {
    providerList.value = []
    ElMessage.error(error?.message || '读取 Embedding Provider 失败')
  }
}

function openEditDialog(provider) {
  if (provider) {
    editingProvider.value = { ...provider }
  } else {
    editingProvider.value = getEmptyProvider()
  }
  availableModels.value = []
  editVisible.value = true
}

async function handleLoadModels() {
  if (loadingModels.value) return
  if (!editingProvider.value.baseUrl?.trim() || !editingProvider.value.apiKey?.trim()) {
    ElMessage.warning('请先填写 API 地址和 Key')
    return
  }
  loadingModels.value = true
  try {
    const res = await listEmbeddingProviderModels({
      baseUrl: editingProvider.value.baseUrl,
      apiKey: editingProvider.value.apiKey
    })
    availableModels.value = res.models
    if (!availableModels.value.length) {
      ElMessage.warning('没有读取到模型')
    }
  } catch (e) {
    availableModels.value = []
    ElMessage.error(e?.message || '读取模型列表失败')
  } finally {
    loadingModels.value = false
  }
}

async function handleSave() {
  if (!editingProvider.value.name.trim() || !editingProvider.value.baseUrl.trim()) {
    ElMessage.warning(t('embeddingProvider.requiredFields'))
    return
  }
  saving.value = true
  try {
    const res = await addEmbeddingProvider({
      provider: editingProvider.value
    })
    providerList.value = res.providers
    ElMessage.success(t('embeddingProvider.saveSuccess'))
    editVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || t('embeddingProvider.saveError'))
  } finally {
    saving.value = false
  }
}

async function handleSetActive(provider, active) {
  try {
    const res = await setActiveEmbeddingProvider(provider.id, active)
    providerList.value = res.providers
  } catch (e) {
    ElMessage.error(e?.message || t('embeddingProvider.setActiveError'))
  }
}

async function handleValidate(provider) {
  validatingId.value = provider.id
  try {
    await validateEmbeddingProvider({
      id: provider.id
    })
    ElMessage.success(t('embeddingProvider.validateSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('embeddingProvider.validateError'))
  } finally {
    validatingId.value = ''
  }
}

async function handleDelete(provider) {
  try {
    await ElMessageBox.confirm(
      t('embeddingProvider.deleteConfirm', { name: provider.name }),
      t('embeddingProvider.deleteTitle'),
      { type: 'danger' }
    )
  } catch {
    return
  }

  try {
    const res = await deleteEmbeddingProvider(provider.id)
    providerList.value = res.providers
    ElMessage.success(t('embeddingProvider.deleteSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('embeddingProvider.deleteFailed'))
  }
}
</script>

<style scoped lang="scss">
.embedding-content {
  max-height: 65vh;
  overflow-y: auto;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-card {
  .provider-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .provider-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .provider-info {
    margin-bottom: 8px;
  }

  .info-row {
    display: flex;
    gap: 8px;
    font-size: 12px;
    line-height: 1.8;
  }

  .info-label {
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
    min-width: 80px;
  }

  .info-value {
    color: var(--el-text-color-regular);
    word-break: break-all;
  }

  .provider-card-actions {
    display: flex;
    gap: 4px;
  }
}

.model-picker {
  display: flex;
  width: 100%;
  gap: 8px;

  .el-select {
    flex: 1;
  }
}
</style>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="t('plotEvolution.title')"
    size="800px"
    direction="rtl"
    class="plot-evolution-drawer"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="plot-evolution-content">
      <div class="plot-evolution-body">
        <el-form label-width="80px" class="plot-evolution-form">
          <el-form-item :label="t('plotEvolution.modelSelect')">
            <el-checkbox-group
              v-model="selectedProviders"
              :disabled="providerLoading || !!providerLoadError"
            >
              <el-checkbox v-for="p in textProviders" :key="p.id" :label="p.name" :value="p.id" />
            </el-checkbox-group>
            <div v-if="providerLoadError" class="provider-read-error">
              <span>{{ providerLoadError }}</span>
              <button type="button" :disabled="providerLoading" @click="loadProviders">
                {{ t('common.retry') }}
              </button>
            </div>
            <div v-else-if="textProviders.length === 0" class="no-provider-hint">
              {{ t('plotEvolution.noProviderHint') }}
            </div>
          </el-form-item>
        </el-form>

        <div class="plot-evolution-actions">
          <el-button
            type="primary"
            :loading="evolving"
            :disabled="providerLoading || !!providerLoadError || selectedProviders.length === 0"
            @click="handleEvolve"
          >
            {{ t('plotEvolution.startEvolve') }}
          </el-button>
        </div>

        <div v-if="resultGroups.length > 0" class="result-section">
          <div v-for="group in resultGroups" :key="group.providerId" class="result-group">
            <div class="group-header">{{ group.providerName }}</div>
            <el-card
              v-for="(proposal, pIdx) in group.proposals"
              :key="pIdx"
              class="proposal-card"
              shadow="hover"
            >
              <div class="proposal-title">
                <el-tag type="primary">{{ proposal.title }}</el-tag>
              </div>
              <div class="proposal-summary">{{ proposal.summary }}</div>
              <div v-if="proposal.conflict" class="proposal-conflict">
                <span class="label">{{ t('plotEvolution.conflict') }}</span>
                {{ proposal.conflict }}
              </div>
              <div v-if="proposal.emotion" class="proposal-emotion">
                <span class="label">{{ t('plotEvolution.emotion') }}</span>
                {{ proposal.emotion }}
              </div>
              <div
                v-if="proposal.keyEvents && proposal.keyEvents.length > 0"
                class="proposal-events"
              >
                <span class="label">{{ t('plotEvolution.keyEvents') }}</span>
                <el-tag
                  v-for="(evt, eIdx) in proposal.keyEvents"
                  :key="eIdx"
                  size="small"
                  class="event-tag"
                >
                  {{ evt }}
                </el-tag>
              </div>
              <div class="proposal-actions">
                <el-button type="success" size="small" @click="handleApply(proposal)">
                  {{ t('plotEvolution.apply') }}
                </el-button>
                <el-button
                  size="small"
                  :loading="regeneratingMap[`${group.providerId}-${pIdx}`]"
                  @click="handleRegenerate(group.providerId, pIdx)"
                >
                  {{ t('plotEvolution.regenerate') }}
                </el-button>
              </div>
            </el-card>
          </div>
        </div>

        <el-empty
          v-if="!evolving && !providerLoading && !providerLoadError && resultGroups.length === 0"
          :description="t('plotEvolution.emptyHint')"
        />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getAiProviders } from '@renderer/service/aiProvider'
import { evolvePlot, regeneratePlotProposal } from '@renderer/service/plotEvolution'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  bookPath: { type: String, default: '' },
  chapterContent: { type: String, default: '' },
  outlineContent: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'apply'])
const { t } = useI18n()

const textProviders = ref([])
const selectedProviders = ref([])
const providerLoading = ref(false)
const providerLoadError = ref('')
const evolving = ref(false)
const resultGroups = ref([])
const regeneratingMap = ref({})

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      await loadProviders()
      resultGroups.value = []
      selectedProviders.value = []
    }
  }
)

async function loadProviders() {
  providerLoading.value = true
  providerLoadError.value = ''
  try {
    const result = await getAiProviders()
    textProviders.value = requireTextProvidersResult(result)
  } catch (error) {
    textProviders.value = []
    selectedProviders.value = []
    providerLoadError.value = error?.message || '读取文本 AI 服务失败'
  } finally {
    providerLoading.value = false
  }
}

function requireTextProvidersResult(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || '读取文本 AI 服务失败')
  }
  if (!Array.isArray(result.providers)) {
    throw new Error('读取文本 AI 服务失败：接口返回格式不正确')
  }
  return result.providers.filter(
    (provider) => provider.category === 'text' || provider.type === 'text'
  )
}

async function handleEvolve() {
  if (providerLoadError.value) {
    ElMessage.error(providerLoadError.value)
    return
  }
  if (selectedProviders.value.length === 0) {
    ElMessage.warning(t('plotEvolution.selectProvider'))
    return
  }
  evolving.value = true
  try {
    resultGroups.value = await evolvePlot(
      {
        bookPath: props.bookPath,
        chapterContent: props.chapterContent,
        outlineContent: props.outlineContent,
        providerIds: selectedProviders.value
      },
      t('plotEvolution.evolveFailed')
    )
  } catch (e) {
    ElMessage.error(e?.message || t('plotEvolution.evolveError'))
  } finally {
    evolving.value = false
  }
}

async function handleRegenerate(providerId, proposalIndex) {
  const key = `${providerId}-${proposalIndex}`
  regeneratingMap.value[key] = true
  try {
    const proposal = await regeneratePlotProposal(
      {
        bookPath: props.bookPath,
        chapterContent: props.chapterContent,
        outlineContent: props.outlineContent,
        providerId,
        proposalIndex
      },
      t('plotEvolution.regenerateFailed')
    )
    const group = resultGroups.value.find((g) => g.providerId === providerId)
    if (!group || !Array.isArray(group.proposals)) {
      throw new Error(t('plotEvolution.regenerateFailed'))
    }
    group.proposals[proposalIndex] = proposal
    ElMessage.success(t('plotEvolution.regenerateSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('plotEvolution.regenerateError'))
  } finally {
    regeneratingMap.value[key] = false
  }
}

function handleApply(proposal) {
  emit('apply', proposal)
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
.plot-evolution-drawer {
  :deep(.el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }
}

.plot-evolution-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.plot-evolution-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 16px;
}

.plot-evolution-form {
  margin-bottom: 12px;
}

.no-provider-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.provider-read-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-color-danger);

  button {
    border: 0;
    background: transparent;
    color: var(--el-color-primary);
    cursor: pointer;
    padding: 0;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }
}

.plot-evolution-actions {
  margin-bottom: 16px;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.result-group {
  .group-header {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--el-text-color-primary);
  }
}

.proposal-card {
  margin-bottom: 12px;

  .proposal-title {
    margin-bottom: 8px;
  }

  .proposal-summary {
    font-size: 13px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
    margin-bottom: 8px;
  }

  .proposal-conflict,
  .proposal-emotion {
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-bottom: 6px;

    .label {
      font-weight: 600;
      color: var(--el-text-color-primary);
      margin-right: 4px;
    }
  }

  .proposal-events {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;

    .label {
      font-weight: 600;
      color: var(--el-text-color-primary);
      margin-right: 4px;
    }

    .event-tag {
      margin: 0;
    }
  }

  .proposal-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
}
</style>

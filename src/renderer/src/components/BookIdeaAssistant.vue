<template>
  <section class="book-idea-assistant">
    <div class="assistant-main">
      <div class="assistant-heading">
        <div class="assistant-icon">
          <MagicStick />
        </div>
        <div>
          <h2>AI 开书助手</h2>
          <p>先写一个模糊想法，让 AI 帮你想出书名、简介、设定和前三章方向。</p>
        </div>
      </div>

      <div class="idea-input-wrap">
        <el-input
          v-model="idea"
          type="textarea"
          :rows="5"
          maxlength="300"
          show-word-limit
          resize="none"
          placeholder="例如：一个程序员意外获得穿越时空的能力，但每次改变过去都会失去一段记忆。"
          @keydown.ctrl.enter.prevent="handleGenerate"
          @keydown.meta.enter.prevent="handleGenerate"
        />
      </div>

      <div class="assistant-controls">
        <el-select v-model="selectedProviderId" class="provider-select" placeholder="选择 Provider" @change="handleProviderChange">
          <el-option v-for="p in textProviders" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="selectedModel" class="model-select" placeholder="选择模型" :disabled="!selectedProviderId">
          <el-option v-for="model in modelOptions" :key="model" :label="model" :value="model" />
        </el-select>
        <el-cascader
          v-model="selectedType"
          class="type-select"
          :options="bookTypeCascaderOptions"
          :props="{ expandTrigger: 'hover', emitPath: false }"
          placeholder="选择题材"
          clearable
        />
        <div class="tag-row">
          <button
            v-for="tag in quickTags"
            :key="tag"
            type="button"
            class="tag-button"
            :class="{ active: selectedTags.includes(tag) }"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
        <el-button type="primary" :loading="generating" :disabled="!selectedProviderId || !selectedModel" @click="handleGenerate">
          <el-icon><MagicStick /></el-icon>
          生成方案
        </el-button>
      </div>
    </div>

    <div v-if="plans.length" class="plans-panel">
      <article
        v-for="(plan, index) in plans"
        :key="plan.id || index"
        class="plan-card"
        :class="{ selected: selectedIndex === index }"
        @click="selectedIndex = index"
      >
        <div class="plan-head">
          <div>
            <h3>{{ plan.title }}</h3>
            <span>{{ plan.typeName }}</span>
          </div>
          <el-radio :model-value="selectedIndex" :value="index" @change="selectedIndex = index" />
        </div>
        <p class="plan-intro">{{ plan.intro }}</p>
        <dl class="plan-meta">
          <div v-if="plan.protagonist">
            <dt>主角</dt>
            <dd>{{ plan.protagonist }}</dd>
          </div>
          <div v-if="plan.coreHook">
            <dt>看点</dt>
            <dd>{{ plan.coreHook }}</dd>
          </div>
        </dl>
        <div v-if="plan.firstChapters?.length" class="chapter-preview">
          <div class="preview-title">前三章</div>
          <ol>
            <li v-for="chapter in plan.firstChapters.slice(0, 3)" :key="chapter">
              {{ chapter }}
            </li>
          </ol>
        </div>
      </article>
    </div>

    <div v-if="plans.length" class="assistant-footer">
      <el-button @click="handleGenerate">再换一批</el-button>
      <el-button type="success" :loading="creating" @click="handleCreateSelected">
        用选中方案创建书籍
      </el-button>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { BOOK_TYPES, BOOK_TYPE_GROUPS } from '@renderer/constants/config'
import { generateBookIdeasWithAI } from '@renderer/service/deepseek'
import { getAiProvidersByCategory, setActiveTextProvider, getActiveTextProvider } from '@renderer/service/aiProvider'

const emit = defineEmits(['create-book'])

const quickTags = ['强开局', '群像', '轻松', '悬疑', '成长', '爽文']
const idea = ref('')
const textProviders = ref([])
const selectedProviderId = ref('')
const selectedModel = ref('')
const modelOptions = ref([])
const selectedType = ref('')
const selectedTags = ref([])
const plans = ref([])
const selectedIndex = ref(0)
const bookIdeaRunId = ref('')
const generating = ref(false)
const creating = ref(false)

const bookTypeCascaderOptions = BOOK_TYPE_GROUPS.map((group) => ({
  label: group.groupLabel,
  value: group.groupLabel,
  children: group.options.map((item) => ({ label: item.label, value: item.value }))
}))

const selectedPlan = computed(() => plans.value[selectedIndex.value] || null)

function handleProviderChange(providerId) {
  selectedModel.value = ''
  modelOptions.value = []
  const provider = textProviders.value.find(p => p.id === providerId)
  if (provider?.models?.length) {
    // 关键修改：只展示用户在设置中填写的模型
    modelOptions.value = [...provider.models]
    selectedModel.value = provider.models[0]
  }
  setActiveTextProvider(providerId).catch((error) => {
    ElMessage.error(error?.message || '保存默认 AI 服务失败')
  })
}

async function loadProviders() {
  try {
    textProviders.value = await getAiProvidersByCategory('text')
    if (textProviders.value.length) {
      const activeRes = await getActiveTextProvider()
      const activeId = activeRes?.providerId
      const foundProvider = textProviders.value.find(p => p.id === (activeId || textProviders.value[0].id))

      if (foundProvider) {
        selectedProviderId.value = foundProvider.id
        // 关键修改：初始化时也只展示用户预设的模型
        modelOptions.value = foundProvider.models || []
        selectedModel.value = foundProvider.models?.[0] || ''
      }
    }
  } catch (error) {
    textProviders.value = []
    selectedProviderId.value = ''
    selectedModel.value = ''
    modelOptions.value = []
    ElMessage.error(error?.message || '读取 AI 服务失败')
  }
}

function toggleTag(tag) {
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter((item) => item !== tag)
  } else {
    selectedTags.value = [...selectedTags.value, tag]
  }
}

function requireBookIdeaPlans(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || '生成失败')
  }
  if (!Array.isArray(result.plans)) {
    throw new Error('生成失败：接口没有返回方案列表')
  }
  const validPlans = result.plans.filter((plan) => {
    return String(plan?.title || '').trim() && String(plan?.intro || '').trim()
  })
  if (!validPlans.length) {
    throw new Error('生成失败：AI 没有返回可用方案')
  }
  return validPlans
}

async function handleGenerate() {
  const rawIdea = idea.value.trim()
  if (!selectedProviderId.value || !selectedModel.value) {
    ElMessage.warning('请先配置并选择 AI 模型')
    return
  }
  if (!rawIdea && !selectedType.value && !selectedTags.value.length) {
    ElMessage.warning('请输入一个创意，或先选题材和标签')
    return
  }

  generating.value = true
  try {
    const provider = textProviders.value.find(p => p.id === selectedProviderId.value)
    const preferredType = BOOK_TYPES.find((item) => item.value === selectedType.value)
    const result = await generateBookIdeasWithAI({
      idea: rawIdea,
      model: selectedModel.value,
      provider: provider ? { id: provider.id, apiType: provider.apiType, baseUrl: provider.baseUrl, apiKey: provider.apiKey } : undefined,
      tags: [
        ...selectedTags.value,
        preferredType?.label ? `偏向${preferredType.label}` : ''
      ].filter(Boolean),
      availableTypes: BOOK_TYPES
    })
    const validPlans = requireBookIdeaPlans(result)
    bookIdeaRunId.value = result.bookIdeaRunId || result.bookIdeaRun?.id || ''
    plans.value = validPlans.map((plan) => ({
      ...plan,
      bookIdeaRunId: bookIdeaRunId.value
    }))
    selectedIndex.value = 0
  } catch (error) {
    ElMessage.error(error?.message || '生成失败，请稍后再试')
  } finally {
    generating.value = false
  }
}

async function handleCreateSelected() {
  if (!selectedPlan.value) return
  creating.value = true
  try {
    await emit('create-book', {
      ...selectedPlan.value,
      bookIdeaRunId: selectedPlan.value.bookIdeaRunId || bookIdeaRunId.value
    })
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  loadProviders()
})
</script>

<style lang="scss" scoped>
.book-idea-assistant {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.48)),
    var(--bg-soft);
  padding: 16px;
}

.assistant-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.assistant-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.assistant-icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wabi-paper);
  background: var(--wabi-ink);

  .el-icon {
    font-size: 20px;
  }
}

h2 {
  margin: 0;
  color: var(--text-base);
  font-size: 22px;
  line-height: 1.25;
}

p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.idea-input-wrap {
  :deep(.el-textarea__inner) {
    border-radius: 8px;
    min-height: 128px !important;
    font-size: 14px;
    line-height: 1.7;
    background: var(--bg-primary);
  }
}

.assistant-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.provider-select {
  width: 160px;
}

.type-select {
  width: 180px;
}

.model-select {
  width: 190px;
}

.tag-row {
  display: flex;
  flex: 1;
  min-width: 240px;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-base);
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background 0.2s;

  &.active,
  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}

.plans-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.plan-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
  background: var(--bg-primary);
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    transform 0.2s;

  &.selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 8px 24px rgba(111, 122, 104, 0.12);
  }

  &:hover {
    transform: translateY(-1px);
  }
}

.plan-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;

  h3 {
    margin: 0;
    color: var(--text-base);
    font-size: 16px;
    line-height: 1.4;
  }

  span {
    display: inline-block;
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 12px;
  }
}

.plan-intro {
  margin-top: 10px;
  color: var(--text-base);
}

.plan-meta {
  margin: 12px 0 0;

  div + div {
    margin-top: 8px;
  }

  dt {
    color: var(--text-secondary);
    font-size: 12px;
  }

  dd {
    margin: 3px 0 0;
    color: var(--text-base);
    font-size: 13px;
    line-height: 1.5;
  }
}

.chapter-preview {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);

  .preview-title {
    color: var(--text-secondary);
    font-size: 12px;
  }

  ol {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--text-base);
    font-size: 12px;
    line-height: 1.55;
  }
}

.assistant-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 980px) {
  .plans-panel {
    grid-template-columns: 1fr;
  }

  .type-select {
    width: 100%;
  }
}
</style>

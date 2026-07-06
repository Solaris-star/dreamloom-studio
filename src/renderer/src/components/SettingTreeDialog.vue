<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('settingTree.title')"
    width="800px"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="setting-tree-content">
      <el-form label-width="80px" class="setting-tree-form">
        <el-form-item :label="t('settingTree.creativity')">
          <el-input
            v-model="creativity"
            type="textarea"
            :rows="4"
            :placeholder="t('settingTree.creativityPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('settingTree.strategy')">
          <el-radio-group v-model="strategy">
            <el-radio value="xuanhuan">{{ t('settingTree.strategyXuanhuan') }}</el-radio>
            <el-radio value="dushi">{{ t('settingTree.strategyDushi') }}</el-radio>
            <el-radio value="kehuan">{{ t('settingTree.strategyKehuan') }}</el-radio>
            <el-radio value="free">{{ t('settingTree.strategyFree') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <div class="generate-action">
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!creativity.trim()"
          @click="handleGenerate"
        >
          {{ t('settingTree.generate') }}
        </el-button>
      </div>

      <div v-if="treeData.length > 0" class="tree-preview">
        <div class="tree-preview-title">{{ t('settingTree.preview') }}</div>
        <el-tree
          :data="treeData"
          node-key="name"
          default-expand-all
          :expand-on-click-node="false"
        >
          <template #default="{ data }">
            <div class="tree-node">
              <span class="node-name">{{ data.name }}</span>
              <span v-if="data.description" class="node-desc">{{ data.description }}</span>
              <div class="node-actions">
                <el-button link type="primary" size="small" @click.stop="openEditNode(data)">
                  {{ t('settingTree.edit') }}
                </el-button>
                <el-button
                  link
                  type="warning"
                  size="small"
                  :loading="regeneratingNode === data.name"
                  @click.stop="handleRegenerateNode(data)"
                >
                  {{ t('settingTree.aiRegenerate') }}
                </el-button>
              </div>
            </div>
          </template>
        </el-tree>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ t('settingTree.cancel') }}</el-button>
      <el-button
        type="warning"
        :disabled="treeData.length === 0"
        @click="handleApply('merge')"
      >
        {{ t('settingTree.merge') }}
      </el-button>
      <el-button
        type="primary"
        :disabled="treeData.length === 0"
        @click="handleApply('replace')"
      >
        {{ t('settingTree.replace') }}
      </el-button>
    </template>

    <el-dialog
      v-model="editNodeVisible"
      :title="t('settingTree.editNode')"
      width="480px"
      destroy-on-close
      append-to-body
    >
      <el-form label-width="60px">
        <el-form-item :label="t('settingTree.nodeName')">
          <el-input v-model="editingNode.name" />
        </el-form-item>
        <el-form-item :label="t('settingTree.nodeDesc')">
          <el-input v-model="editingNode.description" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editNodeVisible = false">{{ t('settingTree.cancel') }}</el-button>
        <el-button type="primary" @click="saveEditNode">{{ t('settingTree.save') }}</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  applySettingTree,
  generateSettingTree,
  regenerateSettingNode
} from '@renderer/service/settingTree'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  bookPath: { type: String, default: '' },
  bookName: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const creativity = ref('')
const strategy = ref('xuanhuan')
const generating = ref(false)
const treeData = ref([])
const regeneratingNode = ref('')
const editNodeVisible = ref(false)
const editingNode = ref({ name: '', description: '', _path: '' })

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      creativity.value = ''
      strategy.value = 'xuanhuan'
      treeData.value = []
    }
  }
)

async function handleGenerate() {
  if (!creativity.value.trim()) return
  generating.value = true
  try {
    treeData.value = await generateSettingTree({
      bookPath: props.bookPath,
      bookName: props.bookName,
      creativity: creativity.value,
      strategy: strategy.value
    }, t('settingTree.generateFailed'))
  } catch (e) {
    ElMessage.error(e?.message || t('settingTree.generateError'))
  } finally {
    generating.value = false
  }
}

async function handleRegenerateNode(data) {
  regeneratingNode.value = data.name
  try {
    const node = await regenerateSettingNode({
      bookPath: props.bookPath,
      bookName: props.bookName,
      nodeName: data.name,
      nodeDescription: data.description,
      strategy: strategy.value
    }, t('settingTree.regenerateFailed'))
    Object.assign(data, node)
    ElMessage.success(t('settingTree.regenerateSuccess'))
  } catch (e) {
    ElMessage.error(e?.message || t('settingTree.regenerateError'))
  } finally {
    regeneratingNode.value = ''
  }
}

function openEditNode(data) {
  editingNode.value = {
    name: data.name,
    description: data.description || '',
    _path: data.name
  }
  editNodeVisible.value = true
}

function saveEditNode() {
  const target = findNodeByName(treeData.value, editingNode.value._path)
  if (target) {
    target.name = editingNode.value.name
    target.description = editingNode.value.description
  }
  editNodeVisible.value = false
}

function findNodeByName(nodes, name) {
  for (const node of nodes) {
    if (node.name === name) return node
    if (node.children) {
      const found = findNodeByName(node.children, name)
      if (found) return found
    }
  }
  return null
}

async function handleApply(mode) {
  try {
    await applySettingTree({
      bookPath: props.bookPath,
      bookName: props.bookName,
      tree: treeData.value,
      mode
    }, t('settingTree.applyFailed'))
    ElMessage.success(t('settingTree.applySuccess'))
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(e?.message || t('settingTree.applyError'))
  }
}
</script>

<style scoped lang="scss">
.setting-tree-content {
  max-height: 65vh;
  overflow-y: auto;
}

.setting-tree-form {
  margin-bottom: 12px;
}

.generate-action {
  margin-bottom: 16px;
}

.tree-preview {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

.tree-preview-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 13px;
}

.node-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.node-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.node-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
</style>

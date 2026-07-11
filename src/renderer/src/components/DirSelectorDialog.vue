<template>
  <el-dialog
    v-model="visible"
    title="选择目录"
    width="600px"
    align-center
    :close-on-click-modal="false"
  >
    <div class="dir-selector">
      <div class="path-bar">
        <el-input v-model="currentPath" placeholder="输入目录路径" @keyup.enter="navigateTo">
          <template #prepend>
            <el-button :disabled="!canGoUp" @click="goUp"> 上级 </el-button>
          </template>
          <template #append>
            <el-button @click="navigateTo"> 进入 </el-button>
          </template>
        </el-input>
      </div>

      <div class="dir-list">
        <div v-if="loading" class="dir-empty">加载中...</div>
        <div v-else-if="error" class="dir-error">
          <span>{{ error }}</span>
          <el-button size="small" :loading="loading" @click="loadDir(currentPath)">重试</el-button>
        </div>
        <div v-else-if="dirs.length === 0" class="dir-empty">空目录</div>
        <div v-for="dir in dirs" :key="dir.name" class="dir-item" @click="enterDir(dir.name)">
          <FolderClosed class="dir-icon" :size="16" aria-hidden="true" />
          <span class="dir-name">{{ dir.name }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!!error" @click="confirm">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { FolderClosed } from 'lucide-vue-next'

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue', 'select'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentPath = ref('')
const dirs = ref([])
const loading = ref(false)
const error = ref('')
const canGoUp = ref(false)

function joinPath(parent, name) {
  if (!parent) return name
  const sep = parent.includes('\\') || /^[A-Za-z]:/.test(parent) ? '\\' : '/'
  if (parent.endsWith(sep) || parent.endsWith(sep === '\\' ? '/' : '\\')) {
    return parent + name
  }
  return parent + sep + name
}

function getParentPath(p) {
  if (!p) return ''
  const sep = p.includes('\\') ? '\\' : '/'
  const parts = p.split(sep).filter(Boolean)
  if (parts.length <= 1) {
    // Windows 根目录如 D:\
    if (/^[A-Za-z]:[\\/]?$/.test(p)) return ''
    return ''
  }
  parts.pop()
  let parent = parts.join(sep)
  if (sep === '\\' && parts[0] && parts[0].endsWith(':')) {
    parent += '\\'
  }
  return parent
}

async function loadDir(dir) {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/fs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir })
    })
    const data = await res.json().catch((jsonError) => {
      throw new Error('目录接口返回格式错误: ' + jsonError.message)
    })
    if (!res.ok) {
      throw new Error(data?.error || `读取目录失败 (${res.status})`)
    }
    dirs.value = requireDirectoryListResult(data)
    currentPath.value = data.path || dir
  } catch (e) {
    error.value = '加载失败: ' + e.message
    dirs.value = []
  } finally {
    loading.value = false
    updateCanGoUp()
  }
}

function requireDirectoryListResult(result) {
  if (result?.error) {
    throw new Error(result.error)
  }
  if (!Array.isArray(result?.dirs)) {
    throw new Error(result?.message || '目录接口返回格式不正确')
  }
  if (result.dirs.some((item) => !item || typeof item.name !== 'string' || !item.name.trim())) {
    throw new Error('目录接口返回了无效目录')
  }
  return result.dirs
}

function updateCanGoUp() {
  const p = currentPath.value
  if (!p) {
    canGoUp.value = false
    return
  }
  const parent = getParentPath(p)
  canGoUp.value = parent !== '' || /^[A-Za-z]:[\\/]?$/.test(p)
}

function goUp() {
  const parent = getParentPath(currentPath.value)
  if (parent || parent === '') {
    loadDir(parent || '')
  }
}

function navigateTo() {
  loadDir(currentPath.value)
}

function enterDir(name) {
  loadDir(joinPath(currentPath.value, name))
}

function confirm() {
  emit('select', currentPath.value)
  visible.value = false
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      nextTick(() => {
        loadDir(currentPath.value || '')
      })
    }
  }
)
</script>

<style lang="scss" scoped>
.dir-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-bar {
  display: flex;
  gap: 8px;
}

.dir-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--wabi-line);
  border-radius: 4px;
  padding: 8px;
  background: rgba(251, 250, 246, 0.62);
}

.dir-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(111, 122, 104, 0.1);
  }
}

.dir-icon {
  flex: 0 0 auto;
  color: var(--wabi-earth);
}

.dir-name {
  font-size: 14px;
  color: var(--wabi-ink-soft);
}

.dir-empty,
.dir-error {
  padding: 20px;
  text-align: center;
  color: var(--text-gray);
  font-size: 14px;
}

.dir-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #9a604a;
}
</style>

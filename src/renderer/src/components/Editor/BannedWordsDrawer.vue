<template>
  <el-drawer
    v-model="visible"
    :title="t('bannedWords.title')"
    direction="rtl"
    size="500px"
    header-class="drawer-header"
    :close-on-click-modal="true"
  >
    <!-- 新增禁词输入区 -->
    <div class="add-word-section">
      <el-input
        v-model="newWord"
        :placeholder="t('bannedWords.inputPlaceholder')"
        clearable
        @keyup.enter.prevent="handleAddWord"
      />
      <el-button
        type="primary"
        @click="handleAddWord"
      >
        {{ t('bannedWords.add') }}
      </el-button>
    </div>

    <el-empty
      v-if="bannedWords.length === 0"
      :image-size="200"
      :description="t('bannedWords.empty')"
    />
    <!-- 禁词标签列表 -->
    <div
      v-else
      class="words-list"
    >
      <el-tag
        v-for="word in bannedWords"
        :key="word"
        class="word-tag"
        closable
        @close="handleDeleteWord(word)"
      >
        {{ word }}
      </el-tag>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  addBannedWord,
  listBannedWords,
  removeBannedWord
} from '@renderer/service/editor'

const props = defineProps({
  bookName: {
    type: String,
    default: ''
  }
})

const visible = ref(false)
const newWord = ref('')
const bannedWords = ref([])
const { t } = useI18n()

// 打开抽屉
const open = () => {
  visible.value = true
  loadBannedWords()
}

// 加载禁词列表
const loadBannedWords = async () => {
  if (!props.bookName) return
  try {
    bannedWords.value = await listBannedWords(props.bookName)
  } catch (error) {
    console.error('加载禁词失败:', error)
    ElMessage.error(error.message || t('bannedWords.loadFailed'))
  }
}

// 新增禁词
const handleAddWord = async () => {
  const word = newWord.value.trim()

  // 校验：是否为空
  if (!word) {
    ElMessage.warning(t('bannedWords.inputRequired'))
    return
  }

  // 校验：是否已存在
  if (bannedWords.value.includes(word)) {
    ElMessage.warning(t('bannedWords.duplicate'))
    return
  }

  try {
    bannedWords.value = await addBannedWord(props.bookName, word)
    newWord.value = ''
    ElMessage.success(t('bannedWords.addSuccess'))
  } catch (error) {
    console.error('添加禁词失败:', error)
    ElMessage.error(error.message || t('bannedWords.addFailed'))
  }
}

// 删除禁词
const handleDeleteWord = async (word) => {
  try {
    bannedWords.value = await removeBannedWord(props.bookName, word)
    ElMessage.success(t('bannedWords.deleteSuccess'))
  } catch (error) {
    console.error('删除禁词失败:', error)
    ElMessage.error(error.message || t('bannedWords.deleteFailed'))
  }
}

// 监听bookName变化，重新加载
watch(
  () => props.bookName,
  () => {
    if (visible.value) {
      loadBannedWords()
    }
  }
)

// 暴露方法给父组件
defineExpose({
  open
})
</script>

<style lang="scss" scoped>
.add-word-section {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
}

.words-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  .empty-tip {
    width: 100%;
    text-align: center;
    color: var(--text-secondary);
    padding: 40px 0;
  }

  .word-tag {
    font-size: 14px;
  }
}
</style>
<style lang="scss">
.drawer-header {
  margin-bottom: 0px;
  padding: 15px 20px;
}
</style>

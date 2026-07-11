<template>
  <div class="editor-toolbar" :class="{ 'is-en': locale === 'en-US' }">
    <div class="toolbar-title">AI 助手</div>
    <div class="toolbar-buttons ai-buttons">
      <el-dropdown trigger="click" @command="(cmd) => emit('trigger-ai', 'polish', cmd)" style="width: 100%;">
        <el-button class="tool-btn" style="width: 100%;">
          <el-icon :size="14"><MagicStick /></el-icon>
          <span>AI 润色 / 清理</span>
          <el-icon class="el-icon--right"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="selection">{{ t('editorPanel.polishSelection') }}</el-dropdown-item>
            <el-dropdown-item command="chapter">{{ t('editorPanel.polishChapter') }}</el-dropdown-item>
            <el-dropdown-item divided command="clean_selection">AI 清理乱码 (选段)</el-dropdown-item>
            <el-dropdown-item command="clean_chapter">AI 清理乱码 (整章)</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-button class="tool-btn" @click="emit('trigger-ai', 'continue')" style="width: 100%; margin-left: 0; margin-top: 8px;">
        <el-icon :size="14"><EditPen /></el-icon>
        <span>{{ t('editorPanel.aiContinue') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="emit('trigger-ai', 'scene')" style="width: 100%; margin-left: 0; margin-top: 8px;">
        <el-icon :size="14"><Picture /></el-icon>
        <span>{{ t('editorPanel.aiSceneImage') }}</span>
      </el-button>
    </div>

    <div class="toolbar-title" style="margin-top: 24px;">{{ t('editorToolbar.title') }}</div>
    <div class="toolbar-buttons">
      <el-button class="tool-btn" @click="handleOutlineManager">
        <SvgIcon name="resource" :size="14" />
        <span>{{ t('editorToolbar.outline') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleSettingManager">
        <SvgIcon name="config" :size="14" />
        <span>{{ t('editorToolbar.settingManager') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleRandomName">
        <SvgIcon name="naming" :size="14" />
        <span>{{ t('editorToolbar.randomName') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleWorldMap">
        <SvgIcon name="map" :size="14" />
        <span>{{ t('editorToolbar.worldMap') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleEntryDictionary">
        <SvgIcon name="dictionary" :size="14" />
        <span>{{ t('editorToolbar.dictionary') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleOrganization">
        <SvgIcon name="organization" :size="14" />
        <span>{{ t('editorToolbar.organization') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleBannedWords">
        <SvgIcon name="banned-words" :size="14" />
        <span>{{ t('editorToolbar.bannedWords') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleCharacterProfile">
        <SvgIcon name="character" :size="14" />
        <span>{{ t('editorToolbar.characterProfile') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleRelationshipMap">
        <SvgIcon name="relationship" :size="14" />
        <span>{{ t('editorToolbar.relationship') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleTimeline">
        <SvgIcon name="timeline" :size="14" />
        <span>{{ t('editorToolbar.timeline') }}</span>
      </el-button>
      <el-button class="tool-btn" @click="handleEventsSequence">
        <SvgIcon name="gantt" :size="14" />
        <span>{{ t('editorToolbar.eventsSequence') }}</span>
      </el-button>
    </div>
    <RandomName ref="randomNameRef" />
    <BannedWordsDrawer ref="bannedWordsRef" :book-name="route.query.name" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ArrowDown, MagicStick, EditPen, Picture } from '@element-plus/icons-vue'
import RandomName from '@renderer/components/RandomName.vue'
import BannedWordsDrawer from './BannedWordsDrawer.vue'
import { useRouter, useRoute } from 'vue-router'
import SvgIcon from '@renderer/components/SvgIcon.vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['trigger-ai'])

const randomNameRef = ref(null)
const bannedWordsRef = ref(null)
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

// 工具栏功能处理函数
const handleRandomName = () => {
  randomNameRef.value.open()
}

const handleWorldMap = () => {
  // 跳转到地图列表页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/map-list', query: { name: bookName } })
}

const handleTimeline = () => {
  // 跳转到时间线页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/timeline', query: { name: bookName } })
}

const handleEntryDictionary = () => {
  // 跳转到词条字典页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/dictionary', query: { name: bookName } })
}

const handleSettingManager = () => {
  // 跳转到设定管理页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/setting-manager', query: { name: bookName } })
}

const handleCharacterProfile = () => {
  // 跳转到人物谱页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/character-profile', query: { name: bookName } })
}

const handleRelationshipMap = () => {
  // 跳转到关系图列表页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/relationship-list', query: { name: bookName } })
}

const handleEventsSequence = () => {
  // 跳转到事序图页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/events-sequence', query: { name: bookName } })
}

const handleOrganization = () => {
  // 跳转到组织架构列表页面，带上当前书籍名
  const bookName = route.query.name
  router.push({ path: '/organization-list', query: { name: bookName } })
}

const handleOutlineManager = () => {
  const bookName = route.query.name
  router.push({ path: '/outline-manager', query: { name: bookName } })
}

const handleBannedWords = () => {
  bannedWordsRef.value.open()
}
</script>

<style lang="scss" scoped>
.editor-toolbar {
  container-type: inline-size;
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }

  .toolbar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 12px;
    padding-left: 4px;
  }

  .toolbar-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .tool-btn {
      justify-content: flex-start;
      align-items: center;
      width: 100%;
      height: auto;
      padding: 8px;
      white-space: normal;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      color: var(--text-base);
      text-align: left;
      margin: 0;
      transition: all 0.2s;
      &:hover {
        color: var(--el-color-primary);
      }
      span {
        margin-left: 6px;
        line-height: 1.2;
        word-break: break-word;
        white-space: normal;
        flex: 1;
      }
    }
  }

  &.is-en {
    .toolbar-buttons .tool-btn span {
      font-size: 13px;
    }
  }
}

@container (max-width: 90px) {
  .editor-toolbar {
    padding: 16px 8px;
  }
  .toolbar-title {
    display: none;
  }
  .tool-btn {
    justify-content: center !important;
    padding: 8px 0 !important;
  }
  .tool-btn span,
  .tool-btn .el-icon--right {
    display: none !important;
  }
  .tool-btn .el-icon,
  .tool-btn svg {
    margin: 0 !important;
  }
}
:deep(.el-drawer__header) {
  margin-bottom: 0px;
  padding-bottom: 20px;
}
:deep(.el-drawer__body) {
  padding: 0 20px;
}
</style>

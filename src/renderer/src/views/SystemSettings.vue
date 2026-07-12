<template>
  <div class="system-settings">
    <div class="settings-body">
      <!-- 左侧二级导航 (侧边栏风格) -->
      <nav class="settings-nav" aria-label="设置分类" tabindex="0">
        <button
          v-for="item in menuItems"
          :key="item.index"
          class="nav-item"
          :class="{ active: activeTab === item.index }"
          :aria-current="activeTab === item.index ? 'page' : undefined"
          type="button"
          @click="openSettingsTab(item)"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <!-- 右侧主要内容区域 -->
      <div class="settings-main">
        <el-scrollbar>
          <div class="content-wrapper">
            <!-- 常规设置 -->
            <div v-if="activeTab === 'general'" class="settings-section">
              <h2 class="section-title">{{ t('home.systemSettings.tabs.general') }}</h2>
              <div class="setting-item">
                <label>{{ t('home.systemSettings.booksDir') }}</label>
                <div class="dir-picker">
                  <el-input v-model="bookDir" readonly placeholder="未设置目录" />
                  <el-button
                    type="primary"
                    :loading="savingBooksDir"
                    :disabled="!booksDirConfigurable"
                    :title="booksDirConfigurable ? '' : '书库目录由服务器配置'"
                    @click="handleChooseDir"
                    >选择目录</el-button
                  >
                </div>
              </div>
              <div class="setting-item">
                <label>{{ t('common.language') }}</label>
                <el-select
                  v-model="selectedLocale"
                  class="full-width"
                  aria-label="界面语言"
                  @change="handleLocaleChange"
                >
                  <el-option label="简体中文" value="zh-CN" />
                  <el-option label="English" value="en-US" />
                </el-select>
              </div>
            </div>

            <div v-if="activeTab === 'profile'" class="settings-section">
              <h2 class="section-title">个人信息</h2>
              <div class="setting-card">
                <div class="setting-grid">
                  <div class="setting-item">
                    <label>昵称</label>
                    <el-input v-model="profileForm.nickname" placeholder="用于页面显示" />
                  </div>
                  <div class="setting-item">
                    <label>作者署名</label>
                    <el-input v-model="profileForm.authorName" placeholder="导出和新书默认署名" />
                  </div>
                </div>
                <el-button
                  type="primary"
                  :loading="savingProfileSettings"
                  @click="saveProfileSettings"
                  >保存个人信息</el-button
                >
              </div>
            </div>

            <!-- AI 设置 -->
            <div v-if="activeTab === 'ai'" class="settings-section">
              <h2 class="section-title">{{ t('home.systemSettings.tabs.ai') }}</h2>
              <AISettingsContent />
            </div>

            <!-- 主题设置 -->
            <div v-if="activeTab === 'embedding'" class="settings-section">
              <h3 class="section-title">{{ t('home.systemSettings.tabs.embedding') }}</h3>
              <EmbeddingProviderConfig v-model="embeddingConfigVisible" />
              <el-button type="primary" @click="embeddingConfigVisible = true">
                {{ t('home.systemSettings.manageEmbedding') }}
              </el-button>
            </div>

            <div v-if="activeTab === 'prompts'" class="settings-section">
              <h3 class="section-title">{{ t('home.systemSettings.tabs.prompts') }}</h3>
              <PromptPresetManager v-model="promptManagerVisible" :book-path="''" />
              <el-button type="primary" @click="promptManagerVisible = true">
                {{ t('home.systemSettings.managePrompts') }}
              </el-button>
            </div>

            <div v-if="activeTab === 'theme'" class="settings-section">
              <h2 class="section-title">{{ t('home.systemSettings.tabs.theme') }}</h2>
              <div class="theme-board">
                <button
                  v-for="theme in availableThemes"
                  :key="theme.key"
                  class="theme-card"
                  :class="{ active: themeStore.currentTheme === theme.key }"
                  type="button"
                  :aria-label="`切换到${theme.name}`"
                  @click="handleThemeChange(theme.key)"
                >
                  <span
                    class="theme-preview"
                    :style="getPreviewStyle(theme.key)"
                    aria-hidden="true"
                  >
                    <i class="preview-paper"></i>
                    <i class="preview-line line-one"></i>
                    <i class="preview-line line-two"></i>
                    <i class="preview-dot dot-one"></i>
                    <i class="preview-dot dot-two"></i>
                  </span>
                  <span class="theme-label">{{ theme.name }}</span>
                  <Check
                    v-if="themeStore.currentTheme === theme.key"
                    class="theme-check"
                    :size="18"
                    :stroke-width="2"
                  />
                </button>
              </div>
            </div>

            <div v-if="activeTab === 'editor'" class="settings-section">
              <h2 class="section-title">编辑器设置</h2>
              <div class="setting-card">
                <div class="setting-grid">
                  <div class="setting-item">
                    <label>字体</label>
                    <el-select
                      v-model="editorForm.fontFamily"
                      class="full-width"
                      aria-label="编辑器字体"
                    >
                      <el-option label="默认" value="" />
                      <el-option label="宋体" value="SimSun" />
                      <el-option label="黑体" value="SimHei" />
                      <el-option label="微软雅黑" value="Microsoft YaHei" />
                      <el-option label="楷体" value="KaiTi" />
                    </el-select>
                  </div>
                  <div class="setting-item">
                    <label>字号</label>
                    <el-input v-model="editorForm.fontSize" placeholder="例如 16px" />
                  </div>
                  <div class="setting-item">
                    <label>行高</label>
                    <el-input v-model="editorForm.lineHeight" placeholder="例如 1.6" />
                  </div>
                  <div class="setting-item">
                    <label>段落间距</label>
                    <el-input v-model="editorForm.paragraphSpacing" placeholder="例如 0.5em" />
                  </div>
                </div>
                <div class="switch-list">
                  <el-checkbox v-model="editorForm.globalBoldMode">默认加粗</el-checkbox>
                  <el-checkbox v-model="editorForm.globalItalicMode">默认斜体</el-checkbox>
                  <el-checkbox v-model="editorForm.autoSave">自动保存</el-checkbox>
                </div>
                <el-button
                  type="primary"
                  :loading="savingEditorSettings"
                  @click="saveEditorSettings"
                  >保存编辑器设置</el-button
                >
              </div>
            </div>

            <!-- 安全隐私 -->
            <div v-if="activeTab === 'security'" class="settings-section">
              <h2 class="section-title">{{ t('home.systemSettings.tabs.security') }}</h2>
              <div class="security-card">
                <div class="info">
                  <h3>书架访问密码</h3>
                  <p>{{ hasPassword ? '已启用密码保护' : '当前未设置密码' }}</p>
                </div>
                <el-button type="primary" @click="showPasswordDialog = true">
                  {{ hasPassword ? '修改密码' : '设置密码' }}
                </el-button>
              </div>
              <div class="setting-card">
                <h3>隐私</h3>
                <div class="switch-list">
                  <el-checkbox v-model="privacyForm.saveAiHistory">保存 AI 历史</el-checkbox>
                  <el-checkbox v-model="privacyForm.saveUsageStats">保存用量统计</el-checkbox>
                  <el-checkbox v-model="privacyForm.localOnly">只使用本地文件存储</el-checkbox>
                </div>
                <el-button
                  type="primary"
                  :loading="savingPrivacySettings"
                  @click="savePrivacySettings"
                  >保存隐私设置</el-button
                >
              </div>
            </div>

            <div v-if="activeTab === 'storage'" class="settings-section">
              <h2 class="section-title">存储</h2>
              <div class="setting-card">
                <div class="data-stats">
                  <div>
                    <span>书库目录</span>
                    <b :title="storageStats.booksDir">{{ storageStats.booksDir || '-' }}</b>
                  </div>
                  <div>
                    <span>书库占用</span>
                    <b>{{ formatSize(storageStats.booksSize) }}</b>
                  </div>
                  <div>
                    <span>设置文件</span>
                    <b>{{ formatSize(storageStats.storeSize) }}</b>
                  </div>
                  <div>
                    <span>回收站</span>
                    <b>{{ formatSize(storageStats.trashSize) }}</b>
                  </div>
                </div>
                <div class="button-row">
                  <el-button :loading="loadingStorageStats" @click="loadStorageStats"
                    >刷新</el-button
                  >
                  <el-button type="danger" plain :loading="clearingTrash" @click="handleClearTrash"
                    >清理回收站</el-button
                  >
                </div>
              </div>
            </div>

            <div v-if="activeTab === 'notifications'" class="settings-section">
              <h2 class="section-title">通知</h2>
              <div class="setting-card">
                <div class="switch-list">
                  <el-checkbox v-model="notificationForm.encourageToast">
                    显示写作鼓励提示
                  </el-checkbox>
                  <el-checkbox v-model="notificationForm.goalReminder">提醒写作目标</el-checkbox>
                </div>
                <el-button
                  type="primary"
                  :loading="savingNotificationSettings"
                  @click="saveNotificationSettings"
                  >保存通知设置</el-button
                >
              </div>
            </div>

            <div v-if="activeTab === 'shortcuts'" class="settings-section">
              <h2 class="section-title">快捷键</h2>
              <div class="shortcut-list">
                <div v-for="item in shortcutItems" :key="item.key">
                  <kbd>{{ item.key }}</kbd>
                  <span>{{ item.action }}</span>
                </div>
              </div>
            </div>

            <div v-if="activeTab === 'data'" class="settings-section">
              <h2 class="section-title">数据管理</h2>
              <div class="setting-card">
                <div class="button-row">
                  <el-button
                    type="primary"
                    :loading="exportingSettings"
                    @click="handleExportSettings"
                    >导出设置</el-button
                  >
                  <label class="import-settings-button" title="导入设置会合并到当前设置文件">
                    <input
                      accept=".json,application/json"
                      :disabled="importingSettings"
                      type="file"
                      @change="handleImportSettingsFile"
                    />
                    <span>导入设置</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 关于 -->
            <div v-if="activeTab === 'about'" class="settings-section about-page">
              <div class="about-hero">
                <img :src="brandLogoUrl" alt="织梦工坊" />
                <h1>织梦工坊</h1>
                <p class="brand-name-en">Dreamloom Studio · DLS</p>
                <p>Version {{ currentVersion }}</p>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <!-- 弹窗 -->
    <BookshelfPasswordSettings v-model="showPasswordDialog" @saved="loadPasswordStatus" />
    <DirSelectorDialog v-model="showDirSelector" @select="handleDirSelected" />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, markRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  Settings,
  Sparkles,
  Palette,
  Lock,
  Info,
  Cpu,
  FileText,
  UserRound,
  Bell,
  Keyboard,
  Database,
  HardDrive,
  Pencil,
  Check
} from 'lucide-vue-next'

import AISettingsContent from '@renderer/components/AISettings.vue'
import BookshelfPasswordSettings from '@renderer/components/BookshelfPasswordSettings.vue'
import DirSelectorDialog from '@renderer/components/DirSelectorDialog.vue'
import EmbeddingProviderConfig from '@renderer/components/Editor/EmbeddingProviderConfig.vue'
import PromptPresetManager from '@renderer/components/PromptPresetManager.vue'
import brandLogoUrl from '@renderer/assets/images/logo_big.png'

import { useThemeStore } from '@renderer/stores/theme'
import { getCurrentLocale, setLocale } from '@renderer/i18n'
import { getBookDirectoryInfo, setBookDir } from '@renderer/service/books'
import { getBookshelfAuthStatus } from '@renderer/service/bookshelfAuth'
import { getStoreValue, setStoreValue } from '@renderer/service/webStore'
import {
  clearAssetTrash,
  exportAppSettings,
  getStorageStats,
  importAppSettings
} from '@renderer/service/systemSettings'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const themeStore = useThemeStore()

const activeTab = ref('general')
const bookDir = ref('')
const booksDirConfigurable = ref(true)
const selectedLocale = ref('zh-CN')
const currentVersion = ref('')
const hasPassword = ref(false)
const showPasswordDialog = ref(false)
const showDirSelector = ref(false)
const embeddingConfigVisible = ref(false)
const promptManagerVisible = ref(false)
const savingBooksDir = ref(false)
const savingProfileSettings = ref(false)
const savingEditorSettings = ref(false)
const savingPrivacySettings = ref(false)
const savingNotificationSettings = ref(false)
const loadingStorageStats = ref(false)
const clearingTrash = ref(false)
const exportingSettings = ref(false)
const importingSettings = ref(false)
const profileForm = ref({
  nickname: '',
  authorName: ''
})
const editorForm = ref({
  fontFamily: '',
  fontSize: '16px',
  lineHeight: '1.6',
  paragraphSpacing: '0.5em',
  globalBoldMode: false,
  globalItalicMode: false,
  autoSave: true
})
const privacyForm = ref({
  saveAiHistory: true,
  saveUsageStats: true,
  localOnly: true
})
const notificationForm = ref({
  encourageToast: true,
  goalReminder: true
})
const storageStats = ref({
  booksDir: '',
  booksSize: 0,
  storeSize: 0,
  trashSize: 0
})

const menuItems = [
  { index: 'general', label: t('home.systemSettings.tabs.general'), icon: markRaw(Settings) },
  { index: 'profile', label: '个人信息', icon: markRaw(UserRound) },
  { index: 'editor', label: '编辑器设置', icon: markRaw(Pencil) },
  { index: 'ai', label: t('home.systemSettings.tabs.ai'), icon: markRaw(Sparkles) },
  { index: 'embedding', label: t('home.systemSettings.tabs.embedding'), icon: markRaw(Cpu) },
  { index: 'prompts', label: t('home.systemSettings.tabs.prompts'), icon: markRaw(FileText) },
  { index: 'theme', label: t('home.systemSettings.tabs.theme'), icon: markRaw(Palette) },
  { index: 'storage', label: '存储', icon: markRaw(HardDrive) },
  { index: 'security', label: t('home.systemSettings.tabs.security'), icon: markRaw(Lock) },
  { index: 'notifications', label: '通知', icon: markRaw(Bell) },
  { index: 'shortcuts', label: '快捷键', icon: markRaw(Keyboard) },
  { index: 'data', label: '数据管理', icon: markRaw(Database) },
  { index: 'about', label: t('home.systemSettings.tabs.about'), icon: markRaw(Info) }
]

const routeTabMap = {
  '/settings/general': 'general',
  '/settings/profile': 'profile',
  '/settings/appearance': 'theme',
  '/settings/editor': 'editor',
  '/settings/models': 'ai',
  '/settings/embedding': 'embedding',
  '/settings/prompts': 'prompts',
  '/settings/privacy': 'security',
  '/settings/storage': 'storage',
  '/settings/notifications': 'notifications',
  '/settings/shortcuts': 'shortcuts',
  '/settings/data': 'data',
  '/settings/about': 'about'
}

const tabRouteMap = {
  general: '/settings/general',
  profile: '/settings/profile',
  theme: '/settings/appearance',
  editor: '/settings/editor',
  ai: '/settings/models',
  embedding: '/settings/embedding',
  prompts: '/settings/prompts',
  security: '/settings/privacy',
  storage: '/settings/storage',
  notifications: '/settings/notifications',
  shortcuts: '/settings/shortcuts',
  data: '/settings/data',
  about: '/settings/about'
}

const shortcutItems = [
  { key: 'Ctrl + S', action: '保存当前章节' },
  { key: 'Ctrl + B', action: '加粗选中文本' },
  { key: 'Ctrl + I', action: '斜体选中文本' },
  { key: 'Ctrl + F', action: '浏览器页面内搜索' },
  { key: 'Esc', action: '关闭弹窗或返回当前操作' }
]

const availableThemes = computed(() => themeStore.getAvailableThemes())

watch(
  () => route.path,
  (path) => {
    activeTab.value = routeTabMap[path] || 'general'
  },
  { immediate: true }
)

onMounted(async () => {
  try {
    const directoryInfo = await getBookDirectoryInfo()
    bookDir.value = directoryInfo.booksDir
    booksDirConfigurable.value = directoryInfo.configurable
  } catch (error) {
    showSettingsError(error, '读取书库目录失败')
  }
  selectedLocale.value = getCurrentLocale()
  currentVersion.value = import.meta.env.VITE_APP_VERSION || 'web'
  await loadSettingsForms()
  await loadStorageStats()
  await loadPasswordStatus()
})

async function loadSettingsForms() {
  profileForm.value = {
    ...profileForm.value,
    ...((await getStoreValue('profileSettings', {})) || {})
  }
  editorForm.value = {
    ...editorForm.value,
    ...((await getStoreValue('editorSettings', {})) || {})
  }
  privacyForm.value = {
    ...privacyForm.value,
    ...((await getStoreValue('privacySettings', {})) || {})
  }
  notificationForm.value = {
    ...notificationForm.value,
    ...((await getStoreValue('notificationSettings', {})) || {})
  }
}

async function requireStoreSet(key, value, fallback = '保存失败') {
  try {
    return await setStoreValue(key, value)
  } catch (error) {
    throw new Error(error?.message || fallback)
  }
}

function showSettingsError(error, fallback = '保存失败') {
  ElMessage.error(error?.message || fallback)
}

function openSettingsTab(item) {
  const target = tabRouteMap[item.index]
  if (target && target !== route.path) {
    router.push(target)
    return
  }
  activeTab.value = item.index
}

async function loadPasswordStatus() {
  try {
    const status = await getBookshelfAuthStatus()
    hasPassword.value = status.passwordConfigured
  } catch (error) {
    hasPassword.value = false
    showSettingsError(error, '读取书架密码状态失败')
  }
}

async function handleChooseDir() {
  showDirSelector.value = true
}

async function handleDirSelected(path) {
  savingBooksDir.value = true
  try {
    bookDir.value = await setBookDir(path)
    ElMessage.success('保存目录成功')
    await loadStorageStats()
  } catch (error) {
    showSettingsError(error, '保存目录失败')
  } finally {
    savingBooksDir.value = false
  }
}

async function handleLocaleChange(val) {
  try {
    await requireStoreSet('config.locale', val, '保存语言失败')
    setLocale(val)
    ElMessage.success(t('common.switchLanguageSuccess'))
  } catch (error) {
    showSettingsError(error, '保存语言失败')
  }
}

async function saveProfileSettings() {
  if (savingProfileSettings.value) return
  savingProfileSettings.value = true
  try {
    await requireStoreSet('profileSettings', profileForm.value, '保存个人信息失败')
    ElMessage.success('已保存个人信息')
  } catch (error) {
    showSettingsError(error, '保存个人信息失败')
  } finally {
    savingProfileSettings.value = false
  }
}

async function saveEditorSettings() {
  if (savingEditorSettings.value) return
  savingEditorSettings.value = true
  try {
    await requireStoreSet('editorSettings', editorForm.value, '保存编辑器设置失败')
    ElMessage.success('已保存编辑器设置')
  } catch (error) {
    showSettingsError(error, '保存编辑器设置失败')
  } finally {
    savingEditorSettings.value = false
  }
}

async function savePrivacySettings() {
  if (savingPrivacySettings.value) return
  savingPrivacySettings.value = true
  try {
    await requireStoreSet('privacySettings', privacyForm.value, '保存隐私设置失败')
    ElMessage.success('已保存隐私设置')
  } catch (error) {
    showSettingsError(error, '保存隐私设置失败')
  } finally {
    savingPrivacySettings.value = false
  }
}

async function saveNotificationSettings() {
  if (savingNotificationSettings.value) return
  savingNotificationSettings.value = true
  try {
    await requireStoreSet('notificationSettings', notificationForm.value, '保存通知设置失败')
    ElMessage.success('已保存通知设置')
  } catch (error) {
    showSettingsError(error, '保存通知设置失败')
  } finally {
    savingNotificationSettings.value = false
  }
}

async function loadStorageStats() {
  if (loadingStorageStats.value) return
  loadingStorageStats.value = true
  try {
    storageStats.value = { ...storageStats.value, ...(await getStorageStats()) }
  } catch (error) {
    showSettingsError(error, '读取存储统计失败')
  } finally {
    loadingStorageStats.value = false
  }
}

async function handleClearTrash() {
  if (clearingTrash.value) return
  clearingTrash.value = true
  try {
    await clearAssetTrash()
    ElMessage.success('回收站已清理')
    await loadStorageStats()
  } catch (error) {
    showSettingsError(error, '清理回收站失败')
  } finally {
    clearingTrash.value = false
  }
}

async function handleExportSettings() {
  if (exportingSettings.value) return
  exportingSettings.value = true
  let exportPayload
  try {
    exportPayload = await exportAppSettings()
  } catch (error) {
    ElMessage.error(error?.message || '导出设置失败')
    exportingSettings.value = false
    return
  }

  const blob = new Blob([exportPayload.content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportPayload.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  ElMessage.success('设置已导出')
  exportingSettings.value = false
}

async function handleImportSettingsFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (importingSettings.value) return
  importingSettings.value = true
  try {
    const content = await file.text()
    const imported = await importAppSettings(content)
    ElMessage.success(`已导入 ${imported.count} 项设置`)
    await loadSettingsForms()
    await loadStorageStats()
  } catch (error) {
    ElMessage.error(error?.message || '导入设置失败')
  } finally {
    importingSettings.value = false
    event.target.value = ''
  }
}

function formatSize(size) {
  const value = Number(size || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function getPreviewStyle(themeKey) {
  const config = themeStore.getThemeConfig(themeKey)
  return {
    '--preview-bg': config.bgPrimary,
    '--preview-paper': config.bgSoft,
    '--preview-line': config.borderColor,
    '--preview-ink': config.textBase,
    '--preview-primary': config.primaryColor,
    '--preview-accent': config.accentColor
  }
}

async function handleThemeChange(theme) {
  try {
    await themeStore.setTheme(theme)
    ElMessage.success(`已切换到${themeStore.getThemeName(theme)}`)
  } catch (error) {
    showSettingsError(error, '保存主题失败')
  }
}
</script>

<style lang="scss" scoped>
.system-settings {
  width: 100%;
  color: var(--text-base);
}

.settings-body {
  display: flex;
  min-height: 640px;
}

.settings-nav {
  width: 240px;
  background:
    repeating-linear-gradient(96deg, rgba(154, 107, 36, 0.035) 0 1px, transparent 1px 22px),
    var(--bg-soft);
  border-right: 1px solid var(--border-color);
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .nav-item {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.22s ease,
      border-color 0.22s ease,
      color 0.22s ease;
    color: var(--text-secondary);

    &:hover {
      background-color: rgba(111, 122, 104, 0.08);
    }

    &.active {
      border-color: rgba(111, 122, 104, 0.28);
      background-color: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.settings-main {
  flex: 1;
  background-color: var(--bg-primary);
  overflow: hidden;

  .content-wrapper {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 24px;
  }
}

.settings-section {
  animation: slideUp 0.3s ease;

  .section-title {
    font-size: 24px;
    margin-bottom: 32px;
    font-weight: 600;
  }
}

.setting-card {
  padding: 24px;
  background: var(--theme-surface-background-strong);
  border: 1px solid var(--border-color);
  border-radius: var(--theme-card-radius, 8px);
  margin-bottom: 24px;

  h3 {
    margin: 0 0 20px;
    font-size: 16px;
    font-weight: 600;
  }
}

.setting-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.setting-item {
  margin-bottom: 24px;
  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: var(--text-secondary);
  }
  .dir-picker {
    display: flex;
    gap: 12px;
  }
  .full-width {
    width: 100%;
  }
}

.setting-card > .setting-item:last-child,
.setting-grid .setting-item {
  margin-bottom: 0;
}

.switch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0 20px;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.data-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;

  div {
    min-width: 0;
    padding: 14px;
    background: var(--theme-input-background);
    border: 1px solid var(--border-color);
    border-radius: var(--theme-control-radius, 8px);
  }

  span,
  b {
    display: block;
  }

  span {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 6px;
  }

  b {
    overflow: hidden;
    color: var(--text-base);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;

  div {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--theme-surface-background-strong);
    border: 1px solid var(--border-color);
    border-radius: var(--theme-control-radius, 8px);
  }

  kbd {
    min-width: 92px;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--theme-control-radius, 6px);
    background: var(--bg-primary);
    color: var(--text-base);
    font-size: 14px;
    text-align: center;
  }

  span {
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.import-settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 8px 15px;
  border: 1px solid rgba(111, 122, 104, 0.38);
  border-radius: var(--theme-control-radius, 6px);
  color: var(--wabi-moss-dark);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;

  input {
    display: none;
  }
}

.theme-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 14px;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  min-height: 154px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--theme-card-radius, 8px);
  background: var(--theme-surface-background-strong);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.22s ease,
    background-color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.22s ease;

  &:hover {
    border-color: var(--color-border-strong);
    transform: translateY(-1px);
  }

  &.active {
    border-color: var(--color-primary) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 42%, transparent);
    transition-property: background-color, box-shadow, transform;
  }

  .theme-preview {
    position: relative;
    width: 100%;
    height: 92px;
    overflow: hidden;
    border: 1px solid var(--preview-line);
    border-radius: var(--theme-control-radius, 8px);
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--preview-line) 24%, transparent) 1px,
        transparent 1px
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--preview-line) 16%, transparent) 1px,
        transparent 1px
      ),
      var(--preview-bg);
    background-size:
      22px 22px,
      22px 22px,
      auto;
  }

  .preview-paper {
    position: absolute;
    inset: 13px 12px;
    border: 1px solid var(--preview-line);
    border-radius: var(--theme-control-radius, 8px);
    background: var(--preview-paper);
  }

  .preview-line,
  .preview-dot {
    position: absolute;
    z-index: 1;
    display: block;
    background: var(--preview-ink);
  }

  .preview-line {
    left: 28px;
    height: 2px;
    border-radius: 2px;
  }

  .line-one {
    right: 42px;
    top: 36px;
  }

  .line-two {
    right: 58px;
    top: 54px;
    opacity: 0.52;
  }

  .preview-dot {
    width: 16px;
    height: 16px;
    border-radius: 5px;
  }

  .dot-one {
    right: 26px;
    bottom: 24px;
    background: var(--preview-primary);
  }

  .dot-two {
    right: 48px;
    bottom: 24px;
    background: var(--preview-accent);
  }

  .theme-label {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
  }

  .theme-check {
    position: absolute;
    right: 12px;
    bottom: 12px;
    color: var(--color-primary-strong);
  }
}

.security-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  background: var(--theme-surface-background-strong);
  border: 1px solid var(--border-color);
  border-radius: var(--theme-card-radius, 8px);

  .info {
    h3 {
      margin: 0 0 4px;
      font-size: 16px;
    }

    p {
      margin: 0;
      font-size: 14px;
      color: var(--text-secondary);
    }
  }
}

.about-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  .about-hero {
    margin-bottom: 48px;

    img {
      width: 96px;
      height: 96px;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 28px;
      margin: 0;
    }

    .brand-name-en {
      color: var(--text-secondary);
      margin: 10px 0 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    p {
      color: var(--text-secondary);
      margin: 8px 0 0;
    }
  }

  .update-card {
    width: 100%;
    max-width: 400px;
    padding: 24px;
    background: var(--theme-surface-background-strong);
    border: 1px solid var(--border-color);
    border-radius: var(--theme-card-radius, 8px);
    display: flex;
    flex-direction: column;
    gap: 16px;

    .update-status {
      font-size: 14px;
    }
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 720px) {
  .settings-body {
    min-height: auto;
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
    padding: 10px 12px;
    scrollbar-width: thin;

    .nav-item {
      flex: 0 0 auto;
      height: 36px;
      gap: 8px;
      padding: 0 12px;
      white-space: nowrap;
    }
  }

  .settings-main {
    overflow: visible;

    .content-wrapper {
      max-width: none;
      padding: 24px 16px 36px;
    }
  }

  .settings-section {
    .section-title {
      margin-bottom: 18px;
      font-size: 22px;
    }
  }

  .setting-card {
    padding: 16px;
    margin-bottom: 16px;
  }

  .setting-grid,
  .data-stats {
    grid-template-columns: 1fr;
  }

  .setting-item {
    margin-bottom: 18px;

    .dir-picker {
      flex-direction: column;
      gap: 8px;
    }
  }

  .security-card,
  .shortcut-list div {
    align-items: flex-start;
    flex-direction: column;
  }

  .theme-board {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }

  .theme-card {
    min-height: 140px;
  }
}
</style>

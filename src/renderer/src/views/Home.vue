<template>
  <div class="home-page">
    <header class="dashboard-header">
      <div>
        <h1>{{ APP_NAME_ZH }}</h1>
        <p class="brand-en">
          Dreamloom Studio · DLS
        </p>
        <p class="headline">
          今天想写一个什么样的故事？
        </p>
        <p class="subline">
          从一个念头开始，把故事慢慢织出来。
        </p>
      </div>
    </header>

    <section class="dashboard-main-grid">
      <article
        ref="starterCardRef"
        class="dashboard-card creation-card"
        :aria-label="t('homeAi.starterTitle')"
      >
        <div class="card-title">
          <div>
            <h2>{{ t('homeAi.starterTitle') }}</h2>
            <p class="starter-kicker">
              {{ t('homeAi.starterKicker') }}
            </p>
          </div>
        </div>
        <p class="starter-desc">
          {{ t('homeAi.starterDesc') }}
        </p>
        <textarea
          v-model="ideaInput"
          class="creation-textarea"
          :placeholder="t('homeAi.ideaPlaceholder')"
        />
        <div class="starter-control-row">
          <label>
            <span>{{ t('homeAi.aiService') }}</span>
            <el-select
              v-model="selectedProviderId"
              filterable
              :placeholder="t('homeAi.selectAiService')"
              :loading="loadingProviders"
              @change="handleProviderChange"
            >
              <el-option
                v-for="provider in textProviders"
                :key="provider.id"
                :label="provider.name"
                :value="provider.id"
              />
            </el-select>
          </label>
          <label>
            <span>{{ t('homeAi.model') }}</span>
            <el-select
              v-model="selectedModel"
              filterable
              allow-create
              default-first-option
              :placeholder="t('homeAi.selectModel')"
              :disabled="!selectedProviderId"
            >
              <el-option
                v-for="model in modelOptions"
                :key="model"
                :label="model"
                :value="model"
              />
            </el-select>
          </label>
          <label class="strategy-field">
            <span>{{ t('homeAi.prompt') }}</span>
            <el-select
              v-model="selectedStarterPresetId"
              filterable
              :placeholder="t('homeAi.selectPrompt')"
            >
              <el-option
                v-for="preset in starterPresetOptions"
                :key="preset.id"
                :label="promptPresetDisplayName(preset)"
                :value="preset.id"
              />
            </el-select>
          </label>
          <button
            class="prompt-market-button"
            type="button"
            :title="t('homeAi.promptMarket')"
            @click="router.push('/ai/prompts')"
          >
            <span class="market-icon">▣</span>
            {{ t('homeAi.market') }}
          </button>
        </div>
        <div class="starter-actions">
          <el-button
            class="starter-submit"
            type="primary"
            :loading="creatingJob"
            :disabled="!canCreateStarterJob"
            @click="handleCreateStarterJob"
          >
            {{ t('homeAi.generateSetting') }}
          </el-button>
        </div>
      </article>

      <aside
        class="dashboard-side-stack"
        aria-label="首页信息栏"
      >
        <article
          class="dashboard-card market-card"
          aria-label="市场风向"
        >
          <div class="card-title">
            <div>
              <h2>市场风向</h2>
            </div>
            <span class="update-text">{{ marketUpdateText }}</span>
          </div>
          <div
            class="market-tabs"
            role="tablist"
            aria-label="市场时间范围"
          >
            <button
              v-for="tab in marketTabs"
              :key="tab.key"
              :class="{ active: marketRange === tab.key }"
              type="button"
              role="tab"
              :aria-selected="marketRange === tab.key"
              @click="marketRange = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <div
            v-if="marketError"
            class="small-error"
          >
            {{ marketError }}
          </div>
          <div
            v-else-if="!marketHotspots.length && !marketActivities.length"
            class="compact-empty market-empty"
          >
            <strong>暂无市场数据</strong>
            <span>点击市场灵感里的刷新热榜，织梦会自动整理公开热词和活动。</span>
            <button
              type="button"
              @click="router.push('/market/overview')"
            >
              去刷新热榜
            </button>
          </div>
          <template v-else>
            <div class="market-section">
              <h3>热点题材</h3>
              <ol
                v-if="marketHotspots.length"
                class="market-list"
              >
                <li
                  v-for="(item, index) in marketHotspots"
                  :key="item.id"
                  @click="router.push('/market/overview')"
                >
                  <span class="rank">{{ index + 1 }}</span>
                  <span class="market-name">{{ item.keyword || item.title }}</span>
                  <b>热度 {{ Number(item.heatScore || 0) }}</b>
                  <span class="trend-arrow">↑</span>
                </li>
              </ol>
              <p
                v-else
                class="inline-empty"
              >
                暂无热点题材。
              </p>
            </div>
            <div class="market-section">
              <h3>作家活动</h3>
              <div
                v-if="marketActivities.length"
                class="activity-list"
              >
                <button
                  v-for="item in marketActivities"
                  :key="item.id"
                  type="button"
                  @click="router.push('/market/overview')"
                >
                  <span>{{ item.title }}</span>
                  <small>{{ remainingText(item) }}</small>
                </button>
              </div>
              <p
                v-else
                class="inline-empty"
              >
                暂无进行中的作家活动。
              </p>
            </div>
          </template>
          <button
            class="more-link"
            type="button"
            @click="router.push('/market/overview')"
          >
            查看市场灵感 >
          </button>
        </article>

        <article
          class="dashboard-card status-card"
          aria-label="写作近况"
        >
          <div class="card-title">
            <div>
              <h2>写作近况</h2>
            </div>
            <button
              class="more-link top-link"
              type="button"
              @click="router.push('/analytics/overview')"
            >
              查看数据中心 >
            </button>
          </div>
          <div
            v-if="statsError"
            class="small-error status-error"
          >
            <span>{{ statsError }}</span>
            <button
              type="button"
              :disabled="statsLoading"
              @click="loadStats"
            >
              重试
            </button>
          </div>
          <div class="status-grid">
            <div>
              <b>{{ formatNumber(todayStatus.todayWords) }}</b>
              <span>新增字数</span>
            </div>
            <div>
              <b>{{ formatNumber(todayStatus.streakDays) }}</b>
              <span>连续写作</span>
            </div>
            <div>
              <b>{{ formatNumber(todayStatus.totalAiCalls) }}</b>
              <span>AI 调用</span>
            </div>
            <div>
              <b>{{ formatNumber(todayStatus.totalAiTokens) }}</b>
              <span>Token</span>
            </div>
          </div>
          <div
            v-if="hasTrendData"
            class="mini-line-chart"
            aria-label="最近 7 天净增字数"
          >
            <svg
              viewBox="0 0 240 78"
              preserveAspectRatio="none"
              role="img"
            >
              <polyline :points="chartPoints" />
              <circle
                v-for="point in chartPointRows"
                :key="point.key"
                :cx="point.x"
                :cy="point.y"
                r="3"
              />
            </svg>
          </div>
          <p
            v-else
            class="chart-empty"
          >
            写几章后，这里会出现你的 7 天创作曲线。
          </p>
        </article>
      </aside>
    </section>

    <section class="starter-category-section">
      <div class="section-title-row">
        <h2>选择小说分类</h2>
      </div>
      <div class="starter-category-tags">
        <button
          v-for="category in starterCategories"
          :key="category.name"
          type="button"
          @click="applyStarterCategory(category)"
        >
          {{ category.name }}
        </button>
      </div>
      <p>点击标签快速填充创作提示词，或直接在上方输入框中输入您的想法。</p>
    </section>

    <section class="dashboard-bottom-grid">
      <article class="dashboard-card continue-card">
        <div class="card-title">
          <div>
            <h2>继续写作</h2>
          </div>
          <button
            class="more-link top-link"
            type="button"
            @click="router.push('/knowledge-library/creative')"
          >
            查看更多 >
          </button>
        </div>
        <div
          v-if="recentBooksReadError"
          class="small-error list-error"
        >
          <span>{{ recentBooksReadError }}</span>
          <button
            type="button"
            :disabled="recentBooksLoading"
            @click="loadRecentBookDetails"
          >
            重试
          </button>
        </div>
        <div
          v-if="recentBooks.length"
          class="writing-list"
        >
          <div
            v-for="book in recentBooks"
            :key="book.id || book.folderName || book.name"
            class="writing-row"
          >
            <div
              class="cover-thumb"
              :style="{ backgroundColor: wabiCoverColor(book.coverColor) }"
            >
              <img
                v-if="coverSrc(book)"
                :src="coverSrc(book)"
                :alt="book.name"
              >
            </div>
            <div class="writing-main">
              <strong>{{ book.name || book.folderName }}</strong>
              <small>{{ latestChapterText(book) }} · {{ todayBookWordsText(book) }}</small>
            </div>
            <el-button
              size="small"
              @click="openBook(book)"
            >
              继续写
            </el-button>
          </div>
        </div>
        <p
          v-else
          class="soft-empty"
        >
          还没有作品。可以先用「创作起笔」生成起笔方案，再转为新书。
        </p>
      </article>

      <article class="dashboard-card materials-card">
        <div class="card-title">
          <div>
            <h2>可引用资料</h2>
          </div>
          <button
            class="more-link top-link"
            type="button"
            @click="router.push('/knowledge-library/all')"
          >
            查看更多 >
          </button>
        </div>
        <div
          v-if="recentMaterials.length"
          class="material-list"
        >
          <div
            v-for="item in recentMaterials"
            :key="item.key"
            class="material-row"
          >
            <div>
              <span class="type-tag">{{ item.typeLabel }}</span>
              <strong>{{ item.title }}</strong>
              <small>{{ formatDate(item.updatedAt) }}</small>
            </div>
            <div class="material-actions">
              <button
                type="button"
                @click="openMaterial(item)"
              >
                打开
              </button>
              <button
                type="button"
                @click="quoteMaterial(item)"
              >
                引用到创作起笔
              </button>
            </div>
          </div>
        </div>
        <div
          v-else
          class="compact-empty"
        >
          <strong>{{ t('homeAi.emptyMaterials') }}</strong>
          <span>{{ t('homeAi.emptyMaterialsHint') }}</span>
          <button
            type="button"
            @click="router.push('/knowledge-library/all')"
          >
            {{ t('homeAi.addMaterial') }}
          </button>
        </div>
      </article>
    </section>

    <EncourageToastScheduler />
  </div>
</template>

<script setup>
import { APP_NAME_ZH } from '@renderer/constants/brand'
import { computed, onBeforeUnmount, onMounted, onActivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import EncourageToastScheduler from '@renderer/components/EncourageToastScheduler.vue'
import { useMainStore } from '@renderer/stores'
import { readBooksDir, getBookDir } from '@renderer/service/books'
import { listChapterTree } from '@renderer/service/editor'
import { listKnowledgeItems } from '@renderer/service/knowledgeBase'
import { listMarketActivities, listMarketHotspots } from '@renderer/service/market'
import { listPromptPresets } from '@renderer/service/aiWorkshop'
import { statisticsService } from '@renderer/service/statisticsService'
import { createCreationStarterJob } from '@renderer/service/creationStarter'
import {
  getActiveTextProvider,
  getAiProvidersByCategory,
  setActiveTextProvider
} from '@renderer/service/aiProvider'
import { bookImageUrl } from '@renderer/utils/webImageUrl'
import { useCancellableLoad } from '@renderer/composables/useCancellableLoad'

defineOptions({ name: 'Dashboard' })

const router = useRouter()
const mainStore = useMainStore()
const { t, te } = useI18n()
const { begin: beginDashboardLoad, end: endDashboardLoad } = useCancellableLoad()
const dashboardHydrated = ref(false)
const dashboardLastLoadedAt = ref(0)
const DASHBOARD_SOFT_TTL_MS = 60_000

const booksDir = ref('')
const ideaInput = ref('')
const creatingJob = ref(false)
const loadingProviders = ref(false)
const starterCardRef = ref(null)
const knowledgeItems = ref([])
const promptPresets = ref([])
const hotspots = ref([])
const activities = ref([])
const todayStatus = ref({})
const last7Days = ref([])
const bookDailyStats = ref({})
const bookDailyStatsErrors = ref({})
const bookChapterMap = ref({})
const bookChapterLoadErrors = ref({})
const marketRange = ref('today')
const marketError = ref('')
const statsError = ref('')
const statsLoading = ref(false)
const lastMarketUpdatedAt = ref(null)
const refreshTimer = ref(null)
const recentBooksLoading = ref(false)
const textProviders = ref([])
const selectedProviderId = ref('')
const selectedModel = ref('')
const modelOptions = ref([])
const selectedStarterPresetId = ref('')

const builtinPromptPresetI18nKeys = {
  'maliang-setting-tomato-web-novel': 'promptPreset.builtin.maliangTomatoWebNovel',
  SYSTEM_TOMATO_WEB_NOVEL: 'promptPreset.builtin.maliangTomatoWebNovel',
  'maliang-setting-nine-line-method': 'promptPreset.builtin.maliangNineLineMethod',
  SYSTEM_NINE_LINE_METHOD: 'promptPreset.builtin.maliangNineLineMethod',
  'maliang-setting-three-act-structure': 'promptPreset.builtin.maliangThreeActStructure',
  SYSTEM_THREE_ACT_STRUCTURE: 'promptPreset.builtin.maliangThreeActStructure',
  'maliang-setting-short-video-script': 'promptPreset.builtin.maliangShortVideoScript',
  SYSTEM_SHORT_VIDEO_SCRIPT: 'promptPreset.builtin.maliangShortVideoScript',
  'builtin-creation-starter': 'promptPreset.builtin.creationStarter'
}

const marketTabs = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' }
]

const DEFAULT_WABI_COVER_COLOR = '#6f7a68'
const mutedCoverColorMap = new Map([
  ['#22345c', DEFAULT_WABI_COVER_COLOR],
  ['#23314f', DEFAULT_WABI_COVER_COLOR],
  ['rgb(34, 52, 92)', DEFAULT_WABI_COVER_COLOR],
  ['rgb(35, 49, 79)', DEFAULT_WABI_COVER_COLOR]
])

const starterCategories = [
  { name: '现代都市', prompt: '创作一个现代都市背景的小说，主角是一位在大城市奋斗的年轻人。' },
  { name: '古风仙侠', prompt: '创作一个古风仙侠小说，描述一位修仙者的成长历程。' },
  { name: '科幻未来', prompt: '创作一个科幻未来题材的小说，背景设定在 2100 年的地球。' },
  { name: '悬疑推理', prompt: '创作一个悬疑推理小说，围绕一起神秘的案件展开。' },
  { name: '校园青春', prompt: '创作一个校园青春小说，讲述高中生活中的友情与成长。' },
  { name: '历史架空', prompt: '创作一个历史架空小说，设定在一个虚构的古代王朝。' },
  { name: '玄幻魔法', prompt: '创作一个玄幻魔法小说，主角意外获得了强大的魔法力量。' },
  { name: '军事战争', prompt: '创作一个军事战争小说，描述一场激烈的现代战争。' },
  { name: '商战职场', prompt: '创作一个商战职场小说，主角在大企业中的奋斗历程。' },
  { name: '穿越重生', prompt: '创作一个穿越重生小说，主角回到了十年前的自己。' },
  { name: '末世求生', prompt: '创作一个末世求生小说，描述人类在灾难后的生存斗争。' },
  { name: '异世冒险', prompt: '创作一个异世界冒险小说，主角被传送到了陌生的世界。' },
  { name: '武侠江湖', prompt: '创作一个武侠江湖小说，讲述侠客行走江湖的故事。' },
  { name: '娱乐圈', prompt: '创作一个娱乐圈题材的小说，主角是一位新人演员。' },
  { name: '电竞游戏', prompt: '创作一个电竞游戏小说，描述职业选手的比赛生涯。' },
  { name: '灵异恐怖', prompt: '创作一个灵异恐怖小说，主角遭遇了超自然现象。' }
]

const books = computed(() => mainStore.books || [])
const canCreateStarterJob = computed(() =>
  Boolean(
    ideaInput.value.trim() &&
      selectedProviderId.value &&
      selectedModel.value &&
      selectedStarterPresetId.value
  )
)
const starterPresetOptions = computed(() => {
  const rows = promptPresets.value.filter((preset) =>
    ['settingtree', 'creation_starter', 'topic'].includes(normalizePresetCategory(preset.category))
  )
  return uniqueById(rows)
})
const creativeBooks = computed(() => books.value.filter((book) => book.bookRole !== 'downloaded'))
const recentBooks = computed(() =>
  [...creativeBooks.value]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 3)
)
const marketHotspots = computed(() => {
  const start = rangeStartTime(marketRange.value)
  return hotspots.value
    .filter((item) => dateValue(item.capturedAt || item.updatedAt || item.createdAt) >= start)
    .sort((a, b) => Number(b.heatScore || 0) - Number(a.heatScore || 0))
    .slice(0, 3)
})
const marketActivities = computed(() =>
  activities.value
    .filter((item) => ['active', 'ending_soon'].includes(item.status))
    .sort((a, b) => dateValue(a.endDate) - dateValue(b.endDate))
    .slice(0, 2)
)
const referenceOptions = computed(() => {
  const bookRows = creativeBooks.value.map((book) => ({
    key: `book:${book.id || book.folderName || book.name}`,
    type: 'book',
    category: 'book',
    typeLabel: '作品',
    shortLabel: `作品：${book.name || book.folderName}`,
    title: book.name || book.folderName,
    summary: book.intro || '',
    updatedAt: book.updatedAt,
    raw: book
  }))
  const knowledgeRows = knowledgeItems.value.filter(isCreativeReferenceItem).map((item) => ({
    key: `knowledge:${item.id}`,
    type: item.type,
    category: referenceCategoryForType(item.type),
    typeLabel: assetTypeText(item.type),
    shortLabel: `${assetTypeText(item.type)}：${item.title}`,
    title: item.title,
    summary: item.summary || item.content || '',
    updatedAt: item.updatedAt,
    raw: item
  }))
  const presetRows = promptPresets.value.map((preset) => ({
    key: `prompt:${preset.id}`,
    type: 'prompt_template',
    category: 'prompt',
    typeLabel: preset.isBuiltin ? t('homeAi.builtinPrompt') : t('homeAi.promptTemplate'),
    shortLabel: `${t('homeAi.promptTemplate')}：${preset.name || t('homeAi.unnamedTemplate')}`,
    title: preset.name || t('homeAi.unnamedTemplate'),
    summary: [preset.systemPrompt, preset.userPromptTemplate].filter(Boolean).join('\n\n'),
    updatedAt: preset.updatedAt || preset.createdAt,
    raw: preset
  }))
  return [...presetRows, ...knowledgeRows, ...bookRows]
})
const recentMaterials = computed(() =>
  referenceOptions.value
    .filter((item) => item.type !== 'book')
    .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
    .slice(0, 4)
)
const recentBooksReadError = computed(() => {
  const failedDaily = Object.keys(bookDailyStatsErrors.value).length
  const failedChapters = Object.keys(bookChapterLoadErrors.value).length
  if (!failedDaily && !failedChapters) return ''
  return '部分作品信息读取失败'
})
const marketUpdateText = computed(() => {
  if (!lastMarketUpdatedAt.value) return '自动更新 · 30 分钟'
  const diff = Date.now() - lastMarketUpdatedAt.value.getTime()
  if (diff < 60 * 1000) return '刚刚更新'
  return `自动更新 · ${Math.max(1, Math.round(diff / 60000))} 分钟前`
})
const trendRows = computed(() =>
  last7Days.value.map((item, index) => ({
    key: item.date || index,
    value: Number(item.delta || item.words || 0)
  }))
)
const hasTrendData = computed(() => trendRows.value.filter((item) => item.value > 0).length >= 2)
const chartPointRows = computed(() => {
  if (!hasTrendData.value) return []
  const max = Math.max(...trendRows.value.map((item) => item.value), 1)
  const width = 240
  const height = 78
  const step = trendRows.value.length > 1 ? width / (trendRows.value.length - 1) : width
  return trendRows.value.map((item, index) => ({
    key: item.key,
    x: Math.round(index * step),
    y: Math.round(height - (item.value / max) * 60 - 9)
  }))
})
const chartPoints = computed(() =>
  chartPointRows.value.map((point) => `${point.x},${point.y}`).join(' ')
)

onMounted(async () => {
  await ensureDashboardData()
  if (!refreshTimer.value) {
    refreshTimer.value = window.setInterval(loadMarketData, 30 * 60 * 1000)
  }
})

onActivated(async () => {
  await ensureDashboardData({ soft: true })
  if (!refreshTimer.value) {
    refreshTimer.value = window.setInterval(loadMarketData, 30 * 60 * 1000)
  }
})

onBeforeUnmount(() => {
  if (refreshTimer.value) window.clearInterval(refreshTimer.value)
  refreshTimer.value = null
})

watch(marketRange, loadMarketData)

async function ensureDashboardData({ soft = false } = {}) {
  if (soft && dashboardHydrated.value) {
    const age = Date.now() - dashboardLastLoadedAt.value
    if (age < DASHBOARD_SOFT_TTL_MS) return
  }
  await loadDashboardData()
}

async function loadDashboardData() {
  const session = beginDashboardLoad()
  try {
    await Promise.allSettled([loadKnowledge(), loadPromptPresets(), loadMarketData(), loadTextProviders()])
    if (!session.isCurrent()) return
    await loadBooks()
    if (!session.isCurrent()) return
    await Promise.allSettled([loadStats(), loadRecentBookDetails()])
    if (!session.isCurrent()) return
    dashboardHydrated.value = true
    dashboardLastLoadedAt.value = Date.now()
  } finally {
    endDashboardLoad(session.token)
  }
}

async function loadTextProviders() {
  loadingProviders.value = true
  try {
    textProviders.value = await getAiProvidersByCategory('text')
    const active = await getActiveTextProvider().catch(() => null)
    const activeId = active?.providerId || ''
    const provider =
      textProviders.value.find((item) => item.id === activeId) || textProviders.value[0]
    if (provider) {
      selectedProviderId.value = provider.id
      setModelOptions(provider)
    }
  } catch {
    textProviders.value = []
    selectedProviderId.value = ''
    selectedModel.value = ''
    modelOptions.value = []
  } finally {
    loadingProviders.value = false
  }
}

function handleProviderChange(providerId) {
  const provider = textProviders.value.find((item) => item.id === providerId)
  setModelOptions(provider)
  if (providerId) setActiveTextProvider(providerId).catch(() => {})
}

function setModelOptions(provider) {
  modelOptions.value = Array.isArray(provider?.models) ? provider.models.filter(Boolean) : []
  selectedModel.value = modelOptions.value[0] || provider?.model || ''
}

async function loadBooks() {
  booksDir.value = await getBookDir()
  await readBooksDir()
}

async function loadKnowledge() {
  try {
    const result = await listKnowledgeItems({ sortBy: 'updatedAt' })
    knowledgeItems.value = result?.items || result || []
  } catch {
    knowledgeItems.value = []
  }
}

async function loadPromptPresets() {
  try {
    const result = await listPromptPresets()
    promptPresets.value = normalizePromptRows(result)
    selectDefaultStarterPreset()
  } catch {
    promptPresets.value = []
  }
}

function selectDefaultStarterPreset() {
  const options = starterPresetOptions.value
  if (!options.length) {
    selectedStarterPresetId.value = ''
    return
  }
  if (options.some((preset) => preset.id === selectedStarterPresetId.value)) return
  const preferred =
    options.find((preset) => /tomato|番茄|网文/i.test(`${preset.id} ${preset.name}`)) ||
    options.find((preset) => /nine|九线法/i.test(`${preset.id} ${preset.name}`)) ||
    options[0]
  selectedStarterPresetId.value = preferred?.id || ''
}

async function loadMarketData() {
  marketError.value = ''
  try {
    const [hotspotResult, activityResult] = await Promise.all([
      listMarketHotspots({ sortBy: 'heat' }),
      listMarketActivities({ sortBy: 'endDate' })
    ])
    hotspots.value = hotspotResult?.items || hotspotResult || []
    activities.value = activityResult?.items || activityResult || []
    lastMarketUpdatedAt.value = new Date()
  } catch (error) {
    marketError.value = error?.message || '市场资料读取失败'
  }
}

async function loadStats() {
  statsLoading.value = true
  statsError.value = ''
  try {
    const [overview, daily] = await Promise.all([
      statisticsService.getOverview('all', null),
      statisticsService.getTrendData(7, null)
    ])
    todayStatus.value = overview && typeof overview === 'object' ? overview : {}
    last7Days.value = Array.isArray(daily) ? daily : []
  } catch (error) {
    statsError.value = error?.message || '读取写作近况失败'
    todayStatus.value = {}
    last7Days.value = []
  } finally {
    statsLoading.value = false
  }
}

async function loadRecentBookDetails() {
  const booksToLoad = recentBooks.value
  if (!booksToLoad.length) {
    bookDailyStats.value = {}
    bookDailyStatsErrors.value = {}
    bookChapterMap.value = {}
    bookChapterLoadErrors.value = {}
    return
  }

  recentBooksLoading.value = true
  try {
    const chapterResults = await Promise.all(
      booksToLoad.map(async (book) => {
        const key = bookKey(book)
        try {
          const rows = await listChapterTree(book.folderName || book.name)
          return { key, chapterName: latestChapterName(rows) }
        } catch (error) {
          return { key, chapterName: '', error: error?.message || '读取章节失败' }
        }
      })
    )
    const wordResults = await Promise.all(
      booksToLoad.map(async (book) => {
        const key = bookKey(book)
        try {
          const result = await statisticsService.getBookDailyStats(book.folderName || book.name)
          return { key, words: result.todayAddWords }
        } catch (error) {
          return { key, words: 0, error: error?.message || '读取今日新增失败' }
        }
      })
    )

    const nextBookChapterMap = {}
    const nextBookChapterLoadErrors = {}
    for (const item of chapterResults) {
      if (item.error) nextBookChapterLoadErrors[item.key] = item.error
      else nextBookChapterMap[item.key] = item.chapterName
    }

    const nextBookDailyStats = {}
    const nextBookDailyStatsErrors = {}
    for (const item of wordResults) {
      if (item.error) nextBookDailyStatsErrors[item.key] = item.error
      else nextBookDailyStats[item.key] = item.words
    }

    bookChapterMap.value = nextBookChapterMap
    bookChapterLoadErrors.value = nextBookChapterLoadErrors
    bookDailyStats.value = nextBookDailyStats
    bookDailyStatsErrors.value = nextBookDailyStatsErrors
  } finally {
    recentBooksLoading.value = false
  }
}

async function handleCreateStarterJob() {
  const prompt = ideaInput.value.trim()
  if (!prompt) return
  if (!selectedProviderId.value || !selectedModel.value) {
    ElMessage.warning(t('homeAi.needProviderAndModel'))
    return
  }
  creatingJob.value = true
  try {
    const autoReferences = buildAutoReferences()
    const job = await createCreationStarterJob({
      prompt,
      references: [],
      autoReferences,
      advanced: {
        promptPresetId: selectedStarterPresetId.value,
        promptPresetName: promptPresetDisplayName(
          starterPresetOptions.value.find((preset) => preset.id === selectedStarterPresetId.value)
        )
      },
      providerId: selectedProviderId.value,
      model: selectedModel.value
    })
    router.push({ path: '/ai/creation-starter', query: { jobId: job.id } })
  } catch (error) {
    ElMessage.error(error?.message || t('homeAi.createStarterFailed'))
  } finally {
    creatingJob.value = false
  }
}

function applyStarterCategory(category) {
  if (!category?.prompt) return
  const current = ideaInput.value.trim()
  ideaInput.value = current ? `${current}\n${category.prompt}` : category.prompt
  starterCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function buildAutoReferences() {
  return [
    ...knowledgeItems.value
      .filter(isCreativeReferenceItem)
      .slice(0, 5)
      .map((item) => ({
        key: `auto-knowledge:${item.id}`,
        type: item.type,
        typeLabel: assetTypeText(item.type),
        title: item.title,
        summary: item.summary || item.content || '',
        raw: item
      })),
    ...promptPresets.value.slice(0, 3).map((preset) => ({
      key: `auto-prompt:${preset.id}`,
      type: 'prompt_template',
      typeLabel: preset.isBuiltin ? t('homeAi.builtinPrompt') : t('homeAi.promptTemplate'),
      title: preset.name || t('homeAi.unnamedTemplate'),
      summary: [preset.systemPrompt, preset.userPromptTemplate].filter(Boolean).join('\n\n'),
      raw: preset
    }))
  ]
}

function quoteMaterial(item) {
  ideaInput.value = [ideaInput.value.trim(), item.summary || item.title].filter(Boolean).join('\n')
  starterCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function openMaterial(item) {
  if (item.type === 'prompt_template') {
    router.push('/knowledge-library/prompts')
    return
  }
  if (item.type === 'book') {
    openBook(item.raw)
    return
  }
  router.push('/knowledge-library/all')
}

function normalizePromptRows(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.items)) return result.items
  if (Array.isArray(result?.presets)) return result.presets
  return []
}

function normalizePresetCategory(category) {
  return String(category || '')
    .replace(/[-_\s]/g, '')
    .toLowerCase()
}

function promptPresetDisplayName(preset) {
  if (!preset) return ''
  const key = builtinPromptPresetI18nKeys[preset.id] || builtinPromptPresetI18nKeys[preset.name]
  if (key && te(key)) return t(key)
  return preset.name || preset.id || ''
}

function uniqueById(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

function openBook(book) {
  const folderName = book.folderName || book.name
  const id = bookKey(book)
  router.push({
    path: `/editor/${encodeURIComponent(id)}`,
    query: { name: folderName }
  })
}

function bookKey(book) {
  return book?.id || book?.folderName || book?.name || ''
}

function coverSrc(book) {
  if (!book?.coverUrl) return ''
  if (book.coverUrl.startsWith('http')) return book.coverUrl
  return bookImageUrl(book.folderName || book.name, book.coverUrl)
}

function wabiCoverColor(color) {
  const normalized = String(color || '')
    .trim()
    .toLowerCase()
  return mutedCoverColorMap.get(normalized) || normalized || DEFAULT_WABI_COVER_COLOR
}

function latestChapterName(rows = []) {
  const chapters = rows.flatMap((volume) => (Array.isArray(volume.children) ? volume.children : []))
  return chapters[chapters.length - 1]?.name || ''
}

function latestChapterText(book) {
  const key = bookKey(book)
  if (bookChapterLoadErrors.value[key]) return '章节读取失败'
  if (Object.prototype.hasOwnProperty.call(bookChapterMap.value, key)) {
    return bookChapterMap.value[key] || '暂无章节'
  }
  return recentBooksLoading.value ? '章节读取中' : '暂无章节'
}

function todayBookWordsText(book) {
  const key = bookKey(book)
  if (bookDailyStatsErrors.value[key]) return '今日新增读取失败'
  if (Object.prototype.hasOwnProperty.call(bookDailyStats.value, key)) {
    return `今日新增 ${formatNumber(Number(bookDailyStats.value[key] || 0))} 字`
  }
  return recentBooksLoading.value ? '今日新增读取中' : '今日新增 0 字'
}

function rangeStartTime(range) {
  const date = new Date()
  if (range === 'today') date.setHours(0, 0, 0, 0)
  else if (range === 'week') date.setDate(date.getDate() - 7)
  else date.setMonth(date.getMonth() - 1)
  if (range !== 'today') date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function remainingText(item) {
  if (!item.endDate) return '无截止时间'
  const days = Math.ceil((dateValue(item.endDate) - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return '已结束'
  if (days === 0) return '今天截止'
  return `还剩 ${days} 天`
}

function dateValue(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatDate(value) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录时间'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function assetTypeText(type) {
  const map = {
    topic_card: '选题卡',
    book_analysis: '拆书',
    note: '笔记',
    character_setting: '人物',
    world_setting: '世界观',
    plot_fragment: '桥段',
    prompt_template: t('homeAi.promptTemplate')
  }
  return map[type] || '素材'
}

function referenceCategoryForType(type) {
  if (type === 'prompt_template') return 'prompt'
  if (['character_setting', 'world_setting', 'plot_fragment'].includes(type)) return 'setting'
  return 'knowledge'
}

function isCreativeReferenceItem(item = {}) {
  return !['market_hotspot', 'writer_activity'].includes(item.type)
}
</script>

<style lang="scss" scoped>
.home-page {
  width: min(100%, 1560px);
  margin: 0 auto;
  overflow-x: clip;
  color: var(--wabi-ink);
}

.dashboard-header {
  margin-bottom: 22px;

  h1 {
    margin: 0;
    color: var(--wabi-ink);
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: clamp(30px, 2.2vw, 40px);
    letter-spacing: 0.04em;
  }
}

.headline {
  margin: 8px 0 0;
  color: var(--wabi-ink-soft);
  font-size: clamp(16px, 1vw, 18px);
}

.brand-en {
  margin: 8px 0 0;
  color: var(--wabi-muted);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.subline {
  margin: 6px 0 0;
  color: var(--wabi-muted);
  font-size: clamp(14px, 0.9vw, 16px);
}

.dashboard-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: clamp(24px, 2vw, 32px);
  align-items: stretch;
}

.dashboard-side-stack {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: clamp(20px, 1.6vw, 28px);
  min-width: 0;
}

.dashboard-bottom-grid {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: clamp(24px, 2vw, 32px);
  margin-top: clamp(24px, 2vw, 32px);
}

.starter-category-section {
  margin-top: clamp(22px, 1.8vw, 28px);

  h2 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 20px;
  }

  p {
    margin: 14px 0 0;
    color: var(--wabi-muted);
    font-size: 14px;
  }
}

.starter-category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.78);
    color: var(--wabi-muted);
    cursor: pointer;
    font: inherit;
    padding: 8px 16px;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.82);
      border-color: rgba(111, 122, 104, 0.38);
      color: var(--wabi-moss-dark);
    }
  }
}

.creation-card {
  display: flex;
  min-height: clamp(500px, 50vh, 620px);
  flex-direction: column;
}

.dashboard-card {
  min-width: 0;
  border: 1px solid var(--wabi-line);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.36), transparent 54%),
    linear-gradient(180deg, rgba(251, 250, 246, 0.95), rgba(240, 236, 227, 0.84));
  box-shadow: var(--wabi-shadow-soft);
  padding: clamp(22px, 2vw, 30px);
}

.market-card,
.status-card {
  padding: clamp(20px, 1.6vw, 24px);
}

.continue-card,
.materials-card {
  min-height: 300px;
}

.card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: clamp(22px, 1.4vw, 28px);
  }
}

.update-text {
  color: var(--wabi-muted);
  font-size: 12px;
}

.starter-kicker {
  margin: 6px 0 0;
  color: var(--wabi-muted);
  font-size: 14px;
}

.starter-desc {
  max-width: 920px;
  margin: 0 0 14px;
  color: var(--wabi-muted);
  font-size: 15px;
  line-height: 1.8;
}

.creation-textarea {
  width: 100%;
  min-height: clamp(240px, 28vh, 340px);
  flex: 1;
  resize: vertical;
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  outline: none;
  background:
    linear-gradient(135deg, transparent 0 78%, rgba(111, 122, 104, 0.08) 78% 100%),
    rgba(251, 250, 246, 0.86);
  color: var(--wabi-ink);
  font: inherit;
  font-size: 15px;
  line-height: 1.8;
  padding: clamp(16px, 1.6vw, 22px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);

  &:focus {
    border-color: rgba(111, 122, 104, 0.52);
    box-shadow: var(--wabi-focus);
  }
}

.starter-control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-bottom: 14px;

  label {
    display: flex;
    flex: 1 1 190px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .strategy-field {
    flex-basis: 240px;
  }

  span {
    color: var(--wabi-muted);
    font-size: 13px;
  }

  :deep(.el-select) {
    width: 100%;
  }
}

.prompt-market-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  min-width: 82px;
  border: 1px solid rgba(111, 122, 104, 0.46);
  border-radius: 8px;
  background: var(--wabi-moss);
  color: #fbfaf6;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 0 14px;
  box-shadow: var(--wabi-shadow-soft);
  white-space: nowrap;
}

.market-icon {
  font-size: 14px;
  line-height: 1;
}

.starter-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

:deep(.starter-submit.el-button) {
  min-width: 150px;
  height: 42px;
  border: 1px solid rgba(111, 122, 104, 0.46);
  border-radius: 8px;
  background: linear-gradient(135deg, #6f7a68, #55614e);
  box-shadow: var(--wabi-shadow-soft);
  color: #fbfaf6;
  font-weight: 700;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--wabi-shadow);
  }

  &::before {
    content: '一';
    margin-right: 6px;
    color: rgba(251, 250, 246, 0.86);
  }
}

.market-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 14px;

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.78);
    color: var(--wabi-muted);
    cursor: pointer;
    padding: 7px;

    &.active {
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.market-section + .market-section {
  margin-top: 16px;
}

.market-section h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.market-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto 14px;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    border-bottom: 1px solid rgba(50, 45, 35, 0.08);
    padding-bottom: 7px;
  }

  b {
    color: var(--wabi-earth);
    font-size: 13px;
    white-space: nowrap;
  }
}

.rank {
  color: var(--wabi-earth);
  font-weight: 700;
}

.market-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-arrow {
  color: var(--wabi-moss);
  font-weight: 700;
}

.activity-list {
  display: grid;
  gap: 8px;

  button {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border: 0;
    border-bottom: 1px solid rgba(50, 45, 35, 0.08);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0 0 7px;
    text-align: left;
  }

  small {
    color: var(--wabi-muted);
    white-space: nowrap;
  }
}

.empty-link,
.more-link {
  border: 0;
  background: transparent;
  color: var(--wabi-moss-dark);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.more-link {
  margin-top: 14px;
}

.top-link {
  margin-top: 0;
  white-space: nowrap;
  font-size: 13px;
}

.small-error {
  color: var(--wabi-rust);
  font-size: 13px;
}

.writing-list,
.material-list {
  display: grid;
  gap: 12px;
}

.writing-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  border-bottom: 1px solid rgba(50, 45, 35, 0.08);
  padding-bottom: 12px;
}

.cover-thumb {
  display: grid;
  position: relative;
  width: 58px;
  height: 78px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(58, 55, 49, 0.16);
  border-radius: 7px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.12), transparent 22%),
    linear-gradient(145deg, #6f7a68, #8a735d 56%, #c5b49e);
  color: #fbfaf6;
  font-weight: 700;
  box-shadow: 0 8px 16px rgba(58, 55, 49, 0.12);

  &::after {
    content: '织梦';
    position: absolute;
    right: 6px;
    bottom: 6px;
    left: 6px;
    border-top: 1px solid rgba(251, 250, 246, 0.32);
    padding-top: 5px;
    color: rgba(251, 250, 246, 0.86);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }

  img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.writing-main,
.material-row div:first-child {
  min-width: 0;

  strong,
  small {
    display: block;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    margin-top: 4px;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  div {
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.72);
    padding: 12px;
  }

  b,
  span {
    display: block;
  }

  b {
    color: var(--wabi-ink);
    font-size: 22px;
  }

  span {
    margin-top: 4px;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.mini-line-chart {
  height: 92px;
  margin-top: 16px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(240, 236, 227, 0.9), rgba(251, 250, 246, 0.55));
  padding: 10px;

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  polyline {
    fill: none;
    stroke: var(--wabi-moss-dark);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 4;
  }

  circle {
    fill: var(--wabi-earth);
    stroke: var(--wabi-paper);
    stroke-width: 2;
  }
}

.chart-empty {
  margin: 18px 0 0;
  border-radius: 10px;
  background: rgba(240, 236, 227, 0.72);
  color: var(--wabi-muted);
  line-height: 1.7;
  padding: 14px;
}

.material-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border-bottom: 1px solid rgba(50, 45, 35, 0.08);
  padding-bottom: 9px;
}

.type-tag {
  display: inline-block;
  margin-bottom: 4px;
  border-radius: 999px;
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
  font-size: 12px;
  padding: 2px 7px;
}

.material-actions {
  display: flex;
  gap: 6px;

  button {
    border: 0;
    background: transparent;
    color: var(--wabi-moss-dark);
    cursor: pointer;
    padding: 0;
  }
}

.soft-empty {
  margin: 14px 0;
  color: var(--wabi-muted);
  line-height: 1.7;
}

.compact-empty {
  display: grid;
  gap: 8px;
  border-radius: 10px;
  background: rgba(240, 236, 227, 0.72);
  color: var(--wabi-muted);
  padding: 14px;

  strong {
    color: var(--wabi-ink);
  }

  button {
    justify-self: start;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.86);
    color: var(--wabi-moss-dark);
    cursor: pointer;
    font: inherit;
    padding: 7px 10px;
  }
}

.market-empty {
  margin: 14px 0;
}

.inline-empty {
  margin: 0;
  color: var(--wabi-muted);
  font-size: 13px;
}

@media (min-width: 1600px) {
  .home-page {
    width: min(100%, 1560px);
  }
}

@media (max-width: 1599px) {
  .home-page {
    width: min(100%, 1360px);
  }

  .dashboard-main-grid {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}

@media (max-width: 1279px) {
  .dashboard-main-grid,
  .dashboard-bottom-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-side-stack {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto;
  }

  .creation-card {
    min-height: auto;
  }
}

@media (max-width: 1023px) {
  .dashboard-main-grid,
  .dashboard-side-stack,
  .dashboard-bottom-grid {
    grid-template-columns: 1fr;
  }

  .starter-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .starter-control-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .home-page {
    width: 100%;
  }

  .dashboard-main-grid,
  .dashboard-side-stack,
  .dashboard-bottom-grid {
    gap: 16px;
  }

  .dashboard-card {
    border-radius: 16px;
  }

  .writing-row,
  .material-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .cover-thumb {
    display: none;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <div class="home-page">
    <!-- 报头 -->
    <header class="masthead">
      <div class="masthead-brand">
        <h1>{{ APP_NAME_ZH }}</h1>
        <p class="brand-en">
          Dreamloom Studio
        </p>
      </div>
      <div class="masthead-aside">
        <p class="headline">
          今天想写一个什么样的故事？
        </p>
        <p class="subline">
          从一个念头开始，把故事慢慢织出来。
        </p>
      </div>
    </header>

    <!-- 账簿速览（沿用 bentoTiles 数据） -->
    <section
      class="bento-strip"
      aria-label="今日速览"
      data-testid="home-bento-strip"
    >
      <button
        v-for="(tile, i) in bentoTiles"
        :key="tile.key"
        type="button"
        class="bento-tile"
        :class="{ 'bento-tile--first': i === 0, 'bento-tile--accent': tile.accent }"
        :data-bento-key="tile.key"
        @click="tile.onClick?.()"
      >
        <span class="bento-tile__label">{{ tile.label }}</span>
        <strong class="bento-tile__value">{{ tile.value }}</strong>
        <span
          v-if="tile.hint"
          class="bento-tile__hint"
        >{{ tile.hint }}</span>
      </button>
    </section>

    <!-- 满宽双栏 -->
    <div class="home-columns">
      <div class="home-col home-col--main">
        <!-- 壹 起笔 -->
        <section
          ref="starterCardRef"
          class="block starter-block"
          :aria-label="t('homeAi.starterTitle')"
        >
          <div class="sec-head">
            <span class="seal">壹</span>
            <h2>{{ t('homeAi.starterTitle') }}</h2>
            <button
              class="text-link"
              type="button"
              @click="router.push('/ai/prompts')"
            >
              {{ t('homeAi.market') }} →
            </button>
          </div>
          <div class="starter-box">
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
          </div>
          <div class="category-tags">
            <button
              v-for="category in starterCategories"
              :key="category.name"
              type="button"
              class="cat"
              @click="applyStarterCategory(category)"
            >
              {{ category.name }}
            </button>
          </div>
        </section>

        <!-- 肆 继续写作 -->
        <section class="block">
          <div class="sec-head">
            <span class="seal">肆</span>
            <h2>继续写作</h2>
            <button
              class="text-link"
              type="button"
              @click="router.push('/knowledge-library/creative')"
            >
              书架 →
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
          <UiSkeleton
            v-if="recentBooksLoading && !recentBooks.length"
            variant="list"
            :count="3"
          />
          <div
            v-else-if="recentBooks.length"
            class="ink-list"
          >
            <div
              v-for="book in recentBooks"
              :key="book.id || book.folderName || book.name"
              class="ink-row book-row"
              @click="openBook(book)"
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
                <span
                  v-else
                  class="cover-glyph"
                >{{ (book.name || book.folderName || '书').charAt(0) }}</span>
              </div>
              <div class="row-main">
                <strong>{{ book.name || book.folderName }}</strong>
                <small>{{ latestChapterText(book) }}</small>
              </div>
              <span class="row-delta">{{ todayBookWordsText(book) }}</span>
            </div>
          </div>
          <p
            v-else
            class="soft-empty"
          >
            还没有作品。可以先用「起笔」生成起笔方案，再转为新书。
          </p>
        </section>
      </div>

      <div class="home-col home-col--side">
        <!-- 贰 市场风向 -->
        <section class="block">
          <div class="sec-head">
            <span class="seal">贰</span>
            <h2>市场风向</h2>
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
          </div>
          <div
            v-if="marketError"
            class="small-error"
          >
            {{ marketError }}
          </div>
          <div
            v-else-if="!marketHotspots.length && !marketActivities.length"
            class="soft-empty"
          >
            暂无市场数据，去<button
              class="text-link inline"
              type="button"
              @click="router.push('/market/overview')"
            >
              刷新热榜
            </button>整理公开热词。
          </div>
          <template v-else>
            <ol
              v-if="marketHotspots.length"
              class="ink-list rank-list"
            >
              <li
                v-for="(item, index) in marketHotspots"
                :key="item.id"
                class="ink-row"
                @click="router.push('/market/overview')"
              >
                <span
                  class="rank"
                  :class="{ top: index < 3 }"
                >{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="rank-name">{{ item.keyword || item.title }}</span>
                <span class="rank-heat">{{ Number(item.heatScore || 0) }}</span>
                <span class="rank-trend">↑</span>
              </li>
            </ol>
            <div
              v-if="marketActivities.length"
              class="activity-list"
            >
              <button
                v-for="item in marketActivities"
                :key="item.id"
                type="button"
                class="ink-row activity-row"
                @click="router.push('/market/overview')"
              >
                <span>{{ item.title }}</span>
                <small>{{ remainingText(item) }}</small>
              </button>
            </div>
          </template>
          <span class="update-text">{{ marketUpdateText }}</span>
        </section>

        <!-- 叁 写作近况 -->
        <section class="block">
          <div class="sec-head">
            <span class="seal">叁</span>
            <h2>写作近况</h2>
            <button
              class="text-link"
              type="button"
              @click="router.push('/analytics/overview')"
            >
              数据中心 →
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
          <div class="stat-grid">
            <div class="stat-row">
              <span>新增字数</span>
              <b>{{ formatNumber(todayStatus.todayWords) }}</b>
            </div>
            <div class="stat-row">
              <span>连续写作</span>
              <b>{{ formatNumber(todayStatus.streakDays) }}</b>
            </div>
            <div class="stat-row">
              <span>AI 调用</span>
              <b>{{ formatNumber(todayStatus.totalAiCalls) }}</b>
            </div>
            <div class="stat-row">
              <span>词元</span>
              <b>{{ formatNumber(todayStatus.totalAiTokens) }}</b>
            </div>
          </div>
          <div
            v-if="hasTrendData"
            class="mini-line-chart"
            aria-label="最近 7 天净增字数"
          >
            <p class="chart-label">
              近 7 日字数
            </p>
            <svg
              viewBox="0 0 240 78"
              preserveAspectRatio="none"
              role="img"
            >
              <polygon
                class="chart-area"
                :points="chartArea"
              />
              <polyline :points="chartPoints" />
              <circle
                v-for="point in chartPointRows"
                :key="point.key"
                :cx="point.x"
                :cy="point.y"
                r="2.4"
              />
            </svg>
          </div>
          <p
            v-else
            class="chart-empty"
          >
            写几章后，这里会出现你的 7 天创作曲线。
          </p>
        </section>

        <!-- 伍 可引用资料 -->
        <section class="block">
          <div class="sec-head">
            <span class="seal">伍</span>
            <h2>可引用资料</h2>
            <button
              class="text-link"
              type="button"
              @click="router.push('/knowledge-library/all')"
            >
              资料库 →
            </button>
          </div>
          <div
            v-if="recentMaterials.length"
            class="ink-list"
          >
            <div
              v-for="item in recentMaterials"
              :key="item.key"
              class="ink-row material-row"
            >
              <span class="type-tag">{{ item.typeLabel }}</span>
              <strong
                class="material-title"
                @click="openMaterial(item)"
              >{{ item.title }}</strong>
              <span class="material-date">{{ formatDate(item.updatedAt) }}</span>
              <button
                type="button"
                class="quote-btn"
                :title="'引用到' + t('homeAi.starterTitle')"
                @click="quoteMaterial(item)"
              >
                引用
              </button>
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
        </section>
      </div>
    </div>

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
import { UiSkeleton } from '@renderer/components/ui'
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

const primaryContinueBook = computed(() => recentBooks.value[0] || null)

const bentoTiles = computed(() => {
  const continueBook = primaryContinueBook.value
  const continueName = continueBook
    ? continueBook.name || continueBook.folderName || '未命名作品'
    : '还没有作品'
  const hotspot = marketHotspots.value[0]
  const hotspotLabel = hotspot
    ? hotspot.keyword || hotspot.title || '查看灵感'
    : '去刷热榜'

  return [
    {
      key: 'today-words',
      label: '今日字数',
      value: formatNumber(todayStatus.value?.todayWords || 0),
      hint: statsLoading.value ? '同步中' : '新增',
      size: 'md',
      accent: true,
      onClick: () => router.push('/analytics/overview')
    },
    {
      key: 'streak',
      label: '连续写作',
      value: `${formatNumber(todayStatus.value?.streakDays || 0)} 天`,
      hint: '保持节奏',
      size: 'sm',
      onClick: () => router.push('/analytics/overview')
    },
    {
      key: 'continue',
      label: '继续写',
      value: continueName,
      hint: continueBook ? todayBookWordsText(continueBook) : '去书架新建',
      size: 'lg',
      onClick: () => {
        if (continueBook) openBook(continueBook)
        else router.push('/knowledge-library/creative')
      }
    },
    {
      key: 'market',
      label: '灵感热点',
      value: hotspotLabel,
      hint: marketUpdateText.value,
      size: 'sm',
      onClick: () => router.push('/market/overview')
    },
    {
      key: 'ai',
      label: 'AI 调用',
      value: formatNumber(todayStatus.value?.totalAiCalls || 0),
      hint: `${formatNumber(todayStatus.value?.totalAiTokens || 0)} tokens`,
      size: 'sm',
      onClick: () => router.push('/ai/queue')
    }
  ]
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
const chartArea = computed(() => {
  const rows = chartPointRows.value
  if (!rows.length) return ''
  const first = rows[0]
  const last = rows[rows.length - 1]
  return `${first.x},78 ${chartPoints.value} ${last.x},78`
})

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
$serif: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
$mono: 'Space Mono', ui-monospace, monospace;

.home-page {
  width: 100%;
  margin: 0;
  overflow-x: clip;
  padding: 4px 4px 40px;
  color: var(--wabi-ink);
}

/* 报头：满宽双线墨栏 */
.masthead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 3px double var(--wabi-ink);
}

.masthead-brand h1 {
  margin: 0;
  color: var(--wabi-ink);
  font-family: $serif;
  font-size: clamp(28px, 2.2vw, 36px);
  font-weight: 700;
  letter-spacing: 0.16em;
}

.brand-en {
  margin: 6px 0 0;
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 11px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

.masthead-aside {
  text-align: right;
}

.headline {
  margin: 0;
  color: var(--wabi-ink-soft);
  font-family: $serif;
  font-size: clamp(15px, 1vw, 17px);
  letter-spacing: 0.08em;
}

.subline {
  margin: 6px 0 0;
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 12px;
  letter-spacing: 0.08em;
}

/* 账簿速览：竖线分栏、无圆角、密排 */
.bento-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-bottom: 1px solid var(--wabi-line);
  margin: 0;
}

.bento-tile {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 16px 18px;
  border: none;
  border-left: 1px solid var(--wabi-line);
  border-radius: 0;
  background: transparent;
  color: var(--wabi-ink);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.18s ease;

  &--first {
    border-left: none;
  }

  &:hover {
    background: var(--wabi-paper-soft);
  }

  &--accent .bento-tile__value {
    color: var(--wabi-seal);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--wabi-seal) 55%, transparent);
    outline-offset: -2px;
  }
}

.bento-tile__label {
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.bento-tile__value {
  color: var(--wabi-ink);
  font-family: $serif;
  font-size: clamp(20px, 1.4vw, 26px);
  font-weight: 700;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bento-tile__hint {
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 满宽双栏：左宽右窄 */
.home-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(300px, 1fr);
  gap: clamp(28px, 2.6vw, 44px);
  margin-top: 26px;
  align-items: start;
}

.home-col {
  min-width: 0;
}

.block + .block {
  margin-top: 30px;
}

/* 章节标题：实心墨块章号 + 粗墨线 */
.sec-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--wabi-ink);

  h2 {
    margin: 0;
    color: var(--wabi-ink);
    font-family: $serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
}

.seal {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  background: var(--wabi-ink);
  color: var(--wabi-paper);
  font-family: $serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.text-link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--wabi-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.02em;
  padding: 0;
  transition: color 0.18s ease;

  &:hover {
    color: var(--wabi-seal);
  }

  &.inline {
    margin: 0 2px;
    color: var(--wabi-seal);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

/* 壹 起笔 */
.starter-box {
  border: 1.5px solid var(--wabi-ink);
  background: var(--wabi-paper-soft);
  padding: 18px 20px;
}

.creation-textarea {
  width: 100%;
  min-height: clamp(120px, 16vh, 200px);
  resize: vertical;
  border: none;
  outline: none;
  background: transparent;
  color: var(--wabi-ink);
  font-family: $serif;
  font-size: 16px;
  line-height: 1.9;
}

.starter-control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--wabi-line);

  label {
    display: flex;
    flex: 1 1 170px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .strategy-field {
    flex-basis: 200px;
  }

  span {
    color: var(--wabi-muted);
    font-family: $mono;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-select__wrapper) {
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    border-bottom: 1px solid var(--wabi-line);
    padding-left: 0;
    padding-right: 4px;
  }

  :deep(.el-select__wrapper.is-focused) {
    box-shadow: none;
    border-bottom-color: var(--wabi-ink);
  }
}

:deep(.starter-submit.el-button) {
  min-width: 150px;
  height: 40px;
  border: 1.5px solid var(--wabi-ink);
  border-radius: 0;
  background: var(--wabi-ink);
  box-shadow: none;
  color: var(--wabi-paper);
  font-family: $serif;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.14em;
  transition: box-shadow 0.18s ease, transform 0.12s ease;

  &:hover {
    background: var(--wabi-ink);
    box-shadow: 0 6px 18px rgba(38, 35, 30, 0.22);
  }

  &:active {
    transform: translateY(1px);
  }

  &.is-disabled {
    opacity: 0.4;
  }
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 14px;

  .cat {
    position: relative;
    border: 0;
    background: transparent;
    color: var(--wabi-ink-soft);
    cursor: pointer;
    font-family: $serif;
    font-size: 15px;
    padding: 2px 0;
    transition: color 0.18s ease;

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -2px;
      height: 1px;
      background: var(--wabi-seal);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.2s ease;
    }

    &:hover {
      color: var(--wabi-seal);
    }

    &:hover::after {
      transform: scaleX(1);
    }
  }
}

/* 通用密排列表 */
.ink-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ink-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 4px;
  border-bottom: 1px solid var(--wabi-line);
  cursor: pointer;
  transition: background 0.18s ease;

  &:hover {
    background: var(--wabi-paper-soft);
  }
}

/* 肆 继续写作 */
.book-row {
  .row-main {
    flex: 1;
    min-width: 0;
  }

  strong {
    display: block;
    color: var(--wabi-ink);
    font-family: $serif;
    font-size: 16px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    display: block;
    margin-top: 3px;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.row-delta {
  flex: 0 0 auto;
  color: var(--wabi-moss-dark);
  font-family: $mono;
  font-size: 12px;
  white-space: nowrap;
}

.cover-thumb {
  display: grid;
  position: relative;
  width: 34px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border-radius: var(--theme-card-radius, 0);
  color: var(--wabi-paper);
  font-family: $serif;
  font-weight: 600;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-glyph {
    font-size: 15px;
  }
}

/* 贰 市场风向 */
.market-tabs {
  display: flex;
  gap: 10px;
  margin-left: auto;

  button {
    border: 0;
    background: transparent;
    color: var(--wabi-muted);
    cursor: pointer;
    font-family: $mono;
    font-size: 11px;
    letter-spacing: 0.08em;
    padding: 0;

    &.active {
      color: var(--wabi-seal);
    }
  }
}

.rank-list .ink-row {
  align-items: baseline;
  gap: 12px;
}

.rank {
  width: 20px;
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 13px;
  font-weight: 700;

  &.top {
    color: var(--wabi-seal);
  }
}

.rank-name {
  flex: 1;
  color: var(--wabi-ink);
  font-family: $serif;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-heat {
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 11px;
}

.rank-trend {
  color: var(--wabi-moss-dark);
  font-weight: 700;
}

.activity-list {
  display: grid;
  margin-top: 4px;

  .activity-row {
    justify-content: space-between;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;

    span {
      font-family: $serif;
      font-size: 15px;
    }

    small {
      color: var(--wabi-muted);
      font-family: $mono;
      font-size: 11px;
      white-space: nowrap;
    }
  }
}

.update-text {
  display: block;
  margin-top: 12px;
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* 叁 写作近况 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 24px;
  margin-bottom: 16px;
}

.stat-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--wabi-line);
  padding-bottom: 7px;

  span {
    color: var(--wabi-muted);
    font-family: $mono;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  b {
    color: var(--wabi-ink);
    font-family: $serif;
    font-size: 19px;
    font-weight: 700;
  }
}

.chart-label {
  margin: 0 0 4px;
  color: var(--wabi-muted);
  font-family: $mono;
  font-size: 10px;
  letter-spacing: 0.14em;
}

.mini-line-chart {
  svg {
    width: 100%;
    height: 78px;
    overflow: visible;
  }

  polyline {
    fill: none;
    stroke: var(--wabi-ink);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
  }

  .chart-area {
    fill: var(--wabi-ink);
    opacity: 0.06;
    stroke: none;
  }

  circle {
    fill: var(--wabi-ink);
  }
}

.chart-empty {
  margin: 14px 0 0;
  color: var(--wabi-muted);
  line-height: 1.7;
}

/* 伍 可引用资料 */
.material-row {
  align-items: baseline;
  gap: 10px;

  .type-tag {
    width: 48px;
    flex: 0 0 auto;
    color: var(--wabi-seal);
    font-family: $mono;
    font-size: 10px;
    letter-spacing: 0.06em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .material-title {
    flex: 1;
    color: var(--wabi-ink);
    font-family: $serif;
    font-size: 15px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .material-date {
    color: var(--wabi-muted);
    font-family: $mono;
    font-size: 11px;
  }

  .quote-btn {
    border: 0;
    background: transparent;
    color: var(--wabi-muted);
    cursor: pointer;
    font-family: $serif;
    font-size: 14px;
    padding: 0;
    border-bottom: 1px solid var(--wabi-line);
    transition: color 0.18s ease;

    &:hover {
      color: var(--wabi-seal);
    }
  }
}

/* 空 / 错态 */
.small-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--wabi-rust, #9a3b2e);
  font-size: 13px;

  button {
    border: 1px solid var(--wabi-line);
    background: transparent;
    color: var(--wabi-ink);
    cursor: pointer;
    font: inherit;
    padding: 2px 10px;
  }
}

.soft-empty {
  margin: 6px 0;
  color: var(--wabi-muted);
  line-height: 1.8;
}

.compact-empty {
  display: grid;
  gap: 8px;
  border: 1px solid var(--wabi-line);
  background: var(--wabi-paper-soft);
  color: var(--wabi-muted);
  padding: 14px;

  strong {
    color: var(--wabi-ink);
    font-family: $serif;
  }

  button {
    justify-self: start;
    border: 1.5px solid var(--wabi-ink);
    background: var(--wabi-ink);
    color: var(--wabi-paper);
    cursor: pointer;
    font-family: $serif;
    letter-spacing: 0.1em;
    padding: 7px 16px;
  }
}

/* 响应式 */
@media (max-width: 1279px) {
  .home-columns {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .bento-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bento-tile:nth-child(3n + 1) {
    border-left: none;
  }
}

@media (max-width: 760px) {
  .masthead {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .masthead-aside {
    text-align: left;
  }

  .bento-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bento-tile {
    border-left: none;
    border-bottom: 1px solid var(--wabi-line);
  }

  .starter-control-row label {
    flex-basis: 100%;
  }
}
</style>

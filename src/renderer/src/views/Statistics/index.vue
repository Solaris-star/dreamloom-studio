<template>
  <div class="statistics-view">
    <div class="header">
      <div class="actions">
        <el-select
          v-model="selectedBook"
          :placeholder="t('statistics.allBooks')"
          :disabled="isLoadingStatistics"
          clearable
          @change="handleFilterChange"
        >
          <el-option
            :label="t('statistics.allBooks')"
            value=""
          />
          <el-option
            v-for="book in bookList"
            :key="book.folderName || book.name"
            :label="book.name"
            :value="book.name"
          />
        </el-select>
      </div>
    </div>

    <div
      v-if="statisticsReadError"
      class="statistics-read-error"
    >
      <div>
        <strong>{{ t('statistics.loadFailed') }}</strong>
        <p>{{ statisticsReadError }}</p>
      </div>
      <el-button
        type="primary"
        :loading="isLoadingStatistics"
        @click="retryLoadAllData"
      >
        {{ t('common.retry') }}
      </el-button>
    </div>

    <div
      v-else
      v-loading="isLoadingStatistics"
      class="scroll-container"
    >
      <div
        v-if="activeSection === 'overview' || activeSection === 'words'"
        class="overview-grid"
      >
        <StatCard
          :title="t('statistics.totalWords')"
          :value="overview.totalWords"
          :unit="t('statistics.words')"
          icon="Book"
          color="#6f7a68"
        />
        <StatCard
          :title="t('statistics.todayWords')"
          :value="overview.todayWords"
          :unit="t('statistics.words')"
          icon="Edit3"
          color="#8a735d"
        />
        <StatCard
          :title="t('statistics.monthWords')"
          :value="overview.monthWords"
          :unit="t('statistics.words')"
          icon="Calendar"
          color="#a98f64"
        />
        <StatCard
          :title="t('statistics.streakDays')"
          :value="overview.streakDays"
          :unit="t('statistics.days')"
          icon="Zap"
          color="#9a604a"
        />
      </div>

      <div
        v-if="activeSection === 'overview' || activeSection === 'words'"
        class="charts-section"
      >
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t('statistics.trend') }}</h3>
            <el-radio-group
              v-model="trendDays"
              size="small"
              :disabled="isTrendLoading || isLoadingStatistics"
              @change="handleTrendDaysChange"
            >
              <el-radio-button :label="7">
                {{ t('statistics.last7Days') }}
              </el-radio-button>
              <el-radio-button :label="30">
                {{ t('statistics.last30Days') }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div
            ref="trendChartRef"
            class="chart-body"
          />
        </div>

        <div class="chart-card heatmap-card">
          <div class="chart-header">
            <h3>{{ t('statistics.heatmap') }}</h3>
            <span class="muted">{{ habit.activeDays }} 个写作日</span>
          </div>
          <div
            ref="heatmapChartRef"
            class="chart-body heatmap-body"
          />
        </div>
      </div>

      <div
        v-if="activeSection === 'overview'"
        class="overview-lower-section"
      >
        <div class="lower-column">
          <div class="info-card ai-usage">
            <div class="card-header">
              <h3>{{ t('statistics.aiUsage') }}</h3>
              <el-button
                link
                :loading="isUsageLoading"
                @click="handleRefreshUsage"
              >
                刷新
              </el-button>
            </div>
            <div class="ai-stat">
              <span class="label">{{ t('statistics.aiTokens') }}</span>
              <span class="value">{{ formatNumber(tokenStats.totalTokens) }}</span>
            </div>
            <div class="ai-stat">
              <span class="label">请求次数</span>
              <span class="value">{{ formatNumber(tokenStats.totalCalls) }}</span>
            </div>
            <div class="ai-stat">
              <span class="label">估算成本</span>
              <span class="value">¥{{ formatCost(tokenStats.totalCost) }}</span>
            </div>
            <div class="token-split">
              <span>输入 {{ formatNumber(tokenStats.promptTokens) }}</span>
              <span>输出 {{ formatNumber(tokenStats.completionTokens) }}</span>
            </div>
            <div
              v-if="tokenStats.byFeature?.length"
              class="usage-list"
            >
              <div
                v-for="row in tokenStats.byFeature.slice(0, 5)"
                :key="row.feature"
                class="usage-row"
              >
                <span>{{ featureLabel(row.feature) }}</span>
                <b>{{ formatNumber(row.totalTokens) }}</b>
              </div>
            </div>
          </div>

          <div class="info-card session-card">
            <div class="card-header">
              <h3>写作会话</h3>
            </div>
            <div class="metric-grid">
              <div>
                <strong>{{ sessionStats.sessionCount }}</strong>
                <span>会话</span>
              </div>
              <div>
                <strong>{{ formatNumber(sessionStats.avgWords) }}</strong>
                <span>平均字数</span>
              </div>
              <div>
                <strong>{{ sessionStats.avgMinutes }}</strong>
                <span>平均分钟</span>
              </div>
              <div>
                <strong>{{ sessionStats.longestSessionMinutes }}</strong>
                <span>最长分钟</span>
              </div>
            </div>
          </div>
        </div>

        <div class="lower-column">
          <div class="info-card goals-card">
            <div class="card-header">
              <h3>{{ t('statistics.goals') }}</h3>
              <el-button
                type="primary"
                link
                :disabled="goalActionBusy"
                @click="handleAddGoal"
              >
                <Plus :size="16" />
                {{ t('statistics.createGoal') }}
              </el-button>
            </div>
            <div
              v-if="goals.length === 0"
              class="goal-empty"
            >
              暂无目标
            </div>
            <div
              v-else
              class="goal-list"
            >
              <article
                v-for="goal in goals"
                :key="goal.id"
                class="goal-item"
              >
                <div class="goal-main">
                  <div>
                    <h4>{{ goal.title }}</h4>
                    <p>
                      {{ goalTypeLabel(goal.type) }}
                      <span v-if="goal.bookId"> · {{ goal.bookId }}</span>
                      <span v-if="goal.endDate"> · 截止 {{ goal.endDate }}</span>
                    </p>
                  </div>
                  <el-tag
                    :type="goalStatusType(goal.status)"
                    size="small"
                    round
                  >
                    {{ goalStatusLabel(goal.status) }}
                  </el-tag>
                </div>
                <el-progress
                  :percentage="goal.percent"
                  :stroke-width="8"
                />
                <div class="goal-footer">
                  <span>{{ formatNumber(goal.currentValue) }} /
                    {{ formatNumber(goal.targetValue) }} 字</span>
                  <span>还差 {{ formatNumber(goal.remaining) }} 字</span>
                  <div class="goal-actions">
                    <el-button
                      size="small"
                      link
                      :disabled="goalActionBusy"
                      @click="handleEditGoal(goal)"
                    >
                      编辑
                    </el-button>
                    <el-button
                      size="small"
                      link
                      type="danger"
                      :loading="deletingGoalId === goal.id"
                      :disabled="goalActionBusy && deletingGoalId !== goal.id"
                      @click="handleDeleteGoal(goal)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div class="info-card report-card">
            <div class="card-header">
              <h3>周报</h3>
              <span class="muted">{{ weeklyReport?.period?.label || '' }}</span>
            </div>
            <p>{{ weeklyReport?.summary || '暂无周报数据' }}</p>
            <div class="report-meta">
              <span>新增 {{ formatNumber(weeklyReport?.totalWords || 0) }} 字</span>
              <span>AI {{ formatNumber(weeklyReport?.totalTokens || 0) }} tokens</span>
            </div>
          </div>

          <div class="info-card report-card">
            <div class="card-header">
              <h3>月报</h3>
              <span class="muted">{{ monthlyReport?.period?.label || '' }}</span>
            </div>
            <p>{{ monthlyReport?.summary || '暂无月报数据' }}</p>
            <div class="report-meta">
              <span>新增 {{ formatNumber(monthlyReport?.totalWords || 0) }} 字</span>
              <span>AI {{ formatNumber(monthlyReport?.totalTokens || 0) }} tokens</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="activeSection === 'tokens' || activeSection === 'goals'"
        class="bottom-section single"
      >
        <div
          v-if="activeSection === 'tokens'"
          class="info-card ai-usage"
        >
          <div class="card-header">
            <h3>{{ t('statistics.aiUsage') }}</h3>
            <el-button
              link
              :loading="isUsageLoading"
              @click="handleRefreshUsage"
            >
              刷新
            </el-button>
          </div>
          <div class="ai-stat">
            <span class="label">{{ t('statistics.aiTokens') }}</span>
            <span class="value">{{ formatNumber(tokenStats.totalTokens) }}</span>
          </div>
          <div class="ai-stat">
            <span class="label">请求次数</span>
            <span class="value">{{ formatNumber(tokenStats.totalCalls) }}</span>
          </div>
          <div class="ai-stat">
            <span class="label">估算成本</span>
            <span class="value">¥{{ formatCost(tokenStats.totalCost) }}</span>
          </div>
          <div class="token-split">
            <span>输入 {{ formatNumber(tokenStats.promptTokens) }}</span>
            <span>输出 {{ formatNumber(tokenStats.completionTokens) }}</span>
          </div>
          <div
            v-if="tokenStats.byFeature?.length"
            class="usage-list"
          >
            <div
              v-for="row in tokenStats.byFeature.slice(0, 5)"
              :key="row.feature"
              class="usage-row"
            >
              <span>{{ featureLabel(row.feature) }}</span>
              <b>{{ formatNumber(row.totalTokens) }}</b>
            </div>
          </div>
        </div>

        <div
          v-if="activeSection === 'goals'"
          class="info-card goals-card"
        >
          <div class="card-header">
            <h3>{{ t('statistics.goals') }}</h3>
            <el-button
              type="primary"
              link
              :disabled="goalActionBusy"
              @click="handleAddGoal"
            >
              <Plus :size="16" />
              {{ t('statistics.createGoal') }}
            </el-button>
          </div>
          <div
            v-if="goals.length === 0"
            class="goal-empty"
          >
            暂无目标
          </div>
          <div
            v-else
            class="goal-list"
          >
            <article
              v-for="goal in goals"
              :key="goal.id"
              class="goal-item"
            >
              <div class="goal-main">
                <div>
                  <h4>{{ goal.title }}</h4>
                  <p>
                    {{ goalTypeLabel(goal.type) }}
                    <span v-if="goal.bookId"> · {{ goal.bookId }}</span>
                    <span v-if="goal.endDate"> · 截止 {{ goal.endDate }}</span>
                  </p>
                </div>
                <el-tag
                  :type="goalStatusType(goal.status)"
                  size="small"
                  round
                >
                  {{ goalStatusLabel(goal.status) }}
                </el-tag>
              </div>
              <el-progress
                :percentage="goal.percent"
                :stroke-width="8"
              />
              <div class="goal-footer">
                <span>{{ formatNumber(goal.currentValue) }} /
                  {{ formatNumber(goal.targetValue) }} 字</span>
                <span>还差 {{ formatNumber(goal.remaining) }} 字</span>
                <div class="goal-actions">
                  <el-button
                    size="small"
                    link
                    :disabled="goalActionBusy"
                    @click="handleEditGoal(goal)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    size="small"
                    link
                    type="danger"
                    :loading="deletingGoalId === goal.id"
                    :disabled="goalActionBusy && deletingGoalId !== goal.id"
                    @click="handleDeleteGoal(goal)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div
        v-else-if="activeSection === 'logs'"
        class="report-section"
      >
        <div class="info-card session-card">
          <div class="card-header">
            <h3>写作会话</h3>
          </div>
          <div class="metric-grid">
            <div>
              <strong>{{ sessionStats.sessionCount }}</strong>
              <span>会话</span>
            </div>
            <div>
              <strong>{{ formatNumber(sessionStats.avgWords) }}</strong>
              <span>平均字数</span>
            </div>
            <div>
              <strong>{{ sessionStats.avgMinutes }}</strong>
              <span>平均分钟</span>
            </div>
            <div>
              <strong>{{ sessionStats.longestSessionMinutes }}</strong>
              <span>最长分钟</span>
            </div>
          </div>
        </div>

        <div class="info-card report-card">
          <div class="card-header">
            <h3>周报</h3>
            <span class="muted">{{ weeklyReport?.period?.label || '' }}</span>
          </div>
          <p>{{ weeklyReport?.summary || '暂无周报数据' }}</p>
          <div class="report-meta">
            <span>新增 {{ formatNumber(weeklyReport?.totalWords || 0) }} 字</span>
            <span>AI {{ formatNumber(weeklyReport?.totalTokens || 0) }} tokens</span>
          </div>
        </div>

        <div class="info-card report-card">
          <div class="card-header">
            <h3>月报</h3>
            <span class="muted">{{ monthlyReport?.period?.label || '' }}</span>
          </div>
          <p>{{ monthlyReport?.summary || '暂无月报数据' }}</p>
          <div class="report-meta">
            <span>新增 {{ formatNumber(monthlyReport?.totalWords || 0) }} 字</span>
            <span>AI {{ formatNumber(monthlyReport?.totalTokens || 0) }} tokens</span>
          </div>
        </div>
      </div>

      <div
        v-if="
          (activeSection === 'overview' || activeSection === 'books') && overview.bookStats?.length
        "
        class="book-section info-card"
      >
        <div class="card-header">
          <h3>书籍字数</h3>
          <span class="muted">{{ overview.bookStats.length }} 本</span>
        </div>
        <div class="book-stat-list">
          <div
            v-for="book in overview.bookStats"
            :key="book.folderName || book.name"
            class="book-stat-row"
          >
            <span>{{ book.name }}</span>
            <b>{{ formatNumber(book.totalWords) }} 字</b>
            <small>{{ book.chapterCount }} 章</small>
          </div>
        </div>
      </div>

      <div
        v-else-if="activeSection === 'books'"
        class="info-card empty-tip"
      >
        暂无作品统计数据。
      </div>
    </div>

    <el-dialog
      v-model="goalDialogVisible"
      :title="editingGoalId ? t('statistics.editGoal') : t('statistics.createGoal')"
      :close-on-click-modal="!goalSaving"
      :close-on-press-escape="!goalSaving"
      :show-close="!goalSaving"
      width="520px"
      @closed="resetGoalForm"
    >
      <el-form label-position="top">
        <el-form-item :label="t('statistics.goalName')">
          <el-input
            v-model="goalForm.title"
            maxlength="40"
            show-word-limit
            placeholder="例如：本月完成 6 万字"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="目标类型">
            <el-select v-model="goalForm.type">
              <el-option
                label="周期新增字数"
                value="range"
              />
              <el-option
                label="今日新增字数"
                value="daily"
              />
              <el-option
                label="总字数"
                value="total"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('statistics.goalTarget')">
            <el-input-number
              v-model="goalForm.targetValue"
              :min="1"
              :step="1000"
              controls-position="right"
            />
          </el-form-item>
        </div>
        <el-form-item :label="t('statistics.selectBook')">
          <el-select
            v-model="goalForm.bookId"
            clearable
            filterable
            :placeholder="t('statistics.allBooks')"
          >
            <el-option
              :label="t('statistics.allBooks')"
              value=""
            />
            <el-option
              v-for="book in bookList"
              :key="book.folderName || book.name"
              :label="book.name"
              :value="book.name"
            />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="开始日期">
            <el-date-picker
              v-model="goalForm.startDate"
              type="date"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item :label="t('statistics.goalDeadline')">
            <el-date-picker
              v-model="goalForm.endDate"
              type="date"
              value-format="YYYY-MM-DD"
              clearable
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input
            v-model="goalForm.note"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="可选"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button
          :disabled="goalSaving"
          @click="goalDialogVisible = false"
        >
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="goalSaving"
          @click="handleSubmitGoal"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>

defineOptions({ name: 'Analytics' })

import { ref, onMounted, onBeforeUnmount, reactive, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from 'lucide-vue-next'
import { echarts } from '@renderer/utils/statisticsEcharts'
import { statisticsService } from '../../service/statisticsService'
import { readBooksDir } from '../../service/books'
import StatCard from './components/StatCard.vue'

const { t } = useI18n()

const route = useRoute()
const selectedBook = ref('')
const bookList = ref([])
const trendDays = ref(30)
const overview = reactive({
  totalWords: 0,
  todayWords: 0,
  monthWords: 0,
  streakDays: 0,
  maxStreakDays: 0,
  totalAiTokens: 0,
  totalAiCost: 0,
  bookStats: []
})
const habit = reactive({
  activeDays: 0,
  heatmap: []
})
const tokenStats = reactive({
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalCost: 0,
  totalCalls: 0,
  byFeature: []
})
const sessionStats = reactive({
  sessionCount: 0,
  avgWords: 0,
  avgMinutes: 0,
  longestSessionMinutes: 0,
  sessions: []
})
const weeklyReport = ref(null)
const monthlyReport = ref(null)
const goals = ref([])
const statisticsReadError = ref('')
const isLoadingStatistics = ref(false)
const isTrendLoading = ref(false)
const isUsageLoading = ref(false)
const goalSaving = ref(false)
const deletingGoalId = ref('')
const goalActionBusy = computed(() => goalSaving.value || Boolean(deletingGoalId.value))

const goalDialogVisible = ref(false)
const editingGoalId = ref('')
const goalForm = reactive({
  title: '',
  type: 'range',
  bookId: '',
  targetValue: 50000,
  startDate: '',
  endDate: '',
  note: ''
})

const trendChartRef = ref(null)
const heatmapChartRef = ref(null)
let trendChart = null
let heatmapChart = null

const activeSection = computed(() => {
  const segment = route.path.split('/').filter(Boolean).at(-1)
  if (['overview', 'words', 'tokens', 'goals', 'books', 'logs'].includes(segment)) return segment
  return 'overview'
})

const todayKey = () => new Date().toISOString().slice(0, 10)

const handleFilterChange = () => {
  retryLoadAllData()
}

const retryLoadAllData = () => {
  loadAllData().catch(showStatisticsError)
}

const handleAddGoal = () => {
  if (goalActionBusy.value) return
  editingGoalId.value = ''
  resetGoalForm()
  goalForm.bookId = selectedBook.value || ''
  goalDialogVisible.value = true
}

const handleEditGoal = (goal) => {
  if (goalActionBusy.value) return
  editingGoalId.value = goal.id
  Object.assign(goalForm, {
    title: goal.title,
    type: goal.type || 'range',
    bookId: goal.bookId || '',
    targetValue: goal.targetValue || 1,
    startDate: goal.startDate || todayKey(),
    endDate: goal.endDate || '',
    note: goal.note || ''
  })
  goalDialogVisible.value = true
}

const handleDeleteGoal = async (goal) => {
  if (goalActionBusy.value) return
  deletingGoalId.value = goal.id
  try {
    await ElMessageBox.confirm(`确定删除「${goal.title}」吗？`, t('statistics.deleteGoal'), {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await statisticsService.deleteGoal(goal.id)
    ElMessage.success('目标已删除')
    await loadGoals()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '删除失败')
    }
  } finally {
    if (deletingGoalId.value === goal.id) deletingGoalId.value = ''
  }
}

const handleSubmitGoal = async () => {
  if (goalActionBusy.value) return
  if (!goalForm.title.trim()) {
    ElMessage.warning('请输入目标名称')
    return
  }
  if (!goalForm.targetValue || goalForm.targetValue <= 0) {
    ElMessage.warning('目标字数必须大于 0')
    return
  }

  goalSaving.value = true
  try {
    const payload = { ...goalForm, title: goalForm.title.trim() }
    if (editingGoalId.value) {
      await statisticsService.updateGoal(editingGoalId.value, payload)
    } else {
      await statisticsService.createGoal(payload)
    }
    ElMessage.success('目标已保存')
    goalDialogVisible.value = false
    await loadGoals()
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    goalSaving.value = false
  }
}

const resetGoalForm = () => {
  Object.assign(goalForm, {
    title: '',
    type: 'range',
    bookId: '',
    targetValue: 50000,
    startDate: todayKey(),
    endDate: '',
    note: ''
  })
  if (!goalDialogVisible.value) editingGoalId.value = ''
}

async function loadAllData() {
  if (isLoadingStatistics.value) return
  isLoadingStatistics.value = true
  statisticsReadError.value = ''

  try {
    const result = await statisticsService.getOverview('all', selectedBook.value)
    Object.assign(overview, {
      totalWords: result.totalWords || 0,
      todayWords: result.todayWords || 0,
      monthWords: result.monthWords || 0,
      streakDays: result.streakDays || 0,
      maxStreakDays: result.maxStreakDays || 0,
      totalAiTokens: result.totalAiTokens || 0,
      totalAiCost: result.totalAiCost || 0,
      bookStats: result.bookStats
    })

    await Promise.all([loadTrend(), loadHeatmap(), loadUsageData(), loadGoals(), loadReports()])
  } catch (error) {
    statisticsReadError.value = error?.message || t('statistics.loadFailed')
    throw error
  } finally {
    isLoadingStatistics.value = false
  }
}

function showStatisticsError(error) {
  ElMessage.error(error?.message || t('statistics.loadFailed'))
}

async function loadTrend() {
  isTrendLoading.value = true
  try {
    const data = await statisticsService.getTrendData(trendDays.value, selectedBook.value)
    if (!trendChartRef.value) return

    if (!trendChart) {
      trendChart = echarts.init(trendChartRef.value)
    }

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const item = params[0]
          return `${item.name}<br/>${t('statistics.words')}: ${item.value}`
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: '#ccc' } }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#ccc' } },
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series: [
        {
          data: data.map((d) => d.words ?? d.delta ?? 0),
          type: 'line',
          smooth: true,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(111, 122, 104, 0.28)' },
              { offset: 1, color: 'rgba(111, 122, 104, 0)' }
            ])
          },
          lineStyle: { color: '#6f7a68', width: 2 },
          itemStyle: { color: '#6f7a68' }
        }
      ]
    }
    trendChart.setOption(option)
  } finally {
    isTrendLoading.value = false
  }
}

async function handleTrendDaysChange() {
  try {
    statisticsReadError.value = ''
    await loadTrend()
  } catch (error) {
    statisticsReadError.value = error?.message || t('statistics.loadFailed')
    showStatisticsError(error)
  }
}

async function loadHeatmap() {
  const data = await statisticsService.getHeatmapData(365, selectedBook.value)
  habit.heatmap = data
  habit.activeDays = data.filter((item) => item.count > 0).length
  if (!heatmapChartRef.value) return

  if (!heatmapChart) {
    heatmapChart = echarts.init(heatmapChartRef.value)
  }

  const today = new Date()
  const oneYearAgo = new Date(today)
  oneYearAgo.setFullYear(today.getFullYear() - 1)

  const option = {
    tooltip: {
      formatter: (params) => {
        return `${params.value[0]}: ${params.value[1]} ${t('statistics.words')}`
      }
    },
    visualMap: {
      min: 0,
      max: 5000,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 0,
      pieces: [
        { min: 0, max: 0, color: '#ece8df' },
        { min: 1, max: 500, color: '#d7d4c7' },
        { min: 501, max: 2000, color: '#b8b79e' },
        { min: 2001, max: 5000, color: '#8e977f' },
        { min: 5001, color: '#66705f' }
      ]
    },
    calendar: {
      top: 60,
      left: 30,
      right: 30,
      cellSize: ['auto', 13],
      range: [oneYearAgo, today],
      itemStyle: { borderWidth: 0.5 },
      yearLabel: { show: false },
      dayLabel: { firstDay: 1, nameMap: 'cn' },
      monthLabel: { nameMap: 'cn' }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: data.map((d) => [d.date, d.count])
    }
  }
  heatmapChart.setOption(option)
}

async function loadUsageData() {
  if (isUsageLoading.value) return
  isUsageLoading.value = true
  try {
    const params = { bookId: selectedBook.value }
    const [tokens, sessions] = await Promise.all([
      statisticsService.getTokenStats(params),
      statisticsService.getSessionStats(params)
    ])
    Object.assign(tokenStats, {
      totalTokens: tokens.totalTokens || 0,
      promptTokens: tokens.promptTokens || 0,
      completionTokens: tokens.completionTokens || 0,
      totalCost: tokens.totalCost || 0,
      totalCalls: tokens.totalCalls || 0,
      byFeature: tokens.byFeature
    })
    Object.assign(sessionStats, {
      sessionCount: sessions.sessionCount || 0,
      avgWords: sessions.avgWords || 0,
      avgMinutes: sessions.avgMinutes || 0,
      longestSessionMinutes: sessions.longestSessionMinutes || 0,
      sessions: sessions.sessions
    })
  } finally {
    isUsageLoading.value = false
  }
}

async function handleRefreshUsage() {
  try {
    statisticsReadError.value = ''
    await loadUsageData()
  } catch (error) {
    statisticsReadError.value = error?.message || t('statistics.loadFailed')
    showStatisticsError(error)
  }
}

async function loadReports() {
  const params = { bookId: selectedBook.value }
  const [week, month] = await Promise.all([
    statisticsService.getWeeklyReport(params),
    statisticsService.getMonthlyReport(params)
  ])
  weeklyReport.value = week
  monthlyReport.value = month
}

async function loadGoals() {
  goals.value = await statisticsService.getGoals()
}

async function loadBookList() {
  try {
    bookList.value = await readBooksDir()
  } catch (error) {
    console.error('Failed to load books', error)
  }
}

const handleResize = () => {
  trendChart?.resize()
  heatmapChart?.resize()
}

const formatNumber = (value) => {
  return Number(value || 0).toLocaleString()
}

const formatCost = (value) => {
  return Number(value || 0).toFixed(4)
}

const featureLabel = (value) => {
  const map = {
    ai_chat: '创作对话',
    ai_continue: '续写',
    ai_polish: '润色',
    ai_idea: '选题',
    ai_image: '图像',
    name_generator: '随机起名'
  }
  return map[value] || value || 'AI'
}

const goalTypeLabel = (value) => {
  const map = {
    range: '周期新增字数',
    daily: '今日新增字数',
    total: '总字数'
  }
  return map[value] || '写作目标'
}

const goalStatusLabel = (value) => {
  const map = {
    active: '进行中',
    completed: '已完成',
    overdue: '已逾期',
    paused: '已暂停'
  }
  return map[value] || '进行中'
}

const goalStatusType = (value) => {
  if (value === 'completed') return 'success'
  if (value === 'overdue') return 'danger'
  if (value === 'paused') return 'info'
  return 'primary'
}

onMounted(async () => {
  resetGoalForm()
  await loadBookList()
  try {
    await loadAllData()
  } catch (error) {
    showStatisticsError(error)
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  heatmapChart?.dispose()
})
</script>

<style lang="scss" scoped>
.statistics-view {
  display: flex;
  flex-direction: column;
  color: var(--text-base);

  .header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 18px;

    .actions {
      min-width: 220px;
    }
  }

  .scroll-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .statistics-read-error {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border: 1px solid rgba(194, 91, 91, 0.3);
    border-radius: 8px;
    padding: 16px;
    background: rgba(194, 91, 91, 0.08);
    color: var(--text-base);

    strong {
      display: block;
      margin-bottom: 6px;
      color: #9a604a;
    }

    p {
      margin: 0;
      color: var(--text-gray);
      line-height: 1.6;
    }
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }

  .charts-section {
    display: flex;
    flex-direction: column;
    gap: 20px;

    .chart-card {
      background: var(--bg-soft);
      border-radius: 8px;
      padding: 20px;
      box-shadow: var(--neu-shadow-raised);

      .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        h3 {
          margin: 0;
          font-size: 16px;
        }
      }

      .chart-body {
        height: 300px;
      }

      &.heatmap-card {
        .heatmap-body {
          height: 220px;
        }
      }
    }
  }

  .info-card {
    background: var(--bg-soft);
    border-radius: 8px;
    padding: 20px;
    box-shadow: var(--neu-shadow-raised);

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 15px;
    }

    h3 {
      margin: 0;
      font-size: 16px;
    }
  }

  .overview-lower-section {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.35fr);
    gap: 20px;

    .lower-column {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
  }

  .bottom-section.single {
    display: block;
  }

  .report-section {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
  }

  .ai-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    .label {
      color: var(--text-gray);
    }
    .value {
      font-size: 18px;
      font-weight: bold;
      color: var(--primary-color);
    }
  }

  .token-split,
  .report-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--text-gray);
    font-size: 13px;
  }

  .usage-list {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .usage-row,
  .book-stat-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
    font-size: 13px;
    color: var(--text-gray);
    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    b {
      color: var(--text-base);
    }
  }

  .empty-tip {
    text-align: center;
    padding: 40px;
    color: var(--text-gray);
    font-size: 14px;
  }

  .goal-empty {
    color: var(--text-gray);
    font-size: 13px;
    line-height: 1.6;
    padding: 2px 0 0;
  }

  .goal-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .goal-item {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 14px;
    background: var(--bg-primary);
  }

  .goal-main,
  .goal-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .goal-main {
    margin-bottom: 12px;
    h4 {
      margin: 0 0 5px 0;
      font-size: 15px;
    }
    p {
      margin: 0;
      color: var(--text-gray);
      font-size: 13px;
    }
  }

  .goal-footer {
    margin-top: 10px;
    color: var(--text-gray);
    font-size: 13px;
    align-items: center;
  }

  .goal-actions {
    display: flex;
    gap: 4px;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    div {
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-primary);
    }
    strong {
      display: block;
      font-size: 20px;
      color: var(--primary-color);
      margin-bottom: 4px;
    }
    span {
      color: var(--text-gray);
      font-size: 12px;
    }
  }

  .report-card {
    p {
      margin: 0 0 14px 0;
      line-height: 1.7;
      color: var(--text-base);
    }
  }

  .book-stat-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .muted {
    color: var(--text-gray);
    font-size: 13px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
}

@media (max-width: 900px) {
  .statistics-view {
    .overview-lower-section,
    .report-section {
      grid-template-columns: 1fr;
    }

    .header {
      flex-wrap: wrap;
      .actions {
        width: 100%;
      }
    }
  }
}
</style>

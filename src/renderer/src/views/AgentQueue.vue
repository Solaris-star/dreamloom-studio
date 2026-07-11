<template>
  <section class="agent-queue-page">
    <header class="queue-header">
      <div>
        <p class="queue-eyebrow">BullMQ / Redis</p>
        <h1>Agent 任务队列</h1>
      </div>
      <div class="queue-actions">
        <el-button :icon="RefreshCw" :loading="loading" @click="refreshQueue">刷新</el-button>
      </div>
    </header>

    <p v-if="errorText" class="queue-error" role="alert">{{ errorText }}</p>

    <section class="queue-summary" aria-live="polite">
      <article class="summary-cell">
        <span>队列</span>
        <strong>{{ queueNameText }}</strong>
      </article>
      <article class="summary-cell">
        <span>等待</span>
        <strong>{{ countText('waiting') }}</strong>
      </article>
      <article class="summary-cell">
        <span>运行</span>
        <strong>{{ countText('active') }}</strong>
      </article>
      <article class="summary-cell">
        <span>失败</span>
        <strong>{{ countText('failed') }}</strong>
      </article>
      <article class="summary-cell">
        <span>Worker</span>
        <strong>{{ workerText }}</strong>
      </article>
    </section>

    <main class="queue-grid">
      <section class="queue-panel">
        <div class="panel-head">
          <div>
            <h2>最近任务</h2>
            <p>{{ jobsSummaryText }}</p>
          </div>
          <el-select
            v-model="selectedType"
            class="type-select"
            :disabled="loading"
            @change="refreshQueue"
          >
            <el-option label="全部状态" value="all" />
            <el-option label="等待中" value="waiting" />
            <el-option label="运行中" value="active" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
            <el-option label="延时" value="delayed" />
          </el-select>
        </div>

        <el-empty v-if="!loading && !jobs.length && !errorText" description="暂无队列任务" />
        <div v-else class="job-list">
          <button
            v-for="job in jobs"
            :key="job.id"
            class="job-row"
            :class="{ active: selectedJobId === job.id }"
            type="button"
            @click="loadJob(job.id)"
          >
            <span class="job-status" :class="`state-${job.state || 'unknown'}`">
              {{ stateText(job.state) }}
            </span>
            <span class="job-title">{{ jobTitle(job) }}</span>
            <span class="job-meta">{{ formatTime(job.processedOn || job.timestamp) }}</span>
          </button>
        </div>
      </section>

      <aside class="queue-panel detail-panel">
        <div class="panel-head">
          <div>
            <h2>任务详情</h2>
            <p>{{ selectedJobId || '请选择一个任务' }}</p>
          </div>
          <el-button
            v-if="canCancelSelectedJob"
            type="danger"
            plain
            :icon="Square"
            :loading="cancelling"
            @click="cancelSelectedJob"
          >
            停止
          </el-button>
        </div>

        <p v-if="detailError" class="queue-error compact" role="alert">{{ detailError }}</p>
        <el-skeleton v-if="detailLoading" :rows="6" animated />
        <el-empty v-else-if="!selectedJob" description="暂无任务详情" />
        <div v-else class="detail-body">
          <dl class="detail-list">
            <div>
              <dt>状态</dt>
              <dd>{{ stateText(selectedJob.state) }}</dd>
            </div>
            <div>
              <dt>名称</dt>
              <dd>{{ selectedJob.name || '未记录' }}</dd>
            </div>
            <div>
              <dt>尝试次数</dt>
              <dd>{{ attemptsText(selectedJob) }}</dd>
            </div>
            <div>
              <dt>等待设置</dt>
              <dd>{{ backoffText(selectedJob) }}</dd>
            </div>
            <div>
              <dt>进度</dt>
              <dd>{{ valueText(selectedJob.progress) }}</dd>
            </div>
            <div>
              <dt>开始时间</dt>
              <dd>{{ formatTime(selectedJob.processedOn) }}</dd>
            </div>
            <div>
              <dt>结束时间</dt>
              <dd>{{ formatTime(selectedJob.finishedOn) }}</dd>
            </div>
          </dl>

          <section v-if="selectedJob.failedReason" class="detail-note">
            <h3>失败原因</h3>
            <p>{{ selectedJob.failedReason }}</p>
          </section>

          <section class="detail-note">
            <h3>任务参数</h3>
            <pre>{{ prettyJson(selectedJob.data) }}</pre>
          </section>

          <section v-if="selectedJob.returnvalue" class="detail-note">
            <h3>返回结果</h3>
            <pre>{{ prettyJson(selectedJob.returnvalue) }}</pre>
          </section>
        </div>
      </aside>
    </main>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshCw, Square } from 'lucide-vue-next'
import {
  cancelAgentQueueJob,
  getAgentQueueJob,
  getAgentQueueStatus,
  listAgentQueueJobs
} from '@renderer/service/editor'

const loading = ref(false)
const detailLoading = ref(false)
const cancelling = ref(false)
const queueStatus = ref(null)
const jobs = ref([])
const selectedJob = ref(null)
const selectedJobId = ref('')
const errorText = ref('')
const detailError = ref('')
const selectedType = ref('all')

const queueNameText = computed(() => queueStatus.value?.queueName || '未连接')
const workerText = computed(() => {
  if (!queueStatus.value) return '未读取'
  const count = Number(queueStatus.value.workerCount || 0)
  return count > 0 ? `${count} 个` : '无'
})
const canCancelSelectedJob = computed(
  () => selectedJob.value && !['completed', 'failed'].includes(selectedJob.value.state)
)
const jobsSummaryText = computed(() => {
  if (loading.value) return '正在读取 Redis 任务'
  if (errorText.value) return '队列读取失败'
  return jobs.value.length ? `读取到 ${jobs.value.length} 个 Redis 任务` : '没有读取到 Redis 任务'
})

onMounted(refreshQueue)

async function refreshQueue() {
  loading.value = true
  errorText.value = ''
  try {
    const [statusResponse, jobsResponse] = await Promise.all([
      getAgentQueueStatus(),
      listAgentQueueJobs({
        limit: 50,
        types: selectedType.value === 'all' ? undefined : selectedType.value
      })
    ])
    queueStatus.value = statusResponse
    jobs.value = jobsResponse.jobs
    if (selectedJobId.value) {
      const stillVisible = jobs.value.some((job) => job.id === selectedJobId.value)
      if (stillVisible) {
        await loadJob(selectedJobId.value, { quiet: true })
      } else {
        selectedJobId.value = ''
        selectedJob.value = null
        detailError.value = '当前筛选结果中没有这个任务，请重新选择。'
      }
    }
  } catch (error) {
    queueStatus.value = null
    jobs.value = []
    selectedJob.value = null
    errorText.value = error?.message || '读取队列失败'
  } finally {
    loading.value = false
  }
}

async function loadJob(jobId, options = {}) {
  const id = String(jobId || '').trim()
  if (!id) return
  selectedJobId.value = id
  selectedJob.value = null
  detailError.value = ''
  detailLoading.value = true
  try {
    const response = await getAgentQueueJob(id)
    if (!response?.job) {
      detailError.value = '未在 Redis 队列中找到这个任务。'
      return
    }
    selectedJob.value = response.job
  } catch (error) {
    detailError.value = error?.message || '读取任务详情失败'
    if (!options.quiet) ElMessage.error(detailError.value)
  } finally {
    detailLoading.value = false
  }
}

async function cancelSelectedJob() {
  if (!selectedJobId.value || !selectedJob.value) return
  try {
    await ElMessageBox.confirm(
      '停止会移除等待中的任务，运行中的任务会向 worker 发出停止请求。',
      '停止队列任务',
      {
        type: 'warning',
        confirmButtonText: '停止',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  cancelling.value = true
  try {
    const result = await cancelAgentQueueJob({
      jobId: selectedJobId.value,
      bookName: selectedJob.value.data?.bookName || ''
    })
    ElMessage.success(result.cancellationRequested ? '已请求停止任务' : '任务已停止')
    await refreshQueue()
    if (selectedJobId.value) await loadJob(selectedJobId.value, { quiet: true })
  } catch (error) {
    ElMessage.error(error?.message || '停止任务失败')
  } finally {
    cancelling.value = false
  }
}

function countText(key) {
  const value = Number(queueStatus.value?.counts?.[key] || 0)
  return Number.isFinite(value) ? String(value) : '0'
}

function stateText(state = '') {
  const map = {
    waiting: '等待中',
    active: '运行中',
    delayed: '延时',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
    waiting_children: '等待子任务'
  }
  return map[state] || state || '未记录'
}

function jobTitle(job = {}) {
  const data = job.data || {}
  return data.chapterName || data.chapter || data.bookName || job.name || job.id || '队列任务'
}

function attemptsText(job = {}) {
  const made = Number(job.attemptsMade || 0)
  const total = Number(job.attempts || 1)
  return `${Number.isFinite(made) ? made : 0} / ${Number.isFinite(total) ? total : 1}`
}

function backoffText(job = {}) {
  const backoff = job.backoff || null
  if (!backoff || typeof backoff !== 'object') return '未设置'
  const delay = Number(backoff.delay || 0)
  const type = backoff.type === 'exponential' ? '指数等待' : backoff.type || '等待'
  if (!Number.isFinite(delay) || delay <= 0) return type
  return `${type} ${delay}ms`
}

function valueText(value) {
  if (value == null || value === '') return '未记录'
  if (typeof value === 'string') return value
  return prettyJson(value)
}

function prettyJson(value) {
  if (value == null || value === '') return '未记录'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatTime(value) {
  if (!value) return '未记录'
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return '未记录'
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style lang="scss" scoped>
.agent-queue-page {
  box-sizing: border-box;
  width: min(100%, 1120px);
  margin: 0 auto;
  color: var(--wabi-ink);
}

.agent-queue-page *,
.agent-queue-page *::before,
.agent-queue-page *::after {
  box-sizing: border-box;
}

.queue-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--wabi-line);

  h1 {
    margin: 2px 0 0;
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: clamp(30px, 3vw, 42px);
    letter-spacing: 0;
  }
}

.queue-eyebrow {
  margin: 0;
  color: var(--wabi-earth);
  font-size: 14px;
  font-weight: 700;
}

.queue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.queue-error {
  margin: 0 0 16px;
  padding: 11px 13px;
  border: 1px solid rgba(154, 96, 74, 0.28);
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.08);
  color: #7d4d3b;
  line-height: 1.6;

  &.compact {
    margin-bottom: 12px;
  }
}

.queue-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-cell,
.queue-panel {
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: var(--theme-surface-background-strong);
  box-shadow: var(--wabi-shadow-soft);
}

.summary-cell {
  min-width: 0;
  padding: 14px;

  span,
  strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    margin-bottom: 7px;
    color: var(--wabi-muted);
    font-size: 13px;
  }

  strong {
    color: var(--wabi-ink);
    font-size: 20px;
  }
}

.queue-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
  gap: 16px;
  align-items: start;
}

.queue-panel {
  min-width: 0;
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 4px;
    color: var(--wabi-ink);
    font-size: 20px;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
}

.type-select {
  width: 136px;
  flex: 0 0 auto;
}

.job-list {
  display: grid;
  gap: 8px;
}

.job-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr) 148px;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 9px 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.64);
  color: var(--wabi-ink);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;

  &:hover,
  &.active {
    border-color: rgba(111, 122, 104, 0.42);
    background: rgba(111, 122, 104, 0.1);
  }
}

.job-status {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(104, 113, 122, 0.11);
  color: var(--wabi-info);
  font-size: 13px;
  font-weight: 700;

  &.state-active,
  &.state-waiting {
    background: rgba(111, 122, 104, 0.13);
    color: var(--wabi-moss-dark);
  }

  &.state-completed {
    background: rgba(111, 122, 104, 0.16);
    color: var(--wabi-success);
  }

  &.state-failed {
    background: rgba(154, 96, 74, 0.13);
    color: var(--wabi-danger);
  }
}

.job-title,
.job-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-title {
  font-weight: 700;
}

.job-meta {
  color: var(--wabi-muted);
  font-size: 13px;
  text-align: right;
}

.detail-panel {
  position: sticky;
  top: 18px;
}

.detail-body {
  display: grid;
  gap: 14px;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;

  div {
    min-width: 0;
    padding: 11px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.62);
  }

  dt {
    margin-bottom: 5px;
    color: var(--wabi-muted);
    font-size: 12px;
  }

  dd {
    margin: 0;
    color: var(--wabi-ink);
    overflow-wrap: anywhere;
  }
}

.detail-note {
  display: grid;
  gap: 8px;

  h3 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 15px;
  }

  p,
  pre {
    margin: 0;
    padding: 12px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-ink-soft);
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

@media (max-width: 980px) {
  .queue-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .queue-grid {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}

@media (max-width: 640px) {
  .agent-queue-page {
    width: 100%;
  }

  .queue-header,
  .panel-head {
    display: grid;
  }

  .queue-summary {
    grid-template-columns: 1fr;
  }

  .queue-actions {
    justify-content: flex-start;
  }

  .type-select {
    width: 100%;
  }

  .job-row {
    grid-template-columns: 78px minmax(0, 1fr);
  }

  .job-meta {
    grid-column: 1 / -1;
    text-align: left;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>

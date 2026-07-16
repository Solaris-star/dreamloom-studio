<template>
  <div class="market-page">
    <header class="market-hero">
      <div class="hero-copy">
        <h1>市场灵感 / Trend Radar</h1>
        <p>
          从公开热词、榜单趋势和作者活动中提炼可写题材。空数据时会展示明确标注的示例内容，不会伪造实时热度、销量或评价。
        </p>
      </div>

      <div class="source-bar">
        <div
          v-for="item in statusCards"
          :key="item.key"
          class="source-chip"
        >
          <span class="source-name">{{ item.label }}</span>
          <i :class="item.state" />
          <b>{{ item.text }}</b>
        </div>
        <div class="source-chip time">
          <span class="source-name">更新时间</span>
          <b>{{ formatDateTime(lastUpdatedAt) || '暂无' }}</b>
        </div>
        <label class="target-book-picker">
          <span>目标作品</span>
          <select
            v-model="selectedBookId"
            :disabled="books.length === 0"
            @change="rememberSelectedBook"
          >
            <option value="">{{ books.length ? '请选择作品' : '暂无作品' }}</option>
            <option
              v-for="book in books"
              :key="bookIdentity(book)"
              :value="bookIdentity(book)"
            >
              {{ book.name || book.folderName || book.id }}
            </option>
          </select>
        </label>
        <button
          v-motion-feedback
          class="dark-button"
          type="button"
          :disabled="refreshing"
          @click="handleRefresh"
        >
          <RefreshCw
            :size="16"
            :class="{ spin: refreshing }"
          />
          {{ refreshing ? '刷新中' : '刷新灵感' }}
        </button>
        <button
          v-motion-feedback
          class="ghost-button"
          type="button"
          :disabled="Boolean(actionLoading)"
          @click="openCreateInspiration"
        >
          创建灵感
        </button>
        <button
          v-motion-feedback
          class="ghost-button"
          type="button"
          @click="openImportInspiration"
        >
          导入 / 添加
        </button>
      </div>
    </header>

    <section
      v-if="pageError"
      class="error-banner"
    >
      <div>
        <strong>{{ isOffline ? '网络不可用' : '加载失败' }}</strong>
        <p>{{ pageError }}</p>
      </div>
      <div class="error-actions">
        <button
          type="button"
          @click="handleRefresh"
        >
          重试刷新
        </button>
        <button
          type="button"
          @click="openCreateInspiration"
        >
          创建灵感
        </button>
      </div>
    </section>

    <section
      v-if="emptyStateBanner"
      class="empty-banner"
      :class="{ offline: emptyStateBanner.offline }"
    >
      <div>
        <strong>{{ emptyStateBanner.title }}</strong>
        <p>{{ emptyStateBanner.description }}</p>
        <small v-if="dataMode === 'example'">当前列表含【示例内容】，不是实时市场数据。</small>
      </div>
      <div class="error-actions">
        <button
          type="button"
          @click="handleRefresh"
        >
          刷新
        </button>
        <button
          type="button"
          @click="openCreateInspiration"
        >
          创建灵感
        </button>
        <button
          type="button"
          @click="openImportInspiration"
        >
          导入 / 添加
        </button>
      </div>
    </section>

    <section
      v-if="lastActionResult"
      class="result-banner"
      aria-live="polite"
    >
      <div>
        <strong>{{ lastActionResult.title }}</strong>
        <p>{{ lastActionResult.description }}</p>
      </div>
      <button
        type="button"
        @click="openActionResult"
      >
        {{ lastActionResult.actionText }}
      </button>
    </section>

    <section
      class="channel-toggle"
      aria-label="频道筛选"
    >
      <button
        v-for="item in channelOptions"
        :key="item.value"
        type="button"
        :class="{ active: channel === item.value }"
        @click="setChannel(item.value)"
      >
        {{ item.label }}
      </button>
    </section>

    <nav
      class="market-tabs"
      aria-label="市场灵感分区"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="{ active: activeTab === tab.key }"
        @click="goTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <MarketLoadingSkeleton v-if="loading && !hasAnyData" />

    <section
      v-else-if="activeTab === 'overview'"
      class="overview-grid"
    >
      <aside
        v-motion-list="{
          selector: '.direction-card',
          key: `directions:${channel}:${overview.writableDirections.length}`
        }"
        class="paper-panel writable-list"
      >
        <div class="panel-title">
          <div>
            <h2>今日可写方向</h2>
            <p>按机会分排序，已避开难以改成小说的裸资讯。</p>
          </div>
          <small>{{ overview.writableDirections.length }} 条</small>
        </div>

        <MarketEmptyState
          v-if="overview.writableDirections.length === 0"
          title="暂无可写方向。"
          description="当前没有真实采集结果，也没有可展示的示例内容。请刷新、创建灵感，或导入自己的题材。"
          :reason="emptyState?.reason || 'empty'"
          :offline="isOffline"
          show-actions
          @refresh="handleRefresh"
          @create="openCreateInspiration"
          @import="openImportInspiration"
        />

        <button
          v-for="(item, index) in overview.writableDirections"
          v-else
          :key="item.id"
          type="button"
          class="direction-card"
          :class="{ active: selectedInsight?.id === item.id }"
          @click="selectedInsight = item"
        >
          <span class="rank-badge">{{ index + 1 }}</span>
          <div class="direction-main">
            <div class="direction-head">
              <h3>{{ item.title }}</h3>
              <strong :class="{ 'is-example': item.isExample || item.heatScore == null }">
                {{ scoreLabel(item.heatScore, item) }}
              </strong>
            </div>
            <div class="tag-line">
              <span class="content-kind-chip">{{ contentKindLabel(item) }}</span>
              <span>{{ channelLabel(item.channel) }}</span>
              <span
                v-for="tag in (item.tags || []).slice(0, 4)"
                :key="tag"
              >{{ tag }}</span>
            </div>
            <p><b>适合写法：</b>{{ item.suitableWriting }}</p>
            <p><b>开篇钩子：</b>{{ item.hook }}</p>
            <div class="mini-metrics">
              <span v-if="!item.isExample && item.growthScore != null">增长 {{ item.growthScore }}</span>
              <span v-if="!item.isExample && item.opportunityScore != null">机会 {{ item.opportunityScore }}</span>
              <span v-if="item.isExample">非实时示例</span>
              <span :class="item.sourceStatus">来源 {{ sourceStatusText(item.sourceStatus) }}</span>
            </div>
          </div>
          <Bookmark :size="18" />
        </button>
      </aside>

      <main
        v-motion-list="{
          selector: ':scope > section',
          key: `overview-center:${channel}:${overview.inspirationExpress.length}`
        }"
        class="overview-center"
      >
        <section class="opportunity-card" :class="{ example: dataMode === 'example' }">
          <div>
            <span>{{ dataMode === 'example' ? '当前数据模式' : '今日创作机会指数' }}</span>
            <strong>{{ overview.opportunityIndex.grade || (dataMode === 'example' ? '示例' : '—') }}</strong>
            <p>{{ overview.opportunityIndex.summary }}</p>
          </div>
          <div
            v-if="dataMode !== 'example' && hasLiveScores"
            class="sparkline"
            aria-hidden="true"
          >
            <i
              v-for="(height, n) in sparklineHeights"
              :key="n"
              :style="{ height: `${height}px` }"
            />
          </div>
          <div v-else class="example-note" aria-hidden="false">
            <span>示例模式不展示伪热度曲线</span>
          </div>
        </section>

        <section class="paper-panel agent-panel">
          <div class="panel-title">
            <div>
              <h2>Agent 创作方向</h2>
              <p>{{ dashboard.agentBrief?.summary || '等待真实热词和平台榜单采集结果。' }}</p>
            </div>
          </div>
          <div class="agent-directions">
            <button
              v-for="direction in dashboard.agentBrief?.directions || []"
              :key="direction.title"
              type="button"
              :disabled="Boolean(actionLoading)"
              @click="handleSaveInsight(agentDirectionToInsight(direction))"
            >
              <strong>{{ direction.title }}</strong>
              <span>{{ (direction.platforms || []).join(' / ') }}</span>
              <p>{{ direction.hook }}</p>
            </button>
          </div>
        </section>

        <section class="paper-panel genre-panel">
          <div class="panel-title">
            <h2>热门题材分布</h2>
            <button
              type="button"
              @click="goTab('keywords')"
            >
              更多分析
            </button>
          </div>
          <div class="genre-dials">
            <button
              v-for="item in overview.genreDistribution"
              :key="item.name"
              type="button"
              class="genre-dial"
              @click="selectKeyword(item.name)"
            >
              <span :style="{ '--percent': `${item.percent == null ? 0 : item.percent}%` }">
                {{ item.percent == null ? '示例' : `${item.percent}%` }}
              </span>
              <b>{{ item.name }}</b>
            </button>
          </div>
        </section>

        <section class="paper-panel express-panel">
          <div class="panel-title">
            <h2>灵感速递</h2>
            <small>最新可写方向</small>
          </div>
          <div class="express-list">
            <button
              v-for="item in overview.inspirationExpress"
              :key="item.id"
              type="button"
              @click="selectInsightById(item.id)"
            >
              <span>{{ channelLabel(item.channel) }} · {{ item.genre }}</span>
              <b>{{ item.title }}</b>
              <small class="heat-mark" :class="{ 'is-example': item.isExample || item.score == null }">
                <Flame v-if="item.score != null && !item.isExample" :size="13" />
                {{ item.isExample || item.score == null ? contentKindLabel(item) : item.score }}
              </small>
            </button>
          </div>
        </section>
      </main>

      <InsightDetailPanel
        :insight="selectedInsight"
        :loading-key="actionLoading"
        @save="handleSaveInsight"
        @outline="handleGenerateOutline"
        @apply="handleApplyToBook"
        @create-book="handleCreateBook"
      />
    </section>

    <section
      v-else-if="activeTab === 'rankings'"
      class="rank-grid"
    >
      <aside
        v-motion-list="{
          selector: '.source-row',
          key: `sources:${selectedSource}:${hotRank.sources.length}`
        }"
        class="paper-panel source-filter"
      >
        <div class="panel-title">
          <h2>平台 / 来源</h2>
          <small>{{ hotRank.sources.length }} 个</small>
        </div>
        <button
          type="button"
          class="source-row"
          :class="{ active: selectedSource === 'all' }"
          @click="setSource('all')"
        >
          <span>全部来源</span>
          <b>{{ hotRank.items.length }}</b>
        </button>
        <button
          v-for="source in hotRank.sources"
          :key="source.source"
          type="button"
          class="source-row"
          :class="{ active: selectedSource === source.source }"
          @click="setSource(source.source)"
        >
          <span>{{ source.label }}</span>
          <b>{{ source.count }}</b>
          <small :class="source.status">{{ sourceStatusText(source.status) }}</small>
        </button>

        <div class="source-summary">
          <strong>今日可转化热点</strong>
          <b>{{ hotRank.items.length }}</b>
          <span>男频 {{ countByChannel('male') }} · 女频 {{ countByChannel('female') }} · 通用
            {{ countByChannel('all') }}</span>
        </div>
      </aside>

      <main
        v-motion-list="{
          selector: '.hot-card',
          key: `rank:${selectedSource}:${hotRank.items.length}`
        }"
        class="paper-panel hot-rank-list"
      >
        <div class="panel-title">
          <div>
            <h2>平台热榜</h2>
            <p>趋势已转成可写题材，不再裸列热搜。</p>
          </div>
          <small>每 30 分钟读取缓存或刷新</small>
        </div>

        <MarketEmptyState
          v-if="hotRank.items.length === 0"
          title="暂无热榜数据。"
          description="当前来源暂未返回内容。可刷新、创建灵感，或先使用示例内容。"
          :reason="emptyState?.reason || 'empty'"
          :offline="isOffline"
          show-actions
          @refresh="handleRefresh"
          @create="openCreateInspiration"
          @import="openImportInspiration"
        />

        <button
          v-for="item in hotRank.items"
          v-else
          :key="item.id"
          type="button"
          class="hot-card"
          :class="{ active: selectedHotRank?.id === item.id }"
          @click="selectedHotRank = item"
        >
          <span class="rank-flag">{{ item.rank }}</span>
          <div class="hot-content">
            <div class="hot-line">
              <h3>{{ item.rawTitle }}</h3>
              <span>{{ item.source }}</span>
              <b class="heat-mark" :class="{ 'is-example': item.isExample || item.heatScore == null }">
                <Flame v-if="item.heatScore != null && !item.isExample" :size="14" />
                {{ scoreLabel(item.heatScore, item) }}
              </b>
            </div>
            <div class="novel-direction">
              <strong>{{ item.title }}</strong>
            </div>
            <div class="tag-line">
              <span
                v-for="type in item.writableTypes.slice(0, 5)"
                :key="type"
              >{{ type }}</span>
              <span>{{ channelLabel(item.channel) }}</span>
            </div>
            <p><b>可转化剧情：</b>{{ item.transferablePlot }}</p>
            <p><b>读者情绪：</b>{{ item.readerPleasure }}</p>
            <div class="card-actions">
              <button
                type="button"
                @click.stop="selectedHotRank = item"
              >
                转成题材
              </button>
              <button
                type="button"
                :disabled="Boolean(actionLoading)"
                @click.stop="handleGenerateOutline(item)"
              >
                生成模板草案
              </button>
              <button
                type="button"
                :disabled="Boolean(actionLoading)"
                @click.stop="handleSaveInsight(item)"
              >
                存入灵感库
              </button>
            </div>
          </div>
        </button>
      </main>

      <InsightDetailPanel
        :insight="selectedHotRank"
        title="趋势转写详情"
        :loading-key="actionLoading"
        @save="handleSaveInsight"
        @outline="handleGenerateOutline"
        @apply="handleApplyToBook"
        @create-book="handleCreateBook"
      />
    </section>

    <section
      v-else-if="activeTab === 'keywords'"
      class="keyword-grid"
    >
      <main class="paper-panel keyword-map-panel">
        <div class="panel-title">
          <div>
            <h2>热词宇宙 / 题材聚类</h2>
            <p>点击 1 到 3 个词，右侧会组合成题材。</p>
          </div>
          <label class="trend-switch">
            <input
              v-model="showKeywordTrend"
              type="checkbox"
            >
            显示趋势
          </label>
        </div>
        <div class="keyword-universe">
          <button
            v-for="(word, index) in visibleKeywordClusters"
            :key="word.id"
            type="button"
            class="keyword-orbit"
            :class="[word.type, { selected: selectedKeywords.includes(word.name) }]"
            :style="keywordStyle(word, index)"
            @click="toggleKeyword(word.name)"
          >
            {{ word.name }}
          </button>
        </div>

        <div
          v-motion-list="{
            selector: '.combo-card',
            key: `combos:${keywordCloud.popularCombinations.length}`
          }"
          class="popular-combos"
        >
          <div class="panel-title slim">
            <h2>热门组合</h2>
            <button
              type="button"
              @click="selectedKeywords = []"
            >
              换一组
            </button>
          </div>
          <button
            v-for="combo in keywordCloud.popularCombinations"
            :key="combo.id"
            type="button"
            class="combo-card"
            @click="selectCombination(combo)"
          >
            <strong>{{ combo.title }}</strong>
            <span>
              <template v-if="combo.isExample || combo.heatScore == null">示例内容 · 非实时热度</template>
              <template v-else>热度 {{ combo.heatScore }} · 增长 {{ combo.growthScore }}</template>
            </span>
            <p>{{ combo.direction }}</p>
            <i v-if="showKeywordTrend && combo.trend?.length && !combo.isExample">
              <em
                v-for="(point, index) in combo.trend"
                :key="index"
                :style="{ height: `${point}%` }"
              />
            </i>
          </button>
        </div>
      </main>

      <aside class="paper-panel combination-panel">
        <div class="panel-title">
          <h2>组合详情</h2>
          <b class="heat-mark" :class="{ 'is-example': combinationDetail.isExample || combinationDetail.heatScore == null }">
            <Flame v-if="combinationDetail.heatScore != null && !combinationDetail.isExample" :size="15" />
            {{ scoreLabel(combinationDetail.heatScore, combinationDetail) }}
          </b>
        </div>
        <h3>{{ combinationDetail.title }}</h3>
        <InfoRow
          label="相关热词"
          :items="combinationDetail.relatedKeywords"
        />
        <InfoRow
          label="可组合题材"
          :items="combinationDetail.writableDirections"
        />
        <InfoRow
          label="推荐人设"
          :items="combinationDetail.recommendedCharacters"
        />
        <InfoRow
          label="推荐冲突"
          :items="combinationDetail.recommendedConflicts"
        />
        <InfoRow
          label="可写爽点"
          :items="combinationDetail.readerPleasure"
        />
        <section class="translation-result">
          <h4>小说化转写结果</h4>
          <p><b>题材方向：</b>{{ combinationDetail.novelizedResult?.direction }}</p>
          <p><b>核心冲突：</b>{{ combinationDetail.novelizedResult?.conflict }}</p>
          <p><b>开篇示例：</b>{{ combinationDetail.openingExample }}</p>
        </section>
        <MarketActionBar
          :loading-key="actionLoading"
          @save="handleSaveCombination"
          @outline="handleGenerateCombinationOutline"
          @apply="handleApplyCombination"
          @create-book="handleCreateCombinationBook"
        />
      </aside>
    </section>

    <section
      v-else
      class="activity-grid"
    >
      <main
        v-motion-list="{
          selector: '.activity-card',
          key: `activities:${activityBoard.activities.length}`
        }"
        class="paper-panel activity-list-panel"
      >
        <div class="activity-note">
          发现 {{ activityBoard.activities.length }} 条可投稿机会与创作任务，支持一键存入写作计划。
        </div>

        <MarketEmptyState
          v-if="activityBoard.activities.length === 0"
          title="暂无作者活动。"
          description="当前没有真实活动采集结果。页面不会伪造活动或适合投稿百分比；可刷新或手动创建灵感。"
          :reason="emptyState?.reason || 'empty'"
          :offline="isOffline"
          show-actions
          @refresh="handleRefresh"
          @create="openCreateInspiration"
          @import="openImportInspiration"
        />

        <article
          v-for="activity in activityBoard.activities"
          v-else
          :key="activity.id"
          class="activity-card"
          :class="{ active: selectedActivity?.id === activity.id }"
        >
          <button
            type="button"
            class="activity-select-button"
            @click="selectedActivity = activity"
          >
            <div class="activity-main">
              <div class="activity-head">
                <h3>{{ activity.title }}</h3>
                <span :class="activity.status">{{ activityStatusLabel(activity.status) }}</span>
              </div>
              <div class="activity-columns">
                <span>适合频道：{{ activity.platform }} / {{ channelLabel(activity.channel) }}</span>
                <span>投稿截止：{{ formatDate(activity.deadline || activity.endDate) || '未知' }}</span>
                <span>推荐题材：{{ (activity.genres || activity.categories || []).join(' / ') }}</span>
                <span>字数：{{ activity.wordCountRequirement || '按官方要求' }}</span>
              </div>
              <p>{{ activity.summary }}</p>
            </div>
            <div class="fit-score" :class="{ muted: activity.fitScore == null }">
              <b>{{ activity.fitScore == null ? '—' : `${activity.fitScore}%` }}</b>
              <span>{{ activity.fitScore == null ? '待评估' : '适合投稿' }}</span>
            </div>
          </button>
          <div class="card-actions">
            <button
              type="button"
              :disabled="Boolean(actionLoading)"
              @click.stop="handleSaveActivityPlan(activity)"
            >
              存入计划
            </button>
            <button
              type="button"
              :disabled="Boolean(actionLoading)"
              @click.stop="handleActivityDirection(activity)"
            >
              生成投稿方向
            </button>
            <button
              type="button"
              @click.stop="selectedActivity = activity"
            >
              匹配我的作品
            </button>
          </div>
        </article>
      </main>

      <aside class="paper-panel activity-detail-panel">
        <div class="panel-title">
          <h2>活动匹配详情</h2>
          <span>{{
            selectedActivity ? activityStatusLabel(selectedActivity.status) : '未选择'
          }}</span>
        </div>
        <template v-if="selectedActivity">
          <h3>{{ selectedActivity.title }}</h3>
          <InfoRow
            label="投稿截止"
            :items="[formatDate(selectedActivity.deadline || selectedActivity.endDate) || '未知']"
          />
          <InfoRow
            label="适合频道"
            :items="[selectedActivity.platform, channelLabel(selectedActivity.channel)]"
          />
          <InfoRow
            label="活动规则摘要"
            :items="[selectedActivity.summary]"
          />
          <InfoRow
            label="推荐题材方向"
            :items="selectedActivity.genres || selectedActivity.categories"
          />
          <InfoRow
            label="字数建议"
            :items="[selectedActivity.wordCountRequirement || '按官方要求']"
          />
          <section class="translation-result">
            <h4>推荐切入方式</h4>
            <p>
              {{ selectedActivity.recommendedDirection || selectedActivity.requirementSummary }}
            </p>
          </section>
          <section class="matched-books">
            <h4>选择目标作品</h4>
            <p v-if="books.length === 0">
              当前还没有可匹配作品。
            </p>
            <button
              v-for="book in books.slice(0, 3)"
              :key="bookIdentity(book)"
              type="button"
              :class="{ active: selectedBookId === bookIdentity(book) }"
              @click="selectTargetBook(book)"
            >
              <b>{{ book.name }}</b>
              <span>{{
                selectedBookId === bookIdentity(book)
                  ? '已选为目标作品'
                  : selectedActivity.fitScore == null
                    ? '可按活动题材微调开篇和简介'
                    : `${selectedActivity.fitScore}% · 可按活动题材微调开篇和简介`
              }}</span>
            </button>
          </section>
          <MarketActionBar
            :loading-key="actionLoading"
            save-label="存入计划"
            outline-label="生成投稿方向"
            apply-label="带入目标作品"
            create-label="新建作品使用"
            @save="handleSaveActivityPlan(selectedActivity)"
            @outline="handleActivityDirection(selectedActivity)"
            @apply="handleActivityApply(selectedActivity)"
            @create-book="handleActivityCreateBook(selectedActivity)"
          />
        </template>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bookmark, Flame, RefreshCw } from 'lucide-vue-next'
import {
  applyMarketInsightToCurrentBook,
  createBookFromMarketInsight,
  createMarketHotspot,
  generateMarketOutline,
  getMarketActivitiesBoard,
  getMarketDashboard,
  getMarketHotRank,
  getMarketKeywordCloud,
  getMarketKeywordCombination,
  getMarketOverview,
  refreshMarketTrends,
  saveMarketInspiration
} from '@renderer/service/market'
import { createCreationStarterJob } from '@renderer/service/creationStarter'
import { readBooksDir } from '@renderer/service/books'
import { animateBounce } from '@renderer/composables/useMotion'
import InfoRow from '@renderer/components/Market/InfoRow'
import MarketActionBar from '@renderer/components/Market/MarketActionBar'
import MarketEmptyState from '@renderer/components/Market/MarketEmptyState'
import MarketLoadingSkeleton from '@renderer/components/Market/MarketLoadingSkeleton'
import InsightDetailPanel from '@renderer/components/Market/InsightDetailPanel'

const channelOptions = [
  { label: '全部', value: 'all' },
  { label: '男频', value: 'male' },
  { label: '女频', value: 'female' }
]

const CHANNEL_ORDER = {
  all: ['all', 'female', 'male'],
  male: ['male', 'all', 'female'],
  female: ['female', 'all', 'male']
}

const HOUR_MS = 60 * 60 * 1000

const SOURCE_STALE_AFTER_MS = {
  weibo: 6 * HOUR_MS,
  baidu: 6 * HOUR_MS,
  aggregated: 12 * HOUR_MS,
  ikun: 12 * HOUR_MS,
  dailyhot: 24 * HOUR_MS,
  rsshub: 24 * HOUR_MS,
  qidian: 48 * HOUR_MS,
  jjwxc: 48 * HOUR_MS,
  fanqie: 48 * HOUR_MS,
  qimao: 48 * HOUR_MS
}

const tabs = [
  { key: 'overview', label: '市场总览', path: '/market/overview' },
  { key: 'rankings', label: '平台热榜', path: '/market/rankings' },
  { key: 'keywords', label: '关键词云', path: '/market/keywords' },
  { key: 'activities', label: '作者活动', path: '/market/activities' }
]

const route = useRoute()
const router = useRouter()
const channel = ref('all')
const selectedSource = ref('all')
const selectedInsight = ref(null)
const selectedHotRank = ref(null)
const selectedKeywords = ref([])
const selectedActivity = ref(null)
const selectedBookId = ref('')
const combinationDetail = ref({})
const showKeywordTrend = ref(true)
const loading = ref(false)
const refreshing = ref(false)
const pageError = ref('')
const actionLoading = ref('')
const books = ref([])
const lastActionResult = ref(null)
const isOffline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)
const dataMode = ref('empty')
const emptyState = ref(null)
const contentKinds = ref({ example: false, live: false, user: false, stale: false })

const dashboard = reactive({
  sourceStatus: [],
  lastUpdatedAt: '',
  agentBrief: null
})

const overview = reactive({
  writableDirections: [],
  opportunityIndex: {},
  genreDistribution: [],
  inspirationExpress: [],
  selectedInsight: null,
  lastUpdatedAt: ''
})

const hotRank = reactive({
  sources: [],
  items: [],
  selectedItem: null
})

const keywordCloud = reactive({
  keywordClusters: [],
  popularCombinations: [],
  defaultCombinationDetail: null
})

const activityBoard = reactive({
  activities: [],
  selectedActivityDetail: null
})

const activeTab = computed(() => {
  const last = route.path.split('/').filter(Boolean).at(-1)
  if (last === 'rankings') return 'rankings'
  if (last === 'keywords') return 'keywords'
  if (last === 'activities') return 'activities'
  return 'overview'
})

const hasAnyData = computed(
  () =>
    overview.writableDirections.length ||
    hotRank.items.length ||
    keywordCloud.keywordClusters.length ||
    activityBoard.activities.length
)

const hasLiveScores = computed(() =>
  overview.writableDirections.some(
    (item) => !item.isExample && (item.opportunityScore != null || item.heatScore != null)
  )
)

const sparklineHeights = computed(() => {
  const scores = overview.writableDirections
    .filter((item) => !item.isExample && item.opportunityScore != null)
    .map((item) => Number(item.opportunityScore))
    .slice(0, 18)
  if (!scores.length) return []
  return scores.map((score) => Math.max(18, Math.min(72, Math.round(score * 0.7))))
})

const emptyStateBanner = computed(() => {
  if (loading.value) return null
  if (!emptyState.value?.title) return null
  if (emptyState.value.reason === 'ok') return null
  if (dataMode.value === 'live' && hasAnyData.value) return null
  return {
    ...emptyState.value,
    offline: isOffline.value || emptyState.value.reason === 'offline'
  }
})

const lastUpdatedAt = computed(() => dashboard.lastUpdatedAt || overview.lastUpdatedAt || '')

const statusCards = computed(() => {
  const status = dashboard.sourceStatus || []
  return [
    statusCard('weibo', '微博 API', status),
    statusCard('baidu', '百度 API', status),
    platformStatusCard(status)
  ]
})

const visibleKeywordClusters = computed(() => keywordCloud.keywordClusters.slice(0, 24))

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnlineStatus)
    window.addEventListener('offline', handleOnlineStatus)
  }
  await Promise.all([loadBooks(), loadMarket()])
})

function handleOnlineStatus() {
  isOffline.value = typeof navigator !== 'undefined' ? !navigator.onLine : false
}

watch(channel, () => loadMarket())

watch(
  () => route.path,
  () => {
    if (activeTab.value === 'keywords' && !combinationDetail.value?.title) {
      combinationDetail.value = keywordCloud.defaultCombinationDetail || {}
    }
  }
)

function requireMarketSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function requireMarketRefreshResult(result) {
  const ok = requireMarketSuccess(result, '真实采集失败，请检查来源状态')
  if (!Array.isArray(ok.results) || !ok.results.some((item) => item?.success) || !ok.hotspotSync) {
    throw new Error('真实采集失败：后端没有返回采集结果')
  }
  return ok
}

function requireMarketKnowledgeResult(result, fallback = '保存失败') {
  const ok = requireMarketSuccess(result, fallback)
  if (!ok.item && !ok.knowledgeItem && ok.duplicate !== true) {
    throw new Error(`${fallback}：后端没有返回素材条目`)
  }
  return ok
}

function requireMarketOutlineResult(result) {
  const ok = requireMarketSuccess(result, '生成失败')
  if (!ok.outline || !ok.item) {
    throw new Error('生成失败：后端没有返回模板草案')
  }
  return ok
}

function requireMarketJobResult(job) {
  if (!job?.id) {
    throw new Error('生成失败：起笔任务没有保存成功')
  }
  return job
}

function requireMarketBookResult(result) {
  const ok = requireMarketSuccess(result, '新建作品失败')
  if (!ok.bookName || !ok.bookId) {
    throw new Error('新建作品失败：后端没有返回作品信息')
  }
  return ok
}

function requireMarketDashboardResult(result) {
  const ok = requireMarketSuccess(result, '市场概览读取失败')
  if (
    !Array.isArray(ok.sourceStatus) ||
    !Array.isArray(ok.topOpportunities) ||
    !Array.isArray(ok.recentTrends)
  ) {
    throw new Error('市场概览读取失败：接口返回格式不正确')
  }
  return ok
}

function requireMarketOverviewResult(result) {
  const ok = requireMarketSuccess(result, '市场方向读取失败')
  if (
    !Array.isArray(ok.writableDirections) ||
    !Array.isArray(ok.genreDistribution) ||
    !Array.isArray(ok.inspirationExpress) ||
    !ok.opportunityIndex ||
    typeof ok.opportunityIndex !== 'object'
  ) {
    throw new Error('市场方向读取失败：接口返回格式不正确')
  }
  return ok
}

function requireMarketHotRankResult(result) {
  const ok = requireMarketSuccess(result, '热榜读取失败')
  if (!Array.isArray(ok.sources) || !Array.isArray(ok.items)) {
    throw new Error('热榜读取失败：接口返回格式不正确')
  }
  return ok
}

function requireMarketKeywordCloudResult(result) {
  const ok = requireMarketSuccess(result, '关键词读取失败')
  if (!Array.isArray(ok.keywordClusters) || !Array.isArray(ok.popularCombinations)) {
    throw new Error('关键词读取失败：接口返回格式不正确')
  }
  return ok
}

function requireMarketKeywordCombinationResult(result) {
  const ok = requireMarketSuccess(result, '组合生成失败')
  if (!ok.detail || typeof ok.detail !== 'object' || Array.isArray(ok.detail)) {
    throw new Error('组合生成失败：接口返回格式不正确')
  }
  return ok
}

function requireMarketActivitiesResult(result) {
  const ok = requireMarketSuccess(result, '活动读取失败')
  if (!Array.isArray(ok.activities)) {
    throw new Error('活动读取失败：接口返回格式不正确')
  }
  return ok
}

async function loadBooks() {
  try {
    books.value = await readBooksDir()
    syncSelectedBook()
  } catch (error) {
    console.error('读取书架失败:', error)
    ElMessage.error(error?.message || '读取书架失败，请检查书库目录')
  }
}

async function loadMarket() {
  const hadData = Boolean(hasAnyData.value)
  loading.value = !hadData
  pageError.value = ''
  isOffline.value = typeof navigator !== 'undefined' ? !navigator.onLine : false
  try {
    const payload = {
      channel: channel.value,
      source: selectedSource.value,
      offline: isOffline.value
    }
    const [dashboardResult, overviewResult, rankResult, keywordResult, activityResult] =
      await Promise.all([
        getMarketDashboard(payload),
        getMarketOverview(payload),
        getMarketHotRank(payload),
        getMarketKeywordCloud(payload),
        getMarketActivitiesBoard(payload)
      ])
    const dashboardPayload = requireMarketDashboardResult(dashboardResult)
    const overviewPayload = requireMarketOverviewResult(overviewResult)
    const rankPayload = requireMarketHotRankResult(rankResult)
    const keywordPayload = requireMarketKeywordCloudResult(keywordResult)
    const activityPayload = requireMarketActivitiesResult(activityResult)
    Object.assign(dashboard, {
      sourceStatus: dashboardPayload.sourceStatus || [],
      lastUpdatedAt: dashboardPayload.lastUpdatedAt || '',
      agentBrief: dashboardPayload.agentBrief || null
    })
    Object.assign(overview, normalizeOverview(overviewPayload))
    Object.assign(hotRank, normalizeHotRank(rankPayload))
    Object.assign(keywordCloud, normalizeKeywordCloud(keywordPayload))
    Object.assign(activityBoard, normalizeActivityBoard(activityPayload))
    dataMode.value =
      dashboardPayload.dataMode ||
      overviewPayload.dataMode ||
      rankPayload.dataMode ||
      (overview.writableDirections.some((item) => item.isExample) ? 'example' : 'live')
    emptyState.value =
      dashboardPayload.emptyState || overviewPayload.emptyState || rankPayload.emptyState || null
    contentKinds.value =
      dashboardPayload.contentKinds ||
      overviewPayload.contentKinds || {
        example: dataMode.value === 'example',
        live: dataMode.value === 'live',
        user: false,
        stale: false
      }
    selectedInsight.value = overview.selectedInsight || overview.writableDirections[0] || null
    selectedHotRank.value = hotRank.selectedItem || hotRank.items[0] || null
    selectedActivity.value =
      activityBoard.selectedActivityDetail || activityBoard.activities[0] || null
    combinationDetail.value = keywordCloud.defaultCombinationDetail || combinationDetail.value || {}
  } catch (error) {
    const message = error?.message || '市场灵感加载失败'
    if (isOffline.value || /network|fetch|Failed to fetch|超时|timeout|offline/i.test(message)) {
      pageError.value = isOffline.value
        ? `当前离线：${message}。可先创建灵感或使用已标注的示例内容。`
        : `网络异常：${message}`
      emptyState.value = {
        reason: 'offline',
        title: '网络不可用',
        description:
          '外部市场来源暂时无法访问。页面不会伪造热度或销量，可稍后刷新或手动创建灵感。',
        offline: true
      }
    } else {
      pageError.value = message
    }
  } finally {
    loading.value = false
  }
}

function normalizeOverview(result = {}) {
  const directions = sortByChannel(result.writableDirections, result.channel || channel.value)
  return {
    writableDirections: directions,
    opportunityIndex: result.opportunityIndex || {},
    genreDistribution: result.genreDistribution,
    inspirationExpress: sortByChannel(result.inspirationExpress, result.channel || channel.value),
    selectedInsight: directions[0] || result.selectedInsight || null,
    lastUpdatedAt: result.lastUpdatedAt || ''
  }
}

function normalizeHotRank(result = {}) {
  const items = sortByChannel(result.items, result.channel || channel.value)
  return {
    sources: result.sources,
    items,
    selectedItem: items[0] || result.selectedItem || null
  }
}

function normalizeKeywordCloud(result = {}) {
  return {
    keywordClusters: result.keywordClusters,
    popularCombinations: result.popularCombinations,
    defaultCombinationDetail: result.defaultCombinationDetail || {}
  }
}

function normalizeActivityBoard(result = {}) {
  const activities = sortByChannel(result.activities, result.channel || channel.value)
  return {
    activities,
    selectedActivityDetail: activities[0] || result.selectedActivityDetail || null
  }
}

function sortByChannel(rows, target = 'all') {
  if (!Array.isArray(rows)) {
    throw new Error('市场灵感数据格式不正确')
  }
  const order = CHANNEL_ORDER[target] || CHANNEL_ORDER.all
  return [...rows].sort((a, b) => {
    const ai = order.indexOf(a.channel)
    const bi = order.indexOf(b.channel)
    const channelDiff = (ai === -1 ? 9 : ai) - (bi === -1 ? 9 : bi)
    if (channelDiff !== 0) return channelDiff
    return (
      Number(b.opportunityScore || b.fitScore || b.score || 0) -
      Number(a.opportunityScore || a.fitScore || a.score || 0)
    )
  })
}

async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  pageError.value = ''
  isOffline.value = typeof navigator !== 'undefined' ? !navigator.onLine : false
  if (isOffline.value) {
    pageError.value = '当前离线，无法采集外部热榜。可先创建灵感或使用示例内容。'
    emptyState.value = {
      reason: 'offline',
      title: '网络不可用',
      description: '离线状态下不会伪造市场数据。请联网后刷新，或手动创建/导入灵感。',
      offline: true
    }
    ElMessage.warning(pageError.value)
    refreshing.value = false
    return
  }
  try {
    const result = await refreshMarketTrends({
      sources: ['weibo', 'baidu', 'aggregated', 'dailyhot', 'qidian', 'jjwxc', 'fanqie', 'qimao'],
      force: true
    })
    requireMarketRefreshResult(result)
    ElMessage.success('市场灵感已刷新')
    await loadMarket()
  } catch (error) {
    pageError.value = error?.message || '刷新失败'
    ElMessage.error(pageError.value)
    try {
      await loadMarket()
    } catch {
      /* keep page usable with cached / example content */
    }
  } finally {
    refreshing.value = false
  }
}

async function openCreateInspiration() {
  if (actionLoading.value) return
  const title = window.prompt('创建灵感标题（将保存到你的书库市场热点）')
  if (title == null) return
  const cleanTitle = String(title || '').trim()
  if (!cleanTitle) {
    ElMessage.warning('请输入灵感标题')
    return
  }
  const summary =
    window.prompt('可选：补充一句话简介 / 冲突 / 钩子', '') ||
    '用户自建灵感，非外部实时市场数据。'
  if (!beginAction('create-user')) return
  try {
    const result = await createMarketHotspot({
      title: cleanTitle,
      keyword: cleanTitle,
      summary: String(summary || '').trim(),
      sourceName: '用户自建',
      platforms: ['用户自建'],
      categories: [],
      tags: ['用户内容'],
      contentKind: 'user',
      isUserContent: true
    })
    const item = requireMarketSuccess(result, '创建灵感失败').item
    if (!item) throw new Error('创建灵感失败：接口没有返回条目')
    const insight = {
      id: item.id,
      title: item.title,
      source: item.sourceName || '用户自建',
      sourceType: 'user',
      channel: channel.value,
      genre: item.categories?.[0] || '自建题材',
      tags: item.tags || ['用户内容'],
      heatScore: null,
      growthScore: null,
      opportunityScore: null,
      summary: item.summary,
      readerEmotion: [],
      storyPotential: item.summary,
      conflict: item.summary,
      hook: item.summary,
      bookTitleIdeas: [item.title],
      loglineIdeas: [item.summary],
      openingIdeas: [item.summary],
      contentKind: 'user',
      contentKindLabel: '用户内容',
      isUserContent: true,
      isExample: false,
      rawIds: [item.id]
    }
    const saved = requireMarketKnowledgeResult(
      await saveMarketInspiration({
        insightId: insight.id,
        insight,
        channel: channel.value
      }),
      '保存失败'
    )
    ElMessage.success(saved.duplicate ? '灵感库已有该题材，已刷新' : '已创建并保存用户灵感')
    setActionResult({
      title: '已创建用户灵感',
      description: `“${item.title}”已写入素材箱，可按标题查找。`,
      actionText: '打开素材箱',
      route: { path: '/knowledge/materials', query: { q: item.title || cleanTitle } }
    })
    await loadMarket()
  } catch (error) {
    ElMessage.error(error?.message || '创建灵感失败')
  } finally {
    finishAction('create-user')
  }
}

function openImportInspiration() {
  router.push({ path: '/knowledge/materials', query: { source: 'market-import' } })
  ElMessage.info('可在素材箱中管理导入内容；市场页也支持创建用户灵感。')
}

function setChannel(value) {
  channel.value = value
}

function goTab(key) {
  router.push(tabs.find((item) => item.key === key)?.path || '/market/overview')
}

function setSource(source) {
  selectedSource.value = source
  loadMarket()
}

function selectInsightById(id) {
  const item = overview.writableDirections.find((row) => row.id === id)
  if (item) selectedInsight.value = item
}

function selectKeyword(name) {
  selectedKeywords.value = [name]
  goTab('keywords')
  loadKeywordCombination()
}

function toggleKeyword(name) {
  const exists = selectedKeywords.value.includes(name)
  selectedKeywords.value = exists
    ? selectedKeywords.value.filter((item) => item !== name)
    : [...selectedKeywords.value, name].slice(-3)
  loadKeywordCombination()
}

function selectCombination(combo) {
  selectedKeywords.value = combo.keywords || []
  loadKeywordCombination()
}

async function loadKeywordCombination() {
  try {
    const result = await getMarketKeywordCombination({
      channel: channel.value,
      keywords: selectedKeywords.value
    })
    combinationDetail.value = requireMarketKeywordCombinationResult(result).detail
  } catch (error) {
    ElMessage.error(error?.message || '组合生成失败')
  }
}

async function handleSaveInsight(insight = selectedInsight.value) {
  if (!insight || !beginAction('save')) return
  try {
    const result = await saveMarketInspiration({
      insightId: insight.id,
      insight,
      channel: channel.value
    })
    const saved = requireMarketKnowledgeResult(result, '保存失败')
    const title = saved.duplicate ? '灵感库已有该题材，已刷新' : '已存入灵感库'
    ElMessage.success(title)
    setActionResult({
      title,
      description: `结果在素材箱，可按“${insight.title || '市场灵感'}”查找。`,
      actionText: '打开素材箱',
      route: { path: '/knowledge/materials', query: { q: insight.title || insight.id || '' } }
    })
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    finishAction('save')
  }
}

async function handleGenerateOutline(insight = selectedInsight.value) {
  if (!insight || !beginAction('outline')) return
  try {
    const result = await generateMarketOutline({
      insightId: insight.id,
      insight,
      mode: 'save_only',
      channel: channel.value
    })
    const outlineResult = requireMarketOutlineResult(result)
    const job = requireMarketJobResult(
      await createCreationStarterJob({
        prompt: `基于市场灵感“${insight.title}”和模板草案继续细化大纲。`,
        references: [
          {
            key: `market-outline:${Date.now()}`,
            type: 'market_outline',
            typeLabel: outlineResult.outline.generatorLabel || '市场灵感模板草案',
            title: insight.title,
            summary: outlineResult.outline.logline || insight.hook,
            raw: outlineResult.outline,
            source: outlineResult.outline.generator || 'template'
          }
        ],
        advanced: {
          source: 'market_inspiration',
          marketOutlineGenerator: outlineResult.outline.generator || 'template'
        }
      })
    )
    ElMessage.success('模板草案已生成，并已保存为灵感任务')
    setActionResult({
      title: '模板草案已生成',
      description: `结果在 AI 工坊，可继续细化“${insight.title || job.title || '市场灵感'}”。`,
      actionText: '打开 AI 工坊',
      route: {
        path: '/ai/creation-starter',
        query: { jobId: job.id, source: 'market' }
      }
    })
  } catch (error) {
    ElMessage.error(error?.message || '生成失败')
  } finally {
    finishAction('outline')
  }
}

async function handleApplyToBook(insight = selectedInsight.value) {
  if (!insight || actionLoading.value) return
  const book = selectedTargetBook()
  if (!book) {
    ElMessage.warning(books.value.length ? '请先选择目标作品' : '当前没有可带入的作品')
    return
  }
  if (!beginAction('apply')) return
  try {
    const result = await applyMarketInsightToCurrentBook({
      insightId: insight.id,
      insight,
      bookId: bookIdentity(book),
      targetSection: 'chapter_ideas',
      channel: channel.value
    })
    const applied = requireMarketKnowledgeResult(result, '带入失败')
    const bookName = applied.bookName || book.name || book.folderName
    ElMessage.success(`已带入《${bookName}》的章节灵感`)
    setActionResult({
      title: '已带入目标作品',
      description: `结果在《${bookName}》的作品资产里。`,
      actionText: '打开作品资产',
      route: {
        path: `/knowledge/books/${encodeURIComponent(bookIdentity(book))}`,
        query: { tab: 'chapters' }
      }
    })
  } catch (error) {
    ElMessage.error(error?.message || '带入失败')
  } finally {
    finishAction('apply')
  }
}

async function handleCreateBook(insight = selectedInsight.value) {
  if (!insight || !beginAction('create')) return
  try {
    const result = await createBookFromMarketInsight({
      insightId: insight.id,
      insight,
      selectedTitle: insight.bookTitleIdeas?.[0] || insight.title,
      channel: insight.channel || channel.value
    })
    const created = requireMarketBookResult(result)
    ElMessage.success(`已创建作品：${created.bookName}`)
    router.push({
      path: `/editor/${encodeURIComponent(created.bookId)}`,
      query: { name: created.bookName, source: 'market' }
    })
  } catch (error) {
    ElMessage.error(error?.message || '新建作品失败')
  } finally {
    finishAction('create')
  }
}

function beginAction(key) {
  if (actionLoading.value) return false
  actionLoading.value = key
  lastActionResult.value = null
  return true
}

function finishAction(key) {
  if (actionLoading.value === key) {
    actionLoading.value = ''
  }
}

function setActionResult(result) {
  lastActionResult.value = result
}

function openActionResult() {
  if (!lastActionResult.value?.route) return
  router.push(lastActionResult.value.route)
}

async function handleSaveCombination() {
  await handleSaveInsight(combinationToInsight())
}

async function handleGenerateCombinationOutline() {
  await handleGenerateOutline(combinationToInsight())
}

async function handleApplyCombination() {
  await handleApplyToBook(combinationToInsight())
}

async function handleCreateCombinationBook() {
  await handleCreateBook(combinationToInsight())
}

function combinationToInsight() {
  const detail = combinationDetail.value || {}
  return {
    id: detail.sourceInsightId || `combo_${selectedKeywords.value.join('_') || Date.now()}`,
    title: detail.novelizedResult?.direction || detail.title || '组合灵感',
    source: '关键词云',
    sourceType: 'hot_search',
    channel: channel.value,
    genre: selectedKeywords.value[0] || '组合题材',
    tags: detail.relatedKeywords || selectedKeywords.value,
    heatScore: detail.heatScore == null ? null : detail.heatScore,
    growthScore: detail.growthScore == null ? null : detail.growthScore,
    opportunityScore:
      detail.heatScore == null && detail.growthScore == null
        ? null
        : Math.round(((detail.heatScore || 0) + (detail.growthScore || 0)) / 2),
    contentKind: detail.contentKind || (detail.isExample ? 'example' : 'live'),
    contentKindLabel: detail.contentKindLabel || (detail.isExample ? '示例内容' : '外部实时'),
    isExample: Boolean(detail.isExample),
    summary: detail.novelizedResult?.direction || '',
    readerEmotion: detail.readerPleasure || [],
    storyPotential: detail.novelizedResult?.direction || '',
    conflict: detail.novelizedResult?.conflict || '',
    hook: detail.openingExample || detail.novelizedResult?.hook || '',
    bookTitleIdeas: detail.writableDirections || [],
    loglineIdeas: detail.writableDirections || [],
    openingIdeas: [detail.openingExample].filter(Boolean),
    rawIds: []
  }
}

function agentDirectionToInsight(direction = {}) {
  return {
    id: `agent_${Date.now()}_${String(direction.title || '').replace(/\s+/g, '_')}`,
    title: direction.title || 'Agent 创作方向',
    source: (direction.platforms || ['市场灵感'])[0],
    sourceType: direction.isExample ? 'example' : 'hot_search',
    channel: channel.value,
    genre: direction.title || '创作方向',
    tags: direction.keywords || direction.platforms || [],
    heatScore: direction.isExample ? null : direction.heatScore == null ? null : direction.heatScore,
    growthScore: null,
    opportunityScore: null,
    contentKind: direction.contentKind || (direction.isExample ? 'example' : 'live'),
    contentKindLabel: direction.contentKindLabel || (direction.isExample ? '示例内容' : '外部实时'),
    isExample: Boolean(direction.isExample),
    summary: direction.hook || '',
    readerEmotion: direction.isExample ? [] : ['期待', '爽感', '反转'],
    storyPotential: direction.hook || '',
    conflict: direction.hook || '',
    hook: direction.hook || '',
    bookTitleIdeas: [direction.title || '原创选题'],
    loglineIdeas: [direction.hook || ''],
    openingIdeas: [direction.hook || ''],
    rawIds: []
  }
}

async function handleSaveActivityPlan(activity) {
  await handleSaveInsight(activityToInsight(activity))
}

async function handleActivityDirection(activity) {
  await handleGenerateOutline(activityToInsight(activity))
}

async function handleActivityApply(activity) {
  await handleApplyToBook(activityToInsight(activity))
}

async function handleActivityCreateBook(activity) {
  await handleCreateBook(activityToInsight(activity))
}

function bookIdentity(book = {}) {
  return String(book.folderName || book.name || book.id || '').trim()
}

function syncSelectedBook() {
  const rows = Array.isArray(books.value) ? books.value : []
  const routeBookId = String(route.query.bookId || route.query.name || '').trim()
  const storedBookId = localStorage.getItem('marketInspiration:selectedBookId') || ''
  const preferred = [selectedBookId.value, routeBookId, storedBookId]
    .map((value) => String(value || '').trim())
    .find((value) => rows.some((book) => bookIdentity(book) === value))
  selectedBookId.value = preferred || ''
}

function selectedTargetBook() {
  const id = String(selectedBookId.value || '').trim()
  if (!id) return null
  return books.value.find((book) => bookIdentity(book) === id) || null
}

function selectTargetBook(book) {
  selectedBookId.value = bookIdentity(book)
  rememberSelectedBook()
}

function rememberSelectedBook() {
  const id = String(selectedBookId.value || '').trim()
  if (id) localStorage.setItem('marketInspiration:selectedBookId', id)
  else localStorage.removeItem('marketInspiration:selectedBookId')
}

function activityToInsight(activity = {}) {
  return {
    id: activity.id,
    title: `${activity.title}投稿方向`,
    source: activity.platform,
    sourceType: 'activity',
    channel: activity.channel || channel.value,
    genre: activity.genres?.[0] || activity.categories?.[0] || '投稿题材',
    tags: activity.tags || activity.genres || activity.categories || [],
    heatScore: activity.fitScore == null ? null : activity.fitScore,
    growthScore: null,
    opportunityScore: activity.fitScore == null ? null : activity.fitScore,
    contentKind: activity.contentKind || 'live',
    contentKindLabel: activity.contentKindLabel || '外部实时',
    isExample: Boolean(activity.isExample),
    summary: activity.summary,
    readerEmotion: [],
    storyPotential: activity.recommendedDirection || activity.requirementSummary,
    conflict: activity.recommendedDirection || activity.requirementSummary,
    hook: activity.recommendedDirection || activity.summary,
    bookTitleIdeas: [`${activity.title}原创投稿`, '反转开篇投稿稿', '强钩子短篇方案'],
    loglineIdeas: [activity.recommendedDirection || activity.summary],
    openingIdeas: [activity.recommendedDirection || activity.summary],
    rawIds: [activity.id],
    rawPayload: activity
  }
}

function contentKindLabel(item = {}) {
  if (item?.contentKindLabel) return item.contentKindLabel
  if (item?.isExample) return '示例内容'
  if (item?.isUserContent) return '用户内容'
  if (item?.isStale || item?.contentKind === 'stale') return '过期缓存'
  if (item?.contentKind === 'cached') return '缓存结果'
  return '外部实时'
}

function scoreLabel(score, item = {}) {
  if (item?.isExample || score == null || score === '') return contentKindLabel(item)
  return String(score)
}

function statusCard(source, label, status) {
  const row = status.find((item) => item.source === source)
  if (!row) return { key: source, label, state: 'empty', text: '未配置' }
  const state = sourceConnectionState(row)
  return {
    key: source,
    label,
    state,
    text: sourceStateText(state, '已连接')
  }
}

function platformStatusCard(status) {
  const platformSources = ['dailyhot', 'rsshub', 'qidian', 'jjwxc', 'fanqie', 'qimao']
  const rows = status.filter((item) => platformSources.includes(item.source))
  const states = rows.map((item) => sourceConnectionState(item))
  const ok = states.includes('success')
  const stale = states.includes('stale')
  const error = states.includes('error')
  const state = ok ? 'success' : stale ? 'stale' : error ? 'error' : 'empty'
  return {
    key: 'platform',
    label: '平台榜单',
    state,
    text: sourceStateText(state, '已同步', '部分失败', '无数据')
  }
}

function timeValue(value) {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : 0
}

function staleAfterForSource(source) {
  return SOURCE_STALE_AFTER_MS[source] || 24 * HOUR_MS
}

function sourceConnectionState(row = {}) {
  if (!row?.source || row.skipped) return 'empty'
  if (row.status === 'error') return 'error'
  if (row.status === 'stale' || row.isStale) return 'stale'
  const successAt = timeValue(row.lastSuccessAt)
  const failureAt = timeValue(row.lastFailureAt)
  if (failureAt && (!successAt || failureAt >= successAt)) return 'error'
  if (successAt && Date.now() - successAt > staleAfterForSource(row.source)) return 'stale'
  if (successAt || row.status === 'success') return 'success'
  if (failureAt || row.status === 'error') return 'error'
  return 'empty'
}

function sourceStateText(state, successText = '正常', errorText = '异常', emptyText = '未配置') {
  return (
    {
      success: successText,
      stale: '资料过期',
      error: errorText,
      empty: emptyText,
      skipped: emptyText
    }[state] || '未知'
  )
}

function countByChannel(target) {
  return hotRank.items.filter((item) => item.channel === target).length
}

function channelLabel(value) {
  return { all: '通用', male: '男频', female: '女频' }[value] || '通用'
}

function sourceStatusText(value) {
  return (
    {
      success: '正常',
      stale: '资料过期',
      error: '异常',
      empty: '空',
      skipped: '跳过'
    }[value] || '未知'
  )
}

function activityStatusLabel(value) {
  return (
    {
      ongoing: '进行中',
      upcoming: '即将开始',
      ending_soon: '截止临近',
      ended: '已结束',
      unknown: '未知'
    }[value] || '未知'
  )
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const KEYWORD_POSITIONS = [
  [18, 25],
  [29, 42],
  [20, 63],
  [43, 25],
  [52, 47],
  [42, 70],
  [69, 25],
  [78, 45],
  [68, 68],
  [31, 17],
  [58, 17],
  [83, 27],
  [13, 46],
  [24, 80],
  [55, 82],
  [83, 72],
  [39, 52],
  [62, 56],
  [17, 78],
  [74, 82],
  [49, 35],
  [33, 68],
  [82, 60],
  [57, 72]
]

function keywordStyle(word, index) {
  const position = KEYWORD_POSITIONS[index % KEYWORD_POSITIONS.length]
  const heat = Math.max(14, Math.min(27, 13 + Number(word.heatScore || 50) / 7))
  return {
    left: `${position[0]}%`,
    top: `${position[1]}%`,
    fontSize: `${heat}px`,
    animationDelay: `${(index % 8) * 0.18}s`
  }
}

</script>

<style lang="scss" scoped>
.market-page {
  --paper: var(--wabi-paper);
  --paper-soft: var(--wabi-bg-soft);
  --ink: var(--wabi-ink);
  --muted: var(--wabi-muted);
  --gold: var(--wabi-earth);
  --line: var(--wabi-line);
  --shadow: var(--wabi-shadow-soft);

  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  color: var(--ink);
}

:global(.app-main:has(.market-page)) {
  padding-inline: clamp(18px, 2vw, 34px);
  background:
    radial-gradient(circle at 22% 8%, rgba(111, 122, 104, 0.08), transparent 28%),
    radial-gradient(circle at 82% 20%, rgba(138, 115, 93, 0.06), transparent 26%),
    linear-gradient(180deg, #f5f3ef 0%, #fbfaf6 48%, #eee9df 100%);
}

button {
  font: inherit;
  color: inherit;
}

.market-page input,
.market-page select,
.market-page textarea {
  color: var(--ink);
  accent-color: var(--wabi-moss);
}

.market-hero {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(520px, auto);
  gap: 22px;
  align-items: start;
  margin-bottom: 18px;
}

.hero-copy h1 {
  margin: 0;
  font-family: 'Noto Serif SC', Georgia, serif;
  font-size: 32px;
  letter-spacing: 0.04em;
}

.hero-copy p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.7;
}

.source-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(98px, 1fr)) minmax(168px, 1.1fr) auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.78);
  box-shadow: var(--shadow);
}

.source-chip {
  display: grid;
  gap: 4px;
  min-height: 58px;
  padding: 11px 14px;
  border-right: 1px solid var(--line);
}

.source-name {
  color: var(--wabi-ink-soft);
  font-size: 13px;
  font-weight: 700;
}

.source-chip b {
  color: var(--ink);
  font-size: 13px;
}

.heat-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.source-chip i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.source-chip i.success {
  background: var(--wabi-moss);
}
.source-chip i.stale {
  background: var(--wabi-earth);
}
.source-chip i.error {
  background: var(--wabi-rust);
}
.source-chip i.empty {
  background: var(--wabi-muted-2);
}

.target-book-picker {
  display: grid;
  gap: 5px;
  min-height: 58px;
  padding: 9px 12px;
  border-right: 1px solid var(--line);
}

.target-book-picker span {
  color: var(--wabi-ink-soft);
  font-size: 13px;
  font-weight: 700;
}

.target-book-picker select {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(138, 115, 93, 0.22);
  border-radius: 7px;
  background: rgba(251, 250, 246, 0.92);
  font-size: 13px;
  padding: 4px 8px;
}

.dark-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 128px;
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    rgba(111, 122, 104, 0.46);
  border-radius: var(--theme-control-radius, 8px);
  background: var(--wabi-moss);
  color: #fbfaf6;
  box-shadow: var(--theme-shadow-hard, none);
  cursor: pointer;
  font-weight: var(--theme-font-weight-strong, 700);
  transition:
    transform var(--theme-transition-duration, 180ms) ease,
    box-shadow var(--theme-transition-duration, 180ms) ease;
}

.dark-button:hover {
  transform: var(--theme-button-transform-hover, translateY(-1px));
}

.dark-button:active {
  transform: var(--theme-button-transform-active, translateY(0));
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-banner {
  margin-bottom: 12px;
  padding: 10px 14px;
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid) var(--line);
  border-radius: var(--theme-control-radius, 8px);
  background: rgba(154, 96, 74, 0.11);
  color: var(--wabi-rust);
  box-shadow: var(--theme-shadow-card, none);
}

.result-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    rgba(111, 122, 104, 0.22);
  border-radius: var(--theme-card-radius, 10px);
  background: rgba(251, 250, 246, 0.82);
  box-shadow: var(--theme-shadow-card, var(--shadow));
}

.result-banner strong {
  color: var(--ink);
  font-size: 15px;
}

.result-banner p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.result-banner button {
  flex: 0 0 auto;
  min-height: 36px;
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    rgba(111, 122, 104, 0.34);
  border-radius: var(--theme-control-radius, 8px);
  background: var(--wabi-moss);
  color: #fbfaf6;
  cursor: pointer;
  padding: 7px 12px;
  box-shadow: var(--theme-shadow-hard, none);
}

.channel-toggle,
.market-tabs {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.78);
  overflow: hidden;
}

.channel-toggle {
  margin-bottom: 12px;
}

.channel-toggle button,
.market-tabs button {
  min-width: 96px;
  border: 0;
  border-right: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 10px 22px;
}

.channel-toggle button.active,
.market-tabs button.active {
  background: rgba(111, 122, 104, 0.12);
  color: var(--wabi-moss-dark);
  font-weight: 800;
  box-shadow: inset 0 -2px 0 var(--gold);
}

.market-tabs {
  display: flex;
  margin-bottom: 18px;
}

.overview-grid,
.rank-grid,
.keyword-grid,
.activity-grid {
  display: grid;
  gap: 16px;
  align-items: start;
}

.overview-grid {
  grid-template-columns: minmax(330px, 0.9fr) minmax(310px, 0.78fr) minmax(370px, 1fr);
}

.rank-grid {
  grid-template-columns: minmax(210px, 0.52fr) minmax(430px, 1fr) minmax(370px, 0.92fr);
}

.keyword-grid,
.activity-grid {
  grid-template-columns: minmax(560px, 1fr) minmax(360px, 0.74fr);
}

.paper-panel {
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.34), transparent 58%),
    linear-gradient(180deg, rgba(251, 250, 246, 0.96), rgba(240, 236, 227, 0.84)), var(--paper);
  box-shadow: var(--shadow);
}

.panel-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 11px;
  border-bottom: 1px solid rgba(138, 115, 93, 0.12);
}

.panel-title.slim {
  padding-inline: 0;
  border-bottom: 0;
}

.panel-title h2 {
  margin: 0;
  font-size: 17px;
}

.panel-title p,
.panel-title small,
.panel-title span {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.panel-title button {
  border: 0;
  background: transparent;
  color: var(--gold);
  cursor: pointer;
}

.writable-list,
.hot-rank-list,
.activity-list-panel {
  max-height: calc(100vh - 245px);
  min-height: 520px;
  overflow: auto;
  scrollbar-width: thin;
}

.direction-card,
.hot-card,
.activity-card,
.source-row,
.express-list button,
.combo-card {
  display: flex;
  width: calc(100% - 24px);
  margin: 0 12px 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.86);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.writable-list {
  padding: 0 12px 14px;
}

.writable-list > .panel-title,
.writable-list > .market-empty {
  margin-inline: -12px;
}

.direction-card:hover,
.direction-card.active,
.hot-card:hover,
.hot-card.active,
.activity-card:hover,
.activity-card.active,
.source-row:hover,
.source-row.active {
  border-color: rgba(111, 122, 104, 0.42);
  box-shadow: var(--wabi-shadow-soft);
  transform: translateY(-1px);
}

.direction-card {
  gap: 12px;
  padding: 12px;
  width: calc(100% - 4px);
  margin: 0 2px 10px;
}

.rank-badge,
.rank-flag {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid rgba(138, 96, 74, 0.28);
  border-radius: 6px;
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
  font-weight: 800;
  flex: 0 0 auto;
}

.direction-main {
  min-width: 0;
}

.direction-head,
.hot-line,
.activity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.direction-head h3,
.hot-line h3,
.activity-head h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
}

.direction-head strong,
.hot-line b,
.panel-title > b {
  color: var(--wabi-rust);
  font-size: 20px;
}

.direction-card p,
.hot-card p,
.activity-card p,
.translation-result p {
  margin: 7px 0 0;
  color: var(--wabi-muted);
  line-height: 1.55;
}

.direction-card p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tag-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tag-line span,
:global(.market-page .info-row em),
.activity-head span {
  border: 1px solid rgba(138, 115, 93, 0.14);
  border-radius: 4px;
  background: rgba(138, 115, 93, 0.08);
  color: var(--wabi-earth);
  font-style: normal;
  font-size: 13px;
  padding: 3px 7px;
}

.mini-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 13px;
}

.mini-metrics .success,
.source-row small.success {
  color: var(--wabi-moss);
}

.mini-metrics .stale,
.source-row small.stale {
  color: var(--wabi-earth);
}

.mini-metrics .error,
.source-row small.error {
  color: var(--wabi-rust);
}

.opportunity-card {
  display: grid;
  grid-template-columns: minmax(190px, 0.75fr) minmax(150px, 1fr);
  min-height: 150px;
  border-radius: 12px;
  background:
    radial-gradient(circle at 18% 24%, rgba(111, 122, 104, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(251, 250, 246, 0.92), rgba(240, 236, 227, 0.78));
  border: 1px solid var(--wabi-line);
  box-shadow: var(--shadow);
  padding: 22px;
}

.opportunity-card span {
  color: var(--wabi-earth);
}

.opportunity-card strong {
  display: block;
  margin: 8px 0;
  color: var(--wabi-moss-dark);
  font-size: 56px;
  line-height: 1;
}

.opportunity-card p {
  margin: 0;
  color: var(--wabi-muted);
  line-height: 1.6;
}

.sparkline {
  display: flex;
  align-items: end;
  gap: 6px;
  justify-content: flex-end;
}

.sparkline i {
  width: 6px;
  border-radius: 999px;
  background: rgba(111, 122, 104, 0.36);
}

.overview-center {
  display: grid;
  gap: 16px;
  align-content: start;
}

.genre-dials,
.express-list {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.genre-dials {
  grid-template-columns: repeat(4, minmax(64px, 1fr));
}

.genre-dial {
  display: grid;
  place-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.genre-dial span {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border-radius: 50%;
  background:
    radial-gradient(circle closest-side, #fbfaf6 72%, transparent 73% 100%),
    conic-gradient(var(--wabi-moss) var(--percent), #e1ddd4 0);
  color: var(--wabi-ink);
  font-weight: 800;
}

.genre-dial b {
  color: var(--wabi-ink-soft);
  font-size: 12px;
}

.express-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.agent-directions {
  display: grid;
  gap: 10px;
  padding: 12px 16px 16px;
}

.agent-directions button {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(138, 115, 93, 0.16);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.82);
  color: inherit;
  cursor: pointer;
  padding: 11px 12px;
  text-align: left;
}

.agent-directions strong {
  color: var(--wabi-moss-dark);
}

.agent-directions span,
.agent-directions p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.express-list button {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 13px;
}

.express-list span,
.express-list small {
  color: var(--muted);
  font-size: 12px;
}

.insight-detail-panel {
  position: sticky;
  top: 16px;
  overflow: hidden;
  width: 100%;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
}

:global(.market-page .detail-body) {
  display: grid;
  gap: 10px;
  padding: 14px;
}

:global(.market-page .detail-body h3),
:global(.market-page .detail-body p),
.translation-result p {
  overflow-wrap: anywhere;
}

:global(.market-page .detail-body h3),
.combination-panel h3,
.activity-detail-panel h3 {
  margin: 0 0 12px;
  font-size: 18px;
}

:global(.market-page .detail-body h3) {
  padding-right: 8px;
}

:global(.market-page .info-row) {
  display: block;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(138, 115, 93, 0.11);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.64);
}

:global(.market-page .info-row > span) {
  display: block;
  margin-bottom: 6px;
  color: var(--wabi-earth);
  font-size: 12px;
  font-weight: 700;
}

:global(.market-page .info-row div) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

:global(.market-page .info-row em) {
  max-width: 100%;
  overflow-wrap: anywhere;
}

:global(.market-page .market-action-bar) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 14px;
}

:global(.market-page .market-action-bar button),
.card-actions button {
  min-height: 36px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.86);
  color: var(--wabi-moss-dark);
  cursor: pointer;
  font-weight: 700;
  white-space: normal;
}

:global(.market-page .market-action-bar button.primary),
.card-actions button:last-child {
  border-color: rgba(111, 122, 104, 0.46);
  background: var(--wabi-moss);
  color: #fbfaf6;
}

:global(.market-page .market-action-bar button.loading) {
  opacity: 0.72;
}

.source-filter {
  padding-bottom: 12px;
}

.source-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
}

.source-row small {
  color: var(--muted);
}

.source-row em {
  grid-column: 1 / -1;
  justify-self: start;
  border-radius: 999px;
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
  font-size: 12px;
  font-style: normal;
  padding: 2px 8px;
}

.novel-direction {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.novel-direction strong {
  color: var(--wabi-moss-dark);
}

.novel-direction small {
  border-radius: 999px;
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
  padding: 2px 8px;
}

.source-summary {
  display: grid;
  gap: 8px;
  margin: 18px 12px 0;
  padding: 16px;
  border-radius: 10px;
  background: rgba(138, 115, 93, 0.1);
}

.source-summary b {
  color: var(--wabi-earth);
  font-size: 36px;
}

.hot-card {
  gap: 12px;
  padding: 15px;
}

.hot-content {
  flex: 1;
  min-width: 0;
}

.hot-line span {
  color: var(--muted);
  font-size: 12px;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.card-actions button {
  min-width: 100px;
  padding-inline: 12px;
}

.keyword-map-panel {
  padding: 0 18px 18px;
}

.trend-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.keyword-universe {
  position: relative;
  height: 460px;
  overflow: hidden;
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 26% 30%, rgba(154, 96, 74, 0.09) 0 19%, transparent 34%),
    radial-gradient(ellipse at 72% 26%, rgba(72, 81, 92, 0.1) 0 21%, transparent 36%),
    radial-gradient(ellipse at 44% 70%, rgba(111, 122, 104, 0.12) 0 19%, transparent 34%),
    radial-gradient(ellipse at 56% 48%, rgba(138, 115, 93, 0.1) 0 23%, transparent 38%),
    linear-gradient(130deg, rgba(255, 255, 255, 0.72), rgba(240, 236, 227, 0.46)), #fbfaf6;
}

.keyword-universe::before,
.keyword-universe::after {
  content: '';
  position: absolute;
  inset: 34px 48px;
  border: 1px dashed rgba(138, 115, 93, 0.18);
  border-radius: 50%;
  transform: rotate(-8deg);
}

.keyword-universe::after {
  inset: 78px 120px;
  border-color: rgba(72, 81, 92, 0.14);
  transform: rotate(12deg);
}

.keyword-orbit {
  position: absolute;
  z-index: 1;
  transform: translate(-50%, -50%);
  border: 1px solid var(--wabi-line);
  border-radius: 999px 999px 999px 16px;
  background: rgba(251, 250, 246, 0.88);
  color: var(--wabi-earth);
  cursor: pointer;
  padding: 7px 12px;
  box-shadow: 0 10px 24px rgba(58, 55, 49, 0.07);
  white-space: nowrap;
  font-weight: 700;
  animation: floatWord 5s ease-in-out infinite;
}

.keyword-orbit.emotion {
  color: var(--wabi-rust);
  background: rgba(154, 96, 74, 0.08);
}
.keyword-orbit.character {
  color: var(--wabi-indigo);
  background: rgba(72, 81, 92, 0.08);
}
.keyword-orbit.genre {
  color: var(--wabi-earth);
  background: rgba(138, 115, 93, 0.1);
}
.keyword-orbit.conflict {
  color: #6d6258;
  background: rgba(109, 98, 88, 0.08);
}
.keyword-orbit.platform {
  color: var(--wabi-moss-dark);
  background: rgba(111, 122, 104, 0.1);
}
.keyword-orbit.selected {
  outline: 3px solid rgba(111, 122, 104, 0.22);
  transform: translate(-50%, -50%) scale(1.08);
}

@keyframes floatWord {
  0%,
  100% {
    margin-top: 0;
  }
  50% {
    margin-top: -10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .keyword-orbit {
    animation: none;
  }
}

.popular-combos {
  padding-top: 12px;
}

.combo-card {
  display: inline-grid;
  gap: 6px;
  width: calc(33.333% - 9px);
  min-height: 96px;
  margin: 0 9px 10px 0;
  padding: 12px;
  vertical-align: top;
}

.combo-card span,
.combo-card p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.combo-card i {
  position: relative;
  display: block;
  height: 28px;
}

.combo-card em {
  position: absolute;
  bottom: 5px;
  width: 19%;
  border-radius: 999px;
  background: var(--wabi-moss);
  transform: rotate(-8deg);
}

.combo-card em:nth-child(1) {
  left: 0;
}
.combo-card em:nth-child(2) {
  left: 19%;
  transform: rotate(7deg);
}
.combo-card em:nth-child(3) {
  left: 38%;
  transform: rotate(-4deg);
}
.combo-card em:nth-child(4) {
  left: 57%;
  transform: rotate(6deg);
}
.combo-card em:nth-child(5) {
  left: 76%;
  transform: rotate(-5deg);
}

.combination-panel,
.activity-detail-panel {
  padding: 0 16px 16px;
}

.translation-result,
.matched-books {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(138, 115, 93, 0.13);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.72);
}

.translation-result h4,
.matched-books h4 {
  margin: 0 0 8px;
}

.activity-note {
  margin: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(138, 115, 93, 0.1);
  color: var(--wabi-earth);
}

.activity-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  cursor: default;
}

.activity-select-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.activity-select-button:focus-visible {
  outline: 2px solid rgba(111, 122, 104, 0.58);
  outline-offset: 4px;
  border-radius: 6px;
}

.activity-main {
  flex: 1;
  min-width: 0;
}

.activity-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 18px;
  margin: 12px 0;
  color: #6f6351;
  font-size: 13px;
}

.activity-head span.ongoing {
  background: rgba(111, 122, 104, 0.12);
  color: var(--wabi-moss-dark);
}
.activity-head span.ending_soon {
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
}
.activity-head span.ended {
  background: rgba(58, 55, 49, 0.08);
  color: var(--wabi-muted);
}

.fit-score {
  display: grid;
  min-width: 86px;
  place-items: center;
  gap: 4px;
  border-radius: 10px;
  background: rgba(240, 236, 227, 0.74);
  padding: 18px 12px;
}

.fit-score b {
  color: var(--wabi-moss-dark);
  font-size: 28px;
}

.fit-score span {
  color: var(--muted);
  font-size: 12px;
}

.matched-books {
  display: grid;
  gap: 10px;
}

.matched-books button {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(138, 115, 93, 0.16);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.86);
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.matched-books button.active {
  border-color: rgba(111, 122, 104, 0.56);
  background: rgba(111, 122, 104, 0.11);
}

.market-empty {
  padding: 28px 18px;
  color: var(--muted);
}

.market-empty strong {
  display: block;
  color: var(--ink);
  margin-bottom: 8px;
}

.ghost-button {
  border: 1px solid rgba(138, 115, 93, 0.24);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.92);
  color: var(--ink);
  min-height: 42px;
  padding: 0 14px;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error-banner,
.empty-banner {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  border: 1px solid rgba(176, 108, 84, 0.28);
  border-radius: 12px;
  background: rgba(255, 244, 236, 0.92);
  padding: 14px 16px;
}

.empty-banner {
  border-color: rgba(111, 122, 104, 0.28);
  background: rgba(243, 247, 239, 0.95);
}

.empty-banner.offline {
  border-color: rgba(176, 108, 84, 0.28);
  background: rgba(255, 244, 236, 0.92);
}

.error-actions,
.market-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.error-actions button,
.market-empty-action {
  border: 1px solid rgba(138, 115, 93, 0.2);
  border-radius: 8px;
  background: #fff;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
}

.market-empty-action.primary,
.error-actions button:first-child {
  background: rgba(111, 122, 104, 0.12);
  border-color: rgba(111, 122, 104, 0.36);
}

.content-kind-chip,
.heat-mark.is-example,
.direction-head strong.is-example {
  color: #6f7a68;
  font-weight: 600;
}

.example-note {
  display: grid;
  place-items: center;
  min-height: 72px;
  color: var(--muted);
  font-size: 13px;
}

.opportunity-card.example strong {
  font-size: 36px;
}

.fit-score.muted b {
  color: var(--muted);
}

.market-empty-offline {
  margin-top: 6px;
  color: #a15b3d;
}

.market-skeleton {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.market-skeleton i {
  height: 150px;
  border-radius: 10px;
  background: linear-gradient(90deg, #eee9df, #fbfaf6, #eee9df);
  animation: pulse 1.3s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.56;
  }
}

@media (max-width: 1180px) {
  .market-hero,
  .overview-grid,
  .rank-grid,
  .keyword-grid,
  .activity-grid {
    grid-template-columns: 1fr;
  }

  .source-bar {
    grid-template-columns: repeat(2, 1fr);
  }

  .writable-list {
    grid-template-columns: 1fr;
    max-height: none;
    overflow: visible;
  }

  .hot-rank-list,
  .activity-list-panel {
    max-height: none;
    overflow: visible;
  }

  .dark-button {
    min-height: 54px;
  }

  .insight-detail-panel {
    position: static;
    max-height: none;
  }
}

@media (max-width: 760px) {
  .market-page {
    width: 100%;
  }

  .hero-copy h1 {
    font-size: 24px;
    line-height: 1.25;
  }

  .hero-copy p {
    line-height: 1.6;
  }

  .source-bar {
    grid-template-columns: 1fr;
  }

  .genre-dials,
  .express-list,
  .activity-columns {
    grid-template-columns: 1fr;
  }

  .source-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 0;
    padding: 10px 11px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .source-chip i {
    flex: 0 0 auto;
  }

  .source-chip b {
    margin-left: auto;
    text-align: right;
  }

  .source-chip.time,
  .target-book-picker,
  .dark-button {
    grid-column: auto;
  }

  .target-book-picker {
    min-height: 0;
    padding: 10px 11px;
  }

  .dark-button {
    width: 100%;
    min-height: 46px;
  }

  .result-banner {
    display: grid;
    gap: 10px;
  }

  .result-banner button {
    width: 100%;
  }

  .channel-toggle,
  .market-tabs {
    display: grid;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }

  .channel-toggle {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .market-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .channel-toggle button,
  .market-tabs button {
    min-width: 0;
    width: 100%;
    min-height: 46px;
    padding: 9px 8px;
    line-height: 1.22;
    white-space: normal;
  }

  .overview-grid,
  .rank-grid,
  .keyword-grid,
  .activity-grid {
    min-width: 0;
  }

  .overview-grid > *,
  .rank-grid > *,
  .keyword-grid > *,
  .activity-grid > * {
    min-width: 0;
    max-width: 100%;
  }

  .opportunity-card {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: 16px;
  }

  .opportunity-card strong {
    font-size: 44px;
  }

  .sparkline {
    display: none;
  }

  .direction-card {
    width: 100%;
    margin-inline: 0;
  }

  .combo-card {
    width: 100%;
    float: none;
  }

  .market-action-bar {
    grid-template-columns: 1fr;
  }

  :global(.market-page .market-action-bar) {
    grid-template-columns: 1fr;
  }
}
</style>

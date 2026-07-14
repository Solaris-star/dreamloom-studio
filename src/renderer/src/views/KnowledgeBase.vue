<template>
  <LayoutTool title="织梦创作库">
    <template #headrAction>
      <el-button @click="openExtractionDialog">
        <el-icon><MagicStick /></el-icon>
        <span>拆书</span>
      </el-button>
      <el-button
        type="primary"
        @click="openCreateDialog(activeCreateType)"
      >
        <el-icon><Plus /></el-icon>
        <span>新建资产</span>
      </el-button>
    </template>

    <template #default>
      <div class="knowledge-page">
        <section class="knowledge-hero">
          <div>
            <h1>织梦创作库</h1>
            <p>保存你的灵感、拆书、热点、活动与创作设定。</p>
          </div>
          <div class="hero-stats">
            <div>
              <strong>{{ items.length }}</strong>
              <span>资产</span>
            </div>
            <div>
              <strong>{{ topicCount }}</strong>
              <span>选题</span>
            </div>
            <div>
              <strong>{{ endingSoonCount }}</strong>
              <span>临期活动</span>
            </div>
          </div>
        </section>

        <section class="asset-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="asset-tab"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span>{{ tab.label }}</span>
            <small>{{ countByTab(tab.key) }}</small>
          </button>
        </section>

        <section class="toolbar">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="搜索标题、摘要、正文、标签"
            class="search-input"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="filters.type"
            clearable
            placeholder="类型"
            class="filter-select"
          >
            <el-option
              v-for="type in typeOptions"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
          <el-select
            v-model="filters.sourceType"
            clearable
            placeholder="来源"
            class="filter-select"
          >
            <el-option
              v-for="source in sourceOptions"
              :key="source.value"
              :label="source.label"
              :value="source.value"
            />
          </el-select>
          <el-select
            v-model="filters.platform"
            clearable
            filterable
            placeholder="平台"
            class="filter-select"
          >
            <el-option
              v-for="platform in platformOptions"
              :key="platform"
              :label="platform"
              :value="platform"
            />
          </el-select>
          <el-select
            v-model="filters.genre"
            clearable
            filterable
            placeholder="题材"
            class="filter-select"
          >
            <el-option
              v-for="genre in genreOptions"
              :key="genre"
              :label="genre"
              :value="genre"
            />
          </el-select>
          <el-select
            v-model="filters.status"
            clearable
            placeholder="状态"
            class="filter-select"
          >
            <el-option
              v-for="status in statusOptions"
              :key="status.value"
              :label="status.label"
              :value="status.value"
            />
          </el-select>
          <el-select
            v-model="filters.sortBy"
            placeholder="排序"
            class="filter-select"
          >
            <el-option
              label="最近更新"
              value="updatedAt"
            />
            <el-option
              label="最近创建"
              value="createdAt"
            />
            <el-option
              label="标题"
              value="title"
            />
            <el-option
              label="热度"
              value="heat"
            />
            <el-option
              label="商业潜力"
              value="commercial"
            />
            <el-option
              label="最近使用"
              value="lastUsedAt"
            />
          </el-select>
        </section>

        <section class="workspace">
          <aside class="category-panel">
            <div class="panel-title">
              资产目录
            </div>
            <button
              v-for="group in directoryGroups"
              :key="group.key"
              class="directory-item"
              :class="{ active: filters.type === group.type }"
              @click="filters.type = filters.type === group.type ? '' : group.type"
            >
              <span>{{ group.label }}</span>
              <small>{{ group.count }}</small>
            </button>
            <div class="panel-title secondary">
              快捷入口
            </div>
            <button
              class="directory-item"
              @click="goToMarketInspiration"
            >
              <span>打开市场灵感</span>
              <small>录入热点和活动</small>
            </button>
          </aside>

          <main class="asset-list">
            <p
              v-if="itemsLoadError"
              class="list-read-error"
            >
              <span>{{ itemsLoadError }}</span>
              <button
                type="button"
                @click="loadItems"
              >
                重试
              </button>
            </p>
            <el-empty
              v-if="filteredItems.length === 0"
              :description="emptyText"
            />
            <article
              v-for="item in filteredItems"
              v-else
              :key="item.id"
              class="asset-card"
              :class="[item.type, { selected: selectedItem?.id === item.id }]"
              @click="selectItem(item)"
            >
              <div class="card-topline">
                <el-tag
                  size="small"
                  :type="tagTypeForItem(item)"
                  round
                >
                  {{
                    typeLabel(item.type)
                  }}
                </el-tag>
                <el-tag
                  v-if="item.status"
                  size="small"
                  :type="statusTagType(item.status)"
                  round
                >
                  {{ statusLabel(item.status) }}
                </el-tag>
                <el-tag
                  v-if="isEndingSoon(item)"
                  size="small"
                  type="danger"
                  round
                >
                  即将截止
                </el-tag>
                <el-button
                  class="favorite-btn"
                  text
                  :type="item.favorite ? 'warning' : 'info'"
                  @click.stop="toggleFavorite(item)"
                >
                  <el-icon><StarFilled v-if="item.favorite" /><Star v-else /></el-icon>
                </el-button>
              </div>

              <template v-if="item.type === 'topic_card'">
                <h3>{{ item.title }}</h3>
                <p class="hook">
                  {{ topicMeta(item).oneLineHook || item.summary }}
                </p>
                <div class="score-grid">
                  <ScoreBar
                    label="热度"
                    :value="topicMeta(item).marketHeatScore"
                  />
                  <ScoreBar
                    label="原创"
                    :value="topicMeta(item).originalityScore"
                  />
                  <ScoreBar
                    label="商业"
                    :value="topicMeta(item).commercialPotentialScore"
                  />
                  <ScoreBar
                    label="难度"
                    :value="topicMeta(item).writingDifficultyScore"
                  />
                </div>
                <div class="tag-row">
                  <el-tag
                    v-for="tag in item.genreTags.slice(0, 3)"
                    :key="tag"
                    size="small"
                    round
                  >
                    {{
                      tag
                    }}
                  </el-tag>
                  <el-tag
                    v-for="tag in item.platformTags.slice(0, 3)"
                    :key="tag"
                    size="small"
                    type="info"
                    round
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </template>

              <template v-else-if="item.type === 'market_hotspot'">
                <h3>{{ marketMeta(item).keyword || item.title }}</h3>
                <p>{{ item.summary || '市场热点已保存，可生成选题卡。' }}</p>
                <div class="metric-row">
                  <span>热度 {{ displayScore(marketMeta(item).heatScore) }}</span>
                  <span>趋势 {{ displayScore(marketMeta(item).growthScore) }}</span>
                  <span>机会 {{ displayScore(marketMeta(item).opportunityScore) }}</span>
                </div>
                <div class="tag-row">
                  <el-tag
                    v-for="tag in marketMeta(item).relatedKeywords?.slice(0, 4)"
                    :key="tag"
                    size="small"
                    round
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </template>

              <template v-else-if="item.type === 'writer_activity'">
                <h3>{{ item.title }}</h3>
                <p>{{ activityMeta(item).rewardSummary || item.summary || '作家活动已保存。' }}</p>
                <div class="metric-row">
                  <span>{{ activityTypeLabel(activityMeta(item).activityType) }}</span>
                  <span>{{ activityMeta(item).platform || item.sourceName || '未知平台' }}</span>
                  <span>{{ remainingDaysText(item) }}</span>
                </div>
                <div class="tag-row">
                  <el-tag
                    v-for="tag in activityMeta(item).categories?.slice(0, 4)"
                    :key="tag"
                    size="small"
                    round
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </template>

              <template v-else>
                <h3>{{ item.title }}</h3>
                <p>{{ item.summary || item.content || '这个资产还没有摘要。' }}</p>
                <div class="tag-row">
                  <el-tag
                    v-for="tag in allTags(item).slice(0, 6)"
                    :key="tag"
                    size="small"
                    round
                  >
                    {{
                      tag
                    }}
                  </el-tag>
                </div>
              </template>

              <div class="card-footer">
                <span>{{ item.sourceName || sourceLabel(item.sourceType) }}</span>
                <span>{{ formatDate(item.updatedAt) }}</span>
              </div>
              <div
                class="action-row"
                @click.stop
              >
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'expand')"
                >
                  AI 扩展
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'outline')"
                >
                  生成大纲
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'golden_chapters')"
                >
                  黄金三章
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'characters')"
                >
                  角色设定
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'world')"
                >
                  世界观
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="runAi(item, 'evaluate')"
                >
                  评估
                </el-button>
                <el-button
                  v-if="item.type === 'topic_card'"
                  size="small"
                  @click="convertToBook(item)"
                >
                  转为新书
                </el-button>
                <el-button
                  v-if="item.type === 'market_hotspot'"
                  size="small"
                  @click="generateTopicFrom(item)"
                >
                  生成选题
                </el-button>
                <el-button
                  v-if="item.type === 'writer_activity'"
                  size="small"
                  @click="generateTopicFrom(item)"
                >
                  生成投稿选题
                </el-button>
                <el-button
                  v-if="item.type === 'book_analysis'"
                  size="small"
                  @click="generateTopicFrom(item)"
                >
                  基于此生成选题
                </el-button>
                <el-button
                  size="small"
                  @click="archiveItem(item)"
                >
                  归档
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  @click="removeItem(item)"
                >
                  删除
                </el-button>
              </div>
            </article>
          </main>

          <aside class="detail-panel">
            <template v-if="selectedItem">
              <div class="detail-header">
                <div>
                  <el-tag
                    size="small"
                    :type="tagTypeForItem(selectedItem)"
                    round
                  >
                    {{
                      typeLabel(selectedItem.type)
                    }}
                  </el-tag>
                  <h2>{{ selectedItem.title }}</h2>
                </div>
                <el-button
                  text
                  :type="selectedItem.favorite ? 'warning' : 'info'"
                  @click="toggleFavorite(selectedItem)"
                >
                  <el-icon><StarFilled v-if="selectedItem.favorite" /><Star v-else /></el-icon>
                </el-button>
              </div>
              <p class="detail-summary">
                {{ selectedItem.summary || '暂无摘要' }}
              </p>
              <div class="detail-actions">
                <el-button
                  size="small"
                  @click="editItem(selectedItem)"
                >
                  编辑
                </el-button>
                <el-button
                  v-if="selectedItem.sourceUrl"
                  size="small"
                  @click="openExternal(selectedItem.sourceUrl)"
                >
                  查看来源
                </el-button>
                <el-button
                  v-if="selectedItem.type === 'writer_activity'"
                  size="small"
                  @click="openReminderDialog(selectedItem)"
                >
                  {{ activityMeta(selectedItem).reminderEnabled ? '取消提醒' : '设置提醒' }}
                </el-button>
              </div>
              <el-divider />
              <DetailBlock
                title="正文 / 摘要"
                :content="selectedItem.content || selectedItem.summary"
              />
              <DetailBlock
                title="结构化 Metadata"
                :content="JSON.stringify(selectedItem.metadata || {}, null, 2)"
                code
              />
              <DetailBlock
                title="关联知识"
                :content="relatedTitleList(selectedItem).join('、') || '暂无关联'"
              />
              <DetailBlock
                title="关联书籍"
                :content="selectedItem.relatedBookIds?.join('、') || '暂无关联'"
              />
              <div class="detail-time">
                <span>创建：{{ formatDate(selectedItem.createdAt) }}</span>
                <span>更新：{{ formatDate(selectedItem.updatedAt) }}</span>
              </div>
            </template>
            <el-empty
              v-else
              description="点击卡片查看资产详情"
            />
          </aside>
        </section>
      </div>
    </template>
  </LayoutTool>

  <el-dialog
    v-model="itemDialogVisible"
    :title="editingItem ? '编辑资产' : '新建资产'"
    width="760px"
  >
    <el-form
      label-width="92px"
      :model="itemForm"
    >
      <el-form-item label="类型">
        <el-select
          v-model="itemForm.type"
          style="width: 100%"
        >
          <el-option
            v-for="type in typeOptions"
            :key="type.value"
            :label="type.label"
            :value="type.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标题">
        <el-input
          v-model="itemForm.title"
          maxlength="80"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="摘要">
        <el-input
          v-model="itemForm.summary"
          type="textarea"
          :rows="2"
        />
      </el-form-item>
      <el-form-item label="正文">
        <el-input
          v-model="itemForm.content"
          type="textarea"
          :rows="5"
        />
      </el-form-item>
      <el-form-item label="标签">
        <el-select
          v-model="itemForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="题材">
        <el-select
          v-model="itemForm.genreTags"
          multiple
          filterable
          allow-create
          default-first-option
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="平台">
        <el-select
          v-model="itemForm.platformTags"
          multiple
          filterable
          allow-create
          default-first-option
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="来源">
        <el-input
          v-model="itemForm.sourceName"
          placeholder="平台、活动、导入来源"
        />
      </el-form-item>
      <el-form-item label="来源链接">
        <el-input v-model="itemForm.sourceUrl" />
      </el-form-item>

      <template v-if="itemForm.type === 'topic_card'">
        <el-divider content-position="left">
          选题卡
        </el-divider>
        <el-form-item label="一句话卖点">
          <el-input v-model="itemForm.topicCard.oneLineHook" />
        </el-form-item>
        <el-form-item label="主角">
          <el-input v-model="itemForm.topicCard.protagonist" />
        </el-form-item>
        <el-form-item label="金手指">
          <el-input v-model="itemForm.topicCard.goldenFinger" />
        </el-form-item>
        <el-form-item label="世界观">
          <el-input
            v-model="itemForm.topicCard.worldSetting"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="核心冲突">
          <el-input
            v-model="itemForm.topicCard.coreConflict"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="爽点">
          <el-select
            v-model="itemForm.topicCard.sellingPoints"
            multiple
            filterable
            allow-create
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="风险">
          <el-select
            v-model="itemForm.topicCard.riskNotes"
            multiple
            filterable
            allow-create
            style="width: 100%"
          />
        </el-form-item>
      </template>

      <template v-if="itemForm.type === 'writer_activity'">
        <el-divider content-position="left">
          作家活动
        </el-divider>
        <el-form-item label="平台">
          <el-input v-model="itemForm.writerActivity.platform" />
        </el-form-item>
        <el-form-item label="活动类型">
          <el-select
            v-model="itemForm.writerActivity.activityType"
            style="width: 100%"
          >
            <el-option
              v-for="type in activityTypeOptions"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker
            v-model="itemForm.writerActivity.startDate"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="itemForm.writerActivity.endDate"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          />
        </el-form-item>
        <el-form-item label="奖励摘要">
          <el-input
            v-model="itemForm.writerActivity.rewardSummary"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="要求摘要">
          <el-input
            v-model="itemForm.writerActivity.requirementSummary"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="itemDialogVisible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        @click="saveItem"
      >
        保存
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="aiDialogVisible"
    title="AI 生成结果"
    width="820px"
  >
    <div
      v-if="aiLoading"
      class="ai-loading"
    >
      <el-icon class="is-loading">
        <Loading />
      </el-icon>
      <span>正在加工资产...</span>
    </div>
    <template v-else>
      <el-alert
        v-if="!aiResult.parsed"
        type="warning"
        show-icon
        :closable="false"
        title="AI 返回不是标准 JSON，已保留原始输出。"
      />
      <el-input
        v-model="aiEditableText"
        type="textarea"
        :rows="16"
      />
    </template>
    <template #footer>
      <el-button @click="aiDialogVisible = false">
        关闭
      </el-button>
      <el-button
        v-if="aiResult.task === 'topic_card'"
        type="primary"
        :disabled="!aiResult.parsed"
        @click="saveAiTopic"
      >
        保存为选题卡
      </el-button>
      <el-button
        v-else
        type="primary"
        :disabled="!aiEditableText"
        @click="applyAiToCurrentItem"
      >
        写入当前资产
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="reminderDialogVisible"
    title="活动提醒"
    width="420px"
  >
    <el-radio-group v-model="reminderPreset">
      <el-radio value="7">
        截止前 7 天
      </el-radio>
      <el-radio value="3">
        截止前 3 天
      </el-radio>
      <el-radio value="1">
        截止前 1 天
      </el-radio>
      <el-radio value="custom">
        自定义时间
      </el-radio>
    </el-radio-group>
    <el-date-picker
      v-if="reminderPreset === 'custom'"
      v-model="customReminderTime"
      type="datetime"
      value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
      style="width: 100%; margin-top: 16px"
    />
    <template #footer>
      <el-button @click="cancelReminder">
        取消提醒
      </el-button>
      <el-button
        type="primary"
        @click="saveReminder"
      >
        保存提醒
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="createDialogVisible"
    title="新建拆书知识"
    width="640px"
    @close="resetCreateForm"
  >
    <el-form label-width="100px">
      <el-form-item label="来源">
        <el-radio-group v-model="createForm.sourceType">
          <el-radio value="online">
            在线书籍
          </el-radio>
          <el-radio value="local">
            本地书籍
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item
        v-if="createForm.sourceType === 'online'"
        label="在线搜索"
      >
        <div class="online-search-wrap">
          <div class="online-search-row">
            <el-input
              v-model="createForm.searchKeyword"
              clearable
              placeholder="输入书名关键词"
              @keyup.enter.prevent="handleOnlineSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button
              type="primary"
              :loading="onlineSearching"
              @click="handleOnlineSearch"
            >
              搜索
            </el-button>
          </div>
          <p
            v-if="onlineSearchError"
            class="dialog-error"
          >
            <span>{{ onlineSearchError }}</span>
            <button
              type="button"
              @click="handleOnlineSearch"
            >
              重试
            </button>
          </p>
          <el-table
            v-if="onlineSearchResults.length"
            :data="onlineSearchResults"
            stripe
            size="small"
            max-height="240"
            @row-click="selectOnlineBook"
          >
            <el-table-column
              prop="title"
              label="书名"
              min-width="160"
              show-overflow-tooltip
            />
            <el-table-column
              prop="author"
              label="作者"
              width="100"
              show-overflow-tooltip
            />
            <el-table-column
              width="80"
              align="center"
            >
              <template #default="{ row }">
                <el-button
                  :type="createForm.selectedBook?.url === row.url ? 'success' : 'primary'"
                  size="small"
                  round
                  @click.stop="selectOnlineBook(row)"
                >
                  {{ createForm.selectedBook?.url === row.url ? '已选' : '选择' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form-item>

      <el-form-item
        v-if="createForm.sourceType === 'local'"
        label="本地书籍"
      >
        <el-select
          v-model="createForm.selectedLocalBook"
          filterable
          style="width: 100%"
          placeholder="选择本地书籍"
        >
          <el-option
            v-for="book in bookshelfList"
            :key="book.name"
            :label="book.name"
            :value="book.folderName || book.name"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="章节范围">
        <div class="extraction-scope-field">
          <div class="extraction-scope-row">
            <el-checkbox
              v-model="createForm.limitChapters"
              :disabled="createForm.sourceType === 'online'"
            >
              只处理前
            </el-checkbox>
            <el-input-number
              v-model="createForm.chapterLimit"
              :disabled="createForm.sourceType === 'local' && !createForm.limitChapters"
              :min="1"
              :max="createChapterLimitMax"
              size="small"
              controls-position="right"
              @change="clampCreateChapterLimit"
            />
            <span>章</span>
          </div>
          <p>{{ createExtractionScopeText }}</p>
        </div>
      </el-form-item>

      <el-form-item label="拆书维度">
        <el-checkbox-group v-model="createForm.selectedDimensions">
          <div class="extraction-dimension-groups">
            <section
              v-for="group in extractionDimensionGroups"
              :key="group.key"
            >
              <header>
                <strong>{{ group.label }}</strong>
                <el-button
                  text
                  size="small"
                  @click.prevent="toggleCreateDimensionGroup(group)"
                >
                  {{ isCreateDimensionGroupSelected(group) ? '取消本组' : '选择本组' }}
                </el-button>
              </header>
              <el-checkbox
                v-for="dim in group.dimensions"
                :key="dim.key"
                :value="dim.key"
              >
                {{
                  dim.label
                }}
              </el-checkbox>
            </section>
          </div>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="服务商">
        <el-select
          v-model="createForm.selectedProviderId"
          style="width: 100%"
          placeholder="选择文本 AI 服务商"
          :disabled="!!textProviderError"
          @change="handleProviderChange"
        >
          <el-option
            v-for="p in textProviders"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
      </el-form-item>
      <p
        v-if="textProviderError"
        class="dialog-error"
      >
        <span>{{ textProviderError }}</span>
        <button
          type="button"
          @click="loadTextProviders"
        >
          重试
        </button>
      </p>
      <el-form-item label="模型">
        <el-select
          v-model="createForm.selectedModel"
          style="width: 100%"
          filterable
          allow-create
          :disabled="!createForm.selectedProviderId"
        >
          <el-option
            v-for="m in providerModels"
            :key="m"
            :label="m"
            :value="m"
          />
        </el-select>
      </el-form-item>

      <section
        v-if="extractionProgress"
        class="dialog-extraction-progress"
      >
        <div class="dialog-progress-head">
          <strong>{{ extractionProgress.currentStep || '正在拆书' }}</strong>
          <span>{{
            Math.round(
              extractionProgress.overallPercent || extractionProgress.progress?.percent || 0
            )
          }}%</span>
        </div>
        <p
          v-if="extractionProgressScopeText"
          class="dialog-progress-scope"
        >
          {{ extractionProgressScopeText }}
        </p>
        <el-progress
          :percentage="
            Math.round(
              extractionProgress.overallPercent || extractionProgress.progress?.percent || 0
            )
          "
        />
        <div class="dialog-task-list">
          <span
            v-for="task in extractionProgressTasks"
            :key="task.id || task.dimension"
          >
            {{ task.label }}：{{ task.extractedCount || task.itemCount || 0 }} 条
          </span>
        </div>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="createDialogVisible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="creating"
        :disabled="!canStartExtraction"
        @click="handleCreateExtraction"
      >
        开始拆书
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Loading, MagicStick, Plus, Search, Star, StarFilled } from '@element-plus/icons-vue'
import {
  downloadNovelChapters,
  getNovelChapterList,
  normalizeDownloadedChapters,
  searchNovel
} from '@renderer/service/novel'
import { getBookDir, readBooksDir } from '@renderer/service/books'
import { getActiveTextProvider, getAiProviders } from '@renderer/service/aiProvider'
import {
  canReadExtractionProgress,
  createExtraction,
  getExtractionDimensions,
  getExtractionProgress,
  requireCompletedExtractionResult
} from '@renderer/service/extraction'
import {
  archiveKnowledgeItem,
  convertTopicCardToBook,
  createKnowledgeItem,
  createTopicCardFromAi,
  deleteKnowledgeItem,
  favoriteKnowledgeItem,
  listKnowledgeItems,
  runKnowledgeAiTask,
  updateKnowledgeItem
} from '@renderer/service/knowledgeBase'

const router = useRouter()

// 局部渲染组件只服务当前详情面板，并依赖本页面的 scoped 样式。
// eslint-disable-next-line vue/one-component-per-file
const ScoreBar = defineComponent({
  props: {
    label: { type: String, default: '' },
    value: { type: [Number, String], default: 0 }
  },
  setup(props) {
    return () =>
      h('div', { class: 'score-bar' }, [
        h('span', props.label),
        h('div', { class: 'score-track' }, [
          h('i', { style: { width: `${Math.max(0, Math.min(100, Number(props.value) || 0))}%` } })
        ]),
        h('b', Number(props.value) || 0)
      ])
  }
})

// eslint-disable-next-line vue/one-component-per-file
const DetailBlock = defineComponent({
  props: {
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    code: { type: Boolean, default: false }
  },
  setup(props) {
    return () =>
      h('section', { class: 'detail-block' }, [
        h('h4', props.title),
        props.code ? h('pre', props.content || '暂无') : h('p', props.content || '暂无')
      ])
  }
})

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'note', label: '资料', type: 'note' },
  { key: 'book_analysis', label: '拆书', type: 'book_analysis' },
  { key: 'market_hotspot', label: '热点', type: 'market_hotspot' },
  { key: 'writer_activity', label: '活动', type: 'writer_activity' },
  { key: 'topic_card', label: '选题', type: 'topic_card' },
  { key: 'world_setting', label: '设定', type: 'world_setting' },
  { key: 'character_setting', label: '人设', type: 'character_setting' },
  { key: 'plot_fragment', label: '桥段', type: 'plot_fragment' },
  { key: 'prompt_template', label: 'Prompt', type: 'prompt_template' },
  { key: 'favorite', label: '收藏' }
]

const typeOptions = [
  { value: 'note', label: '普通资料' },
  { value: 'book_analysis', label: '拆书知识' },
  { value: 'market_hotspot', label: '市场热点' },
  { value: 'writer_activity', label: '作家活动' },
  { value: 'topic_card', label: '选题卡' },
  { value: 'world_setting', label: '世界观设定' },
  { value: 'character_setting', label: '人物设定' },
  { value: 'plot_fragment', label: '灵感片段' },
  { value: 'setting', label: '设定资料' },
  { value: 'foreshadowing', label: '伏笔线索' },
  { value: 'prompt_template', label: 'Prompt 模板' }
]

const sourceOptions = [
  { value: 'manual', label: '手动' },
  { value: 'market', label: '市场' },
  { value: 'writer_activity', label: '作家活动' },
  { value: 'book_analysis', label: '拆书' },
  { value: 'ai_generated', label: 'AI 生成' },
  { value: 'imported', label: '导入' },
  { value: 'system', label: '系统' }
]

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '可用' },
  { value: 'archived', label: '归档' },
  { value: 'converted_to_book', label: '已转书' },
  { value: 'discarded', label: '废弃' }
]

const activityTypeOptions = [
  { value: 'contest', label: '征文' },
  { value: 'welfare', label: '福利' },
  { value: 'ip', label: 'IP' },
  { value: 'short_drama', label: '短剧' },
  { value: 'training', label: '培训' },
  { value: 'submission', label: '投稿' },
  { value: 'other', label: '其他' }
]

const items = ref([])
const selectedItem = ref(null)
const itemsLoadError = ref('')
const activeTab = ref('all')
const filters = reactive({
  keyword: '',
  type: '',
  sourceType: '',
  platform: '',
  genre: '',
  status: '',
  sortBy: 'updatedAt'
})

const itemDialogVisible = ref(false)
const editingItem = ref(null)
const itemForm = ref(defaultItemForm())
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiResult = ref({ task: '', raw: '', parsed: null, sourceItem: null })
const aiEditableText = ref('')
const reminderDialogVisible = ref(false)
const reminderItem = ref(null)
const reminderPreset = ref('7')
const customReminderTime = ref('')
let reminderTimer = null
const EXTRACTION_POLL_INTERVAL_MS = 1800
const EXTRACTION_POLL_TIMEOUT_MS = 8 * 60 * 1000

const createDialogVisible = ref(false)
const creating = ref(false)
const onlineSearching = ref(false)
const onlineSearchResults = ref([])
const onlineSearchError = ref('')
const bookshelfList = ref([])
const availableDimensions = ref([])
const textProviders = ref([])
const textProviderError = ref('')
const createForm = ref(defaultCreateForm())
const extractionProgress = ref(null)

const FALLBACK_DIMENSIONS = [
  { key: 'narrative', label: '文风叙事' },
  { key: 'plot', label: '情节设计' },
  { key: 'character', label: '人物塑造' },
  { key: 'novelFeatures', label: '小说特点' },
  { key: 'emotion', label: '读者情绪' },
  { key: 'humor', label: '热梗搞笑' },
  { key: 'chapterOutline', label: '章节大纲' },
  { key: 'storyAssets', label: '作品资料' },
  { key: 'characterSetting', label: '角色设定' },
  { key: 'relationship', label: '人物关系' },
  { key: 'worldbuilding', label: '世界观' },
  { key: 'goldenFinger', label: '金手指' },
  { key: 'powerSystem', label: '力量体系' },
  { key: 'timeline', label: '时间线' },
  { key: 'locationFaction', label: '地点势力' },
  { key: 'foreshadowing', label: '伏笔线索' }
]

const EXTRACTION_DIMENSION_GROUPS = [
  {
    key: 'writing',
    label: '写法分析',
    keys: ['narrative', 'plot', 'character', 'novelFeatures', 'emotion', 'humor', 'chapterOutline']
  },
  {
    key: 'asset',
    label: '作品资料',
    keys: ['storyAssets']
  },
  {
    key: 'assetDetail',
    label: '分项补提',
    keys: [
      'characterSetting',
      'relationship',
      'worldbuilding',
      'goldenFinger',
      'powerSystem',
      'timeline',
      'locationFaction',
      'foreshadowing'
    ]
  }
]

const activeCreateType = computed(
  () => tabs.find((tab) => tab.key === activeTab.value)?.type || 'note'
)
const topicCount = computed(() => items.value.filter((item) => item.type === 'topic_card').length)
const endingSoonCount = computed(() => items.value.filter(isEndingSoon).length)
const platformOptions = computed(() =>
  uniqueFlat(items.value.flatMap((item) => item.platformTags || []))
)
const genreOptions = computed(() => uniqueFlat(items.value.flatMap((item) => item.genreTags || [])))
const directoryGroups = computed(() =>
  typeOptions.map((type) => ({
    key: type.value,
    type: type.value,
    label: type.label,
    count: items.value.filter((item) => item.type === type.value).length
  }))
)
const providerModels = computed(() => {
  const provider = textProviders.value.find((p) => p.id === createForm.value.selectedProviderId)
  return provider?.models || []
})
const selectedCreateLocalBook = computed(
  () =>
    bookshelfList.value.find(
      (book) => (book.folderName || book.name) === createForm.value.selectedLocalBook
    ) || null
)
const createSourceChapterCount = computed(() => {
  if (createForm.value.sourceType === 'local')
    return bookChapterCount(selectedCreateLocalBook.value)
  return bookChapterCount(createForm.value.selectedBook)
})
const createChapterLimitMax = computed(() => {
  const total = Number(createSourceChapterCount.value || 0)
  return Math.max(1, total ? Math.min(total, 200) : 200)
})
const createExtractionScopeText = computed(() => {
  const limit = Math.max(
    1,
    Math.min(Number(createForm.value.chapterLimit || 10), createChapterLimitMax.value)
  )
  if (createForm.value.sourceType === 'online') return `在线书籍本次下载并处理前 ${limit} 章。`
  if (!createForm.value.limitChapters) {
    const total = Number(createSourceChapterCount.value || 0)
    return total ? `本次将处理整本 ${total} 章。` : '本次将处理整本。'
  }
  const total = Number(createSourceChapterCount.value || 0)
  return total
    ? `本次将处理前 ${Math.min(limit, total)} / ${total} 章。`
    : `本次将处理前 ${limit} 章。`
})
const extractionDimensionGroups = computed(() => {
  const rows = availableDimensions.value || []
  const byKey = new Map(rows.map((item) => [item.key, item]))
  const used = new Set()
  const groups = EXTRACTION_DIMENSION_GROUPS.map((group) => {
    const dimensions = group.keys
      .map((key) => byKey.get(key) || FALLBACK_DIMENSIONS.find((item) => item.key === key))
      .filter(Boolean)
    dimensions.forEach((item) => used.add(item.key))
    return { ...group, dimensions }
  }).filter((group) => group.dimensions.length)
  const other = rows.filter((item) => !used.has(item.key))
  if (other.length) groups.push({ key: 'other', label: '其他', dimensions: other })
  return groups
})
const extractionProgressTasks = computed(() => {
  const rows = extractionProgress.value?.subTasks || []
  if (Array.isArray(rows)) return rows
  return Object.values(rows || {})
})
const extractionProgressScopeText = computed(() => {
  const scope =
    extractionProgress.value?.stats?.chapterScope || extractionProgress.value?.chapterScope
  if (!scope?.label) return ''
  return `处理章节：${scope.label}`
})
const canStartExtraction = computed(() => {
  const form = createForm.value
  if (textProviderError.value) return false
  if (!form.selectedDimensions.length || !form.selectedProviderId || !form.selectedModel)
    return false
  if (form.sourceType === 'online') return Boolean(form.selectedBook)
  return Boolean(form.selectedLocalBook)
})

const filteredItems = computed(() => {
  const tab = tabs.find((entry) => entry.key === activeTab.value)
  let rows = [...items.value]
  if (tab?.type) rows = rows.filter((item) => item.type === tab.type)
  if (activeTab.value === 'favorite') rows = rows.filter((item) => item.favorite)
  if (filters.type) rows = rows.filter((item) => item.type === filters.type)
  if (filters.sourceType) rows = rows.filter((item) => item.sourceType === filters.sourceType)
  if (filters.platform) rows = rows.filter((item) => item.platformTags?.includes(filters.platform))
  if (filters.genre) rows = rows.filter((item) => item.genreTags?.includes(filters.genre))
  if (filters.status) rows = rows.filter((item) => item.status === filters.status)
  if (filters.keyword.trim()) {
    const q = filters.keyword.trim().toLowerCase()
    rows = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(q))
  }
  return sortRows(rows, filters.sortBy)
})

const emptyText = computed(() => {
  if (activeTab.value === 'topic_card')
    return '还没有选题卡。你可以从市场热点、作家活动或拆书结果中一键生成选题。'
  if (activeTab.value === 'writer_activity')
    return '还没有收藏作家活动。去市场灵感里看看最近有什么征文和扶持计划吧。'
  if (activeTab.value === 'market_hotspot')
    return '还没有保存市场热点。你可以先从市场灵感模块收藏感兴趣的题材趋势。'
  return '创作库还是空的。你可以保存灵感、拆书结果、市场热点或作家活动，让它们成为你的创作素材。'
})

watch(filteredItems, (rows) => {
  if (!selectedItem.value && rows.length) selectedItem.value = rows[0]
  if (selectedItem.value && !rows.some((item) => item.id === selectedItem.value.id)) {
    selectedItem.value = rows[0] || null
  }
})

watch(
  () => createForm.value.sourceType,
  (sourceType) => {
    if (sourceType === 'online') createForm.value.limitChapters = true
    clampCreateChapterLimit()
  }
)

watch([createChapterLimitMax, selectedCreateLocalBook], () => {
  clampCreateChapterLimit()
})

onMounted(async () => {
  await Promise.all([loadItems(), loadBookshelf(), loadDimensions(), loadTextProviders()])
  checkActivityReminders()
  reminderTimer = setInterval(checkActivityReminders, 30 * 60 * 1000)
  window.addEventListener('extraction-progress', onExtractionProgress)
})

onUnmounted(() => {
  if (reminderTimer) clearInterval(reminderTimer)
  window.removeEventListener('extraction-progress', onExtractionProgress)
})

function defaultItemForm(type = 'note') {
  return {
    type,
    title: '',
    summary: '',
    content: '',
    tags: [],
    genreTags: [],
    platformTags: [],
    sourceType: 'manual',
    sourceName: '',
    sourceUrl: '',
    favorite: false,
    status: 'active',
    topicCard: {
      oneLineHook: '',
      protagonist: '',
      goldenFinger: '',
      worldSetting: '',
      coreConflict: '',
      openingHook: '',
      sellingPoints: [],
      riskNotes: [],
      platformSuggestions: [],
      monetizationPath: 'unknown',
      targetLength: 'unknown',
      marketHeatScore: 0,
      originalityScore: 0,
      commercialPotentialScore: 0,
      writingDifficultyScore: 0
    },
    writerActivity: {
      platform: '',
      activityType: 'other',
      categories: [],
      targetAudience: [],
      rewardSummary: '',
      requirementSummary: '',
      startDate: '',
      endDate: '',
      status: 'unknown',
      reminderEnabled: false,
      reminderTime: ''
    }
  }
}

function defaultCreateForm() {
  return {
    sourceType: 'local',
    searchKeyword: '',
    selectedBook: null,
    sourceId: '',
    selectedLocalBook: '',
    limitChapters: true,
    chapterLimit: 10,
    selectedDimensions: [],
    selectedProviderId: '',
    selectedModel: ''
  }
}

function bookChapterCount(book = {}) {
  return Number(book?.totalChapterCount || book?.chapterCount || book?.chapters?.length || 0) || 0
}

function clampCreateChapterLimit() {
  const max = createChapterLimitMax.value
  const value = Number(createForm.value.chapterLimit || 10) || 10
  createForm.value.chapterLimit = Math.min(Math.max(1, Math.floor(value)), max)
}

function isCreateDimensionGroupSelected(group = {}) {
  const keys = (group.dimensions || []).map((item) => item.key)
  return keys.length > 0 && keys.every((key) => createForm.value.selectedDimensions.includes(key))
}

function toggleCreateDimensionGroup(group = {}) {
  const keys = (group.dimensions || []).map((item) => item.key)
  if (!keys.length) return
  if (isCreateDimensionGroupSelected(group)) {
    createForm.value.selectedDimensions = createForm.value.selectedDimensions.filter(
      (key) => !keys.includes(key)
    )
    return
  }
  createForm.value.selectedDimensions = Array.from(
    new Set([...createForm.value.selectedDimensions, ...keys])
  )
}

async function getBooksDir() {
  return getBookDir()
}

async function loadItems() {
  try {
    const result = requireKnowledgeListResult(await listKnowledgeItems({ sortBy: filters.sortBy }))
    items.value = result.items
    itemsLoadError.value = ''
    if (selectedItem.value && !items.value.some((item) => item.id === selectedItem.value.id)) {
      selectedItem.value = null
    }
    if (!selectedItem.value && items.value.length) selectedItem.value = items.value[0]
  } catch (error) {
    itemsLoadError.value = error?.message || '加载创作库失败'
    ElMessage.error(itemsLoadError.value)
  }
}

async function loadBookshelf() {
  try {
    bookshelfList.value = await readBooksDir()
  } catch (error) {
    console.error('读取书架失败:', error)
    ElMessage.error(error?.message || '读取书架失败，请检查书库目录')
  }
}

async function loadDimensions() {
  try {
    const data = await getExtractionDimensions()
    availableDimensions.value = Array.isArray(data) && data.length ? data : FALLBACK_DIMENSIONS
  } catch {
    availableDimensions.value = FALLBACK_DIMENSIONS
  }
}

async function loadTextProviders() {
  textProviderError.value = ''
  try {
    const res = await getAiProviders()
    if (res?.success !== true) {
      throw new Error(res?.message || '读取文本 AI 服务失败')
    }
    if (!Array.isArray(res.providers)) {
      throw new Error('读取文本 AI 服务失败：接口返回格式不正确')
    }
    textProviders.value = res.providers.filter((p) => p.category === 'text')
    const active = await getActiveTextProvider()
    if (active?.providerId) createForm.value.selectedProviderId = active.providerId
  } catch (error) {
    textProviders.value = []
    createForm.value.selectedProviderId = ''
    createForm.value.selectedModel = ''
    textProviderError.value = error?.message || '读取文本 AI 服务失败'
    ElMessage.error(textProviderError.value)
  }
}

function uniqueFlat(list) {
  return Array.from(new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean)))
}

function sortRows(rows, sortBy) {
  const score = (item, key) => {
    const topic = topicMeta(item)
    const market = marketMeta(item)
    if (key === 'heat') return Number(topic.marketHeatScore ?? market.heatScore ?? 0)
    if (key === 'commercial')
      return Number(topic.commercialPotentialScore ?? market.opportunityScore ?? 0)
    return 0
  }
  return [...rows].sort((a, b) => {
    if (sortBy === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt)
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    if (sortBy === 'heat') return score(b, 'heat') - score(a, 'heat')
    if (sortBy === 'commercial') return score(b, 'commercial') - score(a, 'commercial')
    if (sortBy === 'lastUsedAt') return new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0)
    return new Date(b.updatedAt) - new Date(a.updatedAt)
  })
}

function countByTab(key) {
  if (key === 'all') return items.value.length
  if (key === 'favorite') return items.value.filter((item) => item.favorite).length
  const tab = tabs.find((entry) => entry.key === key)
  return tab?.type ? items.value.filter((item) => item.type === tab.type).length : 0
}

function typeLabel(type) {
  return typeOptions.find((entry) => entry.value === type)?.label || type
}

function sourceLabel(type) {
  return sourceOptions.find((entry) => entry.value === type)?.label || type || '手动'
}

function statusLabel(status) {
  return statusOptions.find((entry) => entry.value === status)?.label || status
}

function statusTagType(status) {
  if (status === 'archived' || status === 'discarded') return 'info'
  if (status === 'converted_to_book') return 'success'
  if (status === 'draft') return 'warning'
  return 'primary'
}

function tagTypeForItem(item) {
  if (item.type === 'topic_card') return 'success'
  if (item.type === 'market_hotspot') return 'danger'
  if (item.type === 'writer_activity') return 'warning'
  if (item.type === 'book_analysis') return 'primary'
  return 'info'
}

function allTags(item) {
  return uniqueFlat([...(item.tags || []), ...(item.genreTags || []), ...(item.platformTags || [])])
}

function topicMeta(item) {
  return item?.metadata?.topicCard || {}
}

function marketMeta(item) {
  return item?.metadata?.marketHotspot || {}
}

function activityMeta(item) {
  return item?.metadata?.writerActivity || {}
}

function activityTypeLabel(type) {
  return activityTypeOptions.find((entry) => entry.value === type)?.label || '其他'
}

function displayScore(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '-'
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function remainingDaysText(item) {
  const endDate = activityMeta(item).endDate
  if (!endDate) return '无截止时间'
  const diff = new Date(endDate).getTime() - Date.now()
  if (!Number.isFinite(diff)) return '无截止时间'
  if (diff < 0) return '已结束'
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
  return `剩余 ${days} 天`
}

function isEndingSoon(item) {
  if (item.type !== 'writer_activity') return false
  return activityMeta(item).status === 'ending_soon'
}

function selectItem(item) {
  selectedItem.value = item
}

function relatedTitleList(item) {
  const ids = item.relatedKnowledgeIds || []
  return ids.map((id) => items.value.find((entry) => entry.id === id)?.title).filter(Boolean)
}

function openExternal(url) {
  window.open(url, '_blank')
}

function openCreateDialog(type = 'note') {
  editingItem.value = null
  itemForm.value = defaultItemForm(type || 'note')
  if (type === 'topic_card') itemForm.value.sourceType = 'manual'
  itemDialogVisible.value = true
}

function editItem(item) {
  editingItem.value = item
  itemForm.value = {
    ...defaultItemForm(item.type),
    ...JSON.parse(JSON.stringify(item)),
    topicCard: { ...defaultItemForm().topicCard, ...(item.metadata?.topicCard || {}) },
    writerActivity: {
      ...defaultItemForm().writerActivity,
      ...(item.metadata?.writerActivity || {})
    }
  }
  itemDialogVisible.value = true
}

function buildPayloadFromForm() {
  const metadata = { ...(editingItem.value?.metadata || {}) }
  if (itemForm.value.type === 'topic_card') metadata.topicCard = { ...itemForm.value.topicCard }
  if (itemForm.value.type === 'writer_activity')
    metadata.writerActivity = { ...itemForm.value.writerActivity }
  return {
    type: itemForm.value.type,
    title: itemForm.value.title.trim(),
    summary: itemForm.value.summary,
    content: itemForm.value.content,
    tags: itemForm.value.tags,
    genreTags: itemForm.value.genreTags,
    platformTags: itemForm.value.platformTags,
    sourceType: itemForm.value.sourceType,
    sourceName: itemForm.value.sourceName,
    sourceUrl: itemForm.value.sourceUrl,
    favorite: itemForm.value.favorite,
    status: itemForm.value.status,
    metadata
  }
}

function requireKnowledgeSuccess(result, fallback = '操作失败') {
  if (result?.success !== true) throw new Error(result?.message || result?.error || fallback)
  return result
}

function requireKnowledgeListResult(result, fallback = '加载创作库失败') {
  requireKnowledgeSuccess(result, fallback)
  if (!Array.isArray(result.items)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  for (const item of result.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim()) {
      throw new Error(`${fallback}：条目格式不正确`)
    }
  }
  return result
}

function requireKnowledgeItem(result, fallback = '保存失败') {
  requireKnowledgeSuccess(result, fallback)
  if (!result.item) throw new Error(fallback)
  return result
}

async function saveItem() {
  if (!itemForm.value.title.trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  try {
    const payload = buildPayloadFromForm()
    const result = editingItem.value
      ? await updateKnowledgeItem(editingItem.value.id, payload)
      : await createKnowledgeItem(payload)
    requireKnowledgeItem(result, '保存失败')
    ElMessage.success(
      editingItem.value ? '已更新资产' : result.duplicate ? '已更新已有资产' : '已保存资产'
    )
    itemDialogVisible.value = false
    await loadItems()
    selectedItem.value = result.item
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

async function toggleFavorite(item) {
  try {
    const result = await favoriteKnowledgeItem(item.id, !item.favorite)
    requireKnowledgeItem(result, '更新收藏失败')
    Object.assign(item, result.item)
    if (selectedItem.value?.id === item.id) selectedItem.value = result.item
  } catch (error) {
    ElMessage.error(error?.message || '更新收藏失败')
  }
}

async function archiveItem(item) {
  try {
    const result = await archiveKnowledgeItem(item.id)
    requireKnowledgeItem(result, '归档失败')
    ElMessage.success('已归档')
    await loadItems()
  } catch (error) {
    ElMessage.error(error?.message || '归档失败')
  }
}

async function removeItem(item) {
  try {
    await ElMessageBox.confirm(`确定删除「${item.title}」吗？关联记录会保留引用 ID。`, '删除资产', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const result = await deleteKnowledgeItem(item.id)
    requireKnowledgeSuccess(result, '删除失败')
    ElMessage.success('已删除')
    if (selectedItem.value?.id === item.id) selectedItem.value = null
    await loadItems()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '删除失败')
  }
}

async function generateTopicFrom(item) {
  const task =
    item.type === 'book_analysis'
      ? 'from_book_analysis'
      : item.type === 'writer_activity'
        ? 'from_activity'
        : 'topic_card'
  await runAi(item, task)
}

function requireKnowledgeAiTaskResult(result, fallback = 'AI 生成失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || fallback)
  }
  const raw = String(result.raw || result.content || '').trim()
  if (!raw) {
    throw new Error(`${fallback}：接口没有返回生成内容`)
  }
  if (!result.parsed || typeof result.parsed !== 'object' || Array.isArray(result.parsed)) {
    throw new Error(`${fallback}：接口没有返回可编辑 JSON`)
  }
  return {
    ...result,
    raw,
    parsed: result.parsed
  }
}

async function runAi(item, task) {
  aiDialogVisible.value = true
  aiLoading.value = true
  aiResult.value = {
    task: task === 'from_book_analysis' || task === 'from_activity' ? 'topic_card' : task,
    raw: '',
    parsed: null,
    sourceItem: item
  }
  aiEditableText.value = ''
  try {
    const relatedItems = (item.relatedKnowledgeIds || [])
      .map((id) => items.value.find((entry) => entry.id === id))
      .filter(Boolean)
    const result = requireKnowledgeAiTaskResult(
      await runKnowledgeAiTask({
        task,
        item,
        relatedItems,
        options: { length: topicMeta(item).targetLength || 'medium' }
      })
    )
    aiResult.value = {
      task: task === 'from_book_analysis' || task === 'from_activity' ? 'topic_card' : task,
      raw: result.raw,
      parsed: result.parsed,
      sourceItem: item
    }
    aiEditableText.value = JSON.stringify(result.parsed, null, 2)
  } catch (error) {
    ElMessage.error(error?.message || 'AI 生成失败')
    aiDialogVisible.value = false
  } finally {
    aiLoading.value = false
  }
}

function parseAiEditable() {
  try {
    return JSON.parse(aiEditableText.value)
  } catch {
    return null
  }
}

async function saveAiTopic() {
  const parsed = parseAiEditable()
  if (!parsed) {
    ElMessage.warning('请先修正为合法 JSON')
    return
  }
  try {
    const result = await createTopicCardFromAi({
      sourceItem: aiResult.value.sourceItem,
      aiResult: parsed,
      rawOutput: aiResult.value.raw
    })
    requireKnowledgeItem(result, '保存失败')
    ElMessage.success('选题卡已保存')
    aiDialogVisible.value = false
    await loadItems()
    selectedItem.value = result.item
    activeTab.value = 'topic_card'
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

async function applyAiToCurrentItem() {
  const item = aiResult.value.sourceItem
  if (!item) return
  const parsed = parseAiEditable()
  if (!parsed) {
    ElMessage.warning('请先修正为合法 JSON')
    return
  }
  const outputKey =
    {
      expand: 'expand',
      outline: 'outline',
      golden_chapters: 'goldenChapters',
      characters: 'characters',
      world: 'world',
      evaluate: 'evaluation'
    }[aiResult.value.task] || aiResult.value.task
  const patch = {
    metadata: {
      ...(item.metadata || {}),
      aiOutputs: {
        ...(item.metadata?.aiOutputs || {}),
        [outputKey]: {
          parsed,
          raw: aiResult.value.raw,
          updatedAt: new Date().toISOString()
        }
      }
    }
  }
  if (aiResult.value.task === 'expand' && parsed.oneLineHook) {
    patch.metadata.topicCard = {
      ...(item.metadata?.topicCard || {}),
      ...parsed
    }
    patch.summary = parsed.oneLineHook
    patch.genreTags = parsed.genreTags || item.genreTags
    patch.platformTags = parsed.platformSuggestions || item.platformTags
  }
  if (aiResult.value.task === 'evaluate') {
    patch.metadata.topicCard = {
      ...(item.metadata?.topicCard || {}),
      marketHeatScore: parsed.marketHeatScore,
      originalityScore: parsed.originalityScore,
      commercialPotentialScore: parsed.commercialPotentialScore,
      writingDifficultyScore: parsed.writingDifficultyScore
    }
  }
  try {
    const result = await updateKnowledgeItem(item.id, patch)
    requireKnowledgeItem(result, 'AI 结果写入失败')
    ElMessage.success('AI 结果已写入')
    aiDialogVisible.value = false
    await loadItems()
    selectedItem.value = result.item
  } catch (error) {
    ElMessage.error(error?.message || 'AI 结果写入失败')
  }
}

async function convertToBook(item) {
  try {
    await ElMessageBox.confirm(
      `将「${item.title}」转为新书，并写入简介、设定与大纲草稿？`,
      '转为新书',
      {
        confirmButtonText: '转为新书',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    const result = await convertTopicCardToBook(item.id)
    requireKnowledgeSuccess(result, '转书失败')
    if (!result.book || !result.item) throw new Error('转书失败')
    ElMessage.success(`已创建《${result.book.name}》`)
    await loadItems()
    selectedItem.value = result.item
    const bookId = result.book.folderName || result.book.name || result.book.id
    if (bookId) {
      router.push({
        path: `/editor/${encodeURIComponent(bookId)}`,
        query: { name: result.book.name, source: 'topic_card' }
      })
    }
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '转书失败')
  }
}

function goToMarketInspiration() {
  router.push('/market-inspiration')
}

function openReminderDialog(item) {
  reminderItem.value = item
  reminderPreset.value = '7'
  customReminderTime.value = activityMeta(item).reminderTime || ''
  reminderDialogVisible.value = true
}

function calculateReminderTime(item) {
  if (reminderPreset.value === 'custom') return customReminderTime.value
  const end = activityMeta(item).endDate
  if (!end) return ''
  const time = new Date(end).getTime() - Number(reminderPreset.value) * 24 * 60 * 60 * 1000
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

async function saveReminder() {
  if (!reminderItem.value) return
  const reminderTime = calculateReminderTime(reminderItem.value)
  if (!reminderTime) {
    ElMessage.warning('这个活动缺少截止时间，请选择自定义提醒时间')
    return
  }
  try {
    const item = reminderItem.value
    const result = await updateKnowledgeItem(item.id, {
      metadata: {
        ...(item.metadata || {}),
        writerActivity: {
          ...activityMeta(item),
          reminderEnabled: true,
          reminderTime,
          lastRemindedAt: ''
        }
      }
    })
    requireKnowledgeItem(result, '设置提醒失败')
    ElMessage.success('提醒已设置')
    reminderDialogVisible.value = false
    await loadItems()
  } catch (error) {
    ElMessage.error(error?.message || '设置提醒失败')
  }
}

async function cancelReminder() {
  if (!reminderItem.value) return
  try {
    const item = reminderItem.value
    const result = await updateKnowledgeItem(item.id, {
      metadata: {
        ...(item.metadata || {}),
        writerActivity: {
          ...activityMeta(item),
          reminderEnabled: false,
          reminderTime: '',
          lastRemindedAt: ''
        }
      }
    })
    requireKnowledgeItem(result, '取消提醒失败')
    ElMessage.success('提醒已取消')
    reminderDialogVisible.value = false
    await loadItems()
  } catch (error) {
    ElMessage.error(error?.message || '取消提醒失败')
  }
}

async function checkActivityReminders() {
  const now = Date.now()
  for (const item of items.value) {
    if (item.type !== 'writer_activity') continue
    const activity = activityMeta(item)
    if (!activity.reminderEnabled || activity.status === 'ended') continue
    const reminderTime = activity.reminderTime ? new Date(activity.reminderTime).getTime() : NaN
    if (!Number.isFinite(reminderTime) || reminderTime > now) continue
    const last = activity.lastRemindedAt ? new Date(activity.lastRemindedAt).getTime() : 0
    if (last && now - last < 20 * 60 * 60 * 1000) continue
    ElNotification({
      title: '作家活动提醒',
      message: `${item.title}：${remainingDaysText(item)}`,
      type: isEndingSoon(item) ? 'warning' : 'info',
      duration: 8000
    })
    await updateKnowledgeItem(item.id, {
      metadata: {
        ...(item.metadata || {}),
        writerActivity: {
          ...activity,
          lastRemindedAt: new Date().toISOString()
        }
      }
    })
  }
}

function openExtractionDialog() {
  createDialogVisible.value = true
  loadBookshelf()
  loadDimensions()
}

function resetCreateForm() {
  createForm.value = defaultCreateForm()
  onlineSearchResults.value = []
  onlineSearchError.value = ''
  extractionProgress.value = null
}

function handleProviderChange() {
  createForm.value.selectedModel = ''
}

async function handleOnlineSearch() {
  const keyword = createForm.value.searchKeyword?.trim()
  if (!keyword) {
    ElMessage.warning('请输入关键词')
    return
  }
  onlineSearching.value = true
  onlineSearchError.value = ''
  onlineSearchResults.value = []
  createForm.value.selectedBook = null
  try {
    const result = requireKnowledgeOnlineSearchResult(
      await searchNovel(keyword, createForm.value.sourceId || undefined)
    )
    onlineSearchResults.value = result.list
    if (result.sourceErrors.length && result.list.length) {
      ElMessage.warning(`部分书源搜索失败：${result.sourceErrors.slice(0, 2).join('；')}`)
    }
    if (!onlineSearchResults.value.length) ElMessage.info('没有搜索结果')
  } catch (error) {
    onlineSearchError.value = error?.message || '搜索失败'
    ElMessage.error(onlineSearchError.value)
  } finally {
    onlineSearching.value = false
  }
}

function requireKnowledgeOnlineSearchResult(result, fallback = '搜索失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (!Array.isArray(result.list)) {
    throw new Error(`${fallback}：接口返回结果格式不正确`)
  }
  if (!Array.isArray(result.sourceErrors)) {
    throw new Error(`${fallback}：接口返回书源错误格式不正确`)
  }
  return result
}

function selectOnlineBook(row) {
  createForm.value.selectedBook = row
  if (row?.sourceId) createForm.value.sourceId = row.sourceId
}

async function handleCreateExtraction() {
  const form = createForm.value
  if (textProviderError.value) {
    ElMessage.error(textProviderError.value)
    return
  }
  clampCreateChapterLimit()
  const shouldLimitChapters = form.sourceType === 'online' || form.limitChapters
  const chapterLimit = Math.max(1, Number(form.chapterLimit || 10) || 10)
  creating.value = true
  extractionProgress.value = null
  try {
    const booksDir = await getBooksDir()
    let bookName = ''
    let sourceText = ''
    if (form.sourceType === 'online') {
      bookName = form.selectedBook.title.replace(/[\\/:*?"<>|]/g, '_')
      sourceText = await loadOnlineExtractionText(form.selectedBook, chapterLimit)
    } else {
      bookName = form.selectedLocalBook
    }
    const bookPath = `${booksDir}\\${bookName}`
    const result = await createExtraction({
      bookPath,
      sourceBookName: bookName,
      sourceType: form.sourceType,
      dimensions: form.selectedDimensions,
      sourceUrl: form.sourceType === 'online' ? form.selectedBook?.url : '',
      sourceText,
      providerId: form.selectedProviderId,
      modelName: form.selectedModel,
      ...(shouldLimitChapters
        ? {
            chapterStart: 1,
            chapterEnd: chapterLimit,
            chapterLimit
          }
        : {})
    })
    let finalResult = result
    if (result.jobId) {
      applyExtractionProgress({
        jobId: result.jobId,
        bookPath,
        status: result.status || 'running',
        currentStep: result.currentStep || '已创建拆书任务，正在等待结果',
        overallPercent: result.overallPercent || 1,
        progress: { percent: result.overallPercent || 1 },
        stats:
          result.stats || (result.chapterScope ? { chapterScope: result.chapterScope } : undefined)
      })
      if (!canReadExtractionProgress()) {
        throw new Error('任务已创建，但当前环境无法读取进度，请稍后刷新创作库')
      }
      finalResult = await pollExtractionJob(result.jobId, bookPath)
    }
    requireCompletedExtractionResult(finalResult, '拆书失败')
    ElMessage.success('拆书任务已完成并同步到创作库')
    createDialogVisible.value = false
    await loadItems()
    activeTab.value = 'book_analysis'
  } catch (error) {
    ElMessage.error(error?.message || '拆书失败')
  } finally {
    creating.value = false
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function applyExtractionProgress(payload = {}) {
  if (!payload?.extractionId && !payload?.jobId) return
  extractionProgress.value = {
    ...(extractionProgress.value || {}),
    ...payload,
    progress: {
      ...(extractionProgress.value?.progress || {}),
      ...(payload.progress || {})
    },
    stats: {
      ...(extractionProgress.value?.stats || {}),
      ...(payload.stats || {})
    },
    subTasks: payload.subTasks || extractionProgress.value?.subTasks || []
  }
  if (!payload.dimension && ['completed', 'partial', 'failed'].includes(payload.status)) {
    loadItems()
  }
}

async function pollExtractionJob(jobId, bookPath) {
  const startedAt = Date.now()
  while (true) {
    const response = await getExtractionProgress({ jobId, bookPath })
    const progress = response?.progress || {}
    applyExtractionProgress({
      ...progress,
      jobId,
      extractionId: progress.extractionId || extractionProgress.value?.extractionId || jobId
    })
    if (response?.done) {
      const finalResult = response.result || progress
      return requireCompletedExtractionResult(finalResult, '拆书失败')
    }
    if (Date.now() - startedAt > EXTRACTION_POLL_TIMEOUT_MS) {
      throw new Error('拆书任务仍在后台运行，请稍后刷新创作库查看结果')
    }
    await delay(EXTRACTION_POLL_INTERVAL_MS)
  }
}

async function loadOnlineExtractionText(bookRow, chapterLimit = 10) {
  if (!bookRow?.url) return ''
  const chaptersResult = requireExtractionChapterListResult(
    await getNovelChapterList(bookRow.url, bookRow.sourceId)
  )
  const limit = Math.max(1, Math.min(Number(chapterLimit || 10) || 10, 200))
  const chapters = chaptersResult.chapters.slice(0, limit)
  if (!chapters.length) throw new Error('没有获取到在线书籍章节目录')
  const result = requireExtractionDownloadedChaptersResult(
    await downloadNovelChapters(chapters, bookRow.sourceId)
  )
  const downloadedRows = result.chapters
  const rows = normalizeDownloadedChapters(downloadedRows)
  if (rows.length < downloadedRows.length) {
    ElMessage.warning(`已跳过 ${downloadedRows.length - rows.length} 章失败或空正文`)
  }
  const text = rows
    .map(
      (chapter, index) =>
        `${chapter.title || chapters[index]?.title || `第${index + 1}章`}\n${chapter.content || ''}`
    )
    .join('\n\n')
    .trim()
  if (!text) throw new Error('没有下载到在线书籍正文')
  return text
}

function requireExtractionChapterListResult(result, fallback = '读取在线书籍目录失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (!Array.isArray(result.chapters)) {
    throw new Error(`${fallback}：接口返回章节格式不正确`)
  }
  return result
}

function requireExtractionDownloadedChaptersResult(result, fallback = '下载在线书籍正文失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (!Array.isArray(result.chapters)) {
    throw new Error(`${fallback}：接口返回正文格式不正确`)
  }
  return result
}

function onExtractionProgress(event) {
  const payload = event?.detail || event || {}
  applyExtractionProgress(payload)
}
</script>

<style lang="scss" scoped>
.knowledge-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: calc(100vh - 72px);
}

.knowledge-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  background:
    radial-gradient(circle at 92% 12%, rgba(111, 122, 104, 0.08), transparent 30%),
    linear-gradient(135deg, rgba(251, 250, 246, 0.96) 0%, rgba(240, 236, 227, 0.88) 100%);
  border: 1px solid var(--border-color);
  border-radius: 8px;

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-base);
  }

  p {
    margin: 4px 0 0;
    color: var(--text-gray);
  }
}

.hero-stats {
  display: flex;
  gap: 14px;

  div {
    min-width: 88px;
    padding: 10px 12px;
    background: rgba(251, 250, 246, 0.78);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    text-align: center;
  }

  strong {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: var(--primary-color);
  }

  span {
    color: var(--text-gray);
    font-size: 12px;
  }
}

.asset-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.asset-tab {
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-base);
  border-radius: 8px;
  padding: 7px 10px;
  min-width: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;

  small {
    color: var(--text-gray);
  }

  &.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: rgba(111, 122, 104, 0.1);
  }
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 240px;
}

.filter-select {
  width: 132px;
}

.workspace {
  display: grid;
  grid-template-columns: 190px minmax(360px, 1fr) 340px;
  gap: 14px;
  align-items: start;
  min-height: 0;
}

.category-panel,
.detail-panel {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 12px;
  position: sticky;
  top: 8px;
  max-height: calc(100vh - 190px);
  overflow: auto;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-base);
  margin-bottom: 8px;

  &.secondary {
    margin-top: 14px;
  }
}

.directory-item {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px;
  border-radius: 8px;
  color: var(--text-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  text-align: left;

  &:hover,
  &.active {
    background: rgba(111, 122, 104, 0.1);
    color: var(--wabi-moss-dark, var(--primary-color));
  }

  small {
    color: var(--text-gray);
  }
}

.asset-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  align-content: start;
}

.asset-card {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.3), transparent 56%), rgba(251, 250, 246, 0.9);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(28, 40, 40, 0.05);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover,
  &.selected {
    transform: translateY(-1px);
    border-color: rgba(111, 122, 104, 0.34);
    box-shadow: 0 8px 22px rgba(28, 40, 40, 0.09);
  }

  &.topic_card {
    border-left: 4px solid #6f7a68;
  }

  &.market_hotspot {
    border-left: 4px solid #9a604a;
  }

  &.writer_activity {
    border-left: 4px solid #9a7b4f;
  }

  h3 {
    margin: 10px 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: var(--text-base);
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: var(--text-gray);
    font-size: 13px;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.card-topline,
.card-footer,
.metric-row,
.tag-row,
.action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.favorite-btn {
  margin-left: auto;
}

.hook {
  color: var(--text-base) !important;
}

.metric-row {
  margin-top: 10px;

  span {
    font-size: 12px;
    color: var(--text-gray);
    background: var(--bg-mute);
    border-radius: 999px;
    padding: 3px 8px;
  }
}

.tag-row {
  margin-top: 10px;
}

.card-footer {
  justify-content: space-between;
  margin-top: 12px;
  color: var(--text-gray);
  font-size: 12px;
}

.action-row {
  margin-top: 12px;
}

.score-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 10px;
  margin-top: 12px;
}

:deep(.score-bar) {
  display: grid;
  grid-template-columns: 34px 1fr 26px;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--text-gray);
}

:deep(.score-track) {
  height: 5px;
  background: var(--bg-mute);
  border-radius: 999px;
  overflow: hidden;
}

:deep(.score-track i) {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6f7a68, #6f7a68);
}

:deep(.score-bar b) {
  color: var(--text-base);
  font-weight: 700;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  h2 {
    margin: 8px 0 0;
    font-size: 19px;
    font-weight: 700;
    line-height: 1.35;
  }
}

.detail-summary {
  color: var(--text-gray);
  margin: 10px 0;
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-block {
  margin-bottom: 14px;

  h4 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-base);
  }

  p,
  pre {
    margin: 0;
    color: var(--text-gray);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  pre {
    padding: 10px;
    background: var(--wabi-paper-deep);
    border-radius: 8px;
    max-height: 260px;
    overflow: auto;
  }
}

.detail-time {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-gray);
  font-size: 12px;
}

.ai-loading {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-gray);
}

.online-search-wrap {
  width: 100%;
}

.online-search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.extraction-dimension-groups {
  display: grid;
  gap: 10px;
}

.extraction-dimension-groups section {
  border: 1px solid #ebe1d0;
  border-radius: 10px;
  background: #fffaf2;
  padding: 10px;
}

.extraction-dimension-groups header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.extraction-dimension-groups strong {
  color: var(--text-base);
}

.extraction-scope-field {
  display: grid;
  gap: 6px;
  width: 100%;
}

.extraction-scope-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  span {
    color: var(--text-muted);
    font-size: 13px;
  }
}

.extraction-scope-field p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.dialog-error,
.list-read-error {
  display: grid;
  gap: 8px;
  margin: -8px 0 12px 120px;
  border: 1px solid rgba(154, 96, 74, 0.18);
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.08);
  color: var(--wabi-rust);
  line-height: 1.6;
  padding: 9px 10px;

  button {
    justify-self: start;
    border: 1px solid rgba(154, 96, 74, 0.24);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.64);
    color: var(--wabi-rust);
    cursor: pointer;
    font: inherit;
    padding: 6px 10px;
  }
}

.list-read-error {
  margin: 0 0 12px;
}

.dialog-extraction-progress {
  display: grid;
  gap: 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 12px;
  background: #fffaf2;
  padding: 12px;
}

.dialog-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-base);
  }

  span {
    color: var(--wabi-earth);
    font-weight: 700;
  }
}

.dialog-progress-scope {
  margin: -2px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.dialog-task-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    border-radius: 999px;
    background: rgba(111, 122, 104, 0.1);
    color: var(--text-gray);
    font-size: 12px;
    padding: 4px 8px;
  }
}

@media (max-width: 1180px) {
  .workspace {
    grid-template-columns: 160px 1fr;
  }

  .detail-panel {
    grid-column: 1 / -1;
    position: static;
    max-height: none;
  }
}

@media (max-width: 760px) {
  .knowledge-hero,
  .workspace {
    display: block;
  }

  .hero-stats,
  .category-panel,
  .detail-panel {
    margin-top: 12px;
  }

  .asset-list {
    grid-template-columns: 1fr;
    margin-top: 12px;
  }

  .dialog-error {
    margin-left: 0;
  }
}
</style>

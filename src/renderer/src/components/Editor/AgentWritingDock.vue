<template>
  <aside class="agent-panel">
    <header class="agent-header">
      <div class="agent-title-block">
        <span class="mode-seal">{{ currentModeText }}</span>
        <h2>{{ agentTitle }}</h2>
      </div>
      <div class="header-actions">
        <button
          class="records-trigger icon-only"
          type="button"
          title="AI 记录"
          aria-label="AI 记录"
          @click="recordsDrawerVisible = true"
        >
          <History :size="15" />
        </button>
        <button
          class="records-trigger icon-only"
          type="button"
          title="清理当前时间线"
          aria-label="清理当前时间线"
          @click="clearCurrentTimeline"
        >
          <Eraser :size="15" />
        </button>
        <el-popover
          v-model:visible="modelPanelVisible"
          placement="bottom-end"
          width="360"
          trigger="click"
          popper-class="agent-model-popover"
        >
          <template #reference>
            <button
              class="model-trigger"
              type="button"
              :title="`当前模型：${selectedProviderLabel || '未选择供应商'} / ${selectedModelDisplayName || '未选择具体模型'}`"
              aria-label="选择 Agent 模型"
            >
              <span
                class="model-status-dot"
                :class="{ error: lastError, empty: !selectedModel }"
                aria-hidden="true"
              />
              <strong>{{ selectedModelDisplayName || '选择模型' }}</strong>
              <em>{{ selectedProviderLabel || '未绑定' }}</em>
            </button>
          </template>
          <section class="model-panel">
            <header>
              <strong>选择模型</strong>
              <span>用途：{{ defaultModelTaskText }} · 当前：{{
                selectedProviderLabel || '无供应商'
              }}
                / {{ selectedModelDisplayName || '无模型' }}</span>
            </header>
            <label>供应商</label>
            <el-select
              v-model="selectedProviderId"
              class="model-panel-select"
              size="small"
              placeholder="供应商"
              :disabled="!providerOptions.length"
              @change="handleProviderChange"
            >
              <el-option
                v-for="provider in providerOptions"
                :key="provider.id"
                :label="provider.label"
                :value="provider.id"
              />
            </el-select>
            <label>具体模型</label>
            <el-select
              v-model="selectedModelId"
              class="model-panel-select"
              size="small"
              placeholder="具体模型"
              :disabled="!filteredModels.length"
              @change="handleModelSelectionChange"
            >
              <el-option
                v-for="model in filteredModels"
                :key="model.id"
                :label="model.displayName || model.modelName"
                :value="model.id"
              />
            </el-select>
            <p
              v-if="modelPreferenceReadError"
              class="model-read-error"
            >
              {{ modelPreferenceReadError }}
            </p>
            <p
              v-if="modelPreferenceWriteError"
              class="model-read-error"
            >
              {{ modelPreferenceWriteError }}
            </p>
            <p v-if="lastError">
              模型调用失败，可更换模型或重试。
            </p>
            <div
              v-if="lastError"
              class="model-error-actions"
            >
              <button
                type="button"
                @click="retryLastTask"
              >
                重试
              </button>
              <button
                type="button"
                @click="copyErrorDetail"
              >
                复制错误
              </button>
            </div>
          </section>
        </el-popover>
        <button
          type="button"
          title="Agent 设置"
          @click="openAgentSettings"
        >
          <Settings :size="16" />
        </button>
      </div>
    </header>

    <section
      v-if="!selectedModel"
      class="bind-model-card"
    >
      <span>{{ modelHintText }}</span>
      <el-button
        size="small"
        type="primary"
        @click="openModelBinding"
      >
        {{ availableModels.length ? '选择模型' : '去绑定模型' }}
      </el-button>
    </section>

    <section class="context-summary">
      <div>
        <span class="current-line">
          <i
            class="book-kind-dot"
            :class="bookKind"
            :title="bookTypeText()"
          >
            <Download
              v-if="isDownloadedBook"
              :size="13"
            />
            <Archive
              v-else-if="isReferenceBook"
              :size="13"
            />
            <BookOpen
              v-else
              :size="13"
            />
          </i>
          <span>{{ chapterName }} · {{ currentModeText }}</span>
        </span>
        <strong>上下文：{{ contextSummaryText }}</strong>
      </div>
      <button
        type="button"
        @click="contextDrawerVisible = true"
      >
        调整
      </button>
    </section>

    <section
      class="consistency-card"
      aria-live="polite"
    >
      <header>
        <div>
          <span>一致性检查</span>
          <strong>{{ consistencySummaryText }}</strong>
        </div>
        <el-switch
          v-model="useLlmConsistencyCheck"
          size="small"
          active-text="AI 复核"
          inactive-text="规则"
          @change="handleConsistencyModeChange"
        />
      </header>
      <div class="consistency-actions">
        <button
          class="primary"
          type="button"
          :disabled="isConsistencyChecking"
          @click="runChapterConsistencyCheck"
        >
          <Loader2
            v-if="isConsistencyChecking"
            class="spinning"
            :size="15"
          />
          <ShieldCheck
            v-else
            :size="15"
          />
          {{ isConsistencyChecking ? '检查中' : '检查当前章' }}
        </button>
        <button
          type="button"
          :disabled="isConsistencyChecking"
          title="读取最近检查"
          @click="loadConsistencyHistory"
        >
          <History :size="15" />
        </button>
      </div>
      <label class="consistency-auto-toggle">
        <input
          v-model="autoCheckGeneratedChapter"
          type="checkbox"
          @change="persistAutoCheckGeneratedChapter"
        >
        <span>正文生成后自动规则检查</span>
      </label>
      <p :class="{ error: consistencyReadError }">
        {{ consistencyHintText }}
      </p>
    </section>

    <section
      v-if="joinedContextItems.length"
      class="joined-context"
    >
      <header>
        <span>已加入上下文</span>
        <button
          type="button"
          @click="clearJoinedContext"
        >
          清空
        </button>
      </header>
      <div>
        <button
          v-for="item in joinedContextItems"
          :key="item.id"
          type="button"
          @click="removeJoinedContext(item.id)"
        >
          {{ item.title }}
        </button>
      </div>
    </section>

    <section
      class="suggestions"
      :class="{ starter: isStarterChapter }"
    >
      <header>
        <span>推荐下一步</span>
        <button
          type="button"
          title="查看全部能力"
          aria-label="查看全部能力"
          @click="capabilityPanelVisible = true"
        >
          <SlidersHorizontal :size="15" />
        </button>
      </header>
      <div class="suggestion-grid">
        <button
          v-for="item in suggestedActions"
          :key="item.id"
          type="button"
          @click="fillSuggestion(item)"
        >
          <Sparkles :size="14" />
          {{ item.label }}
        </button>
      </div>
    </section>

    <section
      ref="timelineRef"
      class="timeline"
    >
      <article
        v-for="message in timelineMessages"
        :key="message.id"
        :class="['timeline-item', message.kind]"
      >
        <span class="avatar">{{ messageAvatar(message) }}</span>
        <div class="message-body">
          <header
            v-if="message.kind !== 'result_card'"
            class="message-head"
          >
            <p
              v-if="message.title"
              class="message-title"
            >
              {{ message.title }}
            </p>
            <span>{{ blockTypeText(message.kind) }}</span>
          </header>

          <div
            v-if="message.kind === 'error_card'"
            class="error-card"
          >
            <strong>生成失败</strong>
            <p>原因：{{ message.content }}</p>
            <p
              v-if="message.showDetail && message.detail"
              class="error-detail"
            >
              {{ message.detail }}
            </p>
            <div>
              <button
                type="button"
                @click="retryLastTask"
              >
                重试
              </button>
              <button
                type="button"
                @click="modelPanelVisible = true"
              >
                更换模型
              </button>
              <button
                v-if="message.detail"
                type="button"
                @click="toggleErrorDetail(message)"
              >
                {{ message.showDetail ? '收起详情' : '查看详情' }}
              </button>
              <button
                type="button"
                @click="copyErrorDetail"
              >
                复制错误
              </button>
            </div>
          </div>

          <div
            v-else-if="message.kind === 'tool_call'"
            class="tool-card"
          >
            <strong>{{ message.title || '执行步骤' }}</strong>
            <p>{{ message.content }}</p>
            <footer
              v-if="message.streaming"
              class="stream-meta"
            >
              <span>片段 {{ message.chunkCount || 0 }}</span>
              <span>约 {{ message.wordCount || 0 }} 字</span>
              <span>{{ message.streamStatus === 'done' ? '已完成' : '写作中' }}</span>
            </footer>
          </div>

          <div
            v-else-if="message.kind === 'approval_card'"
            class="approval-card"
          >
            <strong>{{ message.title || '等待确认' }}</strong>
            <p>{{ message.content }}</p>
            <div>
              <button
                type="button"
                @click="confirmApproval(message)"
              >
                确认
              </button>
              <button
                type="button"
                @click="cancelApproval(message)"
              >
                取消
              </button>
            </div>
          </div>

          <div
            v-else-if="message.kind === 'consistency_card'"
            class="consistency-result-card"
          >
            <header>
              <div>
                <span>{{ message.llmChecked ? '规则检查 + AI 复核' : '规则检查' }}</span>
                <strong>{{ message.summary || message.content || '一致性检查结果' }}</strong>
              </div>
              <em>{{ formatTime(message.createdAt) }}</em>
            </header>
            <dl>
              <div v-if="message.source">
                <dt>来源</dt>
                <dd>{{ consistencySourceText(message.source) }}</dd>
              </div>
              <div v-if="message.applyAction">
                <dt>动作</dt>
                <dd>{{ applyActionText(message.applyAction) }}</dd>
              </div>
              <div>
                <dt>章节</dt>
                <dd>{{ message.chapterName || chapterName }}</dd>
              </div>
              <div>
                <dt>问题</dt>
                <dd>{{ consistencyIssuesOf(message).length }} 个</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>{{ consistencyModelText(message) }}</dd>
              </div>
            </dl>
            <ol
              v-if="consistencyIssuesOf(message).length"
              class="consistency-issues"
            >
              <li
                v-for="issue in consistencyIssuesOf(message)"
                :key="issue.id || `${issue.type}-${issue.evidence}`"
              >
                <span :class="['severity-pill', issue.severity || 'medium']">{{
                  severityText(issue.severity)
                }}</span>
                <div>
                  <strong>{{ issue.message || issue.type || '发现可能矛盾' }}</strong>
                  <p v-if="issue.evidence">
                    证据：{{ issue.evidence }}
                  </p>
                  <p v-if="issue.reference">
                    依据：{{ issue.reference }}
                  </p>
                  <p v-if="issue.suggestion">
                    建议：{{ issue.suggestion }}
                  </p>
                </div>
              </li>
            </ol>
            <p
              v-else
              class="consistency-clean"
            >
              未发现明确矛盾。
            </p>
            <footer v-if="message.llmChecked || usageSummaryText(message.usage)">
              <span v-if="message.llmChecked">AI 复核：{{ message.providerId || '已调用' }} /
                {{ message.model || '默认模型' }}</span>
              <span v-if="usageSummaryText(message.usage)">用量：{{ usageSummaryText(message.usage) }}</span>
            </footer>
          </div>

          <div
            v-else-if="message.kind === 'save_record'"
            class="save-card"
          >
            {{ message.content }}
          </div>

          <pre v-else-if="message.kind !== 'result_card'">{{ message.content }}</pre>

          <div
            v-else
            class="result-card"
          >
            <header>
              <div>
                <span>任务：{{ message.title || 'AI 结果' }}</span>
                <strong>{{ message.title || 'AI 结果' }}</strong>
              </div>
              <em>{{ statusText(message.status) }}</em>
            </header>
            <dl>
              <div>
                <dt>模型</dt>
                <dd>{{ message.modelUsed || selectedModelDisplayName || '默认模型' }}</dd>
              </div>
              <div>
                <dt>上下文</dt>
                <dd>{{ message.contextLabel || contextSummaryText }}</dd>
              </div>
              <div>
                <dt>生成时间</dt>
                <dd>{{ formatTime(message.createdAt) }}</dd>
              </div>
            </dl>
            <pre>{{ message.content }}</pre>
            <footer class="result-actions">
              <div class="result-actions-primary">
                <button
                  class="primary"
                  type="button"
                  @click="applyPrimaryResultAction(message)"
                >
                  {{ primaryResultActionLabel(message) }}
                </button>
                <button
                  type="button"
                  @click="applyResult(message, 'save_material')"
                >
                  保存到素材箱
                </button>
                <button
                  type="button"
                  @click="applyResult(message, 'save_snippet')"
                >
                  存为片段
                </button>
                <button
                  type="button"
                  :disabled="!canApplyResultToChapter(message)"
                  @click="applyResult(message, 'append')"
                >
                  追加章末
                </button>
              </div>
              <div class="result-actions-secondary">
                <button
                  type="button"
                  :disabled="!canApplyResultToChapter(message)"
                  @click="applyResult(message, 'insert')"
                >
                  插入正文
                </button>
                <button
                  type="button"
                  :disabled="!canApplyResultToChapter(message) || !selectionCount"
                  @click="applyResult(message, 'replace')"
                >
                  替换选中
                </button>
                <button
                  type="button"
                  @click="joinTargetBook(message)"
                >
                  加入当前作品
                </button>
                <button
                  type="button"
                  @click="convertToTemplate(message)"
                >
                  转成桥段模板
                </button>
                <button
                  type="button"
                  @click="regenerateResult(message)"
                >
                  重新生成
                </button>
                <button
                  class="danger"
                  type="button"
                  @click="discardResult(message)"
                >
                  丢弃
                </button>
              </div>
            </footer>
          </div>
        </div>
      </article>

      <article
        v-if="!timelineMessages.length"
        class="timeline-empty"
      >
        <Bot :size="24" />
        <p>{{ emptyTimelineText }}</p>
      </article>
    </section>

    <section class="command-box">
      <el-input
        v-model="commandInput"
        type="textarea"
        resize="none"
        :rows="3"
        placeholder="输入指令，或 / 能力。"
        @keydown.ctrl.enter.prevent="runCommand"
        @keydown.meta.enter.prevent="runCommand"
        @input="handleCommandInput"
      />

      <div
        v-if="slashPanelVisible"
        class="slash-panel"
      >
        <button
          v-for="capability in filteredSlashCapabilities"
          :key="capability.key"
          type="button"
          @click="selectCapability(capability)"
        >
          /{{ capability.label }}
          <span>{{ capability.category }}</span>
        </button>
      </div>

      <div class="command-controls">
        <el-select
          v-model="commandScope"
          size="small"
        >
          <el-option
            label="选中文本"
            value="selected_text"
          />
          <el-option
            label="当前段落"
            value="current_paragraph"
          />
          <el-option
            label="当前章节"
            value="current_chapter"
          />
          <el-option
            label="当前作品"
            value="current_book"
          />
        </el-select>
        <el-select
          v-model="executionMode"
          size="small"
        >
          <el-option
            label="生成预览"
            value="preview"
          />
          <el-option
            label="插入正文"
            value="insert"
          />
          <el-option
            label="保存素材"
            value="save_material"
          />
          <el-option
            label="提交队列"
            value="queue_write"
          />
        </el-select>
        <div
          v-if="executionMode === 'queue_write'"
          class="queue-retry-controls"
          aria-label="队列重试设置"
        >
          <label>
            <span>尝试</span>
            <el-input-number
              v-model="queueAttempts"
              size="small"
              :min="1"
              :max="5"
              controls-position="right"
            />
          </label>
          <label>
            <span>等待 ms</span>
            <el-input-number
              v-model="queueBackoffDelayMs"
              size="small"
              :min="100"
              :max="60000"
              :step="500"
              controls-position="right"
            />
          </label>
        </div>
        <el-popover
          v-model:visible="capabilityPanelVisible"
          placement="top"
          width="360"
          trigger="click"
          popper-class="agent-capability-popover"
        >
          <template #reference>
            <button
              class="capability-button"
              type="button"
            >
              <Wand2 :size="15" />
              能力
            </button>
          </template>
          <section class="capability-panel">
            <el-input
              v-model="capabilityKeyword"
              size="small"
              placeholder="搜索能力，例如：黄金三章、角色绘图、时间线、润色"
            />
            <p
              v-if="writingSkillLoadError"
              class="skill-load-error"
            >
              {{ writingSkillLoadError }}
            </p>
            <div
              v-if="!capabilityKeyword"
              class="capability-recommended"
            >
              <strong>当前推荐</strong>
              <div>
                <button
                  v-for="item in quickRecommendedCapabilities"
                  :key="item.key"
                  type="button"
                  @click="selectCapability(item)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div
              v-for="group in visibleCapabilityGroups"
              :key="group.name"
              class="capability-group"
            >
              <strong>{{ group.name }}</strong>
              <button
                v-for="item in group.items"
                :key="item.key"
                type="button"
                @click="selectCapability(item)"
              >
                {{ item.label }}
              </button>
            </div>
          </section>
        </el-popover>
        <button
          class="send-button"
          type="button"
          :disabled="isBusy"
          title="发送指令"
          aria-label="发送指令"
          @click="runCommand"
        >
          <Loader2
            v-if="isQueueSubmitting"
            class="spinning"
            :size="15"
          />
          <Send
            v-else
            :size="15"
          />
        </button>
        <button
          v-if="isGenerating"
          class="stop-button"
          type="button"
          :disabled="isCancellingGeneration"
          @click="cancelActiveGeneration"
        >
          <Loader2
            v-if="isCancellingGeneration"
            class="spinning"
            :size="15"
          />
          <span v-else>停止</span>
        </button>
      </div>
    </section>

    <el-drawer
      v-model="contextDrawerVisible"
      title="上下文设置"
      direction="rtl"
      size="360px"
    >
      <section class="context-drawer">
        <div class="preset-list">
          <button
            v-for="preset in contextPresets"
            :key="preset.key"
            type="button"
            :class="{ active: contextPreset === preset.key, disabled: preset.disabled }"
            :disabled="preset.disabled"
            @click="handleContextPresetClick(preset)"
          >
            <strong>{{ preset.label }}</strong>
            <span>{{ preset.description }}</span>
          </button>
        </div>
        <div class="context-options">
          <p
            v-if="contextPreferenceWriteError"
            class="context-write-error"
          >
            {{ contextPreferenceWriteError }}
          </p>
          <label
            v-for="item in contextItems"
            :key="item.key"
            :class="{ disabled: item.disabled }"
          >
            <input
              v-model="contextOptions[item.key]"
              type="checkbox"
              :disabled="item.disabled"
              @change="handleContextOptionChange"
            >
            <span>{{ item.label }}</span>
            <small v-if="item.disabled">{{ item.reason }}</small>
          </label>
        </div>
      </section>
    </el-drawer>

    <el-drawer
      v-model="recordsDrawerVisible"
      title="AI 记录"
      direction="rtl"
      size="420px"
      @open="loadHistory"
    >
      <section class="records-drawer">
        <header class="records-toolbar">
          <div>
            <strong>Agent 任务</strong>
            <span>{{ agentTaskHistory.length }} 条</span>
          </div>
          <p
            class="records-live-state"
            :class="{ live: isAgentTaskProgressLive }"
            :title="agentTaskProgressTitle"
          >
            {{ agentTaskProgressText }}
          </p>
          <button
            type="button"
            :disabled="isLoadingRecords"
            @click="loadHistory"
          >
            <Loader2
              v-if="isLoadingRecords"
              class="spinning"
              :size="14"
            />
            <History
              v-else
              :size="14"
            />
            刷新
          </button>
        </header>
        <section
          class="task-progress-card"
          aria-live="polite"
        >
          <dl>
            <div>
              <dt>连接</dt>
              <dd>{{ agentTaskProgressText }}</dd>
            </div>
            <div>
              <dt>最后更新</dt>
              <dd>{{ lastTaskProgressAt ? formatTime(lastTaskProgressAt) : '暂无消息' }}</dd>
            </div>
            <div>
              <dt>服务地址</dt>
              <dd>{{ agentTaskProgressUrlText }}</dd>
            </div>
            <div v-if="agentTaskReconnectText">
              <dt>重连</dt>
              <dd>{{ agentTaskReconnectText }}</dd>
            </div>
          </dl>
          <p
            v-if="agentTaskProgressNotice"
            class="task-progress-notice"
          >
            {{ agentTaskProgressNotice }}
          </p>
        </section>
        <section
          class="queue-status-card"
          aria-live="polite"
        >
          <header>
            <div>
              <strong>写作队列</strong>
              <span>{{ queueStatusText }}</span>
            </div>
            <button
              type="button"
              :disabled="isLoadingQueueStatus"
              @click="loadQueueStatus"
            >
              <Loader2
                v-if="isLoadingQueueStatus"
                class="spinning"
                :size="14"
              />
              <RefreshCw
                v-else
                :size="14"
              />
              刷新队列
            </button>
          </header>
          <p
            v-if="queueStatusError"
            class="queue-status-error"
          >
            {{ queueStatusError }}
          </p>
          <dl
            v-else-if="queueStatus"
            class="queue-counts"
          >
            <div
              v-for="item in queueCountItems"
              :key="item.key"
            >
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
          <p
            v-else
            class="queue-status-empty"
          >
            尚未读取 Redis 队列状态。
          </p>
          <footer v-if="queueStatus">
            <span>队列：{{ queueStatus.queueName || '默认队列' }}</span>
            <span>{{ queueWorkerText }}</span>
          </footer>
          <div
            v-if="queueJobs.length"
            class="queue-job-list"
          >
            <button
              v-for="job in queueJobs"
              :key="job.id"
              type="button"
              @click="inspectQueueJob(job.id)"
            >
              <span>{{ queueJobStateText(job.state) }}</span>
              <strong>{{ queueJobTitle(job) }}</strong>
              <em>{{ formatQueueTime(job.processedOn || job.timestamp) }}</em>
            </button>
          </div>
        </section>
        <section
          v-if="selectedQueueJobId || queueJobError"
          class="queue-job-card"
        >
          <header>
            <div>
              <strong>队列任务详情</strong>
              <span>{{ selectedQueueJobId || '未选择任务' }}</span>
            </div>
            <button
              type="button"
              @click="clearSelectedQueueJob"
            >
              关闭
            </button>
          </header>
          <p
            v-if="queueJobError"
            class="queue-status-error"
          >
            {{ queueJobError }}
          </p>
          <dl
            v-if="selectedQueueJob"
            class="queue-job-meta"
          >
            <div>
              <dt>状态</dt>
              <dd>{{ queueJobStateText(selectedQueueJob.state) }}</dd>
            </div>
            <div>
              <dt>名称</dt>
              <dd>{{ selectedQueueJob.name || '未记录' }}</dd>
            </div>
            <div>
              <dt>尝试</dt>
              <dd>{{ queueJobAttemptsText(selectedQueueJob) }}</dd>
            </div>
            <div>
              <dt>进度</dt>
              <dd>{{ queueJobProgressText(selectedQueueJob.progress) }}</dd>
            </div>
            <div>
              <dt>等待</dt>
              <dd>{{ queueJobBackoffText(selectedQueueJob) }}</dd>
            </div>
            <div>
              <dt>开始</dt>
              <dd>{{ formatQueueTime(selectedQueueJob.processedOn) }}</dd>
            </div>
            <div>
              <dt>结束</dt>
              <dd>{{ formatQueueTime(selectedQueueJob.finishedOn) }}</dd>
            </div>
          </dl>
          <p
            v-if="selectedQueueJob?.failedReason"
            class="queue-job-note"
          >
            失败原因：{{ selectedQueueJob.failedReason }}
          </p>
          <p
            v-if="selectedQueueJob?.returnvalue"
            class="queue-job-note"
          >
            返回：{{ queueJobValueText(selectedQueueJob.returnvalue) }}
          </p>
        </section>
        <p
          v-if="recordsError"
          class="records-error"
        >
          {{ recordsError }}
        </p>
        <article
          v-for="task in agentTaskHistory"
          :key="task.id"
          class="task-record"
        >
          <header>
            <div>
              <strong>{{ task.title || toolLabelFromType(task.type) || 'Agent 任务' }}</strong>
              <span>{{ agentTaskStatusText(task.status) }} ·
                {{ formatTime(task.updatedAt || task.createdAt) }}</span>
            </div>
            <em>{{ taskEventSummary(task) }}</em>
          </header>
          <dl>
            <div>
              <dt>章节</dt>
              <dd>{{ task.chapterId || '未记录' }}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{{ task.modelUsed || task.modelId || '未记录' }}</dd>
            </div>
            <div>
              <dt>动作</dt>
              <dd>{{ applyActionText(task.applyAction) }}</dd>
            </div>
            <div v-if="task.queueName || task.jobId">
              <dt>队列</dt>
              <dd>{{ queueTaskText(task) }}</dd>
            </div>
            <div v-if="task.queueName || task.jobId || linkedWriteTaskId(task)">
              <dt>写作任务</dt>
              <dd>{{ linkedWriteTaskId(task) || '未记录' }}</dd>
            </div>
          </dl>
          <div
            v-if="task.jobId || isQueueTaskCancellable(task) || isFailedAgentTask(task)"
            class="task-record-actions"
          >
            <button
              v-if="task.jobId"
              type="button"
              :disabled="isLoadingQueueJobId === task.jobId"
              @click="inspectQueuedTask(task)"
            >
              <Loader2
                v-if="isLoadingQueueJobId === task.jobId"
                class="spinning"
                :size="14"
              />
              <Search
                v-else
                :size="14"
              />
              <span>查看队列</span>
            </button>
            <button
              v-if="isFailedAgentTask(task)"
              type="button"
              :disabled="isBusy"
              @click="retryAgentTask(task)"
            >
              <RotateCcw :size="14" />
              <span>重试</span>
            </button>
            <button
              v-if="isQueueTaskCancellable(task)"
              class="danger"
              type="button"
              :disabled="cancellingQueueJobId === task.jobId"
              @click="cancelQueuedTask(task)"
            >
              <Loader2
                v-if="cancellingQueueJobId === task.jobId"
                class="spinning"
                :size="14"
              />
              <span v-else>停止队列任务</span>
            </button>
          </div>
          <ol v-if="agentTaskEvents(task).length">
            <li
              v-for="event in agentTaskEvents(task)"
              :key="event.id || `${task.id}:${event.type}:${event.finishedAt}`"
            >
              <span>{{ agentTaskEventTitle(event) }}</span>
              <p>{{ agentTaskEventText(event) }}</p>
            </li>
          </ol>
          <p v-else>
            {{ task.resultPreview || task.error || '暂无事件。' }}
          </p>
        </article>
        <div
          v-if="agentTaskHistory.length && toolHistory.length"
          class="records-divider"
        >
          生成记录
        </div>
        <article
          v-for="item in toolHistory"
          :key="item.id || item.createdAt"
        >
          <strong>{{ item.title || toolLabelFromType(item.type) || 'AI 记录' }}</strong>
          <span>{{ item.status || 'generated' }} · {{ formatTime(item.createdAt) }}</span>
          <p>{{ item.result || item.content || '暂无内容' }}</p>
        </article>
        <p
          v-if="
            !agentTaskHistory.length && !toolHistory.length && !isLoadingRecords && !recordsError
          "
          class="records-empty"
        >
          暂无记录。
        </p>
      </section>
    </el-drawer>

    <el-dialog
      v-model="joinDialogVisible"
      title="加入作品"
      width="440px"
      class="join-book-dialog"
      :close-on-click-modal="false"
    >
      <el-form label-width="82px">
        <el-form-item label="目标作品">
          <el-select
            v-model="joinForm.targetBookId"
            filterable
            placeholder="选择目标作品"
          >
            <el-option
              v-for="book in bookOptions"
              :key="book.id"
              :label="book.label"
              :value="book.id"
            />
          </el-select>
          <p
            v-if="bookOptionsError"
            class="join-book-error"
          >
            {{ bookOptionsError }}
          </p>
        </el-form-item>
        <el-form-item label="资料类型">
          <el-select v-model="joinForm.assetType">
            <el-option
              label="桥段素材"
              value="plot_fragment"
            />
            <el-option
              label="人物资料"
              value="character_setting"
            />
            <el-option
              label="世界资料"
              value="world_setting"
            />
            <el-option
              label="读书笔记"
              value="book_analysis"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用途">
          <el-select v-model="joinForm.usage">
            <el-option
              label="参考"
              value="reference"
            />
            <el-option
              label="灵感"
              value="inspiration"
            />
            <el-option
              label="草稿"
              value="draft"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="joinDialogVisible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :disabled="Boolean(bookOptionsError)"
          @click="confirmJoinTargetBook"
        >
          确认加入
        </el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Archive,
  BookOpen,
  Bot,
  Download,
  Eraser,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2
} from 'lucide-vue-next'
import { readBooksDir } from '@renderer/service/books'
import { getStoreValue } from '@renderer/service/webStore'
import { createKnowledgeItem } from '@renderer/service/knowledgeBase'
import {
  appendAgentMessage,
  cancelAgentGeneration,
  cancelAgentQueueJob,
  createEditorSnapshot,
  enqueueAgentRepairTask,
  enqueueAgentWriteTask,
  generateAgentPreview,
  getAgentQueueJob,
  getAgentQueueStatus,
  listAgentQueueJobs,
  listAgentHistory,
  listAgentTasks,
  listWritingSkills,
  listConsistencyChecks,
  listAgentMessages,
  listModelBindings,
  markGenerationApplied,
  openEditorSession,
  repairAgentResult,
  runWritingSkill,
  runConsistencyCheck,
  saveEditorMaterial,
  updateEditorSessionContext,
  updateModelDefaults
} from '@renderer/service/editor'
import {
  upsertAgentTaskProgressItem,
  useAgentTaskProgressSocket
} from '@renderer/composables/useAgentTaskProgressSocket'

const props = defineProps({
  bookName: { type: String, default: '' },
  bookMeta: { type: Object, default: null },
  mode: { type: String, default: 'write' },
  getEditorContext: { type: Function, required: true },
  applyGeneratedText: { type: Function, default: null },
  referenceContextItems: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'insert-text',
  'replace-selection',
  'replace-chapter',
  'append-text',
  'save-snippet',
  'open-reference-panel',
  'refresh-chapters'
])

const router = useRouter()
const availableModels = ref([])
const selectedProviderId = ref('')
const selectedModelId = ref('')
const sessionId = ref('')
const contextPreset = ref('standard')
const contextOptions = ref({
  selectedText: true,
  currentParagraph: false,
  currentChapter: true,
  previousSummary: true,
  outline: false,
  relatedCharacters: false,
  relatedWorldbuilding: false,
  assetWorkspace: false
})
const joinedContextItems = ref([])
const commandInput = ref('')
const commandScope = ref('current_chapter')
const executionMode = ref('preview')
const queueAttempts = ref(2)
const queueBackoffDelayMs = ref(3000)
const currentContext = ref({})
const timelineMessages = ref([])
const toolHistory = ref([])
const agentTaskHistory = ref([])
const isGenerating = ref(false)
const isCancellingGeneration = ref(false)
const isQueueSubmitting = ref(false)
const cancellingQueueJobId = ref('')
const queueStatus = ref(null)
const queueStatusError = ref('')
const isLoadingQueueStatus = ref(false)
const queueJobs = ref([])
const selectedQueueJob = ref(null)
const selectedQueueJobId = ref('')
const queueJobError = ref('')
const isLoadingQueueJobId = ref('')
const isConsistencyChecking = ref(false)
const isLoadingRecords = ref(false)
const useLlmConsistencyCheck = ref(false)
const autoCheckGeneratedChapter = ref(true)
const latestConsistencyCheck = ref(null)
const consistencyReadError = ref('')
const contextDrawerVisible = ref(false)
const capabilityPanelVisible = ref(false)
const slashPanelVisible = ref(false)
const capabilityKeyword = ref('')
const writingSkills = ref([])
const writingSkillGroups = ref([])
const writingSkillLoadError = ref('')
const timelineRef = ref(null)
const modelPanelVisible = ref(false)
const modelHintText = ref('尚未绑定可用模型。')
const modelPreferenceReadError = ref('')
const modelPreferenceWriteError = ref('')
const contextPreferenceWriteError = ref('')
const recordsDrawerVisible = ref(false)
const recordsError = ref('')
const lastError = ref('')
const lastErrorDetail = ref('')
const lastTask = ref(null)
const preparedTask = ref(null)
const activeStreamChannel = ref('')
const activeTaskId = ref('')
const joinDialogVisible = ref(false)
const pendingJoinMessage = ref(null)
const bookOptions = ref([])
const bookOptionsError = ref('')
const joinForm = ref({
  targetBookId: '',
  assetType: 'plot_fragment',
  usage: 'reference'
})
let contextTimer = null
let activeStreamMessageId = ''

const {
  status: agentTaskProgressStatus,
  error: agentTaskProgressError,
  lastMessageAt: lastTaskProgressAt,
  currentUrl: agentTaskProgressUrl,
  serverInfo: agentTaskServerInfo,
  lastCloseReason: agentTaskLastCloseReason,
  reconnectAttemptCount: agentTaskReconnectAttempt,
  nextReconnectAt: nextAgentTaskReconnectAt,
  connect: connectAgentTaskProgress,
  disconnect: disconnectAgentTaskProgress
} = useAgentTaskProgressSocket({
  onTask: handleAgentTaskProgress,
  onMessage: handleAgentStreamMessage
})

const bookKind = computed(() => normalizeBookKind(props.bookMeta))
const isDownloadedBook = computed(() => bookKind.value === 'downloaded')
const isReferenceBook = computed(() => bookKind.value === 'reference' || props.mode === 'extract')
const agentMode = computed(() => {
  if (isReferenceBook.value) return 'reference_extract'
  if (isDownloadedBook.value) return 'reading_extract'
  return 'writing'
})
const agentTitle = computed(() => {
  if (isReferenceBook.value) return '资料提炼 Agent'
  if (isDownloadedBook.value) return '读书分析 Agent'
  return '写作 Agent'
})
const currentModeText = computed(() => {
  const modeMap = { write: '写作模式', read: '阅读模式', review: '校对模式', extract: '提取模式' }
  return modeMap[props.mode] || '写作模式'
})
const chapterName = computed(
  () => currentContext.value?.chapterName || currentContext.value?.title || '未打开章节'
)
const wordCount = computed(() => Number(currentContext.value?.wordCount || 0))
const selectionCount = computed(() => countWords(currentContext.value?.selectedText || ''))
const canWriteChapter = computed(() => agentMode.value === 'writing' && props.mode === 'write')
const isBusy = computed(() => isGenerating.value || isQueueSubmitting.value)
const isStarterChapter = computed(() => agentMode.value === 'writing' && wordCount.value < 80)
const selectedModel = computed(
  () => availableModels.value.find((model) => model.id === selectedModelId.value) || null
)
const selectedModelName = computed(
  () => selectedModel.value?.modelName || selectedModel.value?.displayName || ''
)
const selectedModelDisplayName = computed(
  () => selectedModel.value?.displayName || selectedModel.value?.modelName || ''
)
const selectedProviderLabel = computed(
  () => providerOptions.value.find((item) => item.id === selectedProviderId.value)?.label || ''
)
const defaultModelTaskText = computed(() => {
  const map = {
    writing: '写作',
    extract: '拆书',
    summary: '摘要',
    image_prompt: '图片 Prompt',
    chat: '对话'
  }
  return map[defaultModelTask()] || '写作'
})
const providerOptions = computed(() => {
  const map = new Map()
  availableModels.value.forEach((model) => {
    const id = providerIdOf(model)
    if (!map.has(id)) {
      map.set(id, {
        id,
        label:
          model.providerDisplayName ||
          model.providerName ||
          model.provider ||
          model.raw?.name ||
          '默认供应商'
      })
    }
  })
  return Array.from(map.values())
})
const filteredModels = computed(() => {
  if (!selectedProviderId.value) return availableModels.value
  return availableModels.value.filter((model) => providerIdOf(model) === selectedProviderId.value)
})
const contextSummaryText = computed(() => {
  const effectiveOptions = getEffectiveContextOptions()
  const names = []
  if (effectiveOptions.selectedText && selectionCount.value) names.push('选中文本')
  if (effectiveOptions.currentParagraph) names.push('当前段落')
  if (effectiveOptions.currentChapter) names.push('当前章节')
  if (effectiveOptions.previousSummary) names.push('上一章摘要')
  if (effectiveOptions.outline) names.push('本书大纲')
  if (effectiveOptions.relatedCharacters) names.push('相关角色')
  if (effectiveOptions.relatedWorldbuilding) names.push('世界设定')
  if (joinedContextItems.value.length) names.push(`${joinedContextItems.value.length} 条资料`)
  return names.length ? names.join(' + ') : '仅本次指令'
})
const suggestedActions = computed(() => buildSuggestions())
const emptyTimelineText = computed(() => {
  if (isDownloadedBook.value) return '等待分析指令。'
  if (isReferenceBook.value) return '等待整理指令。'
  return '等待你的指令。'
})
const consistencySummaryText = computed(() => {
  if (consistencyReadError.value) return '检查记录读取失败'
  const check = latestConsistencyCheck.value
  if (!check) return '尚未检查当前作品'
  const chapter = check.chapterName || chapterName.value || '当前章'
  return `${chapter}：${check.summary || '已有检查记录'}`
})
const consistencyHintText = computed(() => {
  if (consistencyReadError.value) return consistencyReadError.value
  const autoText = autoCheckGeneratedChapter.value
    ? '正文生成后会自动做规则检查。'
    : '正文生成后不会自动检查。'
  if (useLlmConsistencyCheck.value) {
    const modelText = selectedModel.value
      ? `会调用 ${selectedModelDisplayName.value || selectedModelName.value || '当前模型'} 做复核。`
      : 'AI 复核需要先选择文本模型。'
    return `${autoText}${modelText}`
  }
  return `${autoText}默认只读取作品资料做规则检查，不调用模型。`
})
const agentTaskProgressText = computed(() => {
  if (!props.bookName) return '未选择作品'
  if (agentTaskProgressStatus.value === 'connected') {
    return lastTaskProgressAt.value
      ? `实时更新 ${formatTime(lastTaskProgressAt.value)}`
      : '实时连接中'
  }
  if (agentTaskProgressStatus.value === 'connecting') return '正在连接实时进度'
  if (agentTaskProgressStatus.value === 'reconnecting') return '正在重连实时进度'
  if (agentTaskProgressStatus.value === 'unavailable')
    return agentTaskProgressError.value || '实时进度服务不可用'
  if (agentTaskProgressStatus.value === 'unsupported') return '当前环境不支持实时进度'
  if (agentTaskProgressError.value) return agentTaskProgressError.value
  return '实时进度未连接'
})
const agentTaskProgressUrlText = computed(() => {
  if (!agentTaskProgressUrl.value) return '等待连接'
  try {
    const url = new URL(agentTaskProgressUrl.value)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return agentTaskProgressUrl.value
  }
})
const agentTaskReconnectText = computed(() => {
  if (agentTaskProgressStatus.value !== 'reconnecting') return ''
  const attemptText = agentTaskReconnectAttempt.value
    ? `第 ${agentTaskReconnectAttempt.value} 次`
    : '准备'
  const timeText = nextAgentTaskReconnectAt.value
    ? `，下次 ${formatTime(nextAgentTaskReconnectAt.value)}`
    : ''
  return `${attemptText}重连${timeText}`
})
const agentTaskProgressNotice = computed(() => {
  const texts = []
  if (agentTaskServerInfo.value?.message) texts.push(agentTaskServerInfo.value.message)
  if (agentTaskProgressError.value) texts.push(`失败原因：${agentTaskProgressError.value}`)
  if (agentTaskLastCloseReason.value) texts.push(`断线信息：${agentTaskLastCloseReason.value}`)
  return texts.join('；')
})
const agentTaskProgressTitle = computed(() => {
  return [agentTaskProgressUrlText.value, agentTaskProgressNotice.value].filter(Boolean).join('；')
})
const isAgentTaskProgressLive = computed(() => agentTaskProgressStatus.value === 'connected')
const queueCountItems = computed(() => {
  const counts = queueStatus.value?.counts || {}
  return [
    { key: 'waiting', label: '等待', value: Number(counts.waiting || 0) },
    { key: 'active', label: '运行', value: Number(counts.active || 0) },
    { key: 'delayed', label: '延时', value: Number(counts.delayed || 0) },
    { key: 'completed', label: '完成', value: Number(counts.completed || 0) },
    { key: 'failed', label: '失败', value: Number(counts.failed || 0) },
    { key: 'paused', label: '暂停', value: Number(counts.paused || 0) }
  ]
})
const queueStatusText = computed(() => {
  if (isLoadingQueueStatus.value) return '正在读取 Redis 队列'
  if (queueStatusError.value) return '队列状态读取失败'
  if (!queueStatus.value) return '未读取'
  const running = Number(queueStatus.value.counts?.active || 0)
  const waiting =
    Number(queueStatus.value.counts?.waiting || 0) + Number(queueStatus.value.counts?.delayed || 0)
  return `运行 ${running} 个，等待 ${waiting} 个`
})
const queueWorkerText = computed(() => {
  if (!queueStatus.value) return 'worker 未知'
  if (queueStatus.value.workerStatusError)
    return `worker 状态读取失败：${queueStatus.value.workerStatusError}`
  const count = Number(queueStatus.value.workerCount || 0)
  if (count > 0) {
    return queueStatus.value.localWorkerRunning
      ? `本进程 worker ${count} 个`
      : `Redis 可见 worker ${count} 个`
  }
  return queueStatus.value.localWorkerRunning ? '本进程 worker 正在运行' : '未发现运行中的 worker'
})
const contextItems = computed(() => {
  const locked = isDownloadedBook.value && !isDownloadedBookParsed(props.bookMeta)
  return [
    { key: 'selectedText', label: '选中文本' },
    { key: 'currentParagraph', label: '当前段落' },
    { key: 'currentChapter', label: '当前章节' },
    { key: 'previousSummary', label: '上一章摘要' },
    { key: 'outline', label: '本书大纲' },
    { key: 'relatedCharacters', label: '相关角色', disabled: locked, reason: '完成整书解析后可用' },
    {
      key: 'relatedWorldbuilding',
      label: '世界设定',
      disabled: locked,
      reason: '完成整书解析后可用'
    },
    { key: 'assetWorkspace', label: '资产台资料', disabled: locked, reason: '完成整书解析后可用' }
  ]
})
const contextPresets = computed(() => {
  const locked = isDownloadedBook.value && !isDownloadedBookParsed(props.bookMeta)
  return [
    { key: 'light', label: '轻量', description: '选中文本 + 当前段落' },
    { key: 'standard', label: '标准', description: '当前章节 + 上一章摘要' },
    { key: 'full', label: '完整', description: '章节、大纲、角色和资产台资料', disabled: locked },
    { key: 'extract', label: '阅读分析', description: '仅当前章节文本' }
  ]
})
const capabilityGroups = computed(() => {
  return writingSkillGroups.value
    .map((group) => ({
      name: group.name || group.category || '写作',
      items: (Array.isArray(group.items) ? group.items : []).map((item) =>
        normalizeCapability(item, group.name || group.category || '写作')
      )
    }))
    .filter((group) => group.items.length)
})
const allCapabilities = computed(() =>
  capabilityGroups.value.flatMap((group) =>
    group.items.map((item) => ({ ...item, category: group.name }))
  )
)
const visibleCapabilityGroups = computed(() => {
  const keyword = capabilityKeyword.value.trim()
  if (!keyword) return capabilityGroups.value
  return capabilityGroups.value
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.label.includes(keyword) || item.instruction.includes(keyword)
      )
    }))
    .filter((group) => group.items.length)
})
const quickRecommendedCapabilities = computed(() => {
  return buildSuggestions().slice(0, 6)
})
const filteredSlashCapabilities = computed(() => {
  const keyword = commandInput.value.trim().replace(/^\//, '')
  return allCapabilities.value
    .filter(
      (item) => !keyword || item.label.includes(keyword) || item.instruction.includes(keyword)
    )
    .slice(0, 8)
})

watch(
  () => props.bookName,
  async () => {
    await initSession()
    connectAgentTaskProgressForCurrentBook()
    refreshContext()
  },
  { immediate: true }
)

watch(
  () => agentMode.value,
  () => {
    if (isDownloadedBook.value) applyContextPreset({ key: 'extract' }, false)
  },
  { immediate: true }
)

watch(
  () => props.referenceContextItems,
  (items) => {
    for (const item of items || []) addContextItem(item)
  },
  { deep: true }
)

onMounted(async () => {
  await loadWritingSkills()
  await loadModels()
  contextTimer = window.setInterval(refreshContext, 1400)
})

onBeforeUnmount(() => {
  if (contextTimer) window.clearInterval(contextTimer)
  disconnectAgentTaskProgress()
  stopActiveAgentStream()
})

async function initSession() {
  if (!props.bookName) return
  useLlmConsistencyCheck.value = readLocalJson(consistencyModeStorageKey(), false) === true
  autoCheckGeneratedChapter.value = readLocalJson(autoConsistencyStorageKey(), true) !== false
  const storedContext = readLocalJson(contextStorageKey(), null)
  if (storedContext?.options)
    contextOptions.value = { ...contextOptions.value, ...storedContext.options }
  if (storedContext?.preset) contextPreset.value = storedContext.preset
  if (storedContext?.items) joinedContextItems.value = storedContext.items
  const opened = await openEditorSession({
    bookId: props.bookName,
    mode: props.mode,
    selectedModelId: selectedModelId.value,
    contextOptions: contextOptions.value
  })
  sessionId.value = opened?.session?.id || `editor_session:${props.bookName}`
  const messages = await listAgentMessages(sessionId.value)
  timelineMessages.value = normalizeMessages(messages?.messages || [])
  await loadHistory()
  await loadLatestConsistencyCheck()
  restoreHistoryCards()
  scrollTimeline()
}

async function loadModels() {
  const response = await listModelBindings()
  availableModels.value = response.bindings
  const saved = localStorage.getItem(modelStorageKey())
  let successful = ''
  try {
    successful = await resolveRecentlySuccessfulModel()
    modelPreferenceReadError.value = ''
  } catch (error) {
    modelPreferenceReadError.value = error?.message || '读取模型偏好失败'
  }
  const nextModel =
    availableModels.value.find((item) => item.id === saved) ||
    availableModels.value.find((item) => item.id === successful) ||
    availableModels.value.find((item) =>
      /deepseek.*flash/i.test(
        `${item.providerDisplayName || ''} ${item.displayName || ''} ${item.modelName || ''}`
      )
    ) ||
    availableModels.value.find((item) => item.defaultFor === defaultModelTask()) ||
    availableModels.value[0] ||
    null
  selectedModelId.value = nextModel?.id || ''
  selectedProviderId.value = nextModel
    ? providerIdOf(nextModel)
    : providerOptions.value[0]?.id || ''
}

async function loadWritingSkills() {
  try {
    const response = await listWritingSkills()
    writingSkills.value = Array.isArray(response.skills)
      ? response.skills.map((skill) => normalizeCapability(skill, skill.category))
      : []
    writingSkillGroups.value = Array.isArray(response.groups)
      ? response.groups
          .map((group) => ({
            name: group.name || group.category || '写作',
            items: (Array.isArray(group.items) ? group.items : []).map((skill) =>
              normalizeCapability(skill, group.name || group.category || skill.category)
            )
          }))
          .filter((group) => group.items.length)
      : []
    writingSkillLoadError.value = ''
  } catch (error) {
    writingSkills.value = []
    writingSkillGroups.value = []
    writingSkillLoadError.value = `${error?.message || '读取 writing skill 失败'}。`
  }
}

async function resolveRecentlySuccessfulModel() {
  let directDefaults = null
  try {
    directDefaults = await getStoreValue('editorModelDefaults', null)
  } catch (error) {
    throw new Error(error?.message || '读取编辑器模型默认设置失败')
  }
  if (
    directDefaults != null &&
    (typeof directDefaults !== 'object' || Array.isArray(directDefaults))
  ) {
    throw new Error('读取编辑器模型默认设置失败：本地配置格式不正确')
  }
  const defaultId = directDefaults?.[defaultModelTask()] || directDefaults?.writing || ''
  if (defaultId) return defaultId
  let logs = []
  try {
    logs = await getStoreValue('stats:ai_logs', [])
  } catch (error) {
    throw new Error(error?.message || '读取最近成功模型失败')
  }
  if (!Array.isArray(logs)) {
    throw new Error('读取最近成功模型失败：本地日志格式不正确')
  }
  const rows = logs
  const latest = [...rows].reverse().find((item) => item?.success && item.providerId && item.model)
  return latest ? `${latest.providerId}::${latest.model}` : ''
}

async function handleProviderChange(providerId) {
  const firstModel = availableModels.value.find((model) => providerIdOf(model) === providerId)
  selectedModelId.value = firstModel?.id || ''
  if (!selectedModelId.value) return
  try {
    await persistSelectedModel()
  } catch (error) {
    ElMessage.error(error?.message || '保存模型偏好失败')
  }
}

async function handleModelSelectionChange() {
  try {
    await persistSelectedModel()
  } catch (error) {
    ElMessage.error(error?.message || '保存模型偏好失败')
  }
}

async function persistSelectedModel() {
  const model = selectedModel.value
  if (model) selectedProviderId.value = providerIdOf(model)
  try {
    localStorage.setItem(modelStorageKey(), selectedModelId.value || '')
    await updateModelDefaults({ task: defaultModelTask(), modelId: selectedModelId.value })
    modelPreferenceWriteError.value = ''
  } catch (error) {
    modelPreferenceWriteError.value = error?.message || '保存模型偏好失败'
    throw error
  }
  lastError.value = ''
  lastErrorDetail.value = ''
}

async function persistContextOptions() {
  if (isDownloadedBook.value && !isDownloadedBookParsed(props.bookMeta)) {
    contextOptions.value.relatedCharacters = false
    contextOptions.value.relatedWorldbuilding = false
    contextOptions.value.assetWorkspace = false
  }
  try {
    localStorage.setItem(
      contextStorageKey(),
      JSON.stringify({
        preset: contextPreset.value,
        options: contextOptions.value,
        items: joinedContextItems.value
      })
    )
    if (sessionId.value) await updateEditorSessionContext(sessionId.value, contextOptions.value)
    contextPreferenceWriteError.value = ''
  } catch (error) {
    contextPreferenceWriteError.value = error?.message || '保存上下文设置失败'
    ElMessage.error(contextPreferenceWriteError.value)
    throw error
  }
}

async function handleContextOptionChange() {
  try {
    await persistContextOptions()
  } catch {
    // persistContextOptions 已经给出界面提示。
  }
}

async function handleContextPresetClick(preset) {
  try {
    await applyContextPreset(preset)
  } catch {
    // persistContextOptions 已经给出界面提示。
  }
}

async function applyContextPreset(preset, shouldPersist = true) {
  if (preset.disabled) return
  contextPreset.value = preset.key
  const map = {
    light: {
      selectedText: true,
      currentParagraph: true,
      currentChapter: false,
      previousSummary: false,
      outline: false,
      relatedCharacters: false,
      relatedWorldbuilding: false,
      assetWorkspace: false
    },
    standard: {
      selectedText: Boolean(currentContext.value?.selectedText),
      currentParagraph: false,
      currentChapter: true,
      previousSummary: true,
      outline: false,
      relatedCharacters: false,
      relatedWorldbuilding: false,
      assetWorkspace: false
    },
    full: {
      selectedText: Boolean(currentContext.value?.selectedText),
      currentParagraph: false,
      currentChapter: true,
      previousSummary: true,
      outline: true,
      relatedCharacters: true,
      relatedWorldbuilding: true,
      assetWorkspace: true
    },
    extract: {
      selectedText: false,
      currentParagraph: false,
      currentChapter: true,
      previousSummary: false,
      outline: false,
      relatedCharacters: false,
      relatedWorldbuilding: false,
      assetWorkspace: false
    }
  }
  contextOptions.value = { ...contextOptions.value, ...(map[preset.key] || map.standard) }
  if (shouldPersist) await persistContextOptions()
}

function refreshContext() {
  const next = props.getEditorContext?.()
  currentContext.value = next && typeof next === 'object' ? next : {}
  if (currentContext.value?.selectedText) {
    contextOptions.value.selectedText = true
    commandScope.value = 'selected_text'
  }
}

function fillSuggestion(item) {
  const capability = normalizeCapability(item, item.category)
  commandInput.value = capability.instruction
  commandScope.value = item.scope || commandScope.value
  preparedTask.value = taskFromCapability(capability)
  if (!selectedModel.value) {
    promptMissingModel()
    return
  }
  ElMessage.success('已填入输入框，可修改后发送')
}

function handleCommandInput(value) {
  slashPanelVisible.value = String(value || '')
    .trim()
    .startsWith('/')
  if (!String(value || '').trim()) preparedTask.value = null
}

function selectCapability(item) {
  const capability = normalizeCapability(item, item.category)
  commandInput.value = capability.instruction
  if (capability.requireSelection) commandScope.value = 'selected_text'
  preparedTask.value = taskFromCapability(capability)
  slashPanelVisible.value = false
  capabilityPanelVisible.value = false
}

function fillCommand(instruction, scope = '') {
  commandInput.value = String(instruction || '')
  if (scope) commandScope.value = scope
  preparedTask.value = null
  slashPanelVisible.value = false
  capabilityPanelVisible.value = false
}

function handleConsistencyModeChange(value) {
  localStorage.setItem(consistencyModeStorageKey(), JSON.stringify(Boolean(value)))
  if (value && !selectedModel.value) {
    modelPanelVisible.value = true
    ElMessage.warning('AI 复核需要先选择文本模型')
  }
}

function persistAutoCheckGeneratedChapter() {
  localStorage.setItem(
    autoConsistencyStorageKey(),
    JSON.stringify(Boolean(autoCheckGeneratedChapter.value))
  )
}

async function runChapterConsistencyCheck() {
  refreshContext()
  const ctx = currentContext.value || {}
  const text = String(ctx.content || '').trim()
  if (!props.bookName) {
    ElMessage.warning('请先打开作品')
    return
  }
  if (!ctx.chapterName && !ctx.title) {
    ElMessage.warning('请先打开章节')
    return
  }
  if (!text) {
    ElMessage.warning('当前章节正文为空')
    return
  }
  if (useLlmConsistencyCheck.value && !selectedModel.value) {
    modelPanelVisible.value = true
    ElMessage.warning('AI 复核需要先选择文本模型')
    return
  }

  const checkId = createConsistencyCheckId()
  const payload = buildConsistencyCheckPayload({
    id: checkId,
    ctx,
    text,
    useLlm: useLlmConsistencyCheck.value,
    source: 'manual_current_chapter'
  })

  const stepId = addOrUpdateTimelineMessage({
    id: `tool:${checkId}`,
    kind: 'tool_call',
    role: 'tool',
    title: '正在检查一致性',
    content: useLlmConsistencyCheck.value
      ? '已提交规则检查和 AI 复核，等待真实结果。'
      : '已提交规则检查，正在读取作品资料。'
  })

  isConsistencyChecking.value = true
  try {
    const response = await runConsistencyCheck(payload)
    const check = normalizeConsistencyResponse(response, payload, checkId)
    latestConsistencyCheck.value = check
    consistencyReadError.value = ''
    updateTimelineMessage(stepId, { content: '一致性检查完成，结果已保存。' })
    addConsistencyResultCard(check)
    ElMessage.success(check.summary || '一致性检查完成')
  } catch (error) {
    lastError.value = error?.message || '一致性检查失败'
    lastErrorDetail.value = errorDetailText(error)
    updateTimelineMessage(stepId, { content: '一致性检查失败，已写入错误卡。' })
    upsertErrorCard({
      taskId: checkId,
      title: '一致性检查失败',
      content: error?.message || '一致性检查失败',
      detail: lastErrorDetail.value
    })
  } finally {
    isConsistencyChecking.value = false
  }
}

async function maybeRunGeneratedConsistencyCheck(task = {}, payload = {}, generation = {}) {
  if (!autoCheckGeneratedChapter.value) return null
  if (!canWriteChapter.value) return null
  if (!shouldCheckGeneratedChapter(task, payload, generation)) return null
  const text = String(generation.result || '').trim()
  if (!text) return null

  const ctx = currentContext.value || {}
  const checkId = createConsistencyCheckId()
  const checkPayload = buildConsistencyCheckPayload({
    id: checkId,
    ctx,
    text,
    useLlm: false,
    source: 'generated_chapter',
    generationId: generation.id || '',
    taskType: generation.type || payload.type || task.type || ''
  })
  const stepId = addOrUpdateTimelineMessage({
    id: `tool:${checkId}`,
    kind: 'tool_call',
    role: 'tool',
    title: '正在检查生成正文',
    content: '已提交生成正文的规则检查，正在读取作品资料。'
  })

  isConsistencyChecking.value = true
  try {
    const response = await runConsistencyCheck(checkPayload)
    const check = normalizeConsistencyResponse(response, checkPayload, checkId)
    latestConsistencyCheck.value = check
    consistencyReadError.value = ''
    updateTimelineMessage(stepId, { content: '生成正文检查完成，结果已保存。' })
    addConsistencyResultCard(check)
    if (Array.isArray(check.issues) && check.issues.length) {
      ElMessage.warning(check.summary || '生成正文存在可能矛盾')
    }
    return check
  } catch (error) {
    updateTimelineMessage(stepId, { content: '生成正文检查失败，已写入错误卡。' })
    upsertErrorCard({
      taskId: checkId,
      title: '生成正文检查失败',
      content: error?.message || '生成正文检查失败',
      detail: errorDetailText(error)
    })
    return null
  } finally {
    isConsistencyChecking.value = false
  }
}

async function maybeRunAppliedChapterConsistencyCheck(message = {}, action = '', applied = {}) {
  if (!autoCheckGeneratedChapter.value) return null
  if (!canWriteChapter.value) return null
  if (!['insert', 'replace', 'append', 'replace_chapter'].includes(action)) return null
  if (applied?.success !== true) return null

  const ctx =
    applied.context && typeof applied.context === 'object'
      ? applied.context
      : currentContext.value || {}
  const text = String(applied.text || ctx.content || '').trim()
  if (!text) return null

  const checkId = createConsistencyCheckId()
  const checkPayload = buildConsistencyCheckPayload({
    id: checkId,
    ctx,
    text,
    useLlm: false,
    source: 'applied_current_chapter',
    generationId: generationIdOf(message),
    taskType: message.type || '',
    applyAction: action
  })
  const stepId = addOrUpdateTimelineMessage({
    id: `tool:${checkId}`,
    kind: 'tool_call',
    role: 'tool',
    title: '正在检查应用后整章',
    content: 'AI 结果已写入正文，正在检查最新整章。'
  })

  isConsistencyChecking.value = true
  try {
    const response = await runConsistencyCheck(checkPayload)
    const check = normalizeConsistencyResponse(response, checkPayload, checkId)
    latestConsistencyCheck.value = check
    consistencyReadError.value = ''
    updateTimelineMessage(stepId, { content: '应用后整章检查完成，结果已保存。' })
    addConsistencyResultCard(check)
    if (Array.isArray(check.issues) && check.issues.length) {
      ElMessage.warning(check.summary || '应用后整章存在可能矛盾')
      await maybeRepairAppliedConsistencyIssues(message, action, applied, check)
    }
    return check
  } catch (error) {
    updateTimelineMessage(stepId, { content: '应用后整章检查失败，已写入错误卡。' })
    upsertErrorCard({
      taskId: checkId,
      title: '应用后整章检查失败',
      content: error?.message || '应用后整章检查失败',
      detail: errorDetailText(error)
    })
    return null
  } finally {
    isConsistencyChecking.value = false
  }
}

function buildConsistencyCheckPayload({
  id,
  ctx = {},
  text = '',
  useLlm = false,
  source = '',
  generationId = '',
  taskType = '',
  applyAction = ''
}) {
  return {
    id,
    bookName: props.bookName,
    bookId: props.bookName,
    volumeName: ctx.volumeName || '',
    chapterName: ctx.chapterName || ctx.title || chapterName.value,
    chapterId: ctx.path || ctx.chapterName || chapterName.value,
    text,
    source,
    generationId,
    taskType,
    applyAction,
    useLlm,
    skipLlm: !useLlm,
    providerId: useLlm ? providerIdOf(selectedModel.value) : '',
    modelId: useLlm ? selectedModelId.value : '',
    modelName: useLlm ? selectedModelName.value : '',
    modelDisplayName: useLlm ? selectedModelDisplayName.value : ''
  }
}

function normalizeConsistencyResponse(response = {}, payload = {}, checkId = '') {
  const check = response?.check
  if (!check || typeof check !== 'object' || Array.isArray(check) || !Array.isArray(check.issues)) {
    throw new Error('一致性检查失败：接口返回格式不正确')
  }
  return {
    ...check,
    id: check.id || checkId || payload.id,
    createdAt: check.createdAt || new Date().toISOString(),
    bookName: check.bookName || props.bookName,
    volumeName: check.volumeName || payload.volumeName,
    chapterName: check.chapterName || payload.chapterName,
    source: check.source || payload.source || '',
    generationId: check.generationId || payload.generationId || '',
    taskType: check.taskType || payload.taskType || '',
    applyAction: check.applyAction || payload.applyAction || '',
    summary: check.summary || ''
  }
}

function createConsistencyCheckId() {
  return `consistency_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function shouldCheckGeneratedChapter(task = {}, payload = {}, generation = {}) {
  const type = String(generation.type || payload.type || task.type || '')
  const key = String(task.key || '')
  const title = String(generation.title || payload.title || task.label || '')
  if (isPromptLikeTask(type)) return false
  if (isAssetOnlyType(type)) return false
  if (['continue', 'polish', 'rewrite', 'expand', 'dialogue_enhance'].includes(type)) return true
  if (['continue', 'polish', 'rewrite', 'expand', 'dialogue'].includes(key)) return true
  return ['续写', '润色', '改写', '扩写', '对话增强'].some((label) => title.includes(label))
}

function isAssetOnlyType(type = '') {
  return [
    'golden_three_chapters',
    'worldbuilding_start',
    'protagonist_setup',
    'cheat_ability',
    'book_outline',
    'timeline',
    'relationship',
    'character_card',
    'worldbuilding_card',
    'setting_conflict_check',
    'rhythm_check',
    'summarize',
    'extract_character',
    'extract_worldbuilding',
    'extract_foreshadowing',
    'extract_hook',
    'extract_style',
    'idea_card',
    'material_card',
    'asset_draft'
  ].includes(type)
}

async function loadLatestConsistencyCheck() {
  if (!props.bookName) return
  try {
    const response = await listConsistencyChecks({
      bookName: props.bookName,
      bookId: props.bookName
    })
    const checks = response.checks
    latestConsistencyCheck.value = checks[0] || null
    consistencyReadError.value = ''
  } catch (error) {
    latestConsistencyCheck.value = null
    consistencyReadError.value = error?.message || '读取一致性检查记录失败'
  }
}

async function loadConsistencyHistory() {
  if (!props.bookName) {
    ElMessage.warning('请先打开作品')
    return
  }
  try {
    const response = await listConsistencyChecks({
      bookName: props.bookName,
      bookId: props.bookName
    })
    const checks = response.checks
    latestConsistencyCheck.value = checks[0] || null
    consistencyReadError.value = ''
    if (!checks.length) {
      ElMessage.info('暂无检查记录')
      return
    }
    addConsistencyResultCard(checks[0])
    ElMessage.success('已读取最近检查')
  } catch (error) {
    consistencyReadError.value = error?.message || '读取一致性检查记录失败'
    ElMessage.error(error?.message || '读取一致性检查记录失败')
  }
}

function addConsistencyResultCard(check = {}) {
  const id = `consistency:${check.id || Date.now()}`
  addOrUpdateTimelineMessage({
    id,
    kind: 'consistency_card',
    role: 'assistant',
    title: '一致性检查',
    content: check.summary || '',
    summary: check.summary || '',
    chapterName: check.chapterName || '',
    volumeName: check.volumeName || '',
    issues: Array.isArray(check.issues) ? check.issues : [],
    llmChecked: Boolean(check.llmChecked),
    llmMessage: check.llmMessage || '',
    providerId: check.providerId || '',
    model: check.model || '',
    usage: check.usage || {},
    source: check.source || '',
    generationId: check.generationId || '',
    taskType: check.taskType || '',
    applyAction: check.applyAction || '',
    checkId: check.id || '',
    createdAt: check.createdAt || new Date().toISOString()
  })
}

function mediumOrHighConsistencyIssues(check = {}) {
  const levels = new Set(['medium', 'high'])
  return (Array.isArray(check.issues) ? check.issues : []).filter((issue) =>
    levels.has(String(issue?.severity || 'medium').toLowerCase())
  )
}

function shouldRepairAppliedConsistencyIssues(message = {}, check = {}) {
  if (!canWriteChapter.value) return false
  if (!selectedModel.value) return false
  if (check.source !== 'applied_current_chapter') return false
  if (!generationIdOf(message)) return false
  return mediumOrHighConsistencyIssues(check).length > 0
}

async function maybeRepairAppliedConsistencyIssues(
  message = {},
  action = '',
  applied = {},
  check = {}
) {
  if (!shouldRepairAppliedConsistencyIssues(message, check)) return null
  const issues = mediumOrHighConsistencyIssues(check)
  const repairId = `repair:${check.id || generationIdOf(message)}`
  const stepMessageId = addOrUpdateTimelineMessage({
    id: `tool:${repairId}`,
    kind: 'tool_call',
    role: 'tool',
    title: executionMode.value === 'queue_write' ? '正在提交返修队列' : '正在返修一致性问题',
    content:
      executionMode.value === 'queue_write'
        ? `发现 ${issues.length} 个中高风险问题，正在写入真实返修队列。`
        : `发现 ${issues.length} 个中高风险问题，已提交 Writer 返修和 Editor 复核。`
  })
  const streamChannel = createAgentStreamChannel(repairId)

  isGenerating.value = true
  isCancellingGeneration.value = false
  activeStreamChannel.value = executionMode.value === 'queue_write' ? '' : streamChannel
  activeTaskId.value = ''
  if (executionMode.value !== 'queue_write') bindAgentStream(streamChannel, stepMessageId)
  try {
    refreshContext()
    const ctx = currentContext.value || {}
    const payload = {
      bookId: props.bookName,
      bookName: props.bookName,
      chapterId: chapterName.value,
      sessionId: sessionId.value,
      sourceGenerationId: generationIdOf(message),
      checkId: check.id || check.checkId || '',
      checkSummary: check.summary || '',
      issues,
      applyAction: action,
      modelId: selectedModelId.value,
      providerId: providerIdOf(selectedModel.value),
      model: selectedModelName.value,
      modelName: selectedModelName.value,
      modelDisplayName: selectedModelDisplayName.value,
      agentMode: agentMode.value,
      type: message.type || check.taskType || 'repair',
      skillId: message.skillId || '',
      skillKey: message.skillKey || '',
      outputMode: message.outputMode || 'preview',
      canWriteChapter: message.canWriteChapter === true,
      inputScopes: Array.isArray(message.inputScopes) ? message.inputScopes : [],
      requiredContext: Array.isArray(message.requiredContext) ? message.requiredContext : [],
      references: Array.isArray(message.references) ? message.references : [],
      title: `${message.title || 'AI 结果'}返修`,
      instruction: message.prompt || '请根据一致性检查结果返修正文。',
      sourceResult: message.content || message.result || '',
      currentChapterText: String(applied?.text || ctx.content || '').trim(),
      volumeName: ctx.volumeName || '',
      chapterName: ctx.chapterName || ctx.title || chapterName.value,
      targetWords: Number(ctx.targetWords || 0) || undefined,
      contextText: buildContextText(),
      contextSnapshot: buildContextSnapshot(),
      streamChannel,
      attempts: normalizedQueueAttempts(),
      backoffDelayMs: normalizedQueueBackoffDelayMs()
    }
    if (executionMode.value === 'queue_write') {
      const response = await enqueueAgentRepairTask(payload)
      updateTimelineMessage(stepMessageId, {
        title: '返修队列已接收',
        content: [
          `任务 ID：${response.taskId || '未返回'}`,
          `队列任务：${response.queueName || '默认队列'} / ${response.jobId || '未返回'}`,
          `重试：最多 ${payload.attempts} 次，等待 ${payload.backoffDelayMs}ms 起`,
          `问题数：${issues.length}`
        ].join('\n'),
        status: 'queued'
      })
      if (response.taskId) {
        agentTaskHistory.value = upsertAgentTaskProgressItem(agentTaskHistory.value, {
          id: response.taskId,
          bookName: response.bookName || props.bookName,
          bookId: response.bookName || props.bookName,
          chapterId: response.chapterName || payload.chapterName,
          generationId: generationIdOf(message),
          sourceGenerationId: generationIdOf(message),
          title: `队列返修 ${response.chapterName || payload.chapterName}`,
          type: 'cli_repair_queue',
          agentMode: 'repairing',
          modelId: payload.modelId,
          queueName: response.queueName || '',
          jobId: response.jobId || '',
          skillId: payload.skillId,
          skillKey: payload.skillKey,
          outputMode: payload.outputMode,
          canWriteChapter: payload.canWriteChapter,
          inputScopes: payload.inputScopes,
          requiredContext: payload.requiredContext,
          references: payload.references,
          executionMode: 'preview',
          status: response.status || 'queued',
          events: [
            {
              type: 'queue_queued',
              title: '队列已接收',
              status: response.status || 'queued',
              content: '返修任务已写入 Redis 队列，等待 BullMQ worker 执行。',
              queueName: response.queueName || '',
              jobId: response.jobId || ''
            }
          ]
        }).slice(0, 80)
      }
      await loadQueueStatus()
      ElMessage.success('返修任务已提交队列')
      return response
    }
    const response = await repairAgentResult(payload)
    const generation = response.generation || {}
    const resultIssue = generationResultIssue(
      { type: payload.type, label: payload.title, instruction: payload.instruction },
      payload,
      generation
    )
    if (resultIssue) throw new Error(resultIssue)
    replaceTimelineMessageWithSteps(stepMessageId, generation.agentSteps)
    addResultCard(
      {
        label: payload.title,
        type: payload.type,
        instruction: payload.instruction,
        skillId: payload.skillId,
        skillKey: payload.skillKey,
        outputMode: payload.outputMode,
        canWriteChapter: payload.canWriteChapter,
        inputScopes: payload.inputScopes,
        requiredContext: payload.requiredContext,
        references: payload.references
      },
      payload,
      generation
    )
    await appendMessage(
      'assistant',
      payload.title,
      generation.result || '',
      'result_card',
      resultCardMessageMeta(
        {
          type: payload.type,
          instruction: payload.instruction,
          skillId: payload.skillId,
          skillKey: payload.skillKey,
          outputMode: payload.outputMode,
          canWriteChapter: payload.canWriteChapter,
          inputScopes: payload.inputScopes,
          requiredContext: payload.requiredContext,
          references: payload.references
        },
        payload,
        generation
      )
    )
    await loadHistory()
    ElMessage.success('已生成返修结果卡，正文尚未修改')
    return generation
  } catch (error) {
    if (isGenerationCancelledError(error)) {
      updateTimelineMessage(stepMessageId, {
        content: '生成已停止。',
        streamStatus: 'cancelled',
        streaming: false
      })
      ElMessage.info('生成已停止')
      return null
    }
    updateTimelineMessage(stepMessageId, { content: '返修失败，已写入错误卡。' })
    upsertErrorCard({
      taskId: repairId,
      title: '返修失败',
      content: errorReasonText(error),
      detail: errorDetailText(error)
    })
    ElMessage.error(error?.message || '返修失败')
    return null
  } finally {
    stopActiveAgentStream()
    activeStreamChannel.value = ''
    activeTaskId.value = ''
    isCancellingGeneration.value = false
    isGenerating.value = false
  }
}

async function runCommand() {
  const instruction = commandInput.value.trim()
  if (!instruction || instruction === '/') {
    ElMessage.warning('请输入要交给 Agent 的指令')
    return
  }
  const prepared = preparedTask.value
  const task = {
    key: prepared?.key || inferCapabilityKey(instruction),
    label: prepared?.label || labelFromInstruction(instruction),
    type: prepared?.type || inferGenerationType(instruction),
    instruction,
    skillId: prepared?.skillId || '',
    skillKey: prepared?.skillKey || prepared?.key || '',
    outputMode: prepared?.outputMode || 'preview',
    canWriteChapter: prepared?.canWriteChapter === true,
    inputScopes: Array.isArray(prepared?.inputScopes) ? prepared.inputScopes : [],
    requiredContext: Array.isArray(prepared?.requiredContext) ? prepared.requiredContext : [],
    references: Array.isArray(prepared?.references) ? prepared.references : []
  }
  if (executionMode.value === 'queue_write') {
    await runQueuedWrite(task)
    return
  }
  await runGeneration(task)
}

async function runQueuedWrite(task) {
  if (!selectedModel.value) {
    lastTask.value = task
    promptMissingModel()
    return
  }
  if (!canWriteChapter.value) {
    ElMessage.warning('当前模式不允许提交正文写作队列')
    return
  }
  if (task.skillId && (task.outputMode !== 'chapter_write' || task.canWriteChapter !== true)) {
    ElMessage.warning(`${task.label || '当前 skill'} 不能提交正文写作队列`)
    return
  }
  refreshContext()
  const ctx = currentContext.value || {}
  if (!props.bookName) {
    ElMessage.warning('请先打开作品')
    return
  }
  if (!ctx.chapterName && !ctx.title) {
    ElMessage.warning('请先打开章节')
    return
  }

  const taskRunId = stableTaskId({ ...task, key: `queue_${task.key || task.type || task.label}` })
  const prompt = [
    buildInstruction(task.instruction),
    '请按当前章节上下文写成可直接写入正文的完整内容。',
    buildContextText()
  ]
    .filter(Boolean)
    .join('\n\n')
  const payload = {
    bookName: props.bookName,
    bookId: props.bookName,
    volumeName: ctx.volumeName || '',
    chapterName: ctx.chapterName || ctx.title || chapterName.value,
    chapterId: ctx.path || ctx.chapterName || chapterName.value,
    prompt,
    instruction: prompt,
    skillId: task.skillId || '',
    skillKey: task.skillKey || task.key || '',
    outputMode: task.outputMode || 'chapter_write',
    canWriteChapter: task.canWriteChapter === true,
    inputScopes: Array.isArray(task.inputScopes) ? task.inputScopes : [],
    requiredContext: Array.isArray(task.requiredContext) ? task.requiredContext : [],
    references: Array.isArray(task.references) ? task.references : [],
    targetWords: Number(ctx.targetWords || task.targetWords || 2000),
    autoEdit: true,
    modelId: selectedModelId.value,
    providerId: providerIdOf(selectedModel.value),
    model: selectedModelName.value,
    modelName: selectedModelName.value,
    attempts: normalizedQueueAttempts(),
    backoffDelayMs: normalizedQueueBackoffDelayMs(),
    contextSnapshot: buildContextSnapshot()
  }

  isQueueSubmitting.value = true
  lastTask.value = task
  lastError.value = ''
  lastErrorDetail.value = ''
  addOrUpdateTimelineMessage({
    id: `user:${taskRunId}`,
    kind: 'user_message',
    role: 'user',
    title: task.label,
    content: task.instruction
  })
  const stepMessageId = addOrUpdateTimelineMessage({
    id: `tool:${taskRunId}`,
    kind: 'tool_call',
    role: 'tool',
    title: '正在提交写作队列',
    content: '正在把任务写入 Redis 队列。'
  })

  try {
    await appendMessage('user', task.label, task.instruction)
    const response = await enqueueAgentWriteTask(payload)
    updateTimelineMessage(stepMessageId, {
      title: '队列已接收',
      content: [
        `任务 ID：${response.taskId || '未返回'}`,
        `队列任务：${response.queueName || '默认队列'} / ${response.jobId || '未返回'}`,
        `重试：最多 ${payload.attempts} 次，等待 ${payload.backoffDelayMs}ms 起`,
        `章节：${response.chapterName || payload.chapterName}`
      ].join('\n'),
      status: 'queued'
    })
    if (response.taskId) {
      agentTaskHistory.value = upsertAgentTaskProgressItem(agentTaskHistory.value, {
        id: response.taskId,
        bookName: response.bookName || props.bookName,
        bookId: response.bookName || props.bookName,
        chapterId: response.chapterName || payload.chapterName,
        title: `队列写作 ${response.chapterName || payload.chapterName}`,
        type: 'cli_write_queue',
        agentMode: payload.autoEdit ? 'auto_edit' : 'writing',
        modelId: payload.modelId,
        queueName: response.queueName || '',
        jobId: response.jobId || '',
        skillId: payload.skillId,
        skillKey: payload.skillKey,
        outputMode: payload.outputMode,
        canWriteChapter: payload.canWriteChapter,
        inputScopes: payload.inputScopes,
        requiredContext: payload.requiredContext,
        references: payload.references,
        status: response.status || 'queued',
        events: [
          {
            type: 'queue_queued',
            title: '队列已接收',
            status: response.status || 'queued',
            content: '任务已写入 Redis 队列，等待 BullMQ worker 执行。',
            createdAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).slice(0, 80)
    }
    await loadHistory()
    commandInput.value = ''
    preparedTask.value = null
    slashPanelVisible.value = false
    ElMessage.success('写作任务已提交队列')
  } catch (error) {
    lastError.value = error?.message || '提交写作队列失败'
    lastErrorDetail.value = errorDetailText(error)
    updateTimelineMessage(stepMessageId, { content: '提交写作队列失败，已写入错误卡。' })
    upsertErrorCard({
      taskId: taskRunId,
      title: '提交队列失败',
      content: errorReasonText(error),
      detail: lastErrorDetail.value
    })
    ElMessage.error(error?.message || '提交写作队列失败')
  } finally {
    isQueueSubmitting.value = false
  }
}

async function runGeneration(task) {
  if (!selectedModel.value) {
    lastTask.value = task
    promptMissingModel()
    return
  }
  refreshContext()
  const contextText = buildContextText()
  if (!contextText.trim() && !canRunWithoutChapterText(task)) {
    ElMessage.warning('当前没有可处理的文本')
    return
  }
  lastTask.value = task
  lastError.value = ''
  lastErrorDetail.value = ''
  const effectiveOptions = getEffectiveContextOptions()
  const taskRunId = stableTaskId(task)
  const streamChannel = createAgentStreamChannel(taskRunId)
  const payload = {
    bookId: props.bookName,
    chapterId: chapterName.value,
    sessionId: sessionId.value,
    modelId: selectedModelId.value,
    modelName: selectedModelName.value,
    modelDisplayName: selectedModelDisplayName.value,
    agentMode: agentMode.value,
    type: task.type || 'custom',
    title: task.label,
    instruction: buildInstruction(task.instruction),
    skillId: task.skillId || '',
    skillKey: task.skillKey || task.key || '',
    outputMode: task.outputMode || 'preview',
    canWriteChapter: task.canWriteChapter === true,
    inputScopes: Array.isArray(task.inputScopes) ? task.inputScopes : [],
    requiredContext: Array.isArray(task.requiredContext) ? task.requiredContext : [],
    references: Array.isArray(task.references) ? task.references : [],
    scope: commandScope.value,
    executionMode: executionMode.value,
    selectedText: currentContext.value?.selectedText || '',
    contextOptions: { ...effectiveOptions },
    contextSnapshot: buildContextSnapshot(),
    contextText,
    streamChannel
  }
  isGenerating.value = true
  isCancellingGeneration.value = false
  activeStreamChannel.value = streamChannel
  activeTaskId.value = ''
  addOrUpdateTimelineMessage({
    id: `user:${taskRunId}`,
    kind: 'user_message',
    role: 'user',
    title: task.label,
    content: task.instruction
  })
  const stepMessageId = addOrUpdateTimelineMessage({
    id: `tool:${taskRunId}`,
    kind: 'tool_call',
    role: 'tool',
    title: '正在执行生成与审核',
    content: `${task.label} 已提交，等待 Writer 和 Editor 返回结果。`
  })
  bindAgentStream(streamChannel, stepMessageId)
  try {
    await appendMessage('user', task.label, task.instruction)
    const response = await generateAgentPreview(await prepareSkillPayloadForGeneration(payload))
    const generation = response.generation || {}
    const resultIssue = generationResultIssue(task, payload, generation)
    if (resultIssue) throw new Error(resultIssue)
    replaceTimelineMessageWithSteps(stepMessageId, generation.agentSteps)
    addResultCard(task, payload, generation)
    await appendMessage(
      'assistant',
      task.label,
      generation.result || '',
      'result_card',
      resultCardMessageMeta(task, payload, generation)
    )
    await maybeRunGeneratedConsistencyCheck(task, payload, generation)
    await loadHistory()
    commandInput.value = ''
    preparedTask.value = null
    slashPanelVisible.value = false
    if (executionMode.value !== 'preview') {
      await maybeApplyGenerated(generation, executionMode.value)
    } else {
      ElMessage.success('已生成结果卡，正文尚未修改')
    }
  } catch (error) {
    if (isGenerationCancelledError(error)) {
      lastError.value = ''
      lastErrorDetail.value = ''
      updateTimelineMessage(stepMessageId, {
        content: '生成已停止。',
        streamStatus: 'cancelled',
        streaming: false
      })
      ElMessage.info('生成已停止')
      return
    }
    lastError.value = error?.message || '模型请求失败'
    lastErrorDetail.value = errorDetailText(error)
    upsertErrorCard({
      taskId: taskRunId,
      title: '生成失败',
      content: errorReasonText(error),
      detail: lastErrorDetail.value
    })
  } finally {
    if (timelineMessages.value.some((message) => message.id === stepMessageId)) {
      const message = timelineMessages.value.find((item) => item.id === stepMessageId)
      if (message?.streamStatus !== 'cancelled') {
        updateTimelineMessage(stepMessageId, {
          content: lastError.value ? '生成失败，已写入错误卡。' : '结果卡已生成，等待用户确认。'
        })
      }
    }
    stopActiveAgentStream()
    activeStreamChannel.value = ''
    activeTaskId.value = ''
    isCancellingGeneration.value = false
    isGenerating.value = false
  }
}

function createAgentStreamChannel(seed = '') {
  const random = Math.random().toString(16).slice(2)
  const cleanSeed =
    String(seed || 'task')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 48) || 'task'
  return `editor-agent-stream:${Date.now()}_${random}_${cleanSeed}`
}

function stopActiveAgentStream() {
  activeStreamMessageId = ''
}

function bindAgentStream(channel, messageId) {
  stopActiveAgentStream()
  if (!channel || !messageId) return
  activeStreamMessageId = messageId
}

function handleAgentStreamMessage(payload = {}) {
  if (!activeStreamMessageId || !isGenerating.value) return
  const task = payload.task || {}
  const event = payload.event || {}
  if (payload.type !== 'agent_task_updated') return
  if (
    props.bookName &&
    ![payload.bookName, payload.bookId, task.bookName, task.bookId].includes(props.bookName)
  ) {
    return
  }
  if (chapterName.value && task.chapterId && task.chapterId !== chapterName.value) return
  if (activeTaskId.value && task.id && task.id !== activeTaskId.value) return
  if (!['writer_stream', 'task_cancelled'].includes(event.type)) return

  if (task.id) activeTaskId.value = task.id
  if (event.status === 'cancelled' || task.status === 'cancelled') {
    updateTimelineMessage(activeStreamMessageId, {
      title: event.title || '任务已停止',
      content: event.content || '生成已停止。',
      streaming: false,
      streamStatus: 'cancelled',
      chunkCount: event.chunkCount || 0,
      wordCount: event.wordCount || 0
    })
    return
  }

  const text = String(event.fullText || event.content || '').trim()
  const preview = text.length > 360 ? text.slice(-360) : text
  updateTimelineMessage(activeStreamMessageId, {
    title: event.title || 'Writer 流式写作',
    content: preview
      ? `${preview}${event.status === 'done' ? '' : '\n\n正在接收真实输出片段...'}`
      : '正在等待模型返回第一段内容。',
    streaming: event.status !== 'done',
    streamStatus: event.status || 'running',
    chunkCount: event.chunkCount || 0,
    wordCount: event.wordCount || countWords(text)
  })
}

async function cancelActiveGeneration() {
  const streamChannel = activeStreamChannel.value
  const taskId = activeTaskId.value
  if (!streamChannel && !taskId) {
    ElMessage.warning('没有正在生成的任务')
    return
  }
  isCancellingGeneration.value = true
  try {
    await cancelAgentGeneration({ streamChannel, taskId })
  } catch (error) {
    isCancellingGeneration.value = false
    ElMessage.error(error?.message || '停止生成失败')
  }
}

async function cancelQueuedTask(task = {}) {
  if (!task.jobId) {
    ElMessage.warning('缺少队列任务 ID')
    return
  }
  cancellingQueueJobId.value = task.jobId
  try {
    const result = await cancelAgentQueueJob({
      jobId: task.jobId,
      taskId: task.id,
      bookName: task.bookName || props.bookName,
      chapterName: task.chapterId || ''
    })
    ElMessage.success(result?.cancellationRequested ? '已请求停止队列任务' : '队列任务已停止')
    await loadHistory()
  } catch (error) {
    ElMessage.error(error?.message || '停止队列任务失败')
  } finally {
    cancellingQueueJobId.value = ''
  }
}

function isGenerationCancelledError(error = {}) {
  const text = String(error?.message || '')
  return Boolean(error?.cancelled || text.includes('生成已停止') || text.includes('请求已停止'))
}

function generationResultIssue(task, payload, generation) {
  const text = String(generation?.result || '')
  if (!isStarterLikeTask(task, payload) && !isPromptLikeTask(payload.type || task.type)) return ''
  if (isUnusableEmptyResult(text)) return '模型返回内容为空或不可用，请更换模型或补充上下文后重试'
  if (isClearlyWrongTaskResult(payload.type || task.type, text))
    return '模型返回内容与当前任务不匹配，请更换模型或重试'
  return ''
}

function addResultCard(task, payload, generation) {
  const skillMeta = skillMetaFromSources(generation, payload, task)
  addTimelineMessage({
    id: generation.id,
    generationId: generation.id,
    kind: 'result_card',
    role: 'assistant',
    title: task.label,
    content: generation.result || '',
    status: generation.status || 'generated',
    modelId: generation.modelId || payload.modelId,
    modelUsed: generation.modelUsed || payload.modelDisplayName,
    contextLabel: contextSummaryText.value,
    type: generation.type || payload.type,
    ...skillMeta,
    prompt: generation.prompt || payload.instruction || task.instruction || '',
    createdAt: generation.createdAt || new Date().toISOString()
  })
}

function replaceTimelineMessageWithSteps(messageId, steps = []) {
  const rows = Array.isArray(steps) ? steps : []
  if (!rows.length) {
    updateTimelineMessage(messageId, { content: '生成和审核已完成。' })
    return
  }
  const index = timelineMessages.value.findIndex((item) => item.id === messageId)
  const messages = rows.map((step, stepIndex) => ({
    id: step.id || `${messageId}:step:${stepIndex}`,
    kind: 'tool_call',
    role: 'tool',
    title: step.title || agentStepTitle(step),
    content: agentStepContent(step),
    createdAt: step.finishedAt || step.createdAt || new Date().toISOString(),
    status: step.status || 'done'
  }))
  if (index >= 0) {
    timelineMessages.value.splice(index, 1, ...messages)
  } else {
    timelineMessages.value.push(...messages)
  }
  scrollTimeline()
}

function agentStepTitle(step = {}) {
  const stageMap = {
    writer: 'Writer 生成初稿',
    editor_review: 'Editor 审核初稿',
    writer_rewrite: 'Writer 按审核意见重写',
    editor_final_review: 'Editor 复核重写稿',
    writer_repair: 'Writer 生成返修稿',
    editor_repair_review: 'Editor 复核返修稿',
    writer_repair_rewrite: 'Writer 再次返修',
    editor_repair_final_review: 'Editor 复核最终返修稿'
  }
  return stageMap[step.stage] || '执行步骤'
}

function agentStepContent(step = {}) {
  const lines = []
  if (step.content) lines.push(step.content)
  if (step.modelUsed) lines.push(`模型：${step.modelUsed}`)
  return lines.join('\n')
}

function resultCardMessageMeta(task, payload, generation) {
  const skillMeta = skillMetaFromSources(generation, payload, task)
  return {
    generationId: generation.id,
    status: generation.status || 'generated',
    type: generation.type || payload.type,
    ...skillMeta,
    prompt: generation.prompt || payload.instruction || task.instruction || '',
    modelId: generation.modelId || payload.modelId,
    modelUsed: generation.modelUsed || payload.modelDisplayName,
    contextLabel: contextSummaryText.value
  }
}

function generationIdOf(message = {}) {
  return message.generationId || message.id || ''
}

function skillMetaFromSources(...sources) {
  const getText = (key) =>
    sources.map((source) => String(source?.[key] || '').trim()).find(Boolean) || ''
  const getList = (key) => {
    const source = sources.find((item) => Array.isArray(item?.[key]))
    return source ? source[key] : []
  }
  const outputMode = getText('outputMode') || 'preview'
  return {
    skillId: getText('skillId'),
    skillKey: getText('skillKey'),
    outputMode,
    canWriteChapter:
      sources.some((source) => source?.canWriteChapter === true) && outputMode === 'chapter_write',
    inputScopes: getList('inputScopes'),
    requiredContext: getList('requiredContext'),
    references: getList('references')
  }
}

function statusForApplyAction(action = '') {
  if (action === 'discard') return 'discarded'
  if (['save_material', 'save_snippet', 'send_to_asset_workspace'].includes(action)) return 'saved'
  return 'applied'
}

async function maybeApplyGenerated(generation, action) {
  const confirmed = await confirmGeneratedAction(action)
  if (!confirmed) {
    ElMessage.info('已保留在时间线，正文尚未修改')
    return
  }
  await applyResult(
    {
      id: generation.id,
      content: generation.result,
      title: generation.title || 'AI 结果',
      type: generation.type,
      ...skillMetaFromSources(generation)
    },
    action
  )
}

async function applyResult(message, action) {
  if (!message?.content) return
  if (isChapterApplyAction(action) && !canApplyResultToChapter(message)) {
    addTimelineMessage({
      kind: 'approval_card',
      role: 'tool',
      title: '正文写入已拦截',
      content: chapterApplyBlockedText(message)
    })
    ElMessage.warning('当前结果不允许直接写入正文')
    return
  }
  const confirmed = await confirmApply(action)
  if (!confirmed) return
  try {
    const context = currentContext.value || {}
    const generationId = generationIdOf(message)
    if (isChapterApplyAction(action)) {
      await createEditorSnapshot({
        bookName: props.bookName,
        chapterId: context.path || context.chapterId || chapterName.value,
        chapterName: chapterName.value,
        contentBefore: context.content || '',
        reason: 'ai_apply',
        generationId
      })
    }
    let applied = null
    if (isChapterApplyAction(action)) {
      applied = await applyTextToChapter(message, action)
      applied = requireAppliedChapterWriteResult(applied)
    }
    if (action === 'save_snippet')
      emit('save-snippet', { title: message.title || 'AI 片段', content: message.content })
    if (action === 'save_material') await saveAsMaterial(message)
    if (action === 'send_to_asset_workspace') await sendToAssetWorkspace(message)
    const nextStatus = statusForApplyAction(action)
    await markGenerationApplied(generationId, action, nextStatus)
    updateTimelineMessage(message.id, { status: nextStatus, applyAction: action })
    addTimelineMessage({
      kind: 'save_record',
      role: 'tool',
      title: '已完成',
      content: saveRecordText(action)
    })
    await maybeRunAppliedChapterConsistencyCheck(message, action, applied)
  } catch (error) {
    addTimelineMessage({
      kind: 'error_card',
      role: 'assistant',
      title: '操作失败',
      content: error?.message || '操作失败'
    })
    ElMessage.error(error?.message || '操作失败')
  }
}

function requireAppliedChapterWriteResult(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || '正文写入失败')
  }
  if (!result.context || typeof result.context !== 'object') {
    throw new Error('正文写入失败：接口没有返回章节上下文')
  }
  if (typeof result.text !== 'string' || !result.text.trim()) {
    throw new Error('正文写入失败：接口没有返回最新正文')
  }
  return result
}

function isChapterApplyAction(action = '') {
  return ['insert', 'replace', 'append', 'replace_chapter'].includes(action)
}

function canApplyResultToChapter(message = {}) {
  if (!canWriteChapter.value) return false
  const skillId = String(message.skillId || '').trim()
  if (!skillId) return true
  return message.outputMode === 'chapter_write' && message.canWriteChapter === true
}

function chapterApplyBlockedText(message = {}) {
  if (!canWriteChapter.value) {
    return '当前是阅读或资料模式，AI 结果不能直接写入原文。可以保存片段、保存素材、加入作品，或切到原创作品写作模式后再写入。'
  }
  const label = message.title || message.skillId || '当前结果'
  return `${label} 的 skill 没有声明正文写入权限，只能保存为预览、素材或片段。`
}

async function applyTextToChapter(message = {}, action = '') {
  if (typeof props.applyGeneratedText === 'function') {
    return props.applyGeneratedText({
      action,
      text: message.content || '',
      generationId: generationIdOf(message),
      type: message.type || '',
      title: message.title || '',
      ...skillMetaFromSources(message)
    })
  }
  return {
    success: false,
    action,
    message: '当前页面没有提供正文写入处理器，无法应用 AI 结果'
  }
}

async function confirmApply(action) {
  const map = {
    replace: '这会替换当前选中文本。系统会先保存快照。',
    replace_chapter: '这会替换整章。系统会先保存快照，请确认结果内容无误。',
    send_to_asset_workspace: '这会把 AI 结果写入作品资产台，请确认内容属于当前作品。',
    join_target_book:
      '下载书提取结果不能直接成为原创作品正式设定。请确认后作为 reference / inspiration / draft 加入。'
  }
  if (!map[action]) return true
  try {
    await ElMessageBox.confirm(map[action], '确认操作', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: action === 'replace_chapter' ? 'warning' : 'info'
    })
    return true
  } catch {
    return false
  }
}

async function confirmGeneratedAction(action) {
  const map = {
    insert: '结果卡已生成。确认后会插入到当前光标处。',
    save_material: '结果卡已生成。确认后会保存为素材。'
  }
  try {
    await ElMessageBox.confirm(
      map[action] || '结果卡已生成。确认后执行所选操作。',
      '确认应用 AI 结果',
      {
        confirmButtonText: '确认',
        cancelButtonText: '先看看结果',
        type: 'info'
      }
    )
    return true
  } catch {
    return false
  }
}

async function saveAsMaterial(message) {
  await saveEditorMaterial({
    bookId: props.bookName,
    chapterId: chapterName.value,
    title: `${chapterName.value} · ${message.title || 'AI 素材'}`,
    content: message.content,
    type: isDownloadedBook.value ? 'extract' : 'idea',
    tags: [agentTitle.value]
  })
  const knowledgeType = isDownloadedBook.value ? 'book_analysis' : 'plot_fragment'
  await safeCreateKnowledgeItem({
    type: knowledgeType,
    title: `${chapterName.value} · ${message.title || 'AI 素材'}`,
    summary: String(message.content || '').slice(0, 160),
    content: message.content,
    tags: [agentTitle.value, bookTypeText()],
    sourceType: 'ai_generated',
    sourceName: props.bookName,
    relatedBookIds: [props.bookName],
    relatedChapterIds: [chapterName.value],
    metadata: {
      editorAgent: {
        generationId: generationIdOf(message),
        mode: props.mode,
        agentMode: agentMode.value,
        usage: isDownloadedBook.value ? 'reference' : 'draft'
      }
    }
  })
  ElMessage.success('已保存到素材箱')
}

async function sendToAssetWorkspace(message) {
  await safeCreateKnowledgeItem({
    type: inferAssetType(message),
    title: `${chapterName.value} · ${message.title || 'Agent 结果'}`,
    summary: message.content.slice(0, 120),
    content: message.content,
    tags: [agentTitle.value, bookTypeText()],
    sourceType: 'editor_agent',
    sourceName: props.bookName,
    relatedBookIds: [props.bookName],
    metadata: {
      generationId: generationIdOf(message),
      mode: props.mode,
      agentMode: agentMode.value,
      usage: isDownloadedBook.value ? 'reference' : 'draft'
    }
  })
  ElMessage.success('已发送到资产台')
}

function regenerateResult(message) {
  commandInput.value = message?.prompt || `请重新生成：${message?.title || '当前结果'}`
  preparedTask.value = {
    key: message?.skillKey || message?.skillId || message?.type || 'custom',
    label: message?.title || toolLabelFromType(message?.type) || '重新生成',
    type: message?.type || 'custom',
    instruction: commandInput.value,
    ...skillMetaFromSources(message)
  }
  runCommand()
}

async function discardResult(message) {
  try {
    await markGenerationApplied(generationIdOf(message), 'discard', 'discarded')
    timelineMessages.value = timelineMessages.value.map((item) =>
      item.id === message.id ? { ...item, status: 'discarded' } : item
    )
  } catch (error) {
    addTimelineMessage({
      kind: 'error_card',
      role: 'assistant',
      title: '丢弃失败',
      content: error?.message || '丢弃记录失败'
    })
    ElMessage.error(error?.message || '丢弃记录失败')
  }
}

function convertToTemplate(message) {
  commandInput.value = `请把这条结果转成桥段模板，保留结构，不照搬原文：\n${message.content || ''}`
  commandScope.value = 'current_chapter'
}

async function joinTargetBook(message) {
  const confirmed = await confirmApply('join_target_book')
  if (!confirmed) return
  pendingJoinMessage.value = message
  await loadBookOptions()
  joinForm.value = {
    targetBookId: props.bookName || bookOptions.value[0]?.id || '',
    assetType: isDownloadedBook.value ? 'book_analysis' : inferAssetType(message),
    usage: isDownloadedBook.value ? 'reference' : 'draft'
  }
  joinDialogVisible.value = true
}

async function loadBookOptions() {
  bookOptionsError.value = ''
  try {
    const rows = await readBooksDir()
    bookOptions.value = rows
      .map((book) => ({
        id: String(book.id || book.folderName || book.name || ''),
        label: book.name || book.folderName || book.id || '未命名作品'
      }))
      .filter((book) => book.id)
  } catch (error) {
    bookOptions.value = []
    bookOptionsError.value = `读取作品列表失败：${error?.message || '读取失败'}`
    ElMessage.error(bookOptionsError.value)
  }
}

async function confirmJoinTargetBook() {
  try {
    const message = pendingJoinMessage.value
    if (!message?.content) return
    if (bookOptionsError.value) {
      ElMessage.error(bookOptionsError.value)
      return
    }
    if (!joinForm.value.targetBookId) {
      ElMessage.warning('请选择目标作品')
      return
    }
    await safeCreateKnowledgeItem({
      type: joinForm.value.assetType,
      title: `${message.title || 'AI 结果'} · ${joinForm.value.usage}`,
      summary: String(message.content || '').slice(0, 160),
      content: message.content,
      tags: [agentTitle.value, joinForm.value.usage],
      sourceType: 'ai_generated',
      sourceName: props.bookName,
      relatedBookIds: [joinForm.value.targetBookId],
      relatedChapterIds: [chapterName.value],
      metadata: {
        editorAgent: {
          generationId: generationIdOf(message),
          sourceBookId: props.bookName,
          targetBookId: joinForm.value.targetBookId,
          usage: joinForm.value.usage
        }
      }
    })
    await saveEditorMaterial({
      bookId: joinForm.value.targetBookId,
      chapterId: chapterName.value,
      title: `${message.title || 'AI 结果'} · ${joinForm.value.usage}`,
      content: message.content,
      type: joinForm.value.assetType,
      tags: [joinForm.value.usage]
    })
    joinDialogVisible.value = false
    addTimelineMessage({
      kind: 'save_record',
      role: 'tool',
      title: '已加入作品',
      content: `已作为 ${joinForm.value.usage} 加入目标作品。`
    })
    ElMessage.success('已加入目标作品')
  } catch (error) {
    addTimelineMessage({
      kind: 'error_card',
      role: 'assistant',
      title: '加入作品失败',
      content: error?.message || '加入作品失败'
    })
    ElMessage.error(error?.message || '加入作品失败')
  }
}

async function safeCreateKnowledgeItem(input) {
  const result = await createKnowledgeItem(input)
  if (result?.success !== true) {
    throw new Error(result?.message || '创作库写入失败')
  }
  if (!result.item || typeof result.item !== 'object' || Array.isArray(result.item)) {
    throw new Error('创作库写入失败：接口返回格式不正确')
  }
  return result
}

function buildContextText() {
  const ctx = currentContext.value || {}
  const effectiveOptions = getEffectiveContextOptions()
  const parts = [
    `【当前书】${props.bookName || '未命名'}`,
    `【书籍类型】${bookTypeText()}`,
    `【当前章节】${chapterName.value}`
  ]
  if (effectiveOptions.selectedText && ctx.selectedText)
    parts.push(`【选中文本】\n${ctx.selectedText}`)
  if (effectiveOptions.currentParagraph && ctx.currentParagraph)
    parts.push(`【当前段落】\n${ctx.currentParagraph}`)
  if (effectiveOptions.currentChapter) parts.push(`【当前章节正文】\n${ctx.content || ''}`)
  if (effectiveOptions.previousSummary)
    parts.push(`【上一章摘要】\n${ctx.previousSummary || '暂无'}`)
  if (effectiveOptions.outline) parts.push(`【本书大纲】\n${ctx.outline || '暂无'}`)
  if (effectiveOptions.relatedCharacters)
    parts.push(`【相关角色】\n${ctx.relatedCharacters || '暂无'}`)
  if (effectiveOptions.relatedWorldbuilding)
    parts.push(`【世界设定】\n${ctx.relatedWorldbuilding || '暂无'}`)
  if (effectiveOptions.assetWorkspace) parts.push(`【资产台资料】\n${ctx.assetWorkspace || '暂无'}`)
  if (joinedContextItems.value.length) {
    parts.push(
      `【已加入资料】\n${joinedContextItems.value.map((item) => `${item.title}：${item.summary}`).join('\n')}`
    )
  }
  return parts.join('\n\n')
}

function buildInstruction(instruction) {
  const systemRule = {
    writing:
      '你是专业网文小说写作助手。你只服务当前章节写作。不要擅自修改用户正文，所有结果先返回结果卡，等待用户确认。',
    reading_extract:
      '你是小说阅读分析助手。只基于当前下载书章节做局部分析，不把内容自动变成用户原创作品设定。',
    reference_extract:
      '你是资料提炼助手。可以摘要资料、提取概念、转成灵感卡，不输出无来源的设定结论。'
  }[agentMode.value]
  return [systemRule, instruction].filter(Boolean).join('\n')
}

function buildContextSnapshot() {
  return {
    bookName: props.bookName,
    chapterName: chapterName.value,
    mode: props.mode,
    selectedTextLength: selectionCount.value,
    contextPreset: contextPreset.value,
    contextOptions: { ...getEffectiveContextOptions() },
    contextItems: joinedContextItems.value
  }
}

function buildSuggestions() {
  const rows = allCapabilities.value
  if (!rows.length) return []
  if (selectionCount.value) {
    return pickCapabilitySuggestions(
      (item) => item.requireSelection || item.inputScopes.includes('selected_text'),
      6,
      'selected_text'
    )
  }
  if (isDownloadedBook.value) {
    return pickCapabilitySuggestions(
      (item) =>
        ['拆书', '素材', '导入'].includes(item.category) ||
        item.inputScopes.includes('current_chapter'),
      6,
      'current_chapter'
    )
  }
  if (isReferenceBook.value) {
    return pickCapabilitySuggestions(
      (item) =>
        ['导入', '素材', '拆书'].includes(item.category) ||
        item.inputScopes.includes('reference_items'),
      5,
      'current_chapter'
    )
  }
  if (isStarterChapter.value) {
    return pickCapabilitySuggestions(
      (item) => item.category === '起书' || item.inputScopes.includes('current_book'),
      6,
      'current_book'
    )
  }
  return pickCapabilitySuggestions(
    (item) =>
      item.outputMode === 'chapter_write' ||
      ['写作', '审稿', '设定'].includes(item.category) ||
      item.inputScopes.includes('current_chapter'),
    6,
    'current_chapter'
  )
}

function pickCapabilitySuggestions(predicate, limit = 6, scope = '') {
  const picked = []
  const seen = new Set()
  const add = (item) => {
    const capability = normalizeCapability(item, item.category)
    const id = capability.skillId || capability.id || capability.key
    if (!id || seen.has(id)) return
    seen.add(id)
    picked.push({
      ...capability,
      scope: scope || preferredCapabilityScope(capability)
    })
  }
  allCapabilities.value.filter(predicate).forEach(add)
  allCapabilities.value.forEach(add)
  return picked.slice(0, limit)
}

function preferredCapabilityScope(capability = {}) {
  const scopes = Array.isArray(capability.inputScopes) ? capability.inputScopes : []
  if ((capability.requireSelection || scopes.includes('selected_text')) && selectionCount.value)
    return 'selected_text'
  if (scopes.includes('current_paragraph')) return 'current_paragraph'
  if (scopes.includes('current_book')) return 'current_book'
  return 'current_chapter'
}

function addContextItem(item = {}) {
  if (!item.title) return
  const id = item.id || `${item.type || 'reference'}:${item.title}`
  if (joinedContextItems.value.some((row) => row.id === id)) return
  joinedContextItems.value.push({
    id,
    type: item.type || 'reference',
    targetId: item.targetId || id,
    title: item.title,
    summary: item.summary || item.content || ''
  })
  handleContextOptionChange()
}

function removeJoinedContext(id) {
  joinedContextItems.value = joinedContextItems.value.filter((item) => item.id !== id)
  handleContextOptionChange()
}

function clearJoinedContext() {
  joinedContextItems.value = []
  handleContextOptionChange()
}

function normalizeMessages(messages) {
  const seenFailures = new Set()
  const seenUserMessages = new Set()
  const clearedAt = Number(localStorage.getItem(timelineClearStorageKey()) || 0)
  return (messages || [])
    .filter((message) => {
      if (!clearedAt) return true
      const createdAt = new Date(message.createdAt || 0).getTime()
      return Number.isFinite(createdAt) && createdAt > clearedAt
    })
    .map((message) => {
      const blockType = message.blocks?.[0]?.type
      const blockContent = message.blocks?.[0]?.content || {}
      const content = message.content || blockContent.text || ''
      const title = message.title || blockContent.title || ''
      const isLegacyPreview =
        message.role === 'assistant' && (title.includes('已生成预览') || blockType === 'preview')
      const isLegacyFailure =
        message.role === 'assistant' &&
        (title.includes('生成失败') || content.includes('生成失败') || content.includes('重试'))
      const kind =
        blockType === 'error' || isLegacyFailure
          ? 'error_card'
          : blockType === 'result_card' || isLegacyPreview
            ? 'result_card'
            : message.role === 'tool'
              ? 'tool_call'
              : `${message.role}_message`
      const failureKey = kind === 'error_card' ? `${message.title || '生成失败'}:${content}` : ''
      if (failureKey && seenFailures.has(failureKey)) return null
      if (failureKey) seenFailures.add(failureKey)
      if (kind === 'result_card' && isUnusableEmptyResult(content)) return null
      const userKey = kind === 'user_message' ? `${title}:${content}` : ''
      if (userKey && seenUserMessages.has(userKey)) return null
      if (userKey) seenUserMessages.add(userKey)
      const generationId = message.generationId || blockContent.generationId || ''
      const id = kind === 'result_card' ? generationId || message.id : message.id
      return {
        id,
        generationId,
        kind,
        role: message.role,
        title: isLegacyPreview ? title.replace('已生成预览', '').trim() || 'AI 结果' : title,
        content: isLegacyFailure ? errorReasonFromText(content) : content,
        createdAt: message.createdAt,
        status: blockContent.status || 'generated',
        type: blockContent.type || message.type || '',
        skillId: blockContent.skillId || message.skillId || '',
        skillKey: blockContent.skillKey || message.skillKey || '',
        outputMode: blockContent.outputMode || message.outputMode || 'preview',
        canWriteChapter: blockContent.canWriteChapter === true || message.canWriteChapter === true,
        inputScopes: normalizeTextList(blockContent.inputScopes || message.inputScopes),
        requiredContext: normalizeTextList(blockContent.requiredContext || message.requiredContext),
        references: normalizeTextList(blockContent.references || message.references),
        prompt: blockContent.prompt || message.prompt || '',
        modelId: blockContent.modelId || message.modelId || '',
        modelUsed: blockContent.modelUsed || message.modelUsed || '',
        contextLabel: blockContent.contextLabel || message.contextLabel || contextSummaryText.value
      }
    })
    .filter(Boolean)
}

function clearCurrentTimeline() {
  localStorage.setItem(timelineClearStorageKey(), String(Date.now()))
  timelineMessages.value = []
  ElMessage.success('已清理当前时间线')
}

async function appendMessage(role, title, content, blockType = 'text', meta = {}) {
  if (!sessionId.value) throw new Error('编辑器会话未初始化，无法保存消息')
  return await appendAgentMessage(sessionId.value, {
    role,
    title,
    content,
    modelId: meta.modelId || selectedModelId.value,
    blocks: [{ type: blockType, content: { title, text: content, ...meta } }]
  })
}

function addTimelineMessage(message) {
  const id = message.id || `timeline_${Date.now()}_${Math.random().toString(16).slice(2)}`
  timelineMessages.value.push({
    id,
    createdAt: message.createdAt || new Date().toISOString(),
    ...message
  })
  scrollTimeline()
  return id
}

function addOrUpdateTimelineMessage(message) {
  if (!message.id) return addTimelineMessage(message)
  const index = timelineMessages.value.findIndex((item) => item.id === message.id)
  const next = {
    createdAt: new Date().toISOString(),
    ...message
  }
  if (index >= 0) {
    timelineMessages.value.splice(index, 1, {
      ...timelineMessages.value[index],
      ...next
    })
    scrollTimeline()
    return message.id
  }
  timelineMessages.value.push(next)
  scrollTimeline()
  return message.id
}

function updateTimelineMessage(id, patch) {
  if (!id) return
  timelineMessages.value = timelineMessages.value.map((message) =>
    message.id === id ? { ...message, ...patch } : message
  )
}

function upsertErrorCard(message) {
  const id = `error:${message.taskId || 'latest'}`
  const next = {
    id,
    kind: 'error_card',
    role: 'assistant',
    title: message.title || '生成失败',
    content: message.content || '模型请求失败',
    detail: message.detail || '',
    createdAt: new Date().toISOString()
  }
  const index = timelineMessages.value.findIndex((item) => item.id === id)
  if (index >= 0) {
    timelineMessages.value.splice(index, 1, next)
  } else {
    timelineMessages.value.push(next)
  }
  scrollTimeline()
}

function stableTaskId(task = {}) {
  return encodeURIComponent(String(task.key || task.type || task.label || 'latest')).slice(0, 80)
}

function confirmApproval(message) {
  updateTimelineMessage(message.id, {
    kind: 'save_record',
    role: 'tool',
    title: '已确认',
    content: '已确认该操作。'
  })
}

function cancelApproval(message) {
  updateTimelineMessage(message.id, {
    kind: 'save_record',
    role: 'tool',
    title: '已取消',
    content: '已取消该操作，正文和资产台没有变化。'
  })
}

function retryLastTask() {
  if (!lastTask.value) {
    ElMessage.warning('没有可重试的任务')
    return
  }
  runGeneration(lastTask.value)
}

function retryAgentTask(task = {}) {
  if (task.jobId || String(task.type || '').includes('queue')) {
    inspectQueuedTask(task)
    ElMessage.info('队列失败任务请先查看队列详情，再按当前内容重新提交。')
    return
  }
  if (lastTask.value) {
    runGeneration(lastTask.value)
    return
  }
  ElMessage.warning('没有找到本次失败任务的输入内容，请保留当前输入后重新生成。')
}

function toggleErrorDetail(message) {
  updateTimelineMessage(message.id, { showDetail: !message.showDetail })
}

async function copyErrorDetail() {
  const text =
    lastError.value ||
    timelineMessages.value.find((item) => item.kind === 'error_card')?.detail ||
    '模型请求失败'
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      throw new Error('当前环境不支持剪贴板写入')
    }
    await navigator.clipboard.writeText(text)
    ElMessage.success('错误详情已复制')
  } catch (error) {
    ElMessage.error(error?.message || '复制错误详情失败')
  }
}

function errorReasonText(error) {
  const text = String(error?.message || '')
  if (!selectedModelId.value) return '未绑定模型'
  if (text.includes('token') || text.includes('limit')) return 'token 超限'
  if (text.includes('network') || text.includes('fetch') || text.includes('Failed to load'))
    return '网络错误'
  if (text.includes('刷新页面') || text.includes('temporarily') || text.includes('unavailable'))
    return '当前模型不可用'
  return '模型请求失败'
}

function errorDetailText(error) {
  const model = selectedModelDisplayName.value || selectedModelId.value || '未选择模型'
  return `模型：${model}\n错误：${error?.message || '模型请求失败'}`
}

function errorReasonFromText(text = '') {
  const value = String(text || '')
  if (value.includes('未绑定')) return '未绑定模型'
  if (value.includes('token') || value.includes('超限')) return 'token 超限'
  if (value.includes('网络') || value.includes('fetch') || value.includes('Failed to load'))
    return '网络错误'
  return value.includes('模型') ? '模型请求失败' : value || '模型请求失败'
}

function blockTypeText(kind) {
  const map = {
    user_message: '指令',
    assistant_message: '回复',
    tool_call: '步骤',
    approval_card: '等待确认',
    consistency_card: '检查',
    save_record: '保存记录',
    error_card: '错误'
  }
  return map[kind] || ''
}

async function loadHistory() {
  if (!props.bookName) {
    toolHistory.value = []
    agentTaskHistory.value = []
    queueStatus.value = null
    queueStatusError.value = ''
    isLoadingQueueStatus.value = false
    queueJobs.value = []
    selectedQueueJob.value = null
    selectedQueueJobId.value = ''
    return
  }
  isLoadingRecords.value = true
  isLoadingQueueStatus.value = true
  recordsError.value = ''
  try {
    const [historyResponse, taskResponse, queueResponse, queueJobsResponse] =
      await Promise.allSettled([
        listAgentHistory(props.bookName),
        listAgentTasks({ bookName: props.bookName, bookId: props.bookName }),
        getAgentQueueStatus(),
        listAgentQueueJobs({ limit: 12 })
      ])
    if (historyResponse.status === 'fulfilled') {
      toolHistory.value = historyResponse.value.items
    } else {
      toolHistory.value = []
      recordsError.value = historyResponse.reason?.message || '读取生成记录失败'
    }
    if (taskResponse.status === 'fulfilled') {
      agentTaskHistory.value = taskResponse.value.tasks
    } else {
      agentTaskHistory.value = []
      recordsError.value = recordsError.value
        ? `${recordsError.value}；${taskResponse.reason?.message || '读取 Agent 任务记录失败'}`
        : taskResponse.reason?.message || '读取 Agent 任务记录失败'
    }
    if (queueResponse.status === 'fulfilled') {
      queueStatus.value = queueResponse.value || null
      queueStatusError.value = ''
    } else {
      queueStatus.value = null
      queueStatusError.value = queueResponse.reason?.message || '读取写作队列状态失败'
    }
    if (queueJobsResponse.status === 'fulfilled') {
      queueJobs.value = queueJobsResponse.value.jobs
    } else {
      queueJobs.value = []
      queueStatusError.value = queueStatusError.value
        ? `${queueStatusError.value}；${queueJobsResponse.reason?.message || '读取写作队列任务列表失败'}`
        : queueJobsResponse.reason?.message || '读取写作队列任务列表失败'
    }
  } finally {
    isLoadingRecords.value = false
    isLoadingQueueStatus.value = false
  }
}

async function loadQueueStatus() {
  isLoadingQueueStatus.value = true
  queueStatusError.value = ''
  try {
    const [statusResponse, jobsResponse] = await Promise.all([
      getAgentQueueStatus(),
      listAgentQueueJobs({ limit: 12 })
    ])
    queueStatus.value = statusResponse || null
    queueJobs.value = jobsResponse.jobs
  } catch (error) {
    queueStatus.value = null
    queueJobs.value = []
    queueStatusError.value = error?.message || '读取写作队列状态失败'
  } finally {
    isLoadingQueueStatus.value = false
  }
}

async function inspectQueuedTask(task = {}) {
  if (!task.jobId) {
    ElMessage.warning('缺少队列任务 ID')
    return
  }
  await inspectQueueJob(task.jobId)
}

async function inspectQueueJob(jobId) {
  if (!jobId) {
    ElMessage.warning('缺少队列任务 ID')
    return
  }
  selectedQueueJobId.value = jobId
  selectedQueueJob.value = null
  queueJobError.value = ''
  isLoadingQueueJobId.value = jobId
  try {
    const response = await getAgentQueueJob(jobId)
    if (!response?.job) {
      queueJobError.value =
        '未在 Redis 队列中找到这个任务，可能已经完成、清理或使用了不同的队列配置。'
      return
    }
    selectedQueueJob.value = response.job
  } catch (error) {
    queueJobError.value = error?.message || '读取写作队列任务失败'
  } finally {
    isLoadingQueueJobId.value = ''
  }
}

function clearSelectedQueueJob() {
  selectedQueueJob.value = null
  selectedQueueJobId.value = ''
  queueJobError.value = ''
}

function connectAgentTaskProgressForCurrentBook() {
  connectAgentTaskProgress({
    bookName: props.bookName,
    bookId: props.bookName
  })
}

function handleAgentTaskProgress(task = {}) {
  if (!task?.id) return
  agentTaskHistory.value = upsertAgentTaskProgressItem(agentTaskHistory.value, task).slice(0, 80)
}

function restoreHistoryCards() {
  if (timelineMessages.value.some((message) => message.kind === 'result_card')) return
  const latest = toolHistory.value.find(
    (item) => item?.status === 'generated' && item?.result && !isUnusableEmptyResult(item.result)
  )
  if (!latest) return
  const skillMeta = skillMetaFromSources(latest)
  addTimelineMessage({
    id: latest.id,
    generationId: latest.id,
    kind: 'result_card',
    role: 'assistant',
    title: latest.title || toolLabelFromType(latest.type) || '历史结果',
    content: latest.result,
    status: latest.status,
    type: latest.type,
    ...skillMeta,
    prompt: latest.prompt || '',
    modelUsed: latest.modelUsed,
    createdAt: latest.createdAt
  })
}

function scrollTimeline() {
  nextTick(() => {
    if (timelineRef.value) timelineRef.value.scrollTop = timelineRef.value.scrollHeight
  })
}

function openAgentSettings() {
  router.push('/settings/models')
  ElMessage.info('已打开模型设置')
}

function openModelBinding() {
  if (availableModels.value.length) {
    modelPanelVisible.value = true
    return
  }
  router.push('/settings/models')
}

function promptMissingModel() {
  modelPanelVisible.value = true
  const message = availableModels.value.length
    ? '请选择 Agent 模型后再发送'
    : '请先添加文本 AI Provider 和模型'
  modelHintText.value = `${commandInput.value ? '已填入指令，' : ''}${message}`
  ElMessage.warning(message)
}

function normalizeTextList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function normalizeCapability(item = {}, category = '') {
  const key = String(item.key || item.id || '').trim()
  const id = String(item.id || key).trim()
  const hasSkillId = Object.prototype.hasOwnProperty.call(item, 'skillId')
  const label = String(item.label || key || '未命名能力').trim()
  const instruction = String(item.instruction || '').trim()
  const type = String(
    item.type || inferGenerationType(`${label}\n${instruction}`) || key || 'custom'
  ).trim()
  const outputMode = String(item.outputMode || 'preview').trim() || 'preview'
  return {
    id: id || key || type,
    key: key || id || type,
    skillId: hasSkillId ? String(item.skillId || '').trim() : String(item.id || '').trim(),
    skillKey: String(item.skillKey || key || id || '').trim(),
    label,
    category: String(item.category || category || '写作').trim(),
    description: String(item.description || '').trim(),
    instruction,
    type,
    scope: item.scope || '',
    requireSelection: item.requireSelection === true,
    outputMode,
    canWriteChapter: item.canWriteChapter === true,
    inputScopes: normalizeTextList(item.inputScopes),
    requiredContext: normalizeTextList(item.requiredContext),
    references: normalizeTextList(item.references)
  }
}

function taskFromCapability(item = {}) {
  const capability = normalizeCapability(item, item.category)
  return {
    key: capability.key,
    label: capability.label,
    type: capability.type,
    instruction: capability.instruction,
    skillId: capability.skillId,
    skillKey: capability.skillKey,
    outputMode: capability.outputMode,
    canWriteChapter: capability.canWriteChapter,
    inputScopes: capability.inputScopes,
    requiredContext: capability.requiredContext,
    references: capability.references
  }
}

async function prepareSkillPayloadForGeneration(payload = {}) {
  if (!payload.skillId) return payload
  const response = await runWritingSkill({
    ...payload,
    executionMode: 'preview',
    outputMode: 'preview'
  })
  return {
    ...payload,
    ...(response.payload || {}),
    skillId: response.skillId || response.skill?.id || payload.skillId,
    skillKey: response.skill?.key || payload.skillKey || '',
    type: response.payload?.type || payload.type,
    title: response.payload?.title || payload.title,
    instruction: response.payload?.instruction || payload.instruction,
    executionMode: payload.executionMode,
    streamChannel: payload.streamChannel
  }
}

function messageAvatar(message) {
  if (message.role === 'user') return '我'
  if (message.kind === 'consistency_card') return '检'
  if (message.kind === 'tool_call' || message.kind === 'save_record') return '步骤'
  return 'AI'
}

function statusText(status) {
  const map = {
    generated: '待处理',
    saved: '已保存',
    applied: '已应用',
    discarded: '已丢弃',
    failed: '失败'
  }
  return map[status] || '待处理'
}

function agentTaskStatusText(status = '') {
  const map = {
    queued: '已排队',
    retrying: '准备重试',
    cancelling: '正在停止',
    queue_completed: '队列完成',
    queue_failed: '队列失败',
    running: '运行中',
    generated: '已生成',
    review_failed: '审核未通过',
    needs_review: '待处理',
    checked: '已检查',
    applied: '已应用',
    repaired: '已返修',
    repair_review_failed: '返修待处理',
    repair_failed: '返修失败',
    cancelled: '已停止',
    saved: '已保存',
    discarded: '已丢弃',
    failed: '失败'
  }
  return map[status] || status || '未记录'
}

function agentTaskEvents(task = {}) {
  return Array.isArray(task.events) ? task.events.slice(-6) : []
}

function taskEventSummary(task = {}) {
  const count = agentTaskEvents(task).length
  const issues = Number(task.issueCount || 0)
  if (issues > 0) return `${issues} 个问题`
  return count ? `${count} 个事件` : '无事件'
}

function queueTaskText(task = {}) {
  return [task.queueName, task.jobId].filter(Boolean).join(' / ') || '未记录'
}

function isFailedAgentTask(task = {}) {
  const status = String(task.status || '').trim()
  const events = agentTaskEvents(task)
  return (
    ['failed', 'task_failed', 'review_failed', 'repair_failed', 'queue_failed'].includes(status) ||
    events.some((event) => String(event?.type || '').includes('failed') || event?.error)
  )
}

function queueJobStateText(state = '') {
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

function queueJobProgressText(progress) {
  if (progress == null || progress === '') return '未记录'
  if (typeof progress === 'object') return queueJobValueText(progress)
  return String(progress)
}

function normalizedQueueAttempts() {
  const value = Number(queueAttempts.value)
  if (!Number.isFinite(value)) return 2
  return Math.min(5, Math.max(1, Math.trunc(value)))
}

function normalizedQueueBackoffDelayMs() {
  const value = Number(queueBackoffDelayMs.value)
  if (!Number.isFinite(value)) return 3000
  return Math.min(60000, Math.max(100, Math.trunc(value)))
}

function queueJobAttemptsText(job = {}) {
  const made = Number(job.attemptsMade || 0)
  const total = Number(job.attempts || job.opts?.attempts || 1)
  return `${Number.isFinite(made) ? made : 0} / ${Number.isFinite(total) ? total : 1}`
}

function queueJobBackoffText(job = {}) {
  const backoff = job.backoff || job.opts?.backoff || null
  if (!backoff || typeof backoff !== 'object') return '未设置'
  const delay = Number(backoff.delay || 0)
  const type = backoff.type === 'exponential' ? '指数等待' : backoff.type || '等待'
  if (!Number.isFinite(delay) || delay <= 0) return type
  return `${type} ${delay}ms`
}

function queueJobValueText(value) {
  if (value == null || value === '') return '未记录'
  if (typeof value === 'string') return value.slice(0, 180)
  try {
    return JSON.stringify(value).slice(0, 180)
  } catch {
    return String(value).slice(0, 180)
  }
}

function queueJobTitle(job = {}) {
  const data = job.data || {}
  return data.chapterName || data.chapter || job.name || job.id || '队列任务'
}

function linkedWriteTaskId(task = {}) {
  if (task.writeTaskId) return task.writeTaskId
  return [...agentTaskEvents(task)].reverse().find((event) => event?.writeTaskId)?.writeTaskId || ''
}

function isQueueTaskCancellable(task = {}) {
  if (!task.jobId) return false
  return ['queued', 'waiting', 'delayed', 'paused', 'running', 'retrying'].includes(
    String(task.status || '').trim()
  )
}

function agentTaskEventTitle(event = {}) {
  const map = {
    task_started: '任务开始',
    writer: 'Writer',
    editor_review: 'Editor 审核',
    writer_rewrite: 'Writer 重写',
    editor_final_review: 'Editor 复核',
    writer_repair: 'Writer 返修',
    editor_repair_review: 'Editor 复核返修',
    writer_repair_rewrite: 'Writer 再返修',
    editor_repair_final_review: 'Editor 最终复核',
    generation_saved: '生成保存',
    generation_applied: '结果应用',
    consistency_check: '一致性检查',
    repair_saved: '返修保存',
    repair_failed: '返修失败',
    task_cancelled: '任务已停止',
    task_failed: '任务失败',
    queue_queued: '队列已接收',
    queue_active: '队列开始执行',
    queue_retrying: '队列准备重试',
    queue_cancelling: '正在停止队列任务',
    queue_completed: '队列执行完成',
    queue_failed: '队列执行失败',
    queue_cancelled: '队列任务已停止'
  }
  return event.title || map[event.type] || event.type || '事件'
}

function agentTaskEventText(event = {}) {
  const parts = []
  if (event.content) parts.push(event.content)
  if (event.issueCount > 0) parts.push(`问题 ${event.issueCount} 个`)
  if (event.applyAction) parts.push(`动作：${applyActionText(event.applyAction)}`)
  if (event.modelUsed) parts.push(`模型：${event.modelUsed}`)
  if (event.writeTaskId) parts.push(`写作任务：${event.writeTaskId}`)
  return parts.join('\n') || agentTaskStatusText(event.status)
}

function consistencyIssuesOf(message = {}) {
  return Array.isArray(message.issues) ? message.issues : []
}

function consistencyModelText(message = {}) {
  if (!message.llmChecked) return '未调用 AI'
  return message.model || message.modelUsed || selectedModelDisplayName.value || '已调用模型'
}

function severityText(severity = '') {
  const map = { high: '高', medium: '中', low: '低' }
  return map[severity] || '中'
}

function usageSummaryText(usage = {}) {
  if (!usage || typeof usage !== 'object') return ''
  const pairs = [
    ['prompt_tokens', '输入'],
    ['completion_tokens', '输出'],
    ['total_tokens', '总计'],
    ['input_tokens', '输入'],
    ['output_tokens', '输出']
  ]
  const seen = new Set()
  return pairs
    .map(([key, label]) => {
      if (seen.has(label)) return ''
      const value = Number(usage[key])
      if (!Number.isFinite(value) || value <= 0) return ''
      seen.add(label)
      return `${label} ${value}`
    })
    .filter(Boolean)
    .join('，')
}

function consistencySourceText(source = '') {
  const map = {
    manual_current_chapter: '当前章',
    generated_chapter: '生成正文',
    applied_current_chapter: '应用后整章'
  }
  return map[source] || source || '当前章'
}

function applyActionText(action = '') {
  const map = {
    insert: '插入正文',
    replace: '替换选区',
    append: '追加章末',
    replace_chapter: '替换整章'
  }
  return map[action] || action || '未记录'
}

function saveRecordText(action) {
  const map = {
    insert: '已插入正文并生成快照。',
    replace: '已替换选中文本并生成快照。',
    append: '已追加到章节末尾并生成快照。',
    save_snippet: '已保存为左侧片段。',
    save_material: '已保存到素材箱。',
    send_to_asset_workspace: '已发送到资产台。'
  }
  return map[action] || '操作已完成。'
}

function inferGenerationType(instruction = '') {
  if (instruction.includes('黄金三章')) return 'golden_three_chapters'
  if (instruction.includes('世界观起盘')) return 'worldbuilding_start'
  if (instruction.includes('主角设定')) return 'protagonist_setup'
  if (instruction.includes('金手指')) return 'cheat_ability'
  if (instruction.includes('第一章开篇')) return 'opening_hook'
  if (instruction.includes('全书大纲')) return 'book_outline'
  if (instruction.includes('时间线')) return 'timeline'
  if (instruction.includes('场景绘图')) return 'scene_prompt'
  if (instruction.includes('封面')) return 'cover_prompt'
  if (instruction.includes('地图')) return 'map_prompt'
  if (instruction.includes('角色绘图') || instruction.includes('立绘'))
    return 'character_image_prompt'
  if (instruction.includes('图片 Prompt')) return 'image_prompt'
  if (instruction.includes('人物关系')) return 'relationship'
  if (instruction.includes('人物设定')) return 'character_card'
  if (instruction.includes('世界观设定')) return 'worldbuilding_card'
  if (instruction.includes('设定冲突')) return 'setting_conflict_check'
  if (instruction.includes('对话增强')) return 'dialogue_enhance'
  if (instruction.includes('检查节奏') || instruction.includes('节奏检查')) return 'rhythm_check'
  if (instruction.includes('提炼写法') || instruction.includes('写作技法')) return 'extract_style'
  if (instruction.includes('转成灵感卡')) return 'idea_card'
  if (instruction.includes('保存素材') || instruction.includes('保存到素材箱'))
    return 'material_card'
  if (instruction.includes('发送到资产台')) return 'asset_draft'
  if (instruction.includes('续写')) return 'continue'
  if (instruction.includes('润色')) return 'polish'
  if (instruction.includes('改写')) return 'rewrite'
  if (instruction.includes('扩写')) return 'expand'
  if (instruction.includes('摘要') || instruction.includes('总结')) return 'summarize'
  if (instruction.includes('人物')) return 'extract_character'
  if (instruction.includes('世界') || instruction.includes('设定')) return 'extract_worldbuilding'
  if (instruction.includes('伏笔')) return 'extract_foreshadowing'
  if (instruction.includes('爽点')) return 'extract_hook'
  return 'custom'
}

function inferCapabilityKey(instruction = '') {
  return allCapabilities.value.find((item) => instruction.includes(item.label))?.key || 'custom'
}

function labelFromInstruction(instruction = '') {
  return (
    allCapabilities.value.find((item) => instruction.includes(item.label))?.label ||
    instruction.slice(0, 18) ||
    '自定义指令'
  )
}

function inferAssetType(message) {
  const text = `${message?.type || ''}${message?.title || ''}`
  if (
    text.includes('golden') ||
    text.includes('黄金三章') ||
    text.includes('outline') ||
    text.includes('大纲')
  )
    return 'plot_outline'
  if (text.includes('timeline') || text.includes('时间线')) return 'timeline'
  if (
    text.includes('image') ||
    text.includes('cover') ||
    text.includes('prompt') ||
    text.includes('Prompt') ||
    text.includes('绘图') ||
    text.includes('封面') ||
    text.includes('地图')
  )
    return 'image_prompt'
  if (text.includes('relationship') || text.includes('人物关系')) return 'relationship'
  if (text.includes('character') || text.includes('人物') || text.includes('角色'))
    return 'character_setting'
  if (text.includes('world') || text.includes('世界') || text.includes('设定'))
    return 'world_setting'
  if (text.includes('foreshadowing') || text.includes('伏笔')) return 'plot_fragment'
  return isDownloadedBook.value ? 'book_analysis' : 'plot_fragment'
}

function toolLabelFromType(type = '') {
  const map = {
    golden_three_chapters: '黄金三章',
    worldbuilding_start: '世界观起盘',
    protagonist_setup: '主角设定',
    cheat_ability: '金手指设定',
    opening_hook: '第一章开篇',
    book_outline: '全书大纲',
    timeline: '时间线',
    relationship: '人物关系',
    character_card: '人物设定',
    worldbuilding_card: '世界观设定',
    setting_conflict_check: '设定冲突检查',
    image_prompt: '图片 Prompt',
    character_image_prompt: '角色绘图',
    scene_prompt: '场景绘图',
    cover_prompt: '封面 Prompt',
    map_prompt: '地图 Prompt',
    continue: '续写',
    expand: '扩写',
    polish: '润色',
    rewrite: '改写',
    dialogue_enhance: '对话增强',
    rhythm_check: '检查节奏',
    summarize: '章节摘要',
    extract_character: '提炼人物',
    extract_worldbuilding: '提炼设定',
    extract_foreshadowing: '提炼伏笔',
    extract_hook: '提炼爽点',
    extract_style: '提炼写法',
    idea_card: '灵感卡',
    material_card: '素材卡',
    asset_draft: '资产台草稿'
  }
  return map[type] || ''
}

function canRunWithoutChapterText(task = {}) {
  const key = String(task.key || task.type || '')
  const instruction = String(task.instruction || '')
  const scopes = Array.isArray(task.inputScopes) ? task.inputScopes : []
  const needsLocalText = scopes.some((scope) =>
    ['selected_text', 'current_paragraph', 'current_chapter'].includes(scope)
  )
  if (scopes.length && !needsLocalText) return true
  return [
    'golden',
    'protagonist',
    'cheat',
    'world_start',
    'opening',
    'book_outline',
    'golden_three_chapters',
    'worldbuilding_start',
    'protagonist_setup',
    'cheat_ability',
    'opening_hook',
    'book_outline',
    'timeline',
    'relationship',
    'character_card',
    'worldbuilding_card',
    'setting_conflict_check',
    'image_prompt',
    'character_image',
    'character_image_prompt',
    'scene_image',
    'scene_prompt',
    'cover_image',
    'cover_prompt',
    'map_image',
    'map_prompt',
    'idea_card',
    'material_card',
    'asset_draft'
  ].some((value) => key.includes(value) || instruction.includes(capabilityLabelByKey(value)))
}

function capabilityLabelByKey(key = '') {
  const map = {
    golden: '黄金三章',
    protagonist: '主角设定',
    cheat: '金手指',
    world_start: '世界观',
    opening: '第一章开篇',
    book_outline: '全书大纲',
    timeline: '时间线',
    relationship: '人物关系',
    character_image: '角色绘图',
    character_image_prompt: '角色绘图',
    scene_image: '场景绘图',
    scene_prompt: '场景绘图',
    cover_image: '封面',
    cover_prompt: '封面',
    map_image: '地图',
    map_prompt: '地图',
    idea_card: '灵感卡',
    material_card: '素材',
    asset_draft: '资产台'
  }
  return map[key] || key
}

function isStarterLikeTask(task = {}, payload = {}) {
  return canRunWithoutChapterText({
    ...task,
    type: task.type || payload.type,
    instruction: task.instruction || payload.instruction
  })
}

function isUnusableEmptyResult(text = '') {
  const value = String(text || '')
  if (!value.trim()) return true
  const emptySignals = [
    '当前章节正文为空',
    '章节正文为空',
    '原文无内容',
    '正文为空',
    '无法从原文',
    '请提供更多章节正文',
    '请补充正文',
    '未出现（原文无内容）',
    '等待您的确认后再进行创作',
    '本地草稿',
    '按当前能力模板生成'
  ]
  return emptySignals.some((signal) => value.includes(signal))
}

function isPromptLikeTask(type = '') {
  return [
    'image_prompt',
    'character_image_prompt',
    'scene_prompt',
    'cover_prompt',
    'map_prompt'
  ].includes(type)
}

function isClearlyWrongTaskResult(type = '', text = '') {
  const value = String(text || '')
  if (!value.trim()) return true
  const writingSignals = ['【续写正文】', '# 续写正文', '续写正文', '请承接当前章节']
  if (isPromptLikeTask(type) && writingSignals.some((signal) => value.includes(signal))) return true
  if (isPromptLikeTask(type)) {
    const promptSignals = ['Prompt', 'prompt', '画面', '风格', '构图', '负面提示', '标题预留']
    return !promptSignals.some((signal) => value.includes(signal))
  }
  return false
}

function primaryResultActionLabel(message = {}) {
  const type = inferAssetType(message)
  if (type === 'character_setting') return '保存为人物资料'
  if (type === 'world_setting') return '保存为世界资料'
  if (type === 'timeline') return '保存为时间线'
  if (type === 'image_prompt') return '保存为图片方案'
  if (type === 'plot_outline') return '保存为大纲'
  if (isDownloadedBook.value) return '保存阅读分析'
  return '保存创作素材'
}

function applyPrimaryResultAction(message = {}) {
  applyResult(message, 'send_to_asset_workspace')
}

function normalizeBookKind(meta = {}) {
  if (meta?.type === 'reference' || meta?.sourceType === 'reference') return 'reference'
  if (meta?.type === 'imported' || meta?.sourceType === 'imported') return 'reference'
  if (
    meta?.type === 'downloaded' ||
    meta?.bookRole === 'downloaded' ||
    meta?.downloaded === true ||
    meta?.sourceType === 'downloadedNovel' ||
    meta?.importedFrom === 'novelDownload'
  ) {
    return 'downloaded'
  }
  return 'original'
}

function isDownloadedBookParsed(meta = {}) {
  return ['parsed', 'split_done'].includes(meta?.analysisStatus)
}

function getEffectiveContextOptions() {
  const options = { ...contextOptions.value }
  if (isDownloadedBook.value && !isDownloadedBookParsed(props.bookMeta)) {
    options.relatedCharacters = false
    options.relatedWorldbuilding = false
    options.assetWorkspace = false
  }
  return options
}

function bookTypeText() {
  if (isReferenceBook.value) return '参考资料'
  return isDownloadedBook.value ? '下载书籍' : '原创作品'
}

function defaultModelTask() {
  if (isReferenceBook.value) return 'extract'
  if (isDownloadedBook.value) return 'summary'
  return 'writing'
}

function providerIdOf(model = {}) {
  return model.providerId || model.providerKey || model.provider || 'default'
}

function modelStorageKey() {
  return `editorAgentModel:${props.bookName || 'default'}:${agentMode.value}`
}

function contextStorageKey() {
  return `editorAgentContext:${props.bookName || 'default'}`
}

function consistencyModeStorageKey() {
  return `editorConsistencyUseLlm:${props.bookName || 'default'}`
}

function autoConsistencyStorageKey() {
  return `editorConsistencyAutoRule:${props.bookName || 'default'}`
}

function timelineClearStorageKey() {
  return `editorAgentTimelineClearedAt:${sessionId.value || props.bookName || 'default'}`
}

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function countWords(text) {
  return String(text || '').replace(/[\s\n\r\t]/g, '').length
}

function formatTime(value) {
  if (!value) return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatQueueTime(value) {
  if (!value) return '未记录'
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return '未记录'
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

defineExpose({
  fillCommand,
  addContextItem
})
</script>

<style scoped lang="scss">
.agent-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 12px 10px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #fbf2e4 0%, #f3e1c7 100%);
  color: #2c2419;
}

.agent-header,
.context-summary,
.consistency-card,
.joined-context,
.suggestions,
.command-box,
.bind-model-card {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  border: 1px solid rgba(151, 106, 43, 0.18);
  border-radius: 8px;
  background: rgba(255, 251, 243, 0.96);
  box-shadow: 0 10px 24px rgba(83, 58, 28, 0.05);
}

.consistency-card {
  display: grid;
  gap: 8px;
  padding: 10px;

  header,
  .consistency-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  header > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  span {
    color: var(--wabi-earth);
    font-size: 13px;
  }

  strong {
    overflow: hidden;
    color: #3a3731;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: #765f45;
    font-size: 13px;
    line-height: 1.5;

    &.error {
      color: #9f392d;
      font-weight: 700;
    }
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 30px;
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: #fff8ea;
    color: #59432c;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 0 10px;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &.primary {
      flex: 1 1 auto;
      border-color: rgba(138, 115, 93, 0.36);
      background: var(--wabi-earth);
      color: var(--wabi-paper);
      font-weight: 700;
    }
  }

  .consistency-auto-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    color: #59432c;
    cursor: pointer;
    font-size: 13px;

    input {
      width: 14px;
      height: 14px;
      accent-color: var(--wabi-earth);
    }

    span {
      color: inherit;
      font-size: inherit;
    }
  }
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;

  h2 {
    margin: 0;
    color: #3a3731;
    font-size: 18px;
    line-height: 1.25;
  }
}

.agent-title-block {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.mode-seal {
  width: max-content;
  border: 1px solid rgba(111, 122, 104, 0.18);
  border-radius: 6px;
  background: rgba(111, 122, 104, 0.08);
  color: var(--wabi-moss-dark);
  font-size: 13px;
  line-height: 1;
  padding: 4px 6px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: #fff8ea;
    color: #59432c;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease;

    &:hover {
      border-color: rgba(111, 122, 104, 0.28);
      background: rgba(111, 122, 104, 0.1);
      color: var(--wabi-moss-dark);
    }
  }
}

.records-trigger,
.model-trigger {
  border: 1px solid rgba(151, 106, 43, 0.18);
  border-radius: 8px;
  background: #fff8ea;
  color: #59432c;
  cursor: pointer;
  font: inherit;
}

.records-trigger {
  height: 30px;
  padding: 0 9px;

  &.icon-only {
    width: 30px;
    padding: 0;
  }
}

.model-trigger {
  display: inline-flex;
  align-items: center;
  min-width: 150px;
  max-width: 170px;
  gap: 7px;
  height: 30px !important;
  padding: 0 9px;
  text-align: left;

  strong {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    color: #3a3731;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    flex: 0 0 auto;
    color: var(--wabi-moss-dark);
    font-size: 13px;
    font-style: normal;

    &.error {
      color: #7d4d3b;
    }
  }
}

.model-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 3px;
  background: var(--wabi-moss);

  &.empty {
    background: #b7aa98;
  }

  &.error {
    background: #7d4d3b;
  }
}

.model-panel {
  display: grid;
  gap: 10px;

  header {
    display: grid;
    gap: 3px;
  }

  strong {
    color: #3a3731;
  }

  span,
  p {
    margin: 0;
    color: #765f45;
    font-size: 13px;
  }

  .model-read-error {
    color: #9f392d;
    font-weight: 700;
  }

  label {
    color: #7a6247;
    font-size: 13px;
    font-weight: 700;
  }
}

.model-panel-select {
  width: 100%;
}

.model-error-actions {
  display: flex;
  gap: 8px;

  button {
    border: 1px solid rgba(151, 106, 43, 0.16);
    border-radius: 8px;
    background: #fffaf2;
    color: #59432c;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 6px 9px;
  }
}

.bind-model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  color: #76532a;
  font-size: 13px;
}

.context-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;

  div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  span,
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--wabi-earth);
    font-size: 13px;
  }

  .current-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .book-kind-dot {
    display: inline-grid;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 6px;
    background: rgba(138, 115, 93, 0.18);
    color: var(--wabi-earth);
    font-style: normal;

    &.downloaded {
      background: #eef0ec;
      color: #68717a;
    }

    &.reference {
      background: rgba(111, 122, 104, 0.13);
      color: var(--wabi-moss-dark);
    }
  }

  strong {
    color: #3a3731;
    font-size: 13px;
  }

  button {
    flex: 0 0 auto;
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: #fff8ea;
    color: var(--wabi-earth);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 5px 9px;
  }
}

.joined-context {
  padding: 8px 10px;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 7px;

    span {
      color: #3a3731;
      font-size: 13px;
      font-weight: 700;
    }

    button {
      border: 0;
      background: transparent;
      color: var(--wabi-warning);
      cursor: pointer;
      font-size: 13px;
    }
  }

  div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  div button {
    border: 1px solid rgba(111, 122, 104, 0.18);
    border-radius: 6px;
    background: #eef0ec;
    color: #55614e;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
  }
}

.suggestions {
  padding: 12px;
  border-color: rgba(138, 115, 93, 0.28);
  background:
    radial-gradient(circle at 90% 12%, rgba(154, 96, 74, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(251, 250, 246, 0.96) 0%, rgba(232, 229, 223, 0.88) 100%);
  box-shadow: 0 14px 28px rgba(58, 55, 49, 0.07);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    span {
      color: #3a3731;
      font-size: 13px;
      font-weight: 700;
    }

    button {
      display: grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 1px solid rgba(58, 55, 49, 0.12);
      border-radius: 7px;
      background: rgba(251, 250, 246, 0.72);
      color: var(--wabi-earth);
      cursor: pointer;
      font: inherit;
      padding: 0;

      &:hover {
        border-color: rgba(111, 122, 104, 0.28);
        background: rgba(111, 122, 104, 0.1);
        color: var(--wabi-moss-dark);
      }
    }
  }

  .suggestion-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 38px;
    border: 1px solid rgba(162, 98, 12, 0.32);
    border-radius: 8px;
    background: #fffdf8;
    color: #4f3820;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    padding: 7px 9px;
    text-align: left;

    &:hover {
      border-color: rgba(138, 115, 93, 0.34);
      background: rgba(138, 115, 93, 0.14);
      color: var(--wabi-earth);
    }
  }
}

.timeline {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(151, 106, 43, 0.16);
  border-radius: 8px;
  background: rgba(255, 253, 248, 0.82);
  padding: 10px;
}

.timeline-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 12px;

  &.user_message {
    grid-template-columns: minmax(0, 1fr) 34px;

    .avatar {
      grid-column: 2;
      grid-row: 1;
    }

    .message-body {
      grid-column: 1;
      grid-row: 1;
      background: #eef0ec;
      border-color: rgba(111, 122, 104, 0.2);
    }
  }
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--wabi-indigo);
  color: var(--wabi-paper);
  font-size: 13px;
}

.user_message .avatar {
  background: #d9b46d;
  color: #2d2418;
}

.tool_call .avatar,
.save_record .avatar {
  width: 32px;
  border-radius: 8px;
  background: rgba(138, 115, 93, 0.18);
  color: var(--wabi-earth);
}

.message-body {
  border: 1px solid rgba(151, 106, 43, 0.1);
  border-radius: 8px;
  background: #fff7e9;
  padding: 9px 10px;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: #332a1f;
    font: inherit;
    font-size: 13px;
    line-height: 1.7;
  }
}

.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;

  span {
    border-radius: 6px;
    background: rgba(138, 91, 22, 0.1);
    color: var(--wabi-earth);
    font-size: 13px;
    padding: 2px 6px;
  }
}

.message-title {
  margin: 0 0 4px;
  color: var(--wabi-earth);
  font-size: 13px;
  font-weight: 700;
}

.result-card {
  display: grid;
  gap: 9px;
  border: 1px solid rgba(217, 146, 40, 0.28);
  border-radius: 10px;
  background: #fffdf8;
  padding: 10px;

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;

    div {
      display: grid;
      gap: 3px;
    }

    strong {
      color: #3a3731;
      font-size: 16px;
    }

    span {
      color: #7a6247;
      font-size: 13px;
    }

    em {
      border-radius: 6px;
      background: rgba(111, 122, 104, 0.14);
      color: var(--wabi-moss-dark);
      font-style: normal;
      font-size: 13px;
      padding: 3px 7px;
    }
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    margin: 0;

    div {
      border-radius: 8px;
      background: #fff7e9;
      padding: 7px;
    }

    dt {
      color: var(--wabi-warning);
      font-size: 13px;
    }

    dd {
      margin: 2px 0 0;
      overflow: hidden;
      color: #332a1f;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  pre {
    max-height: 220px;
    overflow: auto;
    border-radius: 8px;
    background: #fffdf8;
    padding: 10px;
  }

  footer {
    display: grid;
    gap: 7px;
  }

  button {
    min-height: 28px;
    border: 1px solid rgba(151, 106, 43, 0.16);
    border-radius: 8px;
    background: #fffaf2;
    color: #59432c;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 4px 8px;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
}

.result-actions-primary,
.result-actions-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.result-actions-primary {
  padding-bottom: 7px;
  border-bottom: 1px dashed rgba(151, 106, 43, 0.18);
}

.result-card button.primary {
  border-color: rgba(138, 115, 93, 0.36);
  background: var(--wabi-earth);
  color: var(--wabi-paper);
  font-weight: 700;
}

.result-card button.danger {
  color: #7d4d3b;
}

.consistency-result-card {
  display: grid;
  gap: 9px;
  border: 1px solid rgba(111, 122, 104, 0.22);
  border-radius: 10px;
  background: #fbfcf7;
  padding: 10px;

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;

    div {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    span {
      color: #6f7a68;
      font-size: 13px;
    }

    strong {
      color: #30342a;
      font-size: 15px;
      line-height: 1.45;
    }

    em {
      flex: 0 0 auto;
      color: #6f7a68;
      font-size: 13px;
      font-style: normal;
    }
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    margin: 0;

    div {
      border-radius: 8px;
      background: rgba(255, 247, 233, 0.8);
      padding: 7px;
    }

    dt {
      color: #7a6247;
      font-size: 13px;
    }

    dd {
      margin: 2px 0 0;
      overflow: hidden;
      color: #332a1f;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  footer {
    display: grid;
    gap: 4px;
    border-top: 1px dashed rgba(111, 122, 104, 0.2);
    color: #6f7a68;
    font-size: 13px;
    padding-top: 8px;
  }
}

.consistency-issues {
  display: grid;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    border-radius: 8px;
    background: #fffdf8;
    padding: 8px;
  }

  div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  strong,
  p {
    overflow-wrap: anywhere;
  }

  strong {
    color: #30342a;
    font-size: 13px;
    line-height: 1.5;
  }

  p {
    margin: 0;
    color: #5d5145;
    font-size: 13px;
    line-height: 1.55;
  }
}

.severity-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  border-radius: 6px;
  background: rgba(138, 115, 93, 0.16);
  color: var(--wabi-earth);
  font-size: 13px;
  font-weight: 700;

  &.high {
    background: rgba(154, 96, 74, 0.16);
    color: #7d4d3b;
  }

  &.low {
    background: rgba(111, 122, 104, 0.14);
    color: #56624f;
  }
}

.consistency-clean {
  margin: 0;
  border-radius: 8px;
  background: rgba(111, 122, 104, 0.1);
  color: #56624f;
  font-size: 13px;
  line-height: 1.6;
  padding: 8px;
}

.tool-card,
.error-card,
.approval-card {
  display: grid;
  gap: 8px;

  strong {
    color: #3a3731;
  }

  p {
    margin: 0;
    color: #5d5145;
    line-height: 1.6;
  }
}

.tool-card {
  border-left: 3px solid var(--wabi-earth);
  padding-left: 9px;
}

.error_card .message-body {
  border-color: rgba(154, 96, 74, 0.24);
  background: rgba(154, 96, 74, 0.1);
}

.error-card div,
.approval-card div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  button {
    border: 1px solid rgba(151, 106, 43, 0.16);
    border-radius: 8px;
    background: #fffaf2;
    color: #59432c;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 5px 8px;
  }
}

.error-detail {
  max-height: 90px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: #7d4d3b !important;
  font-size: 13px;
  white-space: pre-wrap;
  padding: 8px;
}

.approval_card .message-body {
  border-color: rgba(111, 122, 104, 0.22);
  background: #eef0ec;
}

.save-card {
  border-left: 3px solid var(--wabi-moss);
  color: var(--wabi-moss-dark);
  padding-left: 9px;
}

.timeline-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  height: 100%;
  color: #765f45;
  text-align: center;

  p {
    max-width: 300px;
    margin: 0;
    font-size: 15px;
    line-height: 1.7;
  }
}

.command-box {
  position: relative;
  padding: 10px;
}

.command-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto;
  gap: 8px;
  margin-top: 8px;
}

.queue-retry-controls {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  label {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    min-width: 0;
    border: 1px solid rgba(111, 122, 104, 0.16);
    border-radius: 8px;
    background: #eef0ec;
    color: #56624f;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 8px;
  }

  :deep(.el-input-number) {
    width: 100%;
    min-width: 0;
  }
}

.capability-button,
.send-button,
.stop-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid rgba(151, 106, 43, 0.18);
  border-radius: 8px;
  background: #fff8ea;
  color: #59432c;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0 10px;
}

.capability-button {
  border-color: rgba(138, 115, 93, 0.3);
  background: rgba(138, 115, 93, 0.16);
  color: var(--wabi-earth);
  font-weight: 700;
}

.send-button {
  min-width: 38px;
  background: var(--wabi-earth);
  color: var(--wabi-paper);
}

.stop-button {
  min-width: 58px;
  border-color: rgba(161, 74, 54, 0.32);
  background: #fff3ee;
  color: #8d3e2f;
  font-weight: 700;

  &:disabled {
    cursor: wait;
    opacity: 0.72;
  }
}

.slash-panel {
  position: absolute;
  right: 10px;
  bottom: 54px;
  left: 10px;
  z-index: 8;
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid rgba(151, 106, 43, 0.18);
  border-radius: 8px;
  background: #fffdf8;
  box-shadow: 0 16px 32px rgba(83, 58, 28, 0.14);
  padding: 8px;

  button {
    display: flex;
    justify-content: space-between;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #2d2418;
    cursor: pointer;
    font: inherit;
    padding: 8px;
    text-align: left;

    &:hover {
      background: rgba(138, 115, 93, 0.16);
    }

    span {
      color: var(--wabi-warning);
      font-size: 13px;
    }
  }
}

.context-drawer {
  display: grid;
  gap: 14px;
}

.preset-list {
  display: grid;
  gap: 8px;

  button {
    display: grid;
    gap: 4px;
    border: 1px solid rgba(151, 106, 43, 0.16);
    border-radius: 8px;
    background: #fffaf2;
    cursor: pointer;
    padding: 10px;
    text-align: left;

    &.active {
      border-color: rgba(111, 122, 104, 0.28);
      background: #eef0ec;
    }

    &.disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    strong {
      color: #3a3731;
    }

    span {
      color: #765f45;
      font-size: 13px;
    }
  }
}

.context-options {
  display: grid;
  gap: 8px;

  .context-write-error {
    margin: 0;
    color: #9f392d;
    font-size: 13px;
    font-weight: 700;
  }

  label {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #3e3022;
    font-size: 13px;

    &.disabled {
      opacity: 0.58;
    }

    small {
      color: var(--wabi-warning);
    }
  }
}

:global(.agent-capability-popover) {
  width: min(380px, calc(100vw - 28px)) !important;
  padding: 10px !important;
  overflow: hidden;
}

.capability-panel {
  display: grid;
  gap: 10px;
  max-height: min(560px, 64vh);
  overflow: auto;
  padding-right: 4px;
}

.capability-recommended {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(138, 115, 93, 0.24);
  border-radius: 8px;
  background: rgba(138, 115, 93, 0.12);
  padding: 9px;

  strong {
    color: var(--wabi-earth);
    font-size: 13px;
  }

  div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    border: 1px solid rgba(217, 146, 40, 0.26);
    border-radius: 6px;
    background: #fffdf8;
    color: var(--wabi-earth);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 5px 8px;
  }
}

.capability-group {
  display: grid;
  gap: 6px;

  strong {
    color: #3a3731;
    font-size: 13px;
  }

  button {
    border: 1px solid rgba(151, 106, 43, 0.14);
    border-radius: 8px;
    background: #fffaf2;
    color: #59432c;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 7px 8px;
    text-align: left;
  }
}

.join-book-dialog :deep(.el-select) {
  width: 100%;
}

.join-book-error {
  margin: 8px 0 0;
  color: #9f3f2d;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.records-drawer {
  display: grid;
  gap: 10px;

  .records-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid rgba(111, 122, 104, 0.16);
    border-radius: 8px;
    background: #eef0ec;
    padding: 9px 10px;

    div {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong {
      color: #30342a;
    }

    span {
      color: #56624f;
      font-size: 13px;
    }

    .records-live-state {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      max-width: 138px;
      min-height: 24px;
      border: 1px solid rgba(111, 122, 104, 0.16);
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.72);
      color: #766351;
      font-size: 12px;
      line-height: 1.2;
      margin: 0 0 0 auto;
      overflow: hidden;
      padding: 0 7px;
      text-overflow: ellipsis;
      white-space: nowrap;

      &::before {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #b7aa98;
        content: '';
        margin-right: 5px;
      }

      &.live {
        border-color: rgba(111, 122, 104, 0.26);
        color: #56624f;

        &::before {
          background: var(--wabi-moss);
        }
      }
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 30px;
      border: 1px solid rgba(111, 122, 104, 0.2);
      border-radius: 8px;
      background: #fffdf8;
      color: #56624f;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      padding: 0 9px;

      &:disabled {
        cursor: not-allowed;
        opacity: 0.64;
      }
    }
  }

  article {
    border: 1px solid rgba(151, 106, 43, 0.14);
    border-radius: 8px;
    background: #fffaf2;
    padding: 10px;
  }

  .task-progress-card {
    border: 1px solid rgba(111, 122, 104, 0.16);
    border-radius: 8px;
    background: rgba(255, 253, 248, 0.74);
    padding: 10px;

    dl {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
    }

    div {
      min-width: 0;
    }

    dt {
      color: #8b7d68;
      font-size: 12px;
      margin: 0 0 2px;
    }

    dd {
      color: #3b3f35;
      font-size: 13px;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-progress-notice {
      border-top: 1px dashed rgba(111, 122, 104, 0.18);
      color: #8a4f3d;
      font-size: 12px;
      line-height: 1.6;
      margin: 8px 0 0;
      padding-top: 8px;
    }
  }

  .queue-status-card,
  .queue-job-card {
    display: grid;
    gap: 8px;
    border: 1px solid rgba(111, 122, 104, 0.18);
    border-radius: 8px;
    background: #fffdf8;
    padding: 10px;

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;

      div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 28px;
        border: 1px solid rgba(111, 122, 104, 0.2);
        border-radius: 7px;
        background: #eef0ec;
        color: #56624f;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        padding: 0 8px;
        white-space: nowrap;

        &:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }
      }
    }

    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      color: #6f7a68;
      font-size: 13px;
    }
  }

  .queue-counts,
  .queue-job-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: 0;

    div {
      min-width: 0;
      border-radius: 7px;
      background: rgba(238, 240, 236, 0.74);
      padding: 6px;
    }

    dt {
      color: #6f7a68;
      font-size: 13px;
    }

    dd {
      margin: 2px 0 0;
      overflow: hidden;
      color: #30342a;
      font-size: 13px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .queue-job-list {
    display: grid;
    gap: 6px;

    button {
      display: grid;
      grid-template-columns: 58px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      border: 1px solid rgba(111, 122, 104, 0.16);
      border-radius: 7px;
      background: rgba(255, 247, 233, 0.72);
      color: #30342a;
      cursor: pointer;
      font: inherit;
      padding: 6px 8px;
      text-align: left;

      &:hover {
        border-color: rgba(138, 122, 88, 0.32);
        background: #fff7e9;
      }
    }

    span,
    strong,
    em {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: #8a4f3d;
      font-size: 12px;
      font-weight: 700;
    }

    strong {
      color: #30342a;
      font-size: 13px;
    }

    em {
      color: #6f7a68;
      font-size: 12px;
      font-style: normal;
    }
  }

  .queue-status-error,
  .queue-status-empty,
  .queue-job-note {
    max-height: none;
    overflow-wrap: anywhere;
    margin: 0;
    border-radius: 7px;
    font-size: 13px;
    line-height: 1.55;
    padding: 7px;
  }

  .queue-status-error {
    background: rgba(154, 96, 74, 0.1);
    color: #7d4d3b;
  }

  .queue-status-empty,
  .queue-job-note {
    background: rgba(255, 247, 233, 0.8);
    color: #5d5145;
  }

  strong,
  span,
  p {
    display: block;
  }

  strong {
    color: #3a3731;
  }

  span {
    margin-top: 3px;
    color: var(--wabi-warning);
    font-size: 13px;
  }

  p {
    max-height: 120px;
    overflow: hidden;
    margin: 8px 0 0;
    color: #5d5145;
    font-size: 13px;
    line-height: 1.6;
  }

  .task-record {
    display: grid;
    gap: 9px;
    border-color: rgba(111, 122, 104, 0.2);
    background: #fbfcf7;

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;

      div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      em {
        flex: 0 0 auto;
        border-radius: 6px;
        background: rgba(111, 122, 104, 0.13);
        color: #56624f;
        font-size: 13px;
        font-style: normal;
        padding: 3px 6px;
      }
    }

    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin: 0;
    }

    dl div {
      min-width: 0;
      border-radius: 7px;
      background: rgba(255, 247, 233, 0.8);
      padding: 6px;
    }

    dt {
      color: #7a6247;
      font-size: 13px;
    }

    dd {
      margin: 2px 0 0;
      overflow: hidden;
      color: #332a1f;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-record-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }

    .task-record-actions button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid rgba(111, 122, 104, 0.22);
      border-radius: 7px;
      background: rgba(111, 122, 104, 0.1);
      color: #56624f;
      cursor: pointer;
      font-size: 13px;
      padding: 5px 8px;

      &.danger {
        border-color: rgba(154, 96, 74, 0.24);
        background: rgba(154, 96, 74, 0.08);
        color: #7d4d3b;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.64;
      }
    }

    ol {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: grid;
      gap: 3px;
      border-left: 3px solid rgba(111, 122, 104, 0.28);
      background: #fffdf8;
      padding: 6px 8px;
    }

    li span {
      color: #30342a;
      font-weight: 700;
    }

    li p {
      max-height: 96px;
      margin: 0;
      white-space: pre-wrap;
    }
  }
}

.records-error {
  border: 1px solid rgba(154, 96, 74, 0.2);
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.1);
  color: #7d4d3b !important;
  padding: 8px;
}

.records-divider {
  color: #765f45;
  font-size: 13px;
  font-weight: 700;
  padding-top: 4px;
}

.records-empty {
  color: #765f45;
}
</style>

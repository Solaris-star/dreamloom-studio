<template>
  <section class="book-asset-page">
    <div
      v-if="loading"
      class="asset-loading"
    >
      正在读取作品资产...
    </div>

    <template v-else-if="!book">
      <div class="missing-book">
        <h1>没有找到这本书</h1>
        <p>作品资产台必须绑定一本书，请从创作库作品书架进入。</p>
        <el-button
          type="primary"
          @click="router.push('/knowledge')"
        >
          返回书架
        </el-button>
      </div>
    </template>

    <template v-else>
      <nav class="breadcrumb">
        <button
          type="button"
          @click="router.push('/knowledge')"
        >
          创作库
        </button>
        <span>/</span>
        <button
          type="button"
          @click="router.push('/knowledge')"
        >
          作品书架
        </button>
        <span>/</span>
        <strong>{{ bookTitle(book) }}</strong>
        <span>/</span>
        <strong>作品资产台</strong>
      </nav>

      <header class="asset-header card-panel">
        <div
          class="header-cover"
          :class="{ placeholder: !hasBookCover(book) }"
          :style="bookCoverStyle(book)"
        >
          <span
            v-if="!hasBookCover(book)"
            class="book-mark"
          />
        </div>
        <div class="header-main">
          <div class="header-kicker">
            <span
              class="book-kind-icon"
              :title="bookTypeLabel(book)"
            >
              <Download
                v-if="isDownloadedBook(book)"
                :size="14"
              />
              <Archive
                v-else-if="isImportedBook(book)"
                :size="14"
              />
              <Bookmark
                v-else-if="book.sourceType === 'reference'"
                :size="14"
              />
              <BookOpen
                v-else
                :size="14"
              />
            </span>
            <span>{{ bookStatusLabel(book) }}</span>
            <span>{{ analysisStatus(book) }}</span>
          </div>
          <h1>作品资产台</h1>
          <h2>{{ bookTitle(book) }}</h2>
          <p>{{ book.intro || '暂无简介' }}</p>
          <div class="header-meta">
            <span>{{ formatWords(book.totalWords) }}</span>
            <span>{{ chapterCount }} 章</span>
            <span>{{ formatDate(bookUpdatedAt(book)) }}</span>
            <span
              v-for="tag in bookTags(book).slice(0, 3)"
              :key="tag"
            >{{ tag }}</span>
          </div>
        </div>
        <div class="header-actions">
          <el-button @click="router.push('/knowledge')">
            返回书架
          </el-button>
          <el-button @click="openStudio()">
            打开创作台
          </el-button>
          <el-button
            v-if="isDownloadedBook(book)"
            @click="openStudio('read')"
          >
            阅读模式
          </el-button>
          <el-button
            type="primary"
            :loading="splitNavigationPending"
            @click="startSplit()"
          >
            {{
              splitButtonText
            }}
          </el-button>
          <el-button @click="openOutlineTool">
            打开大纲工具
          </el-button>
        </div>
      </header>

      <nav
        class="asset-tabs card-panel"
        aria-label="作品资产台导航"
      >
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
      <div
        v-if="assetReadErrorSummary"
        class="read-error asset-read-error"
      >
        <strong>作品资料读取失败</strong>
        <span>{{ assetReadErrorSummary }}</span>
        <button
          type="button"
          @click="loadData()"
        >
          重试
        </button>
      </div>

      <main class="tab-panel card-panel">
        <section
          v-if="activeTab === 'overview'"
          class="overview-tab"
        >
          <div class="overview-main">
            <h2>总览</h2>
            <p>{{ book.intro || '这本书还没有填写简介。' }}</p>
            <div class="overview-grid">
              <article>
                <span>创作状态</span>
                <b>{{ isCreativeBook(book) ? '正在创作' : '资料书' }}</b>
              </article>
              <article>
                <span>拆书状态</span>
                <b>{{ bookStatusLabel(book) }}</b>
              </article>
              <article>
                <span>当前章节</span>
                <b>{{ latestChapterName || '暂无章节' }}</b>
              </article>
              <article>
                <span>最近更新</span>
                <b>{{ formatDate(bookUpdatedAt(book)) }}</b>
              </article>
            </div>
          </div>

          <aside class="overview-side">
            <h3>资产统计</h3>
            <div class="asset-stat-grid">
              <span
                v-for="item in assetStats"
                :key="item.label"
              >
                <b>{{ item.value }}</b>
                <small>{{ item.label }}</small>
              </span>
            </div>
          </aside>

          <div
            v-if="!isSplitReady(book)"
            class="split-empty"
          >
            <h3>这本书还没有拆书结果。</h3>
            <p>
              当前只能查看原文、章节和基础信息。完成 AI
              拆书后，可以生成角色、世界观、设定集、伏笔、图片提示词和图谱。
            </p>
            <div>
              <el-button
                type="primary"
                :loading="splitNavigationPending"
                @click="startSplit()"
              >
                开始拆书
              </el-button>
              <el-button
                :loading="splitNavigationPending"
                @click="startSplit('character')"
              >
                只提取角色
              </el-button>
              <el-button
                :loading="splitNavigationPending"
                @click="startSplit('world')"
              >
                只提取世界观
              </el-button>
              <el-button
                :loading="splitNavigationPending"
                @click="startSplit('foreshadowing')"
              >
                只提取伏笔
              </el-button>
              <el-button @click="openStudio('read')">
                阅读模式
              </el-button>
            </div>
          </div>

          <section
            v-else
            class="recent-assets"
          >
            <div class="section-title">
              <h3>最近资产动态</h3>
              <span>{{ relatedKnowledge.length }} 条</span>
            </div>
            <div
              v-if="recentKnowledge.length"
              class="asset-row-list"
            >
              <article
                v-for="item in recentKnowledge"
                :key="item.id"
              >
                <span>{{ knowledgeTypeLabel(item) }}</span>
                <h4>{{ item.title }}</h4>
                <p>{{ item.summary || item.content || '暂无摘要' }}</p>
              </article>
            </div>
            <p
              v-else
              class="soft-text"
            >
              暂无最近资产动态。
            </p>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'chapters'"
          class="chapters-tab"
        >
          <div class="section-title">
            <h2>章节</h2>
            <span>{{ chapterCount }} 章</span>
          </div>
          <div
            v-if="chapterLoadError"
            class="read-error"
          >
            <strong>章节读取失败</strong>
            <span>{{ chapterLoadError }}</span>
            <button
              type="button"
              @click="loadChapters()"
            >
              重试
            </button>
          </div>
          <div
            v-else-if="chapterRows.length"
            class="chapter-list"
          >
            <article
              v-for="row in chapterRows"
              :key="row.key"
              class="chapter-row"
            >
              <div>
                <span>{{ row.volumeName }}</span>
                <h3>{{ row.name }}</h3>
                <p>{{ chapterAssetStatusText(row) }}</p>
              </div>
              <div class="chapter-actions">
                <el-button
                  size="small"
                  @click="openStudio()"
                >
                  打开创作台
                </el-button>
                <el-button
                  size="small"
                  @click="openStudio('read')"
                >
                  阅读
                </el-button>
                <el-button
                  size="small"
                  :loading="splitNavigationPending"
                  @click="startSplit('chapter', row)"
                >
                  拆本章
                </el-button>
                <el-button
                  size="small"
                  :loading="splitNavigationPending"
                  @click="startSplit('character')"
                >
                  提取角色
                </el-button>
                <el-button
                  size="small"
                  :loading="splitNavigationPending"
                  @click="startSplit('world')"
                >
                  提取世界观
                </el-button>
                <el-button
                  size="small"
                  :loading="splitNavigationPending"
                  @click="startSplit('foreshadowing')"
                >
                  提取伏笔
                </el-button>
              </div>
            </article>
          </div>
          <div
            v-else
            class="soft-empty"
          >
            <strong>暂无章节</strong>
            <span>正文编辑属于创作台，进入创作台后可以新建章节。</span>
            <button
              type="button"
              @click="openStudio()"
            >
              打开创作台
            </button>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'split'"
          class="split-tab"
        >
          <div class="split-summary-strip">
            <span>
              <b>{{ chapterCount || '未读取' }}</b>
              <small>章节</small>
            </span>
            <span>
              <b>{{ formatWords(book.totalWords) }}</b>
              <small>字数</small>
            </span>
            <span>
              <b>{{ usableExtractionRecords.length }}</b>
              <small>可用任务</small>
            </span>
            <span>
              <b>{{ splitItems.length }}</b>
              <small>可用素材</small>
            </span>
            <span>
              <b>{{
                latestExtractionRecord
                  ? extractionStatusLabel(latestExtractionRecord.status)
                  : '未开始'
              }}</b>
              <small>最近状态</small>
            </span>
            <span>
              <b>{{ extractionScopeLabel }}</b>
              <small>处理范围</small>
            </span>
          </div>

          <p
            v-if="extractionError"
            class="split-error"
          >
            {{ extractionError }}
          </p>

          <section
            v-if="activeExtractionProgress"
            class="extraction-progress-board"
          >
            <div class="section-title">
              <h3>正在拆书</h3>
              <span>{{ extractionStatusLabel(activeExtractionProgress.status) }}</span>
            </div>
            <div class="progress-head">
              <div>
                <strong>{{ activeExtractionProgress.currentStep || '正在等待模型返回' }}</strong>
                <p>
                  已生成 {{ extractionProgressItemCount(activeExtractionProgress) }} 条， 失败
                  {{ extractionProgressFailedCount(activeExtractionProgress) }} 组。
                </p>
              </div>
              <b>{{ extractionProgressPercent }}%</b>
            </div>
            <el-progress
              :percentage="extractionProgressPercent"
              :stroke-width="10"
            />

            <div class="task-grid">
              <article
                v-for="task in extractionTaskRows"
                :key="task.id || task.dimension"
                class="task-card"
              >
                <div>
                  <strong>{{ task.label || dimensionLabel(task.dimension) }}</strong>
                  <span :class="['task-status', task.status]">{{
                    extractionTaskStatusLabel(task.status)
                  }}</span>
                </div>
                <p>{{ task.currentGroup || '等待处理' }}</p>
                <small>
                  {{ task.progress?.current || 0 }}/{{
                    task.progress?.total || activeExtractionProgress.stats?.totalGroups || 0
                  }}
                  组，{{ task.extractedCount || task.itemCount || 0 }} 条
                </small>
              </article>
            </div>

            <div
              v-if="visibleExtractionLogs.length"
              class="extraction-log-list"
            >
              <div class="mini-title">
                任务记录
              </div>
              <article
                v-for="log in visibleExtractionLogs"
                :key="log.id || `${log.time}-${log.message}`"
                :class="log.level"
              >
                <span>{{ extractionLogLevelLabel(log.level) }}</span>
                <p>{{ log.message }}</p>
              </article>
            </div>
          </section>

          <div class="split-task-layout">
            <section class="extraction-history">
              <div class="section-title">
                <div>
                  <h3>拆书任务</h3>
                  <p>先看每次任务的范围、进度和结果数量，完整内容点“查看结果”分页阅读。</p>
                </div>
                <span>{{ extractionRecords.length }} 次</span>
              </div>

              <div
                v-if="extractionRecordsError"
                class="read-error"
              >
                <strong>拆书任务读取失败</strong>
                <span>{{ extractionRecordsError }}</span>
                <button
                  type="button"
                  @click="loadExtractionRecords()"
                >
                  重试
                </button>
              </div>
              <div
                v-else-if="extractionRecords.length"
                class="record-list"
              >
                <article
                  v-for="record in extractionRecords"
                  :key="record.id"
                  class="extraction-record-card"
                  :class="{
                    active: expandedExtractionId === record.id,
                    superseded: isSupersededExtraction(record)
                  }"
                  @click="toggleExtractionRecord(record)"
                >
                  <div
                    class="record-status-rail"
                    :class="recordStatusClass(record)"
                  />
                  <div class="record-main">
                    <div class="record-title-line">
                      <strong>{{ record.sourceBookName || bookTitle(book) }}</strong>
                      <span :class="['record-status-pill', recordStatusClass(record)]">
                        {{
                          extractionStatusLabel(
                            isSupersededExtraction(record) ? 'superseded' : record.status
                          )
                        }}
                      </span>
                    </div>
                    <p>{{ extractionSummary(record) }}</p>
                    <div class="record-meta-line">
                      <small>创建：{{ formatDateTime(record.createdAt) }}</small>
                      <small v-if="extractionRecordScopeText(record)">{{
                        extractionRecordScopeText(record)
                      }}</small>
                      <small>分组：{{ extractionRecordGroupCount(record) }}</small>
                      <small>结果：{{ extractionRecordItemCount(record) }} 条</small>
                      <small v-if="extractionRecordFailedCount(record)">失败：{{ extractionRecordFailedCount(record) }} 组</small>
                    </div>
                    <div class="record-progress-line">
                      <el-progress
                        :percentage="extractionRecordPercent(record)"
                        :stroke-width="8"
                        :show-text="false"
                      />
                      <b>{{ extractionRecordPercent(record) }}%</b>
                    </div>

                    <div
                      v-if="expandedExtractionId === record.id"
                      class="record-expanded"
                    >
                      <div class="record-dimension-grid">
                        <span
                          v-for="card in Object.entries(record.dimensions || {})"
                          :key="card[0]"
                        >
                          <b>{{ card[1]?.label || dimensionLabel(card[0]) }}</b>
                          <small>{{ card[1]?.itemCount || 0 }} 条</small>
                        </span>
                      </div>
                      <div
                        v-if="extractionRecordRows(record).length"
                        class="task-grid compact"
                      >
                        <article
                          v-for="task in extractionRecordRows(record)"
                          :key="task.id || task.dimension"
                          class="task-card"
                        >
                          <div>
                            <strong>{{ task.label || dimensionLabel(task.dimension) }}</strong>
                            <span :class="['task-status', task.status]">{{
                              extractionTaskStatusLabel(task.status)
                            }}</span>
                          </div>
                          <p>{{ task.currentGroup || '已记录' }}</p>
                          <small>
                            {{ task.progress?.current || 0 }}/{{
                              task.progress?.total || extractionRecordGroupCount(record)
                            }}
                            组，{{ task.extractedCount || task.itemCount || 0 }} 条
                          </small>
                        </article>
                      </div>
                      <div
                        v-if="extractionRecordLogs(record).length"
                        class="extraction-log-list compact"
                      >
                        <div class="mini-title">
                          最近记录
                        </div>
                        <article
                          v-for="log in extractionRecordLogs(record)"
                          :key="log.id || `${log.time}-${log.message}`"
                          :class="log.level"
                        >
                          <span>{{ extractionLogLevelLabel(log.level) }}</span>
                          <p>{{ log.message }}</p>
                        </article>
                      </div>
                    </div>
                  </div>
                  <div
                    class="record-side"
                    @click.stop
                  >
                    <button
                      type="button"
                      @click="toggleExtractionRecord(record)"
                    >
                      {{ expandedExtractionId === record.id ? '收起' : '详情' }}
                    </button>
                    <button
                      type="button"
                      class="primary"
                      :disabled="!record.hasDetail"
                      @click="openExtractionResultViewer(record)"
                    >
                      查看结果
                    </button>
                    <button
                      type="button"
                      class="danger"
                      @click="deleteExtractionRecord(record)"
                    >
                      删除
                    </button>
                  </div>
                </article>
              </div>
              <div
                v-else
                class="soft-empty"
              >
                <strong>还没有拆书任务</strong>
                <span>先在右侧选择模型和提取内容，然后开始拆书。</span>
              </div>
            </section>

            <aside class="split-run-panel">
              <div class="split-run-panel-head">
                <span class="split-eyebrow">AI 拆书</span>
                <h3>{{ splitButtonText }}</h3>
                <p>
                  从真实章节中提取文风、情节、角色、世界观和章节大纲。下载书的结果只作为参考素材保存。
                </p>
              </div>
              <p
                v-if="textProviderError"
                class="split-error"
              >
                {{ textProviderError }}
              </p>
              <label>
                <span>拆书模型</span>
                <select
                  v-model="selectedProviderId"
                  :disabled="!!textProviderError"
                  @change="handleProviderChange"
                >
                  <option value="">使用当前文本模型</option>
                  <option
                    v-for="provider in textProviders"
                    :key="provider.id"
                    :value="provider.id"
                  >
                    {{ provider.name || provider.model || provider.id }}
                  </option>
                </select>
              </label>
              <label v-if="selectedProviderModels.length">
                <span>具体模型</span>
                <select v-model="selectedModel">
                  <option value="">使用默认模型</option>
                  <option
                    v-for="model in selectedProviderModels"
                    :key="model"
                    :value="model"
                  >
                    {{ model }}
                  </option>
                </select>
              </label>
              <div class="chapter-scope-picker">
                <div class="chapter-scope-head">
                  <span>处理章节</span>
                  <button
                    type="button"
                    :disabled="!chapterCount"
                    @click="useAllExtractionChapters"
                  >
                    整本
                  </button>
                </div>
                <el-checkbox
                  v-model="limitExtractionChapters"
                  :disabled="!chapterCount"
                  @change="handleExtractionScopeToggle"
                >
                  只处理选中范围
                </el-checkbox>
                <div class="chapter-scope-row">
                  <span>第</span>
                  <el-input-number
                    v-model="extractionChapterStart"
                    :disabled="!limitExtractionChapters || !chapterCount"
                    :min="1"
                    :max="chapterScopeMax"
                    size="small"
                    controls-position="right"
                    @change="markExtractionScopeTouched"
                  />
                  <span>至</span>
                  <el-input-number
                    v-model="extractionChapterEnd"
                    :disabled="!limitExtractionChapters || !chapterCount"
                    :min="1"
                    :max="chapterScopeMax"
                    size="small"
                    controls-position="right"
                    @change="markExtractionScopeTouched"
                  />
                  <span>章</span>
                </div>
                <p>{{ extractionScopeText }}</p>
              </div>
              <div class="dimension-picker">
                <span>提取内容</span>
                <div class="dimension-groups">
                  <section
                    v-for="group in dimensionGroups"
                    :key="group.key"
                    class="dimension-group"
                  >
                    <header>
                      <strong>{{ group.label }}</strong>
                      <button
                        type="button"
                        @click="toggleDimensionGroup(group)"
                      >
                        {{ isDimensionGroupSelected(group) ? '取消本组' : '选择本组' }}
                      </button>
                    </header>
                    <div>
                      <button
                        v-for="dimension in group.dimensions"
                        :key="dimension.key"
                        type="button"
                        :class="{ active: selectedDimensions.includes(dimension.key) }"
                        @click="toggleDimension(dimension.key)"
                      >
                        {{ dimension.label }}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <div
                v-if="isSplitReady(book)"
                class="split-rerun-actions"
              >
                <el-button
                  type="primary"
                  :loading="extractionRunning"
                  @click="viewExtractionResult"
                >
                  查看最近结果
                </el-button>
                <el-button
                  :loading="extractionRunning"
                  @click="runExtraction('fillMissing')"
                >
                  补充缺失内容
                </el-button>
                <el-button
                  plain
                  :loading="extractionRunning"
                  @click="confirmReplaceExtraction"
                >
                  重新拆书
                </el-button>
              </div>
              <el-button
                v-else
                type="primary"
                :loading="extractionRunning"
                @click="runExtraction('append')"
              >
                {{ extractionRunning ? '正在拆书' : splitButtonText }}
              </el-button>
            </aside>
          </div>

          <section class="split-assets-preview">
            <div class="section-title">
              <div>
                <h3>拆书素材预览</h3>
                <p>这里只预览少量素材，完整内容请进入“查看结果”分页阅读。</p>
              </div>
              <button
                type="button"
                @click="splitAssetPreviewOpen = !splitAssetPreviewOpen"
              >
                {{ splitAssetPreviewOpen ? '收起' : `展开 ${splitItems.length} 条` }}
              </button>
            </div>
            <AssetList
              v-if="splitAssetPreviewOpen"
              title="拆书素材"
              :items="pagedSplitItems"
              empty="这本书还没有拆书卡片。"
              @save="saveAssetToMaterial"
              @open-material="openMaterialBox"
            >
              <template #summary>
                <span>{{ splitItems.length }} 条，当前显示第 {{ splitAssetPage }} 页</span>
              </template>
              <template #footer>
                <el-pagination
                  v-if="splitItems.length > splitAssetPageSize"
                  layout="prev, pager, next, sizes, total"
                  :total="splitItems.length"
                  :current-page="splitAssetPage"
                  :page-size="splitAssetPageSize"
                  :page-sizes="[10, 20, 30, 50]"
                  @current-change="splitAssetPage = $event"
                  @size-change="handleSplitAssetPageSizeChange"
                />
              </template>
            </AssetList>
          </section>
        </section>

        <AssetList
          v-else-if="activeTab === 'characters'"
          title="角色"
          :items="characterItems"
          empty="完成拆书后，这里会出现角色卡。"
          @save="saveAssetToMaterial"
          @open-material="openMaterialBox"
        />

        <AssetList
          v-else-if="activeTab === 'worldbuilding'"
          title="世界观"
          :items="worldItems"
          empty="完成拆书后，这里会出现世界观条目。"
          @save="saveAssetToMaterial"
          @open-material="openMaterialBox"
        />

        <AssetList
          v-else-if="activeTab === 'settings'"
          title="设定集"
          :items="settingItems"
          empty="地点、势力、道具、地图、时间线、术语等设定会显示在这里。"
          @save="saveAssetToMaterial"
          @open-material="openMaterialBox"
        />

        <AssetList
          v-else-if="activeTab === 'foreshadowing'"
          title="伏笔"
          :items="foreshadowingItems"
          empty="完成拆书后，这里会出现伏笔线索。"
          @save="saveAssetToMaterial"
          @open-material="openMaterialBox"
        />

        <section
          v-else-if="activeTab === 'images'"
          class="images-tab"
        >
          <div class="section-title">
            <h2>图片</h2>
            <div class="section-actions">
              <span>{{ relatedImages.length }} 张</span>
              <button
                type="button"
                @click="uploadBookImage"
              >
                上传图片
              </button>
              <button
                type="button"
                @click="openImageLibrary"
              >
                去图库
              </button>
            </div>
          </div>
          <div
            v-if="assetsLoadError"
            class="read-error"
          >
            <strong>图片读取失败</strong>
            <span>{{ assetsLoadError }}</span>
            <button
              type="button"
              @click="loadData()"
            >
              重试
            </button>
          </div>
          <div
            v-else-if="relatedImages.length"
            class="image-grid"
          >
            <article
              v-for="asset in relatedImages"
              :key="asset.id"
            >
              <div class="image-preview">
                <img
                  v-if="asset.isImage"
                  :src="assetUrl(asset)"
                  :alt="asset.name"
                >
                <FileImage
                  v-else
                  :size="34"
                />
              </div>
              <h3>{{ asset.name }}</h3>
              <p>{{ imageTypeLabel(asset) }}</p>
            </article>
          </div>
          <div
            v-else
            class="soft-empty"
          >
            <strong>暂无图片</strong>
            <span>当前书绑定的封面、角色图、场景图、地图和参考图会显示在这里。</span>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'prompts'"
          class="prompts-tab"
        >
          <div class="section-title">
            <h2>提示词</h2>
            <span>{{ bookPrompts.length }} 个</span>
          </div>
          <div
            v-if="promptsLoadError"
            class="read-error"
          >
            <strong>提示词读取失败</strong>
            <span>{{ promptsLoadError }}</span>
            <button
              type="button"
              @click="loadData()"
            >
              重试
            </button>
          </div>
          <div
            v-else-if="bookPrompts.length"
            class="prompt-list"
          >
            <article
              v-for="preset in bookPrompts"
              :key="preset.id"
            >
              <span>{{ promptCategoryLabel(preset.category) }}</span>
              <h3>{{ preset.name }}</h3>
              <p>{{ preset.systemPrompt || preset.userPromptTemplate || '暂无内容' }}</p>
              <el-button
                size="small"
                @click="usePrompt(preset)"
              >
                使用
              </el-button>
            </article>
          </div>
          <div
            v-else
            class="soft-empty"
          >
            <strong>暂无本书提示词</strong>
            <span>提示词管理入口在创作库，AI 工坊负责调用。</span>
            <button
              type="button"
              @click="openPromptManager"
            >
              去管理提示词
            </button>
          </div>
        </section>

        <section
          v-else
          class="graph-tab"
        >
          <div
            v-if="relationshipGraphsError"
            class="graph-read-error"
          >
            <span>{{ relationshipGraphsError }}</span>
            <el-button
              type="primary"
              plain
              @click="loadRelationshipGraphs"
            >
              重试
            </el-button>
          </div>
          <div
            v-else-if="isSplitReady(book) || relationshipGraphs.length"
            class="graph-board"
          >
            <div class="section-title">
              <div>
                <h2>图谱</h2>
                <p>已读取当前书的真实资产。这里显示资产数量，并进入真实的关系图编辑器。</p>
              </div>
              <span>{{ relationshipGraphs.length }} 张关系图</span>
            </div>
            <div class="graph-node-grid">
              <span
                v-for="item in graphNodes"
                :key="item.label"
              >
                <b>{{ item.count }}</b>
                <small>{{ item.label }}</small>
              </span>
            </div>
            <div class="graph-actions">
              <el-button
                type="primary"
                @click="openRelationshipList"
              >
                打开关系列表
              </el-button>
              <el-button @click="createMainRelationshipGraph">
                新建主关系图
              </el-button>
            </div>
            <div
              v-if="relationshipGraphs.length"
              class="relationship-graph-list"
            >
              <article
                v-for="item in relationshipGraphs"
                :key="item.id || item.name"
              >
                <div>
                  <h3>{{ item.name || '未命名关系图' }}</h3>
                  <p>{{ item.description || '暂无描述' }}</p>
                  <small>{{ formatDateTime(item.updatedAt || item.createdAt) }}</small>
                </div>
                <el-button
                  size="small"
                  @click="openRelationshipGraph(item)"
                >
                  打开
                </el-button>
              </article>
            </div>
            <p
              v-else
              class="soft-text"
            >
              当前作品还没有关系图，可以新建一张主关系图。
            </p>
          </div>
          <div
            v-else
            class="split-empty"
          >
            <h3>当前没有可用资产，不能显示虚构图谱。</h3>
            <p>可以先拆书提取资料，也可以先创建一张空白关系图，后续再补人物和连线。</p>
            <div>
              <el-button
                type="primary"
                :loading="splitNavigationPending"
                @click="startSplit()"
              >
                开始拆书
              </el-button>
              <el-button @click="openRelationshipList">
                打开关系列表
              </el-button>
              <el-button @click="createMainRelationshipGraph">
                新建主关系图
              </el-button>
            </div>
          </div>
        </section>
      </main>

      <el-dialog
        v-model="extractionResultVisible"
        width="min(1080px, 92vw)"
        class="extraction-result-dialog"
        destroy-on-close
        append-to-body
        @closed="resetExtractionResultViewer"
      >
        <template #header>
          <div class="result-dialog-title">
            <span>拆书结果</span>
            <small>{{ resultViewerRecord?.sourceBookName || bookTitle(book) }}</small>
          </div>
        </template>

        <div class="result-viewer">
          <aside class="result-viewer-nav">
            <button
              v-for="item in resultViewerDimensionRows"
              :key="item.key"
              type="button"
              :class="{ active: resultViewerDimension === item.key }"
              @click="selectResultDimension(item.key)"
            >
              <span>{{ item.label }}</span>
              <small>{{ item.itemCount || 0 }} 条</small>
            </button>
          </aside>

          <section class="result-viewer-main">
            <div class="result-viewer-toolbar">
              <div>
                <strong>{{ currentResultDimensionLabel }}</strong>
                <span>只读取当前分类和当前页，不会一次渲染整本结果。</span>
              </div>
              <el-input
                v-model="resultViewerKeyword"
                clearable
                placeholder="搜索结果"
                @keyup.enter="reloadResultPage"
                @clear="reloadResultPage"
              />
              <el-button
                :loading="resultViewerLoading"
                @click="reloadResultPage"
              >
                搜索
              </el-button>
            </div>

            <div
              v-if="resultViewerError"
              class="result-viewer-error"
            >
              {{ resultViewerError }}
            </div>
            <div
              v-else-if="resultViewerLoading"
              class="soft-empty"
            >
              <strong>正在读取结果</strong>
              <span>请稍等。</span>
            </div>
            <div
              v-else-if="resultViewerItems.length"
              class="result-item-list"
            >
              <article
                v-for="item in resultViewerItems"
                :key="item.id"
                class="result-item-card"
              >
                <header>
                  <strong>{{ extractionItemTitle(item.item, 0) }}</strong>
                  <span>{{ item.chapterRange || item.group || item.dimensionLabel }}</span>
                </header>
                <p>{{ item.text }}</p>
              </article>
            </div>
            <div
              v-else
              class="soft-empty"
            >
              <strong>当前分类暂无结果</strong>
              <span>可以换一个分类，或者检查这次任务是否成功。</span>
            </div>

            <div class="result-viewer-footer">
              <el-pagination
                layout="prev, pager, next, sizes, total"
                :total="resultViewerTotal"
                :current-page="resultViewerPage"
                :page-size="resultViewerPageSize"
                :page-sizes="[10, 20, 30, 50]"
                @current-change="handleResultPageChange"
                @size-change="handleResultPageSizeChange"
              />
            </div>
          </section>
        </div>
      </el-dialog>
    </template>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Archive, BookOpen, Bookmark, Download, FileImage } from 'lucide-vue-next'
import { getBookDir, readBooksDir } from '@renderer/service/books'
import { selectBrowserImage } from '@renderer/service/browserImagePicker'
import {
  getAssetUrl,
  imageSelectionToImportInput,
  importAsset,
  listAssets
} from '@renderer/service/assets'
import { listPromptPresets } from '@renderer/service/aiWorkshop'
import { listKnowledgeItems, updateKnowledgeItem } from '@renderer/service/knowledgeBase'
import { getActiveTextProvider, getAiProviders } from '@renderer/service/aiProvider'
import {
  createOrganizationGraph,
  createRelationshipGraph,
  listChapterTree,
  readCharactersDocument,
  readOrganizationGraphData,
  readOrganizationGraphs,
  readOutlineDocument,
  readRelationshipGraphData,
  readRelationshipGraphs,
  readSequenceChartsDocument,
  readSettingsDocument,
  readTimelineDocument,
  writeCharactersDocument,
  writeOrganizationGraphData,
  writeOutlineDocument,
  writeRelationshipGraphData,
  writeSequenceChartsDocument,
  writeSettingsDocument,
  writeTimelineDocument
} from '@renderer/service/editor'
import {
  canReadExtractionProgress,
  createExtraction,
  deleteExtraction,
  getExtractionDimensions,
  getExtractionProgress,
  getExtractionResultPage,
  listExtractions,
  requireCompletedExtractionResult
} from '@renderer/service/extraction'
import { genId } from '@renderer/utils/utils'

const AssetList = defineComponent({
  name: 'AssetList',
  props: {
    title: { type: String, required: true },
    items: { type: Array, default: () => [] },
    empty: { type: String, default: '暂无资产' }
  },
  emits: ['save', 'open-material'],
  setup(props, context) {
    const emit = context.emit
    const slots = context.slots || {}
    return () =>
      h('section', { class: 'asset-list-tab' }, [
        h('div', { class: 'section-title' }, [
          h('h2', props.title),
          slots.summary ? slots.summary() : h('span', `${props.items.length} 条`)
        ]),
        props.items.length
          ? h(
              'div',
              { class: 'asset-card-list' },
              props.items.map((item) => {
                const saved = isAssetSavedToMaterial(item)
                const adopted = isAssetAdopted(item)
                return h('article', { key: item.id || item.title, class: 'asset-item-card' }, [
                  h('div', { class: 'asset-item-main' }, [
                    h('span', knowledgeTypeLabel(item)),
                    h('h3', item.title || '未命名资产'),
                    h('p', item.summary || item.content || '暂无摘要'),
                    h('div', { class: 'asset-item-meta' }, [
                      h(
                        'small',
                        `来源：${item.sourceName || item.metadata?.legacyBookName || '当前作品'}`
                      ),
                      h('small', `用途：${usageLabel(item)}`),
                      h('small', `确认状态：${assetStatusLabel(item)}`)
                    ])
                  ]),
                  h('div', { class: 'asset-item-actions' }, [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: saved ? 'is-saved' : '',
                        onClick: () => (saved ? emit('open-material', item) : emit('save', item))
                      },
                      saved ? '查看素材箱' : '保存到素材箱'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: adopted ? 'is-saved' : '',
                        disabled: adopted,
                        onClick: () => emit('save', { ...item, adopt: true })
                      },
                      adopted ? '已加入当前作品' : '加入当前作品'
                    )
                  ])
                ])
              })
            )
          : h('div', { class: 'soft-empty' }, [
              h('strong', props.empty),
              h('span', '这里不会显示编造出来的人物、世界观或图谱。')
            ]),
        slots.footer ? h('div', { class: 'asset-list-footer' }, slots.footer()) : null
      ])
  }
})

const DEFAULT_EXTRACTION_CHAPTER_LIMIT = 10
const route = useRoute()
const router = useRouter()
const loading = ref(false)
const books = ref([])
const assets = ref([])
const prompts = ref([])
const knowledge = ref([])
const assetsLoadError = ref('')
const promptsLoadError = ref('')
const knowledgeLoadError = ref('')
const relationshipGraphs = ref([])
const relationshipGraphsError = ref('')
const chaptersTree = ref([])
const activeTab = ref(String(route.query.tab || 'overview'))
const availableDimensions = ref([])
const selectedDimensions = ref([])
const textProviders = ref([])
const textProviderError = ref('')
const selectedProviderId = ref('')
const selectedModel = ref('')
const extractionRunning = ref(false)
const splitNavigationPending = ref(false)
const extractionError = ref('')
const extractionRecords = ref([])
const extractionRecordsError = ref('')
const chapterLoadError = ref('')
const currentExtractionProgress = ref(null)
const extractionLogs = ref([])
let extractionProgressTimer = null
const expandedExtractionId = ref('')
const extractionResultVisible = ref(false)
const resultViewerRecord = ref(null)
const resultViewerDimension = ref('')
const resultViewerPage = ref(1)
const resultViewerPageSize = ref(10)
const resultViewerTotal = ref(0)
const resultViewerItems = ref([])
const resultViewerLoading = ref(false)
const resultViewerError = ref('')
const resultViewerKeyword = ref('')
const splitAssetPage = ref(1)
const splitAssetPageSize = ref(20)
const splitAssetPreviewOpen = ref(false)
const limitExtractionChapters = ref(false)
const extractionChapterStart = ref(1)
const extractionChapterEnd = ref(DEFAULT_EXTRACTION_CHAPTER_LIMIT)
const extractionScopeTouched = ref(false)

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

const DIMENSION_GROUPS = [
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

const tabs = [
  { key: 'overview', label: '总览' },
  { key: 'chapters', label: '章节' },
  { key: 'split', label: '拆书' },
  { key: 'characters', label: '角色' },
  { key: 'worldbuilding', label: '世界观' },
  { key: 'settings', label: '设定集' },
  { key: 'foreshadowing', label: '伏笔' },
  { key: 'images', label: '图片' },
  { key: 'prompts', label: '提示词' },
  { key: 'graph', label: '图谱' }
]
const bookId = computed(() => decodeURIComponent(String(route.params.bookId || '')))
const book = computed(
  () => books.value.find((item) => bookIdentifiers(item).includes(bookId.value)) || null
)
const chapterRows = computed(() => flattenChapterRows(chaptersTree.value))
const chapterCount = computed(
  () =>
    chapterRows.value.length ||
    Number(book.value?.totalChapterCount || book.value?.chapterCount || 0)
)
const chapterScopeMax = computed(() => Math.max(1, Number(chapterCount.value || 0) || 1))
const latestChapterName = computed(
  () => chapterRows.value[chapterRows.value.length - 1]?.name || ''
)
const relatedKnowledge = computed(() =>
  book.value
    ? knowledge.value.filter(
        (item) =>
          item.status !== 'discarded' &&
          item.metadata?.assetStatus !== 'superseded' &&
          isRelatedToBook(item, book.value)
      )
    : []
)
const relatedImages = computed(() =>
  book.value
    ? assets.value.filter(
        (asset) => isAssetRelatedToBook(asset, book.value) && asset.status !== 'trash'
      )
    : []
)
const bookPrompts = computed(() => {
  if (!book.value) return []
  return prompts.value.filter((preset) => isPromptRelatedToBook(preset, book.value))
})

const splitItems = computed(() =>
  relatedKnowledge.value.filter(
    (item) => item.type === 'book_analysis' || item.metadata?.legacyExtractionId
  )
)
const pagedSplitItems = computed(() => {
  const start = (splitAssetPage.value - 1) * splitAssetPageSize.value
  return splitItems.value.slice(start, start + splitAssetPageSize.value)
})
const characterItems = computed(() =>
  relatedKnowledge.value.filter((item) => ['character', 'character_setting'].includes(item.type))
)
const worldItems = computed(() =>
  relatedKnowledge.value.filter((item) => ['world_setting'].includes(item.type))
)
const settingItems = computed(() =>
  relatedKnowledge.value.filter(
    (item) =>
      ['setting', 'location', 'organization', 'prop', 'plot_fragment'].includes(item.type) ||
      ['relationship', 'timeline', 'locationFaction'].includes(item.metadata?.dimension)
  )
)
const foreshadowingItems = computed(() =>
  relatedKnowledge.value.filter(
    (item) => ['foreshadowing', 'clue'].includes(item.type) || includesText(item, '伏笔')
  )
)
const recentKnowledge = computed(() =>
  [...relatedKnowledge.value]
    .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
    .slice(0, 6)
)

const assetStats = computed(() => {
  const splitReady = book.value ? isSplitReady(book.value) : false
  const graphReady = splitReady || relationshipGraphs.value.length > 0
  return [
    { label: '角色数量', value: splitReady ? characterItems.value.length : '待拆书' },
    { label: '世界观数量', value: splitReady ? worldItems.value.length : '待拆书' },
    { label: '设定集数量', value: splitReady ? settingItems.value.length : '待拆书' },
    { label: '伏笔数量', value: splitReady ? foreshadowingItems.value.length : '待拆书' },
    { label: '图片数量', value: relatedImages.value.length },
    { label: '提示词数量', value: bookPrompts.value.length },
    { label: '关系图数量', value: relationshipGraphs.value.length },
    { label: '图谱状态', value: graphReady ? '可编辑' : '待整理' }
  ]
})
const assetReadErrorSummary = computed(() => {
  return [assetsLoadError.value, promptsLoadError.value, knowledgeLoadError.value]
    .filter(Boolean)
    .join('；')
})

const graphNodes = computed(() => [
  { label: '作品', count: 1 },
  { label: '章节', count: chapterCount.value },
  { label: '角色', count: characterItems.value.length },
  { label: '世界观', count: worldItems.value.length },
  { label: '设定集', count: settingItems.value.length },
  { label: '伏笔', count: foreshadowingItems.value.length },
  { label: '图片', count: relatedImages.value.length },
  { label: '提示词', count: bookPrompts.value.length },
  { label: '关系图', count: relationshipGraphs.value.length }
])

const activeExtractionRecords = computed(() =>
  extractionRecords.value.filter((record) => !isSupersededExtraction(record))
)
const usableExtractionRecords = computed(() =>
  activeExtractionRecords.value.filter((record) => recordStatusClass(record) !== 'failed')
)
const latestExtractionRecord = computed(
  () =>
    usableExtractionRecords.value[0] ||
    activeExtractionRecords.value[0] ||
    extractionRecords.value[0] ||
    null
)
const activeExtractionProgress = computed(() => {
  if (currentExtractionProgress.value) return currentExtractionProgress.value
  const running = activeExtractionRecords.value.find((record) =>
    ['running', 'processing', 'extracting'].includes(String(record.status || ''))
  )
  return running || null
})
const extractionProgressPercent = computed(() => {
  const progress = activeExtractionProgress.value
  return Math.round(Number(progress?.overallPercent ?? progress?.progress?.percent ?? 0)) || 0
})
const extractionTaskRows = computed(() => {
  const progress = activeExtractionProgress.value
  const rows = progress?.subTasks
  if (Array.isArray(rows)) return rows
  if (rows && typeof rows === 'object') return Object.values(rows)
  const dimensions = progress?.dimensions || {}
  if (Array.isArray(dimensions)) {
    return dimensions.map((key) => ({
      dimension: key,
      label: dimensionLabel(key),
      status: 'pending'
    }))
  }
  return Object.entries(dimensions).map(([dimension, value]) => ({
    id: `${progress?.id || 'record'}_${dimension}`,
    dimension,
    label: value?.label || dimensionLabel(dimension),
    status: value?.status || 'pending',
    extractedCount: value?.itemCount || value?.count || 0,
    failedGroups: value?.failedGroups || 0,
    progress: value?.progress || { current: 0, total: progress?.totalGroups || 0, percent: 0 }
  }))
})
const visibleExtractionLogs = computed(() => {
  const progressLogs = extractionLogs.value.length
    ? extractionLogs.value
    : activeExtractionProgress.value?.logs || latestExtractionRecord.value?.logs || []
  return progressLogs.slice(-12).reverse()
})

const resultViewerDimensionRows = computed(() => {
  const dimensions = resultViewerRecord.value?.dimensions || {}
  return Object.entries(dimensions).map(([key, value]) => ({
    key,
    label: value?.label || dimensionLabel(key),
    itemCount: Number(value?.itemCount || 0),
    status: value?.status || ''
  }))
})

const currentResultDimensionLabel = computed(() => {
  const found = resultViewerDimensionRows.value.find(
    (item) => item.key === resultViewerDimension.value
  )
  return found?.label || '拆书结果'
})
const selectedExtractionChapterCount = computed(() => {
  if (!chapterCount.value) return 0
  if (!limitExtractionChapters.value) return chapterCount.value
  const start = Math.min(
    Math.max(1, Number(extractionChapterStart.value) || 1),
    chapterScopeMax.value
  )
  const end = Math.min(
    Math.max(start, Number(extractionChapterEnd.value) || start),
    chapterScopeMax.value
  )
  return end - start + 1
})
const extractionScopeLabel = computed(() => {
  if (!chapterCount.value) return '未读取'
  if (!limitExtractionChapters.value) return '整本'
  return extractionChapterStart.value === extractionChapterEnd.value
    ? `第 ${extractionChapterStart.value} 章`
    : `${extractionChapterStart.value}-${extractionChapterEnd.value} 章`
})
const extractionScopeText = computed(() => {
  if (!chapterCount.value) return '当前书还没有可读取章节。'
  if (!limitExtractionChapters.value) return `本次将处理整本 ${chapterCount.value} 章。`
  if (extractionChapterStart.value === extractionChapterEnd.value) {
    return `本次将处理第 ${extractionChapterStart.value} 章，共 1 章。`
  }
  return `本次将处理第 ${extractionChapterStart.value}-${extractionChapterEnd.value} 章，共 ${selectedExtractionChapterCount.value} 章。`
})

watch(splitItems, () => {
  const maxPage = Math.max(1, Math.ceil(splitItems.value.length / splitAssetPageSize.value))
  if (splitAssetPage.value > maxPage) splitAssetPage.value = maxPage
})

watch(
  chapterCount,
  (total) => {
    applyDefaultExtractionScope(total)
  },
  { immediate: true }
)

const selectedProvider = computed(
  () => textProviders.value.find((provider) => provider.id === selectedProviderId.value) || null
)
const selectedProviderModels = computed(() => {
  const models = selectedProvider.value?.models || []
  return Array.isArray(models) ? models.filter(Boolean) : []
})
const dimensionGroups = computed(() => {
  const rows = availableDimensions.value || []
  const byKey = new Map(rows.map((item) => [item.key, item]))
  const used = new Set()
  const grouped = DIMENSION_GROUPS.map((group) => {
    const dimensions = group.keys
      .map((key) => byKey.get(key) || FALLBACK_DIMENSIONS.find((item) => item.key === key))
      .filter(Boolean)
    dimensions.forEach((item) => used.add(item.key))
    return { ...group, dimensions }
  }).filter((group) => group.dimensions.length)
  const other = rows.filter((item) => !used.has(item.key))
  if (other.length) grouped.push({ key: 'other', label: '其他', dimensions: other })
  return grouped
})

const splitButtonText = computed(() => {
  if (!book.value) return 'AI 拆书'
  const status = analysisStatus(book.value)
  if (status === 'split_partial') return '查看拆书结果'
  if (status === 'split_failed') return '重新拆书'
  if (status === 'splitting') return '查看进度'
  if (status === 'split_done') return '查看拆书结果'
  return 'AI 拆书'
})

watch(activeTab, (tab) => {
  if (String(route.query.tab || 'overview') === tab) return
  router.replace({ query: { ...route.query, tab } })
})

onMounted(async () => {
  await Promise.all([loadExtractionOptions(), loadData()])
  applySplitMode(String(route.query.mode || ''))
  applyRouteExtractionScope()
  window.addEventListener('extraction-progress', onExtractionProgress)
})

onBeforeUnmount(() => {
  window.removeEventListener('extraction-progress', onExtractionProgress)
  stopExtractionProgressPolling()
})

async function loadData() {
  loading.value = true
  assetsLoadError.value = ''
  promptsLoadError.value = ''
  knowledgeLoadError.value = ''
  try {
    const [bookRows, assetResult, promptResult, knowledgeResult] = await Promise.all([
      readBooksDir(),
      listAssets({ includeTrash: true }).catch((error) => {
        assetsLoadError.value = error?.message || '读取图片失败'
        return null
      }),
      listPromptPresets(promptScopePayloadForBook(book.value || { id: bookId.value })).catch(
        (error) => {
          promptsLoadError.value = error?.message || '读取提示词失败'
          return null
        }
      ),
      listKnowledgeItems({ sortBy: 'updatedAt' }).catch((error) => {
        knowledgeLoadError.value = error?.message || '读取素材失败'
        return null
      })
    ])
    books.value = bookRows || []
    assets.value = assetResult ? requireRowsResult(assetResult, 'items', '读取图片失败') : []
    prompts.value = promptResult ? requireRowsResult(promptResult, 'presets', '读取提示词失败') : []
    knowledge.value = knowledgeResult
      ? requireRowsResult(knowledgeResult, 'items', '读取素材失败')
      : []
    await loadChapters()
    await loadExtractionRecords()
    await loadRelationshipGraphs()
    syncRunningExtractionProgress()
  } catch (error) {
    ElMessage.error(error?.message || '读取作品资产失败')
  } finally {
    loading.value = false
  }
}

async function loadRelationshipGraphs() {
  relationshipGraphs.value = []
  relationshipGraphsError.value = ''
  const targetBookName = currentBookStorageName()
  if (!targetBookName) return
  try {
    relationshipGraphs.value = await readRelationshipGraphs(targetBookName)
  } catch (error) {
    relationshipGraphs.value = []
    relationshipGraphsError.value = error?.message || '读取关系图失败'
  }
}

function currentBookStorageName() {
  return book.value?.folderName || book.value?.name || bookId.value
}

function openImageLibrary() {
  router.push('/knowledge/images')
}

async function uploadBookImage() {
  const targetBookName = currentBookStorageName()
  if (!targetBookName) {
    ElMessage.warning('没有找到当前作品')
    return
  }
  try {
    const result = await selectBrowserImage()
    const imageInput = imageSelectionToImportInput(result)
    if (!imageInput) return
    const imported = await importAsset({
      ...imageInput,
      bookName: targetBookName,
      type: 'attachment'
    })
    assertItemResult(imported, '上传图片失败')
    ElMessage.success('图片已上传到当前作品')
    await loadData()
  } catch (error) {
    ElMessage.error(error?.message || '上传图片失败')
  }
}

function openRelationshipList() {
  const targetBookName = currentBookStorageName()
  if (!targetBookName) {
    ElMessage.warning('没有找到当前作品')
    return
  }
  router.push({
    path: '/relationship-list',
    query: { name: targetBookName }
  })
}

function openRelationshipGraph(item = {}) {
  const targetBookName = currentBookStorageName()
  const relationshipName = item.name || item.id
  if (!targetBookName || !relationshipName) {
    ElMessage.warning('没有找到可打开的关系图')
    return
  }
  router.push({
    path: '/relationship-design',
    query: {
      name: targetBookName,
      id: relationshipName
    }
  })
}

async function createMainRelationshipGraph() {
  const targetBookName = currentBookStorageName()
  if (!targetBookName) {
    ElMessage.warning('没有找到当前作品')
    return
  }

  const relationshipName = '主关系图'
  const existing = relationshipGraphs.value.find(
    (item) => sameText(item?.name, relationshipName) || sameText(item?.id, relationshipName)
  )
  if (existing) {
    openRelationshipGraph(existing)
    return
  }

  try {
    const now = new Date().toISOString()
    const rootNode = {
      id: genId(),
      text: bookTitle(book.value),
      type: 'root',
      color: '#6f7a68',
      data: {
        description: '当前作品的主关系图根节点',
        fontSize: 16,
        avatar: ''
      }
    }
    const relationshipData = {
      id: relationshipName,
      name: relationshipName,
      description: `${bookTitle(book.value)} 的人物关系总览`,
      nodes: [rootNode],
      lines: [],
      createdAt: now,
      updatedAt: now
    }
    await createRelationshipGraph(targetBookName, relationshipName, relationshipData)
    ElMessage.success('已创建主关系图')
    await loadRelationshipGraphs()
    openRelationshipGraph({ name: relationshipName })
  } catch (error) {
    const message = error?.message || '创建关系图失败'
    if (message.includes('已存在')) {
      await loadRelationshipGraphs()
      openRelationshipGraph({ name: relationshipName })
      return
    }
    ElMessage.error(message)
  }
}

function syncRunningExtractionProgress() {
  if (currentExtractionProgress.value) return
  const running = activeExtractionRecords.value.find(
    (record) =>
      ['running', 'processing', 'extracting'].includes(String(record.status || '')) &&
      !['failed', 'completed', 'partial', 'cancelled'].includes(
        String(record.currentStep || '').toLowerCase()
      )
  )
  if (!running) return
  currentExtractionProgress.value = {
    ...running,
    extractionId: running.id,
    status: running.status || 'running',
    currentStep: running.currentStep || '拆书任务仍在进行中',
    overallPercent: extractionRecordPercent(running),
    results: undefined,
    logs: running.logs || []
  }
  extractionLogs.value = running.logs || extractionLogs.value
  extractionRunning.value = true
  if (canPollExtractionProgress()) {
    pollExtractionJob(
      { bookPath: running.bookPath, extractionId: running.id },
      running.runMode || 'append'
    ).catch(() => {
      extractionRunning.value = false
    })
  }
}

async function loadExtractionOptions() {
  await Promise.all([loadDimensions(), loadTextProviders()])
}

async function loadDimensions() {
  try {
    const rows = await getExtractionDimensions()
    availableDimensions.value = Array.isArray(rows) && rows.length ? rows : FALLBACK_DIMENSIONS
  } catch {
    availableDimensions.value = FALLBACK_DIMENSIONS
  }
  if (!selectedDimensions.value.length) {
    const keys = availableDimensions.value.map((item) => item.key)
    selectedDimensions.value = keys.includes('storyAssets')
      ? ['storyAssets']
      : keys.filter((key) => key !== 'humor').slice(0, 3)
  }
}

async function loadTextProviders() {
  textProviderError.value = ''
  try {
    const result = await getAiProviders()
    if (result?.success !== true) {
      throw new Error(result?.message || '读取文本 AI 服务失败')
    }
    if (!Array.isArray(result.providers)) {
      throw new Error('读取文本 AI 服务失败：接口返回格式不正确')
    }
    textProviders.value = result.providers.filter((provider) => provider.category === 'text')
    const active = await getActiveTextProvider()
    selectedProviderId.value = active?.providerId || ''
    handleProviderChange()
  } catch (error) {
    textProviders.value = []
    selectedProviderId.value = ''
    selectedModel.value = ''
    textProviderError.value = error?.message || '读取文本 AI 服务失败'
    ElMessage.error(textProviderError.value)
  }
}

function requireRowsResult(result, key, fallback = '读取失败') {
  if (result?.success !== true) throw new Error(result?.message || result?.error || fallback)
  if (Array.isArray(result[key])) return result[key]
  if (key !== 'presets' && Array.isArray(result.items)) return result.items
  throw new Error(`${fallback}：接口返回格式不正确`)
}

async function loadChapters() {
  chapterLoadError.value = ''
  if (!book.value) {
    chaptersTree.value = []
    return
  }
  try {
    chaptersTree.value = await listChapterTree(book.value.folderName || book.value.name)
  } catch (error) {
    chaptersTree.value = []
    chapterLoadError.value = error?.message || '读取章节失败'
    ElMessage.error(chapterLoadError.value)
  }
}

async function loadExtractionRecords() {
  extractionRecordsError.value = ''
  if (!book.value) {
    extractionRecords.value = []
    return
  }
  try {
    const bookPath = await resolveBookPath()
    if (!bookPath) {
      throw new Error('未找到书籍目录，请先在系统设置中选择书库。')
    }
    const result = await listExtractions(bookPath)
    const rows = result.extractions
    extractionRecords.value = rows.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))
    if (
      expandedExtractionId.value &&
      !extractionRecords.value.some((record) => record.id === expandedExtractionId.value)
    ) {
      expandedExtractionId.value = ''
    }
    if (
      resultViewerRecord.value &&
      !extractionRecords.value.some((record) => record.id === resultViewerRecord.value.id)
    ) {
      closeExtractionResultViewer()
    }
  } catch (error) {
    extractionRecords.value = []
    extractionRecordsError.value = error?.message || '读取拆书任务失败'
    ElMessage.error(extractionRecordsError.value)
  }
}

function openStudio(action = '') {
  if (!book.value) return
  const safeAction = typeof action === 'string' ? action : ''
  const folderName = book.value.folderName || book.value.name
  const id = book.value.id || folderName
  router.push({
    path: `/editor/${encodeURIComponent(id)}`,
    query: {
      name: folderName,
      source: isDownloadedBook(book.value) ? 'downloaded' : 'book',
      ...(safeAction ? { action: safeAction } : {})
    }
  })
}

async function startSplit(mode = '', row = null) {
  if (!book.value || splitNavigationPending.value) return
  const safeMode = typeof mode === 'string' ? mode : ''
  const query = safeMode ? { tab: 'split', mode: safeMode } : { tab: 'split' }
  splitNavigationPending.value = true
  try {
    if (safeMode === 'chapter' && row) {
      const chapterIndex = Number(row.index || 0)
      if (chapterIndex) {
        query.chapterStart = chapterIndex
        query.chapterEnd = chapterIndex
      }
    }
    const navigationResult = await router.push({
      path: `/knowledge/books/${encodeURIComponent(bookId.value)}`,
      query
    })
    if (isNavigationFailure(navigationResult)) {
      throw navigationResult
    }
    activateSplitTabAfterNavigation(safeMode, row)
  } catch (error) {
    if (isNavigationFailure(error, NavigationFailureType.duplicated)) {
      activateSplitTabAfterNavigation(safeMode, row)
      return
    }
    ElMessage.error(error?.message || '打开拆书面板失败')
  } finally {
    splitNavigationPending.value = false
  }
}

function activateSplitTabAfterNavigation(mode = '', row = null) {
  applySplitMode(mode)
  if (mode === 'chapter' && row) {
    applyChapterRowScope(row)
  }
  activeTab.value = 'split'
  if (isSplitReady(book.value)) {
    viewExtractionResult()
  }
}

function applySplitMode(mode = '') {
  const map = {
    character: ['characterSetting'],
    world: ['worldbuilding'],
    foreshadowing: ['foreshadowing'],
    chapter: ['chapterOutline']
  }
  if (map[mode]) selectedDimensions.value = map[mode]
}

function viewExtractionResult() {
  activeTab.value = 'split'
  const target = latestExtractionRecord.value
  if (target?.id) {
    expandedExtractionId.value = target.id
    openExtractionResultViewer(target)
  }
}

function toggleExtractionRecord(record = {}) {
  if (!record?.id) return
  if (expandedExtractionId.value === record.id) {
    expandedExtractionId.value = ''
    return
  }
  expandedExtractionId.value = record.id
}

async function openExtractionResultViewer(record = {}) {
  if (!record?.id || !record.hasDetail) return
  resultViewerRecord.value = record
  resultViewerDimension.value = firstResultDimension(record)
  resultViewerPage.value = 1
  resultViewerTotal.value = 0
  resultViewerItems.value = []
  resultViewerError.value = ''
  resultViewerKeyword.value = ''
  extractionResultVisible.value = true
  await loadResultPage()
}

function closeExtractionResultViewer() {
  extractionResultVisible.value = false
}

function resetExtractionResultViewer() {
  resultViewerRecord.value = null
  resultViewerDimension.value = ''
  resultViewerItems.value = []
  resultViewerTotal.value = 0
  resultViewerError.value = ''
  resultViewerKeyword.value = ''
  resultViewerLoading.value = false
}

function firstResultDimension(record = {}) {
  const entries = Object.entries(record.dimensions || {})
  const withItems = entries.find(([, value]) => Number(value?.itemCount || value?.count || 0) > 0)
  return withItems?.[0] || entries[0]?.[0] || ''
}

async function selectResultDimension(dimension) {
  if (resultViewerDimension.value === dimension) return
  resultViewerDimension.value = dimension
  resultViewerPage.value = 1
  await loadResultPage()
}

async function reloadResultPage() {
  resultViewerPage.value = 1
  await loadResultPage()
}

async function handleResultPageChange(page) {
  resultViewerPage.value = page
  await loadResultPage()
}

async function handleResultPageSizeChange(size) {
  resultViewerPageSize.value = size
  resultViewerPage.value = 1
  await loadResultPage()
}

function handleSplitAssetPageSizeChange(size) {
  splitAssetPageSize.value = size
  splitAssetPage.value = 1
}

async function loadResultPage() {
  if (!resultViewerRecord.value?.id) return
  resultViewerLoading.value = true
  resultViewerError.value = ''
  try {
    const bookPath = await resolveBookPath()
    if (!bookPath) throw new Error('未找到书籍目录')
    const result = await getExtractionResultPage({
      bookPath,
      extractionId: resultViewerRecord.value.id,
      dimension: resultViewerDimension.value,
      page: resultViewerPage.value,
      pageSize: resultViewerPageSize.value,
      keyword: resultViewerKeyword.value
    })
    resultViewerItems.value = result.items
    resultViewerTotal.value = Number(result.total)
    resultViewerPage.value = Number(result.page)
    resultViewerPageSize.value = Number(result.pageSize)
    if (!resultViewerDimension.value && result?.dimension) {
      resultViewerDimension.value = result.dimension
    }
  } catch (error) {
    resultViewerError.value = error?.message || '读取拆书结果失败'
  } finally {
    resultViewerLoading.value = false
  }
}

function toggleDimension(key) {
  if (selectedDimensions.value.includes(key)) {
    selectedDimensions.value = selectedDimensions.value.filter((item) => item !== key)
    return
  }
  selectedDimensions.value = [...selectedDimensions.value, key]
}

function isDimensionGroupSelected(group = {}) {
  const keys = (group.dimensions || []).map((item) => item.key)
  return keys.length > 0 && keys.every((key) => selectedDimensions.value.includes(key))
}

function toggleDimensionGroup(group = {}) {
  const keys = (group.dimensions || []).map((item) => item.key)
  if (!keys.length) return
  if (isDimensionGroupSelected(group)) {
    selectedDimensions.value = selectedDimensions.value.filter((key) => !keys.includes(key))
    return
  }
  selectedDimensions.value = Array.from(new Set([...selectedDimensions.value, ...keys]))
}

function handleProviderChange() {
  const models = selectedProviderModels.value
  selectedModel.value = models.includes(selectedProvider.value?.model)
    ? selectedProvider.value.model
    : models[0] || ''
}

function clampExtractionChapter(value) {
  const number = Number(value) || 1
  return Math.min(Math.max(1, Math.floor(number)), chapterScopeMax.value)
}

function normalizeExtractionScopeValues() {
  if (!chapterCount.value) {
    extractionChapterStart.value = 1
    extractionChapterEnd.value = 1
    return
  }
  const start = clampExtractionChapter(extractionChapterStart.value)
  let end = clampExtractionChapter(extractionChapterEnd.value)
  if (end < start) end = start
  extractionChapterStart.value = start
  extractionChapterEnd.value = end
}

function applyDefaultExtractionScope(total = chapterCount.value) {
  const count = Number(total || 0)
  if (!count) {
    extractionChapterStart.value = 1
    extractionChapterEnd.value = 1
    return
  }
  if (extractionScopeTouched.value) {
    normalizeExtractionScopeValues()
    return
  }
  limitExtractionChapters.value = count > DEFAULT_EXTRACTION_CHAPTER_LIMIT
  extractionChapterStart.value = 1
  extractionChapterEnd.value = limitExtractionChapters.value
    ? Math.min(DEFAULT_EXTRACTION_CHAPTER_LIMIT, count)
    : count
}

function markExtractionScopeTouched() {
  extractionScopeTouched.value = true
  normalizeExtractionScopeValues()
}

function handleExtractionScopeToggle() {
  extractionScopeTouched.value = true
  normalizeExtractionScopeValues()
}

function useAllExtractionChapters() {
  if (!chapterCount.value) return
  extractionScopeTouched.value = true
  limitExtractionChapters.value = false
  extractionChapterStart.value = 1
  extractionChapterEnd.value = chapterCount.value
}

function queryNumber(value, fallback = 0) {
  const raw = Array.isArray(value) ? value[0] : value
  const number = Number(raw)
  return Number.isFinite(number) ? number : fallback
}

function applyRouteExtractionScope() {
  const query = route.query || {}
  const hasScopeQuery =
    query.chapterStart !== undefined ||
    query.chapterEnd !== undefined ||
    query.chapterLimit !== undefined
  if (!hasScopeQuery || !chapterCount.value) return
  const start = queryNumber(query.chapterStart, 1)
  const limit = queryNumber(query.chapterLimit, 0)
  const end =
    query.chapterEnd !== undefined
      ? queryNumber(query.chapterEnd, start)
      : limit > 0
        ? start + limit - 1
        : start
  extractionScopeTouched.value = true
  limitExtractionChapters.value = true
  extractionChapterStart.value = start
  extractionChapterEnd.value = end
  normalizeExtractionScopeValues()
}

function applyChapterRowScope(row = {}) {
  const chapterIndex = Number(row.index || 0)
  if (!chapterIndex) return
  extractionScopeTouched.value = true
  limitExtractionChapters.value = true
  extractionChapterStart.value = chapterIndex
  extractionChapterEnd.value = chapterIndex
  normalizeExtractionScopeValues()
}

function extractionChapterScopePayload() {
  if (!limitExtractionChapters.value || !chapterCount.value) return {}
  normalizeExtractionScopeValues()
  return {
    chapterStart: extractionChapterStart.value,
    chapterEnd: extractionChapterEnd.value,
    chapterLimit: selectedExtractionChapterCount.value
  }
}

async function confirmReplaceExtraction() {
  if (!book.value || extractionRunning.value) return
  try {
    await ElMessageBox.confirm(
      '重新拆书会把旧拆书任务标记为已替换，并让旧资产退出当前资产列表。历史记录仍会保留，可用于追溯。',
      '重新拆书',
      {
        confirmButtonText: '重新拆书',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await runExtraction('replace')
  } catch {
    // 用户取消。
  }
}

async function runExtraction(runMode = 'append') {
  if (!book.value || extractionRunning.value) return
  extractionError.value = ''
  currentExtractionProgress.value = null
  extractionLogs.value = []
  if (!selectedDimensions.value.length) {
    extractionError.value = '请至少选择一个提取内容。'
    return
  }
  if (textProviderError.value) {
    extractionError.value = textProviderError.value
    return
  }
  if (chapterLoadError.value) {
    extractionError.value = chapterLoadError.value
    return
  }
  if (!chapterCount.value) {
    extractionError.value = '当前书还没有可读取的章节，无法拆书。'
    return
  }
  extractionRunning.value = true
  try {
    const bookPath = await resolveBookPath()
    if (!bookPath) throw new Error('未找到书籍目录，请先在系统设置中选择书库。')
    const providerId = selectedProvider.value?.id || (await resolveFallbackProviderId())
    if (!providerId) throw new Error('未配置文本 AI 模型，请先到系统设置里添加文本模型。')
    const sourceBookName = book.value.folderName || book.value.name || bookId.value
    const chapterScopePayload = extractionChapterScopePayload()
    const localChapterScope = {
      start: limitExtractionChapters.value ? extractionChapterStart.value : 1,
      end: limitExtractionChapters.value ? extractionChapterEnd.value : chapterCount.value,
      totalChapterCount: chapterCount.value,
      selectedChapterCount: selectedExtractionChapterCount.value,
      limited: limitExtractionChapters.value,
      label: extractionScopeLabel.value
    }
    const initialDimensions = selectedDimensions.value.map((dimension) => ({
      id: `pending_${dimension}`,
      dimension,
      label: dimensionLabel(dimension),
      status: 'pending',
      currentGroup: '',
      extractedCount: 0,
      failedGroups: 0,
      progress: { current: 0, total: 0, percent: 0 }
    }))
    applyExtractionProgress({
      extractionId: `pending_${Date.now()}`,
      bookPath,
      status: 'running',
      currentStep: '正在创建拆书任务',
      overallPercent: 1,
      progress: {
        totalSubTasks: selectedDimensions.value.length,
        completedSubTasks: 0,
        failedSubTasks: 0,
        percent: 1
      },
      stats: {
        chapterCount: chapterCount.value,
        chapterScope: localChapterScope,
        totalExtractedCount: 0,
        failedGroups: 0,
        totalGroups: 0
      },
      subTasks: initialDimensions,
      logs: [
        {
          id: `local_${Date.now()}`,
          time: new Date().toISOString(),
          level: 'info',
          message: `已提交拆书请求，本次处理${extractionScopeLabel.value}。`
        }
      ]
    })
    const result = await createExtraction({
      bookPath,
      sourceBookName,
      sourceType: 'local',
      dimensions: selectedDimensions.value,
      sourceUrl: book.value.sourceUrl || '',
      sourceText: '',
      providerId,
      modelName: selectedModel.value || selectedProvider.value?.model || '',
      runMode,
      ...chapterScopePayload
    })
    if (result.jobId) {
      if (!canReadExtractionProgress()) {
        throw new Error('任务已创建，但当前环境无法读取进度，请稍后刷新作品资产台')
      }
      await pollExtractionJob(result.jobId, runMode)
      return
    }
    const completedResult = requireCompletedExtractionResult(result, '拆书失败')
    const successText =
      runMode === 'replace'
        ? '重新拆书完成，旧结果已标记为已替换。'
        : runMode === 'fillMissing'
          ? '补拆完成，已写入缺失内容。'
          : '拆书完成，已写入当前书的资产。'
    ElMessage.success(successText)
    await loadData()
    const summaryResult = {
      ...completedResult,
      results: undefined
    }
    currentExtractionProgress.value = summaryResult
    extractionLogs.value = completedResult.logs || extractionLogs.value
    activeTab.value = 'split'
    if (completedResult.id || completedResult.extractionId) {
      expandedExtractionId.value = completedResult.id || completedResult.extractionId
    }
  } catch (error) {
    extractionError.value = readableExtractionError(error)
    ElMessage.error(extractionError.value)
  } finally {
    extractionRunning.value = false
  }
}

function stopExtractionProgressPolling() {
  if (extractionProgressTimer) {
    clearTimeout(extractionProgressTimer)
    extractionProgressTimer = null
  }
}

async function pollExtractionJob(jobId, runMode = 'append') {
  stopExtractionProgressPolling()
  extractionRunning.value = true
  return await new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await getExtractionProgress(jobId)
        if (response?.progress) {
          applyExtractionProgress({
            ...response.progress,
            extractionId: response.progress.extractionId || jobId
          })
        }
        if (response?.done) {
          stopExtractionProgressPolling()
          const result = response.result || response.progress || {}
          const completedResult = requireCompletedExtractionResult(result, '拆书失败')
          const successText =
            runMode === 'replace'
              ? '重新拆书完成，旧结果已标记为已替换。'
              : runMode === 'fillMissing'
                ? '补拆完成，已写入缺失内容。'
                : '拆书完成，已写入当前书的资产。'
          ElMessage.success(successText)
          await loadData()
          currentExtractionProgress.value = {
            ...completedResult,
            results: undefined
          }
          extractionLogs.value = completedResult.logs || extractionLogs.value
          activeTab.value = 'split'
          expandedExtractionId.value = completedResult.id || completedResult.extractionId
          extractionRunning.value = false
          resolve(completedResult)
          return
        }
        extractionProgressTimer = setTimeout(tick, 1000)
      } catch (error) {
        stopExtractionProgressPolling()
        extractionRunning.value = false
        extractionError.value = readableExtractionError(error)
        reject(error)
      }
    }
    tick()
  })
}

function canPollExtractionProgress() {
  return canReadExtractionProgress()
}

function onExtractionProgress(event) {
  const payload = event?.detail || event || {}
  if (!payload?.extractionId) return
  applyExtractionProgress(payload)
}

function applyExtractionProgress(payload) {
  if (
    payload.bookPath &&
    activeExtractionProgress.value?.bookPath &&
    payload.bookPath !== activeExtractionProgress.value.bookPath
  ) {
    return
  }
  currentExtractionProgress.value = {
    ...(currentExtractionProgress.value || {}),
    ...payload,
    results: undefined,
    progress: {
      ...(currentExtractionProgress.value?.progress || {}),
      ...(payload.progress || {})
    },
    stats: {
      ...(currentExtractionProgress.value?.stats || {}),
      ...(payload.stats || {})
    },
    subTasks: payload.subTasks || currentExtractionProgress.value?.subTasks || [],
    logs: payload.logs || currentExtractionProgress.value?.logs || []
  }
  if (Array.isArray(payload.logs)) {
    const map = new Map(
      extractionLogs.value.map((log) => [log.id || `${log.time}:${log.message}`, log])
    )
    for (const log of payload.logs) {
      map.set(log.id || `${log.time}:${log.message}`, log)
    }
    extractionLogs.value = Array.from(map.values()).slice(-80)
  }
  extractionRunning.value = ['running', 'extracting', 'processing'].includes(payload.status)
  if (payload.status === 'failed') {
    extractionError.value = payload.error || payload.message || '拆书失败'
  }
}

async function resolveFallbackProviderId() {
  const active = await getActiveTextProvider()
  if (active?.providerId) return active.providerId
  return textProviders.value[0]?.id || ''
}

async function resolveBookPath() {
  const booksDir = await getBookDir()
  const folderName = book.value?.folderName || book.value?.name || bookId.value
  if (!booksDir || !folderName) return ''
  return joinPath(booksDir, folderName)
}

function joinPath(base, child) {
  const cleanBase = String(base || '').replace(/[\\/]+$/, '')
  const cleanChild = String(child || '').replace(/^[\\/]+/, '')
  return `${cleanBase}\\${cleanChild}`
}

function readableExtractionError(error) {
  const message = error?.message || String(error || '')
  if (message.includes('源文本') || message.includes('章节内容') || message.includes('正文目录')) {
    return '没有读到这本书的正文，请先确认章节已经下载完成。'
  }
  if (message.includes('AI') || message.includes('服务商') || message.includes('模型')) {
    return message
  }
  return message || '拆书失败'
}

function openOutlineTool() {
  if (!book.value) return
  router.push({
    path: '/ai/plot',
    query: { bookId: bookId.value, name: book.value.folderName || book.value.name, tool: 'outline' }
  })
}

async function saveAssetToMaterial(item) {
  try {
    const now = new Date().toISOString()
    const sourceBookName = book.value?.folderName || book.value?.name || bookId.value
    const appliedTarget = item.adopt ? await adoptAssetToBook(item) : ''
    const result = await updateKnowledgeItem(item.id, {
      status: item.adopt ? 'active' : item.status || 'active',
      relatedBookIds: mergeRelatedBookIds(item),
      metadata: {
        ...(item.metadata || {}),
        sourceBookId: item.metadata?.sourceBookId || bookId.value,
        sourceBookName: item.metadata?.sourceBookName || sourceBookName,
        targetBookId: item.adopt ? bookId.value : item.metadata?.targetBookId,
        usage: item.adopt ? 'canon' : 'reference',
        assetStatus: item.adopt ? 'adopted' : 'saved',
        savedToMaterialAt: item.adopt ? item.metadata?.savedToMaterialAt : now,
        savedToMaterialBookId: item.adopt ? item.metadata?.savedToMaterialBookId : bookId.value,
        savedToMaterialBookName: item.adopt
          ? item.metadata?.savedToMaterialBookName
          : sourceBookName,
        appliedTarget: item.adopt ? appliedTarget : item.metadata?.appliedTarget,
        appliedAt: item.adopt ? new Date().toISOString() : item.metadata?.appliedAt
      }
    })
    assertItemResult(result, '保存失败')
    ElMessage.success(item.adopt ? `已加入当前作品：${appliedTarget}` : '已保存到素材箱')
    await loadData()
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

function openMaterialBox(item = {}) {
  const sourceBookName = book.value?.folderName || book.value?.name || bookId.value
  router.push({
    path: '/knowledge/materials',
    query: {
      bookId: bookId.value,
      name: sourceBookName,
      ...(item.title ? { q: item.title } : {})
    }
  })
}

async function adoptAssetToBook(item = {}) {
  const targetBookName = book.value?.folderName || book.value?.name || bookId.value
  if (!targetBookName) throw new Error('没有找到当前作品')
  if (isRelationshipAsset(item)) return appendRelationshipAsset(targetBookName, item)
  if (isTimelineAsset(item)) return appendTimelineAsset(targetBookName, item)
  if (isLocationFactionAsset(item)) return appendLocationFactionAsset(targetBookName, item)
  if (isCharacterAsset(item)) return appendCharacterAsset(targetBookName, item)
  if (isForeshadowingAsset(item)) return appendForeshadowingAsset(targetBookName, item)
  if (isOutlineAsset(item)) return appendOutlineAsset(targetBookName, item)
  return appendSettingAsset(targetBookName, item)
}

function mergeRelatedBookIds(item = {}) {
  const ids = new Set(
    [...(item.relatedBookIds || []), ...bookIdentifiers(book.value || {})]
      .filter(Boolean)
      .map(String)
  )
  return Array.from(ids)
}

function isCharacterAsset(item = {}) {
  return (
    ['character', 'character_setting'].includes(item.type) ||
    ['character', 'characterSetting'].includes(item.metadata?.dimension)
  )
}

function isOutlineAsset(item = {}) {
  return (
    ['plot_fragment', 'foreshadowing'].includes(item.type) ||
    ['plot', 'chapterOutline', 'foreshadowing'].includes(item.metadata?.dimension)
  )
}

function isRelationshipAsset(item = {}) {
  return (
    item.type === 'relationship' ||
    item.metadata?.dimension === 'relationship' ||
    hasExplicitRelationshipEndpoints(item)
  )
}

function isTimelineAsset(item = {}) {
  return (
    ['timeline', 'timeline_event'].includes(item.type) ||
    item.metadata?.dimension === 'timeline' ||
    hasTimelineEventInfo(item)
  )
}

function isLocationFactionAsset(item = {}) {
  return (
    ['location', 'organization', 'faction'].includes(item.type) ||
    item.metadata?.dimension === 'locationFaction'
  )
}

function isForeshadowingAsset(item = {}) {
  return (
    ['foreshadowing', 'clue'].includes(item.type) ||
    item.metadata?.dimension === 'foreshadowing' ||
    hasForeshadowingInfo(item)
  )
}

async function appendRelationshipAsset(targetBookName, item) {
  const info = relationshipAssetInfo(item)
  if (!info.source || !info.target) {
    throw new Error('关系素材缺少人物名称，无法加入关系图')
  }

  const relationshipName = '主关系图'
  const payload = await ensureMainRelationshipData(targetBookName, relationshipName)
  const sourceNode = ensureRelationshipNode(payload.nodes, info.source, item)
  const targetNode = ensureRelationshipNode(payload.nodes, info.target, item)
  const lineText = relationshipLineText(info)
  const exists = payload.lines.some((line) =>
    sameRelationshipLine(line, sourceNode.id, targetNode.id, lineText, info.relation)
  )

  if (!exists) {
    payload.lines.push({
      id: genId(),
      from: sourceNode.id,
      to: targetNode.id,
      text: lineText,
      fontColor: '#6f7a68',
      lineShape: 1,
      data: {
        sourceKnowledgeId: item.id || '',
        relation: info.relation || '',
        evidence: info.evidence || ''
      }
    })
  }

  payload.updatedAt = new Date().toISOString()
  await writeRelationshipGraphData(targetBookName, relationshipName, payload)
  return `关系图：${relationshipName}`
}

async function appendTimelineAsset(targetBookName, item) {
  const timelineName = '主时间线'
  const payload = normalizeTimelinePayload(await readTimelineDocument(targetBookName))
  const timeline = ensureTimeline(payload, timelineName)
  const nodes = timelineAssetNodes(item)
  if (!nodes.length) {
    throw new Error('时间线素材缺少事件内容，无法加入时间线')
  }

  let changed = false
  nodes.forEach((node) => {
    const exists = timeline.nodes.some((entry) => sameTimelineNode(entry, node))
    if (exists) return
    timeline.nodes.push(node)
    changed = true
  })

  if (changed) {
    await writeTimelineDocument(targetBookName, payload)
  }
  return `时间线：${timeline.title}`
}

async function appendLocationFactionAsset(targetBookName, item) {
  const organizationName = '主势力图'
  const payload = await ensureMainOrganizationData(targetBookName, organizationName)
  const rows = locationFactionRows(item)
  if (!rows.length) {
    throw new Error('地点势力素材缺少名称，无法加入势力图')
  }

  let changed = false
  const nodeCountBeforeRoot = payload.nodes.length
  const rootNode = ensureOrganizationRootNode(payload.nodes)
  changed = payload.nodes.length !== nodeCountBeforeRoot
  rows.forEach((row, index) => {
    const info = locationFactionInfo(item, row, index)
    if (!info.name) return
    const node = ensureOrganizationNode(payload.nodes, info, item, index)
    changed =
      ensureOrganizationLine(payload.lines, rootNode.id, node.id, info.kind || '地点势力', item) ||
      changed
    changed = appendOrganizationChildNodes(payload, node, info.members, '成员', item) || changed
    changed = appendOrganizationChildNodes(payload, node, info.resources, '资源', item) || changed
  })

  if (changed) {
    payload.updatedAt = new Date().toISOString()
    await writeOrganizationGraphData(targetBookName, organizationName, payload)
  }
  return `势力图：${organizationName}`
}

async function appendForeshadowingAsset(targetBookName, item) {
  const chartTitle = '伏笔线索'
  const charts = normalizeSequenceChartsPayload(await readSequenceChartsDocument(targetBookName))
  const chart = ensureSequenceChart(charts, chartTitle)
  const events = foreshadowingAssetEvents(item)
  if (!events.length) {
    throw new Error('伏笔素材缺少线索内容，无法加入事序图')
  }

  let changed = false
  events.forEach((event) => {
    const exists = chart.events.some((entry) => sameSequenceEvent(entry, event))
    if (exists) return
    const eventIndex = chart.events.length
    chart.events.push({
      ...event,
      index: eventIndex + 1,
      color: event.color || sequenceEventColor(eventIndex)
    })
    changed = true
  })

  if (changed) {
    await writeSequenceChartsDocument(targetBookName, charts)
  }
  return `事序图：${chart.title}`
}

async function appendCharacterAsset(targetBookName, item) {
  const characters = await readCharactersDocument(targetBookName)
  const name = assetTitle(item, '未命名角色')
  const existing = characters.find((entry) => sameText(entry?.name, name))
  if (!existing) {
    characters.push({
      id: genId(),
      name,
      age: 18,
      gender: '男',
      height: 170,
      tags: normalizeTags(item),
      biography: assetBody(item),
      appearance: '',
      avatar: '',
      characterImages: [],
      markerColor: '',
      sourceKnowledgeId: item.id || ''
    })
    await writeCharactersDocument(targetBookName, characters)
  }
  return '人物档案'
}

async function appendSettingAsset(targetBookName, item) {
  const data = await readSettingsDocument(targetBookName)
  const payload = normalizeSettingsPayload(data)
  const category = ensureSettingCategory(payload.categories, settingCategoryName(item))
  const name = assetTitle(item, '未命名设定')
  const introduction = assetBody(item)
  const existing = category.items.find(
    (entry) => sameText(entry?.name, name) && sameText(entry?.introduction, introduction)
  )
  if (!existing) {
    category.items.push({
      id: genId(),
      name,
      introduction
    })
    await writeSettingsDocument(targetBookName, payload)
  }
  return '设定集'
}

async function appendOutlineAsset(targetBookName, item) {
  const data = await readOutlineDocument(targetBookName)
  const payload = normalizeOutlinePayload(data)
  const section = ensureOutlineSection(payload.children, outlineSectionName(item))
  const title = assetTitle(item, '未命名剧情素材')
  const content = assetBody(item)
  const existing = section.children.find(
    (entry) =>
      entry?.sourceKnowledgeId === item.id ||
      (sameText(entry?.title, title) && sameText(entry?.content, content))
  )
  if (!existing) {
    section.children.push({
      id: genId(),
      title,
      content,
      children: [],
      sourceKnowledgeId: item.id || ''
    })
    await writeOutlineDocument(targetBookName, payload)
  }
  return '大纲'
}

function assertSuccessResult(result, message) {
  if (result?.success !== true) throw new Error(result?.message || result?.error || message)
}

function assertItemResult(result, message) {
  assertSuccessResult(result, message)
  if (!result.item) throw new Error(message)
}

async function ensureMainRelationshipData(targetBookName, relationshipName) {
  const graphs = await readRelationshipGraphs(targetBookName)
  const existing = graphs.find(
    (item) => sameText(item?.name, relationshipName) || sameText(item?.id, relationshipName)
  )
  if (!existing) {
    try {
      await createRelationshipGraph(
        targetBookName,
        relationshipName,
        defaultRelationshipData(relationshipName)
      )
    } catch (error) {
      if (!String(error?.message || '').includes('已存在')) {
        throw error
      }
    }
  }

  const relationshipData = await readRelationshipGraphData(targetBookName, relationshipName)
  const payload = normalizeRelationshipPayload(relationshipData, relationshipName)
  if (!payload.nodes.length) {
    payload.nodes.push(defaultRelationshipRootNode())
  }
  return payload
}

function defaultRelationshipData(relationshipName) {
  const now = new Date().toISOString()
  return {
    id: relationshipName,
    name: relationshipName,
    description: `${bookTitle(book.value)} 的人物关系总览`,
    nodes: [defaultRelationshipRootNode()],
    lines: [],
    createdAt: now,
    updatedAt: now
  }
}

function defaultRelationshipRootNode() {
  return {
    id: genId(),
    text: bookTitle(book.value),
    type: 'root',
    color: '#6f7a68',
    data: {
      description: '当前作品的主关系图根节点',
      fontSize: 16,
      avatar: ''
    }
  }
}

function normalizeRelationshipPayload(data, relationshipName) {
  const now = new Date().toISOString()
  return {
    id: String(data?.id || relationshipName),
    name: String(data?.name || relationshipName),
    description: String(data?.description || `${bookTitle(book.value)} 的人物关系总览`),
    nodes: Array.isArray(data?.nodes) ? data.nodes.map(normalizeRelationshipNode) : [],
    lines: Array.isArray(data?.lines) ? data.lines.map(normalizeRelationshipLine) : [],
    createdAt: data?.createdAt || now,
    updatedAt: data?.updatedAt || now
  }
}

function normalizeRelationshipNode(node = {}) {
  return {
    ...node,
    id: String(node.id || genId()),
    text: String(node.text || node.name || '未命名人物').trim() || '未命名人物',
    type: node.type || 'character',
    color: node.color || '#6f7a68',
    data: {
      ...(node.data || {}),
      description: node.data?.description || node.description || '',
      fontSize: node.data?.fontSize || node.fontSize || 16,
      avatar: node.data?.avatar || ''
    }
  }
}

function normalizeRelationshipLine(line = {}) {
  return {
    ...line,
    id: String(line.id || genId()),
    from: String(line.from || ''),
    to: String(line.to || ''),
    text: String(line.text || ''),
    fontColor: line.fontColor || '#6f7a68',
    lineShape: line.lineShape || 1
  }
}

function ensureRelationshipNode(nodes, name, item = {}) {
  const found = nodes.find((node) => sameText(node?.text, name))
  if (found) return found
  const index = nodes.length
  const node = {
    id: genId(),
    text: name,
    type: 'character',
    color: '#6f7a68',
    width: 80,
    height: 80,
    x: 120 + (index % 4) * 160,
    y: 120 + Math.floor(index / 4) * 120,
    data: {
      description: '由人物关系素材加入。',
      fontSize: 16,
      avatar: '',
      sourceKnowledgeId: item.id || ''
    }
  }
  nodes.push(node)
  return node
}

function sameRelationshipLine(line, sourceId, targetId, text, relation = '') {
  const sameDirection = sameText(line.from, sourceId) && sameText(line.to, targetId)
  const reverseDirection = sameText(line.from, targetId) && sameText(line.to, sourceId)
  if (!sameDirection && !reverseDirection) return false
  const storedRelation = cleanupRelationshipName(line.data?.relation)
  if ((storedRelation || relation) && sameText(storedRelation, relation)) return true
  return sameText(line.text || '', text || '')
}

function relationshipAssetInfo(item = {}) {
  const parsed = parseRelationshipText(assetBody(item))
  const titlePair = relationshipPairFromTitle(assetTitle(item, ''))
  return {
    source: firstText(
      item.source,
      item.from,
      item.characterA,
      item.roleA,
      item.personA,
      item['角色A'],
      item.metadata?.source,
      item.metadata?.from,
      parsed.source,
      parsed.from,
      parsed.charactera,
      parsed.rolea,
      parsed.persona,
      parsed['角色a'],
      titlePair.source
    ),
    target: firstText(
      item.target,
      item.to,
      item.characterB,
      item.roleB,
      item.personB,
      item['角色B'],
      item.metadata?.target,
      item.metadata?.to,
      parsed.target,
      parsed.to,
      parsed.characterb,
      parsed.roleb,
      parsed.personb,
      parsed['角色b'],
      titlePair.target
    ),
    relation: firstText(
      item.relation,
      item.relationship,
      item.typeName,
      parsed.relation,
      parsed.relationship,
      parsed.type,
      parsed['关系类型'],
      parsed['关系']
    ),
    attitude: firstText(item.attitude, parsed.attitude, parsed['当前态度'], parsed['态度']),
    conflict: firstText(
      item.conflict,
      item.interest,
      parsed.conflict,
      parsed.interest,
      parsed['冲突或利益'],
      parsed['冲突'],
      parsed['利益']
    ),
    trend: firstText(item.trend, parsed.trend, parsed['变化趋势'], parsed['趋势']),
    evidence: firstText(item.evidence, parsed.evidence, parsed['原文依据'])
  }
}

function hasExplicitRelationshipEndpoints(item = {}) {
  const parsed = parseRelationshipText(assetBody(item))
  const source = firstText(
    item.source,
    item.from,
    item.characterA,
    item.roleA,
    item.personA,
    item['角色A'],
    item.metadata?.source,
    item.metadata?.from,
    parsed.source,
    parsed.from,
    parsed.charactera,
    parsed.rolea,
    parsed.persona,
    parsed['角色a']
  )
  const target = firstText(
    item.target,
    item.to,
    item.characterB,
    item.roleB,
    item.personB,
    item['角色B'],
    item.metadata?.target,
    item.metadata?.to,
    parsed.target,
    parsed.to,
    parsed.characterb,
    parsed.roleb,
    parsed.personb,
    parsed['角色b']
  )
  return Boolean(source && target)
}

function parseRelationshipText(text = '') {
  const rawText = String(text || '').trim()
  if (!rawText) return {}
  const jsonValue = tryParseObject(rawText)
  if (jsonValue) return normalizeRelationshipKeys(jsonValue)
  const result = {}
  rawText.split(/[；;\n\r]+/).forEach((part) => {
    const match = String(part || '').match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/)
    if (!match) return
    result[normalizeRelationshipKey(match[1])] = match[2]
  })
  return result
}

function tryParseObject(text) {
  if (!text.startsWith('{') || !text.endsWith('}')) return null
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function normalizeRelationshipKeys(value = {}) {
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      normalizeRelationshipKey(key),
      Array.isArray(val) ? val.join('，') : val
    ])
  )
}

function normalizeRelationshipKey(key = '') {
  return String(key || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function relationshipPairFromTitle(title = '') {
  const text = String(title || '').trim()
  const match = text.match(/^(.+?)\s*(?:↔|⇄|⟷|→|->|与|和)\s*(.+)$/)
  if (!match) return {}
  return {
    source: cleanupRelationshipName(match[1]),
    target: cleanupRelationshipName(match[2])
  }
}

function relationshipLineText(info = {}) {
  const parts = [
    info.relation,
    info.attitude ? `态度：${info.attitude}` : '',
    info.conflict ? `冲突或利益：${info.conflict}` : '',
    info.trend ? `变化：${info.trend}` : ''
  ].filter(Boolean)
  return parts.join('；') || '关系'
}

function firstText(...values) {
  return values.map(cleanupRelationshipName).find(Boolean) || ''
}

function cleanupRelationshipName(value) {
  return String(value || '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
}

async function ensureMainOrganizationData(targetBookName, organizationName) {
  const graphs = await readOrganizationGraphs(targetBookName)
  const existing = graphs.find(
    (item) => sameText(item?.name, organizationName) || sameText(item?.id, organizationName)
  )
  if (!existing) {
    try {
      await createOrganizationGraph(
        targetBookName,
        organizationName,
        defaultOrganizationData(organizationName)
      )
    } catch (error) {
      if (!String(error?.message || '').includes('已存在')) {
        throw error
      }
    }
  }

  const organizationResult = await readOrganizationGraphData(targetBookName, organizationName)
  return normalizeOrganizationPayload(organizationResult, organizationName)
}

function defaultOrganizationData(organizationName) {
  const now = new Date().toISOString()
  return {
    id: organizationName,
    name: organizationName,
    description: `${bookTitle(book.value)} 的地点与势力总览`,
    nodes: [defaultOrganizationRootNode()],
    lines: [],
    createdAt: now,
    updatedAt: now
  }
}

function defaultOrganizationRootNode() {
  return {
    id: genId(),
    text: bookTitle(book.value),
    type: 'root',
    color: '#6f7a68',
    data: {
      description: '当前作品的地点与势力总览根节点',
      fontSize: 16,
      avatar: ''
    }
  }
}

function normalizeOrganizationPayload(data, organizationName) {
  const now = new Date().toISOString()
  return {
    id: String(data?.id || organizationName),
    name: String(data?.name || organizationName),
    description: String(data?.description || `${bookTitle(book.value)} 的地点与势力总览`),
    nodes: Array.isArray(data?.nodes) ? data.nodes.map(normalizeOrganizationNode) : [],
    lines: Array.isArray(data?.lines) ? data.lines.map(normalizeOrganizationLine) : [],
    createdAt: data?.createdAt || now,
    updatedAt: data?.updatedAt || now
  }
}

function normalizeOrganizationNode(node = {}) {
  return {
    ...node,
    id: String(node.id || genId()),
    text: String(node.text || node.name || '未命名节点').trim() || '未命名节点',
    type: node.type || 'organization',
    color: node.color || organizationNodeColor(node.type || node.kind || ''),
    data: {
      ...(node.data || {}),
      description: node.data?.description || node.description || '',
      fontSize: node.data?.fontSize || node.fontSize || 16,
      avatar: node.data?.avatar || ''
    }
  }
}

function normalizeOrganizationLine(line = {}) {
  return {
    ...line,
    id: String(line.id || genId()),
    from: String(line.from || ''),
    to: String(line.to || ''),
    text: String(line.text || ''),
    fontColor: line.fontColor || '#6f7a68',
    lineShape: line.lineShape || 1
  }
}

function ensureOrganizationRootNode(nodes) {
  const found = nodes.find((node) => node.type === 'root')
  if (found) return found
  const root = defaultOrganizationRootNode()
  nodes.unshift(root)
  return root
}

function ensureOrganizationNode(nodes, info = {}, item = {}, index = 0) {
  const found = nodes.find(
    (node) =>
      sameText(node?.text, info.name) ||
      (item.id &&
        node?.data?.sourceKnowledgeId === item.id &&
        sameText(node?.data?.sourceAssetName, info.name))
  )
  if (found) return found
  const nodeType = organizationNodeType(info.kind)
  const node = {
    id: genId(),
    text: info.name,
    type: nodeType,
    color: organizationNodeColor(nodeType),
    width: 120,
    height: 44,
    x: 160 + (index % 4) * 170,
    y: 160 + Math.floor(index / 4) * 130,
    data: {
      description: locationFactionDescription(info),
      fontSize: 16,
      avatar: '',
      kind: info.kind,
      sourceKnowledgeId: item.id || '',
      sourceAssetName: info.name
    }
  }
  nodes.push(node)
  return node
}

function ensureOrganizationLine(lines, from, to, text, item = {}) {
  const exists = lines.some(
    (line) => sameText(line.from, from) && sameText(line.to, to) && sameText(line.text, text)
  )
  if (exists) return false
  lines.push({
    id: genId(),
    from,
    to,
    text,
    fontColor: '#6f7a68',
    lineShape: 1,
    data: {
      sourceKnowledgeId: item.id || ''
    }
  })
  return true
}

function appendOrganizationChildNodes(payload, parentNode, names, relationText, item = {}) {
  const list = splitLocationFactionList(names)
  let changed = false
  list.forEach((name, index) => {
    const childType = relationText === '资源' ? 'resource' : 'member'
    const child = ensureOrganizationChildNode(
      payload.nodes,
      parentNode,
      name,
      childType,
      item,
      index
    )
    changed =
      ensureOrganizationLine(payload.lines, parentNode.id, child.id, relationText, item) || changed
  })
  return changed
}

function ensureOrganizationChildNode(nodes, parentNode, name, type, item = {}, index = 0) {
  const found = nodes.find(
    (node) =>
      sameText(node?.text, name) &&
      sameText(node?.data?.parentAssetName, parentNode.text) &&
      sameText(node?.type, type)
  )
  if (found) return found
  const parentIndex = nodes.findIndex((node) => node.id === parentNode.id)
  const node = {
    id: genId(),
    text: name,
    type,
    color: organizationNodeColor(type),
    width: 110,
    height: 40,
    x: Number(parentNode.x || 160) + 140 + (index % 2) * 120,
    y: Number(parentNode.y || 160) + 80 + (parentIndex % 4) * 10,
    data: {
      description: `由“${parentNode.text}”素材记录的${type === 'resource' ? '资源' : '成员'}。`,
      fontSize: 14,
      avatar: '',
      sourceKnowledgeId: item.id || '',
      parentAssetName: parentNode.text
    }
  }
  nodes.push(node)
  return node
}

function locationFactionRows(item = {}) {
  const rows = []
  if (locationFactionObjectHasName(item)) rows.push(item)
  if (locationFactionObjectHasName(item.metadata || {})) rows.push(item.metadata)
  rows.push(...locationFactionRowsFromParsed(parseLocationFactionText(assetBody(item))))
  if (
    !rows.length &&
    (item.metadata?.dimension === 'locationFaction' ||
      ['location', 'organization', 'faction'].includes(item.type))
  ) {
    rows.push(item)
  }
  return rows.filter((row) => locationFactionInfo(item, row).name)
}

function locationFactionRowsFromParsed(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'object') return []
  const map = normalizeLocationFactionMap(value)
  const nested = firstTimelineArray(
    map.locations,
    map.items,
    map.organizations,
    map.factions,
    map.data
  )
  return nested.length ? nested : [value]
}

function locationFactionInfo(item = {}, row = {}, index = 0) {
  const rowMap = normalizeLocationFactionMap(row)
  const itemMap = normalizeLocationFactionMap(item)
  const metaMap = normalizeLocationFactionMap(item.metadata || {})
  return {
    name: firstTimelineText(
      pickLocationFactionValue(rowMap, [
        'name',
        '名称',
        'location',
        '地点',
        'faction',
        '势力',
        'organization',
        '组织',
        'title',
        '标题'
      ]),
      pickLocationFactionValue(itemMap, [
        'name',
        '名称',
        'location',
        '地点',
        'faction',
        '势力',
        'organization',
        '组织',
        'title',
        '标题'
      ]),
      assetTitle(item, '')
    ),
    kind: firstTimelineText(
      pickLocationFactionValue(rowMap, ['kind', '类型', '类别']),
      pickLocationFactionValue(itemMap, ['kind', '类型', '类别']),
      pickLocationFactionValue(metaMap, ['kind', '类型', '类别'])
    ),
    scope: firstTimelineText(
      pickLocationFactionValue(rowMap, ['scope', '范围', '位置', '活动范围']),
      pickLocationFactionValue(itemMap, ['scope', '范围', '位置', '活动范围'])
    ),
    members: firstTimelineText(
      pickLocationFactionValue(rowMap, ['members', '成员', '角色', '人物']),
      pickLocationFactionValue(itemMap, ['members', '成员', '角色', '人物'])
    ),
    resources: firstTimelineText(
      pickLocationFactionValue(rowMap, ['resources', '资源', '物资', '道具']),
      pickLocationFactionValue(itemMap, ['resources', '资源', '物资', '道具'])
    ),
    goal: firstTimelineText(
      pickLocationFactionValue(rowMap, ['goal', '目标', '目的']),
      pickLocationFactionValue(itemMap, ['goal', '目标', '目的'])
    ),
    relationToProtagonist: firstTimelineText(
      pickLocationFactionValue(rowMap, ['relationToProtagonist', '与主角关系', '关系']),
      pickLocationFactionValue(itemMap, ['relationToProtagonist', '与主角关系', '关系'])
    ),
    evidence: firstTimelineText(
      pickLocationFactionValue(rowMap, ['evidence', '原文依据', '依据']),
      pickLocationFactionValue(itemMap, ['evidence', '原文依据', '依据'])
    ),
    fallbackBody: firstTimelineText(assetBody(item), `地点势力 ${index + 1}`)
  }
}

function locationFactionDescription(info = {}) {
  return (
    [
      info.kind ? `类型：${info.kind}` : '',
      info.scope ? `范围：${info.scope}` : '',
      info.goal ? `目标：${info.goal}` : '',
      info.relationToProtagonist ? `与主角关系：${info.relationToProtagonist}` : '',
      info.evidence ? `依据：${info.evidence}` : ''
    ]
      .filter(Boolean)
      .join('\n') ||
    info.fallbackBody ||
    ''
  )
}

function parseLocationFactionText(text = '') {
  const rawText = String(text || '').trim()
  if (!rawText) return null
  const jsonValue = tryParseJsonValue(rawText)
  if (jsonValue) return jsonValue
  const result = {}
  rawText.split(/[；;\n\r]+/).forEach((part) => {
    const match = String(part || '').match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/)
    if (!match) return
    result[normalizeLocationFactionKey(match[1])] = match[2]
  })
  return Object.keys(result).length ? result : null
}

function normalizeLocationFactionMap(value = {}) {
  if (typeof value === 'string')
    return normalizeLocationFactionMap(parseLocationFactionText(value) || {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [normalizeLocationFactionKey(key), val])
  )
}

function normalizeLocationFactionKey(key = '') {
  return String(key || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function pickLocationFactionValue(map = {}, keys = []) {
  for (const key of keys) {
    const value = map[normalizeLocationFactionKey(key)]
    if (value !== undefined && value !== null && firstTimelineText(value)) return value
  }
  return ''
}

function locationFactionObjectHasName(value = {}) {
  const map = normalizeLocationFactionMap(value)
  return Boolean(
    pickLocationFactionValue(map, [
      'name',
      '名称',
      'location',
      '地点',
      'faction',
      '势力',
      'organization',
      '组织'
    ])
  )
}

function splitLocationFactionList(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(firstTimelineText).filter(Boolean)))
  return Array.from(
    new Set(
      String(value || '')
        .split(/[、,，；;\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function organizationNodeType(kind = '') {
  const text = String(kind || '').toLowerCase()
  if (text.includes('地点') || text.includes('location')) return 'location'
  if (text.includes('资源') || text.includes('resource')) return 'resource'
  return 'organization'
}

function organizationNodeColor(type = '') {
  const map = {
    root: '#6f7a68',
    location: '#6a7f91',
    organization: '#7a6f91',
    member: '#8a735d',
    resource: '#6f8576'
  }
  return map[type] || '#6f7a68'
}

function normalizeSequenceChartsPayload(data) {
  return data.map(normalizeSequenceChart)
}

function normalizeSequenceChart(chart = {}) {
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) {
    throw new Error('读取事序图失败：图表格式异常')
  }
  if (Object.prototype.hasOwnProperty.call(chart, 'events') && !Array.isArray(chart.events)) {
    throw new Error('读取事序图失败：events 必须是数组')
  }
  const now = new Date().toISOString()
  return {
    ...chart,
    id: String(chart.id || genId()),
    title: String(chart.title || '伏笔线索').trim() || '伏笔线索',
    cellCount: Math.max(100, Number(chart.cellCount) || 100),
    events: (chart.events || []).map(normalizeSequenceEvent),
    createdAt: chart.createdAt || now
  }
}

function normalizeSequenceEvent(event = {}, index = 0) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('读取事序图失败：事件格式异常')
  }
  const startTime = clampSequenceCell(event.startTime, 1)
  const endTime = clampSequenceCell(event.endTime, startTime)
  return {
    ...event,
    id: String(event.id || genId()),
    index: Number(event.index) || index + 1,
    introduction: shortenTimelineText(event.introduction || event.title || '未命名线索', 30),
    detail: String(event.detail || event.description || '').trim(),
    progress: clampSequenceProgress(event.progress),
    startTime,
    endTime: Math.max(startTime, endTime),
    color: event.color || sequenceEventColor(index),
    sourceKnowledgeId: String(event.sourceKnowledgeId || event.data?.sourceKnowledgeId || ''),
    sourceEventKey: String(event.sourceEventKey || '')
  }
}

function ensureSequenceChart(charts, title) {
  const found = charts.find((chart) => sameText(chart.title, title) || sameText(chart.id, title))
  if (found) {
    if (!Array.isArray(found.events)) found.events = []
    if (!found.cellCount) found.cellCount = 100
    return found
  }
  const chart = {
    id: genId(),
    title,
    cellCount: 100,
    events: [],
    createdAt: new Date().toISOString()
  }
  charts.push(chart)
  return chart
}

function foreshadowingAssetEvents(item = {}) {
  return foreshadowingRows(item)
    .map((row, index) => sequenceEventFromForeshadowing(item, row, index))
    .filter((event) => event.introduction)
}

function sequenceEventFromForeshadowing(item = {}, row = {}, index = 0) {
  const info = foreshadowingInfo(item, row, index)
  const startTime = foreshadowingStartTime(info, index)
  const detail = shortenMultilineText(foreshadowingDetail(info, item), 200)
  const introduction = shortenTimelineText(
    info.title || info.setup || assetTitle(item, `线索 ${index + 1}`),
    30
  )
  return {
    id: genId(),
    introduction,
    detail,
    progress: foreshadowingProgress(info),
    startTime,
    endTime: Math.min(100, Math.max(startTime, startTime + 2)),
    color: sequenceEventColor(index),
    sourceKnowledgeId: String(item.id || ''),
    sourceEventKey: foreshadowingEventKey(item, index, introduction, detail)
  }
}

function foreshadowingRows(item = {}) {
  const parsedRows = foreshadowingRowsFromParsed(parseForeshadowingText(assetBody(item)))
  if (parsedRows.length)
    return parsedRows.filter((row) => {
      const info = foreshadowingInfo(item, row)
      return info.title || info.setup || info.payoff || info.evidence
    })

  const rows = []
  if (foreshadowingObjectHasContent(item)) rows.push(item)
  if (foreshadowingObjectHasContent(item.metadata || {})) rows.push(item.metadata)
  if (
    !rows.length &&
    (item.metadata?.dimension === 'foreshadowing' || ['foreshadowing', 'clue'].includes(item.type))
  ) {
    rows.push(item)
  }
  return rows.filter((row) => {
    const info = foreshadowingInfo(item, row)
    return info.title || info.setup || info.payoff || info.evidence
  })
}

function foreshadowingRowsFromParsed(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'object') return []
  const map = normalizeForeshadowingMap(value)
  const nested = firstTimelineArray(map.clues, map.foreshadowing, map.items, map.data)
  return nested.length ? nested : [value]
}

function foreshadowingInfo(item = {}, row = {}, index = 0) {
  const rowMap = normalizeForeshadowingMap(row)
  const itemMap = normalizeForeshadowingMap(item)
  const metaMap = normalizeForeshadowingMap(item.metadata || {})
  return {
    title: firstTimelineText(
      pickForeshadowingValue(rowMap, ['title', '伏笔标题', '标题', 'name', '名称', 'clue', '线索']),
      pickForeshadowingValue(itemMap, [
        'title',
        '伏笔标题',
        '标题',
        'name',
        '名称',
        'clue',
        '线索'
      ]),
      assetTitle(item, '')
    ),
    setup: firstTimelineText(
      pickForeshadowingValue(rowMap, ['setup', '埋设方式', '埋设', '线索内容', 'hook']),
      pickForeshadowingValue(itemMap, ['setup', '埋设方式', '埋设', '线索内容', 'hook'])
    ),
    characters: firstTimelineText(
      pickForeshadowingValue(rowMap, ['characters', '相关角色', '角色', '人物']),
      pickForeshadowingValue(itemMap, ['characters', '相关角色', '角色', '人物'])
    ),
    readerKnows: firstTimelineText(
      pickForeshadowingValue(rowMap, ['readerKnows', '读者已知', '读者知道']),
      pickForeshadowingValue(itemMap, ['readerKnows', '读者已知', '读者知道'])
    ),
    protagonistKnows: firstTimelineText(
      pickForeshadowingValue(rowMap, ['protagonistKnows', '主角已知', '主角知道']),
      pickForeshadowingValue(itemMap, ['protagonistKnows', '主角已知', '主角知道'])
    ),
    characterKnows: firstTimelineText(
      pickForeshadowingValue(rowMap, ['characterKnows', '角色已知', '角色知道']),
      pickForeshadowingValue(itemMap, ['characterKnows', '角色已知', '角色知道'])
    ),
    payoff: firstTimelineText(
      pickForeshadowingValue(rowMap, ['payoff', '预计回收方向', '回收方向', '回收']),
      pickForeshadowingValue(itemMap, ['payoff', '预计回收方向', '回收方向', '回收'])
    ),
    risk: firstTimelineText(
      pickForeshadowingValue(rowMap, ['risk', '提前暴露风险', '风险']),
      pickForeshadowingValue(itemMap, ['risk', '提前暴露风险', '风险'])
    ),
    evidence: firstTimelineText(
      pickForeshadowingValue(rowMap, ['evidence', '原文依据', '依据']),
      pickForeshadowingValue(itemMap, ['evidence', '原文依据', '依据'])
    ),
    chapter: firstTimelineText(
      pickForeshadowingValue(rowMap, ['chapter', '章节', '章节或位置', 'position', '位置']),
      pickForeshadowingValue(itemMap, ['chapter', '章节', '章节或位置', 'position', '位置']),
      pickForeshadowingValue(metaMap, ['chapterRange', 'chapter', '章节'])
    ),
    fallbackBody: firstTimelineText(assetBody(item), `线索 ${index + 1}`)
  }
}

function foreshadowingDetail(info = {}, item = {}) {
  return (
    [
      info.setup ? `埋设方式：${info.setup}` : '',
      info.characters ? `相关角色：${info.characters}` : '',
      info.readerKnows ? `读者已知：${info.readerKnows}` : '',
      info.protagonistKnows ? `主角已知：${info.protagonistKnows}` : '',
      info.characterKnows ? `角色已知：${info.characterKnows}` : '',
      info.payoff ? `回收方向：${info.payoff}` : '',
      info.risk ? `风险：${info.risk}` : '',
      info.evidence ? `依据：${info.evidence}` : ''
    ]
      .filter(Boolean)
      .join('\n') ||
    assetBody(item) ||
    info.fallbackBody
  )
}

function parseForeshadowingText(text = '') {
  const rawText = String(text || '').trim()
  if (!rawText) return null
  const jsonValue = tryParseJsonValue(rawText)
  if (jsonValue) return jsonValue
  const result = {}
  rawText.split(/[；;\n\r]+/).forEach((part) => {
    const match = String(part || '').match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/)
    if (!match) return
    result[normalizeForeshadowingKey(match[1])] = match[2]
  })
  return Object.keys(result).length ? result : null
}

function normalizeForeshadowingMap(value = {}) {
  if (typeof value === 'string')
    return normalizeForeshadowingMap(parseForeshadowingText(value) || {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [normalizeForeshadowingKey(key), val])
  )
}

function normalizeForeshadowingKey(key = '') {
  return String(key || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function pickForeshadowingValue(map = {}, keys = []) {
  for (const key of keys) {
    const value = map[normalizeForeshadowingKey(key)]
    if (value !== undefined && value !== null && firstTimelineText(value)) return value
  }
  return ''
}

function foreshadowingObjectHasContent(value = {}) {
  const map = normalizeForeshadowingMap(value)
  return Boolean(
    pickForeshadowingValue(map, ['title', '伏笔标题', '标题', 'name', '名称', 'clue', '线索']) ||
      pickForeshadowingValue(map, ['setup', '埋设方式', '埋设', '线索内容']) ||
      pickForeshadowingValue(map, ['payoff', '预计回收方向', '回收方向', '回收'])
  )
}

function hasForeshadowingInfo(item = {}) {
  return foreshadowingRows(item).some((row) => {
    const info = foreshadowingInfo(item, row)
    return Boolean(info.setup || info.payoff || info.evidence)
  })
}

function foreshadowingStartTime(info = {}, index = 0) {
  const chapterText = [info.chapter, info.evidence].filter(Boolean).join(' ')
  const number = Number(String(chapterText).match(/\d+/)?.[0])
  if (Number.isFinite(number) && number > 0) return Math.min(100, number)
  return Math.min(100, index * 6 + 1)
}

function foreshadowingProgress(info = {}) {
  const payoff = String(info.payoff || '')
  if (/已回收|回收完成|揭晓|揭露/.test(payoff)) return 100
  return payoff ? 40 : 0
}

function foreshadowingEventKey(item = {}, index = 0, introduction = '', detail = '') {
  return [item.id || 'asset', index, introduction, shortenTimelineText(detail, 80)].join(':')
}

function sameSequenceEvent(left = {}, right = {}) {
  const sameSource =
    right.sourceKnowledgeId &&
    right.sourceEventKey &&
    sameText(left.sourceKnowledgeId, right.sourceKnowledgeId) &&
    sameText(left.sourceEventKey, right.sourceEventKey)
  return (
    sameSource ||
    (sameText(left.introduction, right.introduction) && sameText(left.detail, right.detail))
  )
}

function clampSequenceCell(value, fallback = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(1, Math.min(100, Math.round(number)))
}

function clampSequenceProgress(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

function sequenceEventColor(index = 0) {
  const colors = [
    '#5B8FF9',
    '#61DDAA',
    '#65789B',
    '#F6BD16',
    '#7262FD',
    '#78D3F8',
    '#9661BC',
    '#F6903D',
    '#008685',
    '#F08BB4'
  ]
  return colors[index % colors.length]
}

function shortenMultilineText(value, maxLength = 200) {
  const text = String(value || '').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function normalizeTimelinePayload(data) {
  return data.map(normalizeTimeline)
}

function normalizeTimeline(timeline = {}) {
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
    throw new Error('读取时间线失败：时间线格式异常')
  }
  if (Object.prototype.hasOwnProperty.call(timeline, 'nodes') && !Array.isArray(timeline.nodes)) {
    throw new Error('读取时间线失败：nodes 必须是数组')
  }
  return {
    ...timeline,
    id: String(timeline.id || genId()),
    title: String(timeline.title || '主时间线').trim() || '主时间线',
    nodes: (timeline.nodes || []).map(normalizeTimelineNode)
  }
}

function normalizeTimelineNode(node = {}) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('读取时间线失败：节点格式异常')
  }
  return {
    ...node,
    id: String(node.id || genId()),
    title: String(node.title || '未命名时间点').trim() || '未命名时间点',
    desc: String(node.desc || node.description || '').trim(),
    sourceKnowledgeId: String(node.sourceKnowledgeId || node.data?.sourceKnowledgeId || ''),
    sourceEventKey: String(node.sourceEventKey || '')
  }
}

function ensureTimeline(timelines, title) {
  const found = timelines.find(
    (timeline) => sameText(timeline.title, title) || sameText(timeline.id, title)
  )
  if (found) {
    if (!Array.isArray(found.nodes)) found.nodes = []
    return found
  }
  const timeline = {
    id: genId(),
    title,
    nodes: []
  }
  timelines.push(timeline)
  return timeline
}

function timelineAssetNodes(item = {}) {
  return timelineEventRows(item)
    .map((row, index) => timelineNodeFromAsset(item, row, index))
    .filter((node) => node.title && node.desc)
}

function timelineNodeFromAsset(item = {}, row = {}, index = 0) {
  const info = timelineEventInfo(item, row, index)
  const desc = timelineDescription(info, item)
  const title = timelineNodeTitle(info, index)
  return {
    id: genId(),
    title,
    desc,
    sourceKnowledgeId: String(item.id || ''),
    sourceEventKey: timelineEventKey(item, index, title, desc)
  }
}

function timelineEventInfo(item = {}, row = {}, index = 0) {
  const rowMap = normalizeTimelineMap(row)
  const itemMap = normalizeTimelineMap(item)
  const metaMap = normalizeTimelineMap(item.metadata || {})
  return {
    time: firstTimelineText(
      pickTimelineValue(rowMap, ['time', '时间点', '时间', 'when', 'date', '发生时间']),
      pickTimelineValue(itemMap, ['time', '时间点', '时间', 'when', 'date', '发生时间']),
      pickTimelineValue(metaMap, ['time', '时间点', '时间', 'when', 'date', '发生时间'])
    ),
    chapter: firstTimelineText(
      pickTimelineValue(rowMap, ['chapter', '章节', '章节或位置', 'position', 'location', '位置']),
      pickTimelineValue(itemMap, ['chapter', '章节', '章节或位置', 'position', 'location', '位置']),
      pickTimelineValue(metaMap, ['chapter', '章节', '章节或位置', 'position', 'location', '位置'])
    ),
    event: firstTimelineText(
      pickTimelineValue(rowMap, ['event', '事件', '核心事件', 'introduction', 'summary', '概要']),
      pickTimelineValue(itemMap, ['event', '事件', '核心事件', 'introduction'])
    ),
    characters: firstTimelineText(
      pickTimelineValue(rowMap, ['characters', '参与角色', '角色', 'roles', '人物']),
      pickTimelineValue(itemMap, ['characters', '参与角色', '角色', 'roles', '人物'])
    ),
    result: firstTimelineText(
      pickTimelineValue(rowMap, ['result', '事件结果', '结果']),
      pickTimelineValue(itemMap, ['result', '事件结果', '结果'])
    ),
    impact: firstTimelineText(
      pickTimelineValue(rowMap, ['impact', '后续影响', '影响']),
      pickTimelineValue(itemMap, ['impact', '后续影响', '影响'])
    ),
    conflictRisk: firstTimelineText(
      pickTimelineValue(rowMap, [
        'conflictRisk',
        '是否存在时间矛盾',
        '时间矛盾风险',
        '时间矛盾',
        '矛盾风险'
      ]),
      pickTimelineValue(itemMap, [
        'conflictRisk',
        '是否存在时间矛盾',
        '时间矛盾风险',
        '时间矛盾',
        '矛盾风险'
      ])
    ),
    evidence: firstTimelineText(
      pickTimelineValue(rowMap, ['evidence', '原文依据', '依据']),
      pickTimelineValue(itemMap, ['evidence', '原文依据', '依据'])
    ),
    rawTitle: firstTimelineText(
      pickTimelineValue(rowMap, ['title', 'name', '标题', '名称']),
      pickTimelineValue(itemMap, ['title', 'name', '标题', '名称']),
      assetTitle(item, '')
    ),
    fallbackBody: firstTimelineText(assetBody(item), index >= 0 ? `时间点 ${index + 1}` : '')
  }
}

function timelineDescription(info = {}, item = {}) {
  const parts = [
    info.event,
    info.characters ? `参与角色：${info.characters}` : '',
    info.result ? `结果：${info.result}` : '',
    info.impact ? `影响：${info.impact}` : '',
    info.conflictRisk ? `时间矛盾：${info.conflictRisk}` : '',
    info.evidence ? `依据：${info.evidence}` : ''
  ].filter(Boolean)
  return parts.join('\n') || assetBody(item) || info.rawTitle || info.fallbackBody
}

function timelineNodeTitle(info = {}, index = 0) {
  const when = Array.from(new Set([info.time, info.chapter].filter(Boolean))).join(' · ')
  const eventTitle = shortenTimelineText(info.event || info.rawTitle, 36)
  if (when && eventTitle && !sameText(when, eventTitle)) return `${when} · ${eventTitle}`
  return when || eventTitle || `时间点 ${index + 1}`
}

function timelineEventKey(item = {}, index = 0, title = '', desc = '') {
  return [item.id || 'asset', index, title, shortenTimelineText(desc, 80)].join(':')
}

function sameTimelineNode(left = {}, right = {}) {
  const sameSource =
    right.sourceKnowledgeId &&
    right.sourceEventKey &&
    sameText(left.sourceKnowledgeId, right.sourceKnowledgeId) &&
    sameText(left.sourceEventKey, right.sourceEventKey)
  return sameSource || (sameText(left.title, right.title) && sameText(left.desc, right.desc))
}

function hasTimelineEventInfo(item = {}) {
  return timelineEventRows(item).some((row) => timelineObjectHasEvent(row))
}

function timelineEventRows(item = {}) {
  const rows = []
  if (timelineObjectHasEvent(item)) rows.push(item)
  if (timelineObjectHasEvent(item.metadata || {})) rows.push(item.metadata)
  rows.push(...timelineRowsFromParsed(parseTimelineText(assetBody(item))))
  if (
    !rows.length &&
    (item.metadata?.dimension === 'timeline' || ['timeline', 'timeline_event'].includes(item.type))
  ) {
    rows.push(item)
  }
  return rows
}

function timelineRowsFromParsed(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'object') return []
  const map = normalizeTimelineMap(value)
  const nested = firstTimelineArray(map.events, map.timeline, map.items, map.nodes, map.data)
  return nested.length ? nested : [value]
}

function parseTimelineText(text = '') {
  const rawText = String(text || '').trim()
  if (!rawText) return null
  const jsonValue = tryParseJsonValue(rawText)
  if (jsonValue) return jsonValue
  const result = {}
  rawText.split(/[；;\n\r]+/).forEach((part) => {
    const match = String(part || '').match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/)
    if (!match) return
    result[normalizeTimelineKey(match[1])] = match[2]
  })
  return Object.keys(result).length ? result : null
}

function tryParseJsonValue(text = '') {
  const value = String(text || '').trim()
  if (!value || !['{', '['].includes(value[0])) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeTimelineMap(value = {}) {
  if (typeof value === 'string') return normalizeTimelineMap(parseTimelineText(value) || {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [normalizeTimelineKey(key), val])
  )
}

function normalizeTimelineKey(key = '') {
  return String(key || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function pickTimelineValue(map = {}, keys = []) {
  for (const key of keys) {
    const value = map[normalizeTimelineKey(key)]
    if (value !== undefined && value !== null && firstTimelineText(value)) return value
  }
  return ''
}

function firstTimelineText(...values) {
  return values.map(timelinePlainText).find(Boolean) || ''
}

function timelinePlainText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(timelinePlainText).filter(Boolean).join('、')
  if (typeof value === 'object') {
    return Object.values(value).map(timelinePlainText).filter(Boolean).join('；')
  }
  return String(value || '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
}

function firstTimelineArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value
  }
  return []
}

function timelineObjectHasEvent(value = {}) {
  const map = normalizeTimelineMap(value)
  return Boolean(
    pickTimelineValue(map, ['time', '时间点', '时间', 'when', 'date', '发生时间']) ||
      pickTimelineValue(map, ['chapter', '章节', '章节或位置', 'position', 'location', '位置']) ||
      pickTimelineValue(map, ['event', '事件', '核心事件', 'introduction'])
  )
}

function shortenTimelineText(value, maxLength = 40) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function normalizeSettingsPayload(data) {
  if (data != null && (!data || typeof data !== 'object' || Array.isArray(data))) {
    throw new Error('读取设定集失败：返回格式异常')
  }
  if (data?.categories !== undefined && !Array.isArray(data.categories)) {
    throw new Error('读取设定集失败：categories 必须是数组')
  }
  const categories = data?.categories || []
  return {
    categories: categories.length
      ? categories.map(normalizeSettingCategory)
      : [
          {
            id: genId(),
            name: '采纳素材',
            introduction: '从作品资产台加入的素材。',
            children: [],
            items: []
          }
        ]
  }
}

function normalizeSettingCategory(category = {}) {
  if (!category || typeof category !== 'object' || Array.isArray(category)) {
    throw new Error('读取设定集失败：分类格式异常')
  }
  if (
    Object.prototype.hasOwnProperty.call(category, 'children') &&
    !Array.isArray(category.children)
  ) {
    throw new Error('读取设定集失败：分类 children 必须是数组')
  }
  if (Object.prototype.hasOwnProperty.call(category, 'items') && !Array.isArray(category.items)) {
    throw new Error('读取设定集失败：分类 items 必须是数组')
  }
  return {
    id: String(category.id || genId()),
    name: String(category.name || '未命名分类').trim() || '未命名分类',
    introduction: String(category.introduction || '').trim(),
    children: (category.children || []).map(normalizeSettingCategory),
    items: (category.items || [])
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        id: String(item.id || genId()),
        name: String(item.name || '').trim(),
        introduction: String(item.introduction || '').trim()
      }))
  }
}

function ensureSettingCategory(categories, name) {
  const found = categories.find((category) => sameText(category.name, name))
  if (found) {
    if (!Array.isArray(found.items)) found.items = []
    return found
  }
  const category = {
    id: genId(),
    name,
    introduction: '',
    children: [],
    items: []
  }
  categories.push(category)
  return category
}

function normalizeOutlinePayload(data) {
  if (Array.isArray(data)) return { content: '', children: data.map(normalizeOutlineNode) }
  return {
    content: String(data?.content || ''),
    children: (data?.children || []).map(normalizeOutlineNode)
  }
}

function normalizeOutlineNode(node = {}) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('读取大纲失败：节点格式异常')
  }
  if (Object.prototype.hasOwnProperty.call(node, 'children') && !Array.isArray(node.children)) {
    throw new Error('读取大纲失败：节点 children 必须是数组')
  }
  return {
    id: String(node.id || genId()),
    title: String(node.title || '未命名节点').trim() || '未命名节点',
    content: String(node.content || '').trim(),
    children: (node.children || []).map(normalizeOutlineNode),
    sourceKnowledgeId: node.sourceKnowledgeId || ''
  }
}

function ensureOutlineSection(nodes, title) {
  const found = nodes.find((node) => sameText(node.title, title))
  if (found) {
    if (!Array.isArray(found.children)) found.children = []
    return found
  }
  const section = {
    id: genId(),
    title,
    content: '从作品资产台加入的素材。',
    children: []
  }
  nodes.push(section)
  return section
}

function settingCategoryName(item = {}) {
  if (item.type === 'world_setting') return '世界观'
  if (item.metadata?.dimension === 'relationship') return '人物关系'
  if (item.metadata?.dimension === 'timeline') return '时间线'
  if (item.metadata?.dimension === 'locationFaction') return '地点势力'
  return '采纳素材'
}

function outlineSectionName(item = {}) {
  if (item.type === 'foreshadowing' || item.metadata?.dimension === 'foreshadowing') return '伏笔'
  if (item.metadata?.dimension === 'chapterOutline') return '章节大纲'
  return '剧情素材'
}

function assetTitle(item = {}, fallback = '未命名素材') {
  return String(item.title || item.name || fallback).trim() || fallback
}

function assetBody(item = {}) {
  return String(item.content || item.summary || '').trim()
}

function normalizeTags(item = {}) {
  return Array.from(
    new Set(
      [...(item.tags || []), item.metadata?.dimensionLabel, item.metadata?.dimension]
        .filter(Boolean)
        .map(String)
    )
  )
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim()
}

function usePrompt(preset) {
  router.push({ path: '/ai/prompts', query: { presetId: preset.id, ...promptBookQuery() } })
}

function openPromptManager() {
  router.push({ path: '/knowledge/prompts', query: promptBookQuery() })
}

function promptBookIdentifiers(preset = {}) {
  return [preset.bookId, preset.bookFolderName, preset.bookName].filter(Boolean).map(String)
}

function isPromptRelatedToBook(preset = {}, targetBook = {}) {
  const ids = bookIdentifiers(targetBook)
  const promptIds = promptBookIdentifiers(preset)
  const path = String(preset.bookPath || '')
  return (
    promptIds.some((id) => ids.some((bookIdValue) => sameText(id, bookIdValue))) ||
    ids.some((id) => path.includes(id))
  )
}

function promptScopePayloadForBook(targetBook = {}) {
  const key = targetBook.id || targetBook.folderName || targetBook.name || bookId.value
  return {
    scope: 'book',
    bookId: key,
    bookName: targetBook.name || targetBook.folderName || key,
    bookFolderName: targetBook.folderName || targetBook.name || key
  }
}

function promptBookQuery() {
  const payload = promptScopePayloadForBook(book.value || { id: bookId.value })
  return {
    bookId: payload.bookId || payload.bookFolderName || payload.bookName,
    name: payload.bookFolderName || payload.bookName || payload.bookId
  }
}

function chapterAssetStatusText(row) {
  if (!isSplitReady(book.value)) return '拆书状态：待拆书'
  const text = [row.name, row.volumeName].join(' ')
  const related = relatedKnowledge.value.filter((item) => includesText(item, text))
  const characterCount = related.filter((item) =>
    ['character', 'character_setting'].includes(item.type)
  ).length
  const worldCount = related.filter((item) => item.type === 'world_setting').length
  const clueCount = related.filter(
    (item) => item.type === 'foreshadowing' || includesText(item, '伏笔')
  ).length
  return `已提取角色 ${characterCount}，世界观 ${worldCount}，伏笔 ${clueCount}`
}

function isRelatedToBook(item, targetBook) {
  const ids = bookIdentifiers(targetBook)
  const meta = item.metadata || {}
  return (
    (item.relatedBookIds || []).some((id) => ids.includes(String(id))) ||
    ids.includes(String(item.sourceName || '')) ||
    ids.includes(String(meta.legacyBookName || '')) ||
    ids.includes(String(meta.sourceBookId || '')) ||
    ids.includes(String(meta.targetBookId || ''))
  )
}

function isAssetRelatedToBook(asset, targetBook) {
  const ids = bookIdentifiers(targetBook)
  return (
    ids.includes(String(asset.bookName || '')) || ids.includes(String(asset.bookFolderName || ''))
  )
}

function bookIdentifiers(targetBook = {}) {
  return [targetBook.id, targetBook.folderName, targetBook.name].filter(Boolean).map(String)
}

function bookTitle(targetBook = {}) {
  return targetBook.name || targetBook.folderName || '未命名作品'
}

function isDownloadedBook(targetBook = {}) {
  return (
    targetBook.bookRole === 'downloaded' ||
    targetBook.sourceType === 'downloaded' ||
    targetBook.sourceType === 'downloadedNovel' ||
    targetBook.downloaded === true
  )
}

function isCreativeBook(targetBook = {}) {
  return (
    !isDownloadedBook(targetBook) &&
    !isImportedBook(targetBook) &&
    targetBook.sourceType !== 'reference'
  )
}

function isImportedBook(targetBook = {}) {
  return (
    ['imported', 'file_import', 'txt', 'epub'].includes(targetBook.sourceType) ||
    targetBook.importedFrom === 'file'
  )
}

function bookTypeLabel(targetBook = {}) {
  if (isDownloadedBook(targetBook)) return '下载书籍'
  if (targetBook.sourceType === 'reference') return '参考资料'
  if (isImportedBook(targetBook)) return '导入书籍'
  return '我的作品'
}

function analysisStatus(targetBook = {}) {
  if (targetBook.analysisStatus) return targetBook.analysisStatus
  if (isSplitReady(targetBook)) return 'split_done'
  if (isDownloadedBook(targetBook) || targetBook.sourceType === 'reference') return 'split_pending'
  return 'parsed'
}

function bookStatusLabel(targetBook = {}) {
  const map = {
    imported: '待解析',
    parsing: '解析中',
    parsed: isCreativeBook(targetBook) ? '正在创作' : '待拆书',
    split_pending: '待拆书',
    splitting: '拆书中',
    split_partial: '部分拆书',
    split_done: '已拆书',
    split_failed: '拆书失败',
    outdated: '需重新拆书'
  }
  return map[analysisStatus(targetBook)] || '待整理'
}

function isSplitReady(targetBook = {}) {
  const ids = bookIdentifiers(targetBook)
  return (
    ['split_done', 'split_partial'].includes(targetBook.analysisStatus) ||
    knowledge.value.some((item) => {
      const meta = item.metadata || {}
      return (
        item.type === 'book_analysis' &&
        item.status !== 'discarded' &&
        meta.assetStatus !== 'superseded' &&
        ((item.relatedBookIds || []).some((id) => ids.includes(String(id))) ||
          ids.includes(String(item.sourceName || '')) ||
          ids.includes(String(meta.legacyBookName || '')))
      )
    })
  )
}

function isSupersededExtraction(record = {}) {
  return record.lifecycleStatus === 'superseded' || record.superseded === true
}

function hasBookCover(targetBook = {}) {
  return Boolean(webCoverUrl(targetBook))
}

function bookCoverStyle(targetBook = {}) {
  const cover = webCoverUrl(targetBook)
  if (cover) return { backgroundImage: `url(${cover})` }
  return {
    backgroundColor: targetBook.coverColor || (isDownloadedBook(targetBook) ? '#8a735d' : '#3a3731')
  }
}

function webCoverUrl(targetBook = {}) {
  if (!targetBook.coverUrl) return ''
  if (targetBook.coverUrl.startsWith('http://') || targetBook.coverUrl.startsWith('https://'))
    return targetBook.coverUrl
  const params = new URLSearchParams({
    book: targetBook.folderName || targetBook.name || '',
    file: targetBook.coverUrl
  })
  return `/api/books/cover?${params.toString()}`
}

function bookTags(targetBook = {}) {
  return [
    targetBook.typeName,
    targetBook.sourcePlatform || targetBook.sourceName,
    ...(targetBook.tags || [])
  ].filter(Boolean)
}

function bookUpdatedAt(targetBook = {}) {
  return targetBook.updatedAt || targetBook.lastModified || targetBook.createdAt || ''
}

function flattenChapterRows(tree = []) {
  let index = 0
  return tree.flatMap((volume) => {
    const children = Array.isArray(volume.children) ? volume.children : []
    return children.map((chapter) => {
      index += 1
      return {
        key: `${volume.name || '正文'}:${chapter.name}`,
        index,
        volumeName: volume.name || '正文',
        name: chapter.name,
        wordCount: chapter.wordCount || 0
      }
    })
  })
}

function includesText(item = {}, text = '') {
  const q = String(text || '').toLowerCase()
  return [item.title, item.summary, item.content, item.sourceName, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function knowledgeTypeLabel(item = {}) {
  const map = {
    book_analysis: '拆书',
    character_setting: '角色',
    character: '角色',
    world_setting: '世界观',
    setting: '设定集',
    plot_fragment: '片段',
    foreshadowing: '伏笔',
    note: '笔记',
    topic_card: '选题卡'
  }
  return map[item.type] || '资产'
}

function usageLabel(item = {}) {
  const map = {
    reference: '参考',
    inspiration: '灵感',
    canon: '正式设定',
    draft: '草稿',
    discarded: '已废弃'
  }
  return map[item.metadata?.usage || 'reference'] || '参考'
}

function isAssetAdopted(item = {}) {
  return item.metadata?.usage === 'canon' || item.metadata?.assetStatus === 'adopted'
}

function isAssetSavedToMaterial(item = {}) {
  const status = item.metadata?.assetStatus || item.assetStatus || ''
  return (
    Boolean(item.metadata?.savedToMaterialAt) ||
    ['saved', 'confirmed', 'edited', 'adopted'].includes(status)
  )
}

function dimensionLabel(key = '') {
  const found = availableDimensions.value.find((item) => item.key === key)
  if (found?.label) return found.label
  const map = {
    narrative: '文风叙事',
    plot: '情节设计',
    character: '人物塑造',
    novelFeatures: '小说特点',
    emotion: '读者情绪',
    humor: '热梗搞笑',
    chapterOutline: '章节大纲',
    storyAssets: '作品资料',
    characterSetting: '角色设定',
    relationship: '人物关系',
    worldbuilding: '世界观',
    goldenFinger: '金手指',
    powerSystem: '力量体系',
    timeline: '时间线',
    locationFaction: '地点势力',
    foreshadowing: '伏笔线索'
  }
  return map[key] || key || '拆书'
}

function extractionItemTitle(item = {}, index = 0) {
  return (
    item.name ||
    item.title ||
    item.point ||
    item.character ||
    item.role ||
    (item.source && item.target ? `${item.source} ↔ ${item.target}` : '') ||
    item.event ||
    item.rule ||
    item.system ||
    item.ability ||
    item.kind ||
    item.hook ||
    item.events ||
    item.function ||
    `结果 ${index + 1}`
  )
}

function extractionTaskStatusLabel(status = '') {
  const map = {
    pending: '等待中',
    processing: '处理中',
    running: '处理中',
    extracting: '处理中',
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
    empty: '无结果',
    superseded: '已替换',
    recorded: '已记录'
  }
  return map[status] || status || '未开始'
}

function extractionLogLevelLabel(level = '') {
  const map = {
    info: '进度',
    success: '完成',
    warning: '提醒',
    error: '失败'
  }
  return map[level] || '记录'
}

function recordStatusClass(record = {}) {
  const status = isSupersededExtraction(record) ? 'superseded' : String(record.status || '')
  if (['running', 'processing', 'extracting'].includes(status)) return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'partial') return 'partial'
  if (status === 'failed') return 'failed'
  if (status === 'superseded') return 'superseded'
  return 'recorded'
}

function formatDateTime(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function extractionRecordItemCount(record = {}) {
  return (
    Number(record.stats?.totalExtractedCount || 0) ||
    Object.values(record.dimensions || {}).reduce(
      (sum, value) => sum + Number(value?.itemCount || 0),
      0
    )
  )
}

function extractionRecordFailedCount(record = {}) {
  return (
    Number(record.stats?.failedGroups || 0) ||
    Object.values(record.dimensions || {}).reduce(
      (sum, value) => sum + Number(value?.failedGroups || 0),
      0
    )
  )
}

function extractionRecordGroupCount(record = {}) {
  return (
    Number(record.totalGroups || record.totalChunks || 0) ||
    Object.values(record.dimensions || {}).reduce(
      (sum, value) => sum + Number(value?.chunkCount || value?.progress?.total || 0),
      0
    )
  )
}

function extractionRecordPercent(record = {}) {
  if (isSupersededExtraction(record)) return 100
  const direct = Number(record.overallPercent ?? record.progress?.percent)
  if (Number.isFinite(direct) && direct > 0) return Math.min(100, Math.max(0, Math.round(direct)))
  if (record.status === 'completed') return 100
  if (record.status === 'failed') return 0
  const dimensions = Object.values(record.dimensions || {})
  if (!dimensions.length) return 0
  const total = dimensions.reduce(
    (sum, item) => sum + Number(item?.progress?.total || item?.chunkCount || 0),
    0
  )
  const current = dimensions.reduce((sum, item) => sum + Number(item?.progress?.current || 0), 0)
  return total ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0
}

function extractionProgressItemCount(progress = {}) {
  return (
    Number(progress.stats?.totalExtractedCount || 0) ||
    extractionTaskRows.value.reduce(
      (sum, task) => sum + Number(task.extractedCount || task.itemCount || 0),
      0
    )
  )
}

function extractionProgressFailedCount(progress = {}) {
  return (
    Number(progress.stats?.failedGroups || 0) ||
    extractionTaskRows.value.reduce((sum, task) => sum + Number(task.failedGroups || 0), 0)
  )
}

function extractionRecordRows(record = {}) {
  if (Array.isArray(record.subTasks) && record.subTasks.length) return record.subTasks
  return Object.entries(record.dimensions || {}).map(([dimension, value]) => ({
    id: `${record.id || 'record'}_${dimension}`,
    dimension,
    label: value?.label || dimensionLabel(dimension),
    status: value?.status || (record.status === 'completed' ? 'completed' : 'recorded'),
    extractedCount: value?.itemCount || 0,
    failedGroups: value?.failedGroups || 0,
    progress: value?.progress || {
      current: value?.chunkCount || value?.itemCount || 0,
      total: value?.chunkCount || value?.itemCount || 0,
      percent: value?.status === 'completed' ? 100 : 0
    }
  }))
}

function extractionRecordLogs(record = {}) {
  return Array.isArray(record.logs) ? record.logs.slice(-8).reverse() : []
}

async function deleteExtractionRecord(record = {}) {
  if (!record?.id) return
  try {
    await ElMessageBox.confirm(
      `确定删除这次拆书任务吗？对应素材会从当前资产列表移出。\n\n任务：${record.sourceBookName || bookTitle(book.value)}\n时间：${formatDateTime(record.createdAt)}`,
      '删除拆书任务',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const bookPath = await resolveBookPath()
    await deleteExtraction({ bookPath, extractionId: record.id })
    ElMessage.success('已删除拆书任务')
    if (expandedExtractionId.value === record.id) expandedExtractionId.value = ''
    if (resultViewerRecord.value?.id === record.id) closeExtractionResultViewer()
    if (
      activeExtractionProgress.value?.id === record.id ||
      activeExtractionProgress.value?.extractionId === record.id
    ) {
      stopExtractionProgressPolling()
      currentExtractionProgress.value = null
      extractionLogs.value = []
      extractionRunning.value = false
    }
    await loadData()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '删除拆书任务失败')
  }
}

function extractionRecordScopeText(record = {}) {
  const scope = record.chapterScope || record.stats?.chapterScope || null
  if (!scope || typeof scope !== 'object') return ''
  const start = Number(scope.start || 0)
  const end = Number(scope.end || 0)
  const total = Number(scope.totalChapterCount || record.stats?.sourceChapterCount || 0)
  const selected = Number(scope.selectedChapterCount || 0)
  if (!start || !end) return ''
  if (scope.limited || (total && (start > 1 || end < total))) {
    return `章节：${start}-${end}${selected ? `，共 ${selected} 章` : ''}`
  }
  return total ? `章节：整本 ${total} 章` : ''
}

function extractionSummary(record = {}) {
  if (isSupersededExtraction(record)) return '这次拆书结果已被新的结果替换。'
  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
    : Object.keys(record.dimensions || {})
  const labels = dimensions
    .map((key) => availableDimensions.value.find((item) => item.key === key)?.label || key)
    .filter(Boolean)
  const text = labels.length ? labels.join('、') : '未记录提取内容'
  const chunks = Number(record.totalChunks || record.totalGroups || 0)
  const count =
    Number(record.stats?.totalExtractedCount || 0) ||
    Object.values(record.dimensions || {}).reduce(
      (sum, value) => sum + Number(value?.itemCount || 0),
      0
    )
  const failed = Number(record.stats?.failedGroups || 0)
  const tail = [
    chunks ? `处理 ${chunks} 组文本` : '',
    count ? `生成 ${count} 条` : '',
    failed ? `失败 ${failed} 组` : ''
  ]
    .filter(Boolean)
    .join('，')
  return tail ? `${text}，${tail}` : text
}

function extractionStatusLabel(status = '') {
  const map = {
    running: '进行中',
    processing: '进行中',
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
    superseded: '已替换'
  }
  return map[status] || '已记录'
}

function assetStatusLabel(item = {}) {
  const map = {
    ai_extracted: 'AI 提取',
    pending_review: '待确认',
    saved: '已保存',
    confirmed: '已确认',
    edited: '已编辑',
    adopted: '已采纳',
    discarded: '已废弃',
    conflict_risk: '冲突风险',
    failed: '失败'
  }
  return map[item.metadata?.assetStatus || item.assetStatus || 'pending_review'] || '待确认'
}

function imageTypeLabel(asset = {}) {
  const map = {
    cover: '封面',
    character: '角色图',
    scene: '场景图',
    map: '地图',
    attachment: '参考图'
  }
  return map[asset.type] || asset.type || '图片'
}

function promptCategoryLabel(category = '') {
  const map = {
    topic: '写作',
    continueWrite: '续写',
    rewrite: '改写',
    polish: '润色',
    deconstruct: '拆书',
    outline: '大纲',
    character: '角色',
    world: '世界观',
    image: '图片生成',
    market: '市场灵感'
  }
  return map[category] || category || '自定义'
}

function assetUrl(asset) {
  return getAssetUrl(asset)
}

function formatWords(value) {
  const count = Number(value || 0)
  if (count >= 10000) return `${(count / 10000).toFixed(1)} 万字`
  return `${count.toLocaleString('zh-CN')} 字`
}

function formatDate(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function dateValue(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}
</script>

<style lang="scss" scoped>
.book-asset-page {
  width: min(100%, 1540px);
  margin: 0 auto;
  color: #3a3731;
}

.card-panel,
.missing-book,
.asset-loading {
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background:
    radial-gradient(circle at 8% 0%, rgba(154, 107, 36, 0.05), transparent 28%),
    linear-gradient(145deg, rgba(251, 250, 246, 0.96), rgba(232, 229, 223, 0.54));
  box-shadow: var(--wabi-shadow-soft);
  padding: 18px;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--wabi-muted);

  button {
    border: 0;
    background: transparent;
    color: var(--wabi-moss-dark);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
}

.asset-header {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: 20px;
  align-items: start;
  margin-bottom: 16px;
}

.header-cover {
  display: grid;
  place-items: center;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border: 1px solid var(--wabi-line);
  border-radius: 6px;
  background-position: center;
  background-size: cover;

  &.placeholder {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.12), transparent 22%),
      linear-gradient(145deg, #5a5248, var(--wabi-earth) 58%, var(--wabi-earth-soft));
  }
}

.book-mark {
  width: 40%;
  aspect-ratio: 3 / 4;
  border-radius: 4px 9px 9px 4px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.36), transparent 18%), rgba(255, 248, 224, 0.74);
}

.header-main {
  min-width: 0;

  h1 {
    margin: 8px 0 2px;
    color: var(--wabi-ink);
    font-size: clamp(28px, 2vw, 38px);
  }

  h2 {
    margin: 0 0 8px;
    color: var(--wabi-ink-soft);
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.header-kicker,
.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    border-radius: 999px;
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }

  .book-kind-icon {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    padding: 0;
  }
}

.header-meta {
  margin-top: 12px;

  span {
    background: rgba(111, 122, 104, 0.08);
    color: var(--wabi-muted);
  }
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 380px;
}

.asset-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 6px;
    background: rgba(251, 250, 246, 0.82);
    color: var(--wabi-muted);
    cursor: pointer;
    font: inherit;
    padding: 8px 14px;

    &.active,
    &:hover {
      border-color: rgba(111, 122, 104, 0.38);
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }
}

.tab-panel {
  min-height: 520px;
}

.split-tab {
  display: grid;
  gap: 16px;
}

.split-summary-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
  padding: 12px;

  span {
    display: grid;
    gap: 4px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.82);
    padding: 12px;
  }

  b {
    color: var(--wabi-ink);
    font-size: 18px;
  }

  small {
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.split-task-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 16px;
  align-items: start;
}

.split-run-panel {
  position: sticky;
  top: 14px;
  display: grid;
  gap: 12px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 250, 242, 0.86);
  padding: 14px;

  label,
  .chapter-scope-picker,
  .dimension-picker {
    display: grid;
    gap: 7px;
  }

  label span,
  .chapter-scope-head > span,
  .dimension-picker > span {
    color: var(--wabi-ink-soft);
    font-size: 12px;
    font-weight: 700;
  }

  select {
    width: 100%;
    border: 1px solid var(--wabi-line);
    border-radius: 6px;
    background: rgba(251, 250, 246, 0.82);
    color: var(--wabi-ink);
    outline: none;
    padding: 9px 10px;
  }
}

.chapter-scope-picker {
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 252, 246, 0.78);
  padding: 10px;

  p {
    margin: 0;
    color: var(--wabi-muted);
    font-size: 12px;
    line-height: 1.6;
  }
}

.chapter-scope-head,
.chapter-scope-row {
  display: flex;
  align-items: center;
}

.chapter-scope-head {
  justify-content: space-between;
  gap: 8px;
}

.chapter-scope-head button {
  border: none;
  background: transparent;
  color: var(--wabi-earth);
  cursor: pointer;
  font-size: 12px;
  padding: 0;

  &:disabled {
    color: var(--wabi-muted-2);
    cursor: not-allowed;
  }
}

.chapter-scope-row {
  flex-wrap: wrap;
  gap: 8px;
  color: var(--wabi-muted);
  font-size: 12px;

  .el-input-number {
    width: 104px;
  }
}

.split-run-panel-head {
  display: grid;
  gap: 8px;

  h3 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.65;
  }
}

.split-eyebrow {
  width: fit-content;
  border-radius: 999px;
  background: rgba(138, 115, 93, 0.12);
  color: var(--wabi-earth);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 9px;
}

.dimension-picker .dimension-groups {
  display: grid;
  gap: 10px;
}

.dimension-group {
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 252, 246, 0.78);
  padding: 10px;
}

.dimension-group header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--wabi-earth);
}

.dimension-group header button {
  border: none;
  background: transparent;
  color: var(--wabi-earth);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.dimension-group > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dimension-picker button {
  border: 1px solid var(--wabi-line);
  border-radius: 6px;
  background: rgba(251, 250, 246, 0.82);
  color: var(--wabi-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 10px;

  &.active {
    border-color: rgba(111, 122, 104, 0.38);
    background: rgba(111, 122, 104, 0.12);
    color: var(--wabi-moss-dark);
  }
}

.split-rerun-actions {
  display: grid;
  gap: 10px;

  .el-button {
    width: 100%;
    margin-left: 0;
    justify-content: center;
  }
}

.split-error,
.read-error {
  margin: 0;
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.1);
  color: var(--wabi-rust);
  line-height: 1.6;
  padding: 9px 10px;
}

.read-error {
  display: grid;
  gap: 8px;

  strong {
    color: var(--wabi-rust);
  }

  button {
    justify-self: start;
    border: 1px solid rgba(154, 96, 74, 0.22);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.62);
    color: var(--wabi-rust);
    cursor: pointer;
    font: inherit;
    padding: 6px 10px;
  }
}

.extraction-history {
  display: grid;
  gap: 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.48);
  padding: 16px;

  strong {
    color: var(--wabi-ink);
  }

  p {
    margin: 6px 0 0;
    color: var(--wabi-muted);
    line-height: 1.6;
  }
}

.record-list {
  display: grid;
  gap: 10px;
}

.extraction-record-card {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
  overflow: hidden;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.82);
  padding: 12px;
  cursor: pointer;

  &.active {
    outline: 2px solid rgba(111, 122, 104, 0.22);
  }

  &.superseded {
    opacity: 0.68;
  }
}

.record-status-rail {
  align-self: stretch;
  min-height: 80px;
  border-radius: 999px;
  background: #d5c7ad;

  &.completed {
    background: var(--wabi-moss);
  }

  &.running {
    background: var(--wabi-earth);
  }

  &.failed {
    background: var(--wabi-rust);
  }

  &.partial {
    background: var(--wabi-warning);
  }

  &.superseded {
    background: var(--wabi-muted-2);
  }
}

.record-main {
  min-width: 0;
}

.record-title-line,
.record-meta-line,
.record-progress-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.record-title-line {
  justify-content: space-between;
}

.record-status-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(240, 236, 227, 0.72);
  color: var(--wabi-muted);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 9px;

  &.completed {
    background: rgba(111, 122, 104, 0.12);
    color: var(--wabi-moss-dark);
  }

  &.running,
  &.partial {
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
  }

  &.failed {
    background: rgba(154, 96, 74, 0.12);
    color: var(--wabi-rust);
  }

  &.superseded {
    background: rgba(104, 113, 122, 0.12);
    color: var(--wabi-muted);
  }
}

.record-meta-line {
  flex-wrap: wrap;
  margin-top: 8px;

  small {
    color: var(--wabi-muted);
  }
}

.record-progress-line {
  margin-top: 10px;

  .el-progress {
    flex: 1;
  }

  b {
    color: var(--wabi-earth);
    font-size: 13px;
  }
}

.record-expanded {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.record-side {
  display: grid;
  justify-items: end;
  gap: 8px;
  min-width: 96px;

  > span {
    height: fit-content;
    border-radius: 999px;
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 6px;
    background: rgba(251, 250, 246, 0.82);
    color: var(--wabi-ink);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 6px 10px;

    &.primary {
      border-color: rgba(111, 122, 104, 0.42);
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }

    &.danger {
      border-color: rgba(182, 67, 44, 0.26);
      color: var(--wabi-rust);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.46;
    }
  }
}

.record-dimension-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;

  span {
    display: grid;
    gap: 2px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.68);
    color: var(--wabi-ink);
    padding: 8px 10px;
  }

  b {
    font-size: 13px;
  }

  small {
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.extraction-progress-board {
  display: grid;
  gap: 14px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.52);
  padding: 16px;
}

.progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--wabi-ink);
  }

  p {
    margin: 6px 0 0;
    color: var(--wabi-muted);
  }

  > b {
    color: var(--wabi-earth);
    font-size: 28px;
  }
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;

  &.compact {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
}

.task-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.82);
  padding: 12px;

  div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  strong {
    color: var(--wabi-ink);
  }

  p,
  small {
    margin: 0;
    overflow: hidden;
    color: var(--wabi-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.task-status {
  border-radius: 999px;
  background: rgba(111, 122, 104, 0.1);
  color: var(--wabi-muted);
  font-size: 12px;
  padding: 3px 8px;

  &.completed {
    background: rgba(111, 122, 104, 0.12);
    color: var(--wabi-moss-dark);
  }

  &.failed {
    background: rgba(154, 96, 74, 0.12);
    color: var(--wabi-rust);
  }

  &.processing,
  &.running,
  &.extracting {
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
  }
}

.extraction-log-list {
  display: grid;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;

  &.compact {
    max-height: 170px;
  }

  article {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 8px;
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.82);
    padding: 9px 10px;
  }

  span {
    color: var(--wabi-earth);
    font-size: 12px;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: var(--wabi-ink-soft);
    line-height: 1.5;
  }

  .error span {
    color: var(--wabi-rust);
  }

  .success span {
    color: var(--wabi-moss-dark);
  }
}

.split-assets-preview {
  display: grid;
  gap: 10px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.42);
  padding: 16px;

  .section-title {
    margin-bottom: 0;
  }

  button {
    border: 1px solid var(--wabi-line);
    border-radius: 6px;
    background: rgba(251, 250, 246, 0.82);
    color: var(--wabi-ink);
    cursor: pointer;
    font: inherit;
    padding: 7px 10px;
  }
}

.mini-title {
  color: var(--wabi-ink-soft);
  font-size: 12px;
  font-weight: 700;
}

.result-dialog-title {
  display: grid;
  gap: 3px;

  span {
    color: var(--wabi-ink);
    font-size: 18px;
    font-weight: 800;
  }

  small {
    color: var(--wabi-muted);
  }
}

.result-viewer {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  min-height: 560px;
}

.result-viewer-nav {
  display: grid;
  align-content: start;
  gap: 8px;
  border-right: 1px solid var(--wabi-line);
  padding-right: 14px;

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.82);
    color: var(--wabi-ink-soft);
    cursor: pointer;
    font: inherit;
    padding: 10px 12px;
    text-align: left;

    &.active {
      border-color: rgba(111, 122, 104, 0.42);
      background: rgba(111, 122, 104, 0.12);
      color: var(--wabi-moss-dark);
    }
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    opacity: 0.78;
  }
}

.result-viewer-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  min-width: 0;
}

.result-viewer-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px auto;
  align-items: center;
  gap: 10px;

  div {
    display: grid;
    gap: 4px;
  }

  strong {
    color: var(--wabi-ink);
    font-size: 16px;
  }

  span {
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.result-viewer-error {
  border: 1px solid rgba(182, 67, 44, 0.18);
  border-radius: 8px;
  background: rgba(154, 96, 74, 0.08);
  color: var(--wabi-rust);
  padding: 12px;
}

.result-item-list {
  display: grid;
  align-content: start;
  gap: 10px;
  max-height: 430px;
  overflow: auto;
  padding-right: 4px;
}

.result-item-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.82);
  padding: 12px;

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  strong {
    color: var(--wabi-ink);
  }

  p {
    margin: 5px 0 0;
    color: var(--wabi-muted);
    line-height: 1.65;
  }

  header > span {
    height: fit-content;
    border-radius: 999px;
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
    font-size: 12px;
    padding: 4px 9px;
  }
}

.result-viewer-footer {
  display: flex;
  justify-content: flex-end;
}

.overview-tab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 18px;
}

.overview-main,
.overview-side,
.split-empty,
.recent-assets,
.chapter-row,
.asset-item-card,
.prompt-list article,
.image-grid article,
.graph-board {
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.48);
  padding: 16px;
}

.overview-main {
  h2 {
    margin: 0 0 8px;
    color: var(--wabi-ink);
    font-size: 24px;
  }

  p {
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.overview-grid,
.asset-stat-grid,
.graph-node-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  article,
  span {
    display: grid;
    gap: 4px;
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.82);
    padding: 12px;
  }

  span,
  small {
    color: var(--wabi-muted);
    font-size: 12px;
  }

  b {
    color: var(--wabi-ink);
    font-size: 18px;
  }
}

.split-empty {
  grid-column: 1 / -1;
  display: grid;
  gap: 10px;

  h3 {
    margin: 0;
    color: var(--wabi-ink);
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }

  div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2,
  h3 {
    margin: 0;
    color: var(--wabi-ink);
  }

  span {
    color: var(--wabi-muted);
  }
}

.section-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.asset-row-list,
.chapter-list,
.asset-card-list,
.prompt-list {
  display: grid;
  gap: 10px;
}

.asset-list-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.asset-row-list article,
.asset-item-card {
  h4,
  h3 {
    margin: 8px 0 6px;
    color: var(--wabi-ink);
  }

  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--wabi-muted);
    line-height: 1.6;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  span {
    width: fit-content;
    border-radius: 999px;
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }
}

.chapter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;

  h3 {
    margin: 6px 0;
    color: var(--wabi-ink);
  }

  p,
  span {
    margin: 0;
    color: var(--wabi-muted);
  }
}

.chapter-actions,
.asset-item-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.asset-item-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
}

.asset-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;

  small {
    color: var(--wabi-muted);
  }
}

.section-actions button,
.asset-item-actions button,
.soft-empty button {
  border: 1px solid var(--wabi-line);
  border-radius: 6px;
  background: rgba(251, 250, 246, 0.82);
  color: var(--wabi-ink);
  cursor: pointer;
  font: inherit;
  padding: 7px 10px;
}

.asset-item-actions button.is-saved {
  border-color: rgba(111, 122, 104, 0.34);
  background: rgba(111, 122, 104, 0.12);
  color: var(--wabi-moss-dark);
}

.asset-item-actions button:disabled {
  cursor: default;
  opacity: 0.72;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;

  h3,
  p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h3 {
    margin: 8px 0 4px;
    color: var(--wabi-ink);
    font-size: 15px;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.image-preview {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(138, 115, 93, 0.12);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.prompt-list article {
  display: grid;
  gap: 8px;

  span {
    width: fit-content;
    border-radius: 999px;
    background: rgba(138, 115, 93, 0.12);
    color: var(--wabi-earth);
    font-size: 12px;
    padding: 4px 9px;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--wabi-ink);
  }

  p {
    color: var(--wabi-muted);
    line-height: 1.6;
  }
}

.graph-board {
  display: grid;
  gap: 12px;

  h2 {
    margin: 0;
    color: var(--wabi-ink);
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.graph-actions,
.relationship-graph-list article {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.relationship-graph-list {
  display: grid;
  gap: 10px;
}

.relationship-graph-list article {
  justify-content: space-between;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.82);
  padding: 12px;

  div {
    min-width: 0;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--wabi-ink);
    font-size: 16px;
  }

  p {
    display: -webkit-box;
    margin-top: 5px;
    overflow: hidden;
    color: var(--wabi-muted);
    line-height: 1.6;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  small {
    display: block;
    margin-top: 6px;
    color: var(--wabi-muted);
    font-size: 12px;
  }
}

.graph-read-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 220px;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 14px;
  padding: 18px;
}

.soft-empty,
.missing-book,
.asset-loading {
  display: grid;
  gap: 10px;
  color: var(--wabi-muted);
  line-height: 1.6;

  strong,
  h1 {
    margin: 0;
    color: var(--wabi-ink);
  }
}

.soft-text {
  color: var(--wabi-muted);
}

@media (max-width: 1180px) {
  .asset-header,
  .overview-tab,
  .split-task-layout {
    grid-template-columns: 1fr;
  }

  .split-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .split-run-panel {
    position: static;
  }

  .header-cover {
    width: 132px;
  }

  .header-actions {
    justify-content: flex-start;
    max-width: none;
  }

  .chapter-row,
  .asset-item-card {
    grid-template-columns: 1fr;
  }

  .result-viewer {
    grid-template-columns: 1fr;
  }

  .result-viewer-nav {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--wabi-line);
    padding: 0 0 12px;
  }

  .result-viewer-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <div class="starter-result-page">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">
          创作起笔
        </p>
        <h1>根据你的想法，生成设定树和开篇黄金三章。</h1>
      </div>
      <el-tag
        :type="statusType"
        round
      >
        {{ statusText }}
      </el-tag>
    </section>

    <section
      v-if="loadingJob"
      class="state-panel"
    >
      <h2>正在读取起笔任务</h2>
      <p>正在从本地任务存储读取真实任务记录。</p>
    </section>

    <section
      v-else-if="starterLoadError"
      class="state-panel state-error"
    >
      <h2>读取起笔任务失败</h2>
      <p>{{ starterLoadError }}</p>
      <el-button
        type="primary"
        :loading="loadingJob"
        @click="retryLoadJob"
      >
        重试
      </el-button>
    </section>

    <section
      v-else-if="!job"
      class="state-panel"
    >
      <h2>没有找到起笔任务</h2>
      <p>可以回到首页重新输入想法，创建一次新的起笔任务。</p>
      <el-button
        type="primary"
        @click="router.push('/dashboard')"
      >
        去首页起笔
      </el-button>
    </section>

    <template v-else>
      <section class="status-panel">
        <div>
          <strong>{{ statusText }}</strong>
          <span v-if="job.errorMessage">{{ job.errorMessage }}</span>
          <span v-else-if="job.status === 'running'">正在调用当前文本 AI 服务，请稍候。</span>
          <span v-else>任务创建于 {{ formatDateTime(job.createdAt) }}</span>
        </div>
        <el-progress
          :percentage="job.status === 'completed' ? 100 : job.status === 'failed' ? 100 : 0"
          :status="
            job.status === 'failed'
              ? 'exception'
              : job.status === 'completed'
                ? 'success'
                : undefined
          "
          :indeterminate="job.status === 'running'"
        />
      </section>

      <el-collapse class="context-collapse">
        <el-collapse-item
          title="本次生成使用的上下文"
          name="context"
        >
          <div class="context-grid">
            <article>
              <h3>用户输入</h3>
              <p>{{ job.prompt }}</p>
            </article>
            <article>
              <h3>手动引用素材</h3>
              <p v-if="!job.references.length">
                未手动选择素材。
              </p>
              <ul v-else>
                <li
                  v-for="item in job.references"
                  :key="item.key || item.id"
                >
                  {{ item.typeLabel || typeText(item.type) }}：{{ item.title }}
                </li>
              </ul>
            </article>
            <article>
              <h3>自动参考素材</h3>
              <p v-if="!job.autoReferences.length">
                当前没有自动参考素材。
              </p>
              <ul v-else>
                <li
                  v-for="item in job.autoReferences"
                  :key="item.key || item.id"
                >
                  {{ item.typeLabel || typeText(item.type) }}：{{ item.title }}
                </li>
              </ul>
            </article>
            <article>
              <h3>高级要求</h3>
              <p v-if="!filledAdvanced.length">
                未填写高级要求。
              </p>
              <ul v-else>
                <li
                  v-for="item in filledAdvanced"
                  :key="item.key"
                >
                  {{ item.label }}：{{ item.value }}
                </li>
              </ul>
            </article>
          </div>
        </el-collapse-item>
      </el-collapse>

      <section class="result-grid">
        <article class="result-panel wide">
          <div class="section-head">
            <span>01</span>
            <h2>设定树</h2>
          </div>
          <template v-if="settingTreeRoots.length">
            <div class="setting-tree-list">
              <div
                v-for="root in settingTreeRoots"
                :key="root.name || root.title"
                class="setting-root"
              >
                <strong>{{ root.name || root.title || '未命名设定' }}</strong>
                <p>{{ root.description || root.summary || '暂无描述。' }}</p>
                <ul v-if="asArray(root.children).length">
                  <li
                    v-for="child in asArray(root.children)"
                    :key="child.name || child.title"
                  >
                    <b>{{ child.name || child.title || '未命名子项' }}</b>
                    <span>{{ child.description || child.summary || '' }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </template>
          <template v-else-if="parsedResult">
            <div class="title-options">
              <el-tag
                v-for="title in asArray(parsedResult.core?.titleOptions)"
                :key="title"
                round
              >
                {{ title }}
              </el-tag>
            </div>
            <dl class="info-list">
              <div>
                <dt>一句话卖点</dt>
                <dd>{{ textOrEmpty(parsedResult.core?.oneLineHook) }}</dd>
              </div>
              <div>
                <dt>简介</dt>
                <dd>{{ textOrEmpty(parsedResult.core?.synopsis) }}</dd>
              </div>
              <div>
                <dt>题材标签</dt>
                <dd>{{ joinText(parsedResult.core?.genreTags) }}</dd>
              </div>
              <div>
                <dt>目标平台</dt>
                <dd>{{ joinText(parsedResult.core?.targetPlatforms) }}</dd>
              </div>
              <div>
                <dt>商业方向</dt>
                <dd>{{ textOrEmpty(parsedResult.core?.monetizationPath) }}</dd>
              </div>
            </dl>
          </template>
          <pre
            v-else
            class="raw-output"
          >{{ job.rawOutput || '暂无输出。' }}</pre>
          <el-alert
            v-if="job.rawOutput && !parsedResult && job.status === 'completed'"
            type="warning"
            show-icon
            :closable="false"
            title="结构化解析失败，已展示原始 AI 输出。"
          />
        </article>

        <article class="result-panel">
          <div class="section-head">
            <span>02</span>
            <h2>故事发动机</h2>
          </div>
          <dl class="info-list">
            <div
              v-for="item in engineItems"
              :key="item.label"
            >
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </article>

        <article class="result-panel">
          <div class="section-head">
            <span>03</span>
            <h2>人物种子</h2>
          </div>
          <div
            v-if="characters.length"
            class="stack-list"
          >
            <div
              v-for="item in characters"
              :key="`${item.name}-${item.role}`"
            >
              <strong>{{ item.name || item.role || '未命名角色' }}</strong>
              <p>{{ [item.role, item.identity, item.personality].filter(Boolean).join(' · ') }}</p>
              <small>{{ item.growthArc || item.goal || item.flaw || '暂无人物补充。' }}</small>
            </div>
          </div>
          <p
            v-else
            class="soft-empty"
          >
            暂无人物内容。
          </p>
        </article>

        <article class="result-panel">
          <div class="section-head">
            <span>04</span>
            <h2>世界规则</h2>
          </div>
          <dl class="info-list">
            <div>
              <dt>世界背景</dt>
              <dd>{{ textOrEmpty(parsedResult?.world?.background) }}</dd>
            </div>
            <div>
              <dt>核心规则</dt>
              <dd>{{ joinText(parsedResult?.world?.coreRules) }}</dd>
            </div>
            <div>
              <dt>力量体系</dt>
              <dd>{{ textOrEmpty(parsedResult?.world?.powerSystem) }}</dd>
            </div>
            <div>
              <dt>组织势力</dt>
              <dd>{{ joinText(parsedResult?.world?.organizations) }}</dd>
            </div>
            <div>
              <dt>重要地点</dt>
              <dd>{{ joinText(parsedResult?.world?.locations) }}</dd>
            </div>
            <div>
              <dt>禁忌设定</dt>
              <dd>{{ joinText(parsedResult?.world?.taboos) }}</dd>
            </div>
          </dl>
        </article>

        <article class="result-panel">
          <div class="section-head">
            <span>05</span>
            <h2>黄金三章</h2>
          </div>
          <div
            v-if="goldenThreeChapters.length"
            class="chapter-list"
          >
            <div
              v-for="(chapter, index) in goldenThreeChapters"
              :key="chapter.index || chapter.chapter || chapter.title"
            >
              <strong>第 {{ chapter.index || chapter.chapter || index + 1 }} 章：{{
                chapter.title || '未命名章节'
              }}</strong>
              <p>
                {{
                  chapter.summary ||
                    chapter.hook ||
                    chapter.progression ||
                    chapter.explosionPoint ||
                    chapter.conflict ||
                    '暂无章节方向。'
                }}
              </p>
              <small>{{
                [
                  chapter.openingImage,
                  chapter.coreEvent,
                  chapter.characterChange,
                  chapter.endingHook || chapter.sellingPoint || chapter.twist
                ]
                  .filter(Boolean)
                  .join(' / ')
              }}</small>
            </div>
          </div>
          <p
            v-else
            class="soft-empty"
          >
            暂无章节内容。
          </p>
        </article>

        <article class="result-panel">
          <div class="section-head">
            <span>06</span>
            <h2>写作约束</h2>
          </div>
          <dl class="info-list">
            <div>
              <dt>文风</dt>
              <dd>{{ textOrEmpty(parsedResult?.writingGuide?.style) }}</dd>
            </div>
            <div>
              <dt>节奏</dt>
              <dd>{{ textOrEmpty(parsedResult?.writingGuide?.pace) }}</dd>
            </div>
            <div>
              <dt>叙事人称</dt>
              <dd>{{ textOrEmpty(parsedResult?.writingGuide?.pointOfView) }}</dd>
            </div>
            <div>
              <dt>禁用方向</dt>
              <dd>{{ joinText(parsedResult?.writingGuide?.avoid) }}</dd>
            </div>
            <div>
              <dt>参考素材</dt>
              <dd>{{ joinText(parsedResult?.writingGuide?.references) }}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="action-panel">
        <el-button
          :disabled="!canUseResult"
          :loading="savingTopic"
          @click="saveAsTopicCard"
        >
          保存为选题卡
        </el-button>
        <el-button
          :disabled="!canUseResult"
          :loading="refining"
          @click="refineSetting"
        >
          继续完善设定
        </el-button>
        <el-button
          :disabled="!canUseResult"
          :loading="outlining"
          @click="generateOutline"
        >
          生成详细大纲
        </el-button>
        <el-button
          type="primary"
          :disabled="!canUseResult"
          :loading="creatingBook"
          @click="convertToBook"
        >
          转为新书
        </el-button>
        <el-button
          :disabled="!canUseResult"
          :loading="covering"
          @click="generateCoverPrompt"
        >
          生成封面提示词
        </el-button>
        <el-button
          :disabled="!job.rawOutput"
          @click="copyMarkdown"
        >
          复制 Markdown
        </el-button>
        <el-button @click="router.push('/ai/text-tools')">
          打开 AI 工坊
        </el-button>
      </section>

      <section
        v-if="derivedOutput"
        class="derived-panel"
      >
        <div class="section-head">
          <span>{{
            derivedOutput.kind === 'outline'
              ? '大纲'
              : derivedOutput.kind === 'cover'
                ? '封面'
                : '设定'
          }}</span>
          <h2>{{ derivedOutput.title }}</h2>
        </div>
        <pre>{{ derivedOutput.content }}</pre>
      </section>

      <section class="usage-panel">
        <div>
          <span>模型</span>
          <strong>{{ job.model || '未记录' }}</strong>
        </div>
        <div>
          <span>输入 token</span>
          <strong>{{ numberText(inputTokens) }}</strong>
        </div>
        <div>
          <span>输出 token</span>
          <strong>{{ numberText(outputTokens) }}</strong>
        </div>
        <div>
          <span>总 token</span>
          <strong>{{ numberText(totalTokens) }}</strong>
        </div>
        <div>
          <span>耗时</span>
          <strong>{{
            job.latencyMs ? `${(job.latencyMs / 1000).toFixed(1)} 秒` : '未记录'
          }}</strong>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createBook, readBooksDir } from '@renderer/service/books'
import { createKnowledgeItem } from '@renderer/service/knowledgeBase'
import { runAiTextTask } from '@renderer/service/aiWorkshop'
import { getCreationStarterJob, updateCreationStarterJob } from '@renderer/service/creationStarter'
import { writeOutlineDocument, writeSettingsDocument } from '@renderer/service/editor'

const route = useRoute()
const router = useRouter()
const job = ref(null)
const loadingJob = ref(false)
const starterLoadError = ref('')
const savingTopic = ref(false)
const refining = ref(false)
const outlining = ref(false)
const covering = ref(false)
const creatingBook = ref(false)
const derivedOutput = ref(null)

const advancedLabels = {
  genre: '目标题材',
  platform: '目标平台',
  audience: '目标读者',
  length: '目标篇幅',
  style: '故事风格',
  pointOfView: '叙事人称',
  monetization: '商业方向',
  forbidden: '禁用方向',
  requiredElements: '必须包含元素',
  excludedElements: '不想出现的元素'
}

const parsedResult = computed(() => job.value?.result || null)
const settingTreeRoots = computed(() => {
  const tree = parsedResult.value?.settingTree
  const roots = Array.isArray(tree?.roots) ? tree.roots : Array.isArray(tree) ? tree : []
  return roots
})
const characters = computed(() => asArray(parsedResult.value?.characters))
const openingChapters = computed(() => asArray(parsedResult.value?.openingChapters))
const goldenThreeChapters = computed(() =>
  asArray(parsedResult.value?.goldenThreeChapters).length
    ? asArray(parsedResult.value?.goldenThreeChapters)
    : openingChapters.value
)
const canUseResult = computed(() => Boolean(job.value?.rawOutput || parsedResult.value))
const statusText = computed(() => {
  const map = {
    pending: '等待生成',
    running: '生成中',
    completed: '生成完成',
    failed: '生成失败',
    canceled: '已取消'
  }
  return map[job.value?.status] || '未知状态'
})
const statusType = computed(() => {
  if (job.value?.status === 'completed') return 'success'
  if (job.value?.status === 'failed') return 'danger'
  if (job.value?.status === 'running') return 'warning'
  return 'info'
})
const filledAdvanced = computed(() =>
  Object.entries(job.value?.advanced || {})
    .map(([key, value]) => ({
      key,
      label: advancedLabels[key] || key,
      value: String(value || '').trim()
    }))
    .filter((item) => item.value)
)
const engineItems = computed(() => {
  const engine = parsedResult.value?.engine || {}
  return [
    ['主角欲望', engine.protagonistDesire],
    ['主角困境', engine.protagonistDilemma],
    ['金手指', engine.goldenFinger],
    ['核心矛盾', engine.coreConflict],
    ['爽点机制', engine.sellingPointMechanism],
    ['升级机制', engine.progressionSystem],
    ['长期悬念', engine.longTermSuspense]
  ].map(([label, value]) => ({ label, value: textOrEmpty(value) }))
})
const inputTokens = computed(() =>
  Number(job.value?.usage?.prompt_tokens || job.value?.usage?.promptTokens || 0)
)
const outputTokens = computed(() =>
  Number(job.value?.usage?.completion_tokens || job.value?.usage?.completionTokens || 0)
)
const totalTokens = computed(() =>
  Number(
    job.value?.usage?.total_tokens ||
      job.value?.usage?.totalTokens ||
      inputTokens.value + outputTokens.value
  )
)

onMounted(async () => {
  const loadedJob = await loadJob()
  if (loadedJob?.status === 'pending') {
    await runStarterGeneration()
  }
})

async function loadJob() {
  loadingJob.value = true
  starterLoadError.value = ''
  try {
    job.value = await getCreationStarterJob(route.query.jobId)
    return job.value
  } catch (error) {
    job.value = null
    starterLoadError.value = error?.message || '读取起笔任务失败'
    ElMessage.error(starterLoadError.value)
    return null
  } finally {
    loadingJob.value = false
  }
}

async function retryLoadJob() {
  const loadedJob = await loadJob()
  if (loadedJob?.status === 'pending') {
    await runStarterGeneration()
  }
}

function requireAiTextContent(result, fallback = '生成失败') {
  if (result?.success !== true) throw new Error(result?.message || fallback)
  const content = typeof result?.content === 'string' ? result.content.trim() : ''
  if (!content) throw new Error(`${fallback}：接口没有返回正文内容`)
  return content
}

function requireKnowledgeItemResult(result, fallback = '保存失败') {
  if (result?.success !== true) throw new Error(result?.message || fallback)
  if (!result?.item || typeof result.item !== 'object' || Array.isArray(result.item)) {
    throw new Error(`${fallback}：接口返回格式不正确`)
  }
  return result.item
}

function requireCreatedBookResult(result, expectedName, fallback = '创建作品失败') {
  if (result?.success !== true) throw new Error(result?.message || fallback)
  if (result.bookName !== expectedName) throw new Error(`${fallback}：返回作品名不一致`)
  if (typeof result.bookPath !== 'string' || !result.bookPath.trim()) {
    throw new Error(`${fallback}：缺少作品目录`)
  }
  if (result.databaseSync?.success !== true) {
    throw new Error(`${fallback}：数据库没有记录作品资料`)
  }
  return result
}

function requireBookVisibleInShelf(books, expectedName, fallback = '刷新书架失败') {
  if (!Array.isArray(books)) throw new Error(`${fallback}：接口返回格式不正确`)
  const matchedBook = books.find((item) => item?.name === expectedName || item?.bookName === expectedName)
  if (!matchedBook) throw new Error(`${fallback}：新作品未出现在书架列表中`)
  return matchedBook
}

async function runStarterGeneration() {
  if (!job.value) return
  try {
    job.value = await updateCreationStarterJob(job.value.id, {
      status: 'running',
      errorMessage: ''
    })
  } catch (error) {
    starterLoadError.value = error?.message || '更新起笔任务失败'
    ElMessage.error(starterLoadError.value)
    return
  }
  try {
    const result = await runAiTextTask({
      task: 'topic',
      feature: 'creation_starter',
      title: '创作起笔',
      content: buildAiContent(job.value),
      instruction: buildAiInstruction(),
      presetId: job.value.advanced?.promptPresetId || '',
      providerId: job.value.providerId || '',
      model: job.value.model || '',
      maxTokens: 4200,
      temperature: 0.72
    })
    const rawOutput = requireAiTextContent(result, '生成失败')
    const parsed = parseJsonResult(rawOutput)
    job.value = await updateCreationStarterJob(job.value.id, {
      status: 'completed',
      rawOutput,
      result: parsed,
      usage: result.usage || {},
      providerId: result.providerId || '',
      model: result.model || '',
      latencyMs: result.latencyMs || 0,
      errorMessage: ''
    })
  } catch (error) {
    try {
      job.value = await updateCreationStarterJob(job.value.id, {
        status: 'failed',
        errorMessage: error?.message || '生成失败'
      })
    } catch (writeError) {
      starterLoadError.value = writeError?.message || '保存起笔任务失败'
      ElMessage.error(starterLoadError.value)
    }
  }
}

function buildAiContent(currentJob) {
  return JSON.stringify(
    {
      prompt: currentJob.prompt,
      manualReferences: currentJob.references,
      autoReferences: currentJob.autoReferences,
      advanced: currentJob.advanced
    },
    null,
    2
  )
}

function buildAiInstruction() {
  return [
    '你是网文创作策划助手。请根据输入想法和所选提示词，生成一个可直接用于开书的设定树和黄金三章。',
    '必须优先返回合法 JSON，不要使用 Markdown 代码块。',
    'JSON 字段必须包含 settingTree、goldenThreeChapters、writingGuide。',
    'settingTree 要包含核心卖点、主角设定、金手指或核心设定、世界规则、冲突来源。',
    'goldenThreeChapters 必须给出前三章，每章包含标题、概要、开场画面、核心事件、人物变化、章末钩子。',
    '内容必须具体，避免空泛描述。'
  ].join('\n')
}

function parseJsonResult(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const candidates = [raw]
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) candidates.push(objectMatch[0])
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 尝试下一个候选内容
    }
  }
  return null
}

async function saveAsTopicCard() {
  if (!job.value) return
  savingTopic.value = true
  try {
    const result = await createKnowledgeItem({
      type: 'topic_card',
      title: firstTitle(),
      summary: parsedResult.value?.core?.oneLineHook || job.value.prompt,
      content: toMarkdown(),
      tags: asArray(parsedResult.value?.core?.genreTags),
      platformTags: asArray(parsedResult.value?.core?.targetPlatforms),
      sourceType: 'creation_starter',
      sourceIds: [job.value.id],
      favorite: true,
      status: 'active',
      metadata: {
        creationStarterJobId: job.value.id,
        parsedResult: parsedResult.value
      }
    })
    requireKnowledgeItemResult(result, '保存失败')
    ElMessage.success('已保存为选题卡')
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    savingTopic.value = false
  }
}

async function refineSetting() {
  await runDerivedTask(
    'refine',
    '完善后的设定',
    '请在已有起笔方案基础上，继续补充世界规则、人物关系和核心冲突，保留可执行的条目。',
    refining
  )
}

async function generateOutline() {
  await runDerivedTask(
    'outline',
    '详细大纲',
    '请基于起笔方案生成前 30 章详细大纲，每章包含标题、剧情推进、冲突、章末钩子。',
    outlining
  )
}

async function generateCoverPrompt() {
  await runDerivedTask(
    'cover',
    '封面提示词',
    '请基于起笔方案生成 3 套中文封面提示词，包含画面主体、场景、氛围、构图、避开的元素。',
    covering
  )
}

async function runDerivedTask(kind, title, instruction, loadingRef) {
  if (!job.value) return
  loadingRef.value = true
  try {
    const result = await runAiTextTask({
      task: kind === 'outline' ? 'outline' : 'topic',
      feature: `creation_starter_${kind}`,
      title,
      content: toMarkdown(),
      instruction,
      maxTokens: kind === 'outline' ? 5000 : 2600,
      temperature: 0.68
    })
    const content = requireAiTextContent(result, `${title}失败`)
    derivedOutput.value = {
      kind,
      title,
      content
    }
    ElMessage.success(`${title}已生成`)
  } catch (error) {
    ElMessage.error(error?.message || `${title}失败`)
  } finally {
    loadingRef.value = false
  }
}

async function convertToBook() {
  if (!job.value) return
  creatingBook.value = true
  try {
    const title = uniqueBookName(firstTitle())
    const bookData = {
      id: `${Date.now()}${Math.floor(Math.random() * 10000)}`,
      name: title,
      type: 'xuanhua',
      typeName: asArray(parsedResult.value?.core?.genreTags)[0] || '玄幻',
      targetCount: 1000000,
      intro: parsedResult.value?.core?.synopsis || job.value.prompt,
      password: null,
      coverColor: '#6f7a68',
      coverUrl: null
    }
    const createdBook = requireCreatedBookResult(await createBook(bookData), title)
    await writeSettingsDocument(title, buildSettingsPayload())
    await writeOutlineDocument(title, buildOutlinesPayload())
    const topicResult = await createKnowledgeItem({
      type: 'topic_card',
      title: `《${title}》起笔方案`,
      summary: parsedResult.value?.core?.oneLineHook || job.value.prompt,
      content: toMarkdown(),
      tags: asArray(parsedResult.value?.core?.genreTags),
      sourceType: 'creation_starter',
      sourceIds: [job.value.id, bookData.id],
      status: 'active',
      metadata: { creationStarterJobId: job.value.id, bookId: bookData.id, bookName: title }
    })
    requireKnowledgeItemResult(topicResult, '保存选题卡失败')
    const books = await readBooksDir()
    requireBookVisibleInShelf(books, title)
    ElMessage.success(`已创建《${title}》`)
    openBook({ ...bookData, bookPath: createdBook.bookPath })
  } catch (error) {
    ElMessage.error(error?.message || '转为新书失败')
  } finally {
    creatingBook.value = false
  }
}

function buildSettingsPayload() {
  const items = []
  const addItem = (name, introduction) => {
    const content = String(introduction || '').trim()
    if (!content) return
    items.push({ id: genId(), name, introduction: content })
  }
  addItem('一句话卖点', parsedResult.value?.core?.oneLineHook)
  addItem('作品简介', parsedResult.value?.core?.synopsis)
  addItem('故事发动机', engineItems.value.map((item) => `${item.label}：${item.value}`).join('\n'))
  addItem('世界规则', toWorldText())
  characters.value.forEach((item) => {
    addItem(
      `人物：${item.name || item.role || '未命名角色'}`,
      [item.role, item.identity, item.personality, item.flaw, item.goal, item.growthArc]
        .filter(Boolean)
        .join('\n')
    )
  })
  return {
    categories: [
      {
        id: genId(),
        name: '创作起笔设定',
        introduction: '由创作起笔生成，可继续编辑。',
        children: [],
        items
      }
    ]
  }
}

function buildOutlinesPayload() {
  return {
    content: [parsedResult.value?.core?.synopsis, parsedResult.value?.core?.oneLineHook]
      .filter(Boolean)
      .join('\n\n'),
    children: openingChapters.value.map((chapter, index) => ({
      id: genId(),
      title: chapter.title || `第${index + 1}章`,
      content: [
        chapter.hook,
        chapter.conflict,
        chapter.progression,
        chapter.sellingPoint,
        chapter.explosionPoint,
        chapter.twist,
        chapter.endingHook
      ]
        .filter(Boolean)
        .join('\n'),
      children: []
    }))
  }
}

async function copyMarkdown() {
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      throw new Error('当前环境不支持剪贴板写入')
    }
    const text = toMarkdown()
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制 Markdown')
  } catch (error) {
    ElMessage.error(error?.message || '复制 Markdown 失败')
  }
}

function toMarkdown() {
  if (!parsedResult.value) return job.value?.rawOutput || ''
  return [
    `# ${firstTitle()}`,
    '',
    `## 作品核心`,
    `- 一句话卖点：${textOrEmpty(parsedResult.value.core?.oneLineHook)}`,
    `- 简介：${textOrEmpty(parsedResult.value.core?.synopsis)}`,
    `- 题材标签：${joinText(parsedResult.value.core?.genreTags)}`,
    `- 目标平台：${joinText(parsedResult.value.core?.targetPlatforms)}`,
    '',
    `## 故事发动机`,
    ...engineItems.value.map((item) => `- ${item.label}：${item.value}`),
    '',
    `## 人物种子`,
    ...characters.value.map(
      (item) =>
        `- ${item.name || item.role || '未命名角色'}：${[item.role, item.identity, item.personality, item.flaw, item.goal, item.growthArc].filter(Boolean).join('；')}`
    ),
    '',
    `## 世界规则`,
    toWorldText(),
    '',
    `## 起笔三章`,
    ...openingChapters.value.map(
      (chapter) =>
        `- 第 ${chapter.chapter || '-'} 章《${chapter.title || '未命名章节'}》：${[chapter.hook, chapter.conflict, chapter.progression, chapter.sellingPoint, chapter.explosionPoint, chapter.twist, chapter.endingHook].filter(Boolean).join('；')}`
    ),
    '',
    `## 写作约束`,
    `- 文风：${textOrEmpty(parsedResult.value.writingGuide?.style)}`,
    `- 节奏：${textOrEmpty(parsedResult.value.writingGuide?.pace)}`,
    `- 叙事人称：${textOrEmpty(parsedResult.value.writingGuide?.pointOfView)}`,
    `- 禁用方向：${joinText(parsedResult.value.writingGuide?.avoid)}`
  ].join('\n')
}

function toWorldText() {
  const world = parsedResult.value?.world || {}
  return [
    `世界背景：${textOrEmpty(world.background)}`,
    `核心规则：${joinText(world.coreRules)}`,
    `力量体系：${textOrEmpty(world.powerSystem)}`,
    `组织势力：${joinText(world.organizations)}`,
    `重要地点：${joinText(world.locations)}`,
    `禁忌设定：${joinText(world.taboos)}`
  ].join('\n')
}

function openBook(bookData) {
  router.push({ path: '/editor', query: { name: bookData.name } })
}

function firstTitle() {
  return (
    asArray(parsedResult.value?.core?.titleOptions)[0] ||
    job.value?.prompt?.slice(0, 18) ||
    '未命名新书'
  )
}

function uniqueBookName(rawName) {
  return (
    String(rawName || '未命名新书')
      .trim()
      .slice(0, 15) || `新书${Date.now()}`
  )
}

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item != null) : []
}

function joinText(value) {
  const rows = asArray(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return rows.length ? rows.join('、') : '未记录'
}

function textOrEmpty(value) {
  return String(value || '').trim() || '未记录'
}

function numberText(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function typeText(type) {
  const map = {
    book: '作品',
    topic_card: '选题',
    book_analysis: '拆书',
    extraction: '拆书',
    market_hotspot: '热点',
    writer_activity: '活动',
    note: '笔记',
    character_setting: '人物',
    world_setting: '世界观',
    plot_fragment: '片段',
    prompt_template: 'Prompt'
  }
  return map[type] || '素材'
}

function formatDateTime(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style lang="scss" scoped>
.starter-result-page {
  display: grid;
  gap: 16px;
}

.hero-panel,
.status-panel,
.state-panel,
.result-panel,
.action-panel,
.usage-panel,
.derived-panel {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.32), transparent 56%), rgba(251, 250, 246, 0.9);
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;

  h1 {
    max-width: 720px;
    margin: 6px 0 0;
    color: var(--text-base);
    font-size: 26px;
    line-height: 1.4;
  }
}

.eyebrow {
  margin: 0;
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 700;
}

.state-panel,
.status-panel {
  padding: 18px;
}

.status-panel {
  display: grid;
  gap: 12px;

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 4px;
    color: var(--text-gray);
    font-size: 13px;
  }
}

.context-collapse {
  border-radius: 8px;
  overflow: hidden;
}

.context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  article {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    background: rgba(251, 250, 246, 0.78);
  }

  h3 {
    margin: 0 0 8px;
    font-size: 15px;
  }

  p,
  ul {
    margin: 0;
    color: var(--text-gray);
    line-height: 1.7;
  }
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.result-panel {
  padding: 18px;

  &.wide {
    grid-column: 1 / -1;
  }
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  span {
    min-width: 34px;
    border-radius: 999px;
    background: var(--primary-color);
    color: var(--wabi-paper);
    font-size: 12px;
    font-weight: 700;
    line-height: 24px;
    text-align: center;
  }

  h2 {
    margin: 0;
    color: var(--text-base);
    font-size: 18px;
  }
}

.title-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.info-list {
  display: grid;
  gap: 10px;
  margin: 0;

  div {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 12px;
  }

  dt {
    color: var(--text-gray);
    font-size: 13px;
  }

  dd {
    margin: 0;
    color: var(--text-base);
    line-height: 1.7;
  }
}

.stack-list,
.chapter-list,
.setting-tree-list {
  display: grid;
  gap: 10px;

  > div {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    background: rgba(251, 250, 246, 0.78);
  }

  strong {
    display: block;
    color: var(--text-base);
  }

  p {
    margin: 6px 0;
    color: var(--text-base);
    line-height: 1.6;
  }

  small {
    color: var(--text-gray);
  }
}

.setting-root ul {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding-left: 18px;
}

.setting-root li {
  color: var(--text-base);
  line-height: 1.6;

  b {
    display: inline;
    margin-right: 6px;
  }
}

.raw-output,
.derived-panel pre {
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-base);
  font: inherit;
  line-height: 1.8;
}

.soft-empty {
  margin: 0;
  color: var(--text-gray);
}

.action-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px;
}

.derived-panel {
  padding: 18px;
}

.usage-panel {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;

  div {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    background: rgba(251, 250, 246, 0.78);
  }

  span,
  strong {
    display: block;
  }

  span {
    color: var(--text-gray);
    font-size: 12px;
  }

  strong {
    margin-top: 6px;
    color: var(--text-base);
  }
}

@media (max-width: 960px) {
  .hero-panel,
  .status-panel {
    display: block;
  }

  .context-grid,
  .result-grid,
  .usage-panel {
    grid-template-columns: 1fr;
  }
}
</style>

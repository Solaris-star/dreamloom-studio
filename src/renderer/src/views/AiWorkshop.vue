<template>
  <section class="ai-workshop-shell">
    <header class="ai-workshop-header">
      <div class="header-copy">
        <p class="eyebrow">{{ activePage.label }}</p>
        <h1>{{ activePage.title }}</h1>
      </div>
      <div class="header-aside">
        <details class="quiet-note">
          <summary :aria-label="`${activePage.title}说明`" title="说明">
            <Info :size="16" />
          </summary>
          <p>{{ activePage.description }}</p>
        </details>
        <div class="header-metrics" aria-label="当前 AI 状态">
          <span>{{ currentModelText }}</span>
          <span>{{ estimatedTokens }} Token</span>
        </div>
      </div>
    </header>

    <section v-if="activeTab === 'prompts'" class="manager-panel ai-card">
      <div class="panel-title">
        <div>
          <h2>Prompt 模板</h2>
          <p>管理真实可用的提示词模板，写作时可以直接选用。</p>
        </div>
        <el-button type="primary" class="primary-action" :icon="Plus" @click="handleCreatePreset"
          >新建模板</el-button
        >
      </div>
      <p v-if="promptLoadError" class="manager-error">{{ promptLoadError }}</p>
      <el-empty v-else-if="!promptPresets.length" description="暂无 Prompt 模板" />
      <div
        v-else
        v-motion-list="{ selector: '.prompt-card', key: `prompts:${promptPresets.length}` }"
        class="prompt-grid"
      >
        <article v-for="preset in promptPresets" :key="preset.id" class="prompt-card">
          <div>
            <h3>{{ promptPresetDisplayName(preset) }}</h3>
            <el-tag>{{ preset.category || '通用' }}</el-tag>
            <el-tag type="info">{{ promptScopeText(preset) }}</el-tag>
          </div>
          <p>{{ preset.systemPrompt || '未填写系统提示词。' }}</p>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'history'" class="manager-panel ai-card">
      <div class="panel-title">
        <div>
          <h2>生成历史</h2>
          <p>查看本地保存的 AI 文本与图像生成记录。</p>
        </div>
        <el-button :icon="Refresh" @click="loadHistory">刷新</el-button>
      </div>
      <p v-if="historyLoadError" class="manager-error">{{ historyLoadError }}</p>
      <el-empty v-else-if="!historyItems.length" description="暂无生成历史" />
      <div
        v-else
        v-motion-list="{ selector: '.history-card', key: `history:${historyItems.length}` }"
        class="history-list"
      >
        <article
          v-for="item in historyItems"
          :key="item.id"
          class="history-card"
          @click="openHistory(item)"
        >
          <div class="history-head">
            <h3>{{ item.title || item.feature || 'AI 生成' }}</h3>
            <span>{{ formatTime(item.createdAt) }}</span>
          </div>
          <p>{{ item.input || '未记录输入内容。' }}</p>
          <pre>{{ item.output || '未记录输出内容。' }}</pre>
        </article>
      </div>
    </section>

    <section v-else class="ai-workshop-body">
      <main ref="toolPanelRef" class="ai-workspace-panel ai-card">
        <div class="tool-header">
          <div class="tool-title-stack">
            <p class="tool-kind">{{ activeTabLabel }}</p>
            <h2>{{ activeTool.label }}</h2>
          </div>
          <div class="tool-header-actions">
            <el-tag v-if="starterJob" :type="starterStatusType">{{ starterStatusText }}</el-tag>
            <details class="quiet-note tool-note">
              <summary :aria-label="`${activeTool.label}说明`" title="说明">
                <Info :size="16" />
              </summary>
              <div class="tool-note-card">
                <p>{{ activeTool.hint }}</p>
                <p v-if="activeTool.tip">{{ activeTool.tip }}</p>
              </div>
            </details>
          </div>
        </div>

        <p v-if="latestErrorText" class="tool-error">{{ latestErrorText }}</p>
        <section v-if="generationStatusVisible" class="generation-status-card" aria-live="polite">
          <div class="generation-status-head">
            <strong>{{ generationStatusText }}</strong>
            <span>已用时间：{{ generationElapsedText }}</span>
          </div>
          <dl>
            <div>
              <dt>所选模型</dt>
              <dd>{{ currentModelText }}</dd>
            </div>
            <div>
              <dt>引用素材</dt>
              <dd>{{ generationReferenceText }}</dd>
            </div>
            <div>
              <dt>错误提示</dt>
              <dd>{{ latestErrorText || '无' }}</dd>
            </div>
          </dl>
          <div v-if="latestErrorText" class="generation-status-actions">
            <el-button :loading="running" @click="handlePrimaryAction">重试</el-button>
            <el-button @click="copyLatestError">复制错误信息</el-button>
          </div>
        </section>

        <div class="setup-strip">
          <label v-if="activeTools.length > 1" class="field-block strip-field">
            <span>任务</span>
            <el-select
              v-model="activeToolKey"
              placeholder="选择任务"
              :disabled="running"
              @change="selectTool"
            >
              <el-option
                v-for="tool in activeTools"
                :key="tool.key"
                :label="tool.label"
                :value="tool.key"
              />
            </el-select>
          </label>

          <label class="field-block strip-field">
            <span>模板</span>
            <el-select
              v-if="activePromptPresets.length"
              v-model="selectedPresetId"
              clearable
              filterable
              :disabled="running"
              placeholder="默认提示词"
            >
              <el-option
                v-for="preset in activePromptPresets"
                :key="preset.id"
                :label="promptPresetDisplayName(preset)"
                :value="preset.id"
              />
            </el-select>
            <span v-else class="plain-state">默认提示词</span>
          </label>
        </div>

        <div class="source-context-bar">
          <div class="source-context-head">
            <div>
              <span>引用</span>
              <strong>{{ contextStatusText }}</strong>
            </div>
            <el-dropdown trigger="click" @command="addContextByKey">
              <el-button text :icon="Plus">添加</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="item in availableContextItems"
                    :key="item.key"
                    :command="item.key"
                  >
                    {{ item.typeLabel }}：{{ item.title }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="contextLoadError" disabled>
                    {{ contextLoadError }}
                  </el-dropdown-item>
                  <el-dropdown-item v-else-if="!availableContextItems.length" disabled>
                    暂无可引用素材
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <p v-if="contextLoadError" class="context-load-error">{{ contextLoadError }}</p>
          <div v-if="selectedContexts.length" class="context-chip-list">
            <el-tag
              v-for="item in selectedContexts"
              :key="item.key"
              closable
              @close="removeContext(item.key)"
            >
              {{ item.typeLabel }}：{{ item.title }}
            </el-tag>
          </div>
        </div>

        <label class="field-block main-input-block">
          <span>{{ activeTool.inputLabel }}</span>
          <el-input
            v-model="mainInput"
            class="ai-input"
            type="textarea"
            :rows="activeTool.kind === 'image' ? 7 : 10"
            resize="none"
            :disabled="running"
            :placeholder="activeTool.placeholder"
          />
        </label>

        <el-collapse class="requirement-collapse">
          <el-collapse-item title="补充要求，可选" name="extra">
            <el-input
              v-model="extraRequirement"
              class="ai-input"
              type="textarea"
              :rows="3"
              resize="none"
              :disabled="running"
              placeholder="补充要求，可选。例如：风格轻松、节奏快、不要过度解释设定。"
            />
          </el-collapse-item>
        </el-collapse>

        <div v-if="activeTool.kind === 'image'" class="image-setting-row">
          <label>
            <span>图片尺寸</span>
            <el-select v-model="imageSize" :disabled="running" placeholder="尺寸">
              <el-option label="方图 1024" value="1024x1024" />
              <el-option label="横图 1280x720" value="1280x720" />
              <el-option label="竖图 720x1280" value="720x1280" />
            </el-select>
          </label>
          <label>
            <span>不想出现的内容</span>
            <el-input v-model="negativePrompt" :disabled="running" placeholder="可选" />
          </label>
        </div>

        <div class="action-bar">
          <el-button
            v-motion-feedback
            type="primary"
            class="primary-action"
            :icon="activeTool.kind === 'image' ? Picture : Wand2"
            :loading="running"
            @click="handlePrimaryAction"
          >
            {{ activeTool.actionLabel }}
          </el-button>
          <el-button
            :icon="DocumentCopy"
            :disabled="!hasLatestResult"
            @click="copyText(latestOutputText)"
          >
            复制结果
          </el-button>
          <el-button :disabled="!hasLatestResult" @click="resultDrawerVisible = true">
            查看完整结果
          </el-button>
          <el-button :disabled="!hasLatestResult" @click="saveResultToKnowledge">
            保存到素材库
          </el-button>
          <el-tooltip
            v-if="activeBookSaveName"
            :disabled="canSaveResultToBook"
            :content="saveResultToBookDisabledTip"
          >
            <span>
              <el-button :disabled="!canSaveResultToBook" @click="saveResultToBook"
                >应用到当前作品</el-button
              >
            </span>
          </el-tooltip>
          <el-dropdown trigger="click" @command="handleSecondaryAction">
            <el-button :icon="MoreFilled" title="更多操作" aria-label="更多操作" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="saveDraft" :icon="DocumentChecked"
                  >保存输入</el-dropdown-item
                >
                <el-dropdown-item command="clear" :icon="Delete">清空</el-dropdown-item>
                <el-dropdown-item
                  command="copyResult"
                  :icon="DocumentCopy"
                  :disabled="!hasLatestResult"
                  >复制结果</el-dropdown-item
                >
                <el-dropdown-item command="openResult" :disabled="!hasLatestResult"
                  >查看完整结果</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="workshop-status-row" aria-label="当前生成设置">
          <span>{{ selectedPresetName || '默认提示词' }}</span>
          <span>{{ contextStatusText }}</span>
          <span>{{ currentModelText }}</span>
          <span>{{ estimatedTokens }} Token</span>
        </div>
      </main>
    </section>

    <el-drawer v-model="resultDrawerVisible" size="min(720px, 92vw)" class="ai-result-drawer">
      <template #header>
        <div class="drawer-title">
          <p>{{ activeTool.label }}</p>
          <h2>生成结果</h2>
        </div>
      </template>
      <div class="drawer-meta">
        <el-tag>{{ latestImageUrl ? '图像结果' : '文本结果' }}</el-tag>
        <span>Token：{{ latestUsageText }}</span>
      </div>
      <img v-if="latestImageUrl" class="drawer-image" :src="latestImageUrl" alt="AI 生成图片" />
      <CreationStarterResultBlock
        v-else-if="activeTool.key === 'starter' && parsedStarterResult"
        :result="parsedStarterResult"
      />
      <pre v-else class="drawer-output">{{ latestOutputText || '暂无结果。' }}</pre>
      <div class="drawer-actions">
        <el-button :disabled="!hasLatestResult" @click="copyText(latestOutputText)">复制</el-button>
        <el-button :disabled="!hasLatestResult" @click="saveResultToKnowledge"
          >保存到素材库</el-button
        >
        <el-tooltip
          v-if="activeBookSaveName"
          :disabled="canSaveResultToBook"
          :content="saveResultToBookDisabledTip"
        >
          <span>
            <el-button :disabled="!canSaveResultToBook" @click="saveResultToBook"
              >应用到当前作品</el-button
            >
          </span>
        </el-tooltip>
        <el-button :disabled="!latestOutputText" @click="insertResultToInput">插入正文</el-button>
        <el-button :disabled="!latestOutputText" @click="continueRefine">继续完善</el-button>
        <el-button
          v-motion-feedback
          type="primary"
          class="primary-action"
          :loading="running"
          @click="handlePrimaryAction"
          >重新生成</el-button
        >
      </div>
    </el-drawer>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  Delete,
  DocumentChecked,
  DocumentCopy,
  MoreFilled,
  Picture,
  Plus,
  Refresh
} from '@element-plus/icons-vue'
import {
  BookOpen,
  Bot,
  Brush,
  ClipboardList,
  Drama,
  FileText,
  Flame,
  Info,
  Image,
  Landmark,
  Layers,
  Map,
  Network,
  PenLine,
  ScrollText,
  Shield,
  Sparkles,
  Sword,
  UserRound,
  Wand2,
  Zap
} from 'lucide-vue-next'
import { readBooksDir } from '@renderer/service/books'
import { setStoreValue } from '@renderer/service/webStore'
import {
  createPromptPreset,
  listAiHistory,
  listPromptPresets,
  runAiImageTask,
  runAiTextTask
} from '@renderer/service/aiWorkshop'
import { getActiveTextProvider, getAiProviders } from '@renderer/service/aiProvider'
import {
  ensureNoteDocument,
  ensureNotebookDocument,
  readCharactersDocument,
  readNoteDocument,
  readOutlineDocument,
  readSettingsDocument,
  runConsistencyCheck,
  writeCharactersDocument,
  writeNoteDocument,
  writeOutlineDocument,
  writeSettingsDocument
} from '@renderer/service/editor'
import { createKnowledgeItem, listKnowledgeItems } from '@renderer/service/knowledgeBase'
import { importAsset } from '@renderer/service/assets'
import { getCreationStarterJob, updateCreationStarterJob } from '@renderer/service/creationStarter'
import { listMarketActivities, listMarketHotspots } from '@renderer/service/market'
import { animateShake } from '@renderer/composables/useMotion'

const CreationStarterResultBlock = defineComponent({
  name: 'CreationStarterResultBlock',
  props: {
    result: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    const section = (title, body) =>
      h('article', { class: 'starter-result-section' }, [
        h('h3', title),
        h('p', body || '暂无内容。')
      ])
    const settingTree = () => {
      const roots = props.result.settingTree?.roots || props.result.settingTree || []
      if (!Array.isArray(roots)) return ''
      return roots
        .map((root) => {
          const children = Array.isArray(root.children)
            ? root.children
                .map(
                  (child) =>
                    `  - ${child.name || child.title || '未命名'}：${child.description || child.summary || ''}`
                )
                .join('\n')
            : ''
          return `${root.name || root.title || '未命名'}：${root.description || root.summary || ''}${children ? `\n${children}` : ''}`
        })
        .join('\n\n')
    }
    const goldenThreeChapters = () => {
      const chapters = props.result.goldenThreeChapters || props.result.openingChapters || []
      if (!Array.isArray(chapters)) return ''
      return chapters
        .map((item, index) => {
          const title = `第 ${item.index || item.chapter || index + 1} 章：${item.title || '未命名章节'}`
          const body = [
            item.summary,
            item.openingImage,
            item.coreEvent,
            item.characterChange,
            item.endingHook
          ]
            .filter(Boolean)
            .join('\n')
          return `${title}\n${body}`
        })
        .join('\n\n')
    }
    return () =>
      h('div', { class: 'starter-result-block' }, [
        section(
          '设定树',
          settingTree() || props.result.core?.oneLineHook || props.result.core?.synopsis
        ),
        section(
          '故事发动机',
          props.result.engine
            ? Object.entries(props.result.engine)
                .map(([key, value]) => `${key}：${value}`)
                .join('\n')
            : ''
        ),
        section(
          '人物种子',
          Array.isArray(props.result.characters)
            ? props.result.characters
                .map(
                  (item) =>
                    `${item.name || item.role || '角色'}：${item.identity || item.personality || ''}`
                )
                .join('\n')
            : ''
        ),
        section(
          '世界规则',
          props.result.world
            ? [
                props.result.world.background,
                props.result.world.powerSystem,
                ...(props.result.world.coreRules || [])
              ]
                .filter(Boolean)
                .join('\n')
            : ''
        ),
        section('黄金三章', goldenThreeChapters()),
        section(
          '写作约束',
          props.result.writingGuide
            ? [
                props.result.writingGuide.style,
                props.result.writingGuide.pace,
                props.result.writingGuide.pointOfView
              ]
                .filter(Boolean)
                .join('\n')
            : ''
        )
      ])
  }
})

const props = defineProps({
  mode: {
    type: String,
    default: 'creation'
  }
})

const route = useRoute()
const { t, te } = useI18n()

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

const aiPages = {
  creation: {
    label: '创作起笔',
    title: 'AI 小说设定助手',
    description: '输入故事念头，选择提示词，让织梦生成设定树和开篇黄金三章。'
  },
  text: {
    label: '文本处理',
    title: '处理一段正文',
    description: '续写、润色、改写、扩写和总结都在这里完成。'
  },
  plot: {
    label: '剧情规划',
    title: '整理剧情方向',
    description: '把灵感、冲突和章节安排变成更清楚的写作材料。'
  },
  world: {
    label: '人物世界',
    title: '补全人物与设定',
    description: '生成人物、关系、世界规则、地点和词条。'
  },
  image: {
    label: '图像生成',
    title: '生成创作图片',
    description: '生成封面、人物图、场景图和道具图。'
  },
  prompts: {
    label: 'Prompt 模板',
    title: 'Prompt 模板',
    description: '管理可复用的提示词模板。'
  },
  history: {
    label: '生成历史',
    title: '生成历史',
    description: '查看本地保存的 AI 生成记录。'
  }
}

const toolGroups = {
  creation: [
    {
      key: 'starter',
      label: '设定生成，黄金三章',
      task: 'topic',
      feature: 'creation_starter',
      hint: '输入一个想法，织梦会生成设定树和开篇黄金三章。',
      icon: Sparkles,
      actionLabel: '生成设定',
      inputLabel: '故事想法',
      placeholder: '说出你的故事想法',
      tip: '适合从一句灵感开始，生成可保存、可转成新书的设定树和黄金三章。'
    },
    {
      key: 'refine_setting',
      label: '完善设定',
      task: 'topic',
      hint: '补充世界规则、人物关系和核心冲突。',
      icon: Wand2,
      actionLabel: '完善设定',
      inputLabel: '设定草稿',
      placeholder: '粘贴已有设定或故事方向'
    },
    {
      key: 'opening',
      label: '生成开篇',
      task: 'golden_chapters',
      hint: '把想法扩展为开篇正文方向和前三章节奏。',
      icon: BookOpen,
      actionLabel: '生成开篇',
      inputLabel: '开篇方向',
      placeholder: '描述主角、开场场景和第一个冲突'
    },
    {
      key: 'topic_card',
      label: '转为选题卡',
      task: 'topic',
      hint: '把灵感整理为可保存的选题卡。',
      icon: ClipboardList,
      actionLabel: '生成选题卡',
      inputLabel: '灵感信息',
      placeholder: '输入题材、卖点、主角和核心冲突'
    },
    {
      key: 'new_book_plan',
      label: '转为新书',
      task: 'outline',
      hint: '生成新书基础资料，方便继续创建作品。',
      icon: ScrollText,
      actionLabel: '生成新书资料',
      inputLabel: '新书想法',
      placeholder: '输入书名方向、题材、主角、世界规则'
    }
  ],
  text: [
    {
      key: 'continue',
      label: 'AI 续写',
      task: 'continue',
      hint: '承接原文继续写，不重复上文，保持当前文风和剧情节奏。',
      icon: PenLine,
      actionLabel: '续写',
      inputLabel: '原文',
      placeholder: '输入正文、选题、设定或当前剧情'
    },
    {
      key: 'polish',
      label: 'AI 润色',
      task: 'polish',
      hint: '优化表达，保留原意和文风。',
      icon: Brush,
      actionLabel: '润色',
      inputLabel: '待润色文本',
      placeholder: '粘贴需要润色的正文'
    },
    {
      key: 'rewrite',
      label: 'AI 改写',
      task: 'rewrite',
      hint: '按你的要求改写文本。',
      icon: Wand2,
      actionLabel: '改写',
      inputLabel: '待改写文本',
      placeholder: '粘贴需要改写的正文'
    },
    {
      key: 'expand',
      label: 'AI 扩写',
      task: 'expand',
      hint: '补足动作、心理、景物和对话。',
      icon: Sparkles,
      actionLabel: '扩写',
      inputLabel: '待扩写文本',
      placeholder: '输入较短剧情或场景'
    },
    {
      key: 'summarize',
      label: 'AI 总结',
      task: 'summarize',
      hint: '提取要点，整理摘要。',
      icon: FileText,
      actionLabel: '总结',
      inputLabel: '待总结内容',
      placeholder: '粘贴章节或设定资料'
    },
    {
      key: 'logic_check',
      label: '检查逻辑',
      task: 'consistency_check',
      feature: 'consistency_check',
      hint: '检查剧情前后是否冲突。',
      icon: Shield,
      actionLabel: '检查逻辑',
      inputLabel: '剧情内容',
      placeholder: '粘贴剧情、设定或章节正文'
    },
    {
      key: 'conflict',
      label: '加强冲突',
      task: 'rewrite',
      hint: '增强人物目标、阻碍和对抗。',
      icon: Sword,
      actionLabel: '加强冲突',
      inputLabel: '当前剧情',
      placeholder: '输入一段偏平的剧情'
    },
    {
      key: 'selling_point',
      label: '加强爽点',
      task: 'rewrite',
      hint: '强化期待、回报和情绪释放。',
      icon: Flame,
      actionLabel: '加强爽点',
      inputLabel: '当前剧情',
      placeholder: '输入需要增强吸引力的剧情'
    },
    {
      key: 'chapter_hook',
      label: '生成章末钩子',
      task: 'plot',
      hint: '生成适合放在章节末尾的悬念。',
      icon: Zap,
      actionLabel: '生成钩子',
      inputLabel: '本章内容',
      placeholder: '输入本章剧情和下一章方向'
    }
  ],
  plot: [
    {
      key: 'topic',
      label: '选题生成',
      task: 'topic',
      hint: '生成原创小说选题卡。',
      icon: Bot,
      actionLabel: '生成选题',
      inputLabel: '灵感或市场信息',
      placeholder: '输入题材、读者、热点或你想写的方向'
    },
    {
      key: 'outline',
      label: '大纲生成',
      task: 'outline',
      hint: '把想法整理成可写的大纲。',
      icon: ClipboardList,
      actionLabel: '生成大纲',
      inputLabel: '故事方向',
      placeholder: '输入故事核心、主角目标和主要冲突'
    },
    {
      key: 'golden_chapters',
      label: '黄金三章',
      task: 'golden_chapters',
      hint: '设计前三章的开篇钩子和冲突。',
      icon: Drama,
      actionLabel: '生成黄金三章',
      inputLabel: '选题信息',
      placeholder: '输入选题卡、主角设定和开篇场景'
    },
    {
      key: 'plot',
      label: '剧情推演',
      task: 'plot',
      hint: '给出后续剧情方案。',
      icon: Layers,
      actionLabel: '推演剧情',
      inputLabel: '当前剧情',
      placeholder: '输入当前剧情和你卡住的地方'
    },
    {
      key: 'foreshadowing',
      label: '伏笔回收',
      task: 'plot',
      hint: '整理可回收伏笔和回收方式。',
      icon: Network,
      actionLabel: '生成回收方案',
      inputLabel: '伏笔列表',
      placeholder: '输入已有伏笔、人物秘密和后续目标'
    },
    {
      key: 'instance',
      label: '副本设计',
      task: 'outline',
      hint: '设计一次完整副本、任务或单元剧情。',
      icon: Map,
      actionLabel: '设计副本',
      inputLabel: '副本想法',
      placeholder: '输入副本主题、奖励、危险和关键角色'
    },
    {
      key: 'ending',
      label: '结局方案',
      task: 'plot',
      hint: '生成多个结局方向和收束方式。',
      icon: ScrollText,
      actionLabel: '生成结局',
      inputLabel: '长线剧情',
      placeholder: '输入主线、人物关系和必须回收的问题'
    }
  ],
  world: [
    {
      key: 'character',
      label: '人物生成',
      task: 'character',
      hint: '生成主要人物档案。',
      icon: UserRound,
      actionLabel: '生成人物',
      inputLabel: '故事方向',
      placeholder: '输入人物定位、题材和剧情功能'
    },
    {
      key: 'relationship',
      label: '人物关系',
      task: 'character',
      hint: '整理人物关系、矛盾和情感牵引。',
      icon: Network,
      actionLabel: '生成关系',
      inputLabel: '人物列表',
      placeholder: '输入人物名称、身份和当前关系'
    },
    {
      key: 'world',
      label: '世界观生成',
      task: 'world',
      hint: '生成规则、组织、地点和冲突体系。',
      icon: Landmark,
      actionLabel: '生成世界观',
      inputLabel: '故事方向',
      placeholder: '输入题材、时代、力量体系和主要矛盾'
    },
    {
      key: 'organization',
      label: '势力组织',
      task: 'world',
      hint: '生成组织、势力、阶层和冲突。',
      icon: Shield,
      actionLabel: '生成势力',
      inputLabel: '世界背景',
      placeholder: '输入世界背景和组织需求'
    },
    {
      key: 'location',
      label: '地点设定',
      task: 'world',
      hint: '生成地点、区域和可用场景。',
      icon: Map,
      actionLabel: '生成地点',
      inputLabel: '地点想法',
      placeholder: '输入地点名称、气质、用途和危险'
    },
    {
      key: 'dictionary',
      label: '词条生成',
      task: 'world',
      hint: '生成可放入词条字典的设定。',
      icon: ScrollText,
      actionLabel: '生成词条',
      inputLabel: '词条方向',
      placeholder: '输入术语、道具、势力或规则'
    },
    {
      key: 'rules',
      label: '规则体系',
      task: 'world',
      hint: '生成清晰的力量与限制规则。',
      icon: ClipboardList,
      actionLabel: '生成规则',
      inputLabel: '体系想法',
      placeholder: '输入能力、代价、升级和限制'
    }
  ],
  image: [
    {
      key: 'cover',
      label: '封面生成',
      kind: 'image',
      feature: 'ai_cover',
      hint: '适合生成书封背景和整体视觉。',
      icon: Picture,
      actionLabel: '生成图像',
      inputLabel: '封面画面',
      placeholder: '描述封面主体、背景、光影、构图和书籍气质'
    },
    {
      key: 'character_image',
      label: '人物图生成',
      kind: 'image',
      feature: 'ai_character_image',
      hint: '适合生成角色立绘或头像。',
      icon: UserRound,
      actionLabel: '生成图像',
      inputLabel: '人物画面',
      placeholder: '描述人物外貌、服装、姿态、表情和背景'
    },
    {
      key: 'scene_image',
      label: '场景图生成',
      kind: 'image',
      feature: 'ai_scene_image',
      hint: '适合生成关键场景画面。',
      icon: Image,
      actionLabel: '生成图像',
      inputLabel: '场景画面',
      placeholder: '描述场景、时间、氛围、人物位置和镜头感'
    },
    {
      key: 'map_concept',
      label: '地图概念图',
      kind: 'image',
      feature: 'ai_map_concept',
      hint: '生成地图或区域视觉概念。',
      icon: Map,
      actionLabel: '生成图像',
      inputLabel: '地图描述',
      placeholder: '描述地形、区域、标志地点和整体风格'
    },
    {
      key: 'prop_image',
      label: '道具图',
      kind: 'image',
      feature: 'ai_prop_image',
      hint: '生成关键道具或法宝视觉。',
      icon: Sword,
      actionLabel: '生成图像',
      inputLabel: '道具描述',
      placeholder: '描述道具材质、功能、纹样和氛围'
    }
  ]
}

const activeTab = ref(normalizeMode(props.mode))
const activeToolKey = ref(toolGroups[activeTab.value]?.[0]?.key || 'starter')
const selectedPresetId = ref('')
const promptPresets = ref([])
const promptLoadError = ref('')
const historyItems = ref([])
const historyLoadError = ref('')
const knowledgeItems = ref([])
const books = ref([])
const marketHotspots = ref([])
const marketActivities = ref([])
const selectedContexts = ref([])
const contextLoadError = ref('')
const mainInput = ref('')
const extraRequirement = ref('')
const negativePrompt = ref('')
const imageSize = ref('1024x1024')
const running = ref(false)
const latestOutputText = ref('')
const latestImageUrl = ref('')
const latestUsage = ref({})
const latestErrorText = ref('')
const resultDrawerVisible = ref(false)
const toolPanelRef = ref(null)
const starterJob = ref(null)
const starterJobReadError = ref('')
const parsedStarterResult = ref(null)
const currentModel = ref('')
const providerName = ref('')
const generationStartedAt = ref(0)
const generationEndedAt = ref(0)
const generationNow = ref(Date.now())
let generationTimer = null

const promptCategoryAliases = {
  starter: ['settingTree', 'creation_starter', 'topic'],
  refine_setting: ['topic', 'world', 'settingTree'],
  opening: ['golden_chapters', 'topic'],
  topic_card: ['topic'],
  new_book_plan: ['outline', 'topic'],
  continue: ['continueWrite', 'continue'],
  polish: ['polish'],
  rewrite: ['rewrite'],
  expand: ['expand'],
  summarize: ['summarize', 'summary'],
  logic_check: ['consistency_check'],
  conflict: ['rewrite', 'plot'],
  selling_point: ['rewrite', 'plot'],
  chapter_hook: ['plot'],
  topic: ['topic'],
  outline: ['outline'],
  golden_chapters: ['golden_chapters'],
  plot: ['plot', 'plotEvolution'],
  foreshadowing: ['plot', 'plotEvolution'],
  instance: ['outline'],
  ending: ['plot', 'plotEvolution'],
  character: ['character'],
  relationship: ['character'],
  world: ['world', 'settingTree'],
  organization: ['world', 'settingTree'],
  location: ['world', 'settingTree'],
  dictionary: ['world', 'settingTree'],
  rules: ['world', 'settingTree'],
  extraction: ['extraction'],
  creation_starter: ['settingTree', 'creation_starter', 'topic'],
  plotEvolution: ['plotEvolution', 'plot'],
  continueWrite: ['continueWrite', 'continue'],
  settingTree: ['settingTree', 'world']
}

const activeTools = computed(() => toolGroups[activeTab.value] || toolGroups.creation)
const activeTool = computed(
  () => activeTools.value.find((item) => item.key === activeToolKey.value) || activeTools.value[0]
)
const activePage = computed(() => aiPages[activeTab.value] || aiPages.creation)
const activeTabLabel = computed(() => activePage.value.label)
const activePromptPresets = computed(() => {
  const categories = getActivePromptCategories()
  const matched = promptPresets.value.filter((preset) =>
    categories.has(normalizePromptCategory(preset.category))
  )
  const fallback = promptPresets.value.filter(
    (preset) => normalizePromptCategory(preset.category) === 'chat'
  )
  return uniquePresets([...matched, ...fallback])
})
const selectedPresetName = computed(() => {
  const preset = promptPresets.value.find((item) => item.id === selectedPresetId.value)
  return preset ? promptPresetDisplayName(preset) : ''
})
const currentModelText = computed(
  () => [providerName.value, currentModel.value].filter(Boolean).join(' / ') || '未配置'
)
const estimatedTokens = computed(() =>
  Math.max(
    1,
    Math.ceil(
      (mainInput.value.length + extraRequirement.value.length + selectedContextText.value.length) /
        1.6
    )
  )
)
const selectedContextText = computed(() =>
  selectedContexts.value
    .map((item) => `${item.typeLabel}：${item.title}\n${item.summary || ''}`)
    .join('\n\n')
)
const contextStatusText = computed(() => {
  if (contextLoadError.value) {
    return selectedContexts.value.length
      ? `已引用 ${selectedContexts.value.length} 项，素材读取失败`
      : '引用素材读取失败'
  }
  return selectedContexts.value.length ? `已引用 ${selectedContexts.value.length} 项` : '未添加引用'
})
const generationReferenceText = computed(() => {
  if (!selectedContexts.value.length) return '未引用素材'
  return (
    selectedContexts.value
      .slice(0, 3)
      .map((item) => `${item.typeLabel}：${item.title}`)
      .join('、') +
    (selectedContexts.value.length > 3 ? ` 等 ${selectedContexts.value.length} 项` : '')
  )
})
const generationElapsedSeconds = computed(() => {
  const started = generationStartedAt.value
  if (!started) return 0
  const current = running.value
    ? generationNow.value
    : generationEndedAt.value || generationNow.value
  return Math.max(0, Math.floor((current - started) / 1000))
})
const generationElapsedText = computed(() => formatDuration(generationElapsedSeconds.value))
const generationStatusText = computed(() => {
  if (running.value) return '正在生成'
  if (latestErrorText.value) return '生成失败，输入内容已保留'
  if (hasLatestResult.value) return '生成完成'
  return '等待开始'
})
const generationStatusVisible = computed(
  () =>
    running.value ||
    Boolean(latestErrorText.value) ||
    Boolean(generationStartedAt.value && hasLatestResult.value)
)
const activeBookForSave = computed(() => resolveActiveBookForSave())
const activeBookSaveName = computed(() => {
  const targetBook = activeBookForSave.value
  return targetBook?.folderName || targetBook?.name || targetBook?.id || ''
})
const activePromptBook = computed(() => resolvePromptBookFromRoute())
const hasLatestResult = computed(() => Boolean(latestOutputText.value || latestImageUrl.value))
const canSaveResultToBook = computed(() =>
  Boolean(hasLatestResult.value && activeBookSaveName.value && resultBookTarget(activeTool.value))
)
const saveResultToBookDisabledTip = computed(() => {
  if (!hasLatestResult.value) return '请先生成结果'
  if (!activeBookSaveName.value) return '请先添加作品引用'
  if (!resultBookTarget(activeTool.value)) return '当前结果不能写入作品资料'
  return ''
})
const availableContextItems = computed(() => {
  const rows = [
    ...books.value.slice(0, 12).map((book) => ({
      key: `book:${book.id || book.folderName || book.name}`,
      type: 'book',
      typeLabel: '作品',
      title: book.name || book.folderName || '未命名作品',
      summary: book.intro || book.typeName || ''
    })),
    ...knowledgeItems.value.slice(0, 16).map((item) => ({
      key: `knowledge:${item.id}`,
      type: item.type || 'knowledge',
      typeLabel: item.type === 'topic_card' ? '选题卡' : '知识库',
      title: item.title || '未命名素材',
      summary: item.summary || item.content || ''
    })),
    ...marketHotspots.value.slice(0, 8).map((item) => ({
      key: `hotspot:${item.id || item.keyword || item.title}`,
      type: 'market_hotspot',
      typeLabel: '市场热点',
      title: item.keyword || item.title || '未命名热点',
      summary: item.summary || ''
    })),
    ...marketActivities.value.slice(0, 8).map((item) => ({
      key: `activity:${item.id || item.title}`,
      type: 'writer_activity',
      typeLabel: '作家活动',
      title: item.title || '未命名活动',
      summary: item.summary || item.requirementSummary || ''
    }))
  ]
  const selected = new Set(selectedContexts.value.map((item) => item.key))
  return rows.filter((item) => !selected.has(item.key))
})
const latestUsageText = computed(() => {
  const total = usageTotal(latestUsage.value)
  return total ? String(total) : '未记录'
})
const starterStatusText = computed(() => {
  const map = { pending: '等待生成', running: '生成中', completed: '生成完成', failed: '生成失败' }
  return map[starterJob.value?.status] || '起笔任务'
})
const starterStatusType = computed(() => {
  if (starterJob.value?.status === 'completed') return 'success'
  if (starterJob.value?.status === 'failed') return 'danger'
  if (starterJob.value?.status === 'running') return 'warning'
  return 'info'
})

watch(
  () => props.mode,
  (mode) => {
    const tab = normalizeMode(mode)
    activeTab.value = tab
    activeToolKey.value = toolGroups[tab]?.[0]?.key || activeToolKey.value
    nextTick(() => {
      applyRouteToolAndContext()
      selectDefaultPromptPreset()
    })
  }
)

watch(
  () => route.query.jobId,
  async (jobId) => {
    if (jobId) await loadStarterJob(String(jobId))
  }
)

watch(
  () => [route.query.bookId, route.query.name, route.query.tool, books.value.length],
  async () => {
    await loadPrompts()
    applyRouteToolAndContext()
    selectDefaultPromptPreset()
  }
)

watch(
  [() => activeTool.value?.key, () => activeTool.value?.task, () => promptPresets.value.length],
  () => {
    selectDefaultPromptPreset()
  }
)

onMounted(async () => {
  await Promise.all([loadPrompts(), loadHistory(), loadContextData(), loadActiveProvider()])
  if (route.query.jobId) {
    activeTab.value = 'creation'
    activeToolKey.value = 'starter'
    await loadStarterJob(String(route.query.jobId))
    selectDefaultPromptPreset()
  } else {
    applyRouteToolAndContext()
    selectDefaultPromptPreset()
  }
})

onBeforeUnmount(() => {
  stopGenerationTimer()
})

function normalizeMode(mode) {
  const map = {
    text: 'text',
    chat: 'text',
    image: 'image',
    prompts: 'prompts',
    history: 'history',
    creation: 'creation',
    plot: 'plot',
    world: 'world'
  }
  return map[mode] || 'creation'
}

function selectTool(key) {
  activeToolKey.value = key
  selectedPresetId.value = ''
  nextTick(selectDefaultPromptPreset)
}

function normalizePromptCategory(category) {
  if (category === 'continue') return 'continueWrite'
  return String(category || 'chat')
}

function getActivePromptCategories() {
  const tool = activeTool.value || {}
  const sources = [tool.key, tool.task, tool.feature].filter(Boolean)
  const categories = new Set()
  sources.forEach((source) => {
    const key = String(source)
    categories.add(normalizePromptCategory(key))
    ;(promptCategoryAliases[key] || []).forEach((category) =>
      categories.add(normalizePromptCategory(category))
    )
  })
  if (!categories.size) categories.add('chat')
  return categories
}

function uniquePresets(rows) {
  const seen = new Set()
  return rows.filter((preset) => {
    if (!preset?.id || seen.has(preset.id)) return false
    seen.add(preset.id)
    return true
  })
}

function promptPresetDisplayName(preset) {
  if (!preset) return ''
  const key = builtinPromptPresetI18nKeys[preset.id] || builtinPromptPresetI18nKeys[preset.name]
  if (key && te(key)) return t(key)
  return preset.name || preset.id || ''
}

function promptScopeText(preset = {}) {
  if (preset.isBuiltin || preset.scope === 'builtin') return '内置'
  if (preset.scope === 'book' || preset.bookId || preset.bookName || preset.bookFolderName) {
    return `本书：${preset.bookName || preset.bookFolderName || preset.bookId || '未命名作品'}`
  }
  return '全局'
}

function selectDefaultPromptPreset() {
  const presets = activePromptPresets.value
  if (!presets.length) {
    selectedPresetId.value = ''
    return
  }
  const routePresetId = queryText(route.query.presetId)
  if (routePresetId && promptPresets.value.some((preset) => preset.id === routePresetId)) {
    selectedPresetId.value = routePresetId
    return
  }
  if (selectedPresetId.value && presets.some((preset) => preset.id === selectedPresetId.value))
    return
  const preferred =
    presets.find((preset) => normalizePromptCategory(preset.category) !== 'chat') || presets[0]
  selectedPresetId.value = preferred?.id || ''
}

async function loadPrompts() {
  promptLoadError.value = ''
  try {
    const payload = buildPromptScopePayload()
    const result = await listPromptPresets(
      activeTab.value === 'prompts' &&
        !payload.bookId &&
        !payload.bookName &&
        !payload.bookFolderName
        ? { includeAllBookPresets: true }
        : payload
    )
    if (result?.success !== true) throw new Error(result?.message || '读取 Prompt 模板失败')
    if (!Array.isArray(result.presets)) throw new Error('Prompt 模板返回格式异常')
    promptPresets.value = result.presets
  } catch (error) {
    promptPresets.value = []
    promptLoadError.value = `读取 Prompt 模板失败：${error?.message || '读取失败'}`
  }
}

async function loadHistory() {
  historyLoadError.value = ''
  try {
    const result = await listAiHistory({})
    if (!Array.isArray(result?.items)) throw new Error('生成历史返回格式异常')
    historyItems.value = result.items
  } catch (error) {
    historyItems.value = []
    historyLoadError.value = `读取生成历史失败：${error?.message || '读取失败'}`
  }
}

async function loadContextData() {
  const tasks = [
    {
      label: '作品',
      run: () => readBooksDir(),
      apply: (value) => {
        books.value = requireContextRows(value, '作品')
      }
    },
    {
      label: '知识库',
      run: () => listKnowledgeItems({}),
      apply: (value) => {
        knowledgeItems.value = requireContextRows(value, '知识库')
      }
    },
    {
      label: '市场热点',
      run: () => listMarketHotspots({}),
      apply: (value) => {
        marketHotspots.value = requireContextRows(value, '市场热点')
      }
    },
    {
      label: '作家活动',
      run: () => listMarketActivities({}),
      apply: (value) => {
        marketActivities.value = requireContextRows(value, '作家活动')
      }
    }
  ]
  const results = await Promise.allSettled(tasks.map((task) => task.run()))
  const failures = []
  results.forEach((result, index) => {
    const task = tasks[index]
    if (result.status === 'rejected') {
      clearContextRows(task.label)
      failures.push(`${task.label}：${contextReadErrorText(result.reason)}`)
      return
    }
    try {
      task.apply(result.value)
    } catch (error) {
      clearContextRows(task.label)
      failures.push(`${task.label}：${contextReadErrorText(error)}`)
    }
  })
  contextLoadError.value = failures.length ? `读取引用素材失败：${failures.join('；')}` : ''
  if (contextLoadError.value) ElMessage.error(contextLoadError.value)
}

function requireContextRows(payload, label) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  throw new Error(`${label}返回格式异常`)
}

function clearContextRows(label) {
  if (label === '作品') books.value = []
  if (label === '知识库') knowledgeItems.value = []
  if (label === '市场热点') marketHotspots.value = []
  if (label === '作家活动') marketActivities.value = []
}

function contextReadErrorText(error) {
  return String(error?.message || error || '读取失败').trim()
}

function applyRouteToolAndContext() {
  if (route.query.jobId) return
  const routeTool = queryText(route.query.tool)
  if (routeTool && activeTools.value.some((tool) => tool.key === routeTool)) {
    activeToolKey.value = routeTool
  } else if (activeTab.value === 'plot' && (route.query.bookId || route.query.name)) {
    activeToolKey.value = 'outline'
  }

  const context = bookContextFromRoute()
  if (!context) return
  const exists = selectedContexts.value.some(
    (item) =>
      item.key === context.key ||
      (item.type === 'book' && sameContextTitle(item.title, context.title))
  )
  if (!exists) selectedContexts.value = [context, ...selectedContexts.value]
  if (activeToolKey.value === 'outline' && !mainInput.value.trim()) {
    mainInput.value = [context.title, context.summary].filter(Boolean).join('\n')
  }
}

function bookContextFromRoute() {
  const routeBookId = queryText(route.query.bookId)
  const routeBookName = queryText(route.query.name)
  const candidates = [routeBookId, routeBookName].filter(Boolean)
  if (!candidates.length) return null
  const book = books.value.find((item) =>
    bookIdentifiers(item).some((id) => candidates.includes(id))
  )
  if (book) {
    return normalizeContextItem({
      key: `book:${book.id || book.folderName || book.name}`,
      type: 'book',
      typeLabel: '作品',
      title: book.name || book.folderName || '未命名作品',
      summary: book.intro || book.typeName || ''
    })
  }
  return normalizeContextItem({
    key: `book:${routeBookId || routeBookName}`,
    type: 'book',
    typeLabel: '作品',
    title: routeBookName || routeBookId || '当前作品',
    summary: ''
  })
}

function resolvePromptBookFromRoute() {
  const routeBookId = queryText(route.query.bookId)
  const routeBookName = queryText(route.query.name)
  const candidates = [routeBookId, routeBookName].filter(Boolean)
  if (!candidates.length) return null
  const book = books.value.find(
    (item) =>
      bookIdentifiers(item).some((id) => candidates.some((candidate) => sameText(id, candidate))) ||
      candidates.some(
        (candidate) => sameText(item.name, candidate) || sameText(item.folderName, candidate)
      )
  )
  if (book) return book
  return {
    id: routeBookId,
    name: routeBookName || routeBookId,
    folderName: routeBookName || routeBookId
  }
}

function buildPromptScopePayload() {
  const book = activePromptBook.value
  if (!book) return {}
  return {
    scope: 'book',
    bookId: book.id || queryText(route.query.bookId) || book.folderName || book.name,
    bookName: book.name || queryText(route.query.name) || book.folderName || book.id,
    bookFolderName:
      book.folderName || book.name || queryText(route.query.name) || queryText(route.query.bookId)
  }
}

function bookIdentifiers(item = {}) {
  return [item.id, item.folderName, item.name].filter(Boolean).map(String)
}

function queryText(value) {
  return String(Array.isArray(value) ? value[0] || '' : value || '').trim()
}

function sameContextTitle(left, right) {
  return String(left || '').trim() === String(right || '').trim()
}

async function loadActiveProvider() {
  try {
    const active = await getActiveTextProvider()
    const providersResult = await getAiProviders()
    if (active?.success !== true) {
      throw new Error(active?.message || '读取当前文本 AI 服务失败')
    }
    if (providersResult?.success !== true) {
      throw new Error(providersResult?.message || '读取文本 AI 服务失败')
    }
    if (!Array.isArray(providersResult.providers)) {
      throw new Error('读取文本 AI 服务失败：接口返回格式不正确')
    }
    const providerId = active?.providerId || ''
    const providers = providersResult.providers
    const provider = providers.find((item) => item.id === providerId)
    providerName.value = provider?.name || ''
    currentModel.value = provider?.model || provider?.models?.[0] || ''
  } catch (error) {
    providerName.value = ''
    currentModel.value = ''
    ElMessage.error(error?.message || '读取文本 AI 服务失败')
  }
}

async function loadStarterJob(jobId) {
  starterJobReadError.value = ''
  try {
    starterJob.value = await getCreationStarterJob(jobId)
  } catch (error) {
    starterJob.value = null
    starterJobReadError.value = error?.message || '读取起笔任务失败'
    latestOutputText.value = ''
    parsedStarterResult.value = null
    latestUsage.value = {}
    resultDrawerVisible.value = false
    latestErrorText.value = starterJobReadError.value
    ElMessage.error(starterJobReadError.value)
    return
  }
  if (!starterJob.value) {
    starterJobReadError.value = '没有找到起笔任务'
    latestOutputText.value = ''
    parsedStarterResult.value = null
    latestUsage.value = {}
    resultDrawerVisible.value = false
    latestErrorText.value = starterJobReadError.value
    return
  }
  activeTab.value = 'creation'
  activeToolKey.value = 'starter'
  mainInput.value = starterJob.value.prompt || ''
  selectedPresetId.value = starterJob.value.advanced?.promptPresetId || selectedPresetId.value
  selectedContexts.value = [
    ...(starterJob.value.references || []),
    ...(starterJob.value.autoReferences || [])
  ]
    .map(normalizeContextItem)
    .filter(Boolean)
  if (starterJob.value.status === 'pending') {
    await runStarterGeneration()
  } else if (starterJob.value.rawOutput) {
    latestErrorText.value = ''
    latestOutputText.value = starterJob.value.rawOutput
    parsedStarterResult.value =
      starterJob.value.result || parseJsonResult(starterJob.value.rawOutput)
    latestUsage.value = starterJob.value.usage || {}
    resultDrawerVisible.value = true
  } else if (starterJob.value.status === 'failed') {
    latestErrorText.value = readableAiError(starterJob.value.errorMessage || '生成失败')
  }
}

async function runStarterGeneration() {
  if (!starterJob.value) return
  beginGeneration()
  latestErrorText.value = ''
  try {
    starterJob.value = await updateCreationStarterJob(starterJob.value.id, {
      status: 'running',
      errorMessage: ''
    })
  } catch (error) {
    const message = readableAiError(error?.message || '更新起笔任务失败')
    starterJobReadError.value = message
    latestErrorText.value = message
    ElMessage.error(message)
    endGeneration()
    return
  }
  try {
    const promptScopePayload = buildPromptScopePayload()
    const result = await runAiTextTask({
      ...promptScopePayload,
      task: 'topic',
      feature: 'creation_starter',
      title: '创作起笔',
      content: JSON.stringify(
        {
          prompt: starterJob.value.prompt,
          manualReferences: starterJob.value.references,
          autoReferences: starterJob.value.autoReferences,
          advanced: starterJob.value.advanced
        },
        null,
        2
      ),
      instruction: [
        '你是网文创作策划助手。请根据输入想法和所选提示词，生成一个可直接用于开书的设定树和黄金三章。',
        '必须优先返回合法 JSON，不要使用 Markdown 代码块。',
        'JSON 字段必须包含 settingTree、goldenThreeChapters、writingGuide。',
        'settingTree 要包含核心卖点、主角设定、金手指或核心设定、世界规则、冲突来源。',
        'goldenThreeChapters 必须给出前三章，每章包含标题、概要、开场画面、核心事件、人物变化、章末钩子。',
        '内容必须具体，避免空泛描述。'
      ].join('\n'),
      presetId: starterJob.value.advanced?.promptPresetId || selectedPresetId.value,
      providerId: starterJob.value.providerId || '',
      model: starterJob.value.model || '',
      bookId: promptScopePayload.bookId || '',
      bookName: promptScopePayload.bookName || '',
      maxTokens: 4200,
      temperature: 0.72
    })
    const output = ensureTextTaskContent(result, '生成失败')
    latestOutputText.value = output
    latestUsage.value = result.usage || {}
    parsedStarterResult.value = parseJsonResult(latestOutputText.value)
    starterJob.value = await updateCreationStarterJob(starterJob.value.id, {
      status: 'completed',
      rawOutput: latestOutputText.value,
      result: parsedStarterResult.value,
      usage: result.usage || {},
      providerId: result.providerId || '',
      model: result.model || '',
      latencyMs: result.latencyMs || 0,
      errorMessage: ''
    })
    await loadHistory()
    resultDrawerVisible.value = true
    ElMessage.success('创作起笔已生成')
  } catch (error) {
    const message = readableAiError(error?.message || '生成失败')
    latestErrorText.value = message
    try {
      starterJob.value = await updateCreationStarterJob(starterJob.value.id, {
        status: 'failed',
        errorMessage: message
      })
    } catch (writeError) {
      latestErrorText.value = readableAiError(writeError?.message || '保存起笔任务失败')
    }
    ElMessage.error(message)
  } finally {
    endGeneration()
  }
}

async function handlePrimaryAction() {
  if (running.value) {
    ElMessage.info('当前 AI 任务仍在运行，请稍候')
    return
  }
  if (activeTool.value.key === 'starter' && starterJob.value?.status === 'pending') {
    await runStarterGeneration()
    return
  }
  if (activeTool.value.key === 'logic_check') {
    await runLogicCheckTool()
    return
  }
  if (activeTool.value.kind === 'image') {
    await runImageTool()
  } else {
    await runTextTool()
  }
}

async function runLogicCheckTool() {
  if (!mainInput.value.trim()) {
    animateShake(toolPanelRef.value)
    ElMessage.warning('请输入要检查的正文')
    return
  }
  const targetBook = activeBookForSave.value
  const bookName = activeBookSaveName.value
  if (!targetBook || !bookName) {
    latestErrorText.value = '请先从引用里添加一个作品，一致性检查需要读取该作品的人物和设定。'
    ElMessage.error(latestErrorText.value)
    return
  }
  beginGeneration()
  latestErrorText.value = ''
  try {
    const result = await runConsistencyCheck({
      ...buildPromptScopePayload(),
      bookId: targetBook.id || bookName,
      bookName,
      text: buildTaskContent(),
      source: 'ai_workshop_logic_check',
      taskType: 'logic_check',
      applyAction: 'manual_check',
      useLlm: false,
      skipLlm: true,
      persist: true
    })
    const output = formatLogicCheckResult(result)
    latestOutputText.value = output
    latestImageUrl.value = ''
    latestUsage.value = result.check?.usage || {}
    parsedStarterResult.value = null
    resultDrawerVisible.value = true
    ElMessage.success('检查完成')
  } catch (error) {
    const message = readableAiError(error?.message || '一致性检查失败')
    latestErrorText.value = message
    ElMessage.error(message)
  } finally {
    endGeneration()
  }
}

async function runTextTool() {
  if (
    !mainInput.value.trim() &&
    !extraRequirement.value.trim() &&
    !selectedContextText.value.trim()
  ) {
    animateShake(toolPanelRef.value)
    ElMessage.warning('请输入任务内容')
    return
  }
  beginGeneration()
  latestErrorText.value = ''
  try {
    const promptScopePayload = buildPromptScopePayload()
    const result = await runAiTextTask({
      ...promptScopePayload,
      task: activeTool.value.task || 'continue',
      feature: activeTool.value.feature || `ai_${activeTool.value.key}`,
      title: activeTool.value.label,
      content: buildTaskContent(),
      instruction: buildInstruction(),
      presetId: selectedPresetId.value,
      bookId: promptScopePayload.bookId || '',
      bookName: promptScopePayload.bookName || ''
    })
    const output = ensureTextTaskContent(result, '生成失败')
    latestOutputText.value = output
    latestImageUrl.value = ''
    latestUsage.value = result.usage || {}
    parsedStarterResult.value =
      activeTool.value.key === 'starter' ? parseJsonResult(latestOutputText.value) : null
    await loadHistory()
    resultDrawerVisible.value = true
    ElMessage.success('生成完成')
  } catch (error) {
    const message = readableAiError(error?.message || '生成失败')
    latestErrorText.value = message
    ElMessage.error(message)
  } finally {
    endGeneration()
  }
}

async function runImageTool() {
  if (!mainInput.value.trim()) {
    animateShake(toolPanelRef.value)
    ElMessage.warning('请输入图像提示词')
    return
  }
  beginGeneration()
  latestErrorText.value = ''
  try {
    const promptScopePayload = buildPromptScopePayload()
    const result = await runAiImageTask({
      ...promptScopePayload,
      feature: activeTool.value.feature || `ai_${activeTool.value.key}`,
      title: activeTool.value.label,
      prompt: buildTaskContent(),
      negativePrompt: negativePrompt.value,
      size: imageSize.value,
      bookId: promptScopePayload.bookId || '',
      bookName: promptScopePayload.bookName || ''
    })
    const imageResult = ensureImageTaskOutput(result, '图片生成失败')
    latestImageUrl.value = imageResult.imageUrl
    latestOutputText.value = imageResult.output
    latestUsage.value = result.usage || { imageRequests: 1 }
    await loadHistory()
    resultDrawerVisible.value = true
    ElMessage.success('图片已生成')
  } catch (error) {
    const message = readableAiError(error?.message || '图片生成失败')
    latestErrorText.value = message
    ElMessage.error(message)
  } finally {
    endGeneration()
  }
}

function readableAiError(message = '') {
  const text = String(message || '').trim()
  if (/invalid api key/i.test(text)) return 'API Key 无效，请到系统设置检查文本模型配置。'
  if (/api key/i.test(text)) return `API Key 配置异常：${text}`
  if (/provider/i.test(text)) return `AI Provider 配置异常：${text}`
  return text || '生成失败'
}

function ensureTextTaskContent(result, fallbackMessage) {
  if (result?.success !== true) throw new Error(result?.message || fallbackMessage)
  const output = String(result?.content || '').trim()
  if (!output) throw new Error('AI 返回内容为空，请重试')
  return output
}

function ensureImageTaskOutput(result, fallbackMessage) {
  if (result?.success !== true) throw new Error(result?.message || fallbackMessage)
  const imageUrl = String(result?.imageUrl || '').trim()
  const base64 = String(result?.base64 || '').trim()
  const output = String(result?.output || result?.localPath || '').trim()
  const resolvedImageUrl = imageUrl || (base64 ? `data:image/png;base64,${base64}` : '')
  const resolvedOutput = resolvedImageUrl || output
  if (!resolvedOutput) throw new Error('AI 图像任务未返回图片数据')
  return {
    imageUrl: resolvedImageUrl,
    output: resolvedOutput
  }
}

function formatLogicCheckResult(result = {}) {
  if (result?.success !== true) {
    throw new Error(result?.message || '一致性检查失败')
  }
  const check = result.check
  if (!check || typeof check !== 'object' || Array.isArray(check) || !Array.isArray(check.issues)) {
    throw new Error('一致性检查失败：接口返回格式不正确')
  }
  const lines = [
    `## 一致性检查结果 · ${formatTime(check.createdAt || new Date().toISOString())}`,
    `作品：${check.bookName || activeBookSaveName.value || '当前作品'}`,
    `检查记录：${check.id || '未记录'}`,
    `结论：${check.summary || result.summary || '未返回结论'}`,
    ''
  ]
  if (!check.issues.length) {
    lines.push('未发现明确矛盾。')
  } else {
    lines.push('发现的问题：')
    check.issues.forEach((issue, index) => {
      const severity = issue.severity ? `（${issue.severity}）` : ''
      const message = issue.message || issue.text || issue.type || '未命名问题'
      const evidence = issue.evidence ? `\n  证据：${issue.evidence}` : ''
      const reference = issue.reference ? `\n  参考：${issue.reference}` : ''
      lines.push(`${index + 1}. ${message}${severity}${evidence}${reference}`)
    })
  }
  return lines.join('\n')
}

function buildTaskContent() {
  const parts = []
  if (selectedContextText.value) parts.push(`【引用上下文】\n${selectedContextText.value}`)
  if (mainInput.value.trim()) parts.push(`【用户输入】\n${mainInput.value.trim()}`)
  return parts.join('\n\n')
}

function buildInstruction() {
  const rules = []
  if (activeTool.value.key === 'starter') {
    rules.push(
      '请输出作品核心、故事发动机、人物种子、世界规则、起笔三章、写作约束。',
      '优先返回合法 JSON。'
    )
  }
  if (extraRequirement.value.trim()) rules.push(extraRequirement.value.trim())
  return rules.join('\n')
}

function addContextByKey(key) {
  const item = availableContextItems.value.find((row) => row.key === key)
  if (item) selectedContexts.value.push(item)
}

function removeContext(key) {
  selectedContexts.value = selectedContexts.value.filter((item) => item.key !== key)
}

function normalizeContextItem(item) {
  if (!item) return null
  const key = item.key || item.id || `${item.type || 'context'}:${item.title || Math.random()}`
  return {
    key,
    type: item.type || 'context',
    typeLabel: item.typeLabel || typeLabel(item.type),
    title: item.title || item.name || '未命名素材',
    summary: item.summary || item.content || ''
  }
}

function typeLabel(type) {
  const map = {
    topic_card: '选题卡',
    market_hotspot: '市场热点',
    writer_activity: '作家活动',
    book: '作品'
  }
  return map[type] || '素材'
}

function usageTotal(usage = {}) {
  return Number(usage.total_tokens || usage.totalTokens || usage.total || 0)
}

function previewText(text, max = 180) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
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
      // 继续尝试
    }
  }
  return null
}

async function copyText(text) {
  if (!text) return
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      throw new Error('当前环境不支持剪贴板写入')
    }
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch (error) {
    ElMessage.error(error?.message || '复制失败')
  }
}

async function copyLatestError() {
  if (!latestErrorText.value) return
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      throw new Error('当前环境不支持剪贴板写入')
    }
    await navigator.clipboard.writeText(latestErrorText.value)
    ElMessage.success('错误信息已复制')
  } catch (error) {
    ElMessage.error(error?.message || '复制失败')
  }
}

function beginGeneration() {
  running.value = true
  generationStartedAt.value = Date.now()
  generationEndedAt.value = 0
  generationNow.value = Date.now()
  startGenerationTimer()
}

function endGeneration() {
  running.value = false
  generationEndedAt.value = Date.now()
  generationNow.value = generationEndedAt.value
  stopGenerationTimer()
}

function startGenerationTimer() {
  stopGenerationTimer()
  generationTimer = window.setInterval(() => {
    generationNow.value = Date.now()
  }, 1000)
}

function stopGenerationTimer() {
  if (!generationTimer) return
  window.clearInterval(generationTimer)
  generationTimer = null
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (!minutes) return `${rest} 秒`
  return `${minutes} 分 ${String(rest).padStart(2, '0')} 秒`
}

function clearInput() {
  mainInput.value = ''
  extraRequirement.value = ''
}

async function handleSecondaryAction(command) {
  if (command === 'saveDraft') {
    await saveInputDraft()
    return
  }
  if (command === 'clear') {
    clearInput()
    return
  }
  if (command === 'copyResult') {
    await copyText(latestOutputText.value)
    return
  }
  if (command === 'openResult' && latestOutputText.value) {
    resultDrawerVisible.value = true
  }
}

async function saveInputDraft() {
  const key = `aiWorkshop:draft:${activeTool.value.key}`
  try {
    await setStoreValue(key, {
      input: mainInput.value,
      requirement: extraRequirement.value,
      updatedAt: new Date().toISOString()
    })
    ElMessage.success('输入已保存')
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

async function saveResultToKnowledge() {
  if (!latestOutputText.value) return
  const payload = {
    type: activeTool.value.key === 'starter' ? 'topic_card' : 'note',
    title: `${activeTool.value.label}结果`,
    summary: previewText(latestOutputText.value, 120),
    content: latestOutputText.value,
    sourceType: 'ai_workshop',
    tags: [activeTabLabel.value, activeTool.value.label],
    metadata: {
      tool: activeTool.value.key,
      usage: latestUsage.value
    }
  }
  try {
    requireKnowledgeWriteResult(await createKnowledgeItem(payload), payload)
    ElMessage.success('已保存到创作库')
    await loadContextData()
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

async function saveResultToBook() {
  if (!latestOutputText.value) return
  const bookName = activeBookSaveName.value
  if (!bookName) {
    ElMessage.warning('请先添加作品引用')
    return
  }
  try {
    const target = await appendAiResultToBook(bookName)
    ElMessage.success(`已保存到当前作品：${target}`)
    await loadContextData()
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

async function appendAiResultToBook(bookName) {
  const target = resultBookTarget(activeTool.value)
  if (target === 'images') return importAiImageToBook(bookName)
  if (target === 'characters') return appendAiCharacters(bookName)
  if (target === 'settings') return appendAiSetting(bookName)
  if (target === 'notes') return appendAiNote(bookName)
  if (target === 'outlines') return appendAiOutline(bookName)
  throw new Error('当前结果暂不支持写入作品资料')
}

async function importAiImageToBook(bookName) {
  const imageInput = aiImageResultToImportInput()
  if (!imageInput) throw new Error('当前图片结果缺少可保存的图片数据')
  const imported = await importAsset({
    ...imageInput,
    bookName,
    type: imageAssetType(activeTool.value)
  })
  requireAssetImportResult(imported, {
    message: '写入图片资产失败',
    bookName,
    type: imageAssetType(activeTool.value)
  })
  return imageAssetTargetLabel(activeTool.value)
}

async function appendAiOutline(bookName) {
  const data = await readOutlineDocument(bookName)
  const payload = normalizeOutlinePayload(data)
  const section = ensureOutlineSection(payload.children, outlineResultSectionName())
  const title = `${activeTool.value.label}结果`
  const content = latestOutputText.value.trim()
  const existing = section.children.find(
    (entry) => sameText(entry?.title, title) && sameText(entry?.content, content)
  )
  if (!existing) {
    section.children.push({
      id: genId(),
      title,
      content,
      children: [],
      source: 'ai_workshop',
      tool: activeTool.value.key,
      createdAt: new Date().toISOString()
    })
    await writeOutlineDocument(bookName, payload)
  }
  return '大纲'
}

async function appendAiSetting(bookName) {
  const data = await readSettingsDocument(bookName)
  const payload = normalizeSettingsPayload(data)
  const category = ensureSettingCategory(payload.categories, settingResultCategoryName())
  const name = `${activeTool.value.label}结果`
  const introduction = latestOutputText.value.trim()
  const existing = category.items.find(
    (entry) => sameText(entry?.name, name) && sameText(entry?.introduction, introduction)
  )
  if (!existing) {
    category.items.push({
      id: genId(),
      name,
      introduction,
      source: 'ai_workshop',
      tool: activeTool.value.key,
      createdAt: new Date().toISOString()
    })
    await writeSettingsDocument(bookName, payload)
  }
  return '设定集'
}

async function appendAiNote(bookName) {
  const notebookName = 'AI 工坊'
  const noteName = aiNoteName()
  await ensureNotebookDocument(bookName, notebookName)
  await ensureNoteDocument(bookName, notebookName, noteName)
  const note = await readNoteDocument(bookName, notebookName, noteName)
  const existingContent = note.content.trim()
  const content = [existingContent, aiNoteEntryContent()].filter(Boolean).join('\n\n')
  await writeNoteDocument({
    bookName,
    notebookName,
    noteName,
    content
  })
  return `笔记 / ${noteName}`
}

async function appendAiCharacters(bookName) {
  const characters = await readCharactersDocument(bookName)
  const generatedCharacters = buildCharactersFromResult()
  let inserted = 0
  for (const row of generatedCharacters) {
    const name = safeText(row.name || row.role || row.title, `${activeTool.value.label}素材`)
    const existing = characters.find((entry) => sameText(entry?.name, name))
    if (existing) continue
    characters.push({
      id: genId(),
      name,
      age: positiveNumber(row.age, 18),
      gender: safeText(row.gender || row.sex, '男'),
      height: positiveNumber(row.height, 170),
      tags: normalizeCharacterTags(row),
      biography: readableCharacterBody(row),
      appearance: safeText(row.appearance || row.looks, ''),
      avatar: '',
      characterImages: [],
      markerColor: '',
      source: 'ai_workshop',
      tool: activeTool.value.key
    })
    inserted += 1
  }
  if (inserted > 0) {
    await writeCharactersDocument(bookName, characters)
  }
  return `人物档案 ${inserted || 0} 条`
}

function resolveActiveBookForSave() {
  const candidates = [
    queryText(route.query.bookId),
    queryText(route.query.name),
    ...selectedContexts.value
      .filter((item) => item.type === 'book')
      .flatMap((item) => [String(item.key || '').replace(/^book:/, ''), item.title])
  ].filter(Boolean)
  for (const candidate of candidates) {
    const match = books.value.find(
      (book) =>
        bookIdentifiers(book).some((id) => sameText(id, candidate)) ||
        sameText(book.name, candidate) ||
        sameText(book.folderName, candidate)
    )
    if (match) return match
  }
  const fallbackContext = selectedContexts.value.find((item) => item.type === 'book')
  if (fallbackContext?.title)
    return { name: fallbackContext.title, folderName: fallbackContext.title }
  const routeName = queryText(route.query.name)
  const routeBookId = queryText(route.query.bookId)
  if (routeName || routeBookId)
    return { name: routeName || routeBookId, folderName: routeName || routeBookId, id: routeBookId }
  return null
}

function resultBookTarget(tool = {}) {
  if (tool.kind === 'image') return 'images'
  const key = tool.key || ''
  if (key === 'character') return 'characters'
  if (
    [
      'relationship',
      'world',
      'organization',
      'location',
      'dictionary',
      'rules',
      'refine_setting'
    ].includes(key)
  ) {
    return 'settings'
  }
  if (
    [
      'continue',
      'polish',
      'rewrite',
      'expand',
      'conflict',
      'selling_point',
      'summarize',
      'logic_check',
      'chapter_hook'
    ].includes(key)
  ) {
    return 'notes'
  }
  return 'outlines'
}

function aiNoteName() {
  const key = activeTool.value.key
  if (['continue', 'polish', 'rewrite', 'expand', 'conflict', 'selling_point'].includes(key))
    return '正文处理'
  if (['summarize', 'logic_check'].includes(key)) return '章节检查'
  if (key === 'chapter_hook') return '章节备忘'
  return 'AI 结果'
}

function aiNoteEntryContent() {
  const inputPreview = previewText(mainInput.value.trim(), 600)
  const requirement = extraRequirement.value.trim()
  const lines = [
    `## ${activeTool.value.label} · ${formatTime(new Date().toISOString())}`,
    inputPreview ? `输入：\n${inputPreview}` : '',
    requirement ? `补充要求：\n${requirement}` : '',
    `结果：\n${latestOutputText.value.trim()}`
  ]
  return lines.filter(Boolean).join('\n\n')
}

function aiImageResultToImportInput() {
  const imageValue = String(latestImageUrl.value || latestOutputText.value || '').trim()
  if (!imageValue) return null
  const fileName = aiImageFileName(activeTool.value, imageValue)
  if (imageValue.startsWith('data:image/')) return { dataUrl: imageValue, fileName }
  return null
}

function aiImageFileName(tool = {}, source = '') {
  const prefixMap = {
    cover: 'cover',
    character_image: 'character_image',
    scene_image: 'scene_image',
    map_concept: 'map_concept',
    prop_image: 'prop_image'
  }
  const prefix = prefixMap[tool.key] || 'ai_image'
  return `${prefix}_${Date.now()}.${imageExtensionFromSource(source)}`
}

function imageExtensionFromSource(source = '') {
  const dataUrlMatch = String(source).match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/)
  if (dataUrlMatch) {
    const ext = dataUrlMatch[1].toLowerCase()
    if (ext === 'jpeg') return 'jpg'
    return supportedImageExtension(ext)
  }
  const pathMatch = String(source).match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)
  return supportedImageExtension(pathMatch?.[1]?.toLowerCase())
}

function supportedImageExtension(ext = '') {
  return ['jpg', 'png', 'webp', 'gif', 'avif'].includes(ext) ? ext : 'png'
}

function imageAssetType(tool = {}) {
  const typeMap = {
    cover: 'cover',
    character_image: 'character',
    scene_image: 'scene',
    map_concept: 'map',
    prop_image: 'attachment'
  }
  return typeMap[tool.key] || 'attachment'
}

function imageAssetTargetLabel(tool = {}) {
  const labelMap = {
    cover: '作品封面',
    character_image: '人物图片',
    scene_image: '场景图片',
    map_concept: '地图图片',
    prop_image: '附件图片'
  }
  return labelMap[tool.key] || '作品图片'
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
    ...node,
    id: String(node.id || genId()),
    title: safeText(node.title, '未命名节点'),
    content: String(node.content || '').trim(),
    children: (node.children || []).map(normalizeOutlineNode)
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
    content: '从 AI 工坊保存的生成结果。',
    children: []
  }
  nodes.push(section)
  return section
}

function normalizeSettingsPayload(data) {
  if (data != null && (!data || typeof data !== 'object' || Array.isArray(data))) {
    throw new Error('读取设定集失败：返回格式异常')
  }
  if (data?.categories !== undefined && !Array.isArray(data.categories)) {
    throw new Error('读取设定集失败：categories 必须是数组')
  }
  const categories = (data?.categories || []).map(normalizeSettingCategory)
  return {
    categories: categories.length
      ? categories
      : [
          {
            id: genId(),
            name: 'AI 工坊',
            introduction: '从 AI 工坊保存的生成结果。',
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
    ...category,
    id: String(category.id || genId()),
    name: safeText(category.name, '未命名分类'),
    introduction: String(category.introduction || '').trim(),
    children: (category.children || []).map(normalizeSettingCategory),
    items: (category.items || [])
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        ...item,
        id: String(item.id || genId()),
        name: safeText(item.name, '未命名设定'),
        introduction: String(item.introduction || item.content || '').trim()
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

function buildCharactersFromResult() {
  const parsed = parseJsonResult(latestOutputText.value)
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.characters)
      ? parsed.characters
      : Array.isArray(parsed?.characterList)
        ? parsed.characterList
        : []
  if (rows.length) return rows.filter((item) => item && typeof item === 'object')
  return [
    {
      name: `${activeTool.value.label}素材`,
      biography: latestOutputText.value.trim()
    }
  ]
}

function normalizeCharacterTags(row = {}) {
  return Array.from(
    new Set(
      [
        activeTool.value.label,
        row.identity,
        row.faction,
        ...(Array.isArray(row.tags) ? row.tags : []),
        ...(Array.isArray(row.abilities) ? row.abilities : [])
      ]
        .filter(Boolean)
        .map(String)
    )
  )
}

function readableCharacterBody(row = {}) {
  const direct = safeText(row.biography || row.introduction || row.summary || row.description, '')
  if (direct) return direct
  return (
    Object.entries(row)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}：${Array.isArray(value) ? value.join('、') : String(value)}`)
      .join('\n') || latestOutputText.value.trim()
  )
}

function outlineResultSectionName() {
  const key = activeTool.value.key
  if (['golden_chapters', 'opening'].includes(key)) return '开篇与前三章'
  if (['foreshadowing', 'chapter_hook'].includes(key)) return '伏笔与钩子'
  if (['plot', 'conflict', 'selling_point', 'ending'].includes(key)) return '剧情方案'
  return 'AI 大纲'
}

function settingResultCategoryName() {
  const key = activeTool.value.key
  if (key === 'relationship') return '人物关系'
  if (['organization', 'location'].includes(key)) return '地点势力'
  if (key === 'rules') return '规则体系'
  return 'AI 设定'
}

function requireKnowledgeWriteResult(result, expected = {}) {
  if (result?.success !== true) throw new Error(result?.message || result?.error || '保存失败')
  const item = result.item
  if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim()) {
    throw new Error('保存失败：接口没有返回创作库条目')
  }
  if (!sameText(item.title, expected.title)) {
    throw new Error('保存失败：接口返回的标题不匹配')
  }
  if (!sameText(item.content, expected.content)) {
    throw new Error('保存失败：接口返回的正文不匹配')
  }
  return item
}

function requireAssetImportResult(result, { message, bookName, type } = {}) {
  if (result?.success !== true) throw new Error(result?.message || message)
  if (!result?.item || typeof result.item !== 'object' || Array.isArray(result.item)) {
    throw new Error(`${message}：接口没有返回素材记录`)
  }
  if (!String(result.item.id || '').trim()) throw new Error(`${message}：接口返回的素材缺少 ID`)
  if (!sameText(result.item.type, type)) throw new Error(`${message}：接口返回的素材类型不匹配`)
  if (
    ![
      result.item.bookName,
      result.item.bookFolderName,
      result.bookName,
      result.bookFolderName
    ].some((name) => sameText(name, bookName))
  ) {
    throw new Error(`${message}：接口返回的作品不匹配`)
  }
  if (typeof result.item.relativePath !== 'string' || !result.item.relativePath.trim()) {
    throw new Error(`${message}：接口没有返回素材路径`)
  }
  return result.item
}

function requireCreatedPromptPreset(result, message) {
  if (result?.success !== true) throw new Error(result?.message || message)
  if (!result?.preset || typeof result.preset !== 'object' || Array.isArray(result.preset)) {
    throw new Error(`${message}：接口没有返回模板记录`)
  }
  return result.preset
}

function genId() {
  return `aiw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function safeText(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim()
}

function continueRefine() {
  if (!latestOutputText.value) return
  mainInput.value = latestOutputText.value
  extraRequirement.value = '请在此基础上继续完善，保留可直接用于小说创作的内容。'
  resultDrawerVisible.value = false
  nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

function insertResultToInput() {
  if (!latestOutputText.value) return
  mainInput.value = [mainInput.value, latestOutputText.value].filter(Boolean).join('\n\n')
  resultDrawerVisible.value = false
}

function openHistory(item) {
  latestOutputText.value = item.output || ''
  latestImageUrl.value = String(item.output || '').startsWith('data:image') ? item.output : ''
  latestUsage.value = item.usage || {}
  parsedStarterResult.value =
    item.feature === 'creation_starter' ? parseJsonResult(item.output) : null
  resultDrawerVisible.value = true
}

async function handleCreatePreset() {
  const promptScopePayload = buildPromptScopePayload()
  try {
    const result = await createPromptPreset({
      ...promptScopePayload,
      preset: {
        ...promptScopePayload,
        name: `${activeTool.value.label}模板`,
        category: activeTool.value.task || activeTool.value.key,
        systemPrompt: '请根据用户输入完成小说创作任务，只输出结果。',
        userPromptTemplate: '{{content}}\n\n补充要求：{{instruction}}',
        modelParams: { temperature: 0.7, maxTokens: 2400, topP: 0.9 }
      }
    })
    const preset = requireCreatedPromptPreset(result, '创建失败')
    ElMessage.success('模板已创建')
    await loadPrompts()
    selectedPresetId.value = preset.id || selectedPresetId.value
  } catch (error) {
    ElMessage.error(error?.message || '创建失败')
  }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN')
}
</script>

<style lang="scss" scoped>
.ai-workshop-shell {
  width: min(100%, 1120px);
  min-width: 0;
  margin: 0 auto;
  color: var(--wabi-ink);
  overflow-x: clip;
}

.ai-workshop-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(58, 55, 49, 0.09);

  > div {
    min-width: 0;
  }

  h1 {
    margin: 2px 0 6px;
    color: var(--wabi-ink);
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: clamp(30px, 3vw, 46px);
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
}

.header-copy {
  flex: 1;
}

.header-aside,
.tool-header-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
}

.header-aside {
  flex-wrap: wrap;
  max-width: min(520px, 48%);
}

.header-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-height: 36px;
  align-items: center;
  justify-content: flex-end;
  color: var(--wabi-muted);
  font-size: 14px;
  line-height: 1.4;

  span {
    white-space: nowrap;
  }
}

.quiet-note {
  position: relative;
  flex: 0 0 auto;

  summary {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background: rgba(251, 250, 246, 0.7);
    color: var(--wabi-muted);
    cursor: pointer;
    list-style: none;
    transition:
      background-color 0.22s ease,
      border-color 0.22s ease,
      color 0.22s ease;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover,
    &:focus-visible {
      border-color: rgba(111, 122, 104, 0.38);
      background: rgba(251, 250, 246, 0.94);
      color: var(--wabi-moss-dark);
    }
  }

  &[open] summary {
    border-color: rgba(111, 122, 104, 0.42);
    color: var(--wabi-moss-dark);
  }

  > p,
  .tool-note-card {
    position: absolute;
    top: 44px;
    right: 0;
    z-index: 12;
    width: min(380px, 76vw);
    margin: 0;
    padding: 15px 16px;
    border: 1px solid var(--wabi-line);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.32), transparent 58%), rgba(251, 250, 246, 0.98);
    box-shadow: var(--wabi-shadow-soft);
    color: var(--wabi-ink-soft);
    line-height: 1.75;
    animation: note-in 0.22s ease both;
  }
}

.tool-note-card {
  display: grid;
  gap: 10px;

  p + p {
    padding-top: 10px;
    border-top: 1px solid rgba(58, 55, 49, 0.1);
  }
}

.eyebrow,
.tool-kind {
  color: var(--wabi-earth);
  font-size: 14px;
  font-weight: 700;
}

.ai-card {
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(246, 243, 236, 0.36), transparent 56%),
    linear-gradient(180deg, rgba(250, 248, 243, 0.92), rgba(240, 236, 227, 0.84));
  border: 1px solid var(--wabi-line);
  box-shadow: var(--wabi-shadow-soft);
}

.ai-workshop-body {
  min-width: 0;
}

.ai-workspace-panel,
.manager-panel {
  min-width: 0;
  padding: clamp(22px, 2.5vw, 32px);
}

.tool-header,
.panel-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;

  h2 {
    margin: 4px 0 6px;
    color: var(--wabi-ink);
    font-size: 25px;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: var(--wabi-muted);
    line-height: 1.7;
  }
}

.tool-title-stack {
  min-width: 0;
}

.tool-error {
  margin: -4px 0 16px;
  padding: 10px 12px;
  border: 1px solid rgba(183, 87, 56, 0.28);
  border-radius: 8px;
  background: rgba(183, 87, 56, 0.09);
  color: #8d3f28;
  font-weight: 700;
  line-height: 1.6;
}

.manager-error {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(183, 87, 56, 0.28);
  border-radius: 8px;
  background: rgba(183, 87, 56, 0.08);
  color: #8d3f28;
  font-weight: 700;
  line-height: 1.6;
}

.generation-status-card {
  display: grid;
  gap: 12px;
  margin: -4px 0 16px;
  padding: 14px;
  border: 1px solid rgba(111, 122, 104, 0.18);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.74);
}

.generation-status-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  strong {
    color: var(--wabi-ink);
    font-size: 15px;
  }

  span {
    color: var(--wabi-earth);
    font-size: 13px;
    font-weight: 700;
  }
}

.generation-status-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;

  div {
    min-width: 0;
  }

  dt {
    margin-bottom: 4px;
    color: var(--wabi-muted);
    font-size: 12px;
  }

  dd {
    margin: 0;
    color: var(--wabi-ink-soft);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}

.generation-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-block {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;

  > span {
    color: var(--wabi-ink);
    font-weight: 700;
  }
}

.setup-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.strip-field {
  min-width: 0;
  margin-bottom: 0;
}

.plain-state {
  display: flex;
  min-height: 36px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--wabi-line);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.62);
  color: var(--wabi-muted);
}

.source-context-bar {
  padding: 14px;
  margin-bottom: 16px;
  border: 1px dashed rgba(111, 122, 104, 0.28);
  border-radius: 10px;
  background: rgba(240, 236, 227, 0.52);
}

.source-context-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--wabi-ink);
  font-weight: 700;

  > div {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }

  strong {
    color: var(--wabi-muted);
    font-size: 14px;
    font-weight: 600;
  }
}

.context-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.context-load-error {
  margin: 10px 0 0;
  color: #8d3f28;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
}

:deep(.ai-input .el-textarea__inner) {
  background: rgba(248, 245, 239, 0.88);
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  box-shadow: none;
  color: var(--wabi-ink);
  line-height: 1.8;
  padding: 14px;
}

:deep(.main-input-block .el-textarea__inner) {
  min-height: clamp(220px, 28vh, 340px) !important;
}

.requirement-collapse {
  margin-bottom: 14px;
  border: 0;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
}

:deep(.requirement-collapse .el-collapse-item__header) {
  min-height: 42px;
  color: var(--wabi-ink);
  font-weight: 700;
}

:deep(.requirement-collapse .el-collapse-item__content) {
  padding-bottom: 0;
}

.image-setting-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 14px;

  label {
    display: grid;
    gap: 8px;
    color: var(--wabi-ink);
    font-weight: 700;
  }
}

.action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 4px;
}

:deep(.primary-action.el-button) {
  background: var(--wabi-moss);
  border-color: rgba(111, 122, 104, 0.48);
  color: #fbfaf6;
  font-weight: 700;

  &:hover,
  &:focus {
    background: var(--wabi-moss-dark);
    border-color: rgba(85, 97, 78, 0.62);
    color: #fbfaf6;
  }
}

.workshop-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(58, 55, 49, 0.09);
  color: var(--wabi-muted);
  font-size: 14px;
  line-height: 1.5;

  span {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.manager-panel {
  min-height: 560px;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.prompt-card,
.history-card {
  padding: 14px;
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.62);
}

.prompt-card div,
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  h3 {
    margin: 0;
    color: var(--wabi-ink);
    font-size: 16px;
  }
}

.prompt-card p,
.history-card p {
  color: var(--wabi-muted);
  line-height: 1.7;
}

.history-card {
  margin-bottom: 12px;
  cursor: pointer;

  pre {
    max-height: 160px;
    overflow: hidden;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--wabi-ink);
    line-height: 1.7;
  }
}

.history-head span {
  color: var(--wabi-muted-2);
  font-size: 12px;
}

.drawer-title {
  p {
    margin: 0;
    color: var(--wabi-earth);
  }

  h2 {
    margin: 4px 0 0;
    color: var(--wabi-ink);
  }
}

.drawer-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  color: var(--wabi-muted);
}

.drawer-output {
  min-height: 420px;
  margin: 0;
  padding: 18px;
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.88);
  color: var(--wabi-ink);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.drawer-image {
  display: block;
  width: 100%;
  border-radius: 10px;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.starter-result-block {
  display: grid;
  gap: 12px;
}

.starter-result-section {
  padding: 14px;
  border: 1px solid var(--wabi-line);
  border-radius: 10px;
  background: rgba(251, 250, 246, 0.88);

  h3 {
    margin: 0 0 8px;
    color: var(--wabi-ink);
  }

  p {
    margin: 0;
    white-space: pre-wrap;
    color: var(--wabi-ink-soft);
    line-height: 1.7;
  }
}

@media (max-width: 900px) {
  .ai-workshop-header {
    display: grid;
  }

  .header-aside {
    max-width: none;
    justify-content: flex-start;
  }

  .header-metrics {
    justify-content: flex-start;
  }

  .panel-title {
    display: grid;
  }

  .tool-header {
    gap: 12px;
  }

  .tool-header-actions {
    justify-content: flex-start;
  }

  .setup-strip {
    grid-template-columns: 1fr;
  }

  .image-setting-row {
    grid-template-columns: 1fr;
  }

  .generation-status-card dl {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ai-workshop-header {
    gap: 14px;
    margin-bottom: 16px;
  }

  .ai-workspace-panel,
  .manager-panel {
    padding: 18px;
  }

  .ai-workshop-header h1 {
    font-size: 30px;
  }

  .source-context-head {
    align-items: flex-start;
  }

  .action-bar .el-button:not(:last-child) {
    flex: 1 1 auto;
  }
}

@keyframes note-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

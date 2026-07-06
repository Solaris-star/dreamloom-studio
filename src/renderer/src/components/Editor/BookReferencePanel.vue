<template>
  <aside class="reference-panel" :class="{ pinned }">
    <header class="reference-header">
      <div>
        <p>作品资料板</p>
        <h2>{{ bookTitle }}</h2>
      </div>
      <div class="reference-actions">
        <button type="button" :class="{ active: pinned }" title="固定资料板" @click="emit('toggle-pin')">
          <Pin :size="15" />
        </button>
        <button type="button" title="关闭资料板" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>
    </header>

    <nav class="reference-tabs" aria-label="资料板分类">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" :size="15" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <section class="reference-body">
      <template v-if="activeTab === 'chapter'">
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          :title="isLocked ? '本章临时提取信息' : '本章上下文'"
          type="chapter"
          :summary="isLocked ? temporaryChapterSummary : chapterSummary"
          :items="isLocked ? temporaryChapterItems : chapterItems"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
      </template>

      <template v-else-if="activeTab === 'characters'">
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          v-for="item in visibleCharacterCards"
          :key="item.id"
          type="character"
          :title="item.title"
          :summary="item.summary"
          :items="item.items"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
        <article v-if="!visibleCharacterCards.length" class="empty-card">
          <strong>暂无角色资料</strong>
          <p>{{ isLocked ? '当前章还没有识别到角色。可以先让 AI 只基于当前章提取临时角色。' : '本章上下文里还没有角色列表。可以先生成章纲或从素材库补充角色资料。' }}</p>
          <button type="button" @click="askAgent('请只基于当前章节提取出场角色，并说明每个角色在本章的身份、目标和关系。')">提取本章角色</button>
        </article>
      </template>

      <template v-else-if="activeTab === 'world'">
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          :title="isLocked ? '本章临时设定线索' : '世界设定'"
          type="worldbuilding"
          :summary="isLocked ? temporaryWorldSummary : worldSummary"
          :items="isLocked ? temporaryWorldItems : worldItems"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
        <article v-if="forbiddenNotes.length" class="warning-card">
          <strong>不要写错</strong>
          <span v-for="item in forbiddenNotes" :key="item">{{ item }}</span>
        </article>
      </template>

      <template v-else-if="activeTab === 'timeline'">
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          :title="isLocked ? '本章临时时间线' : '时间线'"
          type="timeline"
          :summary="isLocked ? temporaryTimelineSummary : timelineSummary"
          :items="isLocked ? temporaryTimelineItems : timelineItems"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
      </template>

      <template v-else-if="activeTab === 'images'">
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          v-for="item in isLocked ? [] : imageCards"
          :key="item.id"
          type="image"
          :title="item.title"
          :summary="item.summary"
          :items="item.items"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
        <article v-if="isLocked || !imageCards.length" class="empty-card">
          <strong>还没有立绘</strong>
          <p>{{ isLocked ? '完成拆书前不会显示完整图像绑定。你仍然可以让 Agent 只基于当前章生成角色绘图 Prompt。' : '可以让 Agent 基于当前人设和本章氛围生成角色绘图 Prompt。' }}</p>
          <button type="button" @click="askAgent('帮我为当前章节中的角色生成角色绘图方案，并输出可用于图片模型的 Prompt。')">生成角色立绘 Prompt</button>
        </article>
      </template>

      <template v-else>
        <LockedNotice v-if="isLocked" @ask="askAgent" />
        <ReferenceCard
          :title="isLocked ? '本章临时线索' : '伏笔线索'"
          type="foreshadowing"
          :summary="isLocked ? temporaryForeshadowingSummary : foreshadowingSummary"
          :items="isLocked ? temporaryForeshadowingItems : foreshadowingItems"
          @add="addToAgentContext"
          @ask="askAgent"
          @open="openAsset"
        />
        <article v-if="infoGapItems.length" class="warning-card">
          <strong>信息差</strong>
          <span v-for="item in infoGapItems" :key="item">{{ item }}</span>
        </article>
        <article v-else class="empty-card">
          <strong>暂无信息差资料</strong>
          <p>当前章还没有可用的信息差记录。可以先让 AI 从正文里提取读者、角色和作者分别知道的内容。</p>
          <button type="button" @click="askAgent('请只基于当前章节提取信息差，分别列出读者知道、角色知道和作者需要保留的信息。')">提取信息差</button>
        </article>
      </template>
    </section>
  </aside>
</template>

<script setup>
import { computed, defineComponent, h, ref } from 'vue'
import { BookOpen, Clock3, Image, Pin, ScrollText, UsersRound, X, Zap } from 'lucide-vue-next'

const props = defineProps({
  bookName: { type: String, default: '' },
  bookMeta: { type: Object, default: null },
  chapterBrief: { type: Object, default: () => ({}) },
  editorContext: { type: Object, default: () => ({}) },
  pinned: { type: Boolean, default: false },
  initialTab: { type: String, default: 'chapter' }
})

const emit = defineEmits(['close', 'toggle-pin', 'add-to-agent-context', 'ask-agent', 'open-asset'])

const activeTab = ref(props.initialTab || 'chapter')
const tabs = [
  { key: 'chapter', label: '本章', icon: ScrollText },
  { key: 'characters', label: '角色', icon: UsersRound },
  { key: 'world', label: '设定', icon: BookOpen },
  { key: 'timeline', label: '时间线', icon: Clock3 },
  { key: 'images', label: '立绘', icon: Image },
  { key: 'foreshadowing', label: '伏笔', icon: Zap }
]

const bookTitle = computed(() => props.bookMeta?.name || props.bookMeta?.folderName || props.bookName || '未选择作品')
const isLocked = computed(() => isDownloadedBook(props.bookMeta) && !isParsed(props.bookMeta))
const brief = computed(() => props.chapterBrief || {})

const chapterSummary = computed(() => [
  `本章目标：${brief.value.goal || '暂无'}`,
  `核心冲突：${brief.value.conflict || '暂无'}`,
  `下一步：${brief.value.nextSuggestion || '可让 Agent 生成'}`
].join('\n'))
const chapterItems = computed(() => [
  item('出场角色', joinList(brief.value.characters)),
  item('相关设定', joinList(brief.value.relatedSettings)),
  item('伏笔线索', joinList(brief.value.foreshadowing)),
  item('上一章摘要', brief.value.previousSummary || '暂无'),
  item('不能写错', joinList(brief.value.forbiddenNotes))
])
const temporaryChapterSummary = computed(() => [
  '这本书还没有完成拆书。',
  '当前只能查看本章临时提取信息。',
  `当前章节：${props.editorContext?.chapterName || '未打开章节'}`
].join('\n'))
const temporaryChapterItems = computed(() => [
  item('本章目标', brief.value.goal || '等待 Agent 提取'),
  item('核心冲突', brief.value.conflict || '等待 Agent 提取'),
  item('出场角色', joinList(brief.value.characters) || '可从当前章临时提取'),
  item('相关设定', joinList(brief.value.relatedSettings) || '可从当前章临时提取'),
  item('伏笔线索', joinList(brief.value.foreshadowing) || '可从当前章临时提取'),
  item('写作禁区', joinList(brief.value.forbiddenNotes) || '完成拆书后可用')
])
const characterCards = computed(() => {
  const names = toList(brief.value.characters)
  return names.map((name) => ({
    id: `character:${name}`,
    title: name,
    summary: '来自当前章纲的角色名单，详细资料尚未绑定。',
    items: [
      item('身份', '未记录'),
      item('目标', '未记录'),
      item('关系', '未记录')
    ]
  }))
})
const temporaryCharacterCards = computed(() => {
  const names = toList(brief.value.characters)
  return names.map((name) => ({
    id: `temporary-character:${name}`,
    title: `${name}（临时）`,
    summary: '只来自当前章节的临时识别结果，不能当作完整角色资料。',
    items: [
      item('身份', '待提取'),
      item('阵营', '待提取'),
      item('当前目标', '待提取'),
      item('当前关系', '只可按当前章判断')
    ]
  }))
})
const visibleCharacterCards = computed(() => isLocked.value ? temporaryCharacterCards.value : characterCards.value)
const worldSummary = computed(() => joinList(brief.value.relatedSettings) || '本章相关设定会在这里速查。')
const worldItems = computed(() => [
  item('已记录设定', joinList(brief.value.relatedSettings) || '暂无')
])
const temporaryWorldSummary = computed(() => '只显示当前章里能临时提取到的设定线索，完整世界资料要等拆书完成。')
const temporaryWorldItems = computed(() => [
  item('当前章设定线索', joinList(brief.value.relatedSettings) || '待提取')
])
const forbiddenNotes = computed(() => toList(brief.value.forbiddenNotes))
const timelineSummary = computed(() => `当前章节：${props.editorContext?.chapterName || '未打开章节'}`)
const timelineItems = computed(() => [
  item('上一事件', brief.value.previousSummary || '暂无'),
  item('当前事件', brief.value.goal || '暂无'),
  item('下一事件', brief.value.nextSuggestion || '暂无')
])
const temporaryTimelineSummary = computed(() => '当前只能查看本章前后的临时事件判断。')
const temporaryTimelineItems = computed(() => [
  item('上一事件', brief.value.previousSummary || '待提取'),
  item('当前事件', brief.value.goal || '待提取'),
  item('下一事件', '完成拆书后可用'),
  item('时间冲突提醒', '完成拆书后可用')
])
const imageCards = computed(() => toList(brief.value.images || brief.value.characterImages).map((entry) => {
  const title = typeof entry === 'string' ? entry : (entry.title || entry.name || entry.characterName || '角色立绘')
  return {
    id: `image:${title}`,
    title,
    summary: typeof entry === 'string' ? '已记录立绘' : (entry.summary || entry.description || '已记录立绘'),
    items: [
      item('绑定对象', typeof entry === 'string' ? entry.replace(/立绘$/, '') : (entry.characterName || entry.name || title)),
      item('路径', typeof entry === 'object' ? entry.path || entry.filePath || entry.imagePath || '' : '')
    ]
  }
}))
const foreshadowingSummary = computed(() => joinList(brief.value.foreshadowing) || '本章伏笔和线索会在这里速查。')
const foreshadowingItems = computed(() => [
  item('已记录线索', joinList(brief.value.foreshadowing) || '暂无')
])
const temporaryForeshadowingSummary = computed(() => '只展示当前章能临时识别的线索，不代表整本书的伏笔表。')
const temporaryForeshadowingItems = computed(() => [
  item('本章线索', joinList(brief.value.foreshadowing) || '待提取'),
  item('未回收伏笔', '完成拆书后可用'),
  item('信息差', '完成拆书后可用'),
  item('是否提前暴露', '可让 Agent 只检查当前章')
])
const infoGapItems = computed(() => toList(
  brief.value.infoGaps ||
  brief.value.informationGaps ||
  brief.value.knowledgeGaps ||
  brief.value.hiddenInformation
))

function addToAgentContext(payload) {
  emit('add-to-agent-context', {
    id: `${payload.type}:${payload.title}`,
    type: payload.type,
    targetId: payload.title,
    title: payload.title,
    summary: payload.summary
  })
}

function askAgent(instruction) {
  emit('ask-agent', instruction)
}

function openAsset(payload) {
  emit('open-asset', payload)
}

function item(label, value) {
  return { label, value: value || '暂无' }
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  return String(value).split(/[、,，\n]/).map((row) => row.trim()).filter(Boolean)
}

function joinList(value) {
  const rows = toList(value)
  return rows.length ? rows.join('、') : ''
}

function isDownloadedBook(meta = {}) {
  return meta?.type === 'downloaded' || meta?.bookRole === 'downloaded' || meta?.downloaded === true || meta?.sourceType === 'downloadedNovel' || meta?.importedFrom === 'novelDownload'
}

function isParsed(meta = {}) {
  return meta?.analysisStatus === 'split_done'
}

const LockedNotice = defineComponent({
  name: 'LockedNotice',
  emits: ['ask'],
  setup(_, { emit: cardEmit }) {
    const actions = [
      { label: '拆当前章', instruction: '请只基于当前章节做拆书，提炼剧情、人物、爽点和可借鉴写法。' },
      { label: '开始整本拆书', instruction: '请为这本下载书制定整本拆书计划，并先说明需要确认的范围。' },
      { label: '仅从当前章临时提取', instruction: '请仅从当前章临时提取可保存到素材箱的内容。' }
    ]
    return () => h('article', { class: 'locked-card' }, [
      h(BookOpen, { size: 24 }),
      h('h3', '这本书还没有完成拆书。'),
      h('p', '当前只能查看本章临时提取信息。完成拆书后，可以查看完整角色关系、世界设定、时间线、伏笔和图像绑定。'),
      h('div', actions.map((action) => h('button', {
        type: 'button',
        onClick: () => cardEmit('ask', action.instruction)
      }, action.label)))
    ])
  }
})

const ReferenceCard = defineComponent({
  name: 'ReferenceCard',
  props: {
    title: { type: String, required: true },
    type: { type: String, required: true },
    summary: { type: String, default: '' },
    items: { type: Array, default: () => [] }
  },
  emits: ['add', 'ask', 'open'],
  setup(cardProps, { emit: cardEmit }) {
    return () => h('article', { class: 'reference-card' }, [
      h('header', [
        h('div', [h('strong', cardProps.title), h('span', typeLabel(cardProps.type))]),
        h('button', {
          type: 'button',
          onClick: () => cardEmit('add', cardProps)
        }, '加入上下文')
      ]),
      h('p', cardProps.summary || '暂无资料'),
      h('dl', cardProps.items.map((row) => [
        h('dt', row.label),
        h('dd', row.value)
      ])),
      h('footer', [
        h('button', {
          type: 'button',
          onClick: () => cardEmit('ask', askText(cardProps.type, cardProps.title))
        }, agentActionText(cardProps.type)),
        h('button', {
          type: 'button',
          onClick: () => cardEmit('open', { type: cardProps.type, title: cardProps.title })
        }, '打开资产台详情')
      ])
    ])
  }
})

function typeLabel(type) {
  const map = { chapter: '本章资料', character: '角色卡', worldbuilding: '世界设定', timeline: '时间线', image: '图像资料', foreshadowing: '伏笔线索' }
  return map[type] || '资料'
}

function agentActionText(type) {
  const map = { character: '检查人设', worldbuilding: '检查设定', timeline: '检查时间', image: '生成 Prompt', foreshadowing: '检查线索' }
  return map[type] || '让 Agent 检查'
}

function askText(type, title) {
  const map = {
    character: `请检查当前段落中「${title}」的人设是否与已有角色资料冲突。`,
    worldbuilding: `请检查当前章节是否违背「${title}」相关设定。`,
    timeline: '请检查当前章节前后的时间顺序是否冲突。',
    image: `帮我为「${title.replace(/立绘$/, '')}」生成角色立绘 Prompt，参考当前人设和本章氛围。`,
    foreshadowing: `请检查当前章节是否提前暴露「${title}」相关线索。`
  }
  return map[type] || '请检查当前章节是否违背资料板中的资料。'
}
</script>

<style scoped lang="scss">
.reference-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  min-height: 0;
  border-left: 1px solid rgba(154, 107, 36, 0.14);
  background: #fffaf2;
  color: #2c2419;
}

.reference-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px 10px;
  border-bottom: 1px solid rgba(154, 107, 36, 0.12);

  p {
    margin: 0 0 4px;
    color: var(--wabi-warning);
    font-size: 12px;
  }

  h2 {
    margin: 0;
    color: #3a3731;
    font-size: 17px;
  }
}

.reference-actions {
  display: flex;
  gap: 6px;

  button {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: #fff8ea;
    color: #59432c;
    cursor: pointer;

    &.active,
    &:hover {
      background: rgba(138, 115, 93, 0.18);
      color: var(--wabi-earth);
    }
  }
}

.reference-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid rgba(154, 107, 36, 0.1);

  button {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid rgba(154, 107, 36, 0.13);
    border-radius: 8px;
    background: #fffdf8;
    color: #5f5448;
    cursor: pointer;
    font-size: 12px;
    padding: 7px 4px;

    &.active {
      background: rgba(138, 115, 93, 0.18);
      color: var(--wabi-earth);
      font-weight: 700;
    }
  }
}

.reference-body {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.reference-card,
.warning-card,
.empty-card,
.locked-card {
  border: 1px solid rgba(154, 107, 36, 0.14);
  border-radius: 8px;
  background: #fffdf8;
  box-shadow: 0 10px 24px rgba(83, 58, 28, 0.05);
}

.reference-card {
  padding: 12px;

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  strong {
    display: block;
    color: #3a3731;
    font-size: 14px;
  }

  header span {
    color: var(--wabi-warning);
    font-size: 12px;
  }

  p {
    margin: 9px 0;
    color: #5d5145;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-line;
  }

  dl {
    display: grid;
    gap: 7px;
    margin: 0 0 10px;
  }

  dt {
    color: var(--wabi-earth);
    font-size: 12px;
    font-weight: 700;
  }

  dd {
    margin: 2px 0 0;
    color: #43382c;
    font-size: 13px;
    line-height: 1.5;
  }

  button {
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: #fff8ea;
    color: var(--wabi-earth);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 6px 8px;

    &:hover {
      background: rgba(138, 115, 93, 0.16);
      color: var(--wabi-earth);
    }
  }
}

.warning-card,
.empty-card,
.locked-card {
  display: grid;
  gap: 8px;
  padding: 14px;

  strong,
  h3 {
    margin: 0;
    color: #3a3731;
  }

  span,
  p {
    margin: 0;
    color: #6f6558;
    font-size: 13px;
    line-height: 1.6;
  }

  button {
    border: 1px solid rgba(151, 106, 43, 0.18);
    border-radius: 8px;
    background: rgba(138, 115, 93, 0.18);
    color: var(--wabi-earth);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 7px 9px;
  }
}

.locked-card {
  place-items: start;
  margin: 12px;

  div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>

import { defineComponent, h } from 'vue'
import { Flame } from 'lucide-vue-next'
import InfoRow from './InfoRow'
import MarketActionBar from './MarketActionBar'
import MarketEmptyState from './MarketEmptyState'

function scoreText(value) {
  return value == null || value === '' ? '—' : String(value)
}

function kindLabel(insight) {
  if (!insight) return ''
  if (insight.contentKindLabel) return insight.contentKindLabel
  if (insight.isExample) return '示例内容'
  if (insight.isUserContent) return '用户内容'
  if (insight.isStale) return '过期缓存'
  return '外部实时'
}

export default defineComponent({
  name: 'InsightDetailPanel',
  props: {
    insight: { type: Object, default: null },
    title: { type: String, default: '灵感详情' },
    loadingKey: { type: String, default: '' }
  },
  emits: ['save', 'outline', 'apply', 'create-book'],
  setup(props, { emit }) {
    return () =>
      h('aside', { class: 'paper-panel insight-detail-panel' }, [
        h('div', { class: 'panel-title' }, [
          h('div', [h('h2', props.title), h('p', '点击左侧方向查看详情')]),
          props.insight
            ? h('b', { class: ['heat-mark', props.insight.isExample ? 'is-example' : ''] }, [
                props.insight.isExample || props.insight.heatScore == null
                  ? null
                  : h(Flame, { size: 15, strokeWidth: 2 }),
                props.insight.isExample || props.insight.heatScore == null
                  ? kindLabel(props.insight)
                  : scoreText(props.insight.heatScore)
              ])
            : null
        ]),
        props.insight
          ? h('div', { class: 'detail-body' }, [
              h('h3', props.insight.title),
              h(
                'div',
                { class: 'tag-line' },
                [
                  h('span', { class: 'content-kind-chip' }, kindLabel(props.insight)),
                  ...(props.insight.tags || []).slice(0, 6).map((tag) => h('span', tag))
                ]
              ),
              h(InfoRow, {
                label: '热点来源',
                items: [props.insight.sourceSummary || props.insight.source]
              }),
              h(InfoRow, {
                label: '内容类型',
                items: [kindLabel(props.insight)]
              }),
              h(InfoRow, { label: '读者情绪', items: props.insight.readerEmotion || [] }),
              h(InfoRow, { label: '核心冲突', items: [props.insight.conflict] }),
              h(InfoRow, { label: '故事潜力', items: [props.insight.storyPotential] }),
              h(InfoRow, { label: '书名方向', items: props.insight.bookTitleIdeas || [] }),
              h(InfoRow, { label: '一句话简介', items: props.insight.loglineIdeas || [] }),
              h(InfoRow, { label: '开篇切入点', items: props.insight.openingIdeas || [] }),
              h(MarketActionBar, {
                loadingKey: props.loadingKey,
                onSave: () => emit('save', props.insight),
                onOutline: () => emit('outline', props.insight),
                onApply: () => emit('apply', props.insight),
                onCreateBook: () => emit('create-book', props.insight)
              })
            ])
          : h(MarketEmptyState, {
              title: '请选择题材方向。',
              description: '点击任意卡片后，这里会显示小说化转写结果。'
            })
      ])
  }
})

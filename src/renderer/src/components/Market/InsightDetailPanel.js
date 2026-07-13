import { defineComponent, h } from 'vue'
import { Flame } from 'lucide-vue-next'
import InfoRow from './InfoRow'
import MarketActionBar from './MarketActionBar'
import MarketEmptyState from './MarketEmptyState'

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
            ? h('b', { class: 'heat-mark' }, [
                h(Flame, { size: 15, strokeWidth: 2 }),
                String(props.insight.heatScore || 0)
              ])
            : null
        ]),
        props.insight
          ? h('div', { class: 'detail-body' }, [
              h('h3', props.insight.title),
              h(
                'div',
                { class: 'tag-line' },
                (props.insight.tags || []).slice(0, 6).map((tag) => h('span', tag))
              ),
              h(InfoRow, {
                label: '热点来源',
                items: [props.insight.sourceSummary || props.insight.source]
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

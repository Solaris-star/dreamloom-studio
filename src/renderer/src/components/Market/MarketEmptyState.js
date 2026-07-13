import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'MarketEmptyState',
  props: {
    title: { type: String, default: '暂无数据。' },
    description: { type: String, default: '' }
  },
  setup(props) {
    return () =>
      h('div', { class: 'market-empty' }, [
        h('strong', props.title),
        props.description ? h('p', props.description) : null
      ])
  }
})

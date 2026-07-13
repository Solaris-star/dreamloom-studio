import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'MarketInfoRow',
  props: {
    label: { type: String, required: true },
    items: { type: [Array, String], default: () => [] }
  },
  setup(props) {
    return () => {
      const values = Array.isArray(props.items)
        ? props.items.filter(Boolean)
        : [props.items].filter(Boolean)
      return h('div', { class: 'info-row' }, [
        h('span', props.label),
        h('div', values.length ? values.map((item) => h('em', String(item))) : [h('em', '暂无')])
      ])
    }
  }
})

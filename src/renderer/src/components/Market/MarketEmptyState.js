import { defineComponent, h } from 'vue'
import UiEmptyState from '../ui/UiEmptyState.vue'

export default defineComponent({
  name: 'MarketEmptyState',
  props: {
    title: { type: String, default: '暂无数据。' },
    description: { type: String, default: '' },
    primaryText: { type: String, default: '' },
    secondaryText: { type: String, default: '' }
  },
  emits: ['primary', 'secondary'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        UiEmptyState,
        {
          class: 'market-empty',
          title: props.title,
          description: props.description,
          primaryText: props.primaryText,
          secondaryText: props.secondaryText,
          variant: 'panel',
          onPrimary: () => emit('primary'),
          onSecondary: () => emit('secondary')
        },
        slots
      )
  }
})

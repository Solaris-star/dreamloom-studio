import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'MarketLoadingSkeleton',
  setup() {
    return () =>
      h(
        'div',
        { class: 'market-skeleton' },
        Array.from({ length: 9 }).map((_, index) => h('i', { key: index }))
      )
  }
})

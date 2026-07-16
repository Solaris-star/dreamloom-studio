import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'MarketEmptyState',
  props: {
    title: { type: String, default: '暂无数据。' },
    description: { type: String, default: '' },
    reason: { type: String, default: 'empty' },
    showActions: { type: Boolean, default: false },
    offline: { type: Boolean, default: false },
    canRefresh: { type: Boolean, default: true },
    canCreate: { type: Boolean, default: true },
    canImport: { type: Boolean, default: true }
  },
  emits: ['refresh', 'create', 'import'],
  setup(props, { emit, slots }) {
    return () => {
      const actions = []
      if (props.showActions) {
        if (props.canRefresh) {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                class: 'market-empty-action primary',
                onClick: () => emit('refresh')
              },
              props.offline ? '重试刷新' : '刷新灵感'
            )
          )
        }
        if (props.canCreate) {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                class: 'market-empty-action',
                onClick: () => emit('create')
              },
              '创建灵感'
            )
          )
        }
        if (props.canImport) {
          actions.push(
            h(
              'button',
              {
                type: 'button',
                class: 'market-empty-action',
                onClick: () => emit('import')
              },
              '导入 / 添加内容'
            )
          )
        }
      }
      return h(
        'div',
        {
          class: [
            'market-empty',
            props.offline || props.reason === 'offline' ? 'is-offline' : '',
            props.reason ? `reason-${props.reason}` : ''
          ]
        },
        [
          h('strong', props.title),
          props.description ? h('p', props.description) : null,
          props.offline || props.reason === 'offline'
            ? h('p', { class: 'market-empty-offline' }, '网络不可用时不会伪造市场热度或销量数据。')
            : null,
          actions.length ? h('div', { class: 'market-empty-actions' }, actions) : null,
          slots.default ? slots.default() : null
        ]
      )
    }
  }
})

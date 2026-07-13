import { defineComponent, h } from 'vue'
import { animateBounce } from '@renderer/composables/useMotion'

export default defineComponent({
  name: 'MarketActionBar',
  props: {
    loadingKey: { type: String, default: '' },
    saveLabel: { type: String, default: '存入灵感库' },
    outlineLabel: { type: String, default: '生成模板草案' },
    applyLabel: { type: String, default: '带入目标作品' },
    createLabel: { type: String, default: '新建作品使用' }
  },
  emits: ['save', 'outline', 'apply', 'create-book'],
  setup(props, { emit }) {
    const btn = (key, label, primary = false) =>
      h(
        'button',
        {
          type: 'button',
          class: { primary, loading: props.loadingKey === key, 'motion-feedback-button': true },
          disabled: Boolean(props.loadingKey),
          onClick: (event) => {
            animateBounce(event.currentTarget)
            emit(key === 'create' ? 'create-book' : key)
          }
        },
        props.loadingKey === key ? '处理中' : label
      )
    return () =>
      h('div', { class: 'market-action-bar' }, [
        btn('save', props.saveLabel, true),
        btn('outline', props.outlineLabel),
        btn('apply', props.applyLabel),
        btn('create', props.createLabel, true)
      ])
  }
})

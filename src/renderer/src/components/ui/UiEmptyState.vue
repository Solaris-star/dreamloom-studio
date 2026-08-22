<template>
  <div
    class="ui-empty-state"
    :data-variant="variant"
    role="status"
  >
    <div
      v-if="image"
      class="ui-empty-state__art"
      aria-hidden="true"
    >
      <img
        :src="image"
        alt=""
        class="ui-empty-state__art-img"
        decoding="async"
        loading="lazy"
      />
    </div>
    <div
      v-else-if="icon || $slots.icon"
      class="ui-empty-state__icon"
      aria-hidden="true"
    >
      <slot name="icon">
        {{ icon }}
      </slot>
    </div>
    <strong class="ui-empty-state__title">{{ title }}</strong>
    <p
      v-if="description"
      class="ui-empty-state__desc"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.actions || primaryText || secondaryText"
      class="ui-empty-state__actions"
    >
      <slot name="actions">
        <button
          v-if="primaryText"
          type="button"
          class="ui-empty-state__btn ui-empty-state__btn--primary"
          @click="$emit('primary')"
        >
          {{ primaryText }}
        </button>
        <button
          v-if="secondaryText"
          type="button"
          class="ui-empty-state__btn"
          @click="$emit('secondary')"
        >
          {{ secondaryText }}
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '暂无内容' },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** 可选：空状态插画（URL / import 后的资源路径）。传入时替代 icon 显示。 */
  image: { type: String, default: '' },
  primaryText: { type: String, default: '' },
  secondaryText: { type: String, default: '' },
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'compact', 'panel', 'error'].includes(v)
  }
})

defineEmits(['primary', 'secondary'])
</script>

<style scoped>
.ui-empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: clamp(20px, 3vw, 36px);
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    var(--border-color, var(--wabi-line, #d9d2c4));
  border-radius: var(--theme-card-radius, 12px);
  background: var(--theme-surface-background-strong, var(--bg-soft, #fbfaf6));
  box-shadow: var(--theme-shadow-card, none);
  color: var(--text-base, var(--wabi-ink, #2c2a26));
  text-align: center;
}

.ui-empty-state[data-variant='compact'] {
  padding: 16px;
  gap: 8px;
}

.ui-empty-state[data-variant='panel'] {
  min-height: 180px;
  align-content: center;
}

.ui-empty-state[data-variant='error'] {
  min-height: 180px;
  align-content: center;
  border-color: color-mix(
    in srgb,
    var(--el-color-danger, #c0563f) 45%,
    var(--border-color, #d9d2c4)
  );
  background: color-mix(
    in srgb,
    var(--el-color-danger, #c0563f) 7%,
    var(--theme-surface-background-strong, var(--bg-soft, #fbfaf6))
  );
}

.ui-empty-state[data-variant='error'] .ui-empty-state__icon {
  color: var(--el-color-danger, #c0563f);
  opacity: 1;
}

.ui-empty-state__icon {
  font-size: 28px;
  line-height: 1;
  opacity: 0.72;
}

/* 空状态插画：柔和不出挑，与米白主题衔接 */
.ui-empty-state__art {
  display: grid;
  place-items: center;
  max-width: 220px;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--wabi-line, rgba(44, 42, 38, 0.06));
}

.ui-empty-state__art-img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
  opacity: 0.94;
}

.ui-empty-state__title {
  font-size: 15px;
  font-weight: var(--theme-font-weight-strong, 600);
  letter-spacing: var(--theme-letter-spacing, 0);
}

.ui-empty-state__desc {
  margin: 0;
  max-width: 36em;
  color: var(--text-secondary, var(--wabi-muted, #6b655c));
  font-size: 13px;
  line-height: 1.6;
}

.ui-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.ui-empty-state__btn {
  min-height: 34px;
  padding: 0 14px;
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    var(--border-color, #d9d2c4);
  border-radius: var(--theme-control-radius, 8px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: var(--theme-font-weight-ui, 500);
  transition:
    transform var(--theme-transition-duration, 180ms) ease,
    box-shadow var(--theme-transition-duration, 180ms) ease,
    background-color var(--theme-transition-duration, 180ms) ease;
}

.ui-empty-state__btn:hover {
  transform: var(--theme-button-transform-hover, translateY(-1px));
}

.ui-empty-state__btn:active {
  transform: var(--theme-button-transform-active, translateY(0));
}

.ui-empty-state__btn--primary {
  background: var(--primary-color, var(--el-color-primary, #52634b));
  border-color: var(--primary-color, var(--el-color-primary, #52634b));
  color: #fff;
}
</style>

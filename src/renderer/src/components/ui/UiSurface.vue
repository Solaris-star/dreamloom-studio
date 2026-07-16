<template>
  <component
    :is="as"
    class="ui-surface"
    :class="[`ui-surface--${tone}`, { 'ui-surface--interactive': interactive }]"
    :data-padding="padding"
  >
    <slot />
  </component>
</template>

<script setup>
defineProps({
  as: { type: String, default: 'div' },
  tone: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'muted', 'raised', 'ghost'].includes(v)
  },
  padding: {
    type: String,
    default: 'md',
    validator: (v) => ['none', 'sm', 'md', 'lg'].includes(v)
  },
  interactive: { type: Boolean, default: false }
})
</script>

<style scoped>
.ui-surface {
  border: var(--theme-border-width, 1px) var(--theme-border-style, solid)
    var(--border-color, var(--wabi-line, #d9d2c4));
  border-radius: var(--theme-card-radius, 12px);
  background: var(--theme-surface-background-strong, var(--bg-soft, #fbfaf6));
  box-shadow: var(--theme-shadow-card, none);
  color: var(--text-base, inherit);
  transition:
    border-color var(--theme-transition-duration, 180ms) ease,
    box-shadow var(--theme-transition-duration, 180ms) ease,
    transform var(--theme-transition-duration, 180ms) ease,
    background-color var(--theme-transition-duration, 180ms) ease;
}

.ui-surface--muted {
  background: var(--bg-mute, rgba(0, 0, 0, 0.03));
  box-shadow: none;
}

.ui-surface--raised {
  box-shadow: var(--theme-shadow-raised, var(--theme-shadow-card, none));
}

.ui-surface--ghost {
  background: transparent;
  box-shadow: none;
}

.ui-surface[data-padding='none'] {
  padding: 0;
}
.ui-surface[data-padding='sm'] {
  padding: 12px;
}
.ui-surface[data-padding='md'] {
  padding: clamp(16px, 1.6vw, 22px);
}
.ui-surface[data-padding='lg'] {
  padding: clamp(22px, 2vw, 30px);
}

.ui-surface--interactive {
  cursor: pointer;
}

.ui-surface--interactive:hover {
  transform: var(--theme-button-transform-hover, translateY(-1px));
  box-shadow: var(--theme-shadow-raised, var(--theme-shadow-card, none));
}

.ui-surface--interactive:active {
  transform: var(--theme-button-transform-active, translateY(0));
}
</style>

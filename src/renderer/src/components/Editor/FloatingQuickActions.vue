<template>
  <div
    class="floating-quick-actions"
    aria-label="创作台快捷操作"
  >
    <button
      class="action-btn"
      type="button"
      title="返回首页"
      aria-label="返回首页"
      @click="emit('home')"
    >
      <House :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="打开章节目录"
      aria-label="打开章节目录"
      data-testid="editor-open-catalog"
      @click="emit('catalog')"
    >
      <ListTree :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="上一章"
      aria-label="上一章"
      @click="emit('prev-chapter')"
    >
      <ChevronUp :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="下一章"
      aria-label="下一章"
      @click="emit('next-chapter')"
    >
      <ChevronDown :size="18" />
    </button>
    <button
      class="action-btn"
      type="button"
      title="阅读设置"
      aria-label="阅读设置"
      @click="emit('reading-settings')"
    >
      <Type :size="18" />
    </button>
    <button
      class="action-btn mobile-only"
      type="button"
      title="创作工具"
      aria-label="创作工具"
      @click="emit('tools')"
    >
      <WandSparkles :size="18" />
    </button>
    <button
      class="action-btn"
      :class="{ active: focusMode }"
      type="button"
      :title="focusMode ? '退出专注模式' : '进入专注模式'"
      :aria-label="focusMode ? '退出专注模式' : '进入专注模式'"
      :aria-pressed="focusMode"
      @click="emit('toggle-focus')"
    >
      <Minimize2
        v-if="focusMode"
        :size="18"
      />
      <Maximize2
        v-else
        :size="18"
      />
    </button>
  </div>
</template>

<script setup>
import {
  ChevronDown,
  ChevronUp,
  House,
  ListTree,
  Maximize2,
  Minimize2,
  Type,
  WandSparkles
} from 'lucide-vue-next'

defineProps({
  focusMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'home',
  'catalog',
  'prev-chapter',
  'next-chapter',
  'reading-settings',
  'tools',
  'toggle-focus'
])
</script>

<style scoped>
.floating-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-color, #dedbd5);
  border-radius: 6px;
  background: var(--bg-soft, var(--bg-primary, #ffffff));
  color: var(--text-base);
  box-shadow: 0 6px 20px var(--shadow-color, rgba(34, 30, 24, 0.12));
}

.action-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: var(--text-base, #333333);
  transition: color 160ms ease, background-color 160ms ease;
}

.action-btn:hover,
.action-btn:focus-visible,
.action-btn.active {
  color: var(--el-color-primary, #9b3a32);
  background-color: var(--bg-mute, #f5f7fa);
  outline: none;
}

.mobile-only {
  display: none;
}

@media (max-width: 767px) {
  .floating-quick-actions {
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 2px max(6px, env(safe-area-inset-right)) calc(2px + env(safe-area-inset-bottom))
      max(6px, env(safe-area-inset-left));
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: 0 -2px 10px rgba(34, 30, 24, 0.06);
    box-sizing: border-box;
  }

  .action-btn {
    width: 34px;
    height: 34px;
  }

  .mobile-only {
    display: flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-btn {
    transition: none;
  }
}
</style>

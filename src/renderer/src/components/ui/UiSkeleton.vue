<template>
  <div
    class="ui-skeleton"
    :class="{ 'ui-skeleton--animated': animated }"
    :data-variant="variant"
    role="status"
    aria-busy="true"
    :aria-label="label"
  >
    <!-- 列表 -->
    <template v-if="variant === 'list'">
      <div
        v-for="i in count"
        :key="i"
        class="ui-skeleton__row"
      >
        <span class="sk-block sk-avatar" />
        <div class="ui-skeleton__lines">
          <span class="sk-block" style="height: 12px; width: 42%" />
          <span class="sk-block" style="height: 10px; width: 68%; opacity: 0.75" />
        </div>
      </div>
    </template>

    <!-- 卡片 -->
    <div
      v-else-if="variant === 'card'"
      class="ui-skeleton__cards"
    >
      <div
        v-for="i in count"
        :key="i"
        class="ui-skeleton__card"
      >
        <span class="sk-block sk-cover" />
        <span class="sk-block" style="height: 12px; width: 70%" />
        <span class="sk-block" style="height: 10px; width: 45%; opacity: 0.75" />
      </div>
    </div>

    <!-- 详情 -->
    <div
      v-else-if="variant === 'detail'"
      class="ui-skeleton__detail"
    >
      <span class="sk-block" style="height: 22px; width: 40%; border-radius: var(--theme-card-radius, 12px)" />
      <span
        v-for="i in rows"
        :key="i"
        class="sk-block"
        :style="{ height: '12px', width: `${92 - (i % 3) * 12}%` }"
      />
    </div>

    <!-- 表格 -->
    <div
      v-else-if="variant === 'table'"
      class="ui-skeleton__table"
    >
      <div class="ui-skeleton__thead">
        <span
          v-for="c in 4"
          :key="c"
          class="sk-block"
          style="height: 14px; flex: 1"
        />
      </div>
      <div
        v-for="i in rows"
        :key="i"
        class="ui-skeleton__trow"
      >
        <span
          v-for="c in 4"
          :key="c"
          class="sk-block"
          style="height: 14px; flex: 1"
        />
      </div>
    </div>

    <!-- 编辑器 -->
    <div
      v-else
      class="ui-skeleton__editor"
    >
      <div class="ui-skeleton__toolbar">
        <span
          v-for="c in 6"
          :key="c"
          class="sk-block"
          style="width: 32px; height: 28px"
        />
      </div>
      <span
        v-for="i in rows"
        :key="i"
        class="sk-block"
        :style="{ height: '12px', width: `${96 - (i % 4) * 9}%` }"
      />
    </div>
  </div>
</template>

<script setup>
defineProps({
  variant: {
    type: String,
    default: 'list',
    validator: (v) => ['list', 'card', 'detail', 'table', 'editor'].includes(v)
  },
  // 列表项 / 卡片数量
  count: { type: Number, default: 6 },
  // 详情 / 表格 / 编辑器的文本行数
  rows: { type: Number, default: 6 },
  animated: { type: Boolean, default: true },
  label: { type: String, default: '加载中' }
})
</script>

<style scoped>
.ui-skeleton {
  width: 100%;
}

.sk-block {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: var(--theme-control-radius, 8px);
  background: var(--bg-mute, #ece7dc);
}

@media (prefers-reduced-motion: no-preference) {
  .ui-skeleton--animated .sk-block::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--bg-soft, #fbfaf6) 65%, transparent) 50%,
      transparent 100%
    );
    animation: ui-skeleton-shimmer 1.25s ease-in-out infinite;
  }
}

@keyframes ui-skeleton-shimmer {
  to {
    transform: translateX(100%);
  }
}

/* 列表 */
.ui-skeleton__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.ui-skeleton__row + .ui-skeleton__row {
  border-top: 1px solid var(--border-color-soft, #ece7dc);
}

.sk-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.ui-skeleton__lines {
  display: grid;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* 卡片 */
.ui-skeleton__cards {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

.ui-skeleton__card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e1ddd2);
  border-radius: var(--theme-card-radius, 12px);
  background: var(--bg-soft, #fbfaf6);
}

.sk-cover {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--theme-card-radius, 12px);
}

/* 详情 */
.ui-skeleton__detail {
  display: grid;
  gap: 14px;
  max-width: 900px;
}

/* 表格 */
.ui-skeleton__table {
  border: 1px solid var(--border-color, #e1ddd2);
  border-radius: var(--theme-card-radius, 12px);
  overflow: hidden;
}

.ui-skeleton__thead {
  display: flex;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-mute, #ece7dc);
}

.ui-skeleton__trow {
  display: flex;
  gap: 16px;
  padding: 14px 16px;
  border-top: 1px solid var(--border-color-soft, #ece7dc);
}

/* 编辑器 */
.ui-skeleton__editor {
  display: grid;
  gap: 14px;
}

.ui-skeleton__toolbar {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color-soft, #ece7dc);
}
</style>

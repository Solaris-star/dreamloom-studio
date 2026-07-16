<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { subscribeHttpLoading } from '@renderer/service/webHttpClient'

/** 延迟显示，避免缓存命中/极快请求闪一下 */
const SHOW_DELAY_MS = 160
/** 最短展示，避免闪烁 */
const MIN_VISIBLE_MS = 240

const visible = ref(false)
const activeCount = ref(0)

let showTimer = 0
let hideTimer = 0
let shownAt = 0
let unsubscribe = null

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = 0
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = 0
  }
}

function onLoadingState(state) {
  activeCount.value = state.count || 0
  if (state.active) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = 0
    }
    if (visible.value || showTimer) return
    showTimer = window.setTimeout(() => {
      showTimer = 0
      visible.value = true
      shownAt = Date.now()
    }, SHOW_DELAY_MS)
    return
  }

  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = 0
  }
  if (!visible.value) return

  const elapsed = Date.now() - shownAt
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)
  hideTimer = window.setTimeout(() => {
    hideTimer = 0
    visible.value = false
  }, wait)
}

onMounted(() => {
  unsubscribe = subscribeHttpLoading(onLoadingState)
})

onBeforeUnmount(() => {
  clearTimers()
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <div
    class="global-http-loading"
    :class="{ visible }"
    aria-live="polite"
    aria-busy="true"
    :aria-hidden="visible ? 'false' : 'true'"
  >
    <div class="global-http-loading__bar" />
    <div
      v-show="visible"
      class="global-http-loading__chip"
      role="status"
    >
      <Loader2
        class="global-http-loading__icon"
        :size="16"
        :stroke-width="2.25"
      />
      <span>加载中</span>
    </div>
  </div>
</template>

<style scoped>
.global-http-loading {
  pointer-events: none;
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 4000;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.global-http-loading.visible {
  opacity: 1;
}

.global-http-loading__bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 2px;
  width: 100%;
  transform-origin: left center;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--el-color-primary, #0071e3) 18%, transparent) 18%,
    var(--el-color-primary, #0071e3) 50%,
    color-mix(in srgb, var(--el-color-primary, #0071e3) 18%, transparent) 82%,
    transparent 100%
  );
  background-size: 220% 100%;
  animation: global-http-bar 1.05s linear infinite;
}

.global-http-loading__chip {
  position: fixed;
  top: 14px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary, #0071e3) 22%, transparent);
  background: color-mix(in srgb, #ffffff 88%, var(--el-color-primary, #0071e3) 12%);
  color: var(--el-color-primary-dark-2, #0b57b0);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  backdrop-filter: blur(10px);
}

.global-http-loading__icon {
  animation: global-http-spin 0.85s linear infinite;
}

@keyframes global-http-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes global-http-bar {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-http-loading__bar,
  .global-http-loading__icon {
    animation: none;
  }
}
</style>

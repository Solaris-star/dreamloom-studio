import { onBeforeUnmount, onDeactivated, ref } from 'vue'

/**
 * 页面切换时取消过期请求，避免旧响应覆盖新数据。
 * 每次 begin() 会使上一次的 signal abort。
 */
export function useCancellableLoad() {
  const generation = ref(0)
  let controller = null

  function abortActive() {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  function begin() {
    abortActive()
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    generation.value += 1
    const token = generation.value
    return {
      signal: controller?.signal,
      token,
      isCurrent() {
        return generation.value === token
      }
    }
  }

  function end(token) {
    if (token && generation.value === token) {
      controller = null
    }
  }

  onDeactivated(abortActive)
  onBeforeUnmount(abortActive)

  return {
    begin,
    end,
    abortActive,
    generation
  }
}

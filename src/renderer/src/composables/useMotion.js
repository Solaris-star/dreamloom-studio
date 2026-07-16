import { gsap } from 'gsap'

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DEFAULT_LIST_SELECTOR = ':scope > *'
const dialogVisibleState = new WeakMap()
let dialogObserver = null

gsap.defaults({
  ease: 'power2.out',
  overwrite: 'auto'
})

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCE_MOTION_QUERY).matches
}

/**
 * 页面切换动画（配合 keep-alive）铁律：
 * 1) leave 绝不能把 autoAlpha/opacity 留在 0 —— 缓存节点会带着空白样式被重新激活
 * 2) enter 结束必须 clearProps，避免 residual inline style 卡住
 * 3) 任何路径都要调用 done()，否则 out-in transition 会卡在空白
 */
export function pageBeforeEnter(el, options = {}) {
  if (!el) return
  gsap.killTweensOf(el)
  // 先清掉上次 leave 可能残留的 opacity/visibility
  gsap.set(el, { clearProps: 'transform,opacity,visibility,willChange' })

  const instant = Boolean(options.instant) || prefersReducedMotion()
  if (instant) {
    gsap.set(el, { autoAlpha: 1, y: 0 })
    return
  }

  const compact = Boolean(options.compact)
  gsap.set(
    el,
    compact
      ? { autoAlpha: 0, y: 0, willChange: 'opacity' }
      : { autoAlpha: 0, y: 6, willChange: 'transform,opacity' }
  )
}

export function pageEnter(el, done, options = {}) {
  if (!el) {
    done?.()
    return
  }

  const finishVisible = () => {
    gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform,opacity,visibility,willChange' })
  }

  const instant = Boolean(options.instant) || prefersReducedMotion()
  gsap.killTweensOf(el)

  if (instant) {
    finishVisible()
    done?.()
    return
  }

  const compact = Boolean(options.compact)
  const duration = compact ? 0.06 : 0.12
  const finish = createMotionDone(done, options.fallbackMs || duration * 1000 + 80, finishVisible)

  try {
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      duration,
      clearProps: 'transform,opacity,visibility,willChange',
      onComplete: finish,
      onInterrupt: finish
    })
  } catch {
    finish()
  }
}

export function pageLeave(el, done, options = {}) {
  if (!el) {
    done?.()
    return
  }

  // keep-alive 会复用这个 DOM。禁止 leave 动画把节点留在 opacity:0 / visibility:hidden。
  gsap.killTweensOf(el)
  gsap.set(el, { clearProps: 'transform,opacity,visibility,willChange' })
  done?.()
}

export function animateList(container, options = {}) {
  if (!container) return
  const selector = options.selector || DEFAULT_LIST_SELECTOR
  const items = Array.from(container.querySelectorAll(selector)).filter(isVisibleElement)
  if (!items.length) return

  gsap.killTweensOf(items)

  if (prefersReducedMotion()) {
    gsap.set(items, { autoAlpha: 1, y: 0, clearProps: 'transform,opacity,visibility' })
    return
  }

  gsap.fromTo(
    items,
    { autoAlpha: 0, y: 12, willChange: 'transform,opacity' },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.28,
      stagger: Math.min(0.045, 0.32 / Math.max(items.length, 1)),
      clearProps: 'transform,opacity,visibility,willChange'
    }
  )
}

export function animateDialogIn(el) {
  if (!el || dialogVisibleState.get(el)) return
  if (!isVisibleElement(el)) {
    dialogVisibleState.set(el, false)
    return
  }
  dialogVisibleState.set(el, true)

  if (prefersReducedMotion()) {
    gsap.set(el, { autoAlpha: 1, scale: 1, clearProps: 'transform,opacity,visibility,willChange' })
    return
  }

  gsap.fromTo(
    el,
    { autoAlpha: 0, scale: 0.97, y: 10, willChange: 'transform,opacity' },
    {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      duration: 0.24,
      ease: 'power2.out',
      clearProps: 'transform,opacity,visibility,willChange'
    }
  )
}

export function animateBounce(el) {
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(
    el,
    { scale: 0.98 },
    {
      scale: 1,
      duration: 0.22,
      ease: 'back.out(2.2)',
      willChange: 'transform',
      clearProps: 'transform,willChange'
    }
  )
}

export function animateShake(el) {
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(
    el,
    { x: 0 },
    {
      x: 0,
      duration: 0.28,
      keyframes: { x: [-6, 6, -4, 4, 0] },
      ease: 'power1.inOut',
      willChange: 'transform',
      clearProps: 'transform,willChange'
    }
  )
}

export function installMotionDirectives(app) {
  app.directive('motion-list', {
    mounted(el, binding) {
      runListDirective(el, binding)
    },
    updated(el, binding) {
      const nextKey = listDirectiveKey(el, binding)
      if (nextKey === el.__motionListKey) return
      runListDirective(el, binding, nextKey)
    }
  })

  app.directive('motion-feedback', {
    mounted(el, binding) {
      const handler = (event) => {
        const target = event.target
        if (target?.closest?.('[disabled], .is-disabled, [aria-disabled="true"]')) return
        animateBounce(el)
      }
      el.__motionFeedbackHandler = handler
      el.addEventListener('click', handler)
    },
    beforeUnmount(el) {
      if (!el.__motionFeedbackHandler) return
      el.removeEventListener('click', el.__motionFeedbackHandler)
      delete el.__motionFeedbackHandler
    }
  })
}

export function installElementPlusMotion() {
  if (typeof window === 'undefined' || dialogObserver) return

  const syncDialog = (el) => {
    if (!isVisibleElement(el)) {
      dialogVisibleState.set(el, false)
      return
    }
    animateDialogIn(el)
  }

  const scan = (root = document.body) => {
    if (!root?.querySelectorAll) return
    root.querySelectorAll('.el-dialog, .el-drawer').forEach(syncDialog)
  }

  dialogObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        if (mutation.target.matches?.('.el-dialog, .el-drawer')) syncDialog(mutation.target)
        scan(mutation.target)
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.matches?.('.el-dialog, .el-drawer')) syncDialog(node)
        scan(node)
      })
    })
  })

  dialogObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden']
  })
  scan()
}

function runListDirective(el, binding, key = listDirectiveKey(el, binding)) {
  el.__motionListKey = key
  window.requestAnimationFrame(() => animateList(el, binding.value || {}))
}

function listDirectiveKey(el, binding) {
  const value = binding.value || {}
  if (value.key != null) return String(value.key)
  return `${el.children.length}:${el.textContent?.length || 0}`
}

function isVisibleElement(el) {
  return el instanceof Element && el.getClientRects().length > 0
}

function createMotionDone(done, fallbackMs = 360, finalize) {
  let called = false
  let timer = 0
  const finish = () => {
    if (called) return
    called = true
    globalThis.clearTimeout(timer)
    finalize?.()
    done?.()
  }
  timer = globalThis.setTimeout(() => finish(), Math.max(80, fallbackMs))
  return finish
}

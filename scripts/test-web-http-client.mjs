import assert from 'node:assert/strict'
import {
  clearHttpClientCache,
  getHttpLoadingState,
  invalidateHttpClientCache,
  postJson,
  requestJson,
  subscribeHttpLoading
} from '../src/renderer/src/service/webHttpClient.js'

const originalFetch = globalThis.fetch
let fetchCount = 0

try {
  clearHttpClientCache()

  // 全局 loading 订阅
  const loadingEvents = []
  const unsubscribe = subscribeHttpLoading((state) => {
    loadingEvents.push({ ...state })
  })

  globalThis.fetch = async () => {
    fetchCount += 1
    return new Response(JSON.stringify({ success: true, data: 1 }))
  }
  assert.deepEqual(await requestJson('/api/test'), { success: true, data: 1 })
  assert.equal(getHttpLoadingState().active, false)
  assert.ok(loadingEvents.some((item) => item.active === true))
  assert.equal(loadingEvents.at(-1)?.active, false)

  // quiet 请求不进入全局 loading
  loadingEvents.length = 0
  await requestJson('/api/quiet', { quiet: true })
  assert.equal(
    loadingEvents.some((item) => item.active === true),
    false
  )
  unsubscribe()

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: '保存失败' }), { status: 200 })
  await assert.rejects(() => postJson('/api/test', {}), /保存失败/)

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: '参数错误' }), { status: 400 })
  await assert.rejects(() => requestJson('/api/test'), /参数错误/)

  globalThis.fetch = async () => new Response('not-json', { status: 502 })
  await assert.rejects(() => requestJson('/api/test'), /不是有效 JSON/)

  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })
  await assert.rejects(() => requestJson('/api/test', { timeoutMs: 10 }), /请求超时/)

  // 外部取消
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => requestJson('/api/cancel', { signal: controller.signal }),
    /请求已取消/
  )

  // 去重：并发相同请求只打一次 fetch
  fetchCount = 0
  let resolveFetch
  globalThis.fetch = () =>
    new Promise((resolve) => {
      fetchCount += 1
      resolveFetch = resolve
    })
  const p1 = requestJson('/api/dedupe')
  const p2 = requestJson('/api/dedupe')
  assert.equal(fetchCount, 1)
  resolveFetch(new Response(JSON.stringify({ success: true, value: 9 })))
  assert.deepEqual(await p1, { success: true, value: 9 })
  assert.deepEqual(await p2, { success: true, value: 9 })

  // 缓存：cacheTtlMs 内不重复请求
  fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount += 1
    return new Response(JSON.stringify({ success: true, cached: true }))
  }
  await requestJson('/api/cache-me', { cacheTtlMs: 5_000 })
  await requestJson('/api/cache-me', { cacheTtlMs: 5_000 })
  assert.equal(fetchCount, 1)

  invalidateHttpClientCache('/api/cache-me')
  await requestJson('/api/cache-me', { cacheTtlMs: 5_000 })
  assert.equal(fetchCount, 2)

  clearHttpClientCache()
} finally {
  globalThis.fetch = originalFetch
}

console.log('Web HTTP 客户端测试通过')

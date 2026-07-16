const DEFAULT_TIMEOUT_MS = 20_000

/** 进行中的同类请求去重（同 method+url+body） */
const inflightRequests = new Map()
/** 短期响应缓存 */
const responseCache = new Map()

function buildRequestKey(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const body = typeof options.body === 'string' ? options.body : ''
  return `${method} ${url} ${body}`
}

function readCache(key, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return null
  const hit = responseCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > ttlMs) {
    responseCache.delete(key)
    return null
  }
  return hit.data
}

function writeCache(key, data, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return
  responseCache.set(key, { at: Date.now(), data })
  if (responseCache.size > 200) {
    const oldestKey = responseCache.keys().next().value
    responseCache.delete(oldestKey)
  }
}

async function readResponseJson(response) {
  try {
    return await response.json()
  } catch {
    throw new Error(`接口返回的不是有效 JSON (${response.status})`)
  }
}

function mergeAbortSignals(timeoutMs, externalSignal) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    }
  }
}

async function executeRequest(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const { signal, cleanup } = mergeAbortSignals(timeoutMs, options.signal)

  try {
    const response = await fetch(url, {
      ...options,
      signal
    })
    const data = await readResponseJson(response)
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || data?.error || `请求失败 (${response.status})`)
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (options.signal?.aborted) {
        throw Object.assign(new Error('请求已取消'), {
          name: 'AbortError',
          code: 'REQUEST_CANCELLED'
        })
      }
      throw new Error(`请求超时 (${timeoutMs} ms)`)
    }
    throw error
  } finally {
    cleanup()
  }
}

/**
 * @param {string} url
 * @param {RequestInit & {
 *   timeoutMs?: number
 *   cacheTtlMs?: number
 *   dedupe?: boolean
 * }} [options]
 */
export async function requestJson(url, options = {}) {
  const { cacheTtlMs = 0, dedupe = true, ...fetchOptions } = options

  const key = buildRequestKey(url, fetchOptions)
  const cached = readCache(key, cacheTtlMs)
  if (cached !== null) return cached

  if (fetchOptions.signal?.aborted) {
    throw Object.assign(new Error('请求已取消'), {
      name: 'AbortError',
      code: 'REQUEST_CANCELLED'
    })
  }

  if (dedupe && inflightRequests.has(key)) {
    return inflightRequests.get(key)
  }

  const pending = executeRequest(url, fetchOptions)
    .then((data) => {
      writeCache(key, data, cacheTtlMs)
      return data
    })
    .finally(() => {
      if (inflightRequests.get(key) === pending) {
        inflightRequests.delete(key)
      }
    })

  if (dedupe) {
    inflightRequests.set(key, pending)
  }

  return pending
}

export function postJson(url, payload, options = {}) {
  return requestJson(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(payload || {})
  })
}

export function fetchJson(url, options = {}) {
  return requestJson(url, options)
}

/** 测试/页面切换时清理短期缓存，避免脏读 */
export function clearHttpClientCache() {
  responseCache.clear()
}

/** 使匹配前缀的缓存失效 */
export function invalidateHttpClientCache(match) {
  if (!match) {
    responseCache.clear()
    return
  }
  const predicate =
    typeof match === 'function' ? match : (key) => String(key).includes(String(match))
  for (const key of [...responseCache.keys()]) {
    if (predicate(key)) responseCache.delete(key)
  }
}

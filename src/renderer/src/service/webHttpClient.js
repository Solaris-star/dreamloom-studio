const DEFAULT_TIMEOUT_MS = 20_000

async function readResponseJson(response) {
  try {
    return await response.json()
  } catch {
    throw new Error(`接口返回的不是有效 JSON (${response.status})`)
  }
}

export async function requestJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: options.signal || controller.signal })
    const data = await readResponseJson(response)
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || data?.error || `请求失败 (${response.status})`)
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`请求超时 (${timeoutMs} ms)`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
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

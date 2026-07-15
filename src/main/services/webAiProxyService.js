import { sanitizePublicErrorMessage, validatePublicHttpUrl } from './safeRemoteUrl.js'

const DEFAULT_TIMEOUT_MS = 15000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST'])

export async function validatePublicAiTarget(targetUrl, lookup) {
  return validatePublicHttpUrl(targetUrl, {
    lookup,
    invalidMessage: 'AI 服务地址无效',
    protocolMessage: 'AI 服务地址只允许使用 http 或 https',
    privateMessage: '不允许访问本机或内网地址'
  })
}

function proxyHeaders(payload = {}) {
  const headers = { Accept: 'application/json' }
  const apiKey = String(payload.apiKey || '').trim()
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  for (const [name, value] of Object.entries(payload.headers || {})) {
    const normalized = name.toLowerCase()
    if (['accept', 'content-type', 'anthropic-version', 'x-api-key'].includes(normalized)) {
      headers[name] = String(value)
    }
  }
  return headers
}

export async function requestWebAiProxy(payload = {}, options = {}) {
  const method = String(payload.method || 'POST').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error('AI 代理只允许 GET 或 POST 请求')
  const url = await validatePublicAiTarget(payload.targetUrl, options.lookup)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
  )
  timeout.unref?.()

  try {
    const response = await (options.fetch || fetch)(url, {
      method,
      headers: proxyHeaders(payload),
      body: method === 'POST' ? JSON.stringify(payload.body || {}) : undefined,
      redirect: 'error',
      signal: controller.signal
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_RESPONSE_BYTES) throw new Error('AI 服务响应内容过大')
    const text = bytes.toString('utf8')
    let data = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // 少数兼容接口会返回纯文本，保留原内容供调用方显示。
    }
    return {
      success: response.ok,
      status: response.status,
      data,
      message: response.ok
        ? ''
        : sanitizePublicErrorMessage(
            data?.error?.message || data?.message || `HTTP ${response.status}`,
            `HTTP ${response.status}`
          )
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI 服务请求超时')
    throw Object.assign(new Error(sanitizePublicErrorMessage(error, 'AI 服务请求失败')), {
      statusCode: error?.statusCode
    })
  } finally {
    clearTimeout(timeout)
  }
}

export default { requestWebAiProxy, validatePublicAiTarget }

import dns from 'node:dns/promises'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 15000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST'])

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  )
}

function isPrivateAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family !== 6) return true
  const normalized = address.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  )
}

export async function validatePublicAiTarget(targetUrl, lookup = dns.lookup) {
  let url
  try {
    url = new URL(String(targetUrl || '').trim())
  } catch {
    throw new Error('AI 服务地址无效')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('AI 服务地址只允许使用 http 或 https')
  }
  if (url.hostname.toLowerCase() === 'localhost') throw new Error('不允许访问本机或内网地址')

  const literalFamily = net.isIP(url.hostname)
  const addresses = literalFamily
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('不允许访问本机或内网地址')
  }
  return url
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
      message: response.ok ? '' : data?.error?.message || data?.message || `HTTP ${response.status}`
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI 服务请求超时')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export default { requestWebAiProxy, validatePublicAiTarget }

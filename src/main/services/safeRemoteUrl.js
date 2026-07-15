import dns from 'node:dns/promises'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
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

function expandIpv6(address) {
  const lower = String(address || '').toLowerCase()
  if (lower.includes('.')) {
    const lastColon = lower.lastIndexOf(':')
    const head = lower.slice(0, lastColon + 1)
    const ipv4 = lower.slice(lastColon + 1).split('.').map(Number)
    if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16)
      const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16)
      return expandIpv6(`${head}${hi}:${lo}`)
    }
  }
  const [left, right = ''] = lower.split('::')
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const missing = 8 - (leftParts.length + rightParts.length)
  const full = [
    ...leftParts,
    ...Array.from({ length: Math.max(missing, 0) }, () => '0'),
    ...rightParts
  ]
  while (full.length < 8) full.push('0')
  return full.slice(0, 8).map((part) => part.padStart(4, '0'))
}

function isPrivateAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family !== 6) return true

  const parts = expandIpv6(address)
  const first = parseInt(parts[0], 16)
  const second = parseInt(parts[1], 16)
  const isLoopback = parts.every((part, index) => (index === 7 ? part === '0001' : part === '0000'))
  const isUnspecified = parts.every((part) => part === '0000')
  const isMappedIpv4 = parts[0] === '0000' &&
    parts[1] === '0000' &&
    parts[2] === '0000' &&
    parts[3] === '0000' &&
    parts[4] === '0000' &&
    parts[5] === 'ffff'
  const isUniqueLocal = (first & 0xfe00) === 0xfc00
  const isLinkLocal = (first & 0xffc0) === 0xfe80
  const isMulticast = (first & 0xff00) === 0xff00

  if (isLoopback || isUnspecified || isUniqueLocal || isLinkLocal || isMulticast) return true
  if (isMappedIpv4) {
    const hi = parseInt(parts[6], 16)
    const lo = parseInt(parts[7], 16)
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    return isPrivateIpv4(ipv4)
  }
  // 6to4 / teredo 映射到私网时同样拦截
  if (first === 0x2002) {
    const ipv4 = `${(second >> 8) & 0xff}.${second & 0xff}.${(parseInt(parts[2], 16) >> 8) & 0xff}.${
      parseInt(parts[2], 16) & 0xff
    }`
    return isPrivateIpv4(ipv4)
  }
  return false
}

export async function validatePublicHttpUrl(targetUrl, options = {}) {
  const {
    lookup = dns.lookup,
    allowCredentials = false,
    invalidMessage = '远程地址无效',
    protocolMessage = '远程地址只允许使用 http 或 https',
    privateMessage = '不允许访问本机或内网地址'
  } = options

  let url
  try {
    url = new URL(String(targetUrl || '').trim())
  } catch {
    throw new Error(invalidMessage)
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(protocolMessage)
  }
  if (!allowCredentials && (url.username || url.password)) {
    throw new Error(protocolMessage)
  }
  if (url.hostname.toLowerCase() === 'localhost') {
    throw new Error(privateMessage)
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const literalFamily = net.isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(privateMessage)
  }
  return url
}

export async function fetchPublicHttpResource(targetUrl, options = {}) {
  const {
    fetchImpl = fetch,
    lookup = dns.lookup,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    redirect = 'error',
    headers,
    signal,
    validateOptions
  } = options

  const url = await validatePublicHttpUrl(targetUrl, { lookup, ...validateOptions })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  timeout.unref?.()

  const abortFromExternal = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromExternal()
  else signal?.addEventListener?.('abort', abortFromExternal, { once: true })

  try {
    const response = await fetchImpl(url.href, {
      method: 'GET',
      headers,
      redirect,
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`远程资源下载失败：HTTP ${response.status}`)
    }

    const declaredSize = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new Error(`远程资源不能超过 ${Math.round(maxBytes / (1024 * 1024))} MB`)
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      if (typeof response.arrayBuffer !== 'function') {
        throw new Error('远程资源响应无效')
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > maxBytes) {
        throw new Error(`远程资源不能超过 ${Math.round(maxBytes / (1024 * 1024))} MB`)
      }
      return { url, response, buffer }
    }

    const reader = response.body.getReader()
    const chunks = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // ignore cancel errors
        }
        throw new Error(`远程资源不能超过 ${Math.round(maxBytes / (1024 * 1024))} MB`)
      }
      chunks.push(Buffer.from(value))
    }
    return { url, response, buffer: Buffer.concat(chunks) }
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      if (signal?.aborted) throw error
      throw new Error('远程资源请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener?.('abort', abortFromExternal)
  }
}

export function sanitizePublicErrorMessage(error, fallback = '请求失败') {
  if (!error) return fallback
  let message = typeof error === 'string' ? error : error.message || fallback
  message = String(message || fallback)
    .replace(/([A-Za-z]:)?[\\/](?:Users|home|tmp|var|opt|private|root|Windows|Program Files)[^\s'"`]*/gi, '[path]')
    .replace(/(?:\/Users\/[^\s'"`]+|\/home\/[^\s'"`]+|\/tmp\/[^\s'"`]+)/g, '[path]')
    .replace(/\s+at\s+\S+.*/g, '')
    .replace(/\n[\s\S]*$/, '')
    .trim()
  if (!message || /api[_-]?key|authorization|bearer\s+\S+/i.test(message)) {
    return fallback
  }
  return message.slice(0, 300)
}

export default {
  validatePublicHttpUrl,
  fetchPublicHttpResource,
  sanitizePublicErrorMessage,
  isPrivateAddress
}

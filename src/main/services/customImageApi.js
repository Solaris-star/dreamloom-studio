/**
 * 自定义图像 API 服务
 * 支持自定义图像生成 API，自动拼接 /v1/images/generations 端点
 */

const DEFAULT_GENERATION_TIMEOUT_MS = 180000
const DEFAULT_VALIDATION_TIMEOUT_MS = 60000

function normalizeTimeoutMs(value, fallback) {
  const timeout = Number(value)
  return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback
}

function createRequestController(timeoutMs, externalSignal, fallback) {
  const controller = new AbortController()
  const timeout = normalizeTimeoutMs(timeoutMs, fallback)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const abortFromExternal = () => controller.abort(externalSignal?.reason)

  if (externalSignal?.aborted) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true })
  }

  return {
    signal: controller.signal,
    timeout,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timer)
      externalSignal?.removeEventListener?.('abort', abortFromExternal)
    }
  }
}

function requestError(error, request, externalSignal, label) {
  if (request.didTimeOut()) {
    const seconds = Math.max(1, Math.round(request.timeout / 1000))
    return new Error(`${label}超时（${seconds} 秒）`)
  }
  if (externalSignal?.aborted) {
    const cancelled = new Error(`${label}已取消`)
    cancelled.name = 'AbortError'
    cancelled.cancelled = true
    return cancelled
  }
  return error
}

async function readJsonResponse(response, label) {
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} 返回数据解析失败`)
  }
}

function decodeBase64Image(value) {
  const encoded = String(value || '')
    .replace(/^data:image\/[^;]+;base64,/i, '')
    .replace(/\s/g, '')
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('图像 API 返回了无效的 Base64 图片')
  }
  const buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length) {
    throw new Error('图像 API 返回了空图片')
  }
  return buffer
}

function requireHttpImageUrl(value) {
  let url
  try {
    url = new URL(String(value || ''))
  } catch {
    throw new Error('图像 API 返回了无效的图片地址')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('图像 API 返回了不安全的图片地址')
  }
  return url
}

export class CustomImageApiService {
  constructor() {
    this.apiKey = null
    this.baseUrl = ''
    this.model = ''
    this.lastResult = null
  }

  initConfig(config) {
    this.apiKey = String(config?.apiKey || '').trim() || null
    this.baseUrl = String(config?.baseUrl || '').trim()
    this.model = String(config?.model || '').trim()
  }

  _buildImageUrl(baseUrl) {
    if (!baseUrl) {
      throw new Error('API 地址未配置')
    }

    const trimmedUrl = baseUrl.replace(/\/$/, '')

    if (trimmedUrl.includes('/v1/images/generations')) {
      return trimmedUrl
    }
    if (trimmedUrl.includes('/v1/images')) {
      return `${trimmedUrl}/generations`
    }
    if (trimmedUrl.includes('/v1')) {
      return `${trimmedUrl}/images/generations`
    }

    return `${trimmedUrl}/v1/images/generations`
  }

  _parseSize(size) {
    const match = String(size || '')
      .trim()
      .match(/^(\d+)\s*(?:x|X|\*|×)\s*(\d+)$/)
    if (!match) return null

    const width = Number(match[1])
    const height = Number(match[2])
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null
    }

    return { width, height }
  }

  async generateImageBuffer(options) {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error('自定义图像 API 配置未完成')
    }

    const {
      prompt,
      size,
      negativePrompt = '',
      timeoutMs = DEFAULT_GENERATION_TIMEOUT_MS,
      signal
    } = options || {}

    if (!String(prompt || '').trim()) {
      throw new Error('提示词不能为空')
    }

    const url = this._buildImageUrl(this.baseUrl)

    let sizeParams = this._parseSize(size) || { width: 1280, height: 720 }
    if (size === 'square') {
      sizeParams = { width: 1280, height: 1280 }
    } else if (size === 'portrait') {
      sizeParams = { width: 720, height: 1280 }
    }

    const body = {
      prompt,
      ...sizeParams,
      n: 1
    }

    if (this.model) {
      body.model = this.model
    }

    if (negativePrompt) {
      body.negative_prompt = negativePrompt
    }

    const request = createRequestController(timeoutMs, signal, DEFAULT_GENERATION_TIMEOUT_MS)
    try {
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: request.signal
        })
      } catch (error) {
        throw requestError(error, request, signal, '图像生成请求')
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: { message: response.statusText }
        }))
        throw new Error(error.error?.message || `图像生成失败: ${response.status}`)
      }

      const data = await readJsonResponse(response, '图像生成 API')
      const usage = {
        ...(data.usage || {}),
        imageRequests: 1
      }
      const imageUrl = data.data?.[0]?.url || data.image?.url || ''

      if (imageUrl) {
        const safeImageUrl = requireHttpImageUrl(imageUrl)
        let imageResponse
        try {
          imageResponse = await fetch(safeImageUrl.href, { signal: request.signal })
        } catch (error) {
          throw requestError(error, request, signal, '生成图片下载')
        }
        if (!imageResponse.ok) {
          throw new Error(`下载生成图片失败: ${imageResponse.status}`)
        }
        const buffer = Buffer.from(await imageResponse.arrayBuffer())
        if (!buffer.length) {
          throw new Error('图像 API 返回了空图片')
        }
        this.lastResult = {
          success: true,
          content: safeImageUrl.href,
          images: [safeImageUrl.href],
          usage,
          model: this.model,
          providerId: '',
          error: ''
        }
        return buffer
      }

      const base64 = data.data?.[0]?.b64_json || data.image?.base64
      if (base64 !== undefined) {
        const buffer = decodeBase64Image(base64)
        this.lastResult = {
          success: true,
          content: 'base64 image',
          images: [base64],
          usage,
          model: this.model,
          providerId: '',
          error: ''
        }
        return buffer
      }

      throw new Error('无法解析图像响应')
    } finally {
      request.cleanup()
    }
  }

  async testModel(modelName, options = {}) {
    const { timeoutMs = DEFAULT_VALIDATION_TIMEOUT_MS, signal } = options
    try {
      if (!this.apiKey || !this.baseUrl) {
        return { success: false, message: '请先填写 API 地址和 Key' }
      }
      const url = this._buildImageUrl(this.baseUrl)
      const body = {
        prompt: 'a cute cat',
        n: 1,
        size: '256x256'
      }
      if (modelName) {
        body.model = modelName
      }
      const request = createRequestController(timeoutMs, signal, DEFAULT_VALIDATION_TIMEOUT_MS)
      try {
        let response
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: request.signal
          })
        } catch (error) {
          throw requestError(error, request, signal, '模型测试')
        }
        if (response.ok) {
          return { success: true, message: '图像模型测试成功' }
        }
        if (response.status === 401 || response.status === 403) {
          return { success: false, message: 'API Key 无效或无权限' }
        }
        const error = await response
          .json()
          .catch(() => ({ error: { message: response.statusText } }))
        return { success: false, message: error.error?.message || `测试失败: ${response.status}` }
      } finally {
        request.cleanup()
      }
    } catch (error) {
      return { success: false, message: error.message || '图像模型测试失败' }
    }
  }

  async validateApiKey(options = {}) {
    const { timeoutMs = DEFAULT_VALIDATION_TIMEOUT_MS, signal } = options
    try {
      if (!this.apiKey || !this.baseUrl) {
        return { isValid: false, message: '配置不完整' }
      }

      const url = this._buildImageUrl(this.baseUrl)

      const body = {
        prompt: 'test',
        width: 256,
        height: 256,
        n: 1
      }

      if (this.model) {
        body.model = this.model
      }

      const request = createRequestController(timeoutMs, signal, DEFAULT_VALIDATION_TIMEOUT_MS)
      let response
      try {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: request.signal
          })
        } catch (error) {
          throw requestError(error, request, signal, 'API Key 验证')
        }

        if (response.ok) {
          return { isValid: true }
        }

        const error = await response.json().catch(() => ({
          error: { message: response.statusText }
        }))

        let errorMessage = error.error?.message || `验证失败: ${response.status}`

        if (response.status === 401) {
          errorMessage = 'API Key 无效或已过期'
        } else if (response.status === 403) {
          errorMessage = 'API Key 无权限访问'
        } else if (response.status === 429) {
          errorMessage = '请求频率过高，请稍后再试'
        }

        return { isValid: false, message: errorMessage }
      } finally {
        request.cleanup()
      }
    } catch (error) {
      let errorMessage = '验证失败'
      if (error.message) {
        errorMessage = error.message
      }

      if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = '网络连接失败'
      }

      return { isValid: false, message: errorMessage }
    }
  }
}

export default new CustomImageApiService()

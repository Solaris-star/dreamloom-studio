/**
 * 自定义图像 API 服务
 * 支持自定义图像生成 API，自动拼接 /v1/images/generations 端点
 */

class CustomImageApiService {
  constructor() {
    this.apiKey = null
    this.baseUrl = ''
    this.model = ''
    this.lastResult = null
  }

  initConfig(config) {
    this.apiKey = config.apiKey || null
    this.baseUrl = config.baseUrl || ''
    this.model = config.model || ''
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

    const { prompt, size, negativePrompt = '' } = options || {}

    if (!prompt) {
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: response.statusText }
      }))
      throw new Error(error.error?.message || `图像生成失败: ${response.status}`)
    }

    const data = await response.json()
    const usage = {
      ...(data.usage || {}),
      imageRequests: 1
    }

    if (data.data && data.data[0] && data.data[0].url) {
      const imageResponse = await fetch(data.data[0].url)
      if (!imageResponse.ok) {
        throw new Error(`下载生成图片失败: ${imageResponse.status}`)
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer())
      this.lastResult = {
        success: true,
        content: data.data[0].url,
        images: [data.data[0].url],
        usage,
        model: this.model,
        providerId: '',
        error: ''
      }
      return buffer
    } else if (data.image) {
      if (data.image.base64) {
        const buffer = Buffer.from(data.image.base64, 'base64')
        this.lastResult = {
          success: true,
          content: 'base64 image',
          images: [data.image.base64],
          usage,
          model: this.model,
          providerId: '',
          error: ''
        }
        return buffer
      } else if (data.image.url) {
        const imageResponse = await fetch(data.image.url)
        if (!imageResponse.ok) {
          throw new Error(`下载生成图片失败: ${imageResponse.status}`)
        }
        const buffer = Buffer.from(await imageResponse.arrayBuffer())
        this.lastResult = {
          success: true,
          content: data.image.url,
          images: [data.image.url],
          usage,
          model: this.model,
          providerId: '',
          error: ''
        }
        return buffer
      }
    }

    throw new Error('无法解析图像响应')
  }

  async testModel(modelName) {
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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        })
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
        clearTimeout(timeoutId)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, message: '测试超时（60秒），请检查网络或模型是否可用' }
      }
      return { success: false, message: error.message || '图像模型测试失败' }
    }
  }

  async validateApiKey() {
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

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      })

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

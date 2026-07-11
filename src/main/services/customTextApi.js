/**
 * 自定义文本 API 服务
 * 支持 OpenAI 格式和 Anthropic 格式的自定义 API
 * 支持多 Key 轮询：请求失败时自动切换下一个 Key 重试
 */

export const CUSTOM_TEXT_REQUEST_STOPPED = '请求已停止'

function createAbortError(message = CUSTOM_TEXT_REQUEST_STOPPED, cancelled = false) {
  const error = new Error(message)
  error.name = 'AbortError'
  if (cancelled) error.cancelled = true
  return error
}

function isAbortSignal(signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
}

function createRequestAbortController(timeoutMs = 180000, externalSignal = null) {
  const controller = new AbortController()
  const timeout = Number(timeoutMs) || 180000
  let timedOut = false
  let externallyAborted = false
  let timeoutId = null

  const abortFromExternal = () => {
    externallyAborted = true
    controller.abort(externalSignal?.reason)
  }

  if (isAbortSignal(externalSignal)) {
    if (externalSignal.aborted) {
      abortFromExternal()
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    }
  }

  timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    get externallyAborted() {
      return externallyAborted
    },
    cleanup() {
      clearTimeout(timeoutId)
      if (isAbortSignal(externalSignal)) {
        externalSignal.removeEventListener('abort', abortFromExternal)
      }
    }
  }
}

function abortMessageFor(meta, timeoutMs = 180000, label = '模型请求') {
  if (meta?.externallyAborted) return CUSTOM_TEXT_REQUEST_STOPPED
  const seconds = Math.round((Number(timeoutMs) || 180000) / 1000)
  return `${label}超时（${seconds} 秒），请更换模型或缩小提取范围`
}

function createSseStream(response, abortMeta, parseData) {
  const reader = response.body?.getReader()
  if (!reader) {
    abortMeta?.cleanup?.()
    throw new Error('模型未返回可读取的流')
  }
  const decoder = new TextDecoder()

  return {
    async *[Symbol.asyncIterator]() {
      let buffer = ''
      let usage = {}
      let model = ''
      let providerId = ''

      const handleLine = async function* (rawLine) {
        const line = String(rawLine || '').trim()
        if (!line || !line.startsWith('data:')) return
        const data = line.slice(5).trim()
        if (!data) return
        let event
        try {
          event = parseData(data)
        } catch {
          return
        }
        if (event?.usage && Object.keys(event.usage).length) usage = event.usage
        if (event?.model) model = event.model
        if (event?.providerId) providerId = event.providerId
        if (event?.content) {
          yield {
            content: event.content,
            done: false,
            usage: event.usage || {},
            model: event.model || model,
            providerId: event.providerId || providerId
          }
        }
        if (event?.done) {
          yield { content: '', done: true, usage, model, providerId }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const line of lines) {
            for await (const event of handleLine(line)) {
              yield event
              if (event.done) return
            }
          }
        }
        if (buffer.trim()) {
          for await (const event of handleLine(buffer)) yield event
        }
        yield { content: '', done: true, usage, model, providerId }
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw createAbortError(abortMessageFor(abortMeta), abortMeta?.externallyAborted)
        }
        throw error
      } finally {
        abortMeta?.cleanup?.()
        reader.releaseLock()
      }
    }
  }
}

export class CustomTextApiService {
  constructor() {
    this.apiKeys = []
    this.baseUrl = ''
    this.apiType = 'openai'
    this.model = ''
    this._currentKeyIndex = 0
  }

  initConfig(config) {
    if (config.apiKeys && Array.isArray(config.apiKeys)) {
      this.apiKeys = config.apiKeys.filter((k) => k && String(k).trim())
    } else if (config.apiKey) {
      this.apiKeys = [config.apiKey]
    } else {
      this.apiKeys = []
    }
    this.baseUrl = config.baseUrl || ''
    this.apiType = config.apiType || 'openai'
    this.model = config.model || ''
    this._currentKeyIndex = 0
  }

  _getCurrentKey() {
    if (!this.apiKeys.length) return null
    return this.apiKeys[this._currentKeyIndex % this.apiKeys.length]
  }

  _advanceKey() {
    if (this.apiKeys.length <= 1) return false
    this._currentKeyIndex = (this._currentKeyIndex + 1) % this.apiKeys.length
    return true
  }

  async _requestWithKeyRotation(requestFn) {
    if (!this.apiKeys.length || !this.baseUrl) {
      throw new Error('请先配置 API 地址和 Key')
    }
    const startIndex = this._currentKeyIndex
    let lastError = null
    let tried = 0
    do {
      tried++
      const key = this._getCurrentKey()
      try {
        return await requestFn(key)
      } catch (error) {
        if (error?.cancelled || error?.message === CUSTOM_TEXT_REQUEST_STOPPED) throw error
        lastError = error
        const msg = error.message || ''
        if (
          msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('Unauthorized') ||
          msg.includes('Invalid') ||
          msg.includes('invalid') ||
          msg.includes('Key')
        ) {
          console.log(
            `[CustomTextApi] Key ${this._currentKeyIndex + 1}/${this.apiKeys.length} 失败: ${msg}，尝试下一个`
          )
          if (!this._advanceKey()) break
          continue
        }
        throw error
      }
    } while (this._currentKeyIndex !== startIndex && tried < this.apiKeys.length)
    throw lastError || new Error('所有 Key 均不可用')
  }

  async listModels() {
    const key = this._getCurrentKey()
    if (!key || !this.baseUrl) {
      return { success: false, models: [], message: '配置不完整' }
    }
    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/v1/models`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` }
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          if (this._advanceKey()) return this.listModels()
          return { success: false, models: [], message: '所有 Key 均无效或无权限' }
        }
        if (response.status === 404) {
          return { success: false, models: [], message: '模型列表端点不存在' }
        }
        return { success: false, models: [], message: `请求失败: ${response.status}` }
      }
      const data = await response.json()
      let models = []
      if (data.data && Array.isArray(data.data)) {
        models = data.data.map((m) => m.id).filter(Boolean)
      } else if (Array.isArray(data)) {
        models = data.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean)
      } else if (data.models && Array.isArray(data.models)) {
        models = data.models.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean)
      }
      return { success: true, models }
    } catch (error) {
      const errorMsg = error.message || '获取模型列表失败'
      return { success: false, models: [], message: errorMsg }
    }
  }

  async chat(options = {}) {
    return this._requestWithKeyRotation(async (key) => {
      const {
        messages = [],
        model = this.model,
        temperature = 0.7,
        max_tokens = 2000,
        timeoutMs = 180000,
        signal
      } = options
      if (!model) throw new Error('请先选择或输入模型名称')
      if (this.apiType === 'openai') {
        return this._callOpenAIApi(key, messages, model, temperature, max_tokens, timeoutMs, signal)
      } else {
        return this._callAnthropicApi(
          key,
          messages,
          model,
          temperature,
          max_tokens,
          timeoutMs,
          signal
        )
      }
    })
  }

  async streamChat(options = {}) {
    return this._requestWithKeyRotation(async (key) => {
      const {
        messages = [],
        model = this.model,
        temperature = 0.7,
        max_tokens = 2000,
        timeoutMs = 180000,
        signal
      } = options
      if (!model) throw new Error('请先选择或输入模型名称')
      if (this.apiType === 'openai') {
        return this._streamOpenAIApi(
          key,
          messages,
          model,
          temperature,
          max_tokens,
          timeoutMs,
          signal
        )
      }
      return this._streamAnthropicApi(
        key,
        messages,
        model,
        temperature,
        max_tokens,
        timeoutMs,
        signal
      )
    })
  }

  async _callOpenAIApi(
    key,
    messages,
    model,
    temperature,
    max_tokens,
    timeoutMs = 180000,
    signal = null
  ) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    const abortMeta = createRequestAbortController(timeoutMs, signal)
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
        signal: abortMeta.signal
      })
    } catch (error) {
      abortMeta.cleanup()
      if (error?.name === 'AbortError') {
        throw createAbortError(abortMessageFor(abortMeta, timeoutMs), abortMeta.externallyAborted)
      }
      throw error
    }
    if (!response.ok) {
      try {
        const error = await response
          .json()
          .catch(() => ({ error: { message: response.statusText } }))
        const msg = error.error?.message || `API 请求失败: ${response.status}`
        if (response.status === 401 || response.status === 403) throw new Error(msg)
        throw new Error(msg)
      } finally {
        abortMeta.cleanup()
      }
    }
    try {
      const data = await response.json()
      return {
        success: true,
        content: data.choices[0]?.message?.content || '',
        images: [],
        usage: data.usage || {},
        model,
        providerId: '',
        error: ''
      }
    } finally {
      abortMeta.cleanup()
    }
  }

  async _streamOpenAIApi(
    key,
    messages,
    model,
    temperature,
    max_tokens,
    timeoutMs = 180000,
    signal = null
  ) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    const abortMeta = createRequestAbortController(timeoutMs, signal)
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
        signal: abortMeta.signal
      })
    } catch (error) {
      abortMeta.cleanup()
      if (error?.name === 'AbortError') {
        throw createAbortError(abortMessageFor(abortMeta, timeoutMs), abortMeta.externallyAborted)
      }
      throw error
    }
    if (!response.ok) {
      abortMeta.cleanup()
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      const msg = error.error?.message || `API 请求失败: ${response.status}`
      if (response.status === 401 || response.status === 403) throw new Error(msg)
      throw new Error(msg)
    }
    return createSseStream(response, abortMeta, (data) => {
      if (data === '[DONE]') return { done: true }
      const json = JSON.parse(data)
      const content = json.choices?.[0]?.delta?.content || ''
      return {
        content,
        done: false,
        usage: json.usage || {},
        model,
        providerId: ''
      }
    })
  }

  async _callAnthropicApi(
    key,
    messages,
    model,
    temperature,
    max_tokens,
    timeoutMs = 180000,
    signal = null
  ) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/messages`
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }))
    if (messages[0]?.role === 'system') {
      anthropicMessages.unshift({ role: 'user', content: `系统指令：${messages[0].content}` })
    }
    const abortMeta = createRequestAbortController(timeoutMs, signal)
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          messages: anthropicMessages.slice(-20),
          temperature,
          max_tokens
        }),
        signal: abortMeta.signal
      })
    } catch (error) {
      abortMeta.cleanup()
      if (error?.name === 'AbortError') {
        throw createAbortError(abortMessageFor(abortMeta, timeoutMs), abortMeta.externallyAborted)
      }
      throw error
    }
    if (!response.ok) {
      try {
        const error = await response
          .json()
          .catch(() => ({ error: { message: response.statusText } }))
        const msg = error.error?.message || `API 请求失败: ${response.status}`
        if (response.status === 401 || response.status === 403) throw new Error(msg)
        throw new Error(msg)
      } finally {
        abortMeta.cleanup()
      }
    }
    try {
      const data = await response.json()
      return {
        success: true,
        content: data.content?.[0]?.text || '',
        images: [],
        usage: data.usage || {},
        model,
        providerId: '',
        error: ''
      }
    } finally {
      abortMeta.cleanup()
    }
  }

  async _streamAnthropicApi(
    key,
    messages,
    model,
    temperature,
    max_tokens,
    timeoutMs = 180000,
    signal = null
  ) {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/messages`
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }))
    if (messages[0]?.role === 'system') {
      anthropicMessages.unshift({ role: 'user', content: `系统指令：${messages[0].content}` })
    }
    const abortMeta = createRequestAbortController(timeoutMs, signal)
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          messages: anthropicMessages.slice(-20),
          temperature,
          max_tokens,
          stream: true
        }),
        signal: abortMeta.signal
      })
    } catch (error) {
      abortMeta.cleanup()
      if (error?.name === 'AbortError') {
        throw createAbortError(abortMessageFor(abortMeta, timeoutMs), abortMeta.externallyAborted)
      }
      throw error
    }
    if (!response.ok) {
      abortMeta.cleanup()
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      const msg = error.error?.message || `API 请求失败: ${response.status}`
      if (response.status === 401 || response.status === 403) throw new Error(msg)
      throw new Error(msg)
    }
    return createSseStream(response, abortMeta, (data) => {
      const json = JSON.parse(data)
      const content = json.type === 'content_block_delta' ? json.delta?.text || '' : ''
      return {
        content,
        done: json.type === 'message_stop',
        usage: json.usage || json.message?.usage || {},
        model,
        providerId: ''
      }
    })
  }

  async testModel(modelName) {
    if (!this.apiKeys.length || !this.baseUrl) {
      return { success: false, message: '请先填写 API 地址和 Key' }
    }
    if (!modelName) {
      return { success: false, message: '请指定要测试的模型' }
    }
    const startIndex = this._currentKeyIndex
    let lastError = null
    let tried = 0
    do {
      tried++
      const key = this._getCurrentKey()
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        try {
          let response
          if (this.apiType === 'openai') {
            response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({
                model: modelName,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10,
                temperature: 0
              }),
              signal: controller.signal
            })
          } else {
            response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: modelName,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10,
                temperature: 0
              }),
              signal: controller.signal
            })
          }
          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: { message: response.statusText } }))
            const msg = error.error?.message || `请求失败: ${response.status}`
            if (response.status === 401 || response.status === 403) {
              lastError = new Error(msg)
              if (this._advanceKey()) continue
              break
            }
            return { success: false, message: msg }
          }
          return { success: true, message: '模型测试成功' }
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          return { success: false, message: '测试超时（30秒），请检查网络或模型是否可用' }
        }
        lastError = error
        const msg = error.message || ''
        if (
          msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('Invalid') ||
          msg.includes('Key')
        ) {
          if (this._advanceKey()) continue
          break
        }
        return { success: false, message: msg }
      }
    } while (this._currentKeyIndex !== startIndex && tried < this.apiKeys.length)
    return { success: false, message: lastError?.message || '所有 Key 均不可用' }
  }

  async validateApiKey() {
    if (!this.apiKeys.length || !this.baseUrl) {
      return { isValid: false, message: '请先填写 API 地址和 Key' }
    }
    const modelsResult = await this.listModels()
    if (modelsResult.success) {
      return { isValid: true, models: modelsResult.models }
    }
    return { isValid: false, message: modelsResult.message }
  }
}

export default new CustomTextApiService()

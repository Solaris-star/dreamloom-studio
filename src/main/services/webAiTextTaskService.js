import { chatWithTextProvider } from './textGenerationRouter.js'

const DEFAULT_TIMEOUT_MS = 180000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 300000
const MAX_MESSAGE_COUNT = 100

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null
  const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user'
  const content = String(message.content ?? '').trim()
  return content ? { role, content } : null
}

export function buildWebAiTextTaskMessages(payload = {}) {
  if (Array.isArray(payload.messages)) {
    const messages = payload.messages.slice(0, MAX_MESSAGE_COUNT).map(normalizeMessage).filter(Boolean)
    if (messages.length) return messages
  }

  const systemPrompt = String(payload.systemPrompt ?? '').trim()
  const instruction = String(payload.instruction ?? '').trim()
  const content = String(payload.content ?? payload.text ?? '').trim()
  if (!content) throw new Error('AI 文本任务内容不能为空')

  const messages = []
  const systemContent = [systemPrompt, instruction].filter(Boolean).join('\n\n')
  if (systemContent) messages.push({ role: 'system', content: systemContent })
  messages.push({ role: 'user', content })
  return messages
}

function normalizeTimeoutMs(value) {
  const timeout = Number(value)
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.floor(timeout), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function publicErrorMessage(error) {
  if (error?.name === 'AbortError') return error.message || 'AI 请求已停止'
  const message = String(error?.message || '').trim()
  return message || 'AI 文本请求失败'
}

export async function runWebAiTextTask(store, payload = {}, dependencies = {}) {
  const chat = dependencies.chat || chatWithTextProvider
  const timeoutMs = normalizeTimeoutMs(payload.timeoutMs)
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const messages = buildWebAiTextTaskMessages(payload)
    const result = await chat(store, {
      ...payload,
      messages,
      maxTokens: payload.maxTokens ?? payload.max_tokens,
      signal: controller.signal,
      timeoutMs
    })
    if (result?.success === false) {
      throw new Error(result.message || result.error || 'AI 文本请求失败')
    }
    const content = String(result?.content ?? result?.text ?? '').trim()
    if (!content) throw new Error('AI 返回内容为空，请重试')
    return {
      success: true,
      content,
      providerId: String(result.providerId || ''),
      model: String(result.model || ''),
      usage: result.usage && typeof result.usage === 'object' ? result.usage : {}
    }
  } catch (error) {
    if (timedOut || controller.signal.aborted) {
      return { success: false, message: `AI 请求超时（${Math.round(timeoutMs / 1000)} 秒）` }
    }
    return { success: false, message: publicErrorMessage(error) }
  } finally {
    clearTimeout(timeoutId)
  }
}

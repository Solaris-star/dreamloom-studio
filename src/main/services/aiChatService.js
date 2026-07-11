import { buildBookWritingContextBlock } from './bookWritingContext.js'

const DEFAULT_SYSTEM_PROMPT = '你是一位专业的小说创作顾问。帮助作者解决创作难题，提供灵感和建议。'

export async function sendChatMessage({
  bookPath,
  messages,
  chapterContent,
  textProvider,
  systemPreset
} = {}) {
  if (!textProvider?.chat) {
    throw new Error('文本 AI 服务不可用')
  }

  const recentMessages = Array.isArray(messages)
    ? messages
        .slice(-20)
        .map((message) => ({
          role: message?.role === 'assistant' ? 'assistant' : 'user',
          content: String(message?.content || '').trim()
        }))
        .filter((message) => message.content)
    : []
  if (!recentMessages.length || recentMessages.at(-1)?.role !== 'user') {
    throw new Error('请输入要发送的消息')
  }

  const systemParts = [systemPreset?.systemPrompt || DEFAULT_SYSTEM_PROMPT]

  if (bookPath) {
    try {
      const bookContext = await buildBookWritingContextBlock(bookPath, {
        outlineContent: chapterContent
      })
      if (bookContext) {
        systemParts.push(bookContext)
      }
    } catch {
      // 读取书籍上下文失败时仍允许继续对话
    }
  }

  const systemMessage = { role: 'system', content: systemParts.join('\n\n') }

  const allMessages = [systemMessage, ...recentMessages]

  const modelParams = {
    temperature: systemPreset?.modelParams?.temperature ?? 0.7,
    max_tokens: systemPreset?.modelParams?.maxTokens ?? 2000,
    topP: systemPreset?.modelParams?.topP
  }

  const result = await textProvider.chat({ messages: allMessages, ...modelParams })
  const content = String(result.content || '').trim()
  const images = Array.isArray(result.images) ? result.images.filter(Boolean) : []

  if (!content && images.length === 0) {
    throw new Error('AI 返回内容为空，请重试')
  }

  return {
    success: true,
    content,
    usage: result.usage,
    images,
    model: result.model || '',
    providerId: result.providerId || '',
    error: ''
  }
}

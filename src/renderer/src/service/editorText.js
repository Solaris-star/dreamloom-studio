import {
  countTextWords,
  responseProviderMeta,
  runWebAiTextTask
} from './webAiTextClient.js'

function requireAiTextResult(result, fallback = 'AI 生成失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文`)
  }
  if (!Number.isFinite(Number(result.wordCount)) || Number(result.wordCount) <= 0) {
    throw new Error(`${fallback}：接口没有返回有效字数`)
  }
  return { ...result, content }
}

function requireContinueAiResult(result, maxAddWords, fallback = 'AI 续写失败') {
  const ok = requireAiTextResult(result, fallback)
  const returnedMax = Number(ok.maxAddWords)
  if (!Number.isFinite(returnedMax) || returnedMax <= 0) {
    throw new Error(`${fallback}：接口没有返回可续写字数`)
  }
  if (Math.abs(returnedMax - Number(maxAddWords || 0)) > 0) {
    throw new Error(`${fallback}：接口返回的可续写字数不匹配`)
  }
  if (Number(ok.wordCount) > Math.floor(Number(maxAddWords || 0) * 1.2)) {
    throw new Error(fallback)
  }
  return ok
}

export async function continueWriteWithAI(payload, options = {}) {
  const sourceText = String(payload?.text || payload?.content || '').trim()
  if (!sourceText) throw new Error('请先写一些正文，或打开已有章节后再续写')
  const limit = Number(payload?.maxAddWords) > 0 ? Math.floor(Number(payload.maxAddWords)) : 800
  const result = await runWebAiTextTask(
    payload || {},
    {
      task: 'continue',
      feature: 'ai_continue',
      title: '编辑器 AI 续写',
      content: sourceText,
      instruction: [
        String(payload?.prompt || '').trim() || '承接当前章节继续写。',
        `只输出新增正文，不要重复原文。新增内容控制在 ${limit} 字以内。`
      ].join('\n'),
      maxTokens: Math.min(Math.max(limit * 2, 800), 3200)
    },
    { fallback: options.fallback || 'AI 续写失败' }
  )
  const meta = responseProviderMeta(result.response, result.modelPayload)
  return requireContinueAiResult(
    {
      success: true,
      content: result.content,
      inputWordCount: countTextWords(sourceText),
      wordCount: countTextWords(result.content),
      maxAddWords: limit,
      usage: result.response?.usage || {},
      ...meta
    },
    limit,
    options.fallback || 'AI 续写失败'
  )
}

export async function polishTextWithAI(text, fallback = 'AI 润色失败') {
  const payload = text && typeof text === 'object' ? text : { text }
  const content = String(payload.text || payload.content || '').trim()
  if (!content) throw new Error('请先输入或选择需要润色的正文')
  const result = await runWebAiTextTask(
    payload,
    {
      task: 'polish',
      feature: 'ai_polish',
      title: '编辑器 AI 润色',
      content,
      instruction:
        '请在保留剧情、人物语气和原有信息的前提下润色这段小说正文。只返回润色后的正文，不要解释。'
    },
    { fallback }
  )
  const meta = responseProviderMeta(result.response, result.modelPayload)
  return requireAiTextResult({
    success: true,
    content: result.content,
    inputWordCount: countTextWords(content),
    wordCount: countTextWords(result.content),
    usage: result.response?.usage || {},
    ...meta
  }, fallback)
}

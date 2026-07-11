import { postJson } from './webHttpClient.js'

function requireGeneratedChapterResult(result, expected = {}) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || '章节生成失败')
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error('AI 没有返回正文')
  }
  if (!Number.isFinite(Number(result.wordCount)) || Number(result.wordCount) <= 0) {
    throw new Error('章节生成失败：接口没有返回有效字数')
  }
  if (
    Number.isFinite(Number(result.targetWords)) &&
    Number.isFinite(Number(expected.targetWords)) &&
    Number(result.targetWords) !== Number(expected.targetWords)
  ) {
    throw new Error('章节生成失败：接口返回的目标字数不匹配')
  }
  return { ...result, content }
}

export async function generateChapterFromOutline(payload, expected = {}) {
  return requireGeneratedChapterResult(
    await postJson('/api/ai/generate-chapter-from-outline', payload, { timeoutMs: 120_000 }),
    expected
  )
}

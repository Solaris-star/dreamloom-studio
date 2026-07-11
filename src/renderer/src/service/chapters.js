import { postJson } from './webHttpClient.js'

function requireSuccess(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || fallback)
  }
  return result
}

export async function createChapter(bookName, volumeId) {
  const result = requireSuccess(
    await postJson('/api/chapters/create', { bookName, volumeId }),
    '创建章节失败'
  )
  if (typeof result.chapterName !== 'string' || !result.chapterName.trim()) {
    throw new Error('创建章节失败：接口返回格式不正确')
  }
  return result
}

export async function saveChapter(chapterInfo) {
  return requireSuccess(await postJson('/api/chapters/save', chapterInfo), '保存章节失败')
}

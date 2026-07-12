import { plainTextToEditorParagraphs } from './editorTextFormat.js'

export function createChapterVersionContent(text) {
  return plainTextToEditorParagraphs(String(text ?? '')) || '<p></p>'
}

export async function restoreChapterVersion({
  expectedChapterId,
  getCurrentChapterId,
  currentContent,
  restoredContent,
  createBackup,
  applyContent,
  persistContent
}) {
  if (!expectedChapterId || getCurrentChapterId() !== expectedChapterId) {
    throw new Error('当前章节已经变化，已取消恢复')
  }

  await createBackup(currentContent)
  if (getCurrentChapterId() !== expectedChapterId) {
    throw new Error('当前章节已经变化，已取消恢复')
  }

  applyContent(restoredContent)
  try {
    const saved = await persistContent()
    if (!saved) throw new Error('恢复内容保存失败')
  } catch (error) {
    applyContent(currentContent)
    throw error
  }

  return true
}

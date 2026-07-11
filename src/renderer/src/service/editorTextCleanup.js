function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildParagraphDiff(originalText, resultText) {
  const before = splitParagraphs(originalText)
  const after = splitParagraphs(resultText)
  const rows = Array.from({ length: before.length + 1 }, () =>
    Array(after.length + 1).fill(0)
  )
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      rows[i][j] =
        before[i] === after[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    }
  }

  const changes = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      changes.push({ type: 'unchanged', before: before[i], after: after[j] })
      i += 1
      j += 1
    } else if (i < before.length && j < after.length && rows[i + 1][j] === rows[i][j + 1]) {
      changes.push({ type: 'changed', before: before[i], after: after[j] })
      i += 1
      j += 1
    } else if (j < after.length && (i >= before.length || rows[i][j + 1] > rows[i + 1][j])) {
      changes.push({ type: 'added', before: '', after: after[j] })
      j += 1
    } else {
      changes.push({ type: 'removed', before: before[i], after: '' })
      i += 1
    }
  }
  return changes
}

export async function cleanEditorText(text) {
  const content = String(text || '').trim()
  if (!content) throw new Error('待清理内容不能为空')
  const api = globalThis.window?.electron?.cleanGarbageTextWithAI
  if (typeof api !== 'function') throw new Error('当前环境不支持 AI 清理乱码')
  const result = await api({ text: content })
  if (result?.success !== true) throw new Error(result?.message || 'AI 清理失败')
  const cleaned = String(result.content || '').trim()
  if (!cleaned) throw new Error('AI 返回空内容，已保留原文')
  return {
    ...result,
    content: cleaned,
    diff: buildParagraphDiff(content, cleaned)
  }
}

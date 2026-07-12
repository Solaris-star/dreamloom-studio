const RECOVERY_DRAFT_PREFIX = 'dreamloom:editor-recovery-draft:'

export function getEditorRecoveryDraftKey(bookName, filePath) {
  return `${RECOVERY_DRAFT_PREFIX}${encodeURIComponent(bookName || '')}:${encodeURIComponent(filePath || '')}`
}

export function writeEditorRecoveryDraft(storage, draft) {
  if (!storage || !draft?.filePath || typeof draft.content !== 'string') return false
  try {
    storage.setItem(
      getEditorRecoveryDraftKey(draft.bookName, draft.filePath),
      JSON.stringify({ ...draft, savedAt: Date.now() })
    )
    return true
  } catch {
    return false
  }
}

export function readEditorRecoveryDraft(storage, bookName, filePath) {
  if (!storage || !filePath) return null
  const key = getEditorRecoveryDraftKey(bookName, filePath)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw)
    return draft && typeof draft.content === 'string' ? draft : null
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // 浏览器拒绝访问存储时，保留编辑器中的正文。
    }
    return null
  }
}

export function removeEditorRecoveryDraft(
  storage,
  bookName,
  filePath,
  expectedContent
) {
  if (!storage || !filePath) return false
  if (typeof expectedContent === 'string') {
    const draft = readEditorRecoveryDraft(storage, bookName, filePath)
    if (!draft || draft.content !== expectedContent) return false
  }
  try {
    storage.removeItem(getEditorRecoveryDraftKey(bookName, filePath))
    return true
  } catch {
    return false
  }
}

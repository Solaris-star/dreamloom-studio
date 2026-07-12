export function toggleEditorSelectionMark(editor, markType) {
  if (!editor) return false
  const commandName = markType === 'bold' ? 'toggleBold' : markType === 'italic' ? 'toggleItalic' : ''
  if (!commandName || typeof editor.chain !== 'function') return false
  const chain = editor.chain().focus()
  if (typeof chain[commandName] !== 'function') return false
  return chain[commandName]().run() === true
}

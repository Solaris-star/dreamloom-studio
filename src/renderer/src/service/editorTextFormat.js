export function escapeEditorHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function plainTextToEditorParagraphs(text) {
  if (!text) return ''
  return String(text)
    .split('\n')
    .map((line) => {
      const escaped = escapeEditorHtml(line)
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
        .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
      return escaped ? `<p>${escaped}</p>` : ''
    })
    .join('')
}

export function bookImageUrl(bookName, fileName) {
  const book = String(bookName || '').trim()
  const file = String(fileName || '').trim()
  if (!book || !file) return ''
  if (/^(?:https?:|data:|blob:)/i.test(file)) return file
  if (/^(?:file:|[a-z]:[\\/]|\\\\|\/)/i.test(file)) return ''
  const params = new URLSearchParams({ book, file })
  return `/api/books/image?${params.toString()}`
}

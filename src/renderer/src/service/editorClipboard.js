import { DOMSerializer } from '@tiptap/pm/model'

export function resolveEditorCopyRange(state) {
  const selection = state?.selection
  const doc = state?.doc
  if (!selection || !doc) return { from: 0, to: 0, hasSelection: false }
  if (!selection.empty) {
    return { from: selection.from, to: selection.to, hasSelection: true }
  }
  return { from: 0, to: doc.content.size, hasSelection: false }
}

export function getEditorCopyText(state) {
  const { from, to } = resolveEditorCopyRange(state)
  if (!state?.doc || to <= from) return ''
  return state.doc.textBetween(from, to, '\n\n')
}

export function getEditorCopyHtml(editor) {
  const state = editor?.state
  if (!state?.doc) return ''
  const { from, to, hasSelection } = resolveEditorCopyRange(state)
  if (!hasSelection) return editor.getHTML()

  const ownerDocument = editor.view?.dom?.ownerDocument
  if (!ownerDocument) throw new Error('当前浏览器无法生成富文本内容')
  const container = ownerDocument.createElement('div')
  const fragment = DOMSerializer.fromSchema(state.schema).serializeFragment(
    state.doc.slice(from, to).content,
    { document: ownerDocument }
  )
  container.appendChild(fragment)
  return container.innerHTML
}

export async function writePlainTextToClipboard(text, clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.writeText !== 'function') {
    throw new Error('当前浏览器不支持剪贴板写入')
  }
  await clipboard.writeText(String(text || ''))
}

export async function writeRichTextToClipboard(
  { text, html },
  {
    clipboard = globalThis.navigator?.clipboard,
    ClipboardItemClass = globalThis.ClipboardItem,
    BlobClass = globalThis.Blob
  } = {}
) {
  if (
    typeof clipboard?.write !== 'function' ||
    typeof ClipboardItemClass !== 'function' ||
    typeof BlobClass !== 'function'
  ) {
    throw new Error('当前浏览器不支持富文本剪贴板')
  }
  const item = new ClipboardItemClass({
    'text/plain': new BlobClass([String(text || '')], { type: 'text/plain' }),
    'text/html': new BlobClass([String(html || '')], { type: 'text/html' })
  })
  await clipboard.write([item])
}

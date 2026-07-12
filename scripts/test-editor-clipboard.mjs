import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  getEditorCopyHtml,
  getEditorCopyText,
  resolveEditorCopyRange,
  writePlainTextToClipboard,
  writeRichTextToClipboard
} from '../src/renderer/src/service/editorClipboard.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {}
  }
})
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, schema.text('第一段')),
  schema.node('paragraph', null, schema.text('第二段'))
])
const fullState = { doc, selection: TextSelection.create(doc, 1) }
assert.deepEqual(resolveEditorCopyRange(fullState), {
  from: 0,
  to: doc.content.size,
  hasSelection: false
})
assert.equal(getEditorCopyText(fullState), '第一段\n\n第二段')

const selectedState = { doc, selection: TextSelection.create(doc, 1, 4) }
assert.deepEqual(resolveEditorCopyRange(selectedState), { from: 1, to: 4, hasSelection: true })
assert.equal(getEditorCopyText(selectedState), '第一段')
assert.equal(getEditorCopyText({ doc, selection: TextSelection.create(doc, 2, 7) }), '一段\n\n第')
assert.equal(getEditorCopyText(null), '')

assert.equal(
  getEditorCopyHtml({
    state: fullState,
    getHTML: () => '<p>第一段</p><p>第二段</p>'
  }),
  '<p>第一段</p><p>第二段</p>'
)
assert.throws(
  () => getEditorCopyHtml({ state: selectedState, view: {} }),
  /无法生成富文本内容/
)

const plainWrites = []
await writePlainTextToClipboard('正文', {
  writeText: async (text) => plainWrites.push(text)
})
assert.deepEqual(plainWrites, ['正文'])
await assert.rejects(() => writePlainTextToClipboard('正文', {}), /不支持剪贴板写入/)

const richWrites = []
class FakeClipboardItem {
  constructor(parts) {
    this.parts = parts
  }
}
await writeRichTextToClipboard(
  { text: '正文', html: '<p>正文</p>' },
  {
    clipboard: { write: async (items) => richWrites.push(items) },
    ClipboardItemClass: FakeClipboardItem,
    BlobClass: Blob
  }
)
assert.equal(richWrites[0][0].parts['text/plain'].type, 'text/plain')
assert.equal(richWrites[0][0].parts['text/html'].type, 'text/html')
await assert.rejects(
  () => writeRichTextToClipboard({ text: '正文', html: '<p>正文</p>' }, { clipboard: {} }),
  /不支持富文本剪贴板/
)

console.log('editor clipboard tests passed')

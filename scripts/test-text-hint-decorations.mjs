import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import {
  createTextHintDecorations,
  findTextRanges,
  normalizeHintColor
} from '../src/renderer/src/extensions/TextHintDecorations.js'
import {
  escapeEditorHtml,
  plainTextToEditorParagraphs
} from '../src/renderer/src/service/editorTextFormat.js'

assert.deepEqual(findTextRanges('林川看见林川', '林川'), [
  { from: 0, to: 2 },
  { from: 4, to: 6 }
])
assert.deepEqual(findTextRanges('Alice 和 ALICE', 'alice'), [
  { from: 0, to: 5 },
  { from: 8, to: 13 }
])
assert.deepEqual(findTextRanges('人物（甲）登场', '人物（甲）'), [{ from: 0, to: 5 }])
assert.deepEqual(findTextRanges('正文', ''), [])

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {}
  }
})
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, schema.text('林川说：不要剧透。'))
])
const beforeJson = doc.toJSON()
const decorations = createTextHintDecorations(doc, {
  characters: [
    { text: '林川', color: '#ffeeaa' },
    { text: '林川', color: 'red;display:none' }
  ],
  bannedWords: ['剧透']
})
const found = decorations.find()
assert.equal(found.length, 2)
assert.equal(found[0].type.attrs['data-text-hint'], 'character')
assert.equal(found[1].type.attrs['data-text-hint'], 'banned-word')
assert.deepEqual(doc.toJSON(), beforeJson)
assert.equal(normalizeHintColor('red;display:none'), '#fff3a3')
assert.equal(normalizeHintColor('rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)')

assert.equal(escapeEditorHtml('<角色>&"'), '&lt;角色&gt;&amp;&quot;')
assert.equal(
  plainTextToEditorParagraphs('<角色>\n甲  乙'),
  '<p>&lt;角色&gt;</p><p>甲&nbsp;&nbsp;乙</p>'
)

console.log('text hint decoration tests passed')

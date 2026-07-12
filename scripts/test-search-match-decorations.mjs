import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { createSearchMatchDecorations } from '../src/renderer/src/extensions/SearchMatchDecorations.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {}
  }
})
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, schema.text('星河落入星河'))
])
const before = doc.toJSON()
const decorations = createSearchMatchDecorations(
  doc,
  [
    { from: 1, to: 3 },
    { from: 5, to: 7 },
    { from: -1, to: 2 },
    { from: 2, to: 99 }
  ],
  1
).find()

assert.equal(decorations.length, 2)
assert.equal(decorations[0].type.attrs.class, 'search-match')
assert.equal(decorations[1].type.attrs.class, 'search-match-current')
assert.deepEqual(doc.toJSON(), before)

console.log('search match decoration tests passed')

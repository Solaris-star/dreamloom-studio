import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import {
  collectTextHintMatches,
  createTextHintDecorations,
  findTextRanges,
  normalizeHintColor,
  softCharacterColor
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
assert.deepEqual(findTextRanges('“林川、林川……”', '林川'), [
  { from: 1, to: 3 },
  { from: 4, to: 6 }
])
assert.deepEqual(findTextRanges('正文', ''), [])

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {}
  }
})
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, schema.text('林川说：不要剧透。林川又来了。'))
])
const beforeJson = doc.toJSON()
const decorations = createTextHintDecorations(doc, {
  characters: [
    { text: '林川', color: '#ffeeaa' },
    { text: '林川', color: 'red;display:none' }
  ],
  bannedWords: ['剧透', ' 剧透 ', 'SPOILER']
})
const found = decorations.find()
assert.equal(found.length, 3)
const kinds = found.map((item) => item.type.attrs['data-text-hint'])
assert.deepEqual(kinds, ['character', 'banned-word', 'character'])
const banned = found.find((item) => item.type.attrs['data-text-hint'] === 'banned-word')
assert.ok(banned)
assert.equal(banned.type.attrs.title.includes('剧透'), true)
assert.equal(banned.type.attrs['aria-label'].includes('剧透'), true)
assert.deepEqual(doc.toJSON(), beforeJson)
assert.equal(normalizeHintColor('red;display:none'), '#f3e2a8')
assert.equal(normalizeHintColor('rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)')
assert.match(softCharacterColor('#FF4D4F'), /^#[0-9a-f]{6}$/i)

const matches = collectTextHintMatches(doc, {
  characters: [{ text: '林川', color: '#1890FF' }],
  bannedWords: ['剧透']
})
assert.equal(matches.characters.length, 2)
assert.equal(matches.bannedWords.length, 1)

// 关闭配置后应清空装饰
const empty = createTextHintDecorations(doc, { characters: [], bannedWords: [] }).find()
assert.equal(empty.length, 0)

// 长文档性能：大量禁词也不应爆炸（仅验证可完成）
const longText = '甲乙丙丁戊己庚辛壬癸'.repeat(5000)
const longDoc = schema.node('doc', null, [schema.node('paragraph', null, schema.text(longText))])
const manyBanned = Array.from({ length: 80 }, (_, i) => `词${i}`)
const started = Date.now()
const longDecorations = createTextHintDecorations(longDoc, {
  characters: [{ text: '甲乙', color: '#cfe8d5' }],
  bannedWords: manyBanned
})
assert.ok(longDecorations.find().length >= 1)
assert.ok(Date.now() - started < 2000)

assert.equal(escapeEditorHtml('<角色>&"'), '&lt;角色&gt;&amp;&quot;')
assert.equal(
  plainTextToEditorParagraphs('<角色>\n甲  乙'),
  '<p>&lt;角色&gt;</p><p>甲&nbsp;&nbsp;乙</p>'
)

console.log('text hint decoration tests passed')

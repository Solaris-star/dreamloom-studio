import assert from 'node:assert/strict'
import { buildParagraphDiff, cleanEditorText } from '../src/renderer/src/service/editorTextCleanup.js'

assert.deepEqual(buildParagraphDiff('第一段\n\n第二段', '第一段\n\n修正段'), [
  { type: 'unchanged', before: '第一段', after: '第一段' },
  { type: 'changed', before: '第二段', after: '修正段' }
])
assert.deepEqual(buildParagraphDiff('保留\n\n删除', '保留'), [
  { type: 'unchanged', before: '保留', after: '保留' },
  { type: 'removed', before: '删除', after: '' }
])

globalThis.window = {
  electron: {
    async cleanGarbageTextWithAI(payload) {
      assert.deepEqual(payload, { text: '原文' })
      return { success: true, content: '原文修正' }
    }
  }
}
const result = await cleanEditorText('原文')
assert.equal(result.content, '原文修正')
assert.equal(result.diff[0].type, 'changed')

globalThis.window.electron.cleanGarbageTextWithAI = async () => ({
  success: true,
  content: ''
})
await assert.rejects(() => cleanEditorText('原文'), /空内容/)
console.log('editor text cleanup tests passed')

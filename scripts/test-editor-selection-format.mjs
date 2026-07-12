import assert from 'node:assert/strict'
import { toggleEditorSelectionMark } from '../src/renderer/src/service/editorSelectionFormat.js'

function createEditor(runResult = true) {
  const calls = []
  const chain = {
    focus() {
      calls.push('focus')
      return chain
    },
    toggleBold() {
      calls.push('toggleBold')
      return chain
    },
    toggleItalic() {
      calls.push('toggleItalic')
      return chain
    },
    run() {
      calls.push('run')
      return runResult
    }
  }
  return { editor: { chain: () => chain }, calls }
}

const bold = createEditor()
assert.equal(toggleEditorSelectionMark(bold.editor, 'bold'), true)
assert.deepEqual(bold.calls, ['focus', 'toggleBold', 'run'])

const italic = createEditor(false)
assert.equal(toggleEditorSelectionMark(italic.editor, 'italic'), false)
assert.deepEqual(italic.calls, ['focus', 'toggleItalic', 'run'])

assert.equal(toggleEditorSelectionMark(null, 'bold'), false)
assert.equal(toggleEditorSelectionMark({ chain: () => ({ focus: () => ({}) }) }, 'unknown'), false)

console.log('editor selection format tests passed')

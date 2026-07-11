import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const runnerPath = pathToFileURL(join(root, 'src/main/services/writingAgentRunner.js')).href
const { listInstalledWritingSkills, runWritingSkill } = await import(runnerPath)

const installed = listInstalledWritingSkills()
assert.equal(installed.success, true)
assert.ok(installed.skills.some((skill) => skill.id === 'story-long-write'))
assert.ok(
  installed.skills.some((skill) => skill.id === 'story-deslop' && skill.source === 'external')
)
assert.ok(
  installed.groups.some((group) => group.items.some((skill) => skill.id === 'story-review'))
)

await assert.rejects(
  () => runWritingSkill({ skillId: 'missing-skill' }),
  /未找到可执行的 writing skill/,
  'runner should not fall back when the requested skill is missing'
)

let previewWriteCalled = false
const preview = await runWritingSkill(
  {
    skillId: 'story-deslop',
    outputMode: 'preview',
    instruction: '处理这段文字。',
    selectedText: '他深吸一口气，眼中闪过一丝复杂。'
  },
  {
    writeChapter: async () => {
      previewWriteCalled = true
      return { success: true }
    }
  }
)

assert.equal(preview.success, true)
assert.equal(preview.mode, 'preview')
assert.equal(preview.skill.id, 'story-deslop')
assert.equal(preview.payload.skillId, 'story-deslop')
assert.equal(preview.payload.skillKey, 'deslop')
assert.equal(preview.payload.outputMode, 'preview')
assert.equal(preview.payload.canWriteChapter, false)
assert.deepEqual(preview.payload.inputScopes, ['selected_text'])
assert.equal(previewWriteCalled, false)

await assert.rejects(
  () => runWritingSkill({ skillId: 'story-review', outputMode: 'chapter_write' }),
  /不能写入正文/,
  'preview skills should reject chapter writes'
)

let capturedWriteInput = null
const chapterWrite = await runWritingSkill(
  {
    skillId: 'story-long-write',
    outputMode: 'chapter_write',
    booksDir: join(root, '.tmp-books'),
    bookName: '测试作品',
    volumeName: '第一卷',
    chapterName: '第 1 章',
    prompt: '继续写这一章。',
    targetWords: 800
  },
  {
    writeChapter: async (input) => {
      capturedWriteInput = input
      return {
        success: true,
        generationId: 'generation-1',
        chapterName: input.chapterName
      }
    }
  }
)

assert.ok(capturedWriteInput, 'chapter write skill should call the injected writer')
assert.equal(capturedWriteInput.skillId, 'story-long-write')
assert.equal(capturedWriteInput.skillKey, 'continue')
assert.equal(capturedWriteInput.outputMode, 'chapter_write')
assert.equal(capturedWriteInput.canWriteChapter, true)
assert.deepEqual(capturedWriteInput.references, [
  'skills/story-long-write',
  'agents/writer',
  'agents/editor',
  'hooks/chapter-write-guard'
])
assert.equal(chapterWrite.success, true)
assert.equal(chapterWrite.mode, 'chapter_write')
assert.equal(chapterWrite.skillId, 'story-long-write')
assert.equal(chapterWrite.skillKey, 'continue')
assert.equal(chapterWrite.canWriteChapter, true)
assert.equal(chapterWrite.chapterName, '第 1 章')

console.log('writing agent runner behavior tests passed')

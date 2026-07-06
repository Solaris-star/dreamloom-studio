import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const root = process.cwd()
const registryPath = pathToFileURL(join(root, 'src/main/services/writingSkillRegistry.js')).href
const {
  getWritingSkill,
  groupWritingSkills,
  listWritingSkills,
  normalizeWritingSkill
} = await import(registryPath)

const workspaceSkills = listWritingSkills()
const workspaceDeslop = workspaceSkills.find((skill) => skill.id === 'story-deslop')
assert.equal(workspaceDeslop?.source, 'external')
assert.ok(workspaceDeslop.sourcePath.endsWith(join('resources', 'writing-skills', 'story-deslop', 'skill.json')))
assert.deepEqual(workspaceDeslop.references, ['resources/writing-skills/story-deslop/SKILL.md'])
assert.equal(workspaceDeslop.label, '去 AI 味')
assert.equal(getWritingSkill('deslop')?.id, 'story-deslop')

for (const [key, outputMode, canWriteChapter] of [
  ['cheat', 'preview', false],
  ['book_outline', 'preview', false],
  ['polish', 'preview', false],
  ['dialogue', 'preview', false],
  ['extract_world', 'preview', false],
  ['character_card', 'asset', false],
  ['character_image', 'asset', false],
  ['send_asset', 'asset', false],
  ['continue', 'chapter_write', true]
]) {
  const skill = getWritingSkill(key)
  assert.ok(skill, `missing built-in writing skill: ${key}`)
  assert.equal(skill.outputMode, outputMode, `${key} output mode`)
  assert.equal(skill.canWriteChapter, canWriteChapter, `${key} write permission`)
  assert.ok(Array.isArray(skill.inputScopes), `${key} input scopes`)
  assert.ok(Array.isArray(skill.requiredContext), `${key} required context`)
  assert.ok(Array.isArray(skill.references), `${key} references`)
}

const normalizedTitle = normalizeWritingSkill({
  id: 'title-label',
  key: 'title_label',
  title: '标题转名称',
  instruction: '测试 title 字段映射。',
  canWriteChapter: false,
  outputMode: 'preview'
})
assert.equal(normalizedTitle.label, '标题转名称')

const tempRoot = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-writing-skills-'))
const originalWarn = console.warn
const warnings = []
try {
  const skillRoot = join(tempRoot, 'resources', 'writing-skills')
  fs.mkdirSync(join(skillRoot, 'story-review'), { recursive: true })
  fs.writeFileSync(
    join(skillRoot, 'story-review', 'skill.json'),
    JSON.stringify(
      {
        id: 'story-review',
        key: 'setting_check',
        title: '外部审稿',
        category: '审稿',
        description: '外部 skill 覆盖内置审稿。',
        instruction: '请按外部审稿规则检查当前章节。',
        inputScopes: ['current_chapter'],
        requiredContext: ['book_meta'],
        references: ['resources/writing-skills/story-review/SKILL.md'],
        canWriteChapter: false,
        outputMode: 'preview',
        runner: 'editor_preview',
        type: 'external_review'
      },
      null,
      2
    ),
    'utf-8'
  )
  fs.mkdirSync(join(skillRoot, 'bad-json'), { recursive: true })
  fs.writeFileSync(join(skillRoot, 'bad-json', 'skill.json'), '{ this is not json', 'utf-8')

  console.warn = (message) => warnings.push(String(message || ''))
  process.chdir(tempRoot)
  const tempSkills = listWritingSkills()
  const externalReview = tempSkills.find((skill) => skill.id === 'story-review')
  assert.equal(externalReview?.source, 'external')
  assert.equal(externalReview.label, '外部审稿')
  assert.equal(externalReview.type, 'external_review')
  assert.equal(getWritingSkill('setting_check')?.label, '外部审稿')
  assert.equal(tempSkills.filter((skill) => skill.id === 'story-review').length, 1)
  assert.ok(warnings.some((message) => message.includes('bad-json')))
  assert.ok(groupWritingSkills(tempSkills).some((group) => group.name === '审稿'))
} finally {
  console.warn = originalWarn
  process.chdir(root)
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('writing skill registry tests passed')

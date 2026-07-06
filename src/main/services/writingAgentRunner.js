import { resolve } from 'node:path'
import { getWritingSkill, listWritingSkills, groupWritingSkills } from './writingSkillRegistry.js'
import { writeNovelChapter } from './novelCliService.js'

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOutputMode(value = '') {
  const text = cleanText(value)
  return text || 'preview'
}

function publicSkill(skill) {
  return {
    ...skill,
    canWriteChapter: skill.canWriteChapter === true,
    outputMode: normalizeOutputMode(skill.outputMode)
  }
}

function skillExecutionRecord(skill) {
  return {
    skillId: skill.id,
    skillKey: skill.key,
    outputMode: normalizeOutputMode(skill.outputMode),
    canWriteChapter: skill.canWriteChapter === true && skill.outputMode === 'chapter_write',
    inputScopes: Array.isArray(skill.inputScopes) ? skill.inputScopes : [],
    requiredContext: Array.isArray(skill.requiredContext) ? skill.requiredContext : [],
    references: Array.isArray(skill.references) ? skill.references : []
  }
}

export function listInstalledWritingSkills() {
  const skills = listWritingSkills().map(publicSkill)
  return {
    success: true,
    skills,
    groups: groupWritingSkills(skills),
    count: skills.length
  }
}

function resolveSkill(input = {}) {
  const skillId = cleanText(input.skillId || input.skill || input.key || input.type)
  const skill = getWritingSkill(skillId)
  if (!skill) throw new Error(`未找到可执行的 writing skill：${skillId || '未指定'}`)
  return skill
}

function assertPreviewOnly(skill, input = {}) {
  const requestedMode = normalizeOutputMode(input.outputMode || input.executionMode)
  const wantsChapterWrite = requestedMode === 'chapter_write' || requestedMode === 'replace_chapter'
  if (wantsChapterWrite && skill.outputMode !== 'chapter_write') {
    throw new Error(`${skill.label} 是预览类 skill，不能写入正文`)
  }
  if (skill.canWriteChapter !== true && wantsChapterWrite) {
    throw new Error(`${skill.label} 未声明正文写入权限`)
  }
}

function normalizeChapterWriteInput(skill, input = {}) {
  const booksDir = cleanText(input.booksDir)
  const bookName = cleanText(input.bookName || input.book)
  const volumeName = cleanText(input.volumeName || input.volume)
  const chapterName = cleanText(input.chapterName || input.chapter || input.chapterId)
  const prompt = cleanText(input.prompt || input.instruction || skill.instruction)
  if (!booksDir) throw new Error('缺少书库目录')
  if (!bookName) throw new Error('缺少作品名称')
  if (!chapterName) throw new Error('缺少章节名称')
  if (!prompt) throw new Error('缺少写作要求')
  return {
    ...input,
    booksDir: resolve(booksDir),
    bookName,
    volumeName,
    chapterName,
    prompt,
    instruction: prompt,
    ...skillExecutionRecord(skill)
  }
}

function previewResult(skill, input = {}) {
  assertPreviewOnly(skill, input)
  return {
    success: true,
    mode: 'preview',
    skill: publicSkill(skill),
    payload: {
      ...input,
      ...skillExecutionRecord(skill),
      type: input.type || skill.type,
      title: input.title || skill.label,
      instruction: input.instruction || input.prompt || skill.instruction,
      executionMode: 'preview',
      canWriteChapter: false
    }
  }
}

async function runChapterWriteSkill(skill, input = {}, adapters = {}) {
  if (skill.outputMode !== 'chapter_write' || skill.canWriteChapter !== true) {
    throw new Error(`${skill.label} 不能写入正文`)
  }
  const chapterInput = normalizeChapterWriteInput(skill, input)
  const writeChapter = adapters.writeChapter || writeNovelChapter
  const result = await writeChapter(chapterInput)
  return {
    ...result,
    success: result?.success !== false,
    mode: 'chapter_write',
    skill: publicSkill(skill),
    ...skillExecutionRecord(skill)
  }
}

export async function runWritingSkill(input = {}, adapters = {}) {
  const skill = resolveSkill(input)
  const requestedMode = normalizeOutputMode(input.outputMode || input.executionMode || skill.outputMode)

  if (requestedMode === 'preview' || skill.outputMode !== 'chapter_write') {
    return previewResult(skill, input)
  }

  return await runChapterWriteSkill(skill, input, adapters)
}

export default {
  listInstalledWritingSkills,
  runWritingSkill
}

import assert from 'node:assert/strict'
import {
  handleWritingSkillRoute,
  isWritingSkillRoute
} from '../src/main/webApi/writingSkillRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  listSkills: () => ({ success: true, skills: [{ id: 'story-long-write' }] }),
  runSkill: async (payload) => {
    calls.push(payload)
    return { success: true, payload }
  }
}

assert.equal(isWritingSkillRoute('/api/editor-agent/writing-skills'), true)
assert.equal(isWritingSkillRoute('/api/editor-agent/run-writing-skill'), true)
assert.equal(isWritingSkillRoute('/api/editor-agent/unknown'), false)
assert.equal(
  await handleWritingSkillRoute({
    ...common,
    path: '/api/editor-agent/unknown'
  }),
  false
)

assert.equal(
  await handleWritingSkillRoute({
    ...common,
    path: '/api/editor-agent/writing-skills'
  }),
  true
)
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  skills: [{ id: 'story-long-write' }]
})

assert.equal(
  await handleWritingSkillRoute({
    ...common,
    path: '/api/editor-agent/run-writing-skill',
    body: {
      skillId: 'story-long-write',
      booksDir: 'D:\\client-controlled'
    }
  }),
  true
)
assert.deepEqual(calls.at(-1), {
  skillId: 'story-long-write',
  booksDir: 'D:\\books'
})
assert.equal(responses.at(-1)[0].success, true)

for (const failure of [
  () => {
    throw new Error('同步执行失败')
  },
  async () => {
    throw new Error('异步执行失败')
  },
  () => {
    throw '非标准错误'
  }
]) {
  await handleWritingSkillRoute({
    ...common,
    path: '/api/editor-agent/run-writing-skill',
    body: { skillId: 'story-review' },
    runSkill: failure
  })
}

assert.deepEqual(
  responses.slice(-3).map(([payload]) => payload),
  [
    { success: false, message: '同步执行失败' },
    { success: false, message: '异步执行失败' },
    { success: false, message: '非标准错误' }
  ]
)

console.log('写作技能路由测试通过')

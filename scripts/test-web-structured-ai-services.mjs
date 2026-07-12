import assert from 'node:assert/strict'
import { generateChapterFromOutline } from '../src/renderer/src/service/outlineChapter.js'
import {
  evolvePlot,
  regeneratePlotProposal
} from '../src/renderer/src/service/plotEvolution.js'
import {
  applySettingTree,
  generateSettingTree,
  regenerateSettingNode
} from '../src/renderer/src/service/settingTree.js'

const responses = []
const calls = []

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options })
  const response = responses.shift()
  if (response instanceof Error) throw response
  return {
    ok: response?.ok ?? true,
    status: response?.status ?? 200,
    async json() {
      return response?.data
    }
  }
}

function queue(data, options = {}) {
  responses.push({ data, ...options })
}

function lastCall() {
  return calls.at(-1)
}

queue({
  success: true,
  content: ' 雨水沿着斗笠边缘落下。 ',
  wordCount: 12,
  targetWords: 1800
})
const chapter = await generateChapterFromOutline(
  { outlineContent: '主角雨夜入城。', targetWords: 1800 },
  { targetWords: 1800 }
)
assert.equal(chapter.content, '雨水沿着斗笠边缘落下。')
assert.equal(lastCall().url, '/api/ai/generate-chapter-from-outline')
assert.equal(lastCall().options.method, 'POST')
assert.equal(lastCall().options.signal instanceof AbortSignal, true)
assert.deepEqual(JSON.parse(lastCall().options.body), {
  outlineContent: '主角雨夜入城。',
  targetWords: 1800
})

for (const [data, message] of [
  [{ success: true, content: '', wordCount: 1 }, /没有返回正文/],
  [{ success: true, content: '正文', wordCount: 0 }, /有效字数/],
  [
    { success: true, content: '正文', wordCount: 2, targetWords: 2000 },
    /目标字数不匹配/
  ],
  [{ success: false, message: '模型不可用' }, /模型不可用/]
]) {
  queue(data)
  await assert.rejects(
    () => generateChapterFromOutline({}, { targetWords: 1800 }),
    message
  )
}

queue({
  success: true,
  groups: [
    {
      providerId: 'provider-a',
      proposals: [
        { title: '暗线浮现', summary: '旧案线索指向城内。' },
        { title: '  ', summary: '' }
      ]
    },
    { providerId: 'provider-b', error: '服务不可用', proposals: [] }
  ]
})
const groups = await evolvePlot({ outlineContent: '继续查案。' }, '剧情推演失败')
assert.equal(groups.length, 1)
assert.equal(groups[0].proposals.length, 1)
assert.equal(lastCall().url, '/api/plot-evolution/evolve')

for (const [data, message] of [
  [{ success: true, groups: null }, /返回格式不正确/],
  [
    { success: true, groups: [{ error: '所有模型均失败', proposals: [] }] },
    /所有模型均失败/
  ],
  [{ success: true, groups: [{ proposals: [{}] }] }, /剧情推演失败/]
]) {
  queue(data)
  await assert.rejects(() => evolvePlot({}, '剧情推演失败'), message)
}

queue({
  success: true,
  proposal: { title: '', summary: '主角将计就计。' }
})
assert.deepEqual(
  await regeneratePlotProposal({}, '重新生成失败'),
  { title: '', summary: '主角将计就计。' }
)
assert.equal(lastCall().url, '/api/plot-evolution/regenerate')

queue({ success: true, proposal: {} })
await assert.rejects(
  () => regeneratePlotProposal({}, '重新生成失败'),
  /重新生成失败/
)

queue({
  success: true,
  tree: [{ name: '世界规则', children: [] }, { name: '  ' }]
})
const tree = await generateSettingTree({ idea: '灵脉复苏' }, '生成失败')
assert.equal(tree.length, 2)
assert.equal(lastCall().url, '/api/setting-tree/generate')

queue({ success: true, tree: [{ name: '' }] })
await assert.rejects(() => generateSettingTree({}, '设定树为空'), /设定树为空/)

queue({ success: true, node: { name: '灵脉', description: '百年苏醒一次。' } })
assert.equal((await regenerateSettingNode({}, '重新生成失败')).name, '灵脉')
assert.equal(lastCall().url, '/api/setting-tree/regenerate-node')

queue({ success: true, node: null })
await assert.rejects(() => regenerateSettingNode({}, '节点为空'), /节点为空/)

queue({
  success: true,
  settingsPath: 'settings.json',
  categoryCount: 2,
  snapshot: { id: 'snapshot-1' }
})
const applied = await applySettingTree({ mode: 'merge' }, '应用失败')
assert.equal(applied.categoryCount, 2)
assert.equal(lastCall().url, '/api/setting-tree/apply')

for (const data of [
  { success: true, categoryCount: 2, snapshot: { id: 'snapshot-1' } },
  { success: true, settingsPath: 'settings.json', categoryCount: 'invalid', snapshot: { id: '1' } },
  { success: true, settingsPath: 'settings.json', categoryCount: 2, snapshot: {} },
  { success: false, message: '写入失败' }
]) {
  queue(data)
  await assert.rejects(
    () => applySettingTree({}, '应用失败'),
    /应用失败|写入失败/
  )
}

assert.equal(responses.length, 0)
console.log('Web 结构化 AI 服务测试通过')

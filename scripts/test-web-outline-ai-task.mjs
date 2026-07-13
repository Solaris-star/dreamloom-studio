import assert from 'node:assert/strict'

const requests = []
let aiContent = '完善后的大纲'

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  requests.push({ url, payload })
  const data =
    url === '/api/store/get'
      ? { success: true, key: payload.key, value: payload.key === 'editorModelDefaults' ? {} : '' }
      : { success: true, content: aiContent, model: 'outline-model' }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const { parseOutlineSplitResult, runOutlineAiTask } = await import(
  '../src/renderer/src/service/outlineAiTask.js'
)

assert.deepEqual(parseOutlineSplitResult(null), {
  items: [],
  parseError: 'AI 返回内容为空，请重试。'
})
assert.deepEqual(parseOutlineSplitResult('[]').items, [])
assert.match(parseOutlineSplitResult('{}').parseError, /缺少 items 数组/)
assert.match(parseOutlineSplitResult('{"items":[null]}').parseError, /未解析出有效子大纲/)

const refined = await runOutlineAiTask(
  {
    taskType: 'refine',
    sourceContent: '简略大纲',
    nodeTitle: '第一卷',
    mode: 'conflict'
  },
  'refine'
)
assert.equal(refined.content, '完善后的大纲')
assert.equal(requests.at(-1).payload.feature, 'outline_refine')
assert.match(requests.at(-1).payload.instruction, /当前节点标题：第一卷/)
assert.match(requests.at(-1).payload.instruction, /强化冲突/)

for (const [mode, expected] of [
  ['details', '关键细节'],
  ['pacing', '信息释放节奏'],
  ['world', '人物动机'],
  ['unknown', '整体扩写']
]) {
  aiContent = '继续完善后的大纲'
  await runOutlineAiTask(
    {
      taskType: 'refine',
      sourceContent: '简略大纲',
      mode,
      previousDraft: '上一轮内容',
      userInstruction: '保留伏笔'
    },
    'refine'
  )
  assert.match(requests.at(-1).payload.instruction, new RegExp(expected))
  assert.match(requests.at(-1).payload.instruction, /继续修改大纲草稿/)
  assert.match(requests.at(-1).payload.instruction, /用户补充要求：保留伏笔/)
  assert.match(requests.at(-1).payload.instruction, /上一轮草稿/)
}

aiContent = `\`\`\`json
{"items":[{"title":"起因","content":"主角收到密信","summary":"密信出现","goals":"查明来源","conflict":"身份暴露","progression":"前往旧宅","resultHint":"发现暗号"}]}
\`\`\``
const split = await runOutlineAiTask(
  { taskType: 'split', sourceContent: '完整大纲', count: 3, mode: 'chapter' },
  'split'
)
assert.equal(split.items.length, 1)
assert.equal(split.items[0].title, '起因')
assert.equal(split.parseError, '')
assert.equal(requests.at(-1).payload.feature, 'outline_split')
assert.match(requests.at(-1).payload.instruction, /目标段数：3/)

for (const [mode, count, expectedMode, expectedCount] of [
  ['plot', 'invalid', '剧情推进阶段', 3],
  ['conflict', 1, '冲突升级', 2],
  ['timeline', 20, '时间顺序', 12]
]) {
  aiContent =
    '[{"title":"阶段","content":"阶段内容","summary":"","goals":"","conflict":"","progression":"","resultHint":""}]'
  await runOutlineAiTask(
    {
      taskType: 'split',
      sourceContent: '完整大纲',
      mode,
      count,
      previousDraft: '上一轮拆分',
      userInstruction: '保留主线'
    },
    'split'
  )
  assert.match(requests.at(-1).payload.instruction, new RegExp(expectedMode))
  assert.match(requests.at(-1).payload.instruction, new RegExp(`目标段数：${expectedCount}`))
  assert.match(requests.at(-1).payload.instruction, /继续调整拆分草稿/)
  assert.match(requests.at(-1).payload.instruction, /用户补充要求：保留主线/)
}

const fallbackContent = parseOutlineSplitResult(
  '{"items":[{"title":"第二段","summary":"概述","goals":"目标"}]}'
)
assert.match(fallbackContent.items[0].content, /概述：概述/)
assert.match(fallbackContent.items[0].content, /目标：目标/)
const arrayContent = parseOutlineSplitResult(
  '前缀 [{"summary":"概述","conflict":"冲突","progression":"推进","resultHint":"悬念"}] 后缀'
)
assert.equal(arrayContent.items[0].title, '第1段')
assert.match(arrayContent.items[0].content, /冲突：冲突/)
assert.match(arrayContent.items[0].content, /推进：推进/)
assert.match(arrayContent.items[0].content, /结果\/悬念：悬念/)
assert.match(parseOutlineSplitResult('不是 JSON').parseError, /Unexpected token|JSON/)
assert.equal(parseOutlineSplitResult('{"items":[]}').parseError, '未解析出有效子大纲')

await assert.rejects(
  () => runOutlineAiTask({ taskType: 'split', sourceContent: '' }, 'split'),
  /当前大纲内容为空/
)
await assert.rejects(
  () => runOutlineAiTask({ taskType: 'unknown', sourceContent: '内容' }, 'unknown'),
  /不支持的 AI 大纲任务类型/
)
await assert.rejects(
  () => runOutlineAiTask({ taskType: 'refine', sourceContent: '内容' }, 'split', '任务类型不匹配'),
  /任务类型不匹配/
)

console.log('Web 大纲 AI 任务测试通过')

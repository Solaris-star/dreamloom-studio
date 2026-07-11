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

const fallbackContent = parseOutlineSplitResult(
  '{"items":[{"title":"第二段","summary":"概述","goals":"目标"}]}'
)
assert.match(fallbackContent.items[0].content, /概述：概述/)
assert.match(fallbackContent.items[0].content, /目标：目标/)
assert.match(parseOutlineSplitResult('不是 JSON').parseError, /Unexpected token|JSON/)

await assert.rejects(
  () => runOutlineAiTask({ taskType: 'split', sourceContent: '' }, 'split'),
  /当前大纲内容为空/
)
await assert.rejects(
  () => runOutlineAiTask({ taskType: 'unknown', sourceContent: '内容' }, 'unknown'),
  /不支持的 AI 大纲任务类型/
)

console.log('Web 大纲 AI 任务测试通过')

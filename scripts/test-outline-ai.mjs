import assert from 'node:assert/strict'
import outlineAiService from '../src/main/services/outlineAi.js'

function fakeTextService(response) {
  const calls = []
  return {
    calls,
    service: {
      async chat(options) {
        calls.push(options)
        return { content: typeof response === 'function' ? response(options) : response }
      }
    }
  }
}

{
  const controller = new AbortController()
  const fake = fakeTextService('  完善后的正文  ')
  const result = await outlineAiService.refineOutline(
    {
      nodeTitle: '雨夜入城',
      sourceContent: '主角在雨夜进城。',
      previousDraft: '守卫拦住了主角。',
      userInstruction: '保留旧印线索',
      mode: 'conflict',
      modelName: 'outline-model',
      timeoutMs: 45_000,
      signal: controller.signal
    },
    fake.service
  )

  assert.deepEqual(result, { content: '完善后的正文' })
  assert.equal(fake.calls[0].temperature, 0.6)
  assert.equal(fake.calls[0].max_tokens, 5000)
  assert.equal(fake.calls[0].model, 'outline-model')
  assert.equal(fake.calls[0].timeoutMs, 45_000)
  assert.equal(fake.calls[0].signal, controller.signal)
  assert.match(fake.calls[0].requestId, /^outline_refine_\d+$/)
  assert.match(fake.calls[0].messages[1].content, /继续修改大纲草稿/)
  assert.match(fake.calls[0].messages[1].content, /重点强化冲突/)
  assert.match(fake.calls[0].messages[1].content, /保留旧印线索/)
}

{
  const fake = fakeTextService('结果')
  await outlineAiService.refineOutline(
    { sourceContent: '原文', mode: 'unknown', model: 'preferred-model' },
    fake.service
  )
  assert.equal(fake.calls[0].model, 'preferred-model')
  assert.match(fake.calls[0].messages[1].content, /整体扩写并提升可写性/)
  assert.match(fake.calls[0].messages[1].content, /用户补充要求：无/)
}

await assert.rejects(
  () => outlineAiService.refineOutline({ sourceContent: '  ' }, fakeTextService('结果').service),
  /当前大纲内容为空/
)
await assert.rejects(
  () => outlineAiService.refineOutline({ sourceContent: '原文' }, null),
  /文本 AI 服务不可用/
)
await assert.rejects(
  () => outlineAiService.refineOutline({ sourceContent: '原文' }, fakeTextService('   ').service),
  /AI 返回结果为空/
)

{
  const fake = fakeTextService(
    JSON.stringify({
      items: [
        {
          title: '城门受阻',
          content: '守卫要求主角出示路引。',
          summary: '主角被拦',
          goals: '进入城内',
          conflict: '没有路引',
          progression: '发现旧印',
          resultHint: '守卫认出旧印'
        }
      ]
    })
  )
  const result = await outlineAiService.splitOutline(
    {
      nodeTitle: '雨夜入城',
      sourceContent: '主角在雨夜进城。',
      previousDraft: '旧拆分草稿',
      userInstruction: '拆成章节',
      mode: 'chapter',
      count: 20,
      model: 'split-model',
      timeoutMs: 60_000
    },
    fake.service
  )
  assert.equal(result.parseError, '')
  assert.equal(result.items[0].title, '城门受阻')
  assert.equal(fake.calls[0].temperature, 0.4)
  assert.equal(fake.calls[0].max_tokens, 6000)
  assert.equal(fake.calls[0].model, 'split-model')
  assert.equal(fake.calls[0].timeoutMs, 60_000)
  assert.match(fake.calls[0].messages[1].content, /目标段数：12/)
  assert.match(fake.calls[0].messages[1].content, /按章节策划拆分/)
}

{
  const cases = [
    ['```json\n{"items":[{"title":"第一段","content":"正文"}]}\n```', '第一段', '正文'],
    [
      '以下是结果：{"items":[{"title":"","summary":"概述","goals":"目标","conflict":"冲突","progression":"推进","resultHint":"悬念"}]} 请查收',
      '第1段',
      '概述：概述\n目标：目标\n冲突：冲突\n推进：推进\n结果/悬念：悬念'
    ],
    ['[{"title":"数组根节点","content":"数组正文"}]', '数组根节点', '数组正文']
  ]
  for (const [rawText, title, content] of cases) {
    const result = outlineAiService.parseSplitResult(rawText)
    assert.equal(result.parseError, '')
    assert.equal(result.items[0].title, title)
    assert.equal(result.items[0].content, content)
  }
}

for (const [rawText, message] of [
  ['', /AI 返回内容为空/],
  ['not json', /Unexpected token|Unexpected end/],
  ['{"value":[]}', /缺少 items 数组/],
  ['{"items":[{"title":"无正文"}]}', /未解析出有效子大纲/]
]) {
  const result = outlineAiService.parseSplitResult(rawText)
  assert.equal(result.items.length, 0)
  assert.match(result.parseError, message)
}

for (const [count, expected] of [
  [1, 2],
  [13, 12],
  ['invalid', 3]
]) {
  const fake = fakeTextService('{"items":[{"title":"一","content":"正文"}]}')
  await outlineAiService.splitOutline({ sourceContent: '原文', count }, fake.service)
  assert.match(fake.calls[0].messages[1].content, new RegExp(`目标段数：${expected}`))
}

await assert.rejects(
  () => outlineAiService.splitOutline({ sourceContent: '' }, fakeTextService('{}').service),
  /当前大纲内容为空/
)
await assert.rejects(
  () => outlineAiService.splitOutline({ sourceContent: '原文' }, null),
  /文本 AI 服务不可用/
)
await assert.rejects(
  () => outlineAiService.splitOutline({ sourceContent: '原文' }, fakeTextService(' ').service),
  /AI 返回结果为空/
)

{
  const refined = await outlineAiService.runTask(
    { taskType: 'refine', sourceContent: '原文' },
    fakeTextService('完善结果').service
  )
  assert.equal(refined.taskType, 'refine')
  const split = await outlineAiService.runTask(
    { taskType: 'split', sourceContent: '原文' },
    fakeTextService('[{"title":"第一段","content":"正文"}]').service
  )
  assert.equal(split.taskType, 'split')
  assert.equal(split.items.length, 1)
}

await assert.rejects(
  () => outlineAiService.runTask({ taskType: 'unknown', sourceContent: '原文' }, null),
  /不支持的 AI 大纲任务类型/
)

console.log('outline ai tests passed')

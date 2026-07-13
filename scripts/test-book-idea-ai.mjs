import assert from 'node:assert/strict'
import bookIdeaAiService from '../src/main/services/bookIdeaAi.js'

function fakeTextProvider(response) {
  const calls = []
  return {
    calls,
    provider: {
      async chat(options = {}) {
        calls.push(options)
        return {
          success: true,
          content: typeof response === 'function' ? response(options) : response,
          usage: { total_tokens: 42 },
          model: options.model || 'fake-model',
          providerId: 'fake-provider'
        }
      }
    }
  }
}

const availableTypes = [
  { value: 'xuanhua', label: '玄幻' },
  { value: 'dushi', label: '都市' }
]

{
  const fake = fakeTextProvider(
    JSON.stringify({
      plans: [
        {
          id: 'plan-a',
          title: '青云册',
          type: 'dushi',
          intro: '年轻主角在城市里寻找真相，并用自己的方式改变处境。',
          protagonist: '林知远',
          coreHook: '普通人发现旧案新证据',
          worldRules: ['现实都市', '线索来自公开资料'],
          conflicts: ['主角追查真相', '对手试图掩盖证据'],
          settings: ['旧档案室', '匿名来信'],
          firstChapters: ['收到来信', '发现矛盾', '第一次交锋']
        }
      ]
    })
  )
  const result = await bookIdeaAiService.generateBookIdeas(
    {
      idea: '都市悬疑新书',
      tags: ['悬疑'],
      availableTypes,
      model: 'idea-model'
    },
    fake.provider
  )
  assert.equal(result.success, true)
  assert.equal(result.plans.length, 1)
  assert.equal(result.plans[0].title, '青云册')
  assert.equal(result.plans[0].type, 'dushi')
  assert.equal(result.model, 'idea-model')
  assert.equal(result.providerId, 'fake-provider')
  assert.equal(fake.calls[0].model, 'idea-model')
  assert.equal(fake.calls[0].temperature, 0.72)
  assert.match(fake.calls[0].messages[1].content, /dushi=都市/)
}

{
  const fake = fakeTextProvider(
    '```json\n{"plans":[{"title":"雪夜灯","type":"unknown","intro":"雪夜里，主角发现灯塔传来的求救信号。"}]}\n```'
  )
  const result = await bookIdeaAiService.generateBookIdeas(
    { idea: '灯塔求救', availableTypes, model: 'fenced-model' },
    fake.provider
  )
  assert.equal(result.plans[0].type, 'xuanhua')
  assert.equal(result.plans[0].typeName, '玄幻')
}

{
  const fake = fakeTextProvider(
    `结果如下：${JSON.stringify({
      plans: [
        {
          title: '这是一个超过十五个字符需要被截断的新书方案标题',
          worldRules: ['规则', '', null, '补充'],
          conflicts: 'invalid',
          settings: Array.from({ length: 10 }, (_, index) => `设定 ${index + 1}`),
          firstChapters: Array.from({ length: 7 }, (_, index) => `章节 ${index + 1}`)
        },
        { title: '', intro: '' },
        { title: '第三案', intro: '第三个方案' },
        { title: '第四案', intro: '不会返回的第四个方案' }
      ]
    })}。`
  )
  const result = await bookIdeaAiService.generateBookIdeas(
    {
      tags: ['玄幻', '', null, '成长'],
      availableTypes: [null, { value: '', label: '无效' }, ...availableTypes]
    },
    fake.provider
  )
  assert.equal(result.plans.length, 3)
  assert.equal(result.plans[0].title.length, 15)
  assert.equal(result.plans[0].id, 'idea-1')
  assert.equal(result.plans[0].type, 'xuanhua')
  assert.equal(result.plans[0].intro, '一个等待继续完善的故事。')
  assert.deepEqual(result.plans[0].worldRules, ['规则', '补充'])
  assert.deepEqual(result.plans[0].conflicts, [])
  assert.equal(result.plans[0].settings.length, 8)
  assert.equal(result.plans[0].firstChapters.length, 5)
  assert.deepEqual(result.usage, { total_tokens: 42 })
  assert.match(fake.calls[0].messages[1].content, /创意：用户暂未输入/)
  assert.match(fake.calls[0].messages[1].content, /偏好标签：玄幻、成长/)
}

await assert.rejects(
  () => bookIdeaAiService.generateBookIdeas({ idea: '' }, fakeTextProvider('{}').provider),
  /请先输入小说创意/
)

await assert.rejects(
  () => bookIdeaAiService.generateBookIdeas({ idea: '新书', availableTypes }, null),
  /文本 AI 服务不可用/
)

await assert.rejects(
  () => bookIdeaAiService.generateBookIdeas({ idea: '新书' }, fakeTextProvider('').provider),
  /AI 没有生成可用方案/
)

await assert.rejects(
  () => bookIdeaAiService.generateBookIdeas({ idea: '新书' }, fakeTextProvider('not json').provider),
  /AI 返回内容不是有效 JSON/
)

await assert.rejects(
  () =>
    bookIdeaAiService.generateBookIdeas(
      { idea: '新书' },
      fakeTextProvider('前缀 {broken json} 后缀').provider
    ),
  /JSON/
)

await assert.rejects(
  () =>
    bookIdeaAiService.generateBookIdeas(
      { idea: '新书' },
      fakeTextProvider('{"plans":"invalid"}').provider
    ),
  /AI 没有生成可用方案/
)

console.log('book idea ai tests passed')

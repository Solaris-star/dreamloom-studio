import assert from 'node:assert/strict'
import knowledgeTopicAiService, {
  parseJsonFromAi
} from '../src/main/services/knowledgeTopicAi.js'

function createTextProvider(response) {
  const calls = []
  return {
    calls,
    provider: {
      async chat(options) {
        calls.push(options)
        return {
          content: typeof response === 'function' ? response(options) : response,
          usage: { total_tokens: 88 },
          model: 'knowledge-model',
          providerId: 'knowledge-provider'
        }
      }
    }
  }
}

assert.deepEqual(parseJsonFromAi('```json\n{"title":"新选题"}\n```'), {
  title: '新选题'
})
assert.deepEqual(parseJsonFromAi('说明文字 {"title":"提取结果"} 结束'), {
  title: '提取结果'
})
assert.equal(parseJsonFromAi('没有 JSON'), null)
assert.equal(parseJsonFromAi(''), null)

{
  const fake = createTextProvider('  {"title":"雾城来信"}  ')
  const result = await knowledgeTopicAiService.runTask(
    {
      task: 'topic_card',
      item: {
        id: 'source-1',
        title: '都市悬疑热点',
        content: '不应丢失的摘要资料',
        ignoredField: '不应发送'
      },
      relatedItems: [{ id: 'related-1', title: '相关活动' }]
    },
    fake.provider
  )

  assert.equal(result.success, true)
  assert.equal(result.task, 'topic_card')
  assert.deepEqual(result.parsed, { title: '雾城来信' })
  assert.equal(result.content, '{"title":"雾城来信"}')
  assert.deepEqual(result.usage, { total_tokens: 88 })
  assert.equal(result.model, 'knowledge-model')
  assert.equal(result.providerId, 'knowledge-provider')
  assert.equal(fake.calls[0].temperature, 0.72)
  assert.equal(fake.calls[0].max_tokens, 3600)
  assert.match(fake.calls[0].requestId, /^knowledge_topic_card_\d+$/)
  assert.match(fake.calls[0].messages[0].content, /不要抓取、复述或照搬小说正文/)
  assert.match(fake.calls[0].messages[1].content, /都市悬疑热点/)
  assert.match(fake.calls[0].messages[1].content, /相关活动/)
  assert.doesNotMatch(fake.calls[0].messages[1].content, /ignoredField/)
}

{
  const fake = createTextProvider('{"volumeOutlines":[]}')
  await knowledgeTopicAiService.runTask(
    {
      task: 'outline',
      item: {},
      relatedItems: null,
      options: { length: 'long' }
    },
    fake.provider
  )

  assert.equal(fake.calls[0].temperature, 0.72)
  assert.equal(fake.calls[0].max_tokens, 6000)
  assert.match(fake.calls[0].messages[1].content, /篇幅为long/)
  assert.match(fake.calls[0].messages[1].content, /"volumeOutlines"/)
}

{
  const fake = createTextProvider('{"marketHeatScore":80}')
  await knowledgeTopicAiService.runTask(
    { task: 'evaluate', item: {}, relatedItems: '无效关联资产' },
    fake.provider
  )

  assert.equal(fake.calls[0].temperature, 0.35)
  assert.match(fake.calls[0].messages[1].content, /评估这个选题/)
  assert.match(fake.calls[0].messages[1].content, /关联资产：\n\[\]/)
}

await assert.rejects(
  () => knowledgeTopicAiService.runTask(null, null),
  /文本 AI 服务不可用/
)

await assert.rejects(
  () => knowledgeTopicAiService.runTask({}, createTextProvider('   ').provider),
  /AI 返回内容为空，请重试/
)

await assert.rejects(
  () => knowledgeTopicAiService.runTask({}, createTextProvider('["不是对象"]').provider),
  /AI 返回内容不是有效 JSON，请重试/
)

console.log('knowledge topic ai tests passed')

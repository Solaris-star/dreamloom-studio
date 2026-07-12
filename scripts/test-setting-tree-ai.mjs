import assert from 'node:assert/strict'
import settingTreeAiService from '../src/main/services/settingTreeAi.js'

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
          usage: { total_tokens: 66 },
          model: options.model || 'fake-setting-model',
          providerId: 'fake-setting-provider'
        }
      }
    }
  }
}

const treeJson = JSON.stringify({
  categories: [
    {
      name: '力量体系',
      introduction: '修行者通过灵印修炼，境界越高越能影响天地元气。',
      items: [{ name: '灵印', introduction: '每个人出生时都会拥有不同属性的灵印。' }],
      children: []
    }
  ]
})

{
  const fake = fakeTextProvider('```json\n' + treeJson + '\n```')
  const result = await settingTreeAiService.generateSettingTree(
    { idea: '少年在边城觉醒旧时代灵印', strategy: 'xuanhuan' },
    fake.provider
  )
  assert.equal(result.categories.length, 1)
  assert.equal(result.categories[0].name, '力量体系')
  assert.equal(result.strategy, 'fantasy')
  assert.equal(result.providerId, 'fake-setting-provider')
  assert.equal(result.model, 'fake-setting-model')
  assert.deepEqual(result.usage, { total_tokens: 66 })
  assert.match(fake.calls[0].messages[0].content, /玄幻网文设定架构师/)
}

{
  const fake = fakeTextProvider(treeJson)
  const result = await settingTreeAiService.generateSettingTree(
    { idea: '城市医生获得异常感知', strategy: 'dushi' },
    fake.provider
  )
  assert.equal(result.strategy, 'urban')
  assert.match(fake.calls[0].messages[0].content, /都市网文设定架构师/)
}

{
  const fake = fakeTextProvider(treeJson)
  const result = await settingTreeAiService.regenerateSettingNode(
    {
      nodeName: '反派势力',
      nodeIntroduction: '隐藏在城市暗处的组织',
      parentPath: ['人物关系网'],
      strategy: 'kehuan',
      idea: '近未来城市悬疑'
    },
    fake.provider
  )
  assert.equal(result.strategy, 'scifi')
  assert.equal(result.providerId, 'fake-setting-provider')
  assert.match(fake.calls[0].messages[1].content, /科幻/)
}

{
  const wrappedTree = JSON.stringify({
    categories: [
      null,
      { name: '  ', introduction: '无效分类' },
      {
        name: ' 星港 ',
        introduction: ' 连接各殖民地的交通中心。 ',
        items: [
          null,
          { name: '', introduction: '无效条目' },
          { name: ' 跃迁门 ', introduction: ' 只在固定时段开放。 ' }
        ],
        children: [
          null,
          {
            name: ' 管制区 ',
            introduction: ' 由港务局负责管理。 ',
            items: 'invalid',
            children: 'invalid'
          }
        ]
      }
    ]
  })
  const fake = fakeTextProvider(`说明文字\n${wrappedTree}\n以上是设定`)
  const result = await settingTreeAiService.generateSettingTree(
    {
      idea: '星港里的失踪案',
      strategy: 'unknown',
      bookPath: '/path/that/does/not/exist'
    },
    fake.provider
  )
  assert.equal(result.strategy, 'free')
  assert.equal(result.categories.length, 1)
  assert.equal(result.categories[0].name, '星港')
  assert.deepEqual(result.categories[0].items, [
    { name: '跃迁门', introduction: '只在固定时段开放。' }
  ])
  assert.equal(result.categories[0].children[0].name, '管制区')
  assert.deepEqual(result.categories[0].children[0].items, [])
  assert.deepEqual(result.categories[0].children[0].children, [])
  assert.match(fake.calls[0].messages[0].content, /自由生成/)
}

await assert.rejects(
  () => settingTreeAiService.generateSettingTree({ idea: '' }, fakeTextProvider(treeJson).provider),
  /请先输入小说创意/
)

await assert.rejects(
  () => settingTreeAiService.generateSettingTree({ idea: '新书' }, null),
  /文本 AI 服务不可用/
)

for (const [response, message] of [
  ['', /AI 返回结果为空/],
  ['not json', /无法解析为 JSON/],
  ['{}', /缺少 categories 数组/],
  [JSON.stringify({ categories: [null, { name: '' }] }), /未解析出有效分类/]
]) {
  await assert.rejects(
    () =>
      settingTreeAiService.generateSettingTree(
        { idea: '测试异常响应' },
        fakeTextProvider(response).provider
      ),
    message
  )
}

await assert.rejects(
  () =>
    settingTreeAiService.regenerateSettingNode(
      { nodeName: '测试节点' },
      null
    ),
  /文本 AI 服务不可用/
)

await assert.rejects(
  () =>
    settingTreeAiService.regenerateSettingNode(
      { nodeName: '  ' },
      fakeTextProvider(treeJson).provider
    ),
  /请指定需要重新生成的节点名称/
)

for (const [response, message] of [
  ['', /AI 返回结果为空/],
  ['```json\ninvalid\n```', /无法解析为 JSON/],
  ['{"categories":"invalid"}', /缺少 categories 数组/]
]) {
  await assert.rejects(
    () =>
      settingTreeAiService.regenerateSettingNode(
        {
          nodeName: '星港',
          parentPath: 'invalid',
          strategy: null,
          idea: ''
        },
        fakeTextProvider(response).provider
      ),
    message
  )
}

console.log('setting tree ai tests passed')

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

await assert.rejects(
  () => settingTreeAiService.generateSettingTree({ idea: '' }, fakeTextProvider(treeJson).provider),
  /请先输入小说创意/
)

await assert.rejects(
  () => settingTreeAiService.generateSettingTree({ idea: '新书' }, null),
  /文本 AI 服务不可用/
)

console.log('setting tree ai tests passed')

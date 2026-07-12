import assert from 'node:assert/strict'
import {
  handleCreativePlanningRoute,
  isCreativePlanningRoute
} from '../src/main/webApi/creativePlanningRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  store: { name: 'store' },
  createProvider: (store, selection) => {
    calls.push(['provider', store, selection])
    return {
      providerId: selection.providerId || 'default-provider',
      model: selection.model || 'default-model',
      service: { name: 'text-service' }
    }
  },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  },
  plotService: {
    evolvePlot: async (payload) => (calls.push(['evolve', payload]), { success: true, groups: [] }),
    regenerateProposal: async (payload) => (
      calls.push(['regeneratePlot', payload]), { success: true, proposal: { title: '新方案' } }
    )
  },
  settingService: {
    generateSettingTree: async (payload, provider) => (
      calls.push(['generateSetting', payload, provider]),
      {
        categories: [
          {
            name: '世界',
            introduction: '世界说明',
            items: [{ name: '城市', introduction: '城市说明' }],
            children: []
          }
        ],
        usage: { total_tokens: 10 },
        model: 'model-a',
        providerId: 'provider-a'
      }
    ),
    regenerateSettingNode: async (payload, provider) => (
      calls.push(['regenerateSetting', payload, provider]),
      {
        categories: [
          { name: '新节点', introduction: '新说明', children: [], items: [] }
        ],
        usage: {},
        model: 'model-a',
        providerId: 'provider-a'
      }
    )
  },
  booksApi: {
    readSettings: () => ({
      success: true,
      data: {
        categories: [
          {
            name: '世界',
            introduction: '旧说明',
            children: [{ name: '旧城', introduction: '旧城说明', children: [], items: [] }],
            items: []
          }
        ]
      }
    }),
    writeSettings: (payload, booksDir) => (
      calls.push(['write', payload, booksDir]),
      { success: true, documentPath: 'D:\\books\\作品\\settings.json' }
    )
  },
  createSettingSnapshot: (bookPath, options) => (
    calls.push(['snapshot', bookPath, options]),
    { id: 'snapshot-1', ...options }
  )
}

for (const path of [
  '/api/setting-tree/apply',
  '/api/setting-tree/generate',
  '/api/setting-tree/regenerate-node',
  '/api/plot-evolution/evolve',
  '/api/plot-evolution/regenerate'
]) {
  assert.equal(isCreativePlanningRoute(path), true)
}
assert.equal(isCreativePlanningRoute('/api/ai/chat'), false)
assert.equal(
  await handleCreativePlanningRoute({ ...common, path: '/api/ai/chat' }),
  false
)

await handleCreativePlanningRoute({
  ...common,
  path: '/api/plot-evolution/evolve',
  body: {
    bookPath: 'D:\\books\\作品',
    outlineContent: '章纲',
    providerIds: ['provider-a', 'provider-b']
  }
})
const evolveCall = calls.find((call) => call[0] === 'evolve')
assert.equal(evolveCall[1].bookPath, 'D:\\books\\作品')
assert.equal(evolveCall[1].providers.length, 2)
assert.equal(evolveCall[1].providers[0].service.name, 'text-service')

await handleCreativePlanningRoute({
  ...common,
  path: '/api/plot-evolution/regenerate',
  body: { providerId: 'provider-a', modelName: 'model-a', outlineContent: '章纲' }
})
const regeneratePlotCall = calls.find((call) => call[0] === 'regeneratePlot')
assert.equal(regeneratePlotCall[1].bookPath, '')
assert.equal(regeneratePlotCall[1].provider.providerId, 'provider-a')
assert.equal(regeneratePlotCall[1].provider.model, 'model-a')

await handleCreativePlanningRoute({
  ...common,
  path: '/api/setting-tree/generate',
  body: { bookName: '作品', creativity: '新创意' }
})
const generateCall = calls.find((call) => call[0] === 'generateSetting')
assert.equal(generateCall[1].idea, '新创意')
assert.equal(generateCall[1].bookPath, 'D:\\books\\作品')
assert.deepEqual(responses.at(-1)[0].tree, [
  {
    name: '世界',
    description: '世界说明',
    children: [{ name: '城市', description: '城市说明', children: [] }]
  }
])

await handleCreativePlanningRoute({
  ...common,
  path: '/api/setting-tree/regenerate-node',
  body: { nodeName: '世界', nodeDescription: '旧说明' }
})
const regenerateSettingCall = calls.find((call) => call[0] === 'regenerateSetting')
assert.equal(regenerateSettingCall[1].nodeIntroduction, '旧说明')
assert.equal(responses.at(-1)[0].node.name, '新节点')

await handleCreativePlanningRoute({
  ...common,
  path: '/api/setting-tree/apply',
  body: {
    bookName: '作品',
    mode: 'merge',
    tree: [
      {
        name: '世界',
        description: '新说明',
        children: [{ name: '新城', description: '新城说明', children: [] }]
      }
    ]
  }
})
const snapshotIndex = calls.findIndex((call) => call[0] === 'snapshot')
const writeIndex = calls.findIndex((call) => call[0] === 'write')
assert.ok(snapshotIndex >= 0 && snapshotIndex < writeIndex)
const mergeWrite = calls[writeIndex]
assert.equal(mergeWrite[1].bookName, '作品')
assert.equal(mergeWrite[1].data.categories[0].introduction, '新说明')
assert.deepEqual(
  mergeWrite[1].data.categories[0].children.map((item) => item.name),
  ['旧城', '新城']
)
assert.equal(responses.at(-1)[0].categoryCount, 1)
assert.equal(responses.at(-1)[0].snapshot.id, 'snapshot-1')

calls.length = 0
await handleCreativePlanningRoute({
  ...common,
  path: '/api/setting-tree/apply',
  body: {
    bookName: '作品',
    mode: 'replace',
    tree: [{ name: '新世界', description: '全新说明', children: [] }]
  }
})
const replaceWrite = calls.find((call) => call[0] === 'write')
assert.deepEqual(replaceWrite[1].data.categories.map((item) => item.name), ['新世界'])

for (const body of [
  { bookName: '作品', mode: 'replace', tree: [] },
  { bookName: '作品', mode: 'unknown', tree: [{ name: '世界' }] }
]) {
  await assert.rejects(
    handleCreativePlanningRoute({
      ...common,
      path: '/api/setting-tree/apply',
      body
    }),
    (error) => error.statusCode === 400
  )
}

await assert.rejects(
  handleCreativePlanningRoute({
    ...common,
    path: '/api/setting-tree/apply',
    body: { bookName: '作品', mode: 'replace', tree: [{ name: '世界' }] },
    createSettingSnapshot: () => {
      throw new Error('快照失败')
    },
    booksApi: {
      ...common.booksApi,
      writeSettings: () => {
        throw new Error('快照失败后不应写入')
      }
    }
  }),
  /快照失败/
)

console.log('创作规划路由测试通过')

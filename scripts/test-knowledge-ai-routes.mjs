import assert from 'node:assert/strict'
import {
  handleKnowledgeAiRoute,
  isKnowledgeAiRoute
} from '../src/main/webApi/knowledgeAiRoutes.js'

const calls = []
const responses = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  sanitizeText: (value) => (typeof value === 'string' ? value.trim() : ''),
  store: { name: 'store' },
  createProvider: (store, payload) => {
    calls.push(['provider', store, payload])
    return { service: { name: 'text-provider' } }
  },
  aiService: {
    runTask: async (payload, provider) => {
      calls.push(['task', payload, provider])
      return { success: true, parsed: { title: '新选题' } }
    }
  },
  knowledge: {
    createTopicCardFromAiResult: (booksDir, sourceItem, aiResult, rawOutput) => {
      calls.push(['save', booksDir, sourceItem, aiResult, rawOutput])
      return { success: true, item: { id: 'topic-1' } }
    }
  }
}

assert.equal(isKnowledgeAiRoute('/api/knowledge/ai-task'), true)
assert.equal(isKnowledgeAiRoute('/api/knowledge/create-topic-from-ai'), true)
assert.equal(isKnowledgeAiRoute('/api/knowledge/list'), false)
assert.equal(
  await handleKnowledgeAiRoute({ ...common, path: '/api/knowledge/list' }),
  false
)

const taskPayload = { task: 'outline', item: { id: 'source-1' } }
await handleKnowledgeAiRoute({
  ...common,
  path: '/api/knowledge/ai-task',
  body: taskPayload
})
assert.deepEqual(calls[0], ['provider', common.store, taskPayload])
assert.deepEqual(calls[1], ['task', taskPayload, { name: 'text-provider' }])
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  parsed: { title: '新选题' }
})

await handleKnowledgeAiRoute({
  ...common,
  path: '/api/knowledge/create-topic-from-ai',
  body: {
    sourceItem: { id: 'source-1' },
    aiResult: { title: '新选题' },
    rawOutput: '  原始结果  '
  }
})
assert.deepEqual(calls.at(-1), [
  'save',
  'D:\\books',
  { id: 'source-1' },
  { title: '新选题' },
  '原始结果'
])
assert.equal(responses.at(-1)[0].item.id, 'topic-1')

await handleKnowledgeAiRoute({
  ...common,
  path: '/api/knowledge/create-topic-from-ai',
  body: {
    sourceItem: ['无效来源'],
    aiResult: '无效结果',
    rawOutput: null
  }
})
assert.deepEqual(calls.at(-1), ['save', 'D:\\books', {}, {}, ''])

console.log('知识库 AI 路由测试通过')

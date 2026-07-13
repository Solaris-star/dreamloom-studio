import assert from 'node:assert/strict'
import { createWebAiHistoryReader } from '../src/main/services/webAiHistoryStoreService.js'

assert.throws(() => createWebAiHistoryReader(), /缺少 Web Store 读取函数/)

const emptyReader = createWebAiHistoryReader(() => ({}))
assert.deepEqual(emptyReader(), [])

const rows = [{ id: 'history-1', task: 'polish' }]
const reader = createWebAiHistoryReader(() => ({ 'ai:history': rows }))
assert.equal(reader(), rows)

const invalidReader = createWebAiHistoryReader(() => ({ 'ai:history': { id: 'broken' } }))
assert.throws(
  () => invalidReader('写入 AI 历史'),
  /AI 历史记录格式异常，已停止写入 AI 历史以免覆盖原始记录/
)

console.log('Web AI 历史存储服务测试通过')

import assert from 'node:assert/strict'
import { postJson, requestJson } from '../src/renderer/src/service/webHttpClient.js'

const originalFetch = globalThis.fetch

try {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: 1 }))
  assert.deepEqual(await requestJson('/api/test'), { success: true, data: 1 })

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: '保存失败' }), { status: 200 })
  await assert.rejects(() => postJson('/api/test', {}), /保存失败/)

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: '参数错误' }), { status: 400 })
  await assert.rejects(() => requestJson('/api/test'), /参数错误/)

  globalThis.fetch = async () => new Response('not-json', { status: 502 })
  await assert.rejects(() => requestJson('/api/test'), /不是有效 JSON/)

  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })
  await assert.rejects(() => requestJson('/api/test', { timeoutMs: 10 }), /请求超时/)
} finally {
  globalThis.fetch = originalFetch
}

console.log('Web HTTP 客户端测试通过')

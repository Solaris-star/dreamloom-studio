import assert from 'node:assert/strict'

const requests = []
const responses = new Map()

globalThis.fetch = async (url, options = {}) => {
  const payload = options.body ? JSON.parse(options.body) : undefined
  requests.push({ url, method: options.method || 'GET', payload })
  const body = responses.get(url) ?? { success: false, message: '未设置测试响应' }
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/systemSettings.js')

responses.set('/api/settings/storage-stats', {
  success: true,
  booksDir: 'D:/books',
  booksSize: 1024,
  storeSize: 128,
  trashSize: 64
})
assert.equal((await service.getStorageStats()).booksSize, 1024)
assert.deepEqual(requests.at(-1), {
  url: '/api/settings/storage-stats',
  method: 'POST',
  payload: {}
})

responses.set('/api/settings/clear-trash', {
  success: true,
  bytesBefore: 64,
  bytesAfter: 0
})
assert.equal((await service.clearAssetTrash()).bytesAfter, 0)

const content = JSON.stringify({ version: 1, settings: { theme: 'paper' } })
responses.set('/api/settings/export', {
  success: true,
  fileName: 'zhimeng-settings.json',
  content
})
assert.equal((await service.exportAppSettings()).content, content)

responses.set('/api/settings/import', { success: true, count: 1 })
assert.equal((await service.importAppSettings(content)).count, 1)
assert.deepEqual(requests.at(-1).payload, { jsonString: content })

responses.set('/api/settings/storage-stats', {
  success: true,
  booksSize: -1,
  storeSize: 0,
  trashSize: 0
})
await assert.rejects(() => service.getStorageStats(), /接口返回格式不正确/)

responses.set('/api/settings/export', {
  success: true,
  fileName: 'settings.txt',
  content
})
await assert.rejects(() => service.exportAppSettings(), /JSON 文件名/)

await assert.rejects(() => service.importAppSettings(''), /文件内容为空/)

responses.set('/api/settings/import', { success: true, count: 1.5 })
await assert.rejects(() => service.importAppSettings(content), /导入数量/)

console.log('Web 系统设置服务测试通过')

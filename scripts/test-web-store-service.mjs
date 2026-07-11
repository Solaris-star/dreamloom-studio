import assert from 'node:assert/strict'

const values = new Map()
let responseOverride = null

globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  const body =
    responseOverride ||
    (url === '/api/store/get'
      ? { success: true, key: payload.key, value: values.get(payload.key) }
      : { success: true, key: payload.key })
  if (!responseOverride && url === '/api/store/set') values.set(payload.key, payload.value)
  if (!responseOverride && url === '/api/store/delete') values.delete(payload.key)
  responseOverride = null
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/webStore.js')

assert.equal(await service.getStoreValue('missing', 'fallback'), 'fallback')
assert.equal(await service.setStoreValue('theme', 'dark'), 'dark')
assert.equal(await service.getStoreValue('theme', 'light'), 'dark')
assert.equal(await service.deleteStoreValue('theme'), true)
assert.equal(await service.getStoreValue('theme', 'light'), 'light')

await assert.rejects(() => service.getStoreValue('', null), /设置项名称不能为空/)
await assert.rejects(() => service.setStoreValue('  ', true), /设置项名称不能为空/)

responseOverride = { success: false, message: '存储不可用' }
await assert.rejects(() => service.getStoreValue('theme'), /存储不可用/)

responseOverride = { success: true, key: 'another-key', value: 'dark' }
await assert.rejects(() => service.getStoreValue('theme'), /设置项不匹配/)

responseOverride = { success: false, message: '写入失败' }
await assert.rejects(() => service.setStoreValue('theme', 'dark'), /写入失败/)

console.log('Web Store 服务测试通过')

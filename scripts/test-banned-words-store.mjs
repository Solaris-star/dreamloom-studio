import assert from 'node:assert/strict'

const values = new Map()
globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  let body
  if (url === '/api/store/get') {
    body = {
      success: true,
      key: payload.key,
      value: values.has(payload.key) ? values.get(payload.key) : undefined
    }
  } else if (url === '/api/store/set') {
    values.set(payload.key, payload.value)
    body = { success: true, key: payload.key }
  } else {
    body = { success: false, message: `unexpected ${url}` }
  }
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const {
  addBannedWord,
  listBannedWords,
  removeBannedWord
} = await import('../src/renderer/src/service/editor.js')

// 默认空值（store fallback 对象）可读
assert.deepEqual(await listBannedWords('测试书'), [])

// 添加 / 去重 / 空格
assert.deepEqual(await addBannedWord('测试书', ' 剧透 '), ['剧透'])
await assert.rejects(() => addBannedWord('测试书', '剧透'), /已存在/)
assert.deepEqual(await addBannedWord('测试书', '系统'), ['系统', '剧透'])

// 重复大小写英文
assert.deepEqual(await addBannedWord('测试书', 'Spoiler'), ['Spoiler', '系统', '剧透'])
await assert.rejects(() => addBannedWord('测试书', 'spoiler'), /已存在/)

// 删除后应可再加
assert.deepEqual(await removeBannedWord('测试书', '系统'), ['Spoiler', '剧透'])
assert.deepEqual(await listBannedWords('测试书'), ['Spoiler', '剧透'])

// 刷新保持：重新读取 store 对象结构
assert.deepEqual(values.get('bannedWords:测试书'), { words: ['Spoiler', '剧透'] })
assert.deepEqual(await listBannedWords('测试书'), ['Spoiler', '剧透'])

// 兼容旧数组存储
values.set('bannedWords:旧书', ['旧词', '旧词', '  空白  ', ''])
assert.deepEqual(await listBannedWords('旧书'), ['旧词', '空白'])

console.log('banned words store tests passed')

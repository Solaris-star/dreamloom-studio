import { postJson } from './webHttpClient.js'

function requireStoreKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new TypeError('设置项名称不能为空')
  }
  return key
}

function requireMatchingResult(result, key, action) {
  if (result?.success !== true) {
    throw new Error(result?.message || `${action}设置失败`)
  }
  if (result.key !== key) {
    throw new Error(`${action}设置失败：接口返回的设置项不匹配`)
  }
  return result
}

export async function getStoreValue(key, fallback = null) {
  const storeKey = requireStoreKey(key)
  const result = requireMatchingResult(
    await postJson('/api/store/get', { key: storeKey }),
    storeKey,
    '读取'
  )
  return result.value ?? fallback
}

export async function setStoreValue(key, value) {
  const storeKey = requireStoreKey(key)
  requireMatchingResult(
    await postJson('/api/store/set', { key: storeKey, value }),
    storeKey,
    '保存'
  )
  return value
}

export async function deleteStoreValue(key) {
  const storeKey = requireStoreKey(key)
  requireMatchingResult(
    await postJson('/api/store/delete', { key: storeKey }),
    storeKey,
    '删除'
  )
  return true
}

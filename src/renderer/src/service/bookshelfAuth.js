import { fetchJson, postJson } from './webHttpClient.js'

function requireAuthStatus(result, action) {
  if (
    result?.success !== true ||
    typeof result.authenticated !== 'boolean' ||
    typeof result.passwordConfigured !== 'boolean'
  ) {
    throw new Error(`${action}失败：接口返回格式不正确`)
  }
  return {
    authenticated: result.authenticated,
    passwordConfigured: result.passwordConfigured
  }
}

export async function getBookshelfAuthStatus() {
  return requireAuthStatus(await fetchJson('/api/auth/status'), '读取书架认证状态')
}

export async function authenticateBookshelf(password) {
  const value = String(password || '')
  if (!value) {
    throw new Error('书架密码不能为空')
  }
  return requireAuthStatus(
    await postJson('/api/auth/login', { password: value }),
    '验证书架密码'
  )
}

export async function logoutBookshelf() {
  const result = await postJson('/api/auth/logout')
  if (result?.success !== true) {
    throw new Error(result?.message || '退出书架认证失败')
  }
  return true
}

export async function updateBookshelfAccessKey(currentKey, newKey) {
  return requireAuthStatus(
    await postJson('/api/auth/access-key', {
      currentKey: String(currentKey || ''),
      newKey: String(newKey || '')
    }),
    '更新书架密钥'
  )
}

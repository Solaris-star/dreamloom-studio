import assert from 'node:assert/strict'

let request
let response = { success: true, authenticated: false, passwordConfigured: true, hint: 'ab****cd' }

globalThis.fetch = async (url, options = {}) => {
  request = {
    url,
    method: options.method || 'GET',
    payload: options.body ? JSON.parse(options.body) : null
  }
  return new Response(JSON.stringify(response), {
    status: response.success === false ? 401 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const service = await import('../src/renderer/src/service/bookshelfAuth.js')

assert.deepEqual(await service.getBookshelfAuthStatus(), {
  authenticated: false,
  passwordConfigured: true,
  hint: 'ab****cd'
})
assert.deepEqual(request, {
  url: '/api/auth/status',
  method: 'GET',
  payload: null
})

response = { success: true, authenticated: true, passwordConfigured: true }
await service.authenticateBookshelf('secret')
assert.deepEqual(request, {
  url: '/api/auth/login',
  method: 'POST',
  payload: { password: 'secret' }
})
await assert.rejects(() => service.authenticateBookshelf(''), /密码不能为空/)

response = { success: true }
assert.equal(await service.logoutBookshelf(), true)
assert.equal(request.url, '/api/auth/logout')

response = { success: true, authenticated: 'yes', passwordConfigured: true }
await assert.rejects(() => service.getBookshelfAuthStatus(), /返回格式不正确/)

response = { success: false, message: '密码错误' }
await assert.rejects(() => service.authenticateBookshelf('wrong'), /密码错误/)

console.log('Web 书架认证服务测试通过')

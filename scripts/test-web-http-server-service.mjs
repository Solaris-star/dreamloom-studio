import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  createJsonBodyReader,
  sendJson,
  sendTransparentImage
} from '../src/main/services/webHttpServerService.js'

function request(headers = {}) {
  const req = new EventEmitter()
  req.headers = headers
  req.resume = () => {
    req.resumed = true
  }
  return req
}

async function readChunks(reader, chunks, headers) {
  const req = request(headers)
  const result = reader(req)
  for (const chunk of chunks) req.emit('data', Buffer.from(chunk))
  req.emit('end')
  return result
}

const readJsonBody = createJsonBodyReader(16)
assert.deepEqual(await readChunks(readJsonBody, []), {})
assert.deepEqual(await readChunks(readJsonBody, ['{"ok":true}']), { ok: true })
await assert.rejects(
  () => readChunks(readJsonBody, [], { 'content-length': '17' }),
  (error) => error.statusCode === 413 && error.message === '请求内容过大'
)

const chunkedRequest = request()
const chunkedResult = readJsonBody(chunkedRequest)
chunkedRequest.emit('data', Buffer.from('1234567890'))
chunkedRequest.emit('data', Buffer.from('1234567890'))
await assert.rejects(
  () => chunkedResult,
  (error) => error.statusCode === 413 && chunkedRequest.resumed === true
)

await assert.rejects(
  () => readChunks(readJsonBody, ['{']),
  (error) => error.statusCode === 400 && error.message === '请求 JSON 格式不正确'
)

const abortedRequest = request()
const abortedResult = readJsonBody(abortedRequest)
abortedRequest.emit('aborted')
await assert.rejects(
  () => abortedResult,
  (error) => error.statusCode === 400 && error.message === '请求已中断'
)

const networkRequest = request()
const networkResult = readJsonBody(networkRequest)
networkRequest.emit('error', new Error('network failed'))
await assert.rejects(() => networkResult, /network failed/)

const jsonResponse = {
  headers: new Map(),
  setHeader(key, value) {
    this.headers.set(key, value)
  },
  end(body) {
    this.body = body
  }
}
sendJson(jsonResponse, { success: false }, 409)
assert.equal(jsonResponse.statusCode, 409)
assert.equal(jsonResponse.headers.get('Content-Type'), 'application/json; charset=utf-8')
assert.equal(jsonResponse.body, '{"success":false}')

const imageResponse = {
  headers: new Map(),
  setHeader(key, value) {
    this.headers.set(key, value)
  },
  end(body) {
    this.body = body
  }
}
sendTransparentImage(imageResponse)
assert.equal(imageResponse.statusCode, 200)
assert.equal(imageResponse.headers.get('Content-Type'), 'image/png')
assert.ok(Buffer.isBuffer(imageResponse.body))
assert.ok(imageResponse.body.length > 0)

console.log('Web HTTP 服务器服务测试通过')

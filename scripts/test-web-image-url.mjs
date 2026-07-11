import assert from 'node:assert/strict'
import {
  bookImageUrl,
  selectedBrowserImageUrl
} from '../src/renderer/src/utils/webImageUrl.js'

const url = new URL(bookImageUrl('测试书', 'avatars/主角.png'), 'http://localhost')
assert.equal(url.pathname, '/api/books/image')
assert.equal(url.searchParams.get('book'), '测试书')
assert.equal(url.searchParams.get('file'), 'avatars/主角.png')

assert.equal(bookImageUrl('测试书', 'https://example.com/a.png'), 'https://example.com/a.png')
assert.equal(bookImageUrl('测试书', 'data:image/png;base64,AA=='), 'data:image/png;base64,AA==')
assert.equal(bookImageUrl('测试书', 'D:\\secret\\a.png'), '')
assert.equal(bookImageUrl('测试书', '/etc/passwd'), '')
assert.equal(bookImageUrl('测试书', 'file:///tmp/a.png'), '')
assert.equal(selectedBrowserImageUrl({ dataUrl: 'data:image/png;base64,AA==' }), 'data:image/png;base64,AA==')
assert.equal(selectedBrowserImageUrl({ filePath: 'D:\\secret\\a.png' }), '')

console.log('Web 图片地址测试通过')

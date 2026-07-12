import assert from 'node:assert/strict'

import {
  assertSourceUrl,
  getBookSources,
  getChapterContent,
  getChapterList,
  search
} from '../src/main/services/novelDownloader.js'

const originalFetch = globalThis.fetch

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}

try {
  assert.ok(getBookSources().some((source) => source.id === 'xbiquge'))
  assert.deepEqual(await search('  ', 'xbiquge'), [])
  assert.throws(() => assertSourceUrl('not-a-url', 'xbiquge'), /书源地址无效/)
  assert.throws(
    () => assertSourceUrl('file:///tmp/book.html', 'xbiquge'),
    /书源地址协议不受支持/
  )
  assert.throws(
    () => assertSourceUrl('https://example.com/book.html', 'xbiquge'),
    /书源地址与所选书源不匹配/
  )
  assert.throws(() => assertSourceUrl('https://www.xbiquge.la/', 'missing'), /未知书源/)

  let request
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return htmlResponse(`
      <table><tbody>
        <tr><td><a href="/book/123/"> 测试作品 </a></td><td></td><td> 测试作者 </td></tr>
        <tr><td><a href="">无效作品</a></td><td></td><td>作者</td></tr>
      </tbody></table>
    `)
  }
  assert.deepEqual(await search('测试 作品', 'xbiquge'), [
    {
      title: '测试作品',
      author: '测试作者',
      url: 'https://www.xbiquge.la/book/123/',
      sourceId: 'xbiquge'
    }
  ])
  assert.match(request.url, /q=%E6%B5%8B%E8%AF%95%20%E4%BD%9C%E5%93%81/)
  assert.equal(request.init.method, undefined)

  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return htmlResponse(`
      <div id="checkform"><table><tbody>
        <tr><td class="even"><a href="/book/456/">POST 作品</a></td><td></td><td>POST 作者</td></tr>
      </tbody></table></div>
    `)
  }
  assert.equal((await search('引号"测试', 'xbiqugu'))[0].title, 'POST 作品')
  assert.equal(request.init.method, 'POST')
  assert.equal(request.init.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(request.init.body), { searchkey: '引号"测试' })

  globalThis.fetch = async () =>
    htmlResponse(`
      <div id="list"><dl>
        <dd><a href="1.html"> 第一章 </a></dd>
        <dd><a href="/book/123/2.html">第二章</a></dd>
        <dd><a>缺少地址</a></dd>
      </dl></div>
    `)
  assert.deepEqual(await getChapterList('https://www.xbiquge.la/book/123/', 'xbiquge'), [
    { title: '第一章', url: 'https://www.xbiquge.la/book/123/1.html' },
    { title: '第二章', url: 'https://www.xbiquge.la/book/123/2.html' }
  ])

  globalThis.fetch = async () =>
    htmlResponse(`
      <div id="content">
        <script>remove()</script>
        <style>.remove { color: red; }</style>
        第一段<br>第二段&nbsp;&#33;
      </div>
    `)
  assert.equal(
    await getChapterContent('https://www.xbiquge.la/book/123/1.html', 'xbiquge'),
    '第一段\n第二段 !'
  )

  globalThis.fetch = async () => htmlResponse('not found', 404)
  await assert.rejects(
    () => getChapterContent('https://www.xbiquge.la/book/123/missing.html', 'xbiquge'),
    /HTTP 404/
  )

  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(
    () => getChapterContent('https://www.xbiquge.la/book/123/network.html', 'xbiquge'),
    /网络异常/
  )

  globalThis.fetch = async () => {
    throw new Error('connect failed', { cause: { code: 'ECONNREFUSED' } })
  }
  await assert.rejects(
    () => getChapterContent('https://www.xbiquge.la/book/123/refused.html', 'xbiquge'),
    /无法连接书源/
  )
} finally {
  globalThis.fetch = originalFetch
}

console.log('novel downloader service tests passed')

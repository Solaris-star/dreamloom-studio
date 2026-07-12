import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createBook } from '../src/main/services/webBooksApi.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-book-create-safety-'))
const booksDir = join(root, 'books')
const originalFetch = globalThis.fetch

async function createRemoteCoverBook(name, coverRemoteUrl = 'https://images.example/cover.png') {
  return createBook(
    {
      id: `remote-${name}`,
      name,
      coverRemoteUrl
    },
    booksDir
  )
}

try {
  fs.mkdirSync(booksDir, { recursive: true })

  const emptyName = await createBook({ id: 'empty-name', name: '' }, booksDir)
  assert.equal(emptyName.success, false)
  assert.match(emptyName.message, /书籍名称不能为空/)

  const sanitizedName = await createBook(
    {
      id: 'sanitized-name',
      name: '../危险\\作品:*?"<>|'
    },
    booksDir
  )
  assert.equal(sanitizedName.success, false)
  assert.match(sanitizedName.message, /名称|路径/)
  assert.equal(fs.existsSync(join(root, '危险', '作品')), false)

  const created = await createBook(
    {
      id: 'existing-book',
      name: '已有作品',
      intro: '原始简介'
    },
    booksDir
  )
  assert.equal(created.success, true)

  const bookPath = join(booksDir, '已有作品')
  const metaPath = join(bookPath, 'mazi.json')
  const chapterPath = join(bookPath, '正文', '正文', '第1章.txt')
  fs.writeFileSync(chapterPath, '不能丢失的正文', 'utf8')
  const originalMeta = fs.readFileSync(metaPath, 'utf8')

  const duplicate = await createBook(
    {
      id: 'replacement-book',
      name: '已有作品',
      intro: '覆盖简介'
    },
    booksDir
  )
  assert.equal(duplicate.success, false)
  assert.equal(duplicate.existed, true)
  assert.match(duplicate.message, /已存在同名书籍/)
  assert.equal(fs.readFileSync(metaPath, 'utf8'), originalMeta)
  assert.equal(fs.readFileSync(chapterPath, 'utf8'), '不能丢失的正文')

  const concurrentResults = await Promise.all([
    createBook({ id: 'concurrent-a', name: '并发作品' }, booksDir),
    createBook({ id: 'concurrent-b', name: '并发作品' }, booksDir)
  ])
  assert.equal(concurrentResults.filter((result) => result.success).length, 1)
  assert.equal(
    concurrentResults.filter((result) => result.success === false && result.existed).length,
    1
  )

  const serverFile = join(root, 'server-secret.png')
  fs.writeFileSync(serverFile, '服务器私有内容', 'utf8')
  const localPathCover = await createBook(
    {
      id: 'local-path-cover',
      name: '本地路径封面',
      coverImagePath: serverFile
    },
    booksDir
  )
  assert.equal(localPathCover.success, false)
  assert.match(localPathCover.message, /必须通过网页上传/)
  assert.equal(fs.existsSync(join(booksDir, '本地路径封面')), false)

  const forgedCover = await createBook(
    {
      id: 'forged-cover',
      name: '伪造封面',
      coverImagePath: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`
    },
    booksDir
  )
  assert.equal(forgedCover.success, false)
  assert.match(forgedCover.message, /内容与格式不匹配/)
  assert.equal(fs.existsSync(join(booksDir, '伪造封面')), false)

  const unsupportedCover = await createBook(
    {
      id: 'unsupported-cover',
      name: '不支持的封面',
      coverImagePath: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    },
    booksDir
  )
  assert.equal(unsupportedCover.success, false)
  assert.match(unsupportedCover.message, /格式不受支持/)

  const emptyCover = await createBook(
    {
      id: 'empty-cover',
      name: '空封面',
      coverImagePath: 'data:image/png;base64,'
    },
    booksDir
  )
  assert.equal(emptyCover.success, false)
  assert.match(emptyCover.message, /必须通过网页上传/)

  const oversizedCover = await createBook(
    {
      id: 'oversized-cover',
      name: '超大上传封面',
      coverImagePath: `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')}`
    },
    booksDir
  )
  assert.equal(oversizedCover.success, false)
  assert.match(oversizedCover.message, /不能超过 10 MB/)

  const pngBytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(32, 1)
  ])
  const uploadedCover = await createBook(
    {
      id: 'uploaded-cover',
      name: '网页上传封面',
      coverImagePath: `data:image/png;base64,${pngBytes.toString('base64')}`
    },
    booksDir
  )
  assert.equal(uploadedCover.success, true)
  assert.equal(fs.readFileSync(join(booksDir, '网页上传封面', 'cover.png')).equals(pngBytes), true)

  const supportedCovers = [
    ['jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['gif', 'image/gif', Buffer.from('GIF89a')],
    [
      'webp',
      'image/webp',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
    ],
    ['avif', 'image/avif', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif')])]
  ]
  for (const [extension, mimeType, bytes] of supportedCovers) {
    const result = await createBook(
      {
        id: `uploaded-${extension}`,
        name: `网页上传 ${extension}`,
        coverImagePath: `data:${mimeType};base64,${bytes.toString('base64')}`
      },
      booksDir
    )
    assert.equal(result.success, true)
    assert.equal(
      fs.readFileSync(join(booksDir, `网页上传 ${extension}`, `cover.${extension}`)).equals(bytes),
      true
    )
  }

  let receivedSignal = null
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal
    return new Response('', {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(11 * 1024 * 1024)
      }
    })
  }
  const oversizedRemote = await createBook(
    {
      id: 'remote-cover',
      name: '远程封面过大',
      coverRemoteUrl: 'https://images.example/cover.png'
    },
    booksDir
  )
  assert.equal(oversizedRemote.success, true)
  assert.equal(oversizedRemote.bookName, '远程封面过大')
  assert.match(oversizedRemote.coverWarning, /不能超过 10 MB/)
  assert.equal(receivedSignal instanceof AbortSignal, true)
  assert.equal(fs.existsSync(join(booksDir, '远程封面过大', 'cover.png')), false)

  globalThis.fetch = async () =>
    new Response(
      Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        Buffer.alloc(10 * 1024 * 1024)
      ]),
      {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      }
    )
  const oversizedRemoteBody = await createRemoteCoverBook('远程实际内容过大')
  assert.equal(oversizedRemoteBody.success, true)
  assert.match(oversizedRemoteBody.coverWarning, /不能超过 10 MB/)

  const invalidRemoteUrl = await createRemoteCoverBook('无效远程地址', 'not a url')
  assert.equal(invalidRemoteUrl.success, true)
  assert.match(invalidRemoteUrl.coverWarning, /地址无效/)

  const invalidRemoteProtocol = await createRemoteCoverBook(
    '无效远程协议',
    'file:///server/private.png'
  )
  assert.equal(invalidRemoteProtocol.success, true)
  assert.match(invalidRemoteProtocol.coverWarning, /只支持 HTTP 或 HTTPS/)

  globalThis.fetch = async () => new Response('', { status: 404 })
  const missingRemote = await createRemoteCoverBook('远程封面不存在')
  assert.equal(missingRemote.success, true)
  assert.match(missingRemote.coverWarning, /HTTP 404/)

  globalThis.fetch = async () =>
    new Response('plain text', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  const wrongMimeRemote = await createRemoteCoverBook('远程类型错误')
  assert.equal(wrongMimeRemote.success, true)
  assert.match(wrongMimeRemote.coverWarning, /不是受支持的图片/)

  globalThis.fetch = async () =>
    new Response(pngBytes, {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    })
  const tinyRemote = await createRemoteCoverBook('远程占位小图')
  assert.equal(tinyRemote.success, true)
  assert.match(tinyRemote.coverWarning, /图片过小/)

  globalThis.fetch = async () =>
    new Response(Buffer.alloc(8 * 1024, 1), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    })
  const forgedRemote = await createRemoteCoverBook('远程伪造图片')
  assert.equal(forgedRemote.success, true)
  assert.match(forgedRemote.coverWarning, /内容与格式不匹配/)

  const remotePngBytes = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(8 * 1024, 1)
  ])
  globalThis.fetch = async () =>
    new Response(remotePngBytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png; charset=binary',
        'Content-Length': String(remotePngBytes.length)
      }
    })
  const validRemote = await createRemoteCoverBook('正常远程封面')
  assert.equal(validRemote.success, true)
  assert.equal(validRemote.coverWarning, '')
  assert.equal(
    fs.readFileSync(join(booksDir, '正常远程封面', 'cover.png')).equals(remotePngBytes),
    true
  )

  let remoteFetchCalls = 0
  globalThis.fetch = async () => {
    remoteFetchCalls += 1
    throw new Error('测试网络中断')
  }
  const retainedCover = await createBook(
    {
      id: 'retained-cover',
      name: '已有封面地址',
      coverUrl: 'covers/existing.png',
      coverRemoteUrl: 'https://images.example/unused.png'
    },
    booksDir
  )
  assert.equal(retainedCover.success, true)
  assert.equal(
    JSON.parse(fs.readFileSync(join(booksDir, '已有封面地址', 'mazi.json'), 'utf8')).coverUrl,
    'covers/existing.png'
  )
  assert.equal(retainedCover.coverWarning, '')
  assert.equal(remoteFetchCalls, 0)

  const networkFailure = await createRemoteCoverBook('远程网络异常')
  assert.equal(networkFailure.success, true)
  assert.match(networkFailure.coverWarning, /测试网络中断/)
  assert.equal(remoteFetchCalls, 1)
} finally {
  globalThis.fetch = originalFetch
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('Web 作品创建安全测试通过')

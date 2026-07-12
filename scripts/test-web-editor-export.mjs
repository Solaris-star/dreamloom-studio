import assert from 'node:assert/strict'

const responses = [
  {
    success: true,
    chapters: [
      {
        type: 'volume',
        name: '第一卷',
        children: [
          { type: 'chapter', name: '第1章' },
          { type: 'chapter', name: '第2章' }
        ]
      }
    ]
  },
  {
    success: true,
    bookName: '作品',
    volumeName: '第一卷',
    chapterName: '第1章',
    filePath: 'D:/books/作品/正文/第一卷/第1章.txt',
    content: '第一章正文',
    wordCount: 5
  },
  { success: false, message: '章节损坏' },
  {
    success: true,
    chapters: []
  },
  {
    success: true,
    chapters: [
      { type: 'chapter', name: '游离章节' },
      { type: 'volume', name: '空卷', children: [] },
      {
        type: 'volume',
        name: '资料卷',
        children: [{ type: 'note', name: '不是章节' }]
      }
    ]
  }
]

globalThis.fetch = async () => {
  const body = responses.shift()
  return new Response(JSON.stringify(body), {
    status: body.success === false ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const { buildBookTextExport, downloadBookTextExport } = await import(
  '../src/renderer/src/service/editorExport.js'
)

const result = await buildBookTextExport('作品')
assert.equal(result.totalChapters, 1)
assert.equal(result.failedChapters.length, 1)
assert.equal(result.failedChapters[0].chapterName, '第2章')
assert.match(result.content, /【第一卷】/)
assert.match(result.content, /第一章正文/)

await assert.rejects(() => buildBookTextExport(' '), /缺少作品名/)
assert.deepEqual(await buildBookTextExport('空作品'), {
  content: '',
  totalChapters: 0,
  failedChapters: []
})
const skipped = await buildBookTextExport('只有资料')
assert.equal(skipped.totalChapters, 0)
assert.equal(skipped.failedChapters.length, 0)
assert.match(skipped.content, /【资料卷】/)

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
URL.createObjectURL = undefined
await assert.throws(() => downloadBookTextExport('作品', '2607121200', ''), /不支持文件下载/)

let clicked = false
let removed = false
let appended = false
const anchor = {
  style: {},
  click() {
    clicked = true
  },
  remove() {
    removed = true
  }
}
globalThis.document = {
  createElement: () => anchor,
  body: {
    appendChild() {
      appended = true
    }
  }
}
URL.createObjectURL = () => 'blob:editor-export'
URL.revokeObjectURL = () => {}

const download = downloadBookTextExport('作/品', '2607121200', result.content)
assert.equal(download.fileName, '作_品_2607121200.txt')
assert.equal(anchor.download, download.fileName)
assert.equal(anchor.href, 'blob:editor-export')
assert.equal(appended, true)
assert.equal(clicked, true)
assert.equal(removed, true)

const fallbackDownload = downloadBookTextExport('  ', '', '')
assert.equal(fallbackDownload.fileName, '作品_.txt')

URL.createObjectURL = originalCreateObjectURL
URL.revokeObjectURL = originalRevokeObjectURL

console.log('Web 编辑器导出测试通过')

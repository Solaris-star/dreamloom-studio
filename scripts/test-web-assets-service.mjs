import assert from 'node:assert/strict'

const requests = []
let responseData = { success: true }

globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, payload: JSON.parse(options.body || '{}') })
  return new Response(JSON.stringify(responseData), {
    status: responseData.success === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const assets = await import('../src/renderer/src/service/assets.js')

responseData = { success: true, items: [], books: [], summary: { total: 0 } }
assert.deepEqual(await assets.listAssets({ status: 'active' }), responseData)
assert.deepEqual(requests.at(-1), {
  url: '/api/assets/list',
  payload: { status: 'active' }
})

responseData = { success: true, references: [{ type: 'cover', label: '封面' }] }
assert.deepEqual(await assets.findAssetReferences('asset-1'), responseData.references)
assert.deepEqual(requests.at(-1).payload, { id: 'asset-1' })

responseData = { success: true, item: { id: 'asset-1' } }
assert.equal((await assets.deleteAsset('asset-1')).item.id, 'asset-1')

responseData = {
  success: true,
  item: { id: 'asset-1' },
  restoredPath: 'D:/books/a.png',
  originalRelativePath: 'images/a.png',
  trashRelativePath: '.trash/a.png',
  restoredId: 'asset-1'
}
assert.equal((await assets.restoreAsset('asset-1')).restoredId, 'asset-1')

responseData = { success: true, item: { id: 'asset-2', bookName: '作品甲' } }
assert.equal(
  (await assets.attachAssetToBook({ id: 'asset-2', bookName: '作品甲' })).item.id,
  'asset-2'
)
assert.equal((await assets.importAsset({ dataUrl: 'data:image/png;base64,AA==', bookName: '作品甲' })).item.id, 'asset-2')

assert.throws(
  () => assets.imageSelectionToImportInput('D:/image.png'),
  /不能读取本地文件路径/
)
assert.deepEqual(assets.imageSelectionToImportInput('data:image/png;base64,AA=='), {
  dataUrl: 'data:image/png;base64,AA=='
})
assert.deepEqual(
  assets.imageSelectionToImportInput({ dataUrl: 'data:image/png;base64,AA==', name: 'a.png' }),
  { dataUrl: 'data:image/png;base64,AA==', fileName: 'a.png' }
)
assert.equal(assets.imageSelectionToImportInput({ success: false, message: '用户取消选择' }), null)
assert.throws(
  () => assets.imageSelectionToImportInput({ sourcePath: 'D:/image.png', name: 'a.png' }),
  /不能读取本地文件路径/
)
assert.throws(
  () => assets.imageSelectionToImportInput({ success: false, message: '读取失败' }),
  /读取失败/
)
assert.equal(assets.getAssetUrl({ id: 'asset 1', status: 'trash' }), '/api/assets/get?id=asset+1&trash=true')

assert.throws(
  () => assets.requireAssetListResult({ success: true, items: {}, books: [] }),
  /素材接口返回格式不正确/
)
responseData = { success: true, references: null }
await assert.rejects(() => assets.findAssetReferences('asset-1'), /接口返回格式不正确/)
responseData = { success: true, item: { id: 'asset-2', bookName: '作品乙' } }
await assert.rejects(
  () => assets.attachAssetToBook({ id: 'asset-2', bookName: '作品甲' }),
  /书籍不匹配/
)

console.log('Web 素材服务测试通过')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deleteAsset, findAssetReferences, listAssets } from '../src/main/services/assetService.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-assets-'))

try {
  const bookDir = path.join(root, 'test-book')
  const imageDir = path.join(bookDir, 'character_images')
  fs.mkdirSync(imageDir, { recursive: true })
  fs.writeFileSync(
    path.join(bookDir, 'mazi.json'),
    JSON.stringify({ id: 'book-1', name: '测试书', coverUrl: null })
  )

  const imagePath = path.join(imageDir, '林溪.png')
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(
    path.join(bookDir, 'characters.json'),
    JSON.stringify([{ name: '林溪', imagePath: 'character_images/林溪.png' }])
  )

  const asset = listAssets(root).items.find((item) => item.name === '林溪.png')
  assert.ok(asset)
  assert.deepEqual(findAssetReferences(root, asset.id), [
    { file: 'characters.json', fields: ['$[0].imagePath'] }
  ])
  assert.throws(() => deleteAsset(root, asset.id), /characters\.json.*imagePath/)
  assert.equal(fs.existsSync(imagePath), true, '有引用的素材必须保留在原位置')

  fs.writeFileSync(path.join(bookDir, 'characters.json'), JSON.stringify([{ name: '林溪' }]))
  const result = deleteAsset(root, asset.id)
  assert.equal(result.success, true)
  assert.equal(fs.existsSync(imagePath), false)
  assert.equal(fs.existsSync(path.join(root, result.item.trashRelativePath)), true)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('素材引用删除保护测试通过')

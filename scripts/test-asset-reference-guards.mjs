import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  deleteAsset,
  findAssetReferences,
  importAsset,
  listAssets
} from '../src/main/services/assetService.js'

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
    JSON.stringify([
      {
        name: '林溪',
        imagePath: 'character_images/林溪.png',
        gallery: ['test-book\\character_images\\林溪.png']
      }
    ])
  )
  fs.mkdirSync(path.join(bookDir, 'scene_images'), { recursive: true })
  const scenePath = path.join(bookDir, 'scene_images', '雨夜.png')
  fs.writeFileSync(scenePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(
    path.join(bookDir, 'scenes.json'),
    JSON.stringify([{ name: '雨夜', image: '雨夜.png' }])
  )
  const coverPath = path.join(bookDir, 'cover.png')
  fs.writeFileSync(coverPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(
    path.join(bookDir, 'mazi.json'),
    JSON.stringify({
      id: 'book-1',
      name: '测试书',
      coverUrl: 'test-book/cover.png',
      alternateCover: 'cover.png'
    })
  )

  const assets = listAssets(root).items
  const characterAsset = assets.find((item) => item.name === '林溪.png')
  const sceneAsset = assets.find((item) => item.name === '雨夜.png')
  const coverAsset = assets.find((item) => item.name === 'cover.png')
  assert.ok(characterAsset)
  assert.ok(sceneAsset)
  assert.ok(coverAsset)
  assert.deepEqual(findAssetReferences(root, characterAsset.id), [
    {
      file: 'characters.json',
      fields: ['$[0].imagePath', '$[0].gallery[0]'],
      usages: [{ type: 'character', label: '人物「林溪」' }]
    }
  ])
  assert.deepEqual(findAssetReferences(root, sceneAsset.id), [
    {
      file: 'scenes.json',
      fields: ['$[0].image'],
      usages: [{ type: 'scene', label: '场景「雨夜」' }]
    }
  ])
  assert.deepEqual(findAssetReferences(root, coverAsset.id), [
    {
      file: 'mazi.json',
      fields: ['$.coverUrl', '$.alternateCover'],
      usages: [{ type: 'cover', label: '作品封面' }]
    }
  ])
  assert.throws(() => deleteAsset(root, characterAsset.id), /characters\.json.*imagePath/)
  assert.throws(() => deleteAsset(root, sceneAsset.id), /scenes\.json.*image/)
  assert.throws(() => deleteAsset(root, coverAsset.id), /mazi\.json.*coverUrl/)
  assert.equal(fs.existsSync(imagePath), true, '有引用的素材必须保留在原位置')
  assert.equal(fs.existsSync(scenePath), true, '场景引用存在时必须保留素材')
  assert.equal(fs.existsSync(coverPath), true, '封面引用存在时必须保留素材')
  const serverFile = path.join(root, 'server-only.png')
  fs.writeFileSync(serverFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'character',
        sourcePath: serverFile,
        fileName: '越权.png'
      }),
    /不能读取服务器本地路径/
  )
  assert.equal(fs.existsSync(path.join(imageDir, '越权.png')), false)

  fs.writeFileSync(path.join(bookDir, 'characters.json'), JSON.stringify([{ name: '林溪' }]))
  const result = deleteAsset(root, characterAsset.id)
  assert.equal(result.success, true)
  assert.equal(fs.existsSync(imagePath), false)
  assert.equal(fs.existsSync(path.join(root, result.item.trashRelativePath)), true)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('素材引用删除保护测试通过')

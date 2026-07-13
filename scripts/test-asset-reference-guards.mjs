import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  attachToBook,
  deleteAsset,
  findAssetReferences,
  getAssetFile,
  importAsset,
  listAssets,
  restoreAsset
} from '../src/main/services/assetService.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamloom-assets-'))

try {
  assert.deepEqual(listAssets(path.join(root, '不存在目录')).summary, {
    total: 0,
    byType: { cover: 0, character: 0, scene: 0, map: 0, attachment: 0, trash: 0 },
    bookCount: 0
  })

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
  fs.writeFileSync(path.join(bookDir, 'broken-reference.json'), '{broken', 'utf8')
  assert.deepEqual(findAssetReferences(root, coverAsset.id), [
    {
      file: 'mazi.json',
      fields: ['$.coverUrl', '$.alternateCover'],
      usages: [{ type: 'cover', label: '作品封面' }]
    }
  ])
  assert.throws(() => findAssetReferences(root, ''), /资产 ID 无效/)
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
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'character',
        dataUrl: 'data:image/png;base64,不是base64',
        fileName: '损坏.png'
      }),
    /Base64/
  )
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'scene',
        base64: Buffer.from('plain text').toString('base64'),
        fileName: '伪造.png'
      }),
    /图片内容损坏/
  )
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'cover',
        base64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
        fileName: '封面.txt'
      }),
    /只支持图片文件/
  )
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'attachment',
        base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
        fileName: '超大附件.bin'
      }),
    /不能超过 10 MB/
  )
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'attachment',
        fileName: '空文件.bin',
        base64: ''
      }),
    /缺少导入文件/
  )
  assert.throws(
    () =>
      importAsset(root, {
        bookName: '测试书',
        type: 'attachment',
        fileName: '空内容.bin',
        base64: '===='
      }),
    /Base64/
  )
  assert.equal(fs.existsSync(path.join(imageDir, '损坏.png')), false)
  assert.equal(fs.existsSync(path.join(bookDir, 'scene_images', '伪造.png')), false)

  fs.writeFileSync(path.join(bookDir, 'characters.json'), JSON.stringify([{ name: '林溪' }]))
  const result = deleteAsset(root, characterAsset.id)
  assert.equal(result.success, true)
  assert.equal(fs.existsSync(imagePath), false)
  assert.equal(fs.existsSync(path.join(root, result.item.trashRelativePath)), true)

  const trashFile = getAssetFile(root, { id: result.item.id, trash: true })
  assert.equal(trashFile.name, '林溪.png')
  assert.equal(trashFile.contentType, 'image/png')
  assert.equal(listAssets(root, { type: 'trash' }).items.length, 1)
  assert.equal(
    listAssets(root, { includeTrash: true }).items.some((item) => item.status === 'trash'),
    true
  )

  fs.mkdirSync(path.dirname(imagePath), { recursive: true })
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.throws(() => restoreAsset(root, result.item.id), /原位置已有同名文件/)
  fs.rmSync(imagePath)
  const restored = restoreAsset(root, result.item.id)
  assert.equal(restored.success, true)
  assert.equal(restored.item.name, '林溪.png')
  assert.equal(fs.existsSync(imagePath), true)
  assert.equal(listAssets(root, { type: 'trash' }).items.length, 0)

  const secondBookDir = path.join(root, 'second-book')
  fs.mkdirSync(secondBookDir, { recursive: true })
  fs.writeFileSync(
    path.join(secondBookDir, 'mazi.json'),
    JSON.stringify({ id: 'book-2', name: '第二本书' })
  )
  const restoredAsset = listAssets(root).items.find((item) => item.name === '林溪.png')
  const attached = attachToBook(root, {
    id: restoredAsset.id,
    bookName: '第二本书',
    type: 'character'
  })
  assert.equal(attached.success, true)
  assert.equal(attached.item.bookName, '第二本书')
  assert.equal(fs.existsSync(path.join(secondBookDir, 'character_images', '林溪.png')), true)
  const attachedAgain = attachToBook(root, {
    id: restoredAsset.id,
    bookName: '第二本书',
    type: 'character'
  })
  assert.equal(attachedAgain.item.name, '林溪_1.png')

  const gif = importAsset(root, {
    bookName: '第二本书',
    type: 'scene',
    fileName: '动图.gif',
    base64: Buffer.from('GIF89a', 'ascii').toString('base64')
  })
  assert.equal(gif.item.mimeType, 'image/gif')
  const webpBytes = Buffer.alloc(12)
  webpBytes.write('RIFF', 0, 'ascii')
  webpBytes.write('WEBP', 8, 'ascii')
  assert.equal(
    importAsset(root, {
      bookName: '第二本书',
      type: 'map',
      fileName: '地图.webp',
      base64: webpBytes.toString('base64')
    }).success,
    true
  )
  const avifBytes = Buffer.alloc(12)
  avifBytes.write('ftyp', 4, 'ascii')
  assert.equal(
    importAsset(root, {
      bookName: '第二本书',
      type: 'cover',
      fileName: '封面.avif',
      base64: avifBytes.toString('base64')
    }).success,
    true
  )
  const jpeg = importAsset(root, {
    bookName: '第二本书',
    type: 'character',
    fileName: '人物.jpg',
    base64: Buffer.from([0xff, 0xd8, 0xff, 0x01]).toString('base64')
  })
  assert.equal(jpeg.item.mimeType, 'image/jpeg')
  const attachment = importAsset(root, {
    bookName: '第二本书',
    fileName: '',
    base64: Buffer.from('attachment').toString('base64')
  })
  assert.equal(attachment.item.type, 'attachment')
  assert.equal(attachment.item.mimeType, 'application/octet-stream')
  assert.equal(listAssets(root, { type: 'all', keyword: '不存在关键词' }).items.length, 0)
  const filtered = listAssets(root, { bookName: '第二本书', keyword: '地图', type: 'map' })
  assert.equal(filtered.items.length, 1)
  assert.equal(filtered.summary.byType.map, 1)
  assert.equal(listAssets(root, { bookName: '不存在' }).items.length, 0)
  assert.throws(() => getAssetFile(root, { id: 'invalid' }), /资产文件不存在|资产 ID 无效/)
  assert.throws(
    () => importAsset(root, { bookName: '不存在', fileName: '附件.txt', base64: 'dGVzdA==' }),
    /未找到目标书籍/
  )

  fs.mkdirSync(path.join(root, 'assets-trash'), { recursive: true })
  fs.writeFileSync(path.join(root, 'assets-trash', 'manifest.json'), '{broken', 'utf-8')
  assert.throws(() => listAssets(root, { type: 'trash' }), /回收站记录读取失败/)
  fs.writeFileSync(path.join(root, 'assets-trash', 'manifest.json'), '{}', 'utf-8')
  assert.throws(() => listAssets(root, { type: 'trash' }), /回收站记录格式异常/)
  fs.writeFileSync(path.join(root, 'assets-trash', 'manifest.json'), '[null]', 'utf-8')
  assert.throws(() => listAssets(root, { type: 'trash' }), /回收站记录格式异常/)
  fs.writeFileSync(path.join(root, 'assets-trash', 'manifest.json'), '[]', 'utf-8')
  assert.throws(() => getAssetFile(root, { id: 'trash-missing', trash: true }), /回收站记录不存在/)
  fs.writeFileSync(
    path.join(root, 'assets-trash', 'manifest.json'),
    JSON.stringify([
      {
        id: 'trash-file-missing',
        name: '丢失.png',
        trashRelativePath: 'assets-trash/丢失.png'
      }
    ]),
    'utf-8'
  )
  assert.throws(
    () => getAssetFile(root, { id: 'trash-file-missing', trash: true }),
    /回收站文件不存在/
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('素材引用删除保护测试通过')

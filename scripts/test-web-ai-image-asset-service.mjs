import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import {
  confirmWebAiImage,
  discardWebAiImages,
  saveGeneratedWebImage,
  webAiImagePublicName
} from '../src/main/services/webAiImageAssetService.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-web-image-'))
const bookPath = join(root, 'book')
fs.mkdirSync(bookPath, { recursive: true })
const png = new PNG({ width: 2, height: 2 })
png.data.fill(255)
const buffer = PNG.sync.write(png)
const imageResult = {
  buffer,
  providerId: 'test-image-provider',
  model: 'test-image-model',
  dimensions: { width: 2, height: 2, valid: true }
}

try {
  const cover = saveGeneratedWebImage(
    bookPath,
    { feature: 'ai_cover', prompt: '封面' },
    imageResult
  )
  assert.equal(cover.success, true)
  assert.equal(fs.existsSync(cover.localPath), true)
  assert.equal(cover.providerId, 'test-image-provider')
  assert.equal(cover.model, 'test-image-model')

  assert.throws(
    () => saveGeneratedWebImage(bookPath, { feature: 'invalid' }, imageResult),
    /不支持的 AI 图片类型/
  )
  assert.throws(
    () => saveGeneratedWebImage(bookPath, { feature: 'ai_cover' }, { buffer: Buffer.alloc(0) }),
    /没有返回有效图片/
  )
  assert.throws(
    () => saveGeneratedWebImage(bookPath, { feature: 'ai_cover' }, { buffer: 'invalid' }),
    /没有返回有效图片/
  )

  assert.throws(
    () =>
      confirmWebAiImage(bookPath, {
        feature: 'ai_cover',
        chosenPath: join(root, 'outside.png')
      }),
    /临时图片路径无效/
  )
  assert.throws(
    () =>
      confirmWebAiImage(bookPath, {
        feature: 'ai_cover',
        chosenPath: join(bookPath, '.ai-temp', 'covers', 'missing.png')
      }),
    /临时图片不存在/
  )
  const invalidExtensionPath = join(bookPath, '.ai-temp', 'covers', 'image.jpg')
  fs.writeFileSync(invalidExtensionPath, buffer)
  assert.throws(
    () =>
      confirmWebAiImage(bookPath, {
        feature: 'ai_cover',
        chosenPath: invalidExtensionPath
      }),
    /临时图片路径无效/
  )

  const confirmedCover = confirmWebAiImage(bookPath, {
    feature: 'ai_cover',
    chosenPath: cover.localPath
  })
  assert.equal(confirmedCover.localPath, join(bookPath, 'cover.png'))
  assert.equal(fs.existsSync(confirmedCover.localPath), true)
  assert.equal(fs.existsSync(cover.localPath), false)

  const character = saveGeneratedWebImage(
    bookPath,
    {
      feature: 'ai_character_image',
      bookName: '测试书',
      characterName: '林舟',
      prompt: '黑发少年'
    },
    imageResult
  )
  const confirmedCharacter = confirmWebAiImage(bookPath, {
    feature: 'ai_character_image',
    chosenPath: character.localPath,
    bookName: '测试书',
    characterName: '林舟'
  })
  assert.equal(fs.existsSync(confirmedCharacter.localPath), true)
  assert.equal(confirmedCharacter.metadata.subjectName, '林舟')
  assert.equal(fs.existsSync(confirmedCharacter.metadata.metadataPath), true)

  const unnamedCharacter = saveGeneratedWebImage(
    bookPath,
    {
      feature: 'ai_character_image',
      model: 'payload-model'
    },
    {
      buffer,
      dimensions: { width: 2, height: 2, valid: true }
    }
  )
  assert.equal(unnamedCharacter.providerId, '')
  assert.equal(unnamedCharacter.model, '')
  const confirmedUnnamedCharacter = confirmWebAiImage(bookPath, {
    feature: 'ai_character_image',
    chosenPath: unnamedCharacter.localPath,
    subjectName: '角色<>:"/\\|?*'
  })
  assert.match(webAiImagePublicName(confirmedUnnamedCharacter.localPath), /^角色_+/)

  const scene = saveGeneratedWebImage(
    bookPath,
    { feature: 'ai_scene_image' },
    imageResult
  )
  assert.equal(scene.localPath.startsWith(join(bookPath, 'scene_images')), true)
  const map = saveGeneratedWebImage(bookPath, { feature: 'ai_map_concept' }, imageResult)
  assert.equal(map.localPath.startsWith(join(bookPath, 'map_images')), true)
  const prop = saveGeneratedWebImage(bookPath, { feature: 'ai_prop_image' }, imageResult)
  assert.equal(prop.localPath.startsWith(join(bookPath, 'prop_images')), true)

  const disposableCover = saveGeneratedWebImage(
    bookPath,
    { feature: 'ai_cover' },
    imageResult
  )
  const coverTempDir = join(bookPath, '.ai-temp', 'covers')
  fs.writeFileSync(join(coverTempDir, 'note.txt'), 'temporary', 'utf-8')
  fs.mkdirSync(join(coverTempDir, 'nested'), { recursive: true })
  const discardedFiles = discardWebAiImages(bookPath, {
    feature: 'ai_cover'
  })
  assert.equal(discardedFiles.deletedFiles, 2)
  assert.equal(fs.existsSync(disposableCover.localPath), false)

  const discarded = discardWebAiImages(bookPath, {
    feature: 'ai_cover'
  })
  assert.equal(discarded.success, true)
  assert.equal(discarded.deletedFiles, 0)
  assert.equal(webAiImagePublicName('/tmp/path/image.png'), 'image.png')
  assert.equal(webAiImagePublicName(), '')
  assert.throws(
    () => discardWebAiImages(bookPath, { feature: 'invalid' }),
    /不支持的 AI 图片类型/
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web AI image asset service tests passed')

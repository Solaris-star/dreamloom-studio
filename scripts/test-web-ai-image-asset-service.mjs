import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import {
  confirmWebAiImage,
  discardWebAiImages,
  saveGeneratedWebImage
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

  assert.throws(
    () =>
      confirmWebAiImage(bookPath, {
        feature: 'ai_cover',
        chosenPath: join(root, 'outside.png')
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

  const scene = saveGeneratedWebImage(
    bookPath,
    { feature: 'ai_scene_image' },
    imageResult
  )
  assert.equal(scene.localPath.startsWith(join(bookPath, 'scene_images')), true)

  const discarded = discardWebAiImages(bookPath, {
    feature: 'ai_cover'
  })
  assert.equal(discarded.success, true)
  assert.equal(discarded.deletedFiles, 0)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('web AI image asset service tests passed')

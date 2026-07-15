import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import {
  buildCharacterImageMetadata,
  characterImageMetadataPublicResult,
  confirmCharacterImageMetadata,
  metadataPathForImage,
  readCharacterImageMetadata,
  removeCharacterImageTempDir,
  writeCharacterImageMetadata
} from '../src/main/services/characterImageMetadata.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'character-image-metadata-'))

try {
  const bookPath = join(root, '测试作品')
  const tempDir = join(bookPath, 'ai_character_temp')
  const finalDir = join(bookPath, 'character_images')
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(finalDir, { recursive: true })

  const tempImage = join(tempDir, 'ai_char1.png')
  fs.writeFileSync(tempImage, Buffer.from('png'))

  const built = buildCharacterImageMetadata({
    localPath: tempImage,
    bookName: '测试作品',
    characterName: '林舟',
    prompt: '少年剑修，白衣，银色长发',
    negativePrompt: 'low quality',
    size: '720*1280',
    providerId: 'custom',
    model: 'image-model',
    appearance: '银发，白衣，剑匣',
    style: 'guofeng',
    pose: 'standing',
    promptIntro: '竖版全身立绘。',
    promptDetailPrefix: '人物形象：',
    visualPrompt: '银发少年背剑而立'
  })

  assert.equal(built.type, 'ai_character_image')
  assert.equal(built.subjectName, '林舟')
  assert.equal(built.visualSignature.appearance, '银发，白衣，剑匣')
  assert.equal(built.visualSignature.style, 'guofeng')
  assert.equal(built.visualSignature.pose, 'standing')
  assert.equal(built.localPath, tempImage)
  assert.ok(built.id)

  const written = await writeCharacterImageMetadata(tempImage, built)
  const tempMetadataPath = metadataPathForImage(tempImage)
  assert.equal(fs.existsSync(tempMetadataPath), true)
  assert.deepEqual(await readCharacterImageMetadata(tempImage), written)

  const finalImage = join(finalDir, 'img_1.png')
  fs.copyFileSync(tempImage, finalImage)
  const confirmed = await confirmCharacterImageMetadata(tempImage, finalImage, {
    bookName: '测试作品'
  })
  assert.equal(confirmed.localPath, finalImage)
  assert.equal(confirmed.source.tempPath, tempImage)
  assert.ok(confirmed.source.confirmedAt)
  assert.equal(fs.existsSync(metadataPathForImage(finalImage)), true)

  const publicResult = characterImageMetadataPublicResult(confirmed)
  assert.equal(publicResult.localPath, finalImage)
  assert.equal(publicResult.metadataPath, metadataPathForImage(finalImage))
  assert.equal(publicResult.visualSignature.promptDetail, '银发少年背剑而立')

  const expectedDeletedBytes = fs.statSync(tempImage).size + fs.statSync(tempMetadataPath).size
  const cleanup = removeCharacterImageTempDir(tempDir, bookPath)
  assert.equal(cleanup.existed, true)
  assert.equal(cleanup.deletedFiles, 2)
  assert.equal(cleanup.deletedBytes, expectedDeletedBytes)
  assert.equal(cleanup.tempDir, resolve(tempDir))
  assert.equal(fs.existsSync(tempDir), false)
  const emptyCleanup = removeCharacterImageTempDir(tempDir, bookPath)
  assert.equal(emptyCleanup.existed, false)
  assert.equal(emptyCleanup.deletedFiles, 0)
  assert.throws(() => removeCharacterImageTempDir(root, bookPath), /人物图临时目录无效/)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('character image metadata tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import {
  buildCharacterImageVisualCheck,
  compareCharacterImageFeatures,
  extractCharacterImageFeatures
} from '../src/main/services/characterImageConsistency.js'
import {
  characterImageMetadataPublicResult,
  confirmCharacterImageMetadata,
  metadataPathForImage,
  writeCharacterImageMetadata
} from '../src/main/services/characterImageMetadata.js'

function makePngBuffer(width, height, painter) {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2
      const color = painter(x, y, width, height)
      png.data[index] = color.r
      png.data[index + 1] = color.g
      png.data[index + 2] = color.b
      png.data[index + 3] = color.a ?? 255
    }
  }
  return PNG.sync.write(png)
}

function writePng(filePath, width, height, painter) {
  fs.writeFileSync(filePath, makePngBuffer(width, height, painter))
}

function similarCharacterColor(x, y, width, height) {
  if (y < height * 0.28) return { r: 228, g: 224, b: 214 }
  if (x < width * 0.42) return { r: 198, g: 206, b: 224 }
  return { r: 236, g: 238, b: 242 }
}

function slightlyDifferentCharacterColor(x, y, width, height) {
  if (y < height * 0.28) return { r: 220, g: 218, b: 210 }
  if (x < width * 0.42) return { r: 190, g: 202, b: 220 }
  return { r: 230, g: 235, b: 240 }
}

function differentCharacterColor(x, y, width, height) {
  if (y < height * 0.28) return { r: 35, g: 30, b: 30 }
  if (x < width * 0.42) return { r: 120, g: 35, b: 35 }
  return { r: 30, g: 42, b: 125 }
}

const root = fs.mkdtempSync(join(os.tmpdir(), 'character-image-consistency-'))

try {
  const bookPath = join(root, '测试作品')
  const tempDir = join(bookPath, 'ai_character_temp')
  const finalDir = join(bookPath, 'character_images')
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(finalDir, { recursive: true })

  const referenceImage = join(finalDir, 'img_reference.png')
  const similarImage = join(finalDir, 'img_similar.png')
  const differentImage = join(finalDir, 'img_different.png')
  const otherSubjectImage = join(finalDir, 'img_other_subject.png')
  writePng(referenceImage, 24, 36, similarCharacterColor)
  writePng(similarImage, 24, 36, slightlyDifferentCharacterColor)
  writePng(differentImage, 24, 36, differentCharacterColor)
  writePng(otherSubjectImage, 24, 36, differentCharacterColor)

  const referenceFeatures = extractCharacterImageFeatures(referenceImage)
  const similarFeatures = extractCharacterImageFeatures(similarImage)
  const differentFeatures = extractCharacterImageFeatures(differentImage)
  assert.equal(referenceFeatures.width, 24)
  assert.equal(referenceFeatures.height, 36)
  assert.ok(referenceFeatures.colorHistogram.length > 0)

  const similarComparison = compareCharacterImageFeatures(referenceFeatures, similarFeatures)
  assert.equal(similarComparison.passed, true)
  assert.ok(similarComparison.score >= 62)

  const differentComparison = compareCharacterImageFeatures(referenceFeatures, differentFeatures)
  assert.equal(differentComparison.passed, false)
  assert.ok(differentComparison.score < 62)
  assert.ok(differentComparison.issues.length > 0)

  const noSubjectCheck = buildCharacterImageVisualCheck({
    candidatePath: otherSubjectImage,
    subjectName: ''
  })
  assert.equal(noSubjectCheck.status, 'skipped')
  assert.equal(noSubjectCheck.passed, true)

  writeCharacterImageMetadata(referenceImage, {
    bookName: '测试作品',
    characterName: '林舟',
    prompt: '银发白衣少年',
    size: '720*1280'
  })
  writeCharacterImageMetadata(otherSubjectImage, {
    bookName: '测试作品',
    characterName: '沈青',
    prompt: '红衣女子',
    size: '720*1280'
  })

  const similarTempImage = join(tempDir, 'ai_char1.png')
  fs.copyFileSync(similarImage, similarTempImage)
  writeCharacterImageMetadata(similarTempImage, {
    bookName: '测试作品',
    characterName: '林舟',
    prompt: '银发白衣少年',
    size: '720*1280'
  })
  const similarFinalImage = join(finalDir, 'img_confirmed_similar.png')
  fs.copyFileSync(similarTempImage, similarFinalImage)
  const similarMetadata = confirmCharacterImageMetadata(similarTempImage, similarFinalImage, {
    bookName: '测试作品'
  })
  assert.equal(similarMetadata.visualCheck.status, 'compared')
  assert.equal(similarMetadata.visualCheck.passed, true)
  assert.equal(fs.existsSync(metadataPathForImage(similarFinalImage)), true)
  assert.equal(characterImageMetadataPublicResult(similarMetadata).visualCheck.passed, true)

  const differentTempImage = join(tempDir, 'ai_char2.png')
  fs.copyFileSync(differentImage, differentTempImage)
  writeCharacterImageMetadata(differentTempImage, {
    bookName: '测试作品',
    characterName: '林舟',
    prompt: '银发白衣少年',
    size: '720*1280'
  })
  const differentFinalImage = join(finalDir, 'img_confirmed_different.png')
  fs.copyFileSync(differentTempImage, differentFinalImage)
  const differentMetadata = confirmCharacterImageMetadata(differentTempImage, differentFinalImage, {
    bookName: '测试作品'
  })
  assert.equal(differentMetadata.visualCheck.status, 'compared')
  assert.equal(differentMetadata.visualCheck.passed, false)
  assert.ok(differentMetadata.visualCheck.issues.length > 0)

  const noReferenceTempImage = join(tempDir, 'ai_char3.png')
  fs.copyFileSync(otherSubjectImage, noReferenceTempImage)
  writeCharacterImageMetadata(noReferenceTempImage, {
    bookName: '测试作品',
    characterName: '新角色',
    prompt: '新角色',
    size: '720*1280'
  })
  const noReferenceFinalImage = join(finalDir, 'img_no_reference.png')
  fs.copyFileSync(noReferenceTempImage, noReferenceFinalImage)
  const noReferenceMetadata = confirmCharacterImageMetadata(
    noReferenceTempImage,
    noReferenceFinalImage,
    {
      bookName: '测试作品'
    }
  )
  assert.equal(noReferenceMetadata.visualCheck.status, 'no_reference')
  assert.equal(noReferenceMetadata.visualCheck.passed, true)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('character image consistency tests passed')

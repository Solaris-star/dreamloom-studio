import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  characterImageMetadataPublicResult,
  confirmCharacterImageMetadata,
  metadataPathForImage,
  writeCharacterImageMetadata
} from './characterImageMetadata.js'

const IMAGE_TYPES = {
  ai_cover: { tempDir: 'covers', finalDir: '', finalName: 'cover.png' },
  ai_character_image: { tempDir: 'characters', finalDir: 'avatars' },
  ai_scene_image: { finalDir: 'scene_images', direct: true },
  ai_map_concept: { finalDir: 'map_images', direct: true },
  ai_prop_image: { finalDir: 'prop_images', direct: true }
}

function isInside(parentPath, candidatePath) {
  const rel = relative(resolve(parentPath), resolve(candidatePath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function imageTypeOf(feature = '') {
  const type = String(feature || '').trim()
  if (IMAGE_TYPES[type]) return type
  throw new Error('不支持的 AI 图片类型')
}

function tempRoot(bookPath, type) {
  return join(resolve(bookPath), '.ai-temp', IMAGE_TYPES[type].tempDir)
}

function requireTempImage(bookPath, type, chosenPath) {
  const candidate = resolve(String(chosenPath || ''))
  const root = tempRoot(bookPath, type)
  if (!chosenPath || !isInside(root, candidate) || extname(candidate).toLowerCase() !== '.png') {
    throw new Error('临时图片路径无效')
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    throw new Error('临时图片不存在')
  }
  return candidate
}

export async function saveGeneratedWebImage(bookPath, payload = {}, imageResult = {}) {
  const type = imageTypeOf(payload.feature)
  if (!Buffer.isBuffer(imageResult.buffer) || imageResult.buffer.length === 0) {
    throw new Error('图像服务没有返回有效图片')
  }
  const config = IMAGE_TYPES[type]
  const root = config.direct
    ? join(resolve(bookPath), config.finalDir)
    : tempRoot(bookPath, type)
  fs.mkdirSync(root, { recursive: true })
  const localPath = join(root, `${Date.now()}-${randomUUID()}.png`)
  fs.writeFileSync(localPath, imageResult.buffer)

  if (type === 'ai_character_image') {
    await writeCharacterImageMetadata(localPath, {
      ...payload,
      localPath,
      providerId: imageResult.providerId,
      model: imageResult.model || payload.model || payload.modelName,
      dimensions: imageResult.dimensions
    })
  }

  return {
    success: true,
    localPath,
    output: localPath,
    providerId: imageResult.providerId || '',
    model: imageResult.model || '',
    dimensions: imageResult.dimensions
  }
}

export async function confirmWebAiImage(bookPath, payload = {}) {
  const type = imageTypeOf(payload.feature)
  const chosenPath = requireTempImage(bookPath, type, payload.chosenPath)
  const config = IMAGE_TYPES[type]
  const finalDir = join(resolve(bookPath), config.finalDir)
  fs.mkdirSync(finalDir, { recursive: true })
  const finalName =
    config.finalName ||
    `${String(payload.characterName || payload.subjectName || 'character')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 40)}-${randomUUID()}.png`
  const finalPath = join(finalDir, finalName)
  fs.copyFileSync(chosenPath, finalPath)

  let metadata = null
  if (type === 'ai_character_image') {
    metadata = await confirmCharacterImageMetadata(chosenPath, finalPath, {
      ...payload,
      imagesDir: finalDir
    })
  }
  discardWebAiImages(bookPath, { feature: type })
  return {
    success: true,
    localPath: finalPath,
    metadata: characterImageMetadataPublicResult(metadata)
  }
}

export function discardWebAiImages(bookPath, payload = {}) {
  const type = imageTypeOf(payload.feature)
  const root = tempRoot(bookPath, type)
  if (!isInside(bookPath, root)) {
    throw new Error('临时图片目录无效')
  }
  if (!fs.existsSync(root)) {
    return { success: true, deletedFiles: 0 }
  }

  let deletedFiles = 0
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const target = join(root, entry.name)
    if (!isInside(root, target)) continue
    fs.rmSync(target, { force: true })
    deletedFiles += 1
    if (extname(target).toLowerCase() === '.png') {
      fs.rmSync(metadataPathForImage(target), { force: true })
    }
  }
  fs.rmSync(root, { recursive: true, force: true })
  return { success: true, deletedFiles }
}

export function webAiImagePublicName(filePath = '') {
  return basename(String(filePath || ''))
}

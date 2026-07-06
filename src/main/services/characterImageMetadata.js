import fs from 'node:fs'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { nowIso, readJson, writeJson } from './webJsonRepository.js'
import { buildCharacterImageVisualCheck } from './characterImageConsistency.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanOptionalText(value) {
  const text = cleanText(value)
  return text || undefined
}

function isInside(parentPath, candidatePath) {
  const rel = relative(resolve(parentPath), resolve(candidatePath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function metadataPathForImage(imagePath) {
  const ext = extname(imagePath)
  return ext
    ? imagePath.slice(0, -ext.length) + '.json'
    : `${imagePath}.json`
}

export function buildCharacterImageMetadata(input = {}) {
  const imagePath = cleanText(input.localPath || input.imagePath)
  const createdAt = cleanOptionalText(input.createdAt) || nowIso()
  const prompt = cleanText(input.prompt)
  const existingSignature =
    input.visualSignature && typeof input.visualSignature === 'object' ? input.visualSignature : {}
  const existingSource = input.source && typeof input.source === 'object' ? input.source : {}
  const visualSignature = {
    appearance: cleanOptionalText(input.appearance ?? existingSignature.appearance),
    style: cleanOptionalText(input.style ?? existingSignature.style),
    pose: cleanOptionalText(input.pose ?? existingSignature.pose),
    promptIntro: cleanOptionalText(input.promptIntro ?? existingSignature.promptIntro),
    promptDetailPrefix: cleanOptionalText(
      input.promptDetailPrefix ?? existingSignature.promptDetailPrefix
    ),
    promptDetail: cleanOptionalText(
      input.visualPrompt ?? input.promptDetail ?? existingSignature.promptDetail
    )
  }

  for (const [key, value] of Object.entries(visualSignature)) {
    if (value === undefined) delete visualSignature[key]
  }

  const metadata = {
    id: cleanOptionalText(input.id) || randomUUID(),
    type: 'ai_character_image',
    localPath: imagePath,
    fileName: imagePath ? basename(imagePath) : '',
    bookName: cleanText(input.bookName),
    subjectName: cleanText(input.subjectName || input.characterName),
    prompt,
    negativePrompt: cleanText(input.negativePrompt),
    size: cleanText(input.size),
    providerId: cleanText(input.providerId),
    model: cleanText(input.model),
    visualSignature,
    source: {
      generatedAt: cleanOptionalText(existingSource.generatedAt) || createdAt,
      confirmedAt: cleanOptionalText(input.confirmedAt ?? existingSource.confirmedAt),
      tempPath: cleanOptionalText(input.tempPath ?? existingSource.tempPath)
    },
    createdAt
  }

  if (input.dimensions && typeof input.dimensions === 'object') {
    metadata.dimensions = input.dimensions
  }
  if (input.visualCheck && typeof input.visualCheck === 'object') {
    metadata.visualCheck = input.visualCheck
  }
  for (const [key, value] of Object.entries(metadata.source)) {
    if (value === undefined) delete metadata.source[key]
  }
  return metadata
}

export function writeCharacterImageMetadata(imagePath, input = {}) {
  const metadata = buildCharacterImageMetadata({
    ...input,
    localPath: imagePath
  })
  writeJson(metadataPathForImage(imagePath), metadata)
  return metadata
}

export function readCharacterImageMetadata(imagePath) {
  const metadata = readJson(metadataPathForImage(imagePath), null)
  return metadata && typeof metadata === 'object' ? metadata : null
}

export function confirmCharacterImageMetadata(chosenPath, finalPath, input = {}) {
  const existing = readCharacterImageMetadata(chosenPath)
  const metadata = buildCharacterImageMetadata({
    ...(existing || {}),
    ...input,
    localPath: finalPath,
    tempPath: chosenPath,
    confirmedAt: nowIso(),
    createdAt: existing?.createdAt || input.createdAt
  })
  metadata.visualCheck = buildCharacterImageVisualCheck({
    candidatePath: finalPath,
    imagesDir: input.imagesDir || dirname(finalPath),
    metadata,
    passScore: input.visualPassScore
  })
  writeJson(metadataPathForImage(finalPath), metadata)
  return metadata
}

export function removeCharacterImageTempDir(tempDir, bookPath = '') {
  const resolvedTempDir = tempDir ? resolve(tempDir) : ''
  if (!tempDir || !fs.existsSync(tempDir)) {
    return {
      tempDir: resolvedTempDir,
      existed: false,
      deletedFiles: 0,
      deletedBytes: 0
    }
  }
  if (bookPath && !isInside(bookPath, resolvedTempDir)) {
    throw new Error('人物图临时目录无效')
  }
  let deletedFiles = 0
  let deletedBytes = 0
  const collectDeletionStats = (dirPath) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const targetPath = resolve(dirPath, entry.name)
      if (entry.isDirectory()) {
        collectDeletionStats(targetPath)
      } else if (entry.isFile()) {
        deletedFiles += 1
        deletedBytes += fs.statSync(targetPath).size
      }
    }
  }
  collectDeletionStats(resolvedTempDir)
  fs.rmSync(resolvedTempDir, { recursive: true, force: true })
  return {
    tempDir: resolvedTempDir,
    existed: true,
    deletedFiles,
    deletedBytes
  }
}

export function characterImageMetadataPublicResult(metadata) {
  if (!metadata || typeof metadata !== 'object') return null
  return {
    id: metadata.id,
    localPath: metadata.localPath,
    fileName: metadata.fileName,
    bookName: metadata.bookName,
    subjectName: metadata.subjectName,
    prompt: metadata.prompt,
    negativePrompt: metadata.negativePrompt,
    size: metadata.size,
    providerId: metadata.providerId,
    model: metadata.model,
    dimensions: metadata.dimensions,
    visualSignature: metadata.visualSignature,
    visualCheck: metadata.visualCheck,
    source: metadata.source,
    metadataPath: metadata.localPath ? metadataPathForImage(metadata.localPath) : '',
    createdAt: metadata.createdAt
  }
}

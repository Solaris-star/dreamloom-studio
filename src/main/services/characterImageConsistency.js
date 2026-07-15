import fs from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { nowIso, readJson } from './webJsonRepository.js'

const RGB_MAX_DISTANCE = Math.sqrt(3 * 255 * 255)
const DEFAULT_PASS_SCORE = 62
const HISTOGRAM_BIN_COUNT = 64
const REGION_KEYS = ['top', 'middle', 'bottom']

function cleanText(value) {
  return String(value ?? '').trim()
}

function round(value, digits = 4) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function emptyStats() {
  return {
    count: 0,
    r: 0,
    g: 0,
    b: 0,
    luminance: 0
  }
}

function regionKeyForY(y, height) {
  if (y < height / 3) return 'top'
  if (y < (height * 2) / 3) return 'middle'
  return 'bottom'
}

function colorBucket(r, g, b) {
  const rb = Math.min(3, Math.floor(r / 64))
  const gb = Math.min(3, Math.floor(g / 64))
  const bb = Math.min(3, Math.floor(b / 64))
  return rb * 16 + gb * 4 + bb
}

function addPixel(stats, r, g, b, luminance) {
  stats.count += 1
  stats.r += r
  stats.g += g
  stats.b += b
  stats.luminance += luminance
}

function summarizeStats(stats) {
  const count = Math.max(1, stats.count)
  return {
    averageRgb: {
      r: round(stats.r / count, 1),
      g: round(stats.g / count, 1),
      b: round(stats.b / count, 1)
    },
    luminance: round(stats.luminance / count, 1),
    pixelCount: stats.count
  }
}

function colorDistance(left = {}, right = {}) {
  const dr = Number(left.r || 0) - Number(right.r || 0)
  const dg = Number(left.g || 0) - Number(right.g || 0)
  const db = Number(left.b || 0) - Number(right.b || 0)
  return clamp(Math.sqrt(dr * dr + dg * dg + db * db) / RGB_MAX_DISTANCE, 0, 1)
}

function histogramDistance(left = [], right = []) {
  let total = 0
  for (let i = 0; i < HISTOGRAM_BIN_COUNT; i += 1) {
    total += Math.abs(Number(left[i] || 0) - Number(right[i] || 0))
  }
  return clamp(total / 2, 0, 1)
}

function metadataPathForImagePath(imagePath) {
  const ext = extname(imagePath)
  return ext ? imagePath.slice(0, -ext.length) + '.json' : `${imagePath}.json`
}

function fallbackImagePathForMetadata(metadataPath) {
  return metadataPath.replace(/\.json$/i, '.png')
}

function timestampForReference(row) {
  const direct = Date.parse(row.metadata?.source?.confirmedAt || row.metadata?.createdAt || '')
  if (Number.isFinite(direct)) return direct
  try {
    return fs.statSync(row.metadataPath).mtimeMs
  } catch {
    return 0
  }
}

export function extractCharacterImageFeatures(imagePath) {
  const resolvedPath = resolve(imagePath)
  const png = PNG.sync.read(fs.readFileSync(resolvedPath))
  const totalPixels = png.width * png.height
  const globalStats = emptyStats()
  const regionStats = Object.fromEntries(REGION_KEYS.map((key) => [key, emptyStats()]))
  const histogram = Array.from({ length: HISTOGRAM_BIN_COUNT }, () => 0)
  let transparentPixels = 0
  let darkPixels = 0
  let lightPixels = 0

  for (let y = 0; y < png.height; y += 1) {
    const region = regionStats[regionKeyForY(y, png.height)]
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2
      const r = png.data[index]
      const g = png.data[index + 1]
      const b = png.data[index + 2]
      const a = png.data[index + 3]
      if (a < 16) {
        transparentPixels += 1
        continue
      }

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (luminance < 50) darkPixels += 1
      if (luminance > 205) lightPixels += 1
      histogram[colorBucket(r, g, b)] += 1
      addPixel(globalStats, r, g, b, luminance)
      addPixel(region, r, g, b, luminance)
    }
  }

  const visiblePixels = Math.max(1, globalStats.count)
  return {
    imagePath: resolvedPath,
    fileName: basename(resolvedPath),
    width: png.width,
    height: png.height,
    aspectRatio: round(png.width / png.height, 4),
    averageRgb: summarizeStats(globalStats).averageRgb,
    luminance: summarizeStats(globalStats).luminance,
    transparentRatio: round(transparentPixels / Math.max(1, totalPixels), 4),
    darkRatio: round(darkPixels / visiblePixels, 4),
    lightRatio: round(lightPixels / visiblePixels, 4),
    regions: Object.fromEntries(
      REGION_KEYS.map((key) => {
        const summary = summarizeStats(regionStats[key])
        return [
          key,
          {
            averageRgb: summary.averageRgb,
            luminance: summary.luminance,
            pixelCount: summary.pixelCount
          }
        ]
      })
    ),
    colorHistogram: histogram.map((count) => round(count / visiblePixels, 6))
  }
}

export function summarizeCharacterImageFeatures(features = {}) {
  return {
    fileName: features.fileName || (features.imagePath ? basename(features.imagePath) : ''),
    width: features.width,
    height: features.height,
    aspectRatio: features.aspectRatio,
    averageRgb: features.averageRgb,
    luminance: features.luminance,
    transparentRatio: features.transparentRatio,
    darkRatio: features.darkRatio,
    lightRatio: features.lightRatio,
    regions: features.regions
  }
}

export function compareCharacterImageFeatures(referenceFeatures, candidateFeatures, options = {}) {
  const passScore = Number.isFinite(Number(options.passScore))
    ? Number(options.passScore)
    : DEFAULT_PASS_SCORE
  const aspectBase = Math.max(Number(referenceFeatures.aspectRatio || 0), 0.01)
  const aspectDiff = clamp(
    Math.abs(
      Number(referenceFeatures.aspectRatio || 0) - Number(candidateFeatures.aspectRatio || 0)
    ) / aspectBase,
    0,
    1
  )
  const averageColorDiff = colorDistance(referenceFeatures.averageRgb, candidateFeatures.averageRgb)
  const regionColorDiff =
    REGION_KEYS.reduce((sum, key) => {
      return (
        sum +
        colorDistance(
          referenceFeatures.regions?.[key]?.averageRgb,
          candidateFeatures.regions?.[key]?.averageRgb
        )
      )
    }, 0) / REGION_KEYS.length
  const distributionDiff = histogramDistance(
    referenceFeatures.colorHistogram,
    candidateFeatures.colorHistogram
  )
  const transparentDiff = Math.abs(
    Number(referenceFeatures.transparentRatio || 0) -
      Number(candidateFeatures.transparentRatio || 0)
  )
  const toneDiff =
    Math.abs(Number(referenceFeatures.darkRatio || 0) - Number(candidateFeatures.darkRatio || 0)) *
      0.5 +
    Math.abs(
      Number(referenceFeatures.lightRatio || 0) - Number(candidateFeatures.lightRatio || 0)
    ) *
      0.5
  const weightedDiff =
    averageColorDiff * 0.24 +
    regionColorDiff * 0.26 +
    distributionDiff * 0.28 +
    aspectDiff * 0.12 +
    transparentDiff * 0.05 +
    toneDiff * 0.05
  const score = round(clamp(100 - weightedDiff * 100, 0, 100), 1)
  const issues = []

  if (aspectDiff > 0.18) issues.push('图片比例差异较大')
  if (averageColorDiff > 0.42) issues.push('整体颜色差异较大')
  if (regionColorDiff > 0.48) issues.push('上中下区域颜色差异较大')
  if (distributionDiff > 0.5) issues.push('颜色分布差异较大')
  if (transparentDiff > 0.3) issues.push('透明区域差异较大')
  if (score < passScore) issues.push(`相似度 ${score} 低于 ${passScore}`)

  return {
    passed: issues.length === 0,
    score,
    passScore,
    issues,
    metrics: {
      aspectDiff: round(aspectDiff, 4),
      averageColorDiff: round(averageColorDiff, 4),
      regionColorDiff: round(regionColorDiff, 4),
      distributionDiff: round(distributionDiff, 4),
      transparentDiff: round(transparentDiff, 4),
      toneDiff: round(toneDiff, 4)
    },
    featureSummary: {
      reference: summarizeCharacterImageFeatures(referenceFeatures),
      candidate: summarizeCharacterImageFeatures(candidateFeatures)
    }
  }
}

export async function findCharacterImageReference(imagesDir, candidatePath, subjectName) {
  const cleanSubject = cleanText(subjectName)
  if (!cleanSubject || !imagesDir || !fs.existsSync(imagesDir)) return null

  const rows = []
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.json') continue
    const metadataPath = join(imagesDir, entry.name)
    const metadata = await readJson(metadataPath, null)
    if (!metadata || typeof metadata !== 'object') continue
    if (cleanText(metadata.type) && metadata.type !== 'ai_character_image') continue
    if (cleanText(metadata.subjectName) !== cleanSubject) continue

    const imagePath = cleanText(metadata.localPath) || fallbackImagePathForMetadata(metadataPath)
    if (!imagePath || !fs.existsSync(imagePath)) continue
    if (resolve(imagePath) === resolve(candidatePath)) continue
    rows.push({ imagePath, metadataPath, metadata })
  }

  rows.sort((left, right) => timestampForReference(right) - timestampForReference(left))
  return rows[0] || null
}

export async function buildCharacterImageVisualCheck(options = {}) {
  const candidatePath = cleanText(options.candidatePath)
  const subjectName = cleanText(options.subjectName || options.metadata?.subjectName)
  const imagesDir = cleanText(options.imagesDir) || dirname(candidatePath)
  const checkedAt = nowIso()

  if (!candidatePath) {
    return {
      checkedAt,
      status: 'skipped',
      passed: false,
      issues: ['缺少候选图片路径']
    }
  }

  if (!subjectName) {
    return {
      checkedAt,
      status: 'skipped',
      passed: true,
      issues: [],
      message: '缺少人物名，未做同角色图片检查'
    }
  }

  const reference = await findCharacterImageReference(imagesDir, candidatePath, subjectName)
  if (!reference) {
    return {
      checkedAt,
      status: 'no_reference',
      passed: true,
      issues: [],
      message: '没有已确认参考图'
    }
  }

  try {
    const referenceFeatures = extractCharacterImageFeatures(reference.imagePath)
    const candidateFeatures = extractCharacterImageFeatures(candidatePath)
    const comparison = compareCharacterImageFeatures(referenceFeatures, candidateFeatures, options)
    return {
      checkedAt,
      status: 'compared',
      referencePath: reference.imagePath,
      referenceMetadataPath:
        reference.metadataPath || metadataPathForImagePath(reference.imagePath),
      score: comparison.score,
      passScore: comparison.passScore,
      passed: comparison.passed,
      issues: comparison.issues,
      metrics: comparison.metrics,
      referenceFeatures: comparison.featureSummary.reference,
      candidateFeatures: comparison.featureSummary.candidate
    }
  } catch (error) {
    return {
      checkedAt,
      status: 'error',
      referencePath: reference.imagePath,
      referenceMetadataPath:
        reference.metadataPath || metadataPathForImagePath(reference.imagePath),
      passed: false,
      issues: [error?.message || '人物图检查失败']
    }
  }
}

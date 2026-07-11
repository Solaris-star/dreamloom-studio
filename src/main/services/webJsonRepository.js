import fs from 'node:fs'
import { basename, dirname, join } from 'node:path'

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    return value == null ? fallback : value
  } catch (error) {
    throw new Error(`读取 JSON 文件失败：${filePath}：${error.message}`, { cause: error })
  }
}

export function writeJson(filePath, data) {
  const directory = dirname(filePath)
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  )
  fs.mkdirSync(directory, { recursive: true })
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // 保留原始写入错误。
    }
    throw new Error(`写入 JSON 文件失败：${filePath}：${error.message}`, { cause: error })
  }
}

export function nowIso() {
  return new Date().toISOString()
}

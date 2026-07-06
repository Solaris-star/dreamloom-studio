import fs from 'node:fs'
import { dirname } from 'node:path'

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function nowIso() {
  return new Date().toISOString()
}

#!/usr/bin/env node
/**
 * Scan user-visible English UI strings in Dreamloom Studio Vue templates.
 *
 * Goal: when default locale is Chinese, surface accidental English UI copy.
 * Excludes code identifiers, URLs, paths, model/provider brand names, API
 * parameter names, user input bindings, and test fixtures.
 *
 * Usage:
 *   node scripts/check-zh-ui-english.mjs
 *   node scripts/check-zh-ui-english.mjs --strict
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const scanRoots = [
  path.join(root, 'src/renderer/src/views'),
  path.join(root, 'src/renderer/src/components')
]
const strict = process.argv.includes('--strict')

const ALLOWED_BRANDS = new Set([
  'DeepSeek', 'Gemini', 'Imagen', 'GPT', 'GPT-4o', 'Claude', 'Dreamloom', 'Studio', 'DLS',
  'OpenAI', 'Google', 'Doubao', 'Ctrl', 'Esc', 'Enter', 'Shift', 'English', 'JSON', 'TXT',
  'URL', 'ID', 'AI', 'Agent', 'Token', 'Tokens', 'Redis', 'BullMQ', 'Web', 'Markdown', 'MD',
  'DOCX', 'tokens'
])

const ALLOWED_API_TERMS = new Set([
  'temperature', 'max_tokens', 'maxTokens', 'top_p', 'topP', 'apiKey', 'API', 'Key', 'Base',
  'URL', 'endpoint', 'timeout', 'stream', 'retry', 'model', 'provider', 'baseUrl',
  'systemPrompt', 'userPrompt'
])

const ENGLISH_WORD = /[A-Za-z][A-Za-z0-9+._-]*/g
const URL_RE = /https?:\/\/\S+/gi
const PATH_RE = /(?:^|[\s"'`(=])(?:\/[\w./-]+|[A-Za-z]:\\[\w.\\/-]+|\.\/[\w./-]+)/g
const I18N_KEY_RE = /\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,}\b/g
const MUSTACHE_RE = /\{\{[\s\S]*?\}\}/g
const BINDING_ATTR_RE =
  /:(?:title|label|placeholder|aria-label|description|content|alt)=["'][^"']*["']/g
const DYNAMIC_TEXT_RE = /t\([^)]*\)|te\([^)]*\)/g

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

function extractTemplate(source) {
  const match = source.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)
  return match ? match[1] : ''
}

function stripNoise(template) {
  return template
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(MUSTACHE_RE, ' ')
    .replace(BINDING_ATTR_RE, ' ')
    .replace(DYNAMIC_TEXT_RE, ' ')
    .replace(URL_RE, ' ')
    .replace(PATH_RE, ' ')
    .replace(I18N_KEY_RE, ' ')
}

function collectStaticTexts(template) {
  const texts = []
  for (const match of template.matchAll(/>([^<]+)</g)) {
    const raw = match[1].replace(/\s+/g, ' ').trim()
    if (raw) texts.push(raw)
  }
  for (const match of template.matchAll(
    /\b(?:title|label|placeholder|aria-label|description|alt|content)=["']([^"']+)["']/g
  )) {
    const raw = match[1].replace(/\s+/g, ' ').trim()
    if (raw) texts.push(raw)
  }
  return texts
}

function isAllowedWord(word) {
  if (!word) return true
  if (ALLOWED_BRANDS.has(word) || ALLOWED_API_TERMS.has(word)) return true
  if (/^\d+(?:px|em|rem|ms|s|%)?$/i.test(word)) return true
  if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(word)) return true
  if (/^[a-z][a-z0-9_]*$/.test(word) && word.length <= 3) return true
  if (/^[A-Za-z]$/.test(word)) return true
  if (/^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/i.test(word)) return true
  return false
}

function englishWordsIn(text) {
  return (text.match(ENGLISH_WORD) || []).filter((word) => !isAllowedWord(word))
}

function looksLikeCodeOnly(text) {
  return !/\s/.test(text) && !/[\u4e00-\u9fff]/.test(text) && /^[A-Za-z0-9_./:+-]+$/.test(text)
}

function analyzeText(text) {
  if (!text || text.length < 2) return null
  if (/\bclass\b|=|\{\{|\}|v-|@click|Object\.assign/.test(text)) return null
  if (looksLikeCodeOnly(text)) return null
  const offenders = englishWordsIn(text)
  if (!offenders.length) return null
  const nonBrand = offenders.filter((w) => !ALLOWED_BRANDS.has(w) && !ALLOWED_API_TERMS.has(w))
  if (!nonBrand.length) return null
  return { text, offenders: [...new Set(nonBrand)] }
}

const findings = []
for (const dir of scanRoots) {
  for (const file of walk(dir)) {
    const source = fs.readFileSync(file, 'utf8')
    const template = extractTemplate(source)
    if (!template) continue
    for (const text of collectStaticTexts(stripNoise(template))) {
      const hit = analyzeText(text)
      if (!hit) continue
      findings.push({ file: path.relative(root, file), text: hit.text, offenders: hit.offenders })
    }
  }
}

const seen = new Set()
const unique = []
for (const item of findings) {
  const key = `${item.file}::${item.text}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(item)
}

if (!unique.length) {
  console.log('check-zh-ui-english: no unexpected English UI strings found.')
  process.exit(0)
}

console.log(`check-zh-ui-english: found ${unique.length} potential English UI string(s):\n`)
for (const item of unique.slice(0, 200)) {
  console.log(`- ${item.file}`)
  console.log(`  text: ${item.text}`)
  console.log(`  words: ${item.offenders.join(', ')}`)
}
if (unique.length > 200) console.log(`\n... and ${unique.length - 200} more`)

if (strict) {
  console.error('\ncheck-zh-ui-english: failing because --strict was set.')
  process.exit(1)
}

console.log('\ncheck-zh-ui-english: advisory mode (pass). Use --strict to fail CI.')
process.exit(0)

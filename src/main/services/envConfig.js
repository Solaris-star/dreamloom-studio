import fs from 'node:fs'
import { resolve } from 'node:path'

let loaded = false

function parseEnvLine(line = '') {
  const trimmed = String(line || '').trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const index = trimmed.indexOf('=')
  if (index <= 0) return null
  const key = trimmed.slice(0, index).trim()
  let value = trimmed.slice(index + 1).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return { key, value }
}

export function loadEnvFile(cwd = process.cwd()) {
  if (loaded) return
  loaded = true
  const filePath = resolve(cwd, '.env')
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split(/\r?\n/)) {
    const pair = parseEnvLine(line)
    if (!pair) continue
    if (process.env[pair.key] == null) process.env[pair.key] = pair.value
  }
}

function splitList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function valueFromEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function textProviderFromEnv() {
  const apiKey = valueFromEnv('CUSTOM_TEXT_API_KEY', 'OPENAI_API_KEY')
  const baseUrl = valueFromEnv('CUSTOM_TEXT_BASE_URL', 'OPENAI_BASE_URL')
  const model = valueFromEnv('CUSTOM_TEXT_MODEL', 'OPENAI_MODEL')
  if (!apiKey || !baseUrl || !model) return null
  const models = splitList(valueFromEnv('CUSTOM_TEXT_MODELS', 'OPENAI_MODELS'))
  return {
    id: 'env:custom-text',
    name: process.env.CUSTOM_TEXT_NAME || 'Env Text Provider',
    category: 'text',
    apiType: process.env.CUSTOM_TEXT_API_TYPE || 'openai',
    baseUrl,
    model,
    models: Array.from(new Set([model, ...models].filter(Boolean))),
    apiKeys: splitList(apiKey),
    source: 'env',
    readonly: true
  }
}

function deepseekProviderFromEnv() {
  const apiKey = valueFromEnv('DEEPSEEK_API_KEY')
  if (!apiKey) return null
  const model = valueFromEnv('DEEPSEEK_MODEL') || 'deepseek-chat'
  return {
    id: 'env:deepseek',
    name: 'Env DeepSeek',
    category: 'text',
    apiType: 'openai',
    baseUrl: valueFromEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
    model,
    models: Array.from(new Set([model, 'deepseek-chat', 'deepseek-reasoner'].filter(Boolean))),
    apiKeys: splitList(apiKey),
    source: 'env',
    readonly: true
  }
}

function imageProviderFromEnv() {
  const apiKey = valueFromEnv('CUSTOM_IMAGE_API_KEY')
  const baseUrl = valueFromEnv('CUSTOM_IMAGE_BASE_URL')
  const model = valueFromEnv('CUSTOM_IMAGE_MODEL')
  if (!apiKey || !baseUrl) return null
  return {
    id: 'env:custom-image',
    name: process.env.CUSTOM_IMAGE_NAME || 'Env Image Provider',
    category: 'image',
    baseUrl,
    model,
    models: splitList(valueFromEnv('CUSTOM_IMAGE_MODELS', 'CUSTOM_IMAGE_MODEL')),
    apiKeys: splitList(apiKey),
    source: 'env',
    readonly: true
  }
}

export function getEnvAiProviders() {
  return [deepseekProviderFromEnv(), textProviderFromEnv(), imageProviderFromEnv()].filter(Boolean)
}

export function getEnvStoreValue(key) {
  const map = {
    'deepseek.apiKey': 'DEEPSEEK_API_KEY',
    'deepseek.baseUrl': 'DEEPSEEK_BASE_URL',
    'deepseek.model': 'DEEPSEEK_MODEL',
    'tongyiwanxiang.apiKey': 'TONGYI_API_KEY',
    'gemini.apiKey': 'GEMINI_API_KEY',
    'doubao.apiKey': 'DOUBAO_IMAGE_API_KEY',
    'doubao.baseUrl': 'DOUBAO_IMAGE_BASE_URL',
    'doubao.model': 'DOUBAO_IMAGE_MODEL',
    'customImageApi.apiKey': 'CUSTOM_IMAGE_API_KEY',
    'customImageApi.baseUrl': 'CUSTOM_IMAGE_BASE_URL',
    'customImageApi.model': 'CUSTOM_IMAGE_MODEL',
    'customTextApi.apiKey': 'CUSTOM_TEXT_API_KEY',
    'customTextApi.baseUrl': 'CUSTOM_TEXT_BASE_URL',
    'customTextApi.model': 'CUSTOM_TEXT_MODEL',
    'customTextApi.apiType': 'CUSTOM_TEXT_API_TYPE'
  }
  const envKey = map[key]
  return envKey ? valueFromEnv(envKey) : ''
}

export function getConfiguredStoreValue(store, key, fallback = '') {
  const envValue = getEnvStoreValue(key)
  if (envValue) return envValue
  return store?.get?.(key, fallback) ?? fallback
}

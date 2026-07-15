#!/bin/sh
set -eu

# Runs as non-root (uid 10001). Volume ownership is prepared by the compose init service.
mkdir -p /data/books /data/store /tmp /tmp/vite-temp

# /app/.store.json is a build-time symlink -> /data/store/.store.json
if [ ! -e /data/store/.store.json ]; then
  echo '{}' > /data/store/.store.json
fi

export NOVEL_BOOKS_DIR="${NOVEL_BOOKS_DIR:-/data/books}"
mkdir -p "$NOVEL_BOOKS_DIR"

node <<'NODE'
const fs = require('fs')
const path = '/data/store/.store.json'
function split(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
}
try {
  let store = {}
  try {
    store = JSON.parse(fs.readFileSync(path, 'utf8') || '{}')
  } catch {
    store = {}
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = {}
  let providers = Array.isArray(store.aiProviders) ? store.aiProviders : []
  const byId = new Map(providers.map((p) => [p && p.id, p]))

  const customKey = process.env.CUSTOM_TEXT_API_KEY || process.env.OPENAI_API_KEY || ''
  const customBase = process.env.CUSTOM_TEXT_BASE_URL || process.env.OPENAI_BASE_URL || ''
  const customModel = process.env.CUSTOM_TEXT_MODEL || process.env.OPENAI_MODEL || ''
  if (customKey && customBase && customModel) {
    byId.set('env:custom-text', {
      id: 'env:custom-text',
      name: process.env.CUSTOM_TEXT_NAME || 'Env Text Provider',
      category: 'text',
      apiType: process.env.CUSTOM_TEXT_API_TYPE || 'openai',
      baseUrl: normalizeBase(customBase),
      model: customModel,
      models: Array.from(
        new Set([customModel, ...split(process.env.CUSTOM_TEXT_MODELS || process.env.OPENAI_MODELS)])
      ),
      apiKeys: split(customKey),
      source: 'env',
      readonly: true,
      updatedAt: Date.now()
    })
  }

  const dsKey = process.env.DEEPSEEK_API_KEY || ''
  if (dsKey) {
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    byId.set('env:deepseek', {
      id: 'env:deepseek',
      name: 'Env DeepSeek',
      category: 'text',
      apiType: 'openai',
      baseUrl: normalizeBase(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
      model,
      models: Array.from(new Set([model, 'deepseek-chat', 'deepseek-reasoner'])),
      apiKeys: split(dsKey),
      source: 'env',
      readonly: true,
      updatedAt: Date.now()
    })
  }

  providers = Array.from(byId.values())
    .filter(Boolean)
    .map((p) => ({
      ...p,
      baseUrl: p.baseUrl ? normalizeBase(p.baseUrl) : p.baseUrl
    }))
  store.aiProviders = providers
  if (!store['aiProviders.activeTextId'] && providers.find((p) => p.category === 'text')) {
    store['aiProviders.activeTextId'] = providers.find((p) => p.category === 'text').id
  }
  fs.writeFileSync(path, JSON.stringify(store, null, 2))
  console.log(
    '[entrypoint] aiProviders ready:',
    providers.map((p) => `${p.id}:${p.model}`).join(', ') || '(none)'
  )
} catch (e) {
  console.warn('[entrypoint] inject aiProviders failed:', e && e.message)
}
NODE

if [ -x /data/overlay/apply.sh ]; then
  /data/overlay/apply.sh || true
fi

exec "$@"

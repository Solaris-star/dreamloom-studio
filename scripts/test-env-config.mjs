import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

const ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'CUSTOM_TEXT_API_KEY',
  'CUSTOM_TEXT_BASE_URL',
  'CUSTOM_TEXT_MODEL',
  'CUSTOM_TEXT_MODELS',
  'CUSTOM_TEXT_API_TYPE',
  'CUSTOM_IMAGE_API_KEY',
  'CUSTOM_IMAGE_BASE_URL',
  'CUSTOM_IMAGE_MODEL',
  'CUSTOM_IMAGE_MODELS',
  'TONGYI_API_KEY',
  'UNRELATED_ENV_TEST'
]

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
}

async function freshEnvConfigModule(caseName) {
  return import(`../src/main/services/envConfig.js?case=${caseName}_${Date.now()}`)
}

try {
  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]

  const cwd = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-env-'))
  fs.writeFileSync(
    join(cwd, '.env'),
    [
      'DEEPSEEK_API_KEY=deepseek-from-env',
      'DEEPSEEK_MODEL=deepseek-reasoner',
      'DEEPSEEK_BASE_URL=https://deepseek.example',
      'CUSTOM_TEXT_API_KEY=text-key-1,text-key-2',
      'CUSTOM_TEXT_BASE_URL=https://text.example',
      'CUSTOM_TEXT_MODEL=text-model-a',
      'CUSTOM_TEXT_MODELS=text-model-b,text-model-a',
      'CUSTOM_TEXT_API_TYPE=anthropic',
      'CUSTOM_IMAGE_API_KEY=image-key-1,image-key-2',
      'CUSTOM_IMAGE_BASE_URL=https://image.example',
      'CUSTOM_IMAGE_MODEL=image-model-a',
      'CUSTOM_IMAGE_MODELS=image-model-b,image-model-a',
      'TONGYI_API_KEY="tongyi quoted key"',
      '# 注释不会进入环境变量',
      'INVALID KEY=ignored',
      'NO_EQUALS_SIGN',
      'UNRELATED_ENV_TEST=first-value'
    ].join('\n'),
    'utf8'
  )

  const config = await freshEnvConfigModule('load')
  config.loadEnvFile(cwd)

  assert.equal(process.env.DEEPSEEK_API_KEY, 'deepseek-from-env')
  assert.equal(process.env.CUSTOM_TEXT_MODEL, 'text-model-a')
  assert.equal(process.env.TONGYI_API_KEY, 'tongyi quoted key')
  assert.equal(process.env['INVALID KEY'], undefined)

  fs.writeFileSync(join(cwd, '.env'), 'UNRELATED_ENV_TEST=second-value\n', 'utf8')
  config.loadEnvFile(cwd)
  assert.equal(process.env.UNRELATED_ENV_TEST, 'first-value')

  const providers = config.getEnvAiProviders()
  assert.equal(providers.length, 3)
  assert.equal(
    providers.some((provider) => provider.id === 'env:deepseek'),
    true
  )
  assert.equal(
    providers.some((provider) => provider.id === 'env:custom-text'),
    true
  )
  assert.equal(
    providers.some((provider) => provider.id === 'env:custom-image'),
    true
  )

  const textProvider = providers.find((provider) => provider.id === 'env:custom-text')
  assert.deepEqual(textProvider.apiKeys, ['text-key-1', 'text-key-2'])
  assert.deepEqual(textProvider.models, ['text-model-a', 'text-model-b'])
  assert.equal(textProvider.apiType, 'anthropic')

  const imageProvider = providers.find((provider) => provider.id === 'env:custom-image')
  assert.deepEqual(imageProvider.apiKeys, ['image-key-1', 'image-key-2'])
  assert.deepEqual(imageProvider.models, ['image-model-b', 'image-model-a'])

  const fakeStore = {
    get(key, fallback) {
      const values = {
        'deepseek.apiKey': 'deepseek-from-store',
        'customTextApi.baseUrl': 'https://store-text.example',
        'customImageApi.model': 'store-image-model'
      }
      return values[key] ?? fallback
    }
  }
  assert.equal(
    config.getConfiguredStoreValue(fakeStore, 'deepseek.apiKey', ''),
    'deepseek-from-env'
  )
  assert.equal(
    config.getConfiguredStoreValue(fakeStore, 'customTextApi.baseUrl', ''),
    'https://text.example'
  )
  assert.equal(config.getEnvStoreValue('tongyiwanxiang.apiKey'), 'tongyi quoted key')
  assert.equal(config.getEnvStoreValue('unknown.key'), '')
  assert.equal(config.getConfiguredStoreValue(null, 'unknown.key', 'fallback'), 'fallback')

  delete process.env.CUSTOM_IMAGE_MODEL
  assert.equal(
    config.getConfiguredStoreValue(fakeStore, 'customImageApi.model', ''),
    'store-image-model'
  )

  fs.rmSync(cwd, { recursive: true, force: true })

  restoreEnv()
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.DEEPSEEK_API_KEY = 'existing-value'
  const cwdNoOverride = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-env-no-override-'))
  fs.writeFileSync(join(cwdNoOverride, '.env'), 'DEEPSEEK_API_KEY=file-value\n', 'utf8')
  const noOverrideConfig = await freshEnvConfigModule('no_override')
  noOverrideConfig.loadEnvFile(cwdNoOverride)
  assert.equal(process.env.DEEPSEEK_API_KEY, 'existing-value')
  fs.rmSync(cwdNoOverride, { recursive: true, force: true })

  const emptyCwd = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-env-empty-'))
  const emptyConfig = await freshEnvConfigModule('empty')
  emptyConfig.loadEnvFile(emptyCwd)
  assert.deepEqual(emptyConfig.getEnvAiProviders(), [
    {
      id: 'env:deepseek',
      name: 'Env DeepSeek',
      category: 'text',
      apiType: 'openai',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      apiKeys: ['existing-value'],
      source: 'env',
      readonly: true
    }
  ])
  fs.rmSync(emptyCwd, { recursive: true, force: true })
} finally {
  restoreEnv()
}

console.log('env config tests passed')

import assert from 'node:assert/strict'
import fs from 'node:fs'

const values = new Map()
globalThis.fetch = async (url, options = {}) => {
  const payload = JSON.parse(options.body || '{}')
  if (url === '/api/store/set') values.set(payload.key, payload.value)
  const body =
    url === '/api/store/get'
      ? { success: true, key: payload.key, value: values.get(payload.key) }
      : { success: true, key: payload.key }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const history = await import('../src/renderer/src/composables/useAICoverFormHistory.js')
const makeEntry = (index) => ({
  penName: `作者${index}`,
  coverSize: '600x800',
  backgroundPrompt: `背景${index}`,
  titlePrompt: '标题',
  authorPrompt: '作者',
  negativePrompt: '',
  selectedPromptTags: [],
  imageProviderId: 'provider'
})

await history.pushAiCoverFormHistory('测试书籍', makeEntry(1))
await history.pushAiCoverFormHistory('测试书籍', makeEntry(1))
assert.equal((await history.loadAiCoverFormHistory('测试书籍')).length, 1)

for (let index = 2; index <= 25; index += 1) {
  await history.pushAiCoverFormHistory('测试书籍', makeEntry(index))
}
const rows = await history.loadAiCoverFormHistory('测试书籍')
assert.equal(rows.length, 20)
assert.equal(rows[0].penName, '作者25')
assert.equal((await history.loadAiCoverFormHistory('另一本书')).length, 0)

const themeSource = fs.readFileSync('src/renderer/src/stores/theme.js', 'utf8')
assert.match(themeSource, /getStoreValue\('config\.theme', 'light'\)/)
assert.match(themeSource, /if \(!themeConfigs\[theme\]\)/)

const localeSource = fs.readFileSync('src/renderer/src/i18n/index.js', 'utf8')
assert.match(localeSource, /getStoreValue\('config\.locale', ''\)/)
assert.match(localeSource, /lowered\.startsWith\('zh'\)/)
assert.match(localeSource, /lowered\.startsWith\('en'\)/)

console.log('Web 界面偏好设置测试通过')

import assert from 'node:assert/strict'
import { handlePromptRoute, isPromptRoute } from '../src/main/webApi/promptRoutes.js'

const calls = []
const responses = []
const service = {
  listPresets: (...args) => (calls.push(['list', ...args]), [{ id: 'p1' }]),
  createPreset: (...args) => (calls.push(['create', ...args]), { id: 'p2' }),
  updatePreset: (...args) => (calls.push(['update', ...args]), { id: args[1] }),
  deletePreset: (...args) => (calls.push(['delete', ...args]), true),
  exportPresets: (...args) => (calls.push(['export', ...args]), '[{"id":"p1"}]'),
  importPresets: (...args) => (calls.push(['import', ...args]), [{ id: 'p3' }])
}
const resolved = []
const common = {
  res: {},
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  resolvePresetPath: (payload) => {
    resolved.push(payload)
    return 'D:/books/长夜'
  },
  service
}

for (const path of [
  '/api/prompts/list',
  '/api/prompts/create',
  '/api/prompts/update',
  '/api/prompts/delete',
  '/api/prompts/export',
  '/api/prompts/import'
]) {
  assert.equal(isPromptRoute(path), true)
}
assert.equal(isPromptRoute('/api/settings/export'), false)
assert.equal(
  handlePromptRoute({ ...common, path: '/api/settings/export', body: {} }),
  false
)
assert.equal(resolved.length, 0)

const listBody = { category: 'continue', bookPath: 'D:/books/长夜' }
handlePromptRoute({ ...common, path: '/api/prompts/list', body: listBody })
assert.equal(resolved.at(-1), listBody)
assert.deepEqual(calls.at(-1), ['list', 'D:/books/长夜', listBody])
assert.deepEqual(responses.at(-1), [{ success: true, presets: [{ id: 'p1' }] }, undefined])

const createBody = { preset: { name: '续写' }, overwrite: false }
handlePromptRoute({ ...common, path: '/api/prompts/create', body: createBody })
assert.deepEqual(calls.at(-1), [
  'create',
  'D:/books/长夜',
  createBody.preset,
  createBody
])
assert.deepEqual(responses.at(-1)[0], { success: true, preset: { id: 'p2' } })

const updateBody = { presetId: 'p2', preset: { name: '新续写' } }
handlePromptRoute({ ...common, path: '/api/prompts/update', body: updateBody })
assert.deepEqual(calls.at(-1), [
  'update',
  'D:/books/长夜',
  'p2',
  updateBody.preset,
  updateBody
])
assert.deepEqual(responses.at(-1), [{ success: true, preset: { id: 'p2' } }, 200])

handlePromptRoute({
  ...common,
  path: '/api/prompts/update',
  body: { preset: { id: 'missing' } },
  service: { ...service, updatePreset: () => null }
})
assert.deepEqual(responses.at(-1), [
  { success: false, message: 'Prompt 模板不存在' },
  404
])

handlePromptRoute({ ...common, path: '/api/prompts/delete', body: { id: 'p2' } })
assert.deepEqual(calls.at(-1), ['delete', 'D:/books/长夜', 'p2'])
assert.deepEqual(responses.at(-1), [{ success: true, presetId: 'p2' }, 200])

handlePromptRoute({
  ...common,
  path: '/api/prompts/delete',
  body: { presetId: 'missing' },
  service: { ...service, deletePreset: () => false }
})
assert.deepEqual(responses.at(-1), [
  { success: false, message: 'Prompt 模板不存在' },
  404
])

handlePromptRoute({ ...common, path: '/api/prompts/export', body: {} })
assert.deepEqual(calls.at(-1), ['export', 'D:/books/长夜'])
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  jsonString: '[{"id":"p1"}]'
})

const importBody = { jsonString: '[{"name":"导入模板"}]', overwrite: true }
handlePromptRoute({ ...common, path: '/api/prompts/import', body: importBody })
assert.deepEqual(calls.at(-1), [
  'import',
  'D:/books/长夜',
  importBody.jsonString,
  importBody
])
assert.deepEqual(responses.at(-1)[0], {
  success: true,
  presets: [{ id: 'p3' }],
  count: 1
})

const importError = new Error('Prompt 模板导入格式错误')
assert.throws(
  () =>
    handlePromptRoute({
      ...common,
      path: '/api/prompts/import',
      body: { jsonString: '{bad json' },
      service: {
        ...service,
        importPresets: () => {
          throw importError
        }
      }
    }),
  importError
)

console.log('提示词路由测试通过')

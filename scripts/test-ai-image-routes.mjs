import assert from 'node:assert/strict'
import { handleAiImageRoute, isAiImageRoute } from '../src/main/webApi/aiImageRoutes.js'

const responses = []
const calls = []
const common = {
  res: {},
  booksDir: 'D:\\books',
  sendJson: (_res, payload, status) => responses.push([payload, status]),
  store: { name: 'store' },
  resolveBookPath: (payload, booksDir, options) => {
    calls.push(['path', payload, booksDir, options])
    return 'D:\\books\\作品'
  },
  generateImage: async (store, payload) => {
    calls.push(['generate', store, payload])
    return { buffer: Buffer.from('image') }
  },
  saveImage: (bookPath, payload, result) => {
    calls.push(['save', bookPath, payload, result])
    return { success: true, localPath: `${bookPath}\\temp.png` }
  },
  confirmImage: (bookPath, payload) => {
    calls.push(['confirm', bookPath, payload])
    return { success: true, localPath: `${bookPath}\\cover.png` }
  },
  discardImages: (bookPath, payload) => {
    calls.push(['discard', bookPath, payload])
    return { success: true, deletedFiles: 2 }
  },
  toImageUrl: (_bookPath, localPath) => `/image/${localPath.split('\\').at(-1)}`
}

for (const path of [
  '/api/ai/image-task',
  '/api/ai/cover/confirm',
  '/api/ai/cover/discard',
  '/api/ai/character/confirm',
  '/api/ai/character/discard'
]) {
  assert.equal(isAiImageRoute(path), true)
}
assert.equal(await handleAiImageRoute({ ...common, path: '/api/ai/history' }), false)

await handleAiImageRoute({
  ...common,
  path: '/api/ai/image-task',
  body: { bookName: '作品', feature: 'ai_scene_image' }
})
assert.equal(responses.at(-1)[0].imageUrl, '/image/temp.png')
assert.equal(calls.find((call) => call[0] === 'path')[3].ensure, true)
assert.equal(calls.find((call) => call[0] === 'generate')[1], common.store)

await handleAiImageRoute({
  ...common,
  path: '/api/ai/cover/confirm',
  body: { bookName: '作品', feature: 'ai_character_image', chosenPath: 'temp.png' }
})
assert.equal(calls.at(-1)[0], 'confirm')
assert.equal(calls.at(-1)[2].feature, 'ai_cover')
assert.equal(responses.at(-1)[0].imageUrl, '/image/cover.png')

await handleAiImageRoute({
  ...common,
  path: '/api/ai/character/discard',
  body: { bookName: '作品', feature: 'ai_cover' }
})
assert.equal(calls.at(-1)[0], 'discard')
assert.equal(calls.at(-1)[2].feature, 'ai_character_image')
assert.deepEqual(responses.at(-1)[0], { success: true, deletedFiles: 2 })

console.log('AI 图片路由测试通过')

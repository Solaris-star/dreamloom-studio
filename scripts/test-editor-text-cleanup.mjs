import assert from 'node:assert/strict'
import {
  applyParagraphDiffChoices,
  buildParagraphDiff,
  cleanEditorText,
  createTextRevisionToken,
  requestEditorTextCleanup
} from '../src/renderer/src/service/editorTextCleanup.js'

assert.equal(createTextRevisionToken('相同正文'), createTextRevisionToken('相同正文'))
assert.notEqual(createTextRevisionToken('正文 A'), createTextRevisionToken('正文 B'))
assert.match(createTextRevisionToken('正文'), /^text-2-[0-9a-f]{8}$/)

assert.deepEqual(buildParagraphDiff('第一段\n\n第二段', '第一段\n\n修正段'), [
  { type: 'unchanged', before: '第一段', after: '第一段' },
  { type: 'changed', before: '第二段', after: '修正段' }
])
assert.deepEqual(buildParagraphDiff('保留\n\n删除', '保留'), [
  { type: 'unchanged', before: '保留', after: '保留' },
  { type: 'removed', before: '删除', after: '' }
])
assert.deepEqual(buildParagraphDiff('保留', '保留\n\n新增'), [
  { type: 'unchanged', before: '保留', after: '保留' },
  { type: 'added', before: '', after: '新增' }
])
assert.equal(
  applyParagraphDiffChoices(
    [
      { type: 'unchanged', before: '保留', after: '保留' },
      { type: 'changed', before: '原段', after: '改段' },
      { type: 'removed', before: '删除段', after: '' },
      { type: 'added', before: '', after: '新增段' }
    ],
    [false, false, false, true]
  ),
  '保留\n\n原段\n\n删除段\n\n新增段'
)
assert.equal(
  applyParagraphDiffChoices(
    [
      { type: 'changed', before: '原段', after: '改段' },
      { type: 'removed', before: '删除段', after: '' },
      { type: 'added', before: '', after: '新增段' }
    ],
    [true, true, false]
  ),
  '改段'
)
assert.equal(applyParagraphDiffChoices(null), '')

const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || '{}')
  requests.push({ url, body })
  if (url === '/api/store/get' && body.key === 'editorModelDefaults') {
    return new Response(JSON.stringify({ success: true, key: body.key, value: { writing: 'p1::m1' } }))
  }
  if (url === '/api/ai/text-task') {
    return new Response(JSON.stringify({ success: true, content: '原文修正', providerId: 'p1' }))
  }
  throw new Error(`unexpected request: ${url}`)
}

try {
  const result = await cleanEditorText('原文', {
    bookId: 'book',
    chapterId: 'chapter',
    selection: { from: 1, to: 3 },
    editVersion: 'version'
  })
  assert.equal(result.content, '原文修正')
  assert.equal(result.diff[0].type, 'changed')
  assert.equal(result.removedRatio, 0)
  assert.deepEqual(result.warnings, [])
  assert.deepEqual(requests[1].body.selection, { from: 1, to: 3 })
  assert.equal(requests[1].body.chapterId, 'chapter')
  assert.equal(requests[1].body.editVersion, 'version')
  assert.equal(requests[1].body.providerId, 'p1')
  assert.equal(requests[1].body.modelName, 'm1')

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, content: '短' }))
  const shortened = await cleanEditorText('这是一段明显更长的原始正文', {
    providerId: 'p1'
  })
  assert.ok(shortened.removedRatio >= 0.3)
  assert.equal(shortened.warnings.length, 1)

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, content: '' }))
  await assert.rejects(
    () => requestEditorTextCleanup({ text: '原文', providerId: 'p1' }),
    /空内容/
  )

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: '模型不可用' }))
  await assert.rejects(
    () => requestEditorTextCleanup({ text: '原文', providerId: 'p1' }),
    /模型不可用/
  )

  let explicitModelRequests = 0
  globalThis.fetch = async (url, options = {}) => {
    explicitModelRequests += 1
    assert.equal(url, '/api/ai/text-task')
    const body = JSON.parse(options.body || '{}')
    assert.equal(body.modelId, 'manual-model')
    assert.equal(body.providerId, 'manual-provider')
    return new Response(
      JSON.stringify({
        success: true,
        result: '显式模型结果',
        usage: { totalTokens: 12 },
        model: 'manual-model'
      })
    )
  }
  const explicitModel = await requestEditorTextCleanup({
    text: '原文',
    modelId: 'manual-model',
    providerId: 'manual-provider'
  })
  assert.equal(explicitModelRequests, 1)
  assert.equal(explicitModel.content, '显式模型结果')
  assert.deepEqual(explicitModel.usage, { totalTokens: 12 })
  assert.equal(explicitModel.model, 'manual-model')

  const fallbackRequests = []
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    fallbackRequests.push({ url, body })
    if (url === '/api/store/get' && body.key === 'editorModelDefaults') {
      return new Response(JSON.stringify({ success: true, key: body.key, value: {} }))
    }
    if (url === '/api/store/get' && body.key === 'aiProviders.activeTextId') {
      return new Response(
        JSON.stringify({ success: true, key: body.key, value: 'fallback-provider' })
      )
    }
    return new Response(JSON.stringify({ success: true, text: '后备模型结果' }))
  }
  const fallbackModel = await requestEditorTextCleanup({ text: '原文' })
  assert.equal(fallbackRequests.length, 3)
  assert.equal(fallbackRequests[2].body.providerId, 'fallback-provider')
  assert.equal(fallbackModel.content, '后备模型结果')
  assert.equal(fallbackModel.providerId, 'fallback-provider')

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: true, key: 'editorModelDefaults', value: ['invalid'] })
    )
  await assert.rejects(() => requestEditorTextCleanup({ text: '原文' }), /设置格式不正确/)

  await assert.rejects(() => requestEditorTextCleanup({ text: '   ' }), /待清理内容不能为空/)
} finally {
  globalThis.fetch = originalFetch
}
console.log('editor text cleanup tests passed')

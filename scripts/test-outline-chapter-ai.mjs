import assert from 'node:assert/strict'
import outlineChapterAiService from '../src/main/services/outlineChapterAi.js'

{
  const calls = []
  const result = await outlineChapterAiService.generateChapterFromOutline(
    {
      outlineTitle: '雨夜入城',
      outlineContent: '主角在雨夜进城，并发现城门守卫正在搜查一枚旧印。',
      targetWords: 1800,
      previousChapterExcerpt: '远处城墙已经出现在雨幕里。'
    },
    {
      async chat(options) {
        calls.push(options)
        return { content: '雨水沿着斗笠边缘落下，林舟抬头看向城门。' }
      }
    }
  )
  assert.match(result.content, /林舟/)
  assert.equal(calls[0].temperature, 0.62)
  assert.equal(calls[0].max_tokens, 3961)
  assert.match(calls[0].messages[1].content, /雨夜入城/)
  assert.match(calls[0].messages[1].content, /上一章正文节选/)
}

await assert.rejects(
  () =>
    outlineChapterAiService.generateChapterFromOutline(
      { outlineContent: '' },
      { async chat() { return { content: '不应调用' } } }
    ),
  /章纲内容为空/
)

await assert.rejects(
  () =>
    outlineChapterAiService.generateChapterFromOutline(
      { outlineContent: '有章纲' },
      { async chat() { return { content: '   ' } } }
    ),
  /返回章节内容为空/
)

console.log('outline chapter ai tests passed')

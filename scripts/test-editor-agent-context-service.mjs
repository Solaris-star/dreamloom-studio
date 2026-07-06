import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  detectEditorAgentBookContextSources,
  editorAgentBookContextRecord,
  formatEditorAgentBookContext,
  loadEditorAgentBookContext,
  summarizeEditorAgentBookContext
} from '../src/main/services/editorAgentContextService.js'
import { buildBookWritingContextBlock } from '../src/main/services/bookWritingContext.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-agent-context-'))
const bookPath = join(rootDir, '风雪试剑')

function writeJson(fileName, value) {
  fs.writeFileSync(join(bookPath, fileName), JSON.stringify(value, null, 2), 'utf-8')
}

function restoreJson(fileName, value) {
  writeJson(fileName, value)
}

try {
  fs.mkdirSync(bookPath, { recursive: true })
  writeJson('mazi.json', {
    name: '风雪试剑',
    type: '玄幻',
    intro: '北境少年林青在风雪里寻找失踪的师父。'
  })
  writeJson('characters.json', [
    {
      name: '林青',
      gender: '男',
      age: 17,
      tags: ['剑修'],
      biography: '林青守着北境旧剑馆，性格谨慎，不会主动泄露师父留下的玉印。'
    },
    {
      name: '沈岚',
      gender: '女',
      age: 19,
      biography: '沈岚是边城药师，知道雪狐谷的旧路。'
    }
  ])
  writeJson('dictionary.json', [
    {
      name: '雪狐谷',
      introduction: '北境旧商道旁的山谷，夜里会出现蓝色磷光。',
      children: []
    }
  ])
  writeJson('settings.json', {
    categories: [
      {
        name: '北境',
        introduction: '长年风雪，边城依靠剑馆和药铺守住商道。',
        items: [
          { name: '玉印', introduction: '师父失踪前留下的信物，不可被陌生人看到。' }
        ],
        children: []
      }
    ]
  })
  writeJson('timelines.json', [
    {
      title: '主线',
      nodes: [
        { title: '师父失踪', desc: '林青在雪夜发现剑馆暗室空了。' }
      ]
    }
  ])

  const context = await loadEditorAgentBookContext(bookPath, {
    title: '第一章',
    instruction: '续写林青进入雪狐谷后的场景。',
    contextText: '林青带着玉印和沈岚同行。'
  })

  assert.equal(context.loaded, true)
  assert.ok(context.contextChars > 0)
  assert.ok(context.sourceCount >= 5)
  assert.ok(context.sources.some((item) => item.type === 'book_meta'))
  assert.ok(context.sources.some((item) => item.type === 'characters'))
  assert.ok(context.sources.some((item) => item.type === 'dictionary'))
  assert.ok(context.block.includes('【书籍信息】'))
  assert.ok(context.block.includes('林青'))
  assert.ok(context.block.includes('雪狐谷'))

  const formatted = formatEditorAgentBookContext(context)
  assert.ok(formatted.includes('【人物设定】'))

  const summary = summarizeEditorAgentBookContext(context)
  assert.ok(summary.includes('已读取'))
  assert.ok(summary.includes('作品资料'))

  const record = editorAgentBookContextRecord(context)
  assert.equal(record.loaded, true)
  assert.equal(record.sourceCount, context.sources.length)
  assert.ok(record.preview.includes('书籍信息'))

  const detected = detectEditorAgentBookContextSources(bookPath, context.block)
  assert.equal(detected.length, context.sources.length)

  const directContext = await buildBookWritingContextBlock(bookPath, {
    outlineTitle: '第一章',
    outlineContent: '林青带着玉印和沈岚进入雪狐谷。'
  })
  assert.ok(directContext.includes('【人物设定】'))

  const originalCharacters = JSON.parse(fs.readFileSync(join(bookPath, 'characters.json'), 'utf-8'))
  fs.writeFileSync(join(bookPath, 'characters.json'), '{ bad json', 'utf-8')
  await assert.rejects(
    () =>
      buildBookWritingContextBlock(bookPath, {
        outlineTitle: '第一章',
        outlineContent: '林青进入雪狐谷。'
      }),
    /读取作品资料失败/
  )
  const contextAfterBadJson = await loadEditorAgentBookContext(bookPath, {
    title: '第一章',
    instruction: '续写林青进入雪狐谷后的场景。'
  })
  assert.equal(contextAfterBadJson.loaded, false)
  assert.match(contextAfterBadJson.error, /读取作品资料失败/)
  restoreJson('characters.json', originalCharacters)

  writeJson('characters.json', { name: '林青' })
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /characters\.json 格式错误，应为数组/
  )
  restoreJson('characters.json', originalCharacters)

  writeJson('dictionary.json', { name: '雪狐谷' })
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /dictionary\.json 格式错误，应为数组/
  )
  writeJson('dictionary.json', [
    {
      name: '雪狐谷',
      introduction: '北境旧商道旁的山谷，夜里会出现蓝色磷光。',
      children: []
    }
  ])

  writeJson('settings.json', {})
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /settings\.json 格式错误，应包含 categories 数组/
  )
  writeJson('settings.json', {
    categories: [
      {
        name: '北境',
        introduction: '长年风雪，边城依靠剑馆和药铺守住商道。',
        items: [
          { name: '玉印', introduction: '师父失踪前留下的信物，不可被陌生人看到。' }
        ],
        children: []
      }
    ]
  })

  writeJson('timelines.json', { title: '主线' })
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /timelines\.json 格式错误，应为数组/
  )
  writeJson('timelines.json', [
    {
      title: '主线',
      nodes: [
        { title: '师父失踪', desc: '林青在雪夜发现剑馆暗室空了。' }
      ]
    }
  ])

  writeJson('entity_profiles.json', { artifact: { name: '玉印' } })
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /entity_profiles\.json 格式错误，artifact 应为数组/
  )
  fs.rmSync(join(bookPath, 'entity_profiles.json'), { force: true })

  const missing = await loadEditorAgentBookContext(join(rootDir, '不存在的作品'), {})
  assert.equal(missing.loaded, false)
  assert.equal(missing.error, '作品目录不存在')
  assert.equal(formatEditorAgentBookContext(missing), '未读取到可用作品资料。')
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('editor agent context service tests passed')

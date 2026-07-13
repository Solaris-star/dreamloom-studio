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
        items: [{ name: '玉印', introduction: '师父失踪前留下的信物，不可被陌生人看到。' }],
        children: []
      }
    ]
  })
  writeJson('timelines.json', [
    {
      title: '主线',
      nodes: [{ title: '师父失踪', desc: '林青在雪夜发现剑馆暗室空了。' }]
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
  assert.deepEqual(detectEditorAgentBookContextSources('', context.block), [])
  assert.deepEqual(detectEditorAgentBookContextSources(bookPath, ''), [])

  const knowledgeSources = detectEditorAgentBookContextSources(
    bookPath,
    '【书籍信息】\n【拆书知识参考】'
  )
  assert.equal(knowledgeSources.length, 2)
  assert.equal(knowledgeSources[1].type, 'knowledge')
  assert.equal(knowledgeSources[1].path, '')
  fs.mkdirSync(join(bookPath, 'knowledge'))
  assert.equal(
    detectEditorAgentBookContextSources(bookPath, '【拆书知识参考】')[0].path,
    join(bookPath, 'knowledge')
  )

  assert.deepEqual(editorAgentBookContextRecord(), {
    loaded: false,
    sourceCount: 0,
    contextChars: 0,
    sources: [],
    preview: '',
    error: '',
    loadedAt: ''
  })
  assert.equal(
    editorAgentBookContextRecord({
      loaded: 1,
      sourceCount: '2',
      contextChars: '3',
      sources: [{ label: '人物' }],
      block: ' x ',
      error: 4,
      loadedAt: ' now '
    }).sourceCount,
    2
  )
  assert.equal(
    editorAgentBookContextRecord({ sourceCount: 'bad', contextChars: 'bad', sources: [{}] })
      .sourceCount,
    1
  )
  assert.equal(summarizeEditorAgentBookContext({ error: '文件损坏' }), '作品资料读取失败：文件损坏')
  assert.equal(summarizeEditorAgentBookContext({ loaded: false }), '未读取到可用作品资料。')
  assert.equal(
    summarizeEditorAgentBookContext({
      loaded: true,
      sourceCount: 1,
      contextChars: 8,
      sources: [{}]
    }),
    '已读取 1 类作品资料，约 8 字。'
  )
  assert.equal(formatEditorAgentBookContext({ block: 123 }), '未读取到可用作品资料。')

  const directContext = await buildBookWritingContextBlock(bookPath, {
    outlineTitle: '第一章',
    outlineContent: '林青带着玉印和沈岚进入雪狐谷。'
  })
  assert.ok(directContext.includes('【人物设定】'))

  const limitedContext = await loadEditorAgentBookContext(
    bookPath,
    { chapterId: 'chapter-1', selectedText: '雪狐谷' },
    { maxTotalChars: 200 }
  )
  assert.equal(limitedContext.loaded, true)
  assert.ok(limitedContext.contextChars < context.contextChars)

  const defaultOptionsContext = await loadEditorAgentBookContext(
    bookPath,
    { currentChapterText: '林青继续前行。' },
    { maxTotalChars: 0 }
  )
  assert.equal(defaultOptionsContext.loaded, true)

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
        items: [{ name: '玉印', introduction: '师父失踪前留下的信物，不可被陌生人看到。' }],
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
      nodes: [{ title: '师父失踪', desc: '林青在雪夜发现剑馆暗室空了。' }]
    }
  ])

  writeJson('entity_profiles.json', { artifact: { name: '玉印' } })
  await assert.rejects(
    () => buildBookWritingContextBlock(bookPath, {}),
    /entity_profiles\.json 格式错误，artifact 应为数组/
  )

  writeJson('mazi.json', {
    name: '风雪试剑',
    type: '玄幻',
    intro: '北境'.repeat(500)
  })
  writeJson('characters.json', [
    {
      name: '林青',
      gender: 0,
      age: 0,
      height: 0,
      tags: [' 剑修 ', '', ' ', '守信', '北境', '少年', '谨慎', '寻师', '玉印', '多余'],
      appearance: '披着旧斗篷'.repeat(80),
      introduction: '守着北境旧剑馆'.repeat(80)
    },
    {
      name: '',
      gender: '',
      age: '',
      height: '',
      tags: '无效标签',
      biography: ''
    },
    ...Array.from({ length: 9 }, (_, index) => ({
      name: `路人${index}`,
      biography: `第 ${index} 位路人`
    }))
  ])
  writeJson('entity_profiles.json', {
    mount: [
      { name: '踏雪', biography: '林青的坐骑'.repeat(80) },
      { name: '', introduction: '' },
      { name: '青骢', introduction: '边城驿马' },
      { name: '乌云', introduction: '沈岚的马' }
    ],
    monster: [{ name: '雪魇', introduction: '藏在雪地里的怪兽' }],
    spirit_beast: [{ name: '灵狐', introduction: '' }],
    artifact: [{ name: '玉印', introduction: '师父留下的信物' }]
  })
  writeJson('dictionary.json', [
    {
      name: '',
      children: [
        { name: ' 雪狐谷 ', introduction: '' },
        { name: '玉印', introduction: '师父留下的信物'.repeat(40) }
      ]
    },
    { name: '北境', introduction: '' }
  ])
  writeJson('settings.json', {
    categories: [
      {
        name: '',
        introduction: '没有名称的分类',
        items: [{ name: '', introduction: '无效条目' }],
        children: [
          {
            name: '地理',
            introduction: '',
            items: [
              { name: '雪原', introduction: '' },
              { name: '雪狐谷', introduction: '北境旧商道'.repeat(60) }
            ],
            children: '无效子分类'
          }
        ]
      },
      {
        name: '空分类',
        introduction: '',
        items: null,
        children: []
      }
    ]
  })
  writeJson('timelines.json', [
    { title: '空时间线', nodes: [] },
    {
      title: '',
      nodes: [
        { title: '', desc: '' },
        { title: '师父失踪'.repeat(20), desc: '林青发现暗室空了'.repeat(40) }
      ]
    }
  ])

  const matchedContext = await buildBookWritingContextBlock(bookPath, {
    outlineTitle: '踏雪入谷',
    outlineContent: '林青带着玉印进入雪狐谷，途中遇到雪魇。',
    maxTotalChars: 20000
  })
  assert.ok(matchedContext.includes('性别：0'))
  assert.ok(matchedContext.includes('年龄：0'))
  assert.ok(matchedContext.includes('身高：0'))
  assert.ok(matchedContext.includes('标签：剑修、守信、北境、少年、谨慎、寻师、玉印、多余'))
  assert.ok(matchedContext.includes('坐骑：\n「踏雪」'))
  assert.ok(matchedContext.includes('怪兽：\n「雪魇」'))
  assert.ok(matchedContext.includes('妖兽：\n「灵狐」'))
  assert.ok(matchedContext.includes('宝器：\n「玉印」'))
  assert.ok(matchedContext.includes('未分类 / 地理｜「雪狐谷」'))
  assert.ok(matchedContext.includes('时间线\n- '))

  const unmatchedContext = await buildBookWritingContextBlock(bookPath, {
    outlineTitle: '陌生章节',
    outlineContent: '无人知晓的远方',
    maxTotalChars: 20000
  })
  assert.ok(unmatchedContext.includes('姓名：（未命名）'))
  assert.ok(unmatchedContext.includes('「（未命名）」'))
  assert.ok(unmatchedContext.includes('「北境」'))
  assert.ok(unmatchedContext.includes('未分类｜分类说明：没有名称的分类'))
  assert.ok(unmatchedContext.includes('未分类 / 地理｜「雪原」'))

  const truncatedContext = await buildBookWritingContextBlock(bookPath, {
    maxTotalChars: 120
  })
  assert.ok(truncatedContext.includes('设定内容已截断'))

  writeJson('mazi.json', [])
  writeJson('characters.json', [])
  writeJson('entity_profiles.json', {})
  writeJson('dictionary.json', [])
  writeJson('settings.json', { categories: [] })
  writeJson('timelines.json', [])
  assert.equal(await buildBookWritingContextBlock(bookPath), '')
  assert.equal(await buildBookWritingContextBlock(''), '')

  const missing = await loadEditorAgentBookContext(join(rootDir, '不存在的作品'), {})
  assert.equal(missing.loaded, false)
  assert.equal(missing.error, '作品目录不存在')
  assert.equal(formatEditorAgentBookContext(missing), '未读取到可用作品资料。')
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('editor agent context service tests passed')

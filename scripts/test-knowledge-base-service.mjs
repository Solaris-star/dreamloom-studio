import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import knowledgeBaseService, {
  calculateWriterActivityStatus,
  normalizeKnowledgeItem
} from '../src/main/services/knowledgeBaseService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-knowledge-'))
const booksDir = join(rootDir, 'books')

function writeJson(filePath, value) {
  fs.mkdirSync(join(filePath, '..'), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

try {
  assert.equal(
    calculateWriterActivityStatus(
      { startDate: '2026-07-01', endDate: '2026-07-20' },
      new Date('2026-07-12')
    ),
    'active'
  )
  assert.equal(
    calculateWriterActivityStatus(
      { startDate: '2026-07-01', endDate: '2026-07-15' },
      new Date('2026-07-12')
    ),
    'ending_soon'
  )
  assert.equal(
    calculateWriterActivityStatus(
      { startDate: '2026-07-20', endDate: '2026-07-30' },
      new Date('2026-07-12')
    ),
    'upcoming'
  )
  assert.equal(
    calculateWriterActivityStatus(
      { startDate: '2026-06-01', endDate: '2026-06-30' },
      new Date('2026-07-12')
    ),
    'ended'
  )
  assert.equal(calculateWriterActivityStatus({}, new Date('2026-07-12')), 'unknown')
  assert.equal(
    calculateWriterActivityStatus(
      { startDate: 'invalid', endDate: '2026-07-20' },
      new Date('2026-07-12')
    ),
    'unknown'
  )

  const normalized = normalizeKnowledgeItem({
    id: 'normalized',
    type: 'invalid',
    title: '  测试素材  ',
    tags: ['悬疑', '', null],
    sourceType: 'invalid',
    status: 'invalid'
  })
  assert.equal(normalized.type, 'note')
  assert.equal(normalized.title, '测试素材')
  assert.deepEqual(normalized.tags, ['悬疑'])
  assert.equal(normalized.sourceType, 'manual')
  assert.equal(normalized.status, 'active')
  const sparseNormalized = normalizeKnowledgeItem({
    title: ' ',
    metadata: 'invalid',
    tags: 'invalid',
    lastUsedAt: null
  })
  assert.match(sparseNormalized.id, /^kb_/)
  assert.equal(sparseNormalized.title, '未命名资产')
  assert.deepEqual(sparseNormalized.metadata, {})
  assert.deepEqual(sparseNormalized.tags, [])
  assert.equal(sparseNormalized.lastUsedAt, '')
  const emptyMetadata = normalizeKnowledgeItem({
    type: 'writer_activity',
    createdAt: '2026-07-01T00:00:00.000Z',
    metadata: {
      topicCard: {},
      marketHotspot: {},
      writerActivity: {},
      bookAnalysis: {}
    }
  })
  assert.equal(emptyMetadata.metadata.topicCard.targetLength, 'unknown')
  assert.equal(emptyMetadata.metadata.marketHotspot.keyword, '')
  assert.equal(emptyMetadata.metadata.marketHotspot.capturedAt, '2026-07-01T00:00:00.000Z')
  assert.equal(emptyMetadata.metadata.writerActivity.status, 'unknown')
  assert.deepEqual(emptyMetadata.metadata.bookAnalysis.hooks, [])
  const normalizedMetadata = normalizeKnowledgeItem({
    id: 'metadata',
    type: 'writer_activity',
    name: '活动素材',
    metadata: {
      writerActivity: {
        startDate: '2026-07-01',
        endDate: '2026-07-30',
        categories: ['悬疑', null],
        targetAudience: ['新作者']
      },
      marketHotspot: {
        platforms: ['起点'],
        categories: ['悬疑'],
        relatedKeywords: ['雪夜'],
        sampleTitles: ['旧案'],
        sampleIntros: ['雪落时，灯灭了。']
      },
      bookAnalysis: {
        hooks: ['倒计时'],
        sellingPoints: ['推理'],
        conflictPatterns: ['追逃'],
        chapterPatterns: ['短章'],
        reusableTechniques: ['线索递进'],
        riskNotes: ['避免照搬']
      }
    }
  })
  assert.equal(normalizedMetadata.title, '活动素材')
  assert.equal(normalizedMetadata.metadata.writerActivity.status, 'active')
  assert.deepEqual(normalizedMetadata.metadata.writerActivity.categories, ['悬疑'])
  assert.deepEqual(normalizedMetadata.metadata.marketHotspot.platforms, ['起点'])
  assert.deepEqual(normalizedMetadata.metadata.bookAnalysis.hooks, ['倒计时'])

  const created = knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'topic-one',
    type: 'topic_card',
    title: '雪夜旧案',
    summary: '少女在雪夜发现旧案线索。',
    tags: ['悬疑'],
    genreTags: ['悬疑'],
    sourceName: '手工记录',
    sourceUrl: 'https://example.com/topic-one',
    favorite: true,
    metadata: {
      topicCard: {
        oneLineHook: '一盏剑灯照出失踪多年的旧案。',
        protagonist: '能看见旧物记忆的少女',
        targetLength: 'short',
        sellingPoints: ['雪夜探案']
      }
    }
  })
  assert.equal(created.success, true)
  assert.equal(created.duplicate, false)

  const duplicate = knowledgeBaseService.createKnowledgeItem(booksDir, {
    title: '重复标题不会替换原名',
    sourceUrl: 'https://example.com/topic-one',
    tags: ['强开局'],
    content: '补充内容'
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.item.id, 'topic-one')
  assert.equal(duplicate.item.type, 'topic_card')
  assert.equal(duplicate.item.status, 'active')
  assert.deepEqual(duplicate.item.tags, ['悬疑', '强开局'])
  const duplicateBySourceId = knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'source-id-original',
    title: '来源编号条目',
    sourceIds: ['shared-source'],
    sourceName: '来源甲',
    metadata: { marketHotspot: { keyword: '旧关键词' } }
  })
  assert.equal(duplicateBySourceId.duplicate, false)
  const mergedBySourceId = knowledgeBaseService.createKnowledgeItem(booksDir, {
    title: '新的标题',
    sourceIds: ['shared-source'],
    summary: '',
    content: '',
    favorite: true,
    metadata: {
      marketHotspot: { heatScore: 90 },
      writerActivity: { platform: '测试平台' }
    }
  })
  assert.equal(mergedBySourceId.duplicate, true)
  assert.equal(mergedBySourceId.item.title, '来源编号条目')
  assert.equal(mergedBySourceId.item.favorite, true)
  assert.equal(mergedBySourceId.item.metadata.marketHotspot.keyword, '旧关键词')
  assert.equal(mergedBySourceId.item.metadata.marketHotspot.heatScore, 90)
  const duplicateByTitle = knowledgeBaseService.createKnowledgeItem(booksDir, {
    title: '来源标题',
    sourceName: '同一来源'
  })
  assert.equal(duplicateByTitle.duplicate, false)
  assert.equal(
    knowledgeBaseService.createKnowledgeItem(booksDir, {
      title: '来源标题',
      sourceName: '同一来源'
    }).duplicate,
    true
  )

  knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'note-two',
    type: 'note',
    title: '城市追踪',
    tags: ['都市'],
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z'
  })
  assert.equal(knowledgeBaseService.listKnowledgeItems(booksDir).length, 4)
  assert.equal(knowledgeBaseService.searchKnowledgeItems(booksDir, '雪夜').length, 1)
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, { tags: ['悬疑'], favorite: true }).length,
    1
  )
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, {
      types: ['topic_card'],
      sourceType: 'manual',
      status: 'active',
      genreTags: ['悬疑'],
      keyword: '旧案',
      createdAtRange: { from: '2020-01-01', to: '2030-01-01' }
    }).length,
    1
  )
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, {
      relatedBookId: 'missing',
      platformTags: ['不存在']
    }).length,
    0
  )
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, {
      updatedAtRange: { from: '2999-01-01' }
    }).length,
    0
  )
  for (const sortBy of ['createdAt', 'title', 'heat', 'commercial', 'lastUsedAt']) {
    assert.equal(knowledgeBaseService.listKnowledgeItems(booksDir, { sortBy }).length, 4)
  }
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, {
      createdAtRange: { from: 'invalid' }
    }).length,
    4
  )
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, {
      createdAtRange: { to: '2000-01-01' }
    }).length,
    0
  )
  assert.equal(knowledgeBaseService.getKnowledgeItem(booksDir, 'missing'), null)

  const linked = knowledgeBaseService.linkKnowledgeItems(booksDir, 'topic-one', [
    'note-two',
    'note-two'
  ])
  assert.deepEqual(linked.item.relatedKnowledgeIds, ['note-two'])
  assert.equal(knowledgeBaseService.favoriteKnowledgeItem(booksDir, 'note-two', true).success, true)
  assert.equal(knowledgeBaseService.archiveKnowledgeItem(booksDir, 'note-two').item.status, 'archived')
  assert.equal(knowledgeBaseService.updateKnowledgeItem(booksDir, 'missing', {}).success, false)
  assert.equal(knowledgeBaseService.deleteKnowledgeItem(booksDir, 'missing').success, false)
  assert.equal(knowledgeBaseService.linkKnowledgeItems(booksDir, 'missing', []).success, false)
  assert.equal(knowledgeBaseService.discardExtractionKnowledgeItems(booksDir, '').success, false)

  const converted = knowledgeBaseService.convertTopicCardToBook(booksDir, 'topic-one')
  assert.equal(converted.success, true)
  assert.equal(converted.book.targetCount, 80000)
  assert.equal(fs.existsSync(join(booksDir, converted.book.folderName, 'mazi.json')), true)
  assert.equal(
    knowledgeBaseService.getKnowledgeItem(booksDir, 'topic-one').status,
    'converted_to_book'
  )
  assert.equal(knowledgeBaseService.convertTopicCardToBook(booksDir, 'note-two').success, false)

  const aiTopic = knowledgeBaseService.createTopicCardFromAiResult(
    booksDir,
    {
      id: 'analysis-source',
      type: 'book_analysis',
      title: '样本分析',
      sourceUrl: 'https://example.com/analysis'
    },
    {
      title: '星海回声',
      oneLineHook: '失忆舰长收到未来自己的求救信号。',
      protagonist: '失忆舰长',
      genreTags: ['科幻'],
      platformSuggestions: ['起点'],
      sellingPoints: ['时间谜题'],
      riskNotes: ['规则需一致'],
      targetLength: 'long',
      marketHeatScore: 80,
      commercialPotentialScore: 70,
      borrowedTechniques: ['倒计时'],
      differentiation: ['双时间线']
    },
    '原始 AI 输出'
  )
  assert.equal(aiTopic.success, true)
  assert.equal(aiTopic.item.sourceType, 'book_analysis')
  assert.equal(aiTopic.item.metadata.topicCard.targetLength, 'long')
  const sparseAiTopic = knowledgeBaseService.createTopicCardFromAiResult(booksDir, null)
  assert.equal(sparseAiTopic.success, true)
  assert.equal(sparseAiTopic.item.title, '未命名选题卡')
  assert.equal(sparseAiTopic.item.sourceType, 'ai_generated')
  assert.deepEqual(sparseAiTopic.item.metadata.topicCard.generatedFrom.ids, [])

  const generatedTopic = knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'generated-topic',
    type: 'topic_card',
    title: '群星迷航',
    genreTags: ['科幻'],
    metadata: {
      topicCard: { protagonist: '导航员', targetLength: 'long' },
      aiOutputs: {
        outline: {
          parsed: {
            title: '群星迷航大纲',
            volumeOutlines: [
              {
                title: '启航卷',
                summary: '离开故乡。',
                chapters: [{ title: '信号', summary: '收到信号。', hook: '坐标来自未来。' }]
              }
            ]
          }
        },
        characters: {
          parsed: {
            characters: [
              {
                name: '林舟',
                identity: '导航员',
                personality: '谨慎',
                goal: '找到归途',
                relationshipToProtagonist: '本人'
              }
            ]
          }
        }
      }
    }
  })
  assert.equal(generatedTopic.success, true)
  const generatedBook = knowledgeBaseService.convertTopicCardToBook(booksDir, 'generated-topic')
  assert.equal(generatedBook.success, true)
  assert.equal(generatedBook.book.targetCount, 1000000)
  const generatedOutlines = JSON.parse(
    fs.readFileSync(join(booksDir, generatedBook.book.folderName, 'outlines.json'), 'utf-8')
  )
  const generatedCharacters = JSON.parse(
    fs.readFileSync(join(booksDir, generatedBook.book.folderName, 'characters.json'), 'utf-8')
  )
  assert.equal(generatedOutlines.children[0].children[0].title, '信号')
  assert.equal(generatedCharacters[0].name, '林舟')

  const goldenTopic = knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'golden-topic',
    type: 'topic_card',
    title: '黄金三章',
    genreTags: ['都市'],
    metadata: {
      topicCard: {
        oneLineHook: '从失业开始反击。',
        coreConflict: '主角要在三十天内挽救公司。'
      },
      aiOutputs: {
        goldenChapters: {
          parsed: {
            chapter1: {
              summary: '主角失业。',
              openingHook: '裁员名单出现。',
              conflict: '资源被夺。',
              endingHook: '神秘电话打来。'
            },
            chapter3: { title: '第一次反击' }
          }
        },
        characters: {
          parsed: {
            characters: [{ role: '合伙人' }, {}]
          }
        }
      }
    }
  })
  assert.equal(goldenTopic.success, true)
  const goldenBook = knowledgeBaseService.convertTopicCardToBook(booksDir, 'golden-topic')
  const goldenOutlines = JSON.parse(
    fs.readFileSync(join(booksDir, goldenBook.book.folderName, 'outlines.json'), 'utf-8')
  )
  const goldenCharacters = JSON.parse(
    fs.readFileSync(join(booksDir, goldenBook.book.folderName, 'characters.json'), 'utf-8')
  )
  assert.equal(goldenBook.book.type, 'dushi')
  assert.equal(goldenOutlines.children.length, 2)
  assert.equal(goldenOutlines.children[0].title, '第1章')
  assert.equal(goldenCharacters[0].name, '合伙人')
  assert.equal(goldenCharacters[1].name, '未命名角色')

  const sourceBook = join(booksDir, '拆书样本')
  writeJson(join(sourceBook, 'mazi.json'), { name: '拆书样本' })
  writeJson(join(sourceBook, 'knowledge', 'extractions.json'), {
    extractions: [
      {
        id: 'extract-one',
        status: 'completed',
        sourceBookName: '远山',
        dimensions: ['plot'],
        results: {
          plot: {
            label: '情节设计',
            items: [{ _id: 'plot-one', point: '失踪线索', _text: '雪夜出现失踪线索。' }]
          }
        }
      }
    ]
  })
  const migrated = knowledgeBaseService.listKnowledgeItems(booksDir)
  assert.equal(migrated.some((item) => item.id === 'kb_ext_extract-one'), true)
  assert.equal(migrated.some((item) => item.metadata.extractionItemId === 'plot-one'), true)
  assert.equal(
    knowledgeBaseService.discardExtractionKnowledgeItems(booksDir, 'extract-one').updated,
    2
  )
  assert.equal(
    knowledgeBaseService
      .listKnowledgeItems(booksDir)
      .filter((item) => item.sourceIds.includes('extract-one'))
      .every((item) => item.status === 'discarded'),
    true
  )

  const variantBook = join(booksDir, '兼容拆书')
  writeJson(join(variantBook, 'mazi.json'), { name: '兼容拆书' })
  writeJson(join(variantBook, 'knowledge', 'extractions.json'), [
    null,
    { id: 'unfinished', status: 'running' },
    {
      id: 'failed-extraction',
      status: 'failed',
      sourceType: 'online',
      dimensions: { relationship: true, worldbuilding: true },
      results: {
        relationship: [
          {
            source: '甲',
            target: '乙',
            relation: true,
            _chapterRange: '1-3'
          }
        ],
        worldbuilding: {
          label: '世界规则',
          count: 2,
          groups: [
            {
              groupTitle: '规则组',
              chapterRange: '4-5',
              items: [{ rule: '能力需要付出代价' }, { ignored: null }]
            }
          ]
        },
        plot: {
          items: [{ point: '伏笔线索会在结尾回收' }]
        }
      }
    },
    {
      id: 'partial-extraction',
      status: 'partial',
      dimensions: ['timeline'],
      results: {
        timeline: {
          items: [{ event: '十年前发生事故', year: 2016 }]
        }
      }
    }
  ])
  const variantItems = knowledgeBaseService.listKnowledgeItems(booksDir)
  assert.equal(
    variantItems.find((item) => item.id === 'kb_ext_failed-extraction').status,
    'draft'
  )
  assert.equal(
    variantItems.some(
      (item) => item.type === 'foreshadowing' && item.title === '伏笔线索会在结尾回收'
    ),
    true
  )
  assert.equal(variantItems.some((item) => item.type === 'setting'), true)
  assert.equal(variantItems.some((item) => item.type === 'world_setting'), true)

  assert.equal(knowledgeBaseService.deleteKnowledgeItem(booksDir, 'note-two').success, true)
  assert.equal(knowledgeBaseService.getKnowledgeItem(booksDir, 'note-two'), null)

  const brokenExtractionBook = join(booksDir, '损坏拆书')
  writeJson(join(brokenExtractionBook, 'mazi.json'), { name: '损坏拆书' })
  writeJson(join(brokenExtractionBook, 'knowledge', 'extractions.json'), { extractions: 'invalid' })
  assert.throws(
    () => knowledgeBaseService.listKnowledgeItems(booksDir),
    /拆书记录格式异常/
  )
  fs.rmSync(brokenExtractionBook, { recursive: true, force: true })

  writeJson(join(booksDir, 'knowledge-base', 'items.json'), { items: 'invalid' })
  assert.throws(
    () => knowledgeBaseService.listKnowledgeItems(booksDir),
    /知识库条目格式异常/
  )
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('knowledge base service tests passed')

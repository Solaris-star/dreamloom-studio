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
  assert.equal(calculateWriterActivityStatus({}, new Date('2026-07-12')), 'unknown')

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

  knowledgeBaseService.createKnowledgeItem(booksDir, {
    id: 'note-two',
    type: 'note',
    title: '城市追踪',
    tags: ['都市'],
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z'
  })
  assert.equal(knowledgeBaseService.listKnowledgeItems(booksDir).length, 2)
  assert.equal(knowledgeBaseService.searchKnowledgeItems(booksDir, '雪夜').length, 1)
  assert.equal(
    knowledgeBaseService.listKnowledgeItems(booksDir, { tags: ['悬疑'], favorite: true }).length,
    1
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

  const converted = knowledgeBaseService.convertTopicCardToBook(booksDir, 'topic-one')
  assert.equal(converted.success, true)
  assert.equal(converted.book.targetCount, 80000)
  assert.equal(fs.existsSync(join(booksDir, converted.book.folderName, 'mazi.json')), true)
  assert.equal(
    knowledgeBaseService.getKnowledgeItem(booksDir, 'topic-one').status,
    'converted_to_book'
  )
  assert.equal(knowledgeBaseService.convertTopicCardToBook(booksDir, 'note-two').success, false)

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

  assert.equal(knowledgeBaseService.deleteKnowledgeItem(booksDir, 'note-two').success, true)
  assert.equal(knowledgeBaseService.getKnowledgeItem(booksDir, 'note-two'), null)

  writeJson(join(booksDir, 'knowledge-base', 'items.json'), { items: 'invalid' })
  assert.throws(
    () => knowledgeBaseService.listKnowledgeItems(booksDir),
    /知识库条目格式异常/
  )
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true })
}

console.log('knowledge base service tests passed')

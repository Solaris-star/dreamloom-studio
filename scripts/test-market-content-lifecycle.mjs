import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  applyInsightToBook,
  createActivity,
  createBookFromInsight,
  createHotspot,
  createTopicCardFromActivity,
  createTopicCardFromHotspot,
  generateOutlineFromInsight,
  listActivities,
  listHotspots,
  saveActivityToKnowledge,
  saveHotspotToKnowledge,
  saveInsightToKnowledge,
  updateActivity,
  updateHotspot
} from '../src/main/services/marketService.js'

const root = fs.mkdtempSync(join(os.tmpdir(), 'dreamloom-market-content-'))
const booksDir = join(root, 'books')
const outsideMeta = join(root, 'mazi.json')

const insight = {
  id: 'insight-1',
  title: '月港追凶',
  source: '公开热榜',
  channel: 'female',
  genre: '悬疑',
  tags: ['悬疑', '重生'],
  heatScore: 82,
  opportunityScore: 77,
  summary: '记者重返旧案发生前。',
  conflict: '主角必须在真凶发现她之前改变案件。',
  hook: '失踪者在案发前一天给她打来电话。',
  readerEmotion: ['紧张', '反转'],
  storyPotential: '时间限制和身份疑云可以持续推进。',
  bookTitleIdeas: ['月港来电'],
  loglineIdeas: ['记者重返旧案发生前，收到失踪者的求救电话。'],
  openingIdeas: ['从一通不可能出现的电话开始。']
}

try {
  fs.mkdirSync(booksDir, { recursive: true })

  assert.throws(() => listHotspots(''), /请先设置书籍目录/)
  const marketDir = join(booksDir, 'market')
  fs.mkdirSync(marketDir, { recursive: true })
  fs.writeFileSync(join(marketDir, 'hotspots.json'), '{broken', 'utf8')
  assert.throws(() => listHotspots(booksDir), /市场数据读取失败/)
  fs.rmSync(join(marketDir, 'hotspots.json'))

  const hotspot = createHotspot(booksDir, {
    id: 'hotspot-1',
    title: 'AI 悬疑短篇',
    platform: '公开热榜',
    platforms: ['公开热榜'],
    categories: ['悬疑'],
    tags: ['AI'],
    heatScore: 81
  })
  assert.equal(hotspot.success, true)
  assert.equal(listHotspots(booksDir, { keyword: '悬疑', sortBy: 'heat' }).length, 1)
  assert.equal(listHotspots(booksDir, { platform: '不存在' }).length, 0)
  assert.equal(updateHotspot(booksDir, 'missing', {}).success, false)
  const updatedHotspot = updateHotspot(booksDir, 'hotspot-1', { opportunityScore: 91 })
  assert.equal(updatedHotspot.item.opportunityScore, 91)

  const savedHotspot = saveHotspotToKnowledge(booksDir, 'hotspot-1')
  assert.equal(savedHotspot.success, true)
  assert.equal(Boolean(savedHotspot.knowledgeItem?.id), true)
  const hotspotCard = createTopicCardFromHotspot(booksDir, 'hotspot-1')
  assert.equal(hotspotCard.success, true)
  assert.equal(hotspotCard.topicCard.type, 'topic_card')
  assert.equal(saveHotspotToKnowledge(booksDir, 'missing').success, false)

  const activity = createActivity(booksDir, {
    id: 'activity-1',
    title: '悬疑短篇征文',
    platform: '测试平台',
    categories: ['悬疑'],
    rewardSummary: '入选奖励',
    requirementSummary: '原创短篇',
    endDate: '2099-12-31'
  })
  assert.equal(activity.success, true)
  assert.equal(listActivities(booksDir, { category: '悬疑', sortBy: 'endDate' }).length, 1)
  assert.equal(updateActivity(booksDir, 'missing', {}).success, false)
  assert.equal(
    updateActivity(booksDir, 'activity-1', { reminderEnabled: true }).item.reminderEnabled,
    true
  )
  assert.equal(Boolean(saveActivityToKnowledge(booksDir, 'activity-1').knowledgeItem?.id), true)
  assert.equal(
    createTopicCardFromActivity(booksDir, 'activity-1').topicCard.type,
    'topic_card'
  )
  assert.equal(createTopicCardFromActivity(booksDir, 'missing').success, false)

  const savedInsight = saveInsightToKnowledge(booksDir, { insight })
  assert.equal(savedInsight.success, true)
  assert.equal(savedInsight.item.type, 'topic_card')
  assert.equal(saveInsightToKnowledge(booksDir, { insight: null, insightId: 'missing' }).success, false)

  const outline = generateOutlineFromInsight(booksDir, { insight, mode: 'save_only' })
  assert.equal(outline.success, true)
  assert.equal(outline.outline.volumes.length, 3)
  assert.equal(Boolean(outline.item.id), true)

  assert.equal(applyInsightToBook(booksDir, { insight }).success, false)
  const applied = applyInsightToBook(booksDir, {
    insight,
    bookName: '已有作品',
    targetSection: 'characters'
  })
  assert.equal(applied.success, true)
  assert.equal(applied.bookName, '已有作品')
  assert.equal(applied.item.type, 'character_setting')

  assert.equal(createBookFromInsight('', { insight }).success, false)
  const escaped = createBookFromInsight(booksDir, { insight, selectedTitle: '..' })
  assert.equal(escaped.success, false)
  assert.equal(fs.existsSync(outsideMeta), false)

  const createdBook = createBookFromInsight(booksDir, { insight })
  assert.equal(createdBook.success, true)
  assert.equal(createdBook.bookName, '月港来电')
  assert.equal(fs.existsSync(join(booksDir, '月港来电', 'mazi.json')), true)
  assert.equal(
    fs.readFileSync(join(booksDir, '月港来电', '正文', '正文', '第1章.txt'), 'utf8').length > 0,
    true
  )

  const duplicateBook = createBookFromInsight(booksDir, { insight })
  assert.equal(duplicateBook.success, true)
  assert.equal(duplicateBook.bookName, '月港来电 2')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('市场内容生命周期测试通过')

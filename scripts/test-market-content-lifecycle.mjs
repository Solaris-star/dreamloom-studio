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

  await assert.rejects(() => listHotspots(''), /请先设置书籍目录/)
  const marketDir = join(booksDir, 'market')
  fs.mkdirSync(marketDir, { recursive: true })
  fs.writeFileSync(join(marketDir, 'hotspots.json'), '{broken', 'utf8')
  await assert.rejects(() => listHotspots(booksDir), /市场数据读取失败/)
  fs.rmSync(join(marketDir, 'hotspots.json'))

  const hotspot = await createHotspot(booksDir, {
    id: 'hotspot-1',
    title: 'AI 悬疑短篇',
    platform: '公开热榜',
    platforms: ['公开热榜'],
    categories: ['悬疑'],
    tags: ['AI'],
    heatScore: 81
  })
  assert.equal(hotspot.success, true)
  assert.equal((await listHotspots(booksDir, { keyword: '悬疑', sortBy: 'heat' })).length, 1)
  assert.equal((await listHotspots(booksDir, { platform: '不存在' })).length, 0)
  assert.equal((await updateHotspot(booksDir, 'missing', {})).success, false)
  const updatedHotspot = await updateHotspot(booksDir, 'hotspot-1', { opportunityScore: 91 })
  assert.equal(updatedHotspot.item.opportunityScore, 91)
  const sparseHotspot = (
    await createHotspot(booksDir, {
      title: '',
      keyword: '',
      url: 'https://example.com/sparse',
      platforms: ['测试平台', null, ''],
      categories: ['其他'],
      tags: '不是数组',
      heatScore: 150,
      growthScore: -10,
      competitionScore: 'invalid',
      opportunityScore: 75.4,
      extra: null,
      createdAt: '2024-01-01T00:00:00.000Z'
    })
  ).item
  assert.match(sparseHotspot.id, /^market_hotspot_/)
  assert.equal(sparseHotspot.title, '未命名热点')
  assert.equal(sparseHotspot.sourceUrl, 'https://example.com/sparse')
  assert.deepEqual(sparseHotspot.tags, [])
  assert.equal(sparseHotspot.heatScore, 100)
  assert.equal(sparseHotspot.growthScore, 0)
  assert.equal(sparseHotspot.competitionScore, 0)
  assert.equal(sparseHotspot.opportunityScore, 75)
  assert.deepEqual(sparseHotspot.extra, {})
  assert.equal((await listHotspots(booksDir, { category: '其他' })).length, 1)
  assert.equal((await listHotspots(booksDir, { status: 'missing' })).length, 0)
  assert.equal((await listHotspots(booksDir, { sortBy: 'opportunity' }))[0].id, 'hotspot-1')
  assert.equal((await listHotspots(booksDir, { sortBy: 'createdAt' })).at(-1).id, sparseHotspot.id)
  assert.equal((await listHotspots(booksDir, { sortBy: 'updatedAt' })).length, 2)

  const savedHotspot = await saveHotspotToKnowledge(booksDir, 'hotspot-1')
  assert.equal(savedHotspot.success, true)
  assert.equal(Boolean(savedHotspot.knowledgeItem?.id), true)
  const hotspotCard = await createTopicCardFromHotspot(booksDir, 'hotspot-1')
  assert.equal(hotspotCard.success, true)
  assert.equal(hotspotCard.topicCard.type, 'topic_card')
  assert.equal((await saveHotspotToKnowledge(booksDir, 'missing')).success, false)

  const activity = await createActivity(booksDir, {
    id: 'activity-1',
    title: '悬疑短篇征文',
    platform: '测试平台',
    categories: ['悬疑'],
    rewardSummary: '入选奖励',
    requirementSummary: '原创短篇',
    endDate: '2099-12-31'
  })
  assert.equal(activity.success, true)
  assert.equal((await listActivities(booksDir, { category: '悬疑', sortBy: 'endDate' })).length, 1)
  assert.equal((await updateActivity(booksDir, 'missing', {})).success, false)
  assert.equal(
    (await updateActivity(booksDir, 'activity-1', { reminderEnabled: true })).item.reminderEnabled,
    true
  )
  const sparseActivity = (
    await createActivity(booksDir, {
      title: '',
      url: 'https://example.com/activity',
      categories: '不是数组',
      targetAudience: [null, '新作者'],
      tags: ['短篇', ''],
      endDate: '2024-01-01'
    })
  ).item
  assert.match(sparseActivity.id, /^market_activity_/)
  assert.equal(sparseActivity.title, '未命名活动')
  assert.equal(sparseActivity.activityType, 'other')
  assert.equal(sparseActivity.sourceUrl, 'https://example.com/activity')
  assert.deepEqual(sparseActivity.categories, [])
  assert.deepEqual(sparseActivity.targetAudience, ['新作者'])
  assert.equal((await listActivities(booksDir, { platform: '不存在' })).length, 0)
  assert.equal((await listActivities(booksDir, { status: sparseActivity.status })).length > 0, true)
  assert.equal((await listActivities(booksDir, { sortBy: 'createdAt' })).length, 2)
  assert.equal(Boolean((await saveActivityToKnowledge(booksDir, 'activity-1')).knowledgeItem?.id), true)
  assert.equal((await saveActivityToKnowledge(booksDir, 'missing')).success, false)
  assert.equal(
    (await createTopicCardFromActivity(booksDir, 'activity-1')).topicCard.type,
    'topic_card'
  )
  assert.equal((await createTopicCardFromActivity(booksDir, 'missing')).success, false)

  const savedInsight = await saveInsightToKnowledge(booksDir, { insight })
  assert.equal(savedInsight.success, true)
  assert.equal(savedInsight.item.type, 'topic_card')
  assert.equal((await saveInsightToKnowledge(booksDir, { insight: null, insightId: 'missing' })).success, false)

  const outline = await generateOutlineFromInsight(booksDir, { insight, mode: 'save_only' })
  assert.equal(outline.success, true)
  assert.equal(outline.outline.volumes.length, 3)
  assert.equal(Boolean(outline.item.id), true)
  const maleOutline = await generateOutlineFromInsight(booksDir, {
    insight: {
      title: '系统创业',
      channel: 'male',
      genre: '都市科技',
      tags: ['系统'],
      riskPenalty: 20
    }
  })
  assert.equal(maleOutline.outline.protagonist.startsWith('男主'), true)
  assert.equal(maleOutline.outline.titles[0], '系统创业')
  assert.equal(maleOutline.outline.emotionalHook, '反击、反转、共情')
  const neutralSaved = await saveInsightToKnowledge(booksDir, {
    insight: {
      originalTitle: '原始信号',
      rawPayload: { platform: '公开来源', sourceType: 'rank', url: 'https://example.com/rank' },
      channel: 'invalid',
      genre: '未知题材',
      heatScore: 'invalid',
      opportunityScore: 180,
      tags: [null, '新题材'],
      bookTitleIdeas: '不是数组'
    }
  })
  assert.equal(neutralSaved.success, true)
  assert.equal(neutralSaved.item.metadata.topicCard.protagonist.includes('普通人'), true)
  assert.equal(neutralSaved.item.metadata.topicCard.targetLength, 'medium')
  assert.equal(neutralSaved.item.sourceName, '公开来源')
  assert.equal(neutralSaved.item.sourceUrl, 'https://example.com/rank')

  assert.equal((await applyInsightToBook(booksDir, { insight })).success, false)
  const applied = await applyInsightToBook(booksDir, {
    insight,
    bookName: '已有作品',
    targetSection: 'characters'
  })
  assert.equal(applied.success, true)
  assert.equal(applied.bookName, '已有作品')
  assert.equal(applied.item.type, 'character_setting')
  assert.equal(
    (await applyInsightToBook(booksDir, {
      insight,
      bookId: '已有作品',
      targetSection: 'worldview'
    })).item.type,
    'world_setting'
  )
  assert.equal(
    (await applyInsightToBook(booksDir, {
      insight,
      bookName: '已有作品',
      targetSection: 'book_setting'
    })).item.type,
    'world_setting'
  )
  assert.equal(
    (await applyInsightToBook(booksDir, {
      insight,
      bookName: '已有作品',
      targetSection: 'conflict'
    })).item.type,
    'plot_fragment'
  )

  assert.equal((await createBookFromInsight('', { insight })).success, false)
  assert.equal((await createBookFromInsight({}, { insight })).success, false)
  const escaped = await createBookFromInsight(booksDir, { insight, selectedTitle: '..' })
  assert.equal(escaped.success, false)
  assert.equal(fs.existsSync(outsideMeta), false)

  const createdBook = await createBookFromInsight(booksDir, { insight })
  assert.equal(createdBook.success, true)
  assert.equal(createdBook.bookName, '月港来电')
  assert.equal(fs.existsSync(join(booksDir, '月港来电', 'mazi.json')), true)
  assert.equal(
    fs.readFileSync(join(booksDir, '月港来电', '正文', '正文', '第1章.txt'), 'utf8').length > 0,
    true
  )

  const duplicateBook = await createBookFromInsight(booksDir, { insight })
  assert.equal(duplicateBook.success, true)
  assert.equal(duplicateBook.bookName, '月港来电 2')

  for (const [genre, expectedType] of [
    ['仙侠修真', 'xuanhua'],
    ['都市现实', 'dushi'],
    ['科幻末世', 'kehuan'],
    ['古言权谋', 'lishi']
  ]) {
    const result = await createBookFromInsight(booksDir, {
      selectedTitle: `${genre}测试`,
      insight: {
        ...insight,
        id: `insight-${expectedType}`,
        title: `${genre}测试`,
        genre,
        channel: 'male',
        bookTitleIdeas: []
      }
    })
    assert.equal(result.success, true)
    const meta = JSON.parse(fs.readFileSync(join(booksDir, result.bookName, 'mazi.json'), 'utf8'))
    assert.equal(meta.type, expectedType)
    assert.equal(meta.targetCount, 800000)
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('市场内容生命周期测试通过')

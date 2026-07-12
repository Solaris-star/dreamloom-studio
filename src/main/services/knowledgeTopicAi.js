function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseJsonFromAi(raw) {
  const text = sanitizeText(raw)
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const cleaned = fenced?.[1] ? fenced[1].trim() : text
  try {
    return JSON.parse(cleaned)
  } catch {
    const objStart = cleaned.indexOf('{')
    const objEnd = cleaned.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.slice(objStart, objEnd + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function compactItem(item) {
  const metadata = item?.metadata || {}
  return {
    id: item?.id,
    type: item?.type,
    title: item?.title,
    summary: item?.summary,
    content: item?.content,
    tags: item?.tags,
    genreTags: item?.genreTags,
    platformTags: item?.platformTags,
    sourceName: item?.sourceName,
    sourceUrl: item?.sourceUrl,
    metadata: {
      topicCard: metadata.topicCard,
      marketHotspot: metadata.marketHotspot,
      writerActivity: metadata.writerActivity,
      bookAnalysis: metadata.bookAnalysis
    }
  }
}

function jsonShapeForTask(task) {
  if (task === 'outline') {
    return {
      title: '大纲标题',
      volumeOutlines: [
        {
          title: '卷名',
          summary: '本卷概要',
          chapters: [{ title: '章节标题', summary: '章节概要', hook: '章末钩子' }]
        }
      ]
    }
  }
  if (task === 'golden_chapters') {
    return {
      chapter1: {
        title: '第一章标题',
        summary: '第一章概要',
        openingHook: '开篇钩子',
        conflict: '核心冲突',
        endingHook: '章末钩子'
      },
      chapter2: {
        title: '第二章标题',
        summary: '第二章概要',
        conflict: '核心冲突',
        endingHook: '章末钩子'
      },
      chapter3: {
        title: '第三章标题',
        summary: '第三章概要',
        conflict: '核心冲突',
        endingHook: '章末钩子'
      }
    }
  }
  if (task === 'characters') {
    return {
      characters: [
        {
          name: '角色名',
          role: '主角 / 反派 / 配角',
          identity: '身份',
          personality: '性格',
          goal: '目标',
          secret: '秘密',
          relationshipToProtagonist: '与主角关系',
          growthArc: '成长线'
        }
      ]
    }
  }
  if (task === 'world') {
    return {
      worldSetting: {
        background: '世界背景',
        rules: ['规则1', '规则2'],
        powerSystem: '力量体系',
        organizations: ['组织1', '组织2'],
        locations: ['地点1', '地点2'],
        conflictSystem: '冲突体系'
      }
    }
  }
  if (task === 'evaluate') {
    return {
      marketHeatScore: 80,
      originalityScore: 72,
      commercialPotentialScore: 86,
      writingDifficultyScore: 58,
      longSerialPotentialScore: 75,
      shortDramaPotentialScore: 88,
      newWriterFriendlyScore: 70,
      homogenizationRiskScore: 65,
      summary: '整体评价',
      suggestions: ['建议1', '建议2', '建议3']
    }
  }
  return {
    title: '小说选题名',
    oneLineHook: '一句话卖点',
    genreTags: ['题材1', '题材2'],
    platformSuggestions: ['番茄', '七猫'],
    protagonist: '主角设定',
    goldenFinger: '金手指',
    worldSetting: '世界观设定',
    coreConflict: '核心冲突',
    openingHook: '开篇钩子',
    sellingPoints: ['爽点1', '爽点2', '爽点3'],
    riskNotes: ['风险1', '风险2'],
    monetizationPath: 'short_story',
    targetLength: 'medium',
    marketHeatScore: 80,
    originalityScore: 70,
    commercialPotentialScore: 85,
    writingDifficultyScore: 60
  }
}

function taskInstruction(task, options = {}) {
  if (task === 'expand') return '基于选题卡补全缺失字段，保留已有方向，输出完整选题卡 JSON。'
  if (task === 'outline') {
    return `基于选题卡生成分层大纲，篇幅为${options.length || 'medium'}。短篇10-30章，中篇30-100章，长篇100-300章。`
  }
  if (task === 'golden_chapters')
    return '基于选题卡生成黄金三章设计，强化开篇钩子、冲突和章末期待。'
  if (task === 'characters') return '基于选题卡生成主要角色设定，包含主角、反派和关键配角。'
  if (task === 'world') return '基于选题卡生成世界观设定，强调规则、组织、地点和冲突体系。'
  if (task === 'evaluate')
    return '评估这个选题的市场热度、原创度、商业潜力、写作难度和风险，给出可执行建议。'
  if (task === 'from_book_analysis') {
    return [
      '基于拆书知识生成原创选题。',
      '禁止复刻原作人物、剧情、世界观专有设定。',
      '只学习抽象结构和创作方法，输出差异化设计和同质化风险。'
    ].join('\n')
  }
  if (task === 'from_activity') return '基于作家活动要求生成适合投稿的原创选题卡。'
  return '基于市场热点或活动生成原创中文网络小说选题卡。'
}

class KnowledgeTopicAiService {
  async runTask(payload = {}, textProvider) {
    if (!textProvider?.chat) {
      throw new Error('文本 AI 服务不可用')
    }
    const {
      task = 'topic_card',
      item,
      relatedItems: rawRelatedItems = [],
      options = {}
    } = payload || {}
    const relatedItems = Array.isArray(rawRelatedItems) ? rawRelatedItems : []
    const shape = jsonShapeForTask(task)
    const messages = [
      {
        role: 'system',
        content: [
          '你是织梦工坊的小说选题与创作资产顾问。',
          '所有输出必须是合法 JSON，不要 Markdown，不要解释。',
          '不要抓取、复述或照搬小说正文；只能整理公开元数据、抽象方法和原创创意。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          taskInstruction(task, options),
          '',
          '当前资产：',
          JSON.stringify(compactItem(item), null, 2),
          '',
          '关联资产：',
          JSON.stringify((relatedItems || []).map(compactItem), null, 2),
          '',
          '请严格按这个 JSON 结构输出：',
          JSON.stringify(shape, null, 2)
        ].join('\n')
      }
    ]

    const response = await textProvider.chat({
      messages,
      temperature: task === 'evaluate' ? 0.35 : 0.72,
      max_tokens: task === 'outline' ? 6000 : 3600,
      requestId: `knowledge_${task}_${Date.now()}`
    })
    const raw = sanitizeText(response?.content)
    if (!raw) {
      throw new Error('AI 返回内容为空，请重试')
    }
    const parsed = parseJsonFromAi(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI 返回内容不是有效 JSON，请重试')
    }
    return {
      success: true,
      task,
      content: raw,
      images: [],
      raw,
      parsed,
      usage: response?.usage || null,
      model: response?.model || '',
      providerId: response?.providerId || '',
      error: ''
    }
  }
}

export default new KnowledgeTopicAiService()

import { buildBookWritingContextBlock } from './bookWritingContext.js'

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function providerIdOf(provider = {}, result = {}) {
  return sanitizeText(result.providerId) || sanitizeText(provider.providerId) || sanitizeText(provider.id)
}

function providerNameOf(provider = {}) {
  return (
    sanitizeText(provider.providerName) ||
    sanitizeText(provider.name) ||
    sanitizeText(provider.providerId) ||
    sanitizeText(provider.id) ||
    '未知模型'
  )
}

function modelOf(provider = {}, result = {}) {
  return (
    sanitizeText(result.model) ||
    sanitizeText(provider.model) ||
    sanitizeText(provider.modelName) ||
    '未知模型'
  )
}

async function chatWithProvider(provider, options = {}) {
  const service = provider?.service || provider?.textProvider
  if (!service || typeof service.chat !== 'function') {
    throw new Error(`Provider "${providerNameOf(provider)}" 缺少文本服务`)
  }

  return service.chat({
    ...options,
    model: options.model || provider?.model || provider?.modelName || undefined
  })
}

function parseProposals(rawText) {
  const text = sanitizeText(rawText)
  if (!text) return []

  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = fenced?.[1]?.trim() || text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    const firstBracket = candidate.indexOf('[')
    const lastBracket = candidate.lastIndexOf(']')

    let parsed
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      parsed = JSON.parse(candidate.slice(firstBracket, lastBracket + 1))
    } else if (firstBrace !== -1) {
      parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
    }

    if (parsed) {
      const items = Array.isArray(parsed)
        ? parsed
        : parsed.proposals || parsed.options || parsed.items || []
      if (Array.isArray(items) && items.length) {
        return items.map((item) => ({
          title: sanitizeText(item.title) || '未命名方案',
          summary: sanitizeText(item.summary) || '',
          conflict: sanitizeText(item.conflict) || '',
          emotion: sanitizeText(item.emotion) || '',
          keyEvents: Array.isArray(item.keyEvents)
            ? item.keyEvents.map((e) => sanitizeText(e)).filter(Boolean)
            : []
        })).filter((p) => p.title !== '未命名方案' || p.summary)
      }

      if (!Array.isArray(parsed) && (sanitizeText(parsed.title) || sanitizeText(parsed.summary))) {
        return [
          {
            title: sanitizeText(parsed.title) || '未命名方案',
            summary: sanitizeText(parsed.summary) || '',
            conflict: sanitizeText(parsed.conflict) || '',
            emotion: sanitizeText(parsed.emotion) || '',
            keyEvents: Array.isArray(parsed.keyEvents)
              ? parsed.keyEvents.map((e) => sanitizeText(e)).filter(Boolean)
              : []
          }
        ]
      }
    }
  } catch {
    // 解析失败时回退到文本规则提取
  }

  const proposals = []
  const blocks = text.split(/(?:方案\s*[一二三四五六七八九十\d]+|#{1,3}\s*(?=方案))\s*[：:.\s]*/i).filter(Boolean)

  for (const block of blocks) {
    const titleMatch = block.match(/(?:标题|方案名)[：:]\s*(.+?)(?:\n|$)/i)
    const summaryMatch = block.match(/(?:摘要|概述|简介)[：:]\s*([\s\S]+?)(?=(?:冲突|情绪|关键|核心事件)|$)/i)
    const conflictMatch = block.match(/(?:冲突|矛盾)[：:]\s*([\s\S]+?)(?=(?:摘要|情绪|关键|核心事件)|$)/i)
    const emotionMatch = block.match(/(?:情绪|情感|氛围)[：:]\s*([\s\S]+?)(?=(?:摘要|冲突|关键|核心事件)|$)/i)
    const eventsMatch = block.match(/(?:关键事件|核心事件|事件列表)[：:]\s*([\s\S]+?)$/i)

    const title = sanitizeText(titleMatch?.[1])
    if (!title) continue

    const keyEvents = eventsMatch
      ? eventsMatch[1]
          .split(/\n/)
          .map((e) => sanitizeText(e.replace(/^[-*•\d.、)\s]+/, '')))
          .filter(Boolean)
      : []

    proposals.push({
      title,
      summary: sanitizeText(summaryMatch?.[1]) || '',
      conflict: sanitizeText(conflictMatch?.[1]) || '',
      emotion: sanitizeText(emotionMatch?.[1]) || '',
      keyEvents
    })
  }

  return proposals
}

function buildEvolveSystemPrompt() {
  return [
    '你是一名专业的中文网络小说剧情推演师。',
    '请根据用户提供的书籍设定和当前剧情，推演后续剧情发展，生成多个不同方向的方案。',
    '每个方案必须包含以下字段：',
    '- 标题：方案的简短标题（10字以内）',
    '- 摘要：方案概述（80-150字）',
    '- 冲突：该方案的核心冲突或矛盾',
    '- 情绪：该方案的情绪基调（如紧张、温馨、悲壮等）',
    '- 关键事件：2-5个推动剧情的关键事件',
    '',
    '请生成2-3个风格各异、方向不同的方案。',
    '只输出JSON，格式如下：',
    '```json',
    '[',
    '  {',
    '    "title": "方案标题",',
    '    "summary": "方案概述",',
    '    "conflict": "核心冲突",',
    '    "emotion": "情绪基调",',
    '    "keyEvents": ["事件1", "事件2", "事件3"]',
    '  }',
    ']',
    '```',
    '不要输出Markdown标题、解释或任何前后缀。'
  ].join('\n')
}

function buildEvolveUserPrompt({ outlineTitle, outlineContent, bookContextBlock, userHint }) {
  const parts = []
  if (bookContextBlock) {
    parts.push('【本书设定摘要】', bookContextBlock, '')
  }
  parts.push(
    `当前章纲标题：${outlineTitle || '未命名'}`,
    '当前章纲内容：',
    outlineContent || '（空）',
    ''
  )
  if (userHint) {
    parts.push(`用户补充要求：${userHint}`, '')
  }
  parts.push('请推演后续剧情，生成2-3个不同方向的方案。')
  return parts.join('\n')
}

class PlotEvolutionAiService {
  async evolvePlot(payload = {}) {
    const providers = Array.isArray(payload.providers) ? payload.providers : []
    const outlineTitle = sanitizeText(payload.outlineTitle)
    const outlineContent = sanitizeText(payload.outlineContent)
    const bookPath = typeof payload.bookPath === 'string' ? payload.bookPath.trim() : ''
    const userHint = sanitizeText(payload.userHint)

    if (!providers.length) {
      throw new Error('请先配置至少一个文本 AI Provider')
    }

    if (!outlineContent) {
      throw new Error('章纲内容为空，无法推演剧情')
    }

    const bookContextBlock = bookPath
      ? await buildBookWritingContextBlock(bookPath, { outlineTitle, outlineContent })
      : ''

    const messages = [
      { role: 'system', content: buildEvolveSystemPrompt() },
      {
        role: 'user',
        content: buildEvolveUserPrompt({ outlineTitle, outlineContent, bookContextBlock, userHint })
      }
    ]

    const tasks = providers.map(async (provider) => {
      const result = await chatWithProvider(provider, {
        messages,
        temperature: 0.8,
        max_tokens: 4000
      })
      const rawContent = sanitizeText(result.content)
      if (!rawContent) {
        throw new Error('AI 返回内容为空，请重试')
      }
      const options = parseProposals(rawContent)
      if (!options.length) {
        throw new Error('AI 返回内容无法解析为剧情方案，请重试')
      }
      const providerId = providerIdOf(provider, result)
      const model = modelOf(provider, result)
      return {
        providerId,
        providerName: providerNameOf(provider),
        model,
        usage: result.usage || {},
        options
      }
    })

    const settled = await Promise.allSettled(tasks)
    const proposals = []

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]
      if (outcome.status === 'fulfilled') {
        proposals.push(outcome.value)
      } else {
        proposals.push({
          providerId: providerIdOf(providers[i]),
          providerName: providerNameOf(providers[i]),
          model: modelOf(providers[i]),
          options: [],
          usage: {},
          error: outcome.reason?.message || '调用失败'
        })
      }
    }

    const groups = proposals.map((item) => ({
      providerId: item.providerId || item.model,
      providerName: item.providerName || item.model,
      model: item.model,
      usage: item.usage || {},
      proposals: item.options || [],
      error: item.error || ''
    }))
    const hasUsableProposal = groups.some((group) => !group.error && group.proposals.length > 0)
    const firstError = groups.find((group) => group.error)?.error || ''
    if (!hasUsableProposal) {
      return {
        success: false,
        content: '',
        images: [],
        usage: {},
        model: proposals.map((item) => item.model).filter(Boolean).join(', '),
        providerId: proposals.map((item) => item.providerId).filter(Boolean).join(', '),
        message: firstError || 'AI 未返回可用剧情方案，请重试',
        error: firstError || 'AI 未返回可用剧情方案，请重试',
        proposals,
        groups
      }
    }

    return {
      success: true,
      content: JSON.stringify(proposals),
      images: [],
      usage: {},
      model: proposals.map((item) => item.model).filter(Boolean).join(', '),
      providerId: proposals.map((item) => item.providerId).filter(Boolean).join(', '),
      error: '',
      proposals,
      groups
    }
  }

  async regenerateProposal(payload = {}) {
    const provider = payload.provider
    const outlineTitle = sanitizeText(payload.outlineTitle)
    const outlineContent = sanitizeText(payload.outlineContent)
    const bookPath = typeof payload.bookPath === 'string' ? payload.bookPath.trim() : ''
    const userHint = sanitizeText(payload.userHint)
    const previousProposals = payload.previousProposals

    if (!provider) {
      throw new Error('请指定要使用的 Provider')
    }

    if (!outlineContent) {
      throw new Error('章纲内容为空，无法推演剧情')
    }

    const bookContextBlock = bookPath
      ? await buildBookWritingContextBlock(bookPath, { outlineTitle, outlineContent })
      : ''

    const systemPrompt = [
      '你是一名专业的中文网络小说剧情推演师。',
      '请根据用户提供的书籍设定和当前剧情，推演后续剧情发展，生成一个全新的方案。',
      '方案必须包含以下字段：标题、摘要、冲突、情绪、关键事件。',
      '只输出JSON，格式如下：',
      '```json',
      '{',
      '  "title": "方案标题",',
      '  "summary": "方案概述（80-150字）",',
      '  "conflict": "核心冲突",',
      '  "emotion": "情绪基调",',
      '  "keyEvents": ["事件1", "事件2", "事件3"]',
      '}',
      '```',
      '不要输出Markdown标题、解释或任何前后缀。'
    ].join('\n')

    const userParts = []
    if (bookContextBlock) {
      userParts.push('【本书设定摘要】', bookContextBlock, '')
    }
    userParts.push(
      `当前章纲标题：${outlineTitle || '未命名'}`,
      '当前章纲内容：',
      outlineContent || '（空）',
      ''
    )
    if (userHint) {
      userParts.push(`用户补充要求：${userHint}`, '')
    }
    if (Array.isArray(previousProposals) && previousProposals.length) {
      userParts.push(
        '已生成的方案（请避免重复，生成一个全新的方案）：',
        previousProposals.map((p, i) => `${i + 1}. ${p.title}：${p.summary}`).join('\n'),
        ''
      )
    }
    userParts.push('请推演后续剧情，生成一个全新的方案。')

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.join('\n') }
    ]

    const result = await chatWithProvider(provider, {
      messages,
      temperature: 0.8,
      max_tokens: 2000
    })

    const rawContent = sanitizeText(result.content)
    if (!rawContent) {
      throw new Error('AI 返回内容为空，请重试')
    }
    const options = parseProposals(rawContent)
    if (!options.length) {
      throw new Error('AI 返回内容无法解析为剧情方案，请重试')
    }
    const proposal = options[0]

    return {
      success: true,
      content: JSON.stringify(proposal),
      images: [],
      usage: result.usage || {},
      model: modelOf(provider, result),
      providerId: providerIdOf(provider, result),
      error: '',
      proposal
    }
  }
}

const plotEvolutionAiService = new PlotEvolutionAiService()

export default plotEvolutionAiService

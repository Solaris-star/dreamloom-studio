function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function ensureTextProvider(textProvider) {
  if (!textProvider?.chat) throw new Error('文本 AI 服务不可用')
}

function textResult(result = {}, content = '') {
  return {
    success: true,
    content,
    images: result.images || [],
    usage: result.usage || {},
    model: result.model || '',
    providerId: result.providerId || '',
    error: ''
  }
}

function buildNameMessages(options = {}) {
  const {
    type = 'cn',
    surname = '',
    gender = '',
    nameLength = 3,
    middleChar = '',
    count = 24
  } = options

  const typeMap = {
    cn: '中国人名',
    jp: '日本人名',
    en: '西方人名',
    force: '各方势力名称',
    place: '地名',
    book: '秘籍名称',
    item: '法宝名称',
    elixir: '灵药名称'
  }

  let prompt = `请生成${count}个${typeMap[type] || '名称'}，要求：\n`
  prompt += '- 所有名字必须使用中文汉字，不能包含日文假名、英文字母或其他非中文字符。\n'

  if (type === 'cn' || type === 'jp' || type === 'en') {
    if (surname) prompt += `- 姓氏：${surname}\n`
    if (gender) prompt += `- 性别：${gender}\n`
    if (type === 'cn' && nameLength) {
      prompt += `- 名字长度：${nameLength}个字\n`
      if (middleChar) prompt += `- 中间字：${middleChar}\n`
    }

    if (type === 'jp') {
      prompt += '- 这是日本人名，但必须使用中文汉字音译，如：田中太郎、佐藤花子、铃木健一。\n'
      prompt += '- 不能使用日文假名，必须全部使用中文汉字。\n'
    } else if (type === 'en') {
      prompt +=
        '- 这是西方人名，但必须使用中文汉字音译，如：约翰·史密斯、玛丽·威廉姆斯、詹姆斯·布朗。\n'
      prompt += '- 不能使用英文字母，姓氏和名字之间用中文顿号“·”分隔。\n'
    } else {
      prompt += '- 要求名称有创意、符合文化背景、朗朗上口。\n'
    }
  } else {
    if (surname) prompt += `- 前缀或核心词：${surname}\n`
    prompt += `- 要求名称有创意、符合${typeMap[type]}的特点。\n`
  }

  prompt += '\n请直接返回名称列表，每行一个名称，不要添加序号或其他说明。'

  return [
    {
      role: 'system',
      content:
        '你是一个专业的起名助手，擅长生成各种类型的名称。你生成的所有名字必须使用中文汉字，不能包含任何日文假名、英文字母或其他非中文字符。'
    },
    { role: 'user', content: prompt }
  ]
}

function parseNames(rawText = '', count = 24) {
  return String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^\d+[.、]\s*/, '').trim())
    .filter(Boolean)
    .filter((name) => !/[a-zA-Z\u3040-\u309F\u30A0-\u30FF]/.test(name))
    .slice(0, count)
}

class EditorTextAiService {
  async generateNames(payload = {}, textProvider) {
    ensureTextProvider(textProvider)
    const count = Number.isFinite(Number(payload.count))
      ? Math.max(1, Math.min(100, Number(payload.count)))
      : 24
    const result = await textProvider.chat({
      messages: buildNameMessages({ ...payload, count }),
      model: payload.model || payload.modelName || undefined,
      temperature: 0.9,
      max_tokens: 1000,
      requestId: `generateNames_${payload.type || 'cn'}_${Date.now()}`
    })
    const names = parseNames(result.content, count)
    if (!names.length) throw new Error('AI 未返回可用名称，请重试')
    return {
      ...textResult(result, names.join('\n')),
      names
    }
  }

  async polishChapter(payload = {}, textProvider) {
    ensureTextProvider(textProvider)
    const text = sanitizeText(payload.text)
    if (!text) throw new Error('待润色内容不能为空')

    const result = await textProvider.chat({
      messages: [
        {
          role: 'system',
          content:
            '你是一名专业的中文写作编辑，擅长润色网文、小说。请对用户提供的整章正文进行润色：优化表达、修正语病、增强可读性，保持原意与风格，段落结构保持合理。只输出润色后的整章正文内容，不要添加任何解释、标题或前后缀。'
        },
        { role: 'user', content: text }
      ],
      model: payload.model || payload.modelName || undefined,
      temperature: 0.5,
      max_tokens: 8000,
      requestId: `polishChapter_${Date.now()}`
    })

    const content = sanitizeText(result.content)
    if (!content) throw new Error('润色结果为空，请重试')
    return textResult(result, content)
  }

  async continueChapter(payload = {}, textProvider) {
    ensureTextProvider(textProvider)
    const baseText = sanitizeText(payload.text)
    if (!baseText) throw new Error('当前章节内容为空，无法续写')

    const maxWords = Number.isFinite(Number(payload.maxAddWords))
      ? Math.max(0, Math.floor(Number(payload.maxAddWords)))
      : 0
    if (maxWords <= 0) throw new Error('可续写字数不足，请新建章节')

    const prompt = sanitizeText(payload.prompt)
    const requirementText = prompt ? `\n\n续写要求：\n${prompt}\n` : ''
    const result = await textProvider.chat({
      messages: [
        {
          role: 'system',
          content:
            `你是一名专业的中文小说写作者。请在不改变用户原文的前提下，承接上文继续写作。\n` +
            `要求：\n` +
            `- 只输出“续写新增的正文内容”，不要重复原文，不要输出标题、提纲、解释或任何前后缀。\n` +
            `- 保持与原文一致的人称、时态、语气与风格，段落结构自然。\n` +
            `- 续写长度尽量控制在 ${maxWords} 字以内（以中文字符计数的近似，不要超过）。\n`
        },
        {
          role: 'user',
          content: `原文：\n${baseText}\n${requirementText}\n请直接输出续写内容：`
        }
      ],
      model: payload.model || payload.modelName || undefined,
      temperature: 0.7,
      max_tokens: Math.min(8000, Math.max(256, Math.ceil(maxWords * 2))),
      requestId: `continueChapter_${Date.now()}`
    })

    const content = sanitizeText(result.content)
    if (!content) throw new Error('续写结果为空，请重试')
    return textResult(result, content)
  }

  async sceneVisualPromptFromExcerpt(payload = {}, textProvider) {
    ensureTextProvider(textProvider)
    const text = sanitizeText(payload.text)
    if (!text) throw new Error('节选内容为空，无法提炼')

    const result = await textProvider.chat({
      messages: [
        {
          role: 'system',
          content:
            '你是文生图提示词编辑。用户会提供一段小说正文节选，请提炼为一段中文「画面描述」，用于 AI 绘图：只写可见的场景、人物外观与动作、环境、光线与氛围；不要写旁白评价、书名、章节号；不要分点、不要引号包裹整段；不要输出「画面描述：」等前缀。长度控制在 200 字以内。'
        },
        { role: 'user', content: `下列为小说节选，请只输出一段画面描述：\n\n${text}` }
      ],
      model: payload.model || payload.modelName || undefined,
      temperature: 0.4,
      max_tokens: 512,
      requestId: `sceneVisual_${Date.now()}`
    })

    const content = sanitizeText(result.content)
      .replace(/^(画面描述|描述)[:：]\s*/i, '')
      .trim()
    if (!content) throw new Error('提炼结果为空，请重试')
    return textResult(result, content)
  }
}

const editorTextAiService = new EditorTextAiService()

export default editorTextAiService

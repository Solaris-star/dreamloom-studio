import { createSnapshot } from './settingSnapshotService.js'

const STRATEGY_PROMPTS = {
  fantasy: {
    label: '玄幻网文',
    focus: ['力量体系', '势力格局', '地理环境', '核心规则'],
    systemPrompt:
      '你是一名资深中文玄幻网文设定架构师。请根据用户的创意生成结构化的世界设定树，涵盖力量体系、势力格局、地理环境、核心规则等维度。设定要层次分明、逻辑自洽、适合长篇连载。只输出 JSON，不要 Markdown、解释或代码块标记。',
    userTemplate: (idea) =>
      [
        `创意：${idea}`,
        '',
        '请生成一棵设定树，包含以下维度：力量体系、势力格局、地理环境、核心规则。',
        '每个维度作为顶层分类，分类下可包含子分类（children）和具体设定条目（items）。',
        '',
        '严格按此 JSON 格式返回：',
        JSON.stringify(
          {
            categories: [
              {
                name: '分类名称',
                introduction: '分类简介',
                items: [{ name: '条目名称', introduction: '条目简介' }],
                children: [
                  {
                    name: '子分类名称',
                    introduction: '子分类简介',
                    items: [{ name: '条目名称', introduction: '条目简介' }],
                    children: []
                  }
                ]
              }
            ]
          },
          null,
          2
        ),
        '',
        '要求：',
        '1. 顶层分类 4 个，分别对应力量体系、势力格局、地理环境、核心规则。',
        '2. 每个分类至少 2 个子分类或条目。',
        '3. name 不超过 10 字，introduction 在 30-80 字之间。',
        '4. 只输出合法 JSON。'
      ].join('\n')
  },
  urban: {
    label: '都市网文',
    focus: ['社会背景', '核心金手指', '人物关系网', '关键场景'],
    systemPrompt:
      '你是一名资深中文都市网文设定架构师。请根据用户的创意生成结构化的都市设定树，涵盖社会背景、核心金手指、人物关系网、关键场景等维度。设定要贴近现实、逻辑自洽、有代入感。只输出 JSON，不要 Markdown、解释或代码块标记。',
    userTemplate: (idea) =>
      [
        `创意：${idea}`,
        '',
        '请生成一棵设定树，包含以下维度：社会背景、核心金手指、人物关系网、关键场景。',
        '每个维度作为顶层分类，分类下可包含子分类（children）和具体设定条目（items）。',
        '',
        '严格按此 JSON 格式返回：',
        JSON.stringify(
          {
            categories: [
              {
                name: '分类名称',
                introduction: '分类简介',
                items: [{ name: '条目名称', introduction: '条目简介' }],
                children: [
                  {
                    name: '子分类名称',
                    introduction: '子分类简介',
                    items: [{ name: '条目名称', introduction: '条目简介' }],
                    children: []
                  }
                ]
              }
            ]
          },
          null,
          2
        ),
        '',
        '要求：',
        '1. 顶层分类 4 个，分别对应社会背景、核心金手指、人物关系网、关键场景。',
        '2. 每个分类至少 2 个子分类或条目。',
        '3. name 不超过 10 字，introduction 在 30-80 字之间。',
        '4. 只输出合法 JSON。'
      ].join('\n')
  },
  scifi: {
    label: '科幻',
    focus: ['科技体系', '星际格局', '社会制度', '关键设定'],
    systemPrompt:
      '你是一名资深中文科幻小说设定架构师。请根据用户的创意生成结构化的科幻设定树，涵盖科技体系、星际格局、社会制度、关键设定等维度。设定要有科学质感、逻辑自洽、适合长篇展开。只输出 JSON，不要 Markdown、解释或代码块标记。',
    userTemplate: (idea) =>
      [
        `创意：${idea}`,
        '',
        '请生成一棵设定树，包含以下维度：科技体系、星际格局、社会制度、关键设定。',
        '每个维度作为顶层分类，分类下可包含子分类（children）和具体设定条目（items）。',
        '',
        '严格按此 JSON 格式返回：',
        JSON.stringify(
          {
            categories: [
              {
                name: '分类名称',
                introduction: '分类简介',
                items: [{ name: '条目名称', introduction: '条目简介' }],
                children: [
                  {
                    name: '子分类名称',
                    introduction: '子分类简介',
                    items: [{ name: '条目名称', introduction: '条目简介' }],
                    children: []
                  }
                ]
              }
            ]
          },
          null,
          2
        ),
        '',
        '要求：',
        '1. 顶层分类 4 个，分别对应科技体系、星际格局、社会制度、关键设定。',
        '2. 每个分类至少 2 个子分类或条目。',
        '3. name 不超过 10 字，introduction 在 30-80 字之间。',
        '4. 只输出合法 JSON。'
      ].join('\n')
  },
  free: {
    label: '自由生成',
    focus: [],
    systemPrompt:
      '你是一名资深中文小说设定架构师。请根据用户的创意自由生成结构化的世界设定树，分类维度由你根据创意内容自行决定，确保设定层次分明、逻辑自洽、适合长篇写作。只输出 JSON，不要 Markdown、解释或代码块标记。',
    userTemplate: (idea) =>
      [
        `创意：${idea}`,
        '',
        '请根据创意内容自由生成设定树，分类维度由你决定。',
        '每个分类下可包含子分类（children）和具体设定条目（items）。',
        '',
        '严格按此 JSON 格式返回：',
        JSON.stringify(
          {
            categories: [
              {
                name: '分类名称',
                introduction: '分类简介',
                items: [{ name: '条目名称', introduction: '条目简介' }],
                children: [
                  {
                    name: '子分类名称',
                    introduction: '子分类简介',
                    items: [{ name: '条目名称', introduction: '条目简介' }],
                    children: []
                  }
                ]
              }
            ]
          },
          null,
          2
        ),
        '',
        '要求：',
        '1. 顶层分类 3-6 个，维度由你根据创意自行决定。',
        '2. 每个分类至少 2 个子分类或条目。',
        '3. name 不超过 10 字，introduction 在 30-80 字之间。',
        '4. 只输出合法 JSON。'
      ].join('\n')
  }
}

const STRATEGY_ALIASES = {
  xuanhuan: 'fantasy',
  fantasy: 'fantasy',
  dushi: 'urban',
  urban: 'urban',
  kehuan: 'scifi',
  scifi: 'scifi',
  free: 'free'
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStrategy(strategy) {
  return STRATEGY_ALIASES[sanitizeText(strategy)] || 'free'
}

function parseSettingTree(rawText) {
  const text = sanitizeText(rawText)
  if (!text) return null

  let candidate = text
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    candidate = fenced[1].trim()
  }

  try {
    return JSON.parse(candidate)
  } catch {
    // fallback: extract first { ... } block
  }

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      return null
    }
  }

  return null
}

function normalizeCategoryNode(node) {
  if (!node || typeof node !== 'object') return null
  const name = sanitizeText(node.name)
  if (!name) return null

  const introduction = sanitizeText(node.introduction)
  const items = Array.isArray(node.items)
    ? node.items
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const itemName = sanitizeText(item.name)
          if (!itemName) return null
          return { name: itemName, introduction: sanitizeText(item.introduction) }
        })
        .filter(Boolean)
    : []

  const children = Array.isArray(node.children)
    ? node.children.map(normalizeCategoryNode).filter(Boolean)
    : []

  return { name, introduction, items, children }
}

function validateSettingTree(data) {
  if (!data || !Array.isArray(data.categories)) {
    throw new Error('AI 返回的设定树结构无效：缺少 categories 数组')
  }

  const categories = data.categories.map(normalizeCategoryNode).filter(Boolean)
  if (!categories.length) {
    throw new Error('AI 返回的设定树结构无效：未解析出有效分类')
  }

  return { categories }
}

function buildRegenerateMessages({ nodeName, nodeIntroduction, parentPath, strategy, idea }) {
  const strategyKey = normalizeStrategy(strategy)
  const strategyInfo = STRATEGY_PROMPTS[strategyKey]
  const strategyLabel = strategyInfo ? strategyInfo.label : '自由生成'
  const pathLabel = parentPath.length ? parentPath.join(' → ') : '顶层'

  return [
    {
      role: 'system',
      content:
        '你是一名资深中文小说设定架构师。请根据上下文重新生成指定设定节点的子结构。只输出 JSON，不要 Markdown、解释或代码块标记。'
    },
    {
      role: 'user',
      content: [
        `创意：${idea}`,
        `生成策略：${strategyLabel}`,
        `当前节点：${nodeName}`,
        `节点简介：${nodeIntroduction || '无'}`,
        `所属路径：${pathLabel}`,
        '',
        '请为该节点重新生成子分类和设定条目，严格按此 JSON 格式返回：',
        JSON.stringify(
          {
            categories: [
              {
                name: '子分类名称',
                introduction: '子分类简介',
                items: [{ name: '条目名称', introduction: '条目简介' }],
                children: []
              }
            ]
          },
          null,
          2
        ),
        '',
        '要求：',
        '1. 生成 2-4 个子分类或条目。',
        '2. name 不超过 10 字，introduction 在 30-80 字之间。',
        '3. 只输出合法 JSON。'
      ].join('\n')
    }
  ]
}

class SettingTreeAiService {
  async generateSettingTree({ idea, strategy = 'free', bookPath }, textProvider) {
    if (!textProvider?.chat) {
      throw new Error('文本 AI 服务不可用')
    }

    const ideaText = sanitizeText(idea)
    if (!ideaText) {
      throw new Error('请先输入小说创意')
    }

    const strategyKey = normalizeStrategy(strategy)
    const strategyConfig = STRATEGY_PROMPTS[strategyKey]
    const messages = [
      { role: 'system', content: strategyConfig.systemPrompt },
      { role: 'user', content: strategyConfig.userTemplate(ideaText) }
    ]

    const result = await textProvider.chat({
      messages,
      temperature: 0.72,
      max_tokens: 4000,
      requestId: `setting_tree_${Date.now()}`
    })

    const rawText = sanitizeText(result.content)
    if (!rawText) {
      throw new Error('AI 返回结果为空，请重试')
    }

    const parsed = parseSettingTree(rawText)
    if (!parsed) {
      throw new Error('AI 返回内容无法解析为 JSON，请重试')
    }

    const tree = validateSettingTree(parsed)

    if (bookPath) {
      try {
        createSnapshot(bookPath, { name: '生成设定树前自动快照', trigger: 'auto_before_generate' })
      } catch {
        // snapshot failure should not block the main flow
      }
    }

    return {
      ...tree,
      strategy: strategyKey,
      usage: result.usage || {},
      model: result.model || '',
      providerId: result.providerId || ''
    }
  }

  async regenerateSettingNode(
    { nodeName, nodeIntroduction, parentPath, strategy, idea },
    textProvider
  ) {
    if (!textProvider?.chat) {
      throw new Error('文本 AI 服务不可用')
    }

    const name = sanitizeText(nodeName)
    if (!name) {
      throw new Error('请指定需要重新生成的节点名称')
    }

    const path = Array.isArray(parentPath) ? parentPath : []

    const messages = buildRegenerateMessages({
      nodeName: name,
      nodeIntroduction: sanitizeText(nodeIntroduction),
      parentPath: path,
      strategy: normalizeStrategy(strategy),
      idea: sanitizeText(idea) || '未指定'
    })

    const result = await textProvider.chat({
      messages,
      temperature: 0.72,
      max_tokens: 3000,
      requestId: `setting_regen_${Date.now()}`
    })

    const rawText = sanitizeText(result.content)
    if (!rawText) {
      throw new Error('AI 返回结果为空，请重试')
    }

    const parsed = parseSettingTree(rawText)
    if (!parsed) {
      throw new Error('AI 返回内容无法解析为 JSON，请重试')
    }

    const tree = validateSettingTree(parsed)
    return {
      ...tree,
      strategy: normalizeStrategy(strategy),
      usage: result.usage || {},
      model: result.model || '',
      providerId: result.providerId || ''
    }
  }
}

const settingTreeAiService = new SettingTreeAiService()

export default settingTreeAiService

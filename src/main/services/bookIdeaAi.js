function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stripJsonFence(raw) {
  const text = sanitizeText(raw)
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return text
}

function parseJsonObject(raw) {
  const text = stripJsonFence(raw)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('AI 返回内容不是有效 JSON，请重试')
  }
}

function normalizeList(value, max = 6) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, max)
}

function normalizePlan(plan, index, allowedTypes) {
  const fallbackType = allowedTypes[0] || { value: 'xuanhua', label: '玄幻（通用）' }
  const rawType = sanitizeText(plan?.type)
  const typeItem = allowedTypes.find((item) => item.value === rawType) || fallbackType

  return {
    id: sanitizeText(plan?.id) || `idea-${index + 1}`,
    title: sanitizeText(plan?.title).slice(0, 15) || `新书方案${index + 1}`,
    type: typeItem.value,
    typeName: typeItem.label,
    intro: sanitizeText(plan?.intro) || '一个等待继续完善的故事。',
    protagonist: sanitizeText(plan?.protagonist),
    coreHook: sanitizeText(plan?.coreHook),
    worldRules: normalizeList(plan?.worldRules, 6),
    conflicts: normalizeList(plan?.conflicts, 6),
    settings: normalizeList(plan?.settings, 8),
    firstChapters: normalizeList(plan?.firstChapters, 5)
  }
}

function normalizePayload(payload) {
  const idea = sanitizeText(payload?.idea)
  const tags = normalizeList(payload?.tags, 8)
  const model = sanitizeText(payload?.model) || 'deepseek-chat'
  const rawTypes = Array.isArray(payload?.availableTypes) ? payload.availableTypes : []
  const availableTypes = rawTypes
    .map((item) => ({
      value: sanitizeText(item?.value),
      label: sanitizeText(item?.label)
    }))
    .filter((item) => item.value && item.label)

  if (!idea && !tags.length) {
    throw new Error('请先输入小说创意，或选择一个题材')
  }

  return { idea, tags, availableTypes, model }
}

class BookIdeaAiService {
  async generateBookIdeas(payload = {}, textAiService) {
    const { idea, tags, availableTypes, model } = normalizePayload(payload)
    if (!textAiService?.chat) {
      throw new Error('文本 AI 服务不可用')
    }
    const typeOptions = availableTypes
      .slice(0, 80)
      .map((item) => `${item.value}=${item.label}`)
      .join('；')

    const messages = [
      {
        role: 'system',
        content: [
          '你是一名中文网络小说开书顾问。',
          '请根据用户的粗略想法生成 3 套可直接开写的小说方案。',
          '每套方案必须包含书名、题材 value、简介、主角、核心看点、世界规则、主要冲突、设定条目、前三章方向。',
          '书名最多 15 个中文字符。简介 80 到 160 字。设定条目要适合写入设定管理。',
          '只输出 JSON，不要 Markdown，不要解释。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `创意：${idea || '用户暂未输入'}`,
          `偏好标签：${tags.length ? tags.join('、') : '无'}`,
          `可用题材 value：${typeOptions}`,
          '',
          '请按此格式返回：',
          JSON.stringify(
            {
              plans: [
                {
                  id: 'idea-1',
                  title: '书名',
                  type: 'xuanhua',
                  intro: '简介',
                  protagonist: '主角设定',
                  coreHook: '核心看点',
                  worldRules: ['世界规则 1', '世界规则 2'],
                  conflicts: ['主要冲突 1', '主要冲突 2'],
                  settings: ['设定条目 1', '设定条目 2'],
                  firstChapters: ['第1章方向', '第2章方向', '第3章方向']
                }
              ]
            },
            null,
            2
          )
        ].join('\n')
      }
    ]

    const result = await textAiService.chat({
      messages,
      model,
      temperature: 0.72,
      max_tokens: 3200,
      requestId: `book_idea_${Date.now()}`
    })

    const parsed = parseJsonObject(result.content)
    const plans = Array.isArray(parsed?.plans) ? parsed.plans : []
    const normalizedPlans = plans
      .map((plan, index) => normalizePlan(plan, index, availableTypes))
      .filter((plan) => plan.title && plan.intro)
      .slice(0, 3)

    if (!normalizedPlans.length) {
      throw new Error('AI 没有生成可用方案，请换个创意再试')
    }

    return {
      success: true,
      content: JSON.stringify(normalizedPlans),
      images: [],
      plans: normalizedPlans,
      usage: result.usage || {},
      model: result.model || model,
      providerId: result.providerId || '',
      error: ''
    }
  }
}

const bookIdeaAiService = new BookIdeaAiService()

export default bookIdeaAiService

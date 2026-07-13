import { runWebAiTextTask } from './webAiTextClient.js'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractJson(textValue) {
  const source = text(textValue)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectStart = source.indexOf('{')
  const objectEnd = source.lastIndexOf('}')
  const arrayStart = source.indexOf('[')
  const arrayEnd = source.lastIndexOf(']')
  const hasObject = objectStart !== -1 && objectEnd > objectStart
  const hasArray = arrayStart !== -1 && arrayEnd > arrayStart
  if (hasArray && (!hasObject || arrayStart < objectStart)) {
    return source.slice(arrayStart, arrayEnd + 1)
  }
  return hasObject ? source.slice(objectStart, objectEnd + 1) : source
}

function itemContent(item) {
  if (text(item?.content)) return text(item.content)
  return [
    ['概述', item?.summary],
    ['目标', item?.goals],
    ['冲突', item?.conflict],
    ['推进', item?.progression],
    ['结果/悬念', item?.resultHint]
  ]
    .filter(([, value]) => text(value))
    .map(([label, value]) => `${label}：${text(value)}`)
    .join('\n')
}

export function parseOutlineSplitResult(rawText) {
  if (!text(rawText)) return { items: [], parseError: 'AI 返回内容为空，请重试。' }
  try {
    const parsed = JSON.parse(extractJson(rawText))
    const source = Array.isArray(parsed) ? parsed : parsed?.items
    if (!Array.isArray(source)) throw new Error('缺少 items 数组')
    const items = source
      .map((item, index) => ({
        title: text(item?.title) || `第${index + 1}段`,
        content: itemContent(item),
        summary: text(item?.summary),
        goals: text(item?.goals),
        conflict: text(item?.conflict),
        progression: text(item?.progression),
        resultHint: text(item?.resultHint)
      }))
      .filter((item) => item.title && item.content)
    if (!items.length) throw new Error('未解析出有效子大纲')
    return { items, parseError: '' }
  } catch (error) {
    return { items: [], parseError: error?.message || '结构化结果解析失败' }
  }
}

function refineInstruction(payload) {
  const modePrompts = {
    details: '重点补充关键细节、因果、设定限制与可执行写作信息。',
    conflict: '重点强化冲突、阻力、反转、博弈与戏剧张力。',
    pacing: '重点优化信息释放节奏、层次递进与段落安排。',
    world: '重点补足人物动机、势力关系、世界规则与伏笔线索。',
    overall: '在不偏离原意的前提下，整体扩写并提升可写性。'
  }
  const previousDraft = text(payload.previousDraft)
  return [
    '你是一名专业的中文长篇小说策划编辑，擅长把零散想法补全为可直接写作的大纲。',
    '请只输出最终的大纲正文，不要输出标题、说明、分析、分点解释或任何前后缀。',
    `任务类型：${previousDraft ? '继续修改大纲草稿' : '完善大纲'}`,
    `当前节点标题：${text(payload.nodeTitle) || '未命名大纲'}`,
    `优化重点：${modePrompts[text(payload.mode)] || modePrompts.overall}`,
    previousDraft
      ? '执行原则：请在上一轮草稿基础上继续修改，优先保留已经成熟的内容。'
      : '执行原则：请基于原始大纲扩写完善，把简略想法补成可继续写作的大纲正文。',
    text(payload.userInstruction)
      ? `用户补充要求：${text(payload.userInstruction)}`
      : '用户补充要求：无',
    previousDraft ? `上一轮草稿：\n${previousDraft}` : '',
    '请直接输出本轮整理后的大纲正文。'
  ]
    .filter(Boolean)
    .join('\n')
}

function splitInstruction(payload) {
  const modePrompts = {
    plot: '按剧情推进阶段拆分，强调起承转合与故事推进。',
    conflict: '按冲突升级拆分，强调阻力、反转、加码与阶段性结果。',
    timeline: '按时间顺序拆分，强调连续事件与前后因果。',
    chapter: '按章节策划拆分，每段都应像可直接写作的小章节。'
  }
  const count = Number.isFinite(Number(payload.count))
    ? Math.max(2, Math.min(12, Number(payload.count)))
    : 3
  const previousDraft = text(payload.previousDraft)
  return [
    '你是一名专业的中文长篇小说策划编辑。',
    '请把用户提供的大纲拆分为多个可独立写作的子大纲，并且只输出 JSON，不要输出 Markdown、解释、注释或代码块。',
    'JSON 格式必须是 {"items":[...]}。每个 item 必须包含 title、content、summary、goals、conflict、progression、resultHint 七个字符串字段。',
    `任务类型：${previousDraft ? '继续调整拆分草稿' : '拆分并扩写大纲'}`,
    `当前节点标题：${text(payload.nodeTitle) || '未命名大纲'}`,
    `拆分模式：${modePrompts[text(payload.mode)] || modePrompts.plot}`,
    `目标段数：${count}`,
    text(payload.userInstruction)
      ? `用户补充要求：${text(payload.userInstruction)}`
      : '用户补充要求：无',
    previousDraft ? `上一轮拆分草稿（请在其基础上调整）：\n${previousDraft}` : '',
    `严格输出 ${count} 个 items，不能多也不能少。所有字段必须为非空字符串，只输出合法 JSON。`
  ]
    .filter(Boolean)
    .join('\n')
}

function requireOutlineAiTaskResult(result, expectedTaskType, fallback = 'AI 请求失败') {
  if (result?.success !== true) throw new Error(result?.message || result?.error || fallback)
  if (expectedTaskType === 'refine') {
    const content = text(result.content)
    if (!content) throw new Error(`${fallback}：接口没有返回正文`)
    return { ...result, content }
  }
  if (expectedTaskType === 'split') {
    const rawText = text(result.rawText || result.content)
    if (!rawText) throw new Error(`${fallback}：接口没有返回切分草稿`)
    return { ...result, rawText, items: Array.isArray(result.items) ? result.items : [] }
  }
  throw new Error(fallback)
}

export async function runOutlineAiTask(payload, expectedTaskType, fallback) {
  const taskType = text(payload?.taskType)
  if (!['refine', 'split'].includes(taskType) || taskType !== expectedTaskType) {
    throw new Error(fallback || '不支持的 AI 大纲任务类型')
  }
  const sourceContent = text(payload?.sourceContent)
  if (!sourceContent) throw new Error(taskType === 'split' ? '当前大纲内容为空，无法拆分' : '当前大纲内容为空，无法完善')
  const result = await runWebAiTextTask(
    payload,
    {
      task: 'custom',
      feature: taskType === 'split' ? 'outline_split' : 'outline_refine',
      title: taskType === 'split' ? 'AI 大纲拆分' : 'AI 大纲完善',
      content: sourceContent,
      instruction: taskType === 'split' ? splitInstruction(payload) : refineInstruction(payload),
      temperature: taskType === 'split' ? 0.4 : 0.6,
      maxTokens: taskType === 'split' ? 6000 : 5000
    },
    { fallback: fallback || 'AI 大纲任务失败' }
  )
  const parsed = taskType === 'split' ? parseOutlineSplitResult(result.content) : null
  return requireOutlineAiTaskResult(
    {
      success: true,
      taskType,
      content: result.content,
      rawText: taskType === 'split' ? result.content : undefined,
      items: parsed?.items,
      parseError: parsed?.parseError,
      images: [],
      usage: result.response?.usage || {},
      model: result.response?.model || '',
      providerId: result.response?.providerId || ''
    },
    expectedTaskType,
    fallback
  )
}

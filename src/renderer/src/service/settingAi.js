import { runWebAiTextTask } from './webAiTextClient.js'

function requireRefinedSettingResult(result, fallback = 'AI 改写失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  const content = String(result.content || '').trim()
  if (!content) {
    throw new Error(`${fallback}：接口没有返回正文`)
  }
  return { ...result, content }
}

export async function refineSettingWithAI(payload, fallback) {
  const name = String(payload?.settingName || '').trim() || '未命名设定'
  const userInstruction = String(payload?.userInstruction || '').trim()
  const result = await runWebAiTextTask(
    payload || {},
    {
      task: 'custom',
      feature: 'setting_refine',
      title: 'AI 完善设定',
      content: String(payload?.sourceContent || '').trim() || '（空）',
      instruction: [
        '你是一名资深中文小说设定编辑。',
        '请在不偏离原意的前提下完善设定内容，补齐因果、细节、限制与可写信息。',
        '只输出最终设定正文，不要输出标题、说明、分析、分点标签、Markdown 或代码块。',
        '',
        `设定名称：${name}`,
        userInstruction ? `完善要求：${userInstruction}` : '完善要求：无（请自行补足内容）',
        '',
        '请直接输出“完善后的设定正文”。'
      ].join('\n'),
      temperature: 0.6,
      maxTokens: 5000
    },
    { fallback: fallback || 'AI 改写失败' }
  )
  return requireRefinedSettingResult({
    success: true,
    content: result.content,
    images: [],
    usage: result.response?.usage || {},
    model: result.response?.model || '',
    providerId: result.response?.providerId || ''
  }, fallback)
}

import { postJson } from './webHttpClient.js'

async function getStoreValue(key, fallback = '') {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error('读取 DeepSeek 设置失败')
  }
  return result.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true || result.key !== key) {
    throw new Error('保存 DeepSeek 设置失败')
  }
}

function requireTextResult(result, fallback) {
  const content = typeof result?.content === 'string' ? result.content.trim() : ''
  if (result?.success !== true || !content) {
    throw new Error(result?.message || fallback)
  }
  return content
}

function buildNamePrompt(options, count) {
  const details = [
    options.type ? `类型：${options.type}` : '',
    options.surname ? `姓氏：${options.surname}` : '',
    options.gender ? `性别：${options.gender}` : '',
    options.nameLength ? `名字长度：${options.nameLength}` : '',
    options.middleChar ? `指定字：${options.middleChar}` : '',
    `数量：${count}`
  ].filter(Boolean)
  return details.join('\n')
}

function parseNames(content, count) {
  const seen = new Set()
  return content
    .split(/[\n,，、;；]+/)
    .map((name) => name.replace(/^\s*(?:\d+[.、)]|[-*])\s*/, '').trim())
    .filter((name) => {
      if (!/^[\u3400-\u9fff·]{2,18}$/.test(name) || seen.has(name)) return false
      seen.add(name)
      return true
    })
    .slice(0, count)
}

export async function setDeepSeekApiKey(apiKey) {
  const savedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  await setStoreValue('deepseek.apiKey', savedApiKey)
  return { success: true, configured: Boolean(savedApiKey), source: savedApiKey ? 'store' : '' }
}

export async function getDeepSeekApiKey() {
  const apiKey = await getStoreValue('deepseek.apiKey', '')
  return {
    success: true,
    apiKey,
    configured: Boolean(String(apiKey || '').trim()),
    source: apiKey ? 'store' : ''
  }
}

export async function generateNamesWithAI(options = {}) {
  const count = Number(options.count) > 0 ? Math.min(Math.floor(Number(options.count)), 50) : 24
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'name_generator',
    title: 'AI 随机起名',
    content: buildNamePrompt(options, count),
    instruction: [
      '请为中文小说写作生成名称。',
      '名称只能使用中文汉字和间隔号，不能包含序号或说明。',
      '请直接返回名称列表，每行一个名称。'
    ].join('\n'),
    temperature: 0.9,
    maxTokens: 1000,
    providerId: options.providerId || '',
    model: options.model || ''
  })
  const names = parseNames(requireTextResult(response, 'AI 起名失败'), count)
  if (!names.length) throw new Error('AI 没有返回可用名称')
  return { success: true, names, usage: response.usage || {}, model: response.model || '' }
}

export async function validateDeepSeekApiKey() {
  const apiKey = await getStoreValue('deepseek.apiKey', '')
  if (!apiKey) throw new Error('请先保存 API Key')
  const result = await postJson('/api/ai-proxy', {
    targetUrl: 'https://api.deepseek.com/v1/models',
    apiKey,
    method: 'GET'
  })
  const models = Array.isArray(result?.data?.data)
    ? result.data.data.map((item) => item.id).filter(Boolean)
    : []
  return {
    success: true,
    valid: true,
    isValid: true,
    models,
    message: 'API Key 验证通过'
  }
}

export async function refineSceneVisualPromptWithAI(text) {
  const content = String(text || '').trim()
  if (!content) throw new Error('节选内容为空，无法提炼')
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'scene_visual_prompt',
    title: '场景图画面描述',
    content,
    instruction: [
      '请把这段小说正文提炼为一段中文文生图画面描述。',
      '只写可见的场景、人物外观与动作、环境、光线和氛围。',
      '不要写旁白评价、书名、章节号，不要分点，不要加标题或引号。',
      '长度控制在 200 字以内。'
    ].join('\n'),
    temperature: 0.4,
    maxTokens: 512
  })
  const resultText = requireTextResult(response, '场景图画面描述失败')
    .replace(/^(画面描述|描述)[:：]\s*/i, '')
    .trim()
  if (!resultText) throw new Error('AI 返回结果为空，请重试')
  return {
    success: true,
    content: resultText,
    usage: response.usage || {},
    model: response.model || '',
    providerId: response.providerId || ''
  }
}

import { fetchJson, postJson } from './webHttpClient.js'
import { requestEditorTextCleanup } from './editorTextCleanup.js'

/**
 * Web 版 window.electron / window.electronStore 兼容层
 *
 * 在浏览器环境下挂载等价方法，通过 Vite dev server 暴露的
 * HTTP 端点完成本地服务能做的事情。仅覆盖编辑器实际依赖的接口；未实现的
 * AI / 系统对话框等接口会回退为「Web 端暂不支持」的安全降级。
 */

const NOT_SUPPORTED_MESSAGE = 'Web 端暂不支持该功能'

function isElectronEnv() {
  return typeof window !== 'undefined' && !!window.electron
}

function notSupportedSilent(method) {
  return async () => ({
    success: false,
    message: `${NOT_SUPPORTED_MESSAGE}: ${method}`
  })
}

function hasResultData(result) {
  return (
    result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')
  )
}

function requireSuccessResult(result, fallbackMessage = '操作失败') {
  if (result?.success === false) {
    throw new Error(result?.message || fallbackMessage)
  }
  return result
}

function unwrapResultData(result, fallbackMessage = '读取数据失败') {
  if (result?.success === false) {
    throw new Error(result?.message || fallbackMessage)
  }
  if (result?.success === true && hasResultData(result)) return result.data
  return result
}

function buildImageGenerationsUrl(baseUrl = '') {
  const trimmedUrl = String(baseUrl || '').replace(/\/$/, '')
  if (!trimmedUrl) return ''
  if (trimmedUrl.includes('/v1/images/generations')) return trimmedUrl
  if (trimmedUrl.includes('/v1/images')) return `${trimmedUrl}/generations`
  if (trimmedUrl.includes('/v1')) return `${trimmedUrl}/images/generations`
  return `${trimmedUrl}/v1/images/generations`
}

function readAiProxyMessage(proxyResult, fallback = '验证失败') {
  return (
    proxyResult?.data?.error?.message ||
    proxyResult?.data?.message ||
    proxyResult?.message ||
    (proxyResult?.status ? `${fallback}: ${proxyResult.status}` : fallback)
  )
}

function requireStoredAiProviders(raw, label = '读取 Provider 失败') {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.providers)) return raw.providers
  throw new Error(`${label}：接口返回格式不正确`)
}

function requireStoreArray(value, label = '读取本地记录失败') {
  if (Array.isArray(value)) return value
  throw new Error(`${label}：本地记录格式不正确`)
}

function buildImageTestBody(modelName = '') {
  const body = {
    prompt: 'test',
    n: 1,
    size: '256x256',
    width: 256,
    height: 256
  }
  if (modelName) body.model = modelName
  return body
}

async function testImageProviderByProxy({ baseUrl, apiKey, modelName = '' } = {}) {
  if (!baseUrl || !apiKey) {
    return { success: false, isValid: false, message: '请先填写 API 地址和 Key' }
  }
  try {
    const proxyResult = await postJson('/api/ai-proxy', {
      targetUrl: buildImageGenerationsUrl(baseUrl),
      apiKey,
      method: 'POST',
      body: buildImageTestBody(modelName)
    })
    if (proxyResult.success) {
      return { success: true, isValid: true, message: '图像模型测试成功' }
    }
    const message = readAiProxyMessage(proxyResult, '图像模型测试失败')
    return { success: false, isValid: false, message }
  } catch (error) {
    return { success: false, isValid: false, message: error.message || '图像模型测试失败' }
  }
}

function selectBrowserImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'

    const cleanup = () => {
      input.remove()
    }
    const finish = (result) => {
      cleanup()
      resolve(result)
    }

    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0]
        if (!file) {
          finish({ success: false, message: '未选择图片' })
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result || '')
          finish({
            success: true,
            filePath: dataUrl,
            dataUrl,
            fileName: file.name,
            mimeType: file.type
          })
        }
        reader.onerror = () => finish({ success: false, message: '读取图片失败' })
        reader.readAsDataURL(file)
      },
      { once: true }
    )

    input.addEventListener(
      'cancel',
      () => {
        finish({ success: false, message: '已取消选择' })
      },
      { once: true }
    )

    document.body.appendChild(input)
    input.click()
  })
}

function pickResponseText(response) {
  if (!response) return ''
  return String(
    response.content || response.result || response.text || response.output || ''
  ).trim()
}

function requireWebAiTextTaskResponse(response, fallbackMessage = 'AI 文本任务失败') {
  if (response?.success !== true) {
    return {
      success: false,
      message: response?.message || fallbackMessage,
      content: ''
    }
  }
  const content = pickResponseText(response)
  if (!content) {
    return { success: false, message: 'AI 返回结果为空，请重试', content: '' }
  }
  return { success: true, content }
}

function normalizeTextAiPayload(input, textKey = 'text') {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input
  return { [textKey]: input == null ? '' : String(input) }
}

function normalizeTextModelName(modelName = '') {
  const value = String(modelName || '').trim()
  return value === 'default' ? '' : value
}

function resolveResponseProviderMeta(response = {}, modelPayload = {}) {
  const parsed = splitModelBindingId(modelPayload.modelId)
  return {
    providerId: response?.providerId || modelPayload.providerId || parsed.providerId || '',
    model:
      response?.model || response?.modelName || modelPayload.modelName || parsed.modelName || ''
  }
}

function buildNameGenerationPrompt(options = {}) {
  const typeMap = {
    cn: '中国人名',
    jp: '日本人名',
    en: '西方人名',
    force: '势力名称',
    place: '地名',
    book: '秘籍名称',
    item: '法宝名称',
    elixir: '灵药名称'
  }
  const type = options.type || 'cn'
  const lines = [
    `类型：${typeMap[type] || '名称'}`,
    `数量：${Number(options.count) > 0 ? Math.min(Math.floor(Number(options.count)), 50) : 24}`
  ]
  if (options.surname) lines.push(`姓氏或核心词：${options.surname}`)
  if (options.gender && ['cn', 'jp', 'en'].includes(type)) lines.push(`性别：${options.gender}`)
  if (type === 'cn' && options.nameLength) lines.push(`名字长度：${options.nameLength} 个字`)
  if (type === 'cn' && options.middleChar) lines.push(`中间字：${options.middleChar}`)
  return lines.join('\n')
}

function parseGeneratedNames(text, count = 24) {
  const seen = new Set()
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line
        .replace(/^[-*•\s\d.、)）]+/, '')
        .replace(/[「」《》【】[\]]/g, '')
        .trim()
      const parts = trimmed.split(/[：:]/)
      return (parts.length > 1 ? parts[parts.length - 1] : trimmed).trim()
    })
    .filter((name) => {
      if (!/^[\u3400-\u9fff·]{2,18}$/.test(name)) return false
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .slice(0, count)
}

async function generateWebNamesWithAI(options = {}) {
  const count = Number(options.count) > 0 ? Math.min(Math.floor(Number(options.count)), 50) : 24
  const modelPayload = await resolveTextModelPayload('writing')
  const aiModelPayload = resolveTextAiModelPayload(options, modelPayload)
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'name_generator',
    title: 'AI 随机起名',
    content: buildNameGenerationPrompt({ ...options, count }),
    instruction: [
      '请为中文小说写作生成名称。',
      '所有名称必须使用中文汉字，可以使用间隔号“·”，不能包含英文字母、日文假名、序号或说明。',
      '请直接返回名称列表，每行一个名称。'
    ].join('\n'),
    temperature: 0.9,
    maxTokens: 1000,
    ...aiModelPayload
  })
  const aiResult = requireWebAiTextTaskResponse(response, 'AI 起名失败')
  if (aiResult.success !== true) {
    return { success: false, names: [], message: aiResult.message || 'AI 起名失败' }
  }
  const names = parseGeneratedNames(aiResult.content, count)
  if (!names.length) {
    return { success: false, names: [], message: 'AI 没有返回可用名称' }
  }
  return {
    success: true,
    names,
    usage: response?.usage || {},
    model: response?.model || ''
  }
}

function sanitizeWebText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function countWebTextWords(value) {
  return String(value || '').replace(/[\s\n\r\t]/g, '').length
}

function stripWebCodeFence(text) {
  const source = sanitizeWebText(text)
  if (!source) return ''
  return source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractWebJsonBlock(text) {
  const source = stripWebCodeFence(text)
  if (!source) return ''

  const firstObject = source.indexOf('{')
  const lastObject = source.lastIndexOf('}')
  if (firstObject !== -1 && lastObject > firstObject) {
    return source.slice(firstObject, lastObject + 1)
  }

  const firstArray = source.indexOf('[')
  const lastArray = source.lastIndexOf(']')
  if (firstArray !== -1 && lastArray > firstArray) {
    return source.slice(firstArray, lastArray + 1)
  }

  return source
}

function composeWebSplitItemContent(item) {
  const content = sanitizeWebText(item?.content)
  if (content) return content

  return [
    ['概述', item?.summary],
    ['目标', item?.goals],
    ['冲突', item?.conflict],
    ['推进', item?.progression],
    ['结果/悬念', item?.resultHint]
  ]
    .map(([label, value]) => [label, sanitizeWebText(value)])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}：${value}`)
    .join('\n')
}

function normalizeWebSplitItem(item, index) {
  return {
    title: sanitizeWebText(item?.title) || `第${index + 1}段`,
    content: composeWebSplitItemContent(item),
    summary: sanitizeWebText(item?.summary),
    goals: sanitizeWebText(item?.goals),
    conflict: sanitizeWebText(item?.conflict),
    progression: sanitizeWebText(item?.progression),
    resultHint: sanitizeWebText(item?.resultHint)
  }
}

function parseWebOutlineSplitResult(rawText) {
  const text = sanitizeWebText(rawText)
  if (!text) {
    return {
      items: [],
      parseError: 'AI 返回内容为空，请重试。'
    }
  }

  try {
    const parsed = JSON.parse(extractWebJsonBlock(text))
    const itemsSource = Array.isArray(parsed) ? parsed : parsed?.items
    if (!Array.isArray(itemsSource)) {
      throw new Error('缺少 items 数组')
    }

    const items = itemsSource
      .map((item, index) => normalizeWebSplitItem(item, index))
      .filter((item) => sanitizeWebText(item.title) && sanitizeWebText(item.content))

    if (!items.length) {
      throw new Error('未解析出有效子大纲')
    }

    return {
      items,
      parseError: ''
    }
  } catch (error) {
    return {
      items: [],
      parseError: error?.message || '结构化结果解析失败'
    }
  }
}

function buildWebOutlineRefineInstruction(payload = {}) {
  const title = sanitizeWebText(payload.nodeTitle) || '未命名大纲'
  const previousDraft = sanitizeWebText(payload.previousDraft)
  const userInstruction = sanitizeWebText(payload.userInstruction)
  const mode = sanitizeWebText(payload.mode) || 'overall'
  const hasPreviousDraft = Boolean(previousDraft)
  const modePrompts = {
    details: '重点补充关键细节、因果、设定限制与可执行写作信息。',
    conflict: '重点强化冲突、阻力、反转、博弈与戏剧张力。',
    pacing: '重点优化信息释放节奏、层次递进与段落安排。',
    world: '重点补足人物动机、势力关系、世界规则与伏笔线索。',
    overall: '在不偏离原意的前提下，整体扩写并提升可写性。'
  }

  return [
    '你是一名专业的中文长篇小说策划编辑，擅长把零散想法补全为可直接写作的大纲。',
    '请只输出最终的大纲正文，不要输出标题、说明、分析、分点解释或任何前后缀。',
    '',
    `任务类型：${hasPreviousDraft ? '继续修改大纲草稿' : '完善大纲'}`,
    `当前节点标题：${title}`,
    `优化重点：${modePrompts[mode] || modePrompts.overall}`,
    hasPreviousDraft
      ? '执行原则：请在上一轮草稿基础上继续修改，优先保留已经成熟的内容。'
      : '执行原则：请基于原始大纲扩写完善，把简略想法补成可继续写作的大纲正文。',
    userInstruction ? `用户补充要求：${userInstruction}` : '用户补充要求：无',
    hasPreviousDraft ? '' : '',
    hasPreviousDraft ? '上一轮草稿：' : '',
    hasPreviousDraft ? previousDraft : '',
    '',
    '请直接输出本轮整理后的大纲正文。'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function buildWebOutlineSplitInstruction(payload = {}) {
  const title = sanitizeWebText(payload.nodeTitle) || '未命名大纲'
  const previousDraft = sanitizeWebText(payload.previousDraft)
  const userInstruction = sanitizeWebText(payload.userInstruction)
  const mode = sanitizeWebText(payload.mode) || 'plot'
  const count = Number.isFinite(Number(payload.count))
    ? Math.max(2, Math.min(12, Number(payload.count)))
    : 3
  const hasPreviousDraft = Boolean(previousDraft)
  const modePrompts = {
    plot: '按剧情推进阶段拆分，强调起承转合与故事推进。',
    conflict: '按冲突升级拆分，强调阻力、反转、加码与阶段性结果。',
    timeline: '按时间顺序拆分，强调连续事件与前后因果。',
    chapter: '按章节策划拆分，每段都应像可直接写作的小章节。'
  }

  return [
    '你是一名专业的中文长篇小说策划编辑。',
    '请把用户提供的大纲拆分为多个可独立写作的子大纲，并且只输出 JSON，不要输出 Markdown、解释、注释或代码块。',
    'JSON 格式必须是 {"items":[...]}。每个 item 必须包含 title、content、summary、goals、conflict、progression、resultHint 七个字符串字段。',
    '',
    `任务类型：${hasPreviousDraft ? '继续调整拆分草稿' : '拆分并扩写大纲'}`,
    `当前节点标题：${title}`,
    `拆分模式：${modePrompts[mode] || modePrompts.plot}`,
    `目标段数：${count}`,
    userInstruction ? `用户补充要求：${userInstruction}` : '用户补充要求：无',
    hasPreviousDraft ? '' : '',
    hasPreviousDraft ? '上一轮拆分草稿（请在其基础上调整）：' : '',
    hasPreviousDraft ? previousDraft : '',
    '',
    '输出要求：',
    `1. 严格输出 ${count} 个 items，不能多也不能少。`,
    '2. 每个 item.title 要简洁清晰，适合作为子节点标题。',
    '3. 每个 item.content 要是一段可直接用于写作的大纲正文。',
    '4. 其余字段用于结构化表达：summary 概述、goals 目标、conflict 冲突、progression 推进、resultHint 结果或悬念。',
    '5. 所有字段必须为字符串，不能为空字符串。',
    '6. 只输出合法 JSON。'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

async function refineWebOutlineWithAI(payload = {}) {
  const sourceContent = sanitizeWebText(payload.sourceContent)
  if (!sourceContent) {
    return { success: false, message: '当前大纲内容为空，无法完善' }
  }

  const modelPayload = await resolveTextModelPayload('writing')
  const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'outline_refine',
    title: 'AI 大纲完善',
    content: sourceContent,
    instruction: buildWebOutlineRefineInstruction(payload),
    temperature: 0.6,
    maxTokens: 5000,
    ...aiModelPayload
  })

  const aiResult = requireWebAiTextTaskResponse(response, 'AI 大纲任务失败')
  if (aiResult.success !== true) {
    return { success: false, message: aiResult.message || 'AI 大纲任务失败' }
  }

  return {
    success: true,
    taskType: 'refine',
    content: aiResult.content,
    images: [],
    usage: response?.usage || {},
    model: response?.model || '',
    providerId: response?.providerId || '',
    error: ''
  }
}

async function splitWebOutlineWithAI(payload = {}) {
  const sourceContent = sanitizeWebText(payload.sourceContent)
  if (!sourceContent) {
    return { success: false, message: '当前大纲内容为空，无法拆分' }
  }

  const modelPayload = await resolveTextModelPayload('writing')
  const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'outline_split',
    title: 'AI 大纲拆分',
    content: sourceContent,
    instruction: buildWebOutlineSplitInstruction(payload),
    temperature: 0.4,
    maxTokens: 6000,
    ...aiModelPayload
  })

  const aiResult = requireWebAiTextTaskResponse(response, 'AI 大纲任务失败')
  if (aiResult.success !== true) {
    return { success: false, message: aiResult.message || 'AI 大纲任务失败' }
  }

  const rawText = aiResult.content
  const parsed = parseWebOutlineSplitResult(rawText)
  return {
    success: true,
    taskType: 'split',
    content: rawText,
    rawText,
    items: parsed.items,
    parseError: parsed.parseError,
    images: [],
    usage: response?.usage || {},
    model: response?.model || '',
    providerId: response?.providerId || '',
    error: ''
  }
}

async function runWebOutlineAiTask(payload = {}) {
  const taskType = sanitizeWebText(payload.taskType)
  if (taskType === 'refine') return refineWebOutlineWithAI(payload)
  if (taskType === 'split') return splitWebOutlineWithAI(payload)
  return { success: false, message: '不支持的 AI 大纲任务类型' }
}

function splitModelBindingId(modelId = '') {
  const [providerId, ...modelParts] = String(modelId || '')
    .trim()
    .split('::')
  return {
    providerId: String(providerId || '').trim(),
    modelName: normalizeTextModelName(modelParts.join('::'))
  }
}

function resolveTextAiModelPayload(payload = {}, modelPayload = {}) {
  const parsed = splitModelBindingId(payload.modelId)
  const rawModelName = String(payload.modelName || '').trim()
  const rawModel = String(payload.model || '').trim()
  const useProviderDefault = rawModelName === 'default' || (!rawModelName && rawModel === 'default')
  const modelName = useProviderDefault
    ? ''
    : normalizeTextModelName(payload.modelName) ||
      normalizeTextModelName(payload.model) ||
      parsed.modelName ||
      modelPayload.modelName ||
      ''
  return {
    modelId: payload.modelId || modelPayload.modelId || '',
    providerId:
      payload.providerId ||
      payload.textProviderId ||
      parsed.providerId ||
      modelPayload.providerId ||
      '',
    modelName
  }
}

function statusFromApplyAction(action = '') {
  if (action === 'discard') return 'discarded'
  if (['save_material', 'save_snippet', 'send_to_asset_workspace'].includes(action)) return 'saved'
  return 'applied'
}

function normalizeWebSecret(value) {
  return String(value || '')
}

function secretSavedMeta(value) {
  return {
    configured: Boolean(String(value || '').trim()),
    source: String(value || '').trim() ? 'store' : ''
  }
}

async function readEditorModelDefaults() {
  const defaults = await getStoreValue('editorModelDefaults', {})
  if (defaults == null) return {}
  if (typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error('读取编辑器模型默认值失败：本地记录格式不正确')
  }
  return defaults
}

async function resolveTextModelPayload(task = 'writing') {
  const defaults = await readEditorModelDefaults()
  const directModelId =
    defaults?.[task] || defaults?.writing || defaults?.summary || defaults?.chat || ''
  const parsed = splitModelBindingId(directModelId)
  if (parsed.providerId) {
    return {
      modelId: directModelId,
      providerId: parsed.providerId,
      modelName: parsed.modelName
    }
  }
  const activeProviderId = await getStoreValue('aiProviders.activeTextId', '')
  return {
    modelId: '',
    providerId: activeProviderId || '',
    modelName: ''
  }
}

async function getStoreValue(key, fallback = '') {
  const data = await postJson('/api/store/get', { key })
  if (data?.success !== true) {
    throw new Error(data?.message || '读取本地设置失败')
  }
  if (data.key !== key) {
    throw new Error('读取本地设置失败：接口返回的设置项不匹配')
  }
  return data?.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true) {
    throw new Error(result?.message || '保存本地设置失败')
  }
  if (result.key !== key) {
    throw new Error('保存本地设置失败：接口返回的设置项不匹配')
  }
  return result
}

async function getWebBooksDir() {
  try {
    const data = await fetchJson('/api/books/dir')
    return data?.booksDir || ''
  } catch {
    return ''
  }
}

async function setWebBooksDir(dir) {
  const result = await postJson('/api/books/set-dir', { dir })
  if (result?.success !== true) {
    throw new Error(result?.message || '保存书架目录失败')
  }
  if (result.booksDir !== dir) {
    throw new Error('保存书架目录失败：返回目录不一致')
  }
  return result
}

function bannedWordsStoreKey(bookName) {
  return `bannedWords:${String(bookName || '').trim()}`
}

function normalizeBannedWords(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.words)
      ? value.words
      : Array.isArray(value?.data)
        ? value.data
        : []
  const seen = new Set()
  return source
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

async function getWebBannedWords(bookName) {
  const name = String(bookName || '').trim()
  if (!name) {
    return { success: false, message: '参数错误', data: [] }
  }
  const words = normalizeBannedWords(await getStoreValue(bannedWordsStoreKey(name), { words: [] }))
  return { success: true, data: words, words }
}

async function saveWebBannedWords(bookName, words) {
  await setStoreValue(bannedWordsStoreKey(bookName), { words: normalizeBannedWords(words) })
}

async function addWebBannedWord(bookName, word) {
  const name = String(bookName || '').trim()
  const nextWord = String(word || '').trim()
  if (!name || !nextWord) {
    return { success: false, message: '参数错误' }
  }
  const result = await getWebBannedWords(name)
  const words = normalizeBannedWords(result.data)
  if (words.includes(nextWord)) {
    return { success: false, message: '该禁词已存在', data: words }
  }
  const nextWords = [nextWord, ...words]
  await saveWebBannedWords(name, nextWords)
  return { success: true, data: nextWords, words: nextWords }
}

async function removeWebBannedWord(bookName, word) {
  const name = String(bookName || '').trim()
  const targetWord = String(word || '').trim()
  if (!name || !targetWord) {
    return { success: false, message: '参数错误' }
  }
  const result = await getWebBannedWords(name)
  const words = normalizeBannedWords(result.data)
  if (!words.includes(targetWord)) {
    return { success: false, message: '禁词不存在', data: words }
  }
  const nextWords = words.filter((item) => item !== targetWord)
  await saveWebBannedWords(name, nextWords)
  return { success: true, data: nextWords, words: nextWords }
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function countTextWords(text) {
  return String(text || '').replace(/[\s\n\r\t]/g, '').length
}

function normalizeDailyRows(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || '读取每日写作统计失败')
  }
  if (!Array.isArray(result.items)) {
    throw new Error('读取每日写作统计失败：接口返回格式不正确')
  }

  return result.items
    .map((row) => {
      const addWords = Math.max(0, Number(row?.words ?? row?.count ?? row?.positiveWords ?? 0) || 0)
      const netWords = Number(row?.delta ?? row?.netWords ?? addWords) || 0
      const deleteWords = Math.max(0, Number(row?.deleteWords ?? addWords - netWords) || 0)
      return {
        date: String(row?.date || ''),
        netWords,
        addWords,
        deleteWords,
        totalWords: Math.max(0, Number(row?.totalWords ?? row?.wordCount ?? netWords) || 0)
      }
    })
    .filter((row) => row.date)
}

async function fetchDailyRows(params = {}) {
  const result = await postJson('/api/analytics/daily-words', params)
  return normalizeDailyRows(result)
}

function buildElectronShim() {
  return {
    // process 兼容，仅供个别组件读取版本号使用
    process: {
      argv: [],
      platform: 'web',
      versions: {}
    },

    // ----- 书籍 -----
    // 注意：以下方法在 Web 端不暴露，让调用方走「特征检测 + Web 兜底」分支
    //   - selectBooksDir → Home.vue 检测缺失后打开 DirSelectorDialog
    //   - validateBooksDir → Home.vue 检测缺失后直接放行用户输入的路径
    // selectBooksDir: undefined
    // validateBooksDir: undefined
    selectImage: selectBrowserImage,
    readWorkbenchDatabaseSnapshot: (payload) =>
      postJson('/api/workbench-database/snapshot', payload || {}),
    queryWorkbenchDatabase: (payload) => postJson('/api/workbench-database/query', payload || {}),
    // ----- 卷与章节 -----
    createVolume: (bookName) => postJson('/api/volumes/create', { bookName }),
    createChapter: (bookName, volumeId) => postJson('/api/chapters/create', { bookName, volumeId }),
    loadChapters: async (bookName) => {
      const data = await postJson('/api/chapters/load', { bookName })
      if (data?.success !== true) {
        throw new Error(data?.message || '读取章节失败')
      }
      if (!Array.isArray(data?.chapters)) {
        throw new Error('读取章节失败：接口返回格式不正确')
      }
      return data
    },
    readChapter: (bookName, volumeName, chapterName) =>
      postJson('/api/chapters/read', { bookName, volumeName, chapterName }),
    saveChapter: (chapterInfo) => postJson('/api/chapters/save', chapterInfo),
    checkChapterExists: (payload) => postJson('/api/chapters/check-exists', payload),
    upsertChapter: (payload) => postJson('/api/chapters/upsert', payload),

    // ----- 节点编辑 / 删除 -----
    editNode: (bookName, payload) => postJson('/api/nodes/edit', { bookName, ...(payload || {}) }),
    deleteNode: (bookName, payload) =>
      postJson('/api/nodes/delete', { bookName, ...(payload || {}) }),

    // ----- 排序与章节设置 -----
    getSortOrder: async (bookName) => {
      const data = await postJson('/api/sort-order/get', { bookName })
      return data
    },
    setSortOrder: (bookName, order) => postJson('/api/sort-order/set', { bookName, order }),
    getChapterSettings: (bookName) => postJson('/api/chapter-settings/get', { bookName }),
    setChapterTargetWords: (bookName, targetWords) =>
      postJson('/api/chapter-settings/target-words', { bookName, targetWords }),
    updateChapterFormat: (bookName, settings) =>
      postJson('/api/chapter-format/update', { bookName, settings }),
    reformatChapterNumbers: (bookName, volumeName, settings) =>
      postJson('/api/chapter-numbers/reformat', { bookName, volumeName, settings }),

    // ----- 笔记本与笔记 -----
    loadNotes: async (bookName) => {
      const data = await postJson('/api/notes/load', { bookName })
      if (data?.success !== true) {
        throw new Error(data?.message || '读取笔记失败')
      }
      if (!Array.isArray(data?.notes)) {
        throw new Error('读取笔记失败：接口返回格式不正确')
      }
      return data
    },
    createNotebook: (bookName) => postJson('/api/notebooks/create', { bookName }),
    deleteNotebook: (bookName, notebookName) =>
      postJson('/api/notebooks/delete', { bookName, notebookName }),
    renameNotebook: (bookName, oldName, newName) =>
      postJson('/api/notebooks/rename', { bookName, oldName, newName }),
    createNote: (bookName, notebookName, noteName) =>
      postJson('/api/notes/create', { bookName, notebookName, noteName }),
    deleteNote: (bookName, notebookName, noteName) =>
      postJson('/api/notes/delete', { bookName, notebookName, noteName }),
    renameNote: (bookName, notebookName, oldName, newName) =>
      postJson('/api/notes/rename', { bookName, notebookName, oldName, newName }),
    readNote: (bookName, notebookName, noteName) =>
      postJson('/api/notes/read', { bookName, notebookName, noteName }),
    editNote: (noteInfo) => postJson('/api/notes/edit', noteInfo),
    exportOrganizationToNote: (payload) =>
      postJson('/api/organizations/export-note', payload || {}),

    // ----- 统计 / 字数 -----
    getBookWordCount: async (bookName) => {
      const result = await postJson('/api/analytics/overview', { bookId: bookName, bookName })
      return Number(result?.data?.totalWords || 0)
    },
    getDailyWordCount: async () => {
      const rows = await fetchDailyRows({ days: 365 })
      return {
        success: true,
        data: Object.fromEntries(rows.map((row) => [row.date, row.addWords])),
        items: rows
      }
    },
    getChapterStats: async ({ bookName, volumeName, chapterName } = {}) => {
      const result = await postJson('/api/chapters/read', { bookName, volumeName, chapterName })
      const wordCount = countTextWords(result?.content || '')
      return {
        success: true,
        data: {
          totalWords: wordCount,
          lastUpdate: localDateKey(),
          wordChange: 0,
          lastContentLength: wordCount
        },
        wordCount
      }
    },
    // ----- 时间线 / 大纲 / 地图 / 人物 / 设定等扩展功能 -----
    readTimeline: (bookName) => postJson('/api/studio/timeline/read', { bookName }),
    writeTimeline: (bookName, data) => postJson('/api/studio/timeline/write', { bookName, data }),
    readOutlines: (bookName) => postJson('/api/studio/outlines/read', { bookName }),
    writeOutlines: (bookName, data) => postJson('/api/studio/outlines/write', { bookName, data }),
    readOutlineAiSessions: (bookName) =>
      postJson('/api/studio/outline-ai-sessions/read', { bookName }),
    writeOutlineAiSessions: (bookName, data) =>
      postJson('/api/studio/outline-ai-sessions/write', { bookName, data }),
    readMaps: async (bookName) => {
      const result = await postJson('/api/studio/maps/list', { bookName })
      const maps = unwrapResultData(result, '读取地图列表失败')
      if (Array.isArray(maps)) return maps
      throw new Error('读取地图列表失败：接口返回格式不正确')
    },
    createMap: async (payload) =>
      requireSuccessResult(await postJson('/api/studio/maps/create', payload), '创建地图失败'),
    updateMap: async (payload) =>
      requireSuccessResult(await postJson('/api/studio/maps/update', payload), '保存地图失败'),
    readMapImage: async (payload) =>
      unwrapResultData(await postJson('/api/studio/maps/image', payload), '读取地图图片失败'),
    deleteMap: async (payload) =>
      requireSuccessResult(await postJson('/api/studio/maps/delete', payload), '删除地图失败'),
    saveMapData: async (payload) =>
      requireSuccessResult(
        await postJson('/api/studio/maps/data/save', payload),
        '保存地图数据失败'
      ),
    loadMapData: async (payload) =>
      unwrapResultData(await postJson('/api/studio/maps/data/load', payload), '读取地图数据失败'),
    readCharacters: (bookName) => postJson('/api/studio/characters/read', { bookName }),
    writeCharacters: (bookName, data) =>
      postJson('/api/studio/characters/write', { bookName, data }),
    readEntityProfiles: (bookName) => postJson('/api/studio/entity-profiles/read', { bookName }),
    writeEntityProfileCategory: (bookName, category, data) =>
      postJson('/api/studio/entity-profiles/write-category', { bookName, category, data }),
    readDictionary: (bookName) => postJson('/api/studio/dictionary/read', { bookName }),
    writeDictionary: (bookName, data) =>
      postJson('/api/studio/dictionary/write', { bookName, data }),
    readSettings: (bookName) => postJson('/api/studio/settings/read', { bookName }),
    writeSettings: (bookName, data) => postJson('/api/studio/settings/write', { bookName, data }),
    readSequenceCharts: (bookName) => postJson('/api/studio/sequences/read', { bookName }),
    writeSequenceCharts: (bookName, data) =>
      postJson('/api/studio/sequences/write', { bookName, data }),
    readRelationships: (bookName) => postJson('/api/studio/relationships/list', { bookName }),
    readRelationshipData: (bookName, relationshipName) =>
      postJson('/api/studio/relationships/read', { bookName, relationshipName }),
    createRelationship: (payload) => postJson('/api/studio/relationships/create', payload),
    saveRelationshipData: (bookName, relationshipName, relationshipData) =>
      postJson('/api/studio/relationships/write', { bookName, relationshipName, relationshipData }),
    updateRelationshipThumbnail: (payload) =>
      postJson('/api/studio/relationships/thumbnail', payload),
    deleteRelationship: (payload) => postJson('/api/studio/relationships/delete', payload),
    readRelationshipImage: (payload) => postJson('/api/studio/relationships/image', payload),
    readOrganizations: (bookName) => postJson('/api/studio/organizations/list', { bookName }),
    readOrganization: (bookName, organizationName) =>
      postJson('/api/studio/organizations/read', { bookName, organizationName }),
    createOrganization: (payload) => postJson('/api/studio/organizations/create', payload),
    writeOrganization: (bookName, organizationName, organizationData) =>
      postJson('/api/studio/organizations/write', { bookName, organizationName, organizationData }),
    updateOrganizationThumbnail: (payload) =>
      postJson('/api/studio/organizations/thumbnail', payload),
    readOrganizationImage: (payload) => postJson('/api/studio/organizations/image', payload),
    deleteOrganization: (payload) => postJson('/api/studio/organizations/delete', payload),

    // ----- 禁词 -----
    getBannedWords: getWebBannedWords,
    addBannedWord: addWebBannedWord,
    removeBannedWord: removeWebBannedWord,

    // ----- AI 系列 -----
    generateBookIdeasWithAI: async (payload = {}) => {
      const modelPayload = await resolveTextModelPayload('writing')
      const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
      return postJson('/api/ai/book-ideas', {
        ...(payload || {}),
        ...aiModelPayload
      })
    },
    cleanGarbageTextWithAI: (input = {}) =>
      requestEditorTextCleanup({
        ...input,
        text: input.text || input.content || ''
      }),
    setCustomTextApiConfig: async (config = {}) => {
      const savedConfig = {
        apiType: config.apiType || 'openai',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        apiKey: normalizeWebSecret(config.apiKey)
      }
      await setStoreValue('customTextApi.apiType', savedConfig.apiType)
      await setStoreValue('customTextApi.baseUrl', savedConfig.baseUrl)
      await setStoreValue('customTextApi.model', savedConfig.model)
      await setStoreValue('customTextApi.apiKey', savedConfig.apiKey)
      return {
        success: true,
        apiType: savedConfig.apiType,
        baseUrl: savedConfig.baseUrl,
        model: savedConfig.model,
        configured: Boolean(
          savedConfig.apiKey.trim() &&
            String(savedConfig.baseUrl || '').trim() &&
            String(savedConfig.model || '').trim()
        ),
        source: savedConfig.apiKey.trim() ? 'store' : ''
      }
    },
    getCustomTextApiConfig: async () => ({
      success: true,
      apiType: await getStoreValue('customTextApi.apiType', 'openai'),
      baseUrl: await getStoreValue('customTextApi.baseUrl', ''),
      model: await getStoreValue('customTextApi.model', ''),
      apiKey: await getStoreValue('customTextApi.apiKey', '')
    }),
    validateCustomTextApiConfig: async (directConfig) => {
      const baseUrl = directConfig?.baseUrl || (await getStoreValue('customTextApi.baseUrl', ''))
      const apiKey = directConfig?.apiKey || (await getStoreValue('customTextApi.apiKey', ''))
      if (!baseUrl || !apiKey) {
        return { success: false, isValid: false, message: '请先配置 API 地址和 Key' }
      }
      try {
        const proxyResult = await postJson('/api/ai-proxy', {
          targetUrl: `${baseUrl.replace(/\/$/, '')}/v1/models`,
          apiKey,
          method: 'GET'
        })
        if (proxyResult.success) {
          const data = proxyResult.data
          const models = data?.data ? data.data.map((m) => m.id) : []
          return { success: true, isValid: true, models }
        } else if (proxyResult.status === 401 || proxyResult.status === 403) {
          return { success: false, isValid: false, message: 'API Key 无效或无权限' }
        } else if (proxyResult.status === 404) {
          return {
            success: false,
            isValid: false,
            models: [],
            message: '模型列表端点不可用，请手动输入模型名后再测试模型'
          }
        } else {
          return { success: false, isValid: false, message: `请求失败: ${proxyResult.status}` }
        }
      } catch (error) {
        return { success: false, isValid: false, message: error.message || '连接失败' }
      }
    },
    listCustomTextApiModels: async (directConfig) => {
      const baseUrl = directConfig?.baseUrl || (await getStoreValue('customTextApi.baseUrl', ''))
      const apiKey = directConfig?.apiKey || (await getStoreValue('customTextApi.apiKey', ''))

      if (!baseUrl || !apiKey) {
        return { success: false, models: [], message: '请先配置 API 地址和 Key' }
      }
      try {
        const proxyResult = await postJson('/api/ai-proxy', {
          targetUrl: `${baseUrl.replace(/\/$/, '')}/v1/models`,
          apiKey,
          method: 'GET'
        })
        if (proxyResult.success) {
          const data = proxyResult.data
          const models = data?.data ? data.data.map((m) => m.id) : []
          return { success: true, models }
        } else if (proxyResult.status === 401 || proxyResult.status === 403) {
          return { success: false, models: [], message: 'API Key 无效或无权限' }
        }
        return { success: false, models: [], message: `获取模型列表失败: ${proxyResult.status}` }
      } catch (error) {
        return { success: false, models: [], message: error.message || '获取模型列表失败' }
      }
    },
    setCustomImageApiConfig: async (config = {}) => {
      const savedConfig = {
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        apiKey: normalizeWebSecret(config.apiKey)
      }
      await setStoreValue('customImageApi.baseUrl', savedConfig.baseUrl)
      await setStoreValue('customImageApi.model', savedConfig.model)
      await setStoreValue('customImageApi.apiKey', savedConfig.apiKey)
      return {
        success: true,
        baseUrl: savedConfig.baseUrl,
        model: savedConfig.model,
        configured: Boolean(savedConfig.apiKey.trim() && String(savedConfig.baseUrl || '').trim()),
        source: savedConfig.apiKey.trim() ? 'store' : ''
      }
    },
    getCustomImageApiConfig: async () => ({
      success: true,
      baseUrl: await getStoreValue('customImageApi.baseUrl', ''),
      model: await getStoreValue('customImageApi.model', ''),
      apiKey: await getStoreValue('customImageApi.apiKey', '')
    }),
    validateCustomImageApiConfig: async () => {
      const baseUrl = await getStoreValue('customImageApi.baseUrl', '')
      const apiKey = await getStoreValue('customImageApi.apiKey', '')
      const modelName = await getStoreValue('customImageApi.model', '')
      return testImageProviderByProxy({ baseUrl, apiKey, modelName })
    },

    getExtraction: async (payload) => {
      return await postJson('/api/extraction/get', payload)
    },
    searchKnowledge: async (payload) => {
      return await postJson('/api/extraction/search', payload)
    },
    runConsistencyCheck: async (payload = {}) => postJson('/api/consistency/check', payload || {}),
    listConsistencyChecks: async (payload = {}) => postJson('/api/consistency/list', payload || {}),
    vectorSearch: async (payload = {}) => postJson('/api/vector/search', payload || {}),
    vectorGetStats: async (bookPathOrPayload = {}) => {
      const payload =
        typeof bookPathOrPayload === 'string'
          ? { bookPath: bookPathOrPayload }
          : bookPathOrPayload || {}
      return postJson('/api/vector/stats', payload)
    },
    vectorDeleteSource: async (payload = {}) =>
      postJson('/api/vector/delete-source', payload || {}),
    listSettingSnapshots: async (bookPathOrPayload = {}) => {
      const payload =
        typeof bookPathOrPayload === 'string'
          ? { bookPath: bookPathOrPayload }
          : bookPathOrPayload || {}
      return postJson('/api/setting-snapshots/list', payload)
    },
    createSettingSnapshot: async (payload = {}) =>
      postJson('/api/setting-snapshots/create', payload || {}),
    restoreSettingSnapshot: async (payload = {}) =>
      postJson('/api/setting-snapshots/restore', payload || {}),
    deleteSettingSnapshot: async (payload = {}) =>
      postJson('/api/setting-snapshots/delete', payload || {}),
    diffSettingSnapshots: async (payload = {}) =>
      postJson('/api/setting-snapshots/diff', payload || {}),
    listEditorModelBindings: async () => {
      const providers = requireStoredAiProviders(
        await getStoreValue('aiProviders', []),
        '读取编辑器模型失败'
      )
      const active = await getStoreValue('aiProviders.activeTextId', '')
      const deepSeekApiKey = await getStoreValue('deepseek.apiKey', '')
      const bindings = providers
        .filter((provider) => (provider.category || provider.type || 'text') === 'text')
        .flatMap((provider) => {
          const providerId = provider.id || provider.provider || provider.name || 'custom_text'
          const providerName = provider.provider || provider.apiType || provider.name || 'custom'
          const providerDisplayName =
            provider.displayName || provider.name || providerName || '自定义供应商'
          const models = Array.from(
            new Set(
              [
                ...(Array.isArray(provider.models) ? provider.models : []),
                provider.model,
                provider.modelName
              ].filter(Boolean)
            )
          )
          const names = models.length ? models : ['']
          return names.map((modelName) => ({
            id: `${providerId}::${modelName || 'default'}`,
            provider: providerName,
            providerId,
            providerName,
            providerDisplayName,
            modelName,
            displayName: modelName || providerDisplayName || '自定义模型',
            enabled: provider.enabled !== false,
            defaultFor: providerId && providerId === active ? 'writing' : provider.defaultFor || ''
          }))
        })
        .filter((binding) => binding.enabled)
      const hasDeepSeek = bindings.some((binding) => binding.id === 'deepseek::deepseek-chat')
      if (deepSeekApiKey && !hasDeepSeek) {
        bindings.push({
          id: 'deepseek::deepseek-chat',
          provider: 'deepseek',
          providerId: 'deepseek',
          providerName: 'deepseek',
          providerDisplayName: 'DeepSeek',
          modelName: 'deepseek-chat',
          displayName: 'DeepSeek Chat',
          enabled: true,
          defaultFor: active === 'deepseek' ? 'writing' : '',
          legacy: true
        })
      }
      return { success: true, bindings }
    },
    setEditorModelDefault: async ({ task = 'writing', modelId = '' } = {}) => {
      const defaults = await readEditorModelDefaults()
      const nextDefaults = { ...(defaults || {}), [task]: modelId }
      await setStoreValue('editorModelDefaults', nextDefaults)
      let activeTextProviderId = await getStoreValue('aiProviders.activeTextId', '')
      if (task === 'writing' || task === 'chat') {
        activeTextProviderId = String(modelId || '').split('::')[0] || modelId
        await setStoreValue('aiProviders.activeTextId', activeTextProviderId)
      }
      return {
        success: true,
        task,
        modelId,
        defaults: nextDefaults,
        providerId: activeTextProviderId
      }
    },
    openEditorSession: async (payload = {}) => {
      const sessions = requireStoreArray(
        await getStoreValue('editorSessions', []),
        '读取编辑器会话记录失败'
      )
      const id = payload.id || `editor_session:${payload.bookId || 'empty'}`
      const session = {
        id,
        userId: payload.userId || 'local',
        bookId: payload.bookId || '',
        chapterId: payload.chapterId || '',
        mode: payload.mode || 'write',
        selectedModelId: payload.selectedModelId || '',
        contextOptions: payload.contextOptions || {},
        lastOpenedAt: new Date().toISOString()
      }
      await setStoreValue(
        'editorSessions',
        [session, ...sessions.filter((item) => item.id !== id)].slice(0, 80)
      )
      await setStoreValue('lastActiveBookId', session.bookId)
      return { success: true, session }
    },
    updateEditorSessionContext: async ({ sessionId, contextOptions } = {}) => {
      const sessions = requireStoreArray(
        await getStoreValue('editorSessions', []),
        '读取编辑器会话记录失败'
      )
      const session = sessions.find((item) => item.id === sessionId) || { id: sessionId }
      const next = {
        ...session,
        contextOptions: { ...(session.contextOptions || {}), ...(contextOptions || {}) },
        lastOpenedAt: new Date().toISOString()
      }
      await setStoreValue(
        'editorSessions',
        [next, ...sessions.filter((item) => item.id !== sessionId)].slice(0, 80)
      )
      return { success: true, session: next }
    },
    listEditorMessages: async (sessionId) => {
      const messages = requireStoreArray(
        await getStoreValue('editorMessages', []),
        '读取编辑器消息失败'
      )
      return { success: true, messages: messages.filter((item) => item.sessionId === sessionId) }
    },
    appendEditorMessage: async ({ sessionId, message } = {}) => {
      const messages = requireStoreArray(
        await getStoreValue('editorMessages', []),
        '读取编辑器消息失败'
      )
      const next = {
        id: message?.id || crypto.randomUUID(),
        sessionId,
        role: message?.role || 'assistant',
        blocks: message?.blocks || [{ type: 'text', content: { text: message?.content || '' } }],
        title: message?.title || '',
        content: message?.content || '',
        modelId: message?.modelId || '',
        createdAt: message?.createdAt || new Date().toISOString()
      }
      await setStoreValue('editorMessages', [...messages, next].slice(-400))
      return { success: true, message: next }
    },
    generateEditorAgent: async () => ({
      success: false,
      message: 'Web 版暂不支持创作台 Agent，请改用当前页面里的 Writer / Editor 多步生成。'
    }),
    enqueueEditorAgentWriteTask: async (payload = {}) =>
      postJson('/api/editor-agent/queue-write', payload || {}),
    enqueueEditorAgentRepairTask: async (payload = {}) =>
      postJson('/api/editor-agent/queue-repair', payload || {}),
    getEditorAgentQueueStatus: async () => postJson('/api/editor-agent/queue-status', {}),
    getEditorAgentQueueJob: async (payload = {}) =>
      postJson('/api/editor-agent/queue-job', payload || {}),
    listEditorAgentQueueJobs: async (payload = {}) =>
      postJson('/api/editor-agent/queue-jobs', payload || {}),
    cancelEditorAgentQueueJob: async (payload = {}) =>
      postJson('/api/editor-agent/queue-cancel', payload || {}),
    getEditorAgentProgressServer: async () => postJson('/api/editor-agent/progress-server', {}),
    markEditorGenerationApplied: async ({ generationId, applyAction, status } = {}) => {
      const id = String(generationId || '').trim()
      if (!id) return { success: false, message: '缺少生成记录 ID' }
      const nextStatus = status || statusFromApplyAction(applyAction)
      const rows = requireStoreArray(
        await getStoreValue('editorGenerations', []),
        '读取生成记录失败'
      )
      const target = rows.find((item) => item.id === id)
      if (!target) return { success: false, message: '未找到生成记录，无法更新状态' }
      const patch = { status: nextStatus, applyAction, appliedAt: new Date().toISOString() }
      await setStoreValue(
        'editorGenerations',
        rows.map((item) => (item.id === id ? { ...item, ...patch } : item))
      )
      return { success: true, generation: { ...target, ...patch } }
    },
    listEditorGenerations: async (bookId = '') => {
      const generations = requireStoreArray(
        await getStoreValue('editorGenerations', []),
        '读取生成记录失败'
      )
      return {
        success: true,
        items: generations.filter((item) => !bookId || item.bookId === bookId)
      }
    },
    saveEditorMaterial: async (payload = {}) => {
      const materials = requireStoreArray(
        await getStoreValue('editorMaterials', []),
        '读取编辑器素材失败'
      )
      const material = {
        id: crypto.randomUUID(),
        source: 'editor_agent',
        tags: [],
        ...payload,
        createdAt: new Date().toISOString()
      }
      await setStoreValue('editorMaterials', [material, ...materials].slice(0, 300))
      return { success: true, material }
    },
    listEditorMaterials: async ({ bookId = '', chapterId = '' } = {}) => {
      const materials = requireStoreArray(
        await getStoreValue('editorMaterials', []),
        '读取编辑器素材失败'
      )
      return {
        success: true,
        materials: materials.filter((item) => {
          if (bookId && item.bookId !== bookId) return false
          if (chapterId && item.chapterId !== chapterId) return false
          return true
        })
      }
    }
  }
}

function buildElectronStoreShim() {
  return {
    async get(key) {
      const data = await postJson('/api/store/get', { key })
      if (data?.success !== true) {
        throw new Error(data?.message || '读取本地设置失败')
      }
      if (data.key !== key) {
        throw new Error('读取本地设置失败：接口返回的设置项不匹配')
      }
      if (key === 'booksDir') {
        return (await getWebBooksDir()) || data?.value || null
      }
      return data?.value ?? null
    },
    async set(key, value) {
      const result = await postJson('/api/store/set', { key, value })
      if (result?.success !== true) {
        throw new Error(result.message || '保存本地设置失败')
      }
      if (result.key !== key) {
        throw new Error('保存本地设置失败：接口返回的设置项不匹配')
      }
      if (key === 'booksDir') {
        await setWebBooksDir(value)
      }
      return result
    },
    async delete(key) {
      const result = await postJson('/api/store/delete', { key })
      if (result?.success !== true) {
        throw new Error(result.message || '删除本地设置失败')
      }
      if (result.key !== key) {
        throw new Error('删除本地设置失败：接口返回的设置项不匹配')
      }
      return result
    }
  }
}

/**
 * 在浏览器环境下注入 `window.electron` 与 `window.electronStore` 兼容接口。
 * 多次调用是幂等的。
 */
export function installWebElectronShim() {
  if (typeof window === 'undefined') return
  if (isElectronEnv()) return
  if (!window.electron) {
    window.electron = buildElectronShim()
  }
  if (!window.electronStore) {
    window.electronStore = buildElectronStoreShim()
  }
}

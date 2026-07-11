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
const BOOKSHELF_AUTH_SESSION_KEY = 'bookshelfAuthenticated'

function isElectronEnv() {
  return typeof window !== 'undefined' && !!window.electron
}

function setWebBookshelfAuthenticated() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(BOOKSHELF_AUTH_SESSION_KEY, 'true')
  }
  return true
}

async function getWebBookshelfAuthStatus() {
  const status = await fetchJson('/api/auth/status')
  if (status?.success !== true) {
    throw new Error(status?.message || '读取书架认证状态失败')
  }
  if (status.authenticated) setWebBookshelfAuthenticated()
  else window.sessionStorage.removeItem(BOOKSHELF_AUTH_SESSION_KEY)
  return status
}

async function authenticateWebBookshelf(password) {
  const result = await postJson('/api/auth/login', { password })
  if (result?.success !== true || result?.authenticated !== true) {
    throw new Error(result?.message || '书架认证失败')
  }
  setWebBookshelfAuthenticated()
  return result
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

function resolveEmbeddingProviderId(payload) {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  return payload.id || payload.providerId || payload.provider?.id || ''
}

function normalizeEmbeddingProviderPayload(payload = {}) {
  const source =
    payload?.provider && typeof payload.provider === 'object' ? payload.provider : payload
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('读取 Embedding Provider 失败：本地记录格式不正确')
  }

  const modelName = String(source.modelName || source.model || '').trim()
  const rawDimension = source.dimension ?? source.dimensions
  const dimension = Number(rawDimension)
  const cleanProvider = {
    ...source,
    id: source.id || crypto.randomUUID(),
    name: String(source.name || '').trim(),
    baseUrl: String(source.baseUrl || '').trim(),
    apiKey: String(source.apiKey || '').trim(),
    model: modelName,
    modelName,
    active: Boolean(source.active)
  }

  if (Number.isFinite(dimension) && dimension > 0) {
    cleanProvider.dimension = dimension
    cleanProvider.dimensions = dimension
  }

  return cleanProvider
}

async function storedEmbeddingProviders() {
  return requireStoreArray(
    await getStoreValue('embeddingProviders', []),
    '读取 Embedding Provider 失败'
  ).map((provider) => normalizeEmbeddingProviderPayload(provider))
}

function validateEmbeddingProviderConfig(provider, { requireName = false } = {}) {
  if (!provider) return 'Embedding Provider 配置无效'
  if (requireName && !provider.name) return '请填写 Provider 名称'
  if (!provider.baseUrl) return '请填写 Embedding API 地址'
  if (!provider.apiKey) return '请填写 Embedding API Key'
  if (!provider.modelName && !provider.model) return '请填写 Embedding 模型名称'
  return ''
}

function resolveEmbeddingProviderForAction(payload = {}, providers = []) {
  const directProvider = normalizeEmbeddingProviderPayload(payload)
  if (directProvider?.baseUrl || directProvider?.apiKey || directProvider?.modelName) {
    return directProvider
  }
  const id = resolveEmbeddingProviderId(payload)
  if (!id) return null
  return normalizeEmbeddingProviderPayload(providers.find((provider) => provider.id === id))
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

function providerCategory(provider = {}) {
  return provider.category || provider.type || ''
}

function firstStoredAiProviderId(providers = [], category = '') {
  return providers.find((provider) => providerCategory(provider) === category)?.id || ''
}

function normalizeStoredActiveProviderId(value, label = '读取当前 Provider 失败') {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') {
    throw new Error(`${label}：本地记录格式不正确`)
  }
  return value.trim()
}

async function resolveStoredActiveAiProviderId(category = '') {
  const key = category === 'image' ? 'aiProviders.activeImageId' : 'aiProviders.activeTextId'
  const label = category === 'image' ? '读取当前图像 Provider 失败' : '读取当前文本 Provider 失败'
  const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
  const activeId = normalizeStoredActiveProviderId(await getStoreValue(key, ''), label)
  if (activeId) {
    const activeProvider = providers.find((provider) => provider.id === activeId)
    if (activeProvider && providerCategory(activeProvider) === category) return activeId
  }
  return firstStoredAiProviderId(providers, category)
}

async function setStoredActiveAiProviderId(category = '', id = '') {
  const providerId = String(id || '').trim()
  if (providerId) {
    const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
    const provider = providers.find((item) => item.id === providerId)
    if (!provider || providerCategory(provider) !== category) {
      return {
        success: false,
        message: category === 'image' ? '图像 Provider 不存在' : '文本 Provider 不存在'
      }
    }
  }
  const key = category === 'image' ? 'aiProviders.activeImageId' : 'aiProviders.activeTextId'
  await setStoreValue(key, providerId)
  return { success: true, providerId }
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

function fileNameFromPath(filePath, fallback = 'download.txt') {
  const raw = String(filePath || fallback)
  return raw.split(/[\\/]/).filter(Boolean).pop() || fallback
}

function mimeTypeFromFileName(fileName) {
  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown;charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json;charset=utf-8'
  if (lower.endsWith('.html')) return 'text/html;charset=utf-8'
  return 'text/plain;charset=utf-8'
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'download.txt'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function webDownloadFilePath(fileName) {
  return `web-download://${encodeURIComponent(fileName || 'download.txt')}`
}

function fileNameFromWebDownloadPath(filePath) {
  const raw = String(filePath || '')
  if (!raw.startsWith('web-download://')) return fileNameFromPath(raw)
  try {
    return decodeURIComponent(raw.replace('web-download://', '')) || 'download.txt'
  } catch {
    return 'download.txt'
  }
}

async function showBrowserSaveDialog(options = {}) {
  const fileName = fileNameFromPath(options.defaultPath, 'download.txt')
  return {
    filePath: webDownloadFilePath(fileName),
    fileName
  }
}

async function writeBrowserExportFile({ filePath, fileName, content, mimeType } = {}) {
  const targetName = fileName || fileNameFromWebDownloadPath(filePath)
  downloadBlob(
    targetName,
    new Blob([content || ''], { type: mimeType || mimeTypeFromFileName(targetName) })
  )
  return {
    success: true,
    filePath: webDownloadFilePath(targetName),
    fileName: targetName,
    bytes: new Blob([content || '']).size,
    chars: String(content || '').length
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

function buildWebSettingRefineInstruction(payload = {}) {
  const name = sanitizeWebText(payload.settingName) || '未命名设定'
  const instruction = sanitizeWebText(payload.userInstruction)

  return [
    '你是一名资深中文小说设定编辑。',
    '请在不偏离原意的前提下完善设定内容，补齐因果、细节、限制与可写信息。',
    '只输出最终设定正文，不要输出标题、说明、分析、分点标签、Markdown 或代码块。',
    '',
    `设定名称：${name}`,
    instruction ? `完善要求：${instruction}` : '完善要求：无（请自行补足内容）',
    '',
    '请直接输出“完善后的设定正文”。'
  ].join('\n')
}

async function refineWebSettingWithAI(payload = {}) {
  const sourceContent = sanitizeWebText(payload.sourceContent)
  const modelPayload = await resolveTextModelPayload('writing')
  const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
  const response = await postJson('/api/ai/text-task', {
    task: 'custom',
    feature: 'setting_refine',
    title: 'AI 完善设定',
    content: sourceContent || '（空）',
    instruction: buildWebSettingRefineInstruction(payload),
    temperature: 0.6,
    maxTokens: 5000,
    ...aiModelPayload
  })

  const aiResult = requireWebAiTextTaskResponse(response, 'AI 完善设定失败')
  if (aiResult.success !== true) {
    return { success: false, message: aiResult.message || 'AI 完善设定失败', content: '' }
  }

  return {
    success: true,
    content: aiResult.content,
    images: [],
    usage: response?.usage || {},
    model: response?.model || '',
    providerId: response?.providerId || '',
    error: ''
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

async function readBooksDirForWeb() {
  const res = await fetch('/api/books/list', { method: 'POST' })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `读取书籍目录失败 (${res.status})`)
  }
  if (!Array.isArray(data)) {
    throw new Error('读取书籍目录失败：接口返回格式不正确')
  }
  return data
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

function rowsToDailyStats(rows) {
  return Object.fromEntries(
    rows.map((row) => [
      row.date,
      {
        netWords: row.netWords,
        addWords: row.addWords,
        deleteWords: row.deleteWords,
        totalWords: row.totalWords
      }
    ])
  )
}

function rowsHaveActivity(rows) {
  return rows.some((row) => row.netWords !== 0 || row.addWords > 0 || row.deleteWords > 0)
}

async function fetchDailyRows(params = {}) {
  const result = await postJson('/api/analytics/daily-words', params)
  return normalizeDailyRows(result)
}

function buildBookIdentityList(bookName, aliases = []) {
  return Array.from(
    new Set([bookName, ...aliases].map((value) => String(value || '').trim()).filter(Boolean))
  )
}

async function fetchBookDailyStats(bookName, aliases = []) {
  const candidates = buildBookIdentityList(bookName, aliases)
  let rows = []
  for (const candidate of candidates) {
    const nextRows = await fetchDailyRows({ days: 365, bookId: candidate, bookName: candidate })
    if (!rows.length) rows = nextRows
    if (rowsHaveActivity(nextRows)) {
      rows = nextRows
      break
    }
  }
  const data = rowsToDailyStats(rows)
  const today = localDateKey()
  return {
    success: true,
    data,
    stats: {
      today: data[today] || { netWords: 0, addWords: 0, deleteWords: 0, totalWords: 0 },
      dates: data
    }
  }
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
    showSaveDialog: showBrowserSaveDialog,
    writeExportFile: writeBrowserExportFile,
    createBook: (bookInfo) => postJson('/api/books/create', bookInfo),
    readBooksDir: readBooksDirForWeb,
    readWorkbenchDatabaseSnapshot: (payload) =>
      postJson('/api/workbench-database/snapshot', payload || {}),
    queryWorkbenchDatabase: (payload) => postJson('/api/workbench-database/query', payload || {}),
    deleteBook: (name) => postJson('/api/books/delete', { name }),
    editBook: (bookInfo) => postJson('/api/books/edit', bookInfo || {}),
    openBookEditorWindow: async (_id, name) => {
      const url = `/#/editor?name=${encodeURIComponent(name || '')}`
      let opened = false
      if (typeof window !== 'undefined' && name) {
        const child = window.open(url, '_blank')
        opened = Boolean(child)
      }
      return {
        success: Boolean(name),
        bookId: _id,
        bookName: name || '',
        url,
        opened,
        target: '_blank'
      }
    },
    setBookshelfAuthenticated: async () => setWebBookshelfAuthenticated(),
    getBookshelfAuthenticated: async () => {
      const status = await getWebBookshelfAuthStatus()
      return status.authenticated === true
    },
    getBookshelfAuthStatus: getWebBookshelfAuthStatus,
    authenticateBookshelf: authenticateWebBookshelf,

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

    // ----- 小说下载（沿用现有 /api/novel/*） -----
    novelGetSources: async () => {
      const res = await fetch('/api/novel/sources', { method: 'POST' })
      if (!res.ok) {
        throw new Error(`读取小说书源失败 (${res.status})`)
      }
      return await res.json()
    },
    novelSearch: (payload) => postJson('/api/novel/search', payload || {}),
    novelGetChapterList: (payload) => postJson('/api/novel/chapters', payload || {}),
    novelGetBookInfo: (payload) => postJson('/api/novel/book-info', payload || {}),
    novelDownloadChapters: (payload) => postJson('/api/novel/download', payload || {}),

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
    getBookDailyStats: async (bookName) => {
      const books = await readBooksDirForWeb()
      const match = books.find((book) =>
        [book.folderName, book.name, book.id].some((value) => value === bookName)
      )
      return fetchBookDailyStats(bookName, match ? [match.name, match.folderName, match.id] : [])
    },
    getAllBooksDailyStats: async () => {
      const books = await readBooksDirForWeb()
      const entries = await Promise.all(
        books.map(async (book) => {
          const key = book.folderName || book.name || book.id
          const result = await fetchBookDailyStats(key, [book.name, book.folderName, book.id])
          return [key, result.data || {}]
        })
      )
      return { success: true, data: Object.fromEntries(entries) }
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

    getAppVersion: async () => 'web',

    // ----- AI 系列 -----
    setDeepSeekApiKey: async (apiKey) => {
      const savedApiKey = normalizeWebSecret(apiKey)
      await setStoreValue('deepseek.apiKey', savedApiKey)
      return { success: true, ...secretSavedMeta(savedApiKey) }
    },
    getDeepSeekApiKey: async () => {
      const apiKey = await getStoreValue('deepseek.apiKey', '')
      return {
        success: true,
        apiKey,
        configured: Boolean(String(apiKey || '').trim()),
        source: apiKey ? 'store' : ''
      }
    },
    generateNamesWithAI: generateWebNamesWithAI,
    generateBookIdeasWithAI: async (payload = {}) => {
      const modelPayload = await resolveTextModelPayload('writing')
      const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
      return postJson('/api/ai/book-ideas', {
        ...(payload || {}),
        ...aiModelPayload
      })
    },
    validateDeepSeekApiKey: async () => {
      const apiKey = await getStoreValue('deepseek.apiKey', '')
      if (!apiKey) {
        return {
          success: false,
          valid: false,
          isValid: false,
          message: '请先保存 API Key'
        }
      }

      try {
        const proxyResult = await postJson('/api/ai-proxy', {
          targetUrl: 'https://api.deepseek.com/v1/models',
          apiKey,
          method: 'GET'
        })
        if (proxyResult.success) {
          const models = Array.isArray(proxyResult.data?.data)
            ? proxyResult.data.data.map((item) => item.id).filter(Boolean)
            : []
          return {
            success: true,
            valid: true,
            isValid: true,
            models,
            message: 'API Key 验证通过'
          }
        }

        const status = Number(proxyResult.status || 0)
        const apiMessage = proxyResult.data?.error?.message || proxyResult.message || ''
        const messageMap = {
          401: 'API Key 无效或已过期',
          402: '账户余额不足，请前往 DeepSeek 控制台检查余额',
          403: 'API Key 无权限访问'
        }
        return {
          success: false,
          valid: false,
          isValid: false,
          message: messageMap[status] || apiMessage || `验证失败: ${status || '未知错误'}`
        }
      } catch (error) {
        return {
          success: false,
          valid: false,
          isValid: false,
          message: error?.message || '验证失败'
        }
      }
    },
    polishTextWithAI: async (input) => {
      const payload = normalizeTextAiPayload(input)
      const content = String(payload.text || payload.content || '').trim()
      if (!content) {
        return { success: false, message: '请先输入或选择需要润色的正文', content: '' }
      }
      const modelPayload = await resolveTextModelPayload('writing')
      const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
      const response = await postJson('/api/ai/text-task', {
        task: 'polish',
        feature: 'ai_polish',
        title: '编辑器 AI 润色',
        content,
        instruction:
          '请在保留剧情、人物语气和原有信息的前提下润色这段小说正文。只返回润色后的正文，不要解释。',
        ...aiModelPayload
      })
      const aiResult = requireWebAiTextTaskResponse(response, 'AI 润色失败')
      if (aiResult.success !== true) {
        return { success: false, message: aiResult.message || 'AI 润色失败', content: '' }
      }
      const resultText = aiResult.content
      const meta = resolveResponseProviderMeta(response, aiModelPayload)
      return {
        success: true,
        content: resultText,
        inputWordCount: countWebTextWords(content),
        wordCount: countWebTextWords(resultText),
        usage: response?.usage || {},
        model: meta.model,
        providerId: meta.providerId
      }
    },
    cleanGarbageTextWithAI: (input = {}) =>
      requestEditorTextCleanup({
        ...input,
        text: input.text || input.content || ''
      }),
    refineSettingWithAI: refineWebSettingWithAI,
    runOutlineAiTask: runWebOutlineAiTask,
    generateChapterFromOutline: (payload) =>
      postJson('/api/ai/generate-chapter-from-outline', payload),
    continueWriteWithAI: async (input = {}) => {
      const payload = normalizeTextAiPayload(input)
      const { text = '', prompt = '', maxAddWords = 0 } = payload
      const sourceText = String(text || '').trim()
      if (!sourceText) {
        return { success: false, message: '请先写一些正文，或打开已有章节后再续写', content: '' }
      }
      const limit = Number(maxAddWords) > 0 ? Math.floor(Number(maxAddWords)) : 800
      const modelPayload = await resolveTextModelPayload('writing')
      const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
      const response = await postJson('/api/ai/text-task', {
        task: 'continue',
        feature: 'ai_continue',
        title: '编辑器 AI 续写',
        content: sourceText,
        instruction: [
          String(prompt || '').trim() || '承接当前章节继续写。',
          `只输出新增正文，不要重复原文。新增内容控制在 ${limit} 字以内。`
        ].join('\n'),
        ...aiModelPayload,
        maxTokens: Math.min(Math.max(limit * 2, 800), 3200)
      })
      const aiResult = requireWebAiTextTaskResponse(response, 'AI 续写失败')
      if (aiResult.success !== true) {
        return { success: false, message: aiResult.message || 'AI 续写失败', content: '' }
      }
      const resultText = aiResult.content
      const meta = resolveResponseProviderMeta(response, aiModelPayload)
      return {
        success: true,
        content: resultText,
        inputWordCount: countWebTextWords(sourceText),
        wordCount: countWebTextWords(resultText),
        maxAddWords: limit,
        usage: response?.usage || {},
        model: meta.model,
        providerId: meta.providerId
      }
    },
    refineSceneVisualPromptWithAI: async (input) => {
      const payload = normalizeTextAiPayload(input)
      const content = String(payload.text || payload.content || '').trim()
      if (!content) {
        return { success: false, message: '节选内容为空，无法提炼', content: '' }
      }
      const modelPayload = await resolveTextModelPayload('writing')
      const aiModelPayload = resolveTextAiModelPayload(payload, modelPayload)
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
        ...aiModelPayload,
        temperature: 0.4,
        maxTokens: 512
      })
      const aiResult = requireWebAiTextTaskResponse(response, '场景图画面描述失败')
      if (aiResult.success !== true) {
        return { success: false, message: aiResult.message || '场景图画面描述失败', content: '' }
      }
      const resultText = aiResult.content.replace(/^(画面描述|描述)[:：]\s*/i, '').trim()
      if (!resultText) {
        return { success: false, message: 'AI 返回结果为空，请重试', content: '' }
      }
      const meta = resolveResponseProviderMeta(response, aiModelPayload)
      return {
        success: true,
        content: resultText,
        usage: response?.usage || {},
        model: meta.model,
        providerId: meta.providerId
      }
    },
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

    setTongyiwanxiangApiKey: async (apiKey) => {
      const savedApiKey = normalizeWebSecret(apiKey)
      await setStoreValue('tongyiwanxiang.apiKey', savedApiKey)
      return { success: true, ...secretSavedMeta(savedApiKey) }
    },
    getTongyiwanxiangApiKey: async () => ({
      success: true,
      apiKey: await getStoreValue('tongyiwanxiang.apiKey', '')
    }),
    validateTongyiwanxiangApiKey: async () => ({
      success: false,
      isValid: false,
      message: 'Web 端请在 AI Provider 中配置图像服务'
    }),
    generateAICover: (payload) =>
      postJson('/api/ai/image-task', {
        feature: 'ai_cover',
        title: '封面生成',
        prompt:
          payload?.prompt ||
          [payload?.titlePrompt, payload?.authorPrompt, payload?.backgroundPrompt]
            .filter(Boolean)
            .join('\n'),
        negativePrompt: payload?.negativePrompt || '',
        size: payload?.size || '1024x1024',
        bookName: payload?.bookName || '',
        bookFolderName: payload?.bookFolderName || '',
        characterName: payload?.characterName || payload?.subjectName || '',
        appearance: payload?.appearance || '',
        style: payload?.style || '',
        pose: payload?.pose || '',
        promptIntro: payload?.promptIntro || '',
        promptDetailPrefix: payload?.promptDetailPrefix || '',
        visualPrompt: payload?.visualPrompt || '',
        providerId: payload?.providerId || payload?.imageProvider || '',
        modelName: payload?.modelName || ''
      }),
    confirmAICover: (payload) => postJson('/api/ai/cover/confirm', payload || {}),
    discardAICovers: (payload) => postJson('/api/ai/cover/discard', payload || {}),
    generateAICharacterImage: (payload) =>
      postJson('/api/ai/image-task', {
        feature: 'ai_character_image',
        title: '人物图生成',
        prompt: payload?.prompt || payload?.description || '',
        negativePrompt: payload?.negativePrompt || '',
        size: payload?.size || '1024x1024',
        bookName: payload?.bookName || '',
        bookFolderName: payload?.bookFolderName || '',
        providerId: payload?.providerId || payload?.imageProvider || '',
        modelName: payload?.modelName || ''
      }),
    confirmAICharacterImage: (payload) => postJson('/api/ai/character/confirm', payload || {}),
    discardAICharacterImages: (payload) => postJson('/api/ai/character/discard', payload || {}),
    generateAISceneImage: (payload) =>
      postJson('/api/ai/image-task', {
        feature: 'ai_scene_image',
        title: '场景图生成',
        prompt: payload?.prompt || payload?.description || '',
        negativePrompt: payload?.negativePrompt || '',
        size: payload?.size || '1024x1024',
        bookName: payload?.bookName || '',
        bookFolderName: payload?.bookFolderName || '',
        providerId: payload?.providerId || payload?.imageProvider || '',
        modelName: payload?.modelName || ''
      }),

    listConfiguredImageProviders: async () => {
      const providers = requireStoredAiProviders(
        await getStoreValue('aiProviders', []),
        '读取图像 Provider 失败'
      )
      const providerLabels = {}
      const imageProviders = providers
        .filter((provider) => {
          const apiKey = (provider.apiKeys || [])[0] || provider.apiKey || ''
          return provider.category === 'image' && provider.id && provider.baseUrl && apiKey
        })
        .map((provider) => {
          providerLabels[provider.id] = provider.name || provider.id
          return provider.id
        })
      return { success: true, providers: imageProviders, providerLabels }
    },
    getImageAiLastProvider: async () => ({
      success: true,
      provider: await getStoreValue('imageAi.lastProvider', null)
    }),
    setImageAiLastProvider: async (provider) => {
      const savedProvider = provider ? String(provider).trim() : ''
      await setStoreValue('imageAi.lastProvider', savedProvider)
      return { success: true, provider: savedProvider }
    },
    setGeminiApiKey: async (apiKey) => {
      const savedApiKey = normalizeWebSecret(apiKey)
      await setStoreValue('gemini.apiKey', savedApiKey)
      return { success: true, ...secretSavedMeta(savedApiKey) }
    },
    getGeminiApiKey: async () => {
      const apiKey = await getStoreValue('gemini.apiKey', '')
      return {
        success: true,
        apiKey,
        configured: Boolean(String(apiKey || '').trim()),
        source: apiKey ? 'store' : ''
      }
    },
    validateGeminiApiKey: async () => ({
      success: false,
      isValid: false,
      message: 'Web 端请在 AI Provider 中配置图像服务'
    }),
    setDoubaoConfig: async (payload = {}) => {
      const savedConfig = {
        apiKey: normalizeWebSecret(payload.apiKey),
        baseUrl: payload.baseUrl || '',
        model: payload.model || ''
      }
      await setStoreValue('doubao.apiKey', savedConfig.apiKey)
      await setStoreValue('doubao.baseUrl', savedConfig.baseUrl)
      await setStoreValue('doubao.model', savedConfig.model)
      return {
        success: true,
        baseUrl: savedConfig.baseUrl,
        model: savedConfig.model,
        configured: Boolean(savedConfig.apiKey.trim() && String(savedConfig.model || '').trim()),
        source: savedConfig.apiKey.trim() ? 'store' : ''
      }
    },
    getDoubaoConfig: async () => {
      const apiKey = await getStoreValue('doubao.apiKey', '')
      const model = await getStoreValue('doubao.model', '')
      return {
        success: true,
        apiKey,
        baseUrl: await getStoreValue('doubao.baseUrl', ''),
        model,
        configured: Boolean(String(apiKey || '').trim() && String(model || '').trim()),
        source: apiKey ? 'store' : ''
      }
    },
    validateDoubaoConfig: async () => ({
      success: false,
      isValid: false,
      message: 'Web 端请在 AI Provider 中配置图像服务'
    }),

    // --------- AI Provider 管理 ---------
    getAiProviders: async () => {
      const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
      return { success: true, providers }
    },
    saveAiProviders: async (providers) => {
      const nextProviders = requireStoredAiProviders(providers, '保存 Provider 失败')
      await setStoreValue('aiProviders', nextProviders)
      return { success: true, providers: nextProviders }
    },
    addAiProvider: async (provider) => {
      const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
      const newProvider = {
        ...provider,
        id: provider.id || crypto.randomUUID(),
        createdAt: Date.now()
      }
      providers.push(newProvider)
      await setStoreValue('aiProviders', providers)
      return { success: true, provider: newProvider }
    },
    updateAiProvider: async (provider) => {
      const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
      const index = providers.findIndex((p) => p.id === provider.id)
      if (index === -1) return { success: false, message: 'Provider not found' }
      providers[index] = { ...providers[index], ...provider, updatedAt: Date.now() }
      await setStoreValue('aiProviders', providers)
      return { success: true, provider: providers[index] }
    },
    deleteAiProvider: async (providerId) => {
      const providers = requireStoredAiProviders(await getStoreValue('aiProviders', []))
      if (!providerId || !providers.some((p) => p.id === providerId)) {
        return { success: false, message: 'Provider not found' }
      }
      const filtered = providers.filter((p) => p.id !== providerId)
      await setStoreValue('aiProviders', filtered)
      return { success: true, providers: filtered }
    },
    validateAiProvider: async (provider) => {
      const apiKeys =
        Array.isArray(provider?.apiKeys) && provider.apiKeys.length
          ? provider.apiKeys
          : provider?.apiKey
            ? [provider.apiKey]
            : []
      if (!apiKeys.length || !provider?.baseUrl) {
        return { success: false, isValid: false, message: '请先填写 API 地址和 Key' }
      }
      if (provider.category === 'image') {
        for (const key of apiKeys) {
          const result = await testImageProviderByProxy({
            baseUrl: provider.baseUrl,
            apiKey: key,
            modelName: provider.model || provider.models?.[0] || ''
          })
          if (result.success) return result
          if (!/401|403|无效|无权限|Unauthorized|Invalid|invalid|Key/.test(result.message || '')) {
            return result
          }
        }
        return { success: false, isValid: false, message: '所有 Key 均无效或无权限' }
      }
      for (const key of apiKeys) {
        try {
          const proxyResult = await postJson('/api/ai-proxy', {
            targetUrl: `${provider.baseUrl.replace(/\/$/, '')}/v1/models`,
            apiKey: key,
            method: 'GET'
          })
          if (proxyResult.success) {
            const data = proxyResult.data
            const models = data?.data ? data.data.map((m) => m.id) : []
            return { success: true, isValid: true, models }
          } else if (proxyResult.status === 401 || proxyResult.status === 403) {
            continue
          }
          return { success: false, isValid: false, message: `验证失败: ${proxyResult.status}` }
        } catch {
          continue
        }
      }
      return { success: false, isValid: false, message: '所有 Key 均无效或无权限' }
    },
    listAiProviderModels: async (provider) => {
      const apiKeys =
        Array.isArray(provider?.apiKeys) && provider.apiKeys.length
          ? provider.apiKeys
          : provider?.apiKey
            ? [provider.apiKey]
            : []
      if (!apiKeys.length || !provider?.baseUrl) {
        return { success: false, models: [], message: '请先填写 API 地址和 Key' }
      }
      if (provider.category === 'image') {
        return {
          success: true,
          models: Array.isArray(provider.models) ? provider.models : [],
          message: '图像模型请手动输入名称'
        }
      }
      for (const key of apiKeys) {
        try {
          const proxyResult = await postJson('/api/ai-proxy', {
            targetUrl: `${provider.baseUrl.replace(/\/$/, '')}/v1/models`,
            apiKey: key,
            method: 'GET'
          })
          if (proxyResult.success) {
            const data = proxyResult.data
            const models = data?.data ? data.data.map((m) => m.id) : []
            return { success: true, models }
          } else if (proxyResult.status === 401 || proxyResult.status === 403) {
            continue
          }
          return { success: false, models: [], message: `获取模型列表失败: ${proxyResult.status}` }
        } catch {
          continue
        }
      }
      return { success: false, models: [], message: '所有 Key 均无效或无权限' }
    },
    testAiProviderModel: async (provider, modelName) => {
      const apiKeys =
        Array.isArray(provider?.apiKeys) && provider.apiKeys.length
          ? provider.apiKeys
          : provider?.apiKey
            ? [provider.apiKey]
            : []
      if (!apiKeys.length || !provider?.baseUrl) {
        return { success: false, message: '请先填写 API 地址和 Key' }
      }
      if (!modelName) {
        return { success: false, message: '请指定模型名称' }
      }
      if (provider.category === 'image') {
        for (const key of apiKeys) {
          const result = await testImageProviderByProxy({
            baseUrl: provider.baseUrl,
            apiKey: key,
            modelName
          })
          if (result.success) return { success: true, message: result.message }
          if (!/401|403|无效|无权限|Unauthorized|Invalid|invalid|Key/.test(result.message || '')) {
            return { success: false, message: result.message }
          }
        }
        return { success: false, message: '所有 Key 均不可用' }
      }
      for (const key of apiKeys) {
        try {
          const baseUrl = provider.baseUrl.replace(/\/$/, '')
          const isAnthropic = provider.apiType === 'anthropic'
          const proxyResult = await postJson('/api/ai-proxy', {
            targetUrl: isAnthropic ? `${baseUrl}/v1/messages` : `${baseUrl}/v1/chat/completions`,
            apiKey: isAnthropic ? '' : key,
            method: 'POST',
            headers: isAnthropic
              ? {
                  'x-api-key': key,
                  'anthropic-version': '2023-06-01'
                }
              : undefined,
            body: {
              model: modelName,
              messages: [{ role: 'user', content: 'hi' }],
              max_tokens: 10,
              temperature: 0
            }
          })
          if (proxyResult.success) {
            return { success: true, message: '模型测试成功' }
          } else if (proxyResult.status === 401 || proxyResult.status === 403) {
            continue
          }
          const errMsg = proxyResult.data?.error?.message || `测试失败: ${proxyResult.status}`
          return { success: false, message: errMsg }
        } catch {
          continue
        }
      }
      return { success: false, message: '所有 Key 均不可用' }
    },
    getActiveTextProvider: async () => {
      const providerId = await resolveStoredActiveAiProviderId('text')
      return { success: true, providerId }
    },
    setActiveTextProvider: async (id) => {
      return await setStoredActiveAiProviderId('text', id)
    },
    getActiveImageProvider: async () => {
      const providerId = await resolveStoredActiveAiProviderId('image')
      return { success: true, providerId }
    },
    setActiveImageProvider: async (id) => {
      return await setStoredActiveAiProviderId('image', id)
    },

    getExtraction: async (payload) => {
      return await postJson('/api/extraction/get', payload)
    },
    searchKnowledge: async (payload) => {
      return await postJson('/api/extraction/search', payload)
    },
    listKnowledgeItems: (filter) => postJson('/api/knowledge/list', filter || {}),
    getKnowledgeItem: (id) => postJson('/api/knowledge/get', { id }),
    createKnowledgeItem: (input) => postJson('/api/knowledge/create', input || {}),
    updateKnowledgeItem: (id, patch) => postJson('/api/knowledge/update', { id, patch }),
    deleteKnowledgeItem: (id) => postJson('/api/knowledge/delete', { id }),
    searchKnowledgeItems: (keyword, filter) =>
      postJson('/api/knowledge/search', { keyword, filter: filter || {} }),
    favoriteKnowledgeItem: (id, favorite) => postJson('/api/knowledge/favorite', { id, favorite }),
    archiveKnowledgeItem: (id) => postJson('/api/knowledge/archive', { id }),
    linkKnowledgeItems: async (sourceId, targetIds) =>
      postJson('/api/knowledge/link', { sourceId, targetIds: targetIds || [] }),
    convertTopicCardToBook: (topicCardId) =>
      postJson('/api/knowledge/convert-topic-to-book', { topicCardId }),
    runKnowledgeAiTask: (payload) => postJson('/api/knowledge/ai-task', payload || {}),
    createTopicCardFromAi: (payload) =>
      postJson('/api/knowledge/create-topic-from-ai', payload || {}),
    listMarketHotspots: (filter) => postJson('/api/market/hotspots', filter || {}),
    createMarketHotspot: (input) => postJson('/api/market/hotspots/create', input || {}),
    updateMarketHotspot: (id, patch) => postJson('/api/market/hotspots/update', { id, patch }),
    saveMarketHotspotToKnowledge: (id) =>
      postJson('/api/market/hotspots/save-to-knowledge', { id }),
    createTopicCardFromMarketHotspot: (id) =>
      postJson('/api/market/hotspots/create-topic-card', { id }),
    listMarketActivities: (filter) => postJson('/api/market/activities', filter || {}),
    createMarketActivity: (input) => postJson('/api/market/activities/create', input || {}),
    updateMarketActivity: (id, patch) => postJson('/api/market/activities/update', { id, patch }),
    saveMarketActivityToKnowledge: (id) =>
      postJson('/api/market/activities/save-to-knowledge', { id }),
    createTopicCardFromMarketActivity: (id) =>
      postJson('/api/market/activities/create-topic-card', { id }),
    refreshMarketTrends: (payload = {}) => postJson('/api/market/refresh', payload || {}),
    listMarketHotTopics: (filter = {}) => postJson('/api/market/hot-topics', filter || {}),
    getMarketTrend: (keyword) => postJson('/api/market/trends', { keyword }),
    listMarketTrends: (filter = {}) => postJson('/api/market/trends', filter || {}),
    listMarketSourceStatus: () => postJson('/api/market/source-status', {}),
    listMarketOpportunities: (payload = {}) => postJson('/api/market/opportunities', payload || {}),
    getMarketDashboard: (payload = {}) => postJson('/api/market/dashboard', payload || {}),
    getMarketOverview: (payload = {}) => postJson('/api/market/overview', payload || {}),
    getMarketHotRank: (payload = {}) => postJson('/api/market/hot-rank', payload || {}),
    getMarketKeywordCloud: (payload = {}) => postJson('/api/market/keyword-cloud', payload || {}),
    getMarketKeywordCombination: (payload = {}) =>
      postJson('/api/market/keyword-combination', payload || {}),
    getMarketActivitiesBoard: (payload = {}) =>
      postJson('/api/market/activities-board', payload || {}),
    saveMarketInspiration: (payload = {}) =>
      postJson('/api/market/save-inspiration', payload || {}),
    generateMarketOutline: (payload = {}) =>
      postJson('/api/market/generate-outline', payload || {}),
    applyMarketInsightToCurrentBook: (payload = {}) =>
      postJson('/api/market/apply-to-current-book', payload || {}),
    createBookFromMarketInsight: (payload = {}) =>
      postJson('/api/market/create-book-from-insight', payload || {}),
    getAnalyticsOverview: async (payload = {}) =>
      postJson('/api/analytics/overview', payload || {}),
    getAnalyticsDailyWords: async (payload = {}) =>
      postJson('/api/analytics/daily-words', payload || {}),
    getAnalyticsWritingHabit: async (payload = {}) =>
      postJson('/api/analytics/writing-habit', payload || {}),
    getAnalyticsSessionStats: async (payload = {}) =>
      postJson('/api/analytics/session-stats', payload || {}),
    getAnalyticsTokenStats: async (payload = {}) =>
      postJson('/api/analytics/token-stats', payload || {}),
    getAnalyticsWeeklyReport: async (payload = {}) =>
      postJson('/api/analytics/weekly-report', payload || {}),
    getAnalyticsMonthlyReport: async (payload = {}) =>
      postJson('/api/analytics/monthly-report', payload || {}),
    runConsistencyCheck: async (payload = {}) => postJson('/api/consistency/check', payload || {}),
    listConsistencyChecks: async (payload = {}) => postJson('/api/consistency/list', payload || {}),
    listWritingGoals: async () => postJson('/api/goals/list', {}),
    createWritingGoal: async (payload = {}) => postJson('/api/goals/create', payload || {}),
    updateWritingGoal: async (id, patch = {}) => postJson('/api/goals/update', { id, patch }),
    deleteWritingGoal: async (id) => postJson('/api/goals/delete', { id }),
    getStorageStats: async () => postJson('/api/settings/storage-stats', {}),
    clearAssetTrash: async () => postJson('/api/settings/clear-trash', {}),
    exportAppSettings: async () => postJson('/api/settings/export', {}),
    importAppSettings: async (payload = {}) => postJson('/api/settings/import', payload || {}),
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
    plotEvolutionEvolve: async (payload = {}) =>
      postJson('/api/plot-evolution/evolve', payload || {}),
    plotEvolutionRegenerate: async (payload = {}) =>
      postJson('/api/plot-evolution/regenerate', payload || {}),
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
    generateSettingTree: async (payload = {}) =>
      postJson('/api/setting-tree/generate', payload || {}),
    regenerateSettingNode: async (payload = {}) =>
      postJson('/api/setting-tree/regenerate-node', payload || {}),
    applySettingTree: async (payload = {}) => postJson('/api/setting-tree/apply', payload || {}),
    listPromptPresets: async (payload = {}) => postJson('/api/prompts/list', payload || {}),
    createPromptPreset: async (payload = {}) => postJson('/api/prompts/create', payload || {}),
    updatePromptPreset: async (payload = {}) => postJson('/api/prompts/update', payload || {}),
    deletePromptPreset: async (payload = {}) => postJson('/api/prompts/delete', payload || {}),
    exportPromptPresets: async (payload = {}) => postJson('/api/prompts/export', payload || {}),
    importPromptPresets: async (payload = {}) => postJson('/api/prompts/import', payload || {}),
    aiChatSend: async (payload = {}) => postJson('/api/ai/chat', payload || {}),
    runAiTextTask: async (payload = {}) => postJson('/api/ai/text-task', payload || {}),
    runAiImageTask: async (payload = {}) => postJson('/api/ai/image-task', payload || {}),
    listAiHistory: async (payload = {}) => postJson('/api/ai/history', payload || {}),
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
    },
    listEmbeddingProviders: async () => {
      const providers = await storedEmbeddingProviders()
      return { success: true, providers }
    },
    addEmbeddingProvider: async (payload = {}) => {
      const providers = await storedEmbeddingProviders()
      const cleanProvider = normalizeEmbeddingProviderPayload(payload)
      const message = validateEmbeddingProviderConfig(cleanProvider, { requireName: true })
      if (message) {
        return { success: false, message }
      }
      const next = providers.filter((item) => item.id !== cleanProvider.id)
      next.push(cleanProvider)
      await setStoreValue('embeddingProviders', next)
      return { success: true, providers: next }
    },
    deleteEmbeddingProvider: async (payload = {}) => {
      const providers = await storedEmbeddingProviders()
      const id = resolveEmbeddingProviderId(payload)
      if (!id || !providers.some((item) => item.id === id)) {
        return { success: false, message: '未找到 Embedding Provider' }
      }
      const next = providers.filter((item) => item.id !== id)
      await setStoreValue('embeddingProviders', next)
      return { success: true, providers: next }
    },
    setActiveEmbeddingProvider: async (payload = {}) => {
      const providers = await storedEmbeddingProviders()
      const id = resolveEmbeddingProviderId(payload)
      const active =
        typeof payload === 'object' && payload !== null && 'active' in payload
          ? Boolean(payload.active)
          : true
      if (!id || !providers.some((item) => item.id === id)) {
        return { success: false, message: '未找到 Embedding Provider' }
      }
      const next = providers.map((item) => ({
        ...item,
        active: active ? item.id === id : false
      }))
      await setStoreValue('embeddingProviders', next)
      return { success: true, providers: next }
    },
    getActiveEmbeddingProvider: async () => {
      const providers = await storedEmbeddingProviders()
      return providers.find((item) => item.active) || null
    },
    validateEmbeddingProvider: async (payload = {}) => {
      const canUseDirectProvider = payload && typeof payload === 'object' && !Array.isArray(payload)
      const directProvider = canUseDirectProvider
        ? normalizeEmbeddingProviderPayload(payload)
        : null
      const needsStoredProviders =
        !directProvider?.baseUrl && !directProvider?.apiKey && !directProvider?.modelName
      const providers = needsStoredProviders ? await storedEmbeddingProviders() : []
      const target = resolveEmbeddingProviderForAction(payload, providers)
      if (!target) {
        return { success: false, isValid: false, message: '未找到 Embedding Provider' }
      }
      const message = validateEmbeddingProviderConfig(target)
      if (message) {
        return { success: false, isValid: false, message }
      }
      try {
        const dimensions = target.dimensions || target.dimension
        const body = {
          model: target.model || target.modelName,
          input: 'test'
        }
        if (dimensions) body.dimensions = dimensions
        const proxyResult = await postJson('/api/ai-proxy', {
          targetUrl: `${target.baseUrl.replace(/\/$/, '')}/v1/embeddings`,
          apiKey: target.apiKey,
          method: 'POST',
          body
        })
        return proxyResult.success
          ? { success: true, isValid: true }
          : {
              success: false,
              isValid: false,
              message: proxyResult.data?.error?.message || `验证失败: ${proxyResult.status}`
            }
      } catch (error) {
        return { success: false, isValid: false, message: error.message || '验证失败' }
      }
    },
    listEmbeddingProviderModels: async (provider = {}) => {
      if (!provider.baseUrl || !provider.apiKey) {
        return { success: false, models: [], message: '请先填写 API 地址和 Key' }
      }
      try {
        const proxyResult = await postJson('/api/ai-proxy', {
          targetUrl: `${provider.baseUrl.replace(/\/$/, '')}/v1/models`,
          apiKey: provider.apiKey,
          method: 'GET'
        })
        if (proxyResult.success) {
          const models = proxyResult.data?.data ? proxyResult.data.data.map((item) => item.id) : []
          return { success: true, models }
        }
        return { success: false, models: [], message: `获取模型列表失败: ${proxyResult.status}` }
      } catch (error) {
        return { success: false, models: [], message: error.message || '获取模型列表失败' }
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

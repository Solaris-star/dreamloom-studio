import { randomUUID } from 'node:crypto'

export const AI_LOGS_KEY = 'stats:ai_logs'

const SENSITIVE_METADATA_KEY =
  /^(?:api[-_]?key|authorization|password|secret|token|access[-_]?token|refresh[-_]?token|prompt|messages?|content|sourceContent|text|body|filePath|path|bookDir)$/i

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function sanitizeAiLogValue(value, key = '') {
  if (SENSITIVE_METADATA_KEY.test(key)) return '***'
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAiLogValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, item]) => [
        itemKey,
        sanitizeAiLogValue(item, itemKey)
      ])
    )
  }
  if (typeof value !== 'string') return value
  return value
    .replace(/\bBearer\s+\S+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***')
    .replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, '[本地路径]')
    .replace(/(?:^|\s)\/(?:home|Users|var|tmp)\/\S+/g, ' [本地路径]')
}

export function normalizeAiUsage(usage = {}) {
  const promptTokens = toNumber(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens,
    0
  )
  const completionTokens = toNumber(
    usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens,
    0
  )
  const totalTokens = toNumber(
    usage.total_tokens ?? usage.totalTokens,
    promptTokens + completionTokens
  )
  const imageRequests = toNumber(
    usage.imageRequests ?? usage.image_requests ?? usage.images ?? usage.imageCount,
    0
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    imageRequests
  }
}

export function estimateAiCost(provider = {}, usage = {}) {
  const normalized = normalizeAiUsage(usage)
  const explicitCost = toNumber(
    usage.estimatedCost ?? usage.cost ?? usage.estimated_cost,
    Number.NaN
  )
  if (Number.isFinite(explicitCost)) return explicitCost

  const inputPrice = toNumber(provider.inputPricePerMillionTokens, 0)
  const outputPrice = toNumber(provider.outputPricePerMillionTokens, 0)
  const imagePrice = toNumber(provider.imagePricePerRequest, 0)

  return (
    (normalized.promptTokens / 1_000_000) * inputPrice +
    (normalized.completionTokens / 1_000_000) * outputPrice +
    normalized.imageRequests * imagePrice
  )
}

export function buildAiUsageLog({
  bookId = '',
  feature = 'ai',
  providerId = '',
  provider = {},
  model = '',
  usage = {},
  success = true,
  error = '',
  metadata = {}
} = {}) {
  const normalized = normalizeAiUsage(usage)
  const safeModel = model || provider?.model || provider?.modelName || provider?.models?.[0] || ''
  const safeProviderId = providerId || provider?.id || ''

  return {
    id: randomUUID(),
    bookId: String(bookId || ''),
    feature: String(feature || 'ai'),
    providerId: String(safeProviderId || ''),
    model: String(safeModel || ''),
    ...normalized,
    estimatedCost: estimateAiCost(provider, usage),
    success: Boolean(success),
    error: error ? sanitizeAiLogValue(String(error)) : '',
    metadata:
      metadata && typeof metadata === 'object' ? sanitizeAiLogValue(metadata) : {},
    createdAt: Date.now()
  }
}

export function appendAiUsageLog({ get, set }, entry = {}) {
  const current = get(AI_LOGS_KEY)
  if (current !== undefined && !Array.isArray(current)) {
    throw new Error('AI 日志格式异常，已停止写入以免覆盖原始记录')
  }
  const logs = current ? [...current] : []
  const next = buildAiUsageLog(entry)
  logs.push(next)
  set(AI_LOGS_KEY, logs.slice(-5000))
  return next
}

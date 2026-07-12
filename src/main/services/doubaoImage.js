/**
 * 火山引擎方舟 — 豆包等文生图（OpenAI 兼容 images/generations）
 * 文档：https://www.volcengine.com/docs/82379/（以控制台当前文档为准）
 */

export const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
export const DEFAULT_DOUBAO_TIMEOUT_MS = 60000

/**
 * 通义「宽*高」转为方舟常见「宽x高」
 * @param {string} sizeStr
 * @returns {string}
 */
export function mapTongyiSizeToDoubaoSize(sizeStr) {
  const parts = String(sizeStr || '').split('*')
  const w = parseInt(parts[0], 10)
  const h = parseInt(parts[1], 10)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return `${w}x${h}`
  }
  return '1024x1024'
}

/**
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} [opts.baseUrl]
 * @param {string} opts.prompt
 * @param {string} [opts.size] 通义格式 宽*高
 * @param {string} [opts.negativePrompt]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<Buffer>}
 */
export async function generateImageBuffer({
  apiKey,
  model,
  baseUrl,
  prompt,
  size,
  negativePrompt,
  timeoutMs = DEFAULT_DOUBAO_TIMEOUT_MS
}) {
  if (!apiKey?.trim()) {
    throw new Error('豆包 API Key 未设置，请在设置中配置')
  }
  if (!model?.trim()) {
    throw new Error('豆包模型 ID 未设置，请在设置中填写')
  }
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('提示词不能为空')
  }

  const root = String(baseUrl || DEFAULT_DOUBAO_BASE_URL).replace(/\/$/, '')
  const url = `${root}/images/generations`

  let fullPrompt = prompt.trim()
  if (negativePrompt && String(negativePrompt).trim()) {
    fullPrompt += `，避免：${String(negativePrompt).trim()}`
  }

  const body = {
    model: model.trim(),
    prompt: fullPrompt,
    n: 1,
    size: mapTongyiSizeToDoubaoSize(size),
    response_format: 'b64_json'
  }
  const effectiveTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_DOUBAO_TIMEOUT_MS
  const signal = AbortSignal.timeout(effectiveTimeout)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body),
      signal
    })
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new Error(`豆包图像 API 请求超时（${effectiveTimeout} ms）`)
    }
    throw error
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `豆包图像 API 请求失败: ${response.status} ${response.statusText}`
    throw new Error(msg)
  }

  const b64 = data.data?.[0]?.b64_json
  if (b64) {
    const imageBuffer = Buffer.from(b64, 'base64')
    if (!imageBuffer.length) throw new Error('豆包图像 API 返回了空图片数据')
    return imageBuffer
  }

  const imageUrl = data.data?.[0]?.url
  if (imageUrl && typeof imageUrl === 'string') {
    let parsedImageUrl
    try {
      parsedImageUrl = new URL(imageUrl)
    } catch {
      throw new Error('豆包图像 API 返回了无效图片地址')
    }
    if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) {
      throw new Error('豆包图像 API 返回了不安全的图片地址')
    }
    let imgRes
    try {
      imgRes = await fetch(parsedImageUrl, { signal })
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new Error(`下载豆包返回的图片超时（${effectiveTimeout} ms）`)
      }
      throw error
    }
    if (!imgRes.ok) {
      throw new Error(`下载豆包返回的图片失败: ${imgRes.status}`)
    }
    const imageBuffer = Buffer.from(await imgRes.arrayBuffer())
    if (!imageBuffer.length) throw new Error('豆包图像 API 下载到了空图片')
    return imageBuffer
  }

  throw new Error('豆包图像 API 未返回有效图片数据')
}

/**
 * 与通义万相当前策略一致：仅检查字段已填，避免无谓扣费
 * @param {string} apiKey
 * @param {string} model
 * @returns {{ isValid: boolean, message?: string }}
 */
export function validateConfigNonEmpty(apiKey, model) {
  if (!apiKey?.trim()) {
    return { isValid: false, message: 'API Key 未设置' }
  }
  if (!model?.trim()) {
    return { isValid: false, message: '模型 ID 未设置' }
  }
  return { isValid: true }
}

/**
 * AI 图片生成与素材确认服务。
 */

import { postJson } from './webHttpClient.js'

async function getStoreValue(key, fallback = '') {
  const result = await postJson('/api/store/get', { key })
  if (result?.success !== true || result.key !== key) {
    throw new Error('读取图像 AI 设置失败')
  }
  return result.value ?? fallback
}

async function setStoreValue(key, value) {
  const result = await postJson('/api/store/set', { key, value })
  if (result?.success !== true || result.key !== key) {
    throw new Error('保存图像 AI 设置失败')
  }
}

function requireImageResult(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || fallback)
  }
  if (typeof result.localPath !== 'string' || !result.localPath) {
    throw new Error(`${fallback}：接口没有返回图片路径`)
  }
  return result
}

export async function setTongyiwanxiangApiKey(apiKey) {
  const savedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  await setStoreValue('tongyiwanxiang.apiKey', savedApiKey)
  return { success: true, configured: Boolean(savedApiKey), source: savedApiKey ? 'store' : '' }
}

export async function getTongyiwanxiangApiKey() {
  const apiKey = await getStoreValue('tongyiwanxiang.apiKey', '')
  return { success: true, apiKey }
}

export async function validateTongyiwanxiangApiKey() {
  return {
    success: false,
    isValid: false,
    message: '请在 AI Provider 中配置并测试图像服务'
  }
}

export async function generateAICover(options = {}) {
  const result = await postJson('/api/ai/image-task', {
    ...options,
    feature: 'ai_cover',
    title: '封面生成',
    prompt:
      options.prompt ||
      [options.titlePrompt, options.authorPrompt, options.backgroundPrompt]
        .filter(Boolean)
        .join('\n'),
    size: options.size || '1024x1024',
    providerId: options.providerId || options.imageProvider || ''
  })
  return requireImageResult(result, '生成封面失败')
}

export async function confirmAICover(options) {
  return requireImageResult(await postJson('/api/ai/cover/confirm', options), '确认封面失败')
}

export async function discardAICovers(options) {
  return postJson('/api/ai/cover/discard', options)
}

export async function generateAICharacterImage(options = {}) {
  const result = await postJson('/api/ai/image-task', {
    ...options,
    feature: 'ai_character_image',
    title: '人物图生成',
    prompt: options.prompt || options.description || '',
    size: options.size || '1024x1024',
    providerId: options.providerId || options.imageProvider || ''
  })
  return requireImageResult(result, '生成人物图失败')
}

export async function confirmAICharacterImage(options) {
  return requireImageResult(
    await postJson('/api/ai/character/confirm', options),
    '确认人物图失败'
  )
}

export async function discardAICharacterImages(options) {
  return postJson('/api/ai/character/discard', options)
}

export async function generateAISceneImage(options = {}) {
  const result = await postJson('/api/ai/image-task', {
    ...options,
    feature: 'ai_scene_image',
    title: '场景图生成',
    prompt: options.prompt || options.description || '',
    size: options.size || '1024x1024',
    providerId: options.providerId || options.imageProvider || ''
  })
  return requireImageResult(result, '生成场景图失败')
}

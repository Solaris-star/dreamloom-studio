import * as promptPresetService from '../services/promptPresetService.js'

const ROUTES = new Set([
  '/api/prompts/list',
  '/api/prompts/create',
  '/api/prompts/update',
  '/api/prompts/delete',
  '/api/prompts/export',
  '/api/prompts/import'
])

export function isPromptRoute(path) {
  return ROUTES.has(path)
}

export function handlePromptRoute({
  path,
  body,
  res,
  sendJson,
  resolvePresetPath,
  service = promptPresetService
}) {
  if (!isPromptRoute(path)) return false

  const payload = body || {}
  const presetPath = resolvePresetPath(payload)
  if (path === '/api/prompts/list') {
    sendJson(res, {
      success: true,
      presets: service.listPresets(presetPath, payload)
    })
    return true
  }

  if (path === '/api/prompts/create') {
    const preset = service.createPreset(presetPath, payload.preset || payload, payload)
    sendJson(res, { success: true, preset })
    return true
  }

  if (path === '/api/prompts/update') {
    const presetPayload = payload.preset || {}
    const presetId = payload.id || payload.presetId || presetPayload.id
    const preset = service.updatePreset(presetPath, presetId, presetPayload, payload)
    sendJson(
      res,
      preset
        ? { success: true, preset }
        : { success: false, message: 'Prompt 模板不存在' },
      preset ? 200 : 404
    )
    return true
  }

  if (path === '/api/prompts/delete') {
    const presetId = payload.id || payload.presetId
    const deleted = service.deletePreset(presetPath, presetId)
    sendJson(
      res,
      deleted
        ? { success: true, presetId }
        : { success: false, message: 'Prompt 模板不存在' },
      deleted ? 200 : 404
    )
    return true
  }

  if (path === '/api/prompts/export') {
    sendJson(res, {
      success: true,
      jsonString: service.exportPresets(presetPath)
    })
    return true
  }

  const presets = service.importPresets(presetPath, payload.jsonString || '[]', payload)
  sendJson(res, { success: true, presets, count: presets.length })
  return true
}

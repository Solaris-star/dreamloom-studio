import { listAgentTasks } from '../services/editorAgentTaskService.js'

const ROUTES = new Set(['/api/editor-agent/tasks'])

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isAgentTaskRoute(path) {
  return ROUTES.has(path)
}

// 注意：必须保持同步函数（返回 false 而非 Promise），
// 否则 vite.web.plugins.mjs 路由链里 truthy Promise 会吞掉所有请求
export function handleAgentTaskRoute({ path, body, res, sendJson, booksDir, resolveBookPath }) {
  if (!isAgentTaskRoute(path)) return false
  const payload = body || {}
  try {
    const bookPath = resolveBookPath(payload, booksDir, { ensure: false })
    const limit = Math.min(100, Math.max(1, Number(payload.limit) || 50))
    const result = listAgentTasks(bookPath, {
      status: cleanText(payload.status) || undefined,
      limit
    })
    sendJson(res, result)
  } catch (error) {
    sendJson(
      res,
      { success: false, message: error?.message || '读取 Agent 任务记录失败' },
      error.statusCode || 500
    )
  }
  return true
}

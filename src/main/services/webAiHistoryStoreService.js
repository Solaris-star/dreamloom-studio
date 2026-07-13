export function createWebAiHistoryReader(readStore) {
  if (typeof readStore !== 'function') {
    throw new TypeError('缺少 Web Store 读取函数')
  }

  return function readAiHistoryRows(action = '读取 AI 历史') {
    const store = readStore()
    const rows = store?.['ai:history']
    if (rows == null) return []
    if (!Array.isArray(rows)) {
      throw new Error(`AI 历史记录格式异常，已停止${action}以免覆盖原始记录`)
    }
    return rows
  }
}

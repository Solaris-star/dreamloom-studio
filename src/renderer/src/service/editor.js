import { getAiProviders, getActiveTextProvider } from './aiProvider.js'
import { postJson } from './webHttpClient.js'
import { getStoreValue, setStoreValue } from './webStore.js'

function requireSuccessResult(response, label) {
  if (response?.success !== true) {
    throw new Error(response.message || `${label}失败`)
  }
  return response
}

function requireStoreArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label}：本地记录格式不正确`)
  }
  return value
}

function createRecordId(prefix = 'record') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function statusFromApplyAction(action = '') {
  if (action === 'discard') return 'discarded'
  if (['save_material', 'save_snippet', 'send_to_asset_workspace'].includes(action)) return 'saved'
  return 'applied'
}

function requireObjectResult(response, fieldName, label) {
  const result = requireSuccessResult(response, label)
  if (
    !result?.[fieldName] ||
    typeof result[fieldName] !== 'object' ||
    Array.isArray(result[fieldName])
  ) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return result
}

function requireArrayResult(response, fieldName, label) {
  const result = requireSuccessResult(response, label)
  if (!Array.isArray(result?.[fieldName])) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return result
}

function isConsistencyCheckRow(row) {
  return row && typeof row === 'object' && !Array.isArray(row) && Array.isArray(row.issues)
}

function requireConsistencyCheckResult(response) {
  const result = requireObjectResult(response, 'check', '一致性检查')
  if (!isConsistencyCheckRow(result.check)) {
    throw new Error('一致性检查失败：接口返回格式不正确')
  }
  return result
}

function requireConsistencyCheckListResult(response) {
  const result = requireArrayResult(response, 'checks', '读取一致性检查记录')
  if (!result.checks.every(isConsistencyCheckRow)) {
    throw new Error('读取一致性检查记录失败：接口返回格式不正确')
  }
  return result
}

function requireModelDefaultResult(response) {
  const result = requireSuccessResult(response, '保存编辑器模型默认设置')
  if (
    result?.success !== true ||
    typeof result.task !== 'string' ||
    typeof result.modelId !== 'string' ||
    !result.defaults ||
    typeof result.defaults !== 'object' ||
    !Object.prototype.hasOwnProperty.call(result.defaults, result.task) ||
    typeof result.providerId !== 'string'
  ) {
    throw new Error('保存编辑器模型默认设置失败：接口返回格式不正确')
  }
  return result
}

function requireCancelAgentGenerationResult(response, payload = {}) {
  const result = requireSuccessResult(response, '停止生成')
  if (result.cancelled !== true) {
    throw new Error('停止生成失败：接口返回格式不正确')
  }
  const expectedStreamChannel = String(payload.streamChannel || '').trim()
  const expectedTaskId = String(payload.taskId || '').trim()
  const resultStreamChannel = String(result.streamChannel || '').trim()
  const resultTaskId = String(result.taskId || '').trim()
  if (expectedStreamChannel && resultStreamChannel !== expectedStreamChannel) {
    throw new Error('停止生成失败：接口返回的任务不匹配')
  }
  if (expectedTaskId && resultTaskId !== expectedTaskId) {
    throw new Error('停止生成失败：接口返回的任务不匹配')
  }
  if (!expectedStreamChannel && !expectedTaskId) {
    throw new Error('停止生成失败：缺少任务标识')
  }
  return result
}

function requireAgentGenerationResult(response, label) {
  const result = requireObjectResult(response, 'generation', label)
  const generation = result.generation
  if (typeof generation.id !== 'string' || !generation.id.trim()) {
    throw new Error(`${label}失败：接口没有返回生成记录 ID`)
  }
  if (typeof generation.taskId !== 'string' || !generation.taskId.trim()) {
    throw new Error(`${label}失败：接口没有返回 Agent 任务 ID`)
  }
  if (typeof generation.result !== 'string' || !generation.result.trim()) {
    throw new Error(`${label}失败：Agent 没有返回可用正文`)
  }
  if (!Array.isArray(generation.agentSteps) || generation.agentSteps.length === 0) {
    throw new Error(`${label}失败：接口没有返回真实执行步骤`)
  }
  if (
    !generation.agentSteps.every(
      (step) =>
        step &&
        typeof step === 'object' &&
        typeof step.stage === 'string' &&
        step.stage.trim() &&
        typeof step.status === 'string' &&
        step.status.trim()
    )
  ) {
    throw new Error(`${label}失败：执行步骤格式不正确`)
  }
  return result
}

function isWritingSkillRow(row) {
  return (
    row &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    typeof row.id === 'string' &&
    row.id.trim() &&
    typeof row.key === 'string' &&
    row.key.trim() &&
    typeof row.label === 'string' &&
    row.label.trim() &&
    typeof row.instruction === 'string' &&
    row.instruction.trim()
  )
}

function requireWritingSkillListResult(response) {
  const result = requireArrayResult(response, 'skills', '读取 writing skill')
  if (!result.skills.every(isWritingSkillRow)) {
    throw new Error('读取 writing skill 失败：接口返回格式不正确')
  }
  if (!Array.isArray(result.groups)) {
    throw new Error('读取 writing skill 失败：接口返回分组格式不正确')
  }
  return result
}

function requireWritingSkillRunResult(response) {
  const result = requireSuccessResult(response, '执行 writing skill')
  if (
    result.mode === 'preview' &&
    (!result.skill ||
      !isWritingSkillRow(result.skill) ||
      !result.payload ||
      typeof result.payload !== 'object')
  ) {
    throw new Error('执行 writing skill 失败：接口返回格式不正确')
  }
  if (
    result.mode === 'chapter_write' &&
    (!result.skill ||
      !isWritingSkillRow(result.skill) ||
      typeof result.skillId !== 'string' ||
      !result.skillId.trim())
  ) {
    throw new Error('执行 writing skill 失败：接口返回写章结果格式不正确')
  }
  return result
}

function requireAgentProgressServerResult(response) {
  const result = requireSuccessResult(response, '读取 Agent 进度服务状态')
  if (typeof result.host !== 'string' || !result.host.trim()) {
    throw new Error('读取 Agent 进度服务状态失败：接口没有返回 host')
  }
  if (!Number.isInteger(Number(result.port)) || Number(result.port) <= 0) {
    throw new Error('读取 Agent 进度服务状态失败：接口没有返回有效端口')
  }
  if (typeof result.path !== 'string' || !result.path.trim()) {
    throw new Error('读取 Agent 进度服务状态失败：接口没有返回 path')
  }
  if (typeof result.url !== 'string' || !/^wss?:\/\//.test(result.url)) {
    throw new Error('读取 Agent 进度服务状态失败：接口没有返回 WebSocket 地址')
  }
  return result
}

function requireChapterTargetWordsResult(response, targetWords) {
  const result = requireSuccessResult(response, '保存章节目标字数')
  const settings = result.settings
  const expectedTargetWords = Number(targetWords)
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    !Number.isFinite(Number(settings.targetWords)) ||
    Number(settings.targetWords) !== expectedTargetWords
  ) {
    throw new Error('保存章节目标字数失败：接口返回格式不正确')
  }
  return result
}

function requireSortOrderValue(response) {
  const order = typeof response === 'string' ? response : response?.order
  if (!['asc', 'desc'].includes(order)) {
    throw new Error('读取章节排序失败：接口返回格式不正确')
  }
  return order
}

function normalizeChapterSettings(rawSettings = {}) {
  const targetWordsValue = Number(rawSettings.targetWords)
  return {
    chapterFormat: rawSettings.chapterFormat === 'hanzi' ? 'hanzi' : 'number',
    suffixType: rawSettings.suffixType || '章',
    targetWords: Number.isFinite(targetWordsValue) && targetWordsValue > 0 ? targetWordsValue : 2000
  }
}

function requireChapterSettingsResult(response) {
  const settings =
    response?.success === true && response.settings && typeof response.settings === 'object'
      ? response.settings
      : response
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    !Object.prototype.hasOwnProperty.call(settings, 'chapterFormat') ||
    !Object.prototype.hasOwnProperty.call(settings, 'suffixType') ||
    !Object.prototype.hasOwnProperty.call(settings, 'targetWords')
  ) {
    throw new Error('读取章节设置失败：接口返回格式不正确')
  }
  return normalizeChapterSettings(settings)
}

function validateChapterTreeRows(rows, label) {
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`${label}失败：接口返回格式不正确`)
    }
    if (row.children !== undefined) {
      if (!Array.isArray(row.children)) {
        throw new Error(`${label}失败：接口返回格式不正确`)
      }
      validateChapterTreeRows(row.children, label)
    }
  }
}

function requireChapterTreeResult(response, expected = {}) {
  const result = requireSuccessResult(response, '读取章节目录')
  const expectedBookName = String(expected.bookName || '').trim()
  if (expectedBookName && result.bookName && result.bookName !== expectedBookName) {
    throw new Error('读取章节目录失败：接口返回的作品不匹配')
  }
  if (!Array.isArray(result.chapters)) {
    throw new Error('读取章节目录失败：接口返回格式不正确')
  }
  validateChapterTreeRows(result.chapters, '读取章节目录')
  return result.chapters
}

function requireOutlineReadResult(response) {
  const result = requireSuccessResult(response, '读取大纲')
  if (!Object.prototype.hasOwnProperty.call(result, 'data')) {
    throw new Error('读取大纲失败：接口返回格式不正确')
  }
  const data = result.data
  if (data == null) return null
  if (Array.isArray(data)) return { content: '', children: data }
  if (!data || typeof data !== 'object') {
    throw new Error('读取大纲失败：接口返回格式不正确')
  }
  if (Object.prototype.hasOwnProperty.call(data, 'children') && !Array.isArray(data.children)) {
    throw new Error('读取大纲失败：接口返回格式不正确')
  }
  return data
}

function requireOutlineWriteResult(response) {
  const result = requireSuccessResult(response, '保存大纲')
  if (
    result.fileName !== 'outlines.json' ||
    result.documentType !== 'outlines' ||
    typeof result.path !== 'string' ||
    !result.path ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath
  ) {
    throw new Error('保存大纲失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存大纲失败：数据库未记录大纲')
  }
  return result
}

function requireOutlineAiSessionsReadResult(response) {
  const source = response?.success === true ? response.data : response
  if (response?.success === false) {
    throw new Error(response.message || response.error || '读取 AI 大纲会话失败')
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('读取 AI 大纲会话失败：接口返回格式不正确')
  }
  if (
    Object.prototype.hasOwnProperty.call(source, 'nodes') &&
    (!source.nodes || typeof source.nodes !== 'object' || Array.isArray(source.nodes))
  ) {
    throw new Error('读取 AI 大纲会话失败：接口返回格式不正确')
  }
  return {
    ...source,
    version: Number(source.version) || 1,
    nodes: source.nodes || {}
  }
}

function requireOutlineAiSessionsWriteResult(response) {
  const result = requireSuccessResult(response, '保存 AI 大纲会话')
  if (
    result.fileName !== 'outline-ai-sessions.json' ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error('保存 AI 大纲会话失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存 AI 大纲会话失败：数据库没有记录本次写入')
  }
  return result
}

function requireSettingsReadResult(response) {
  const result = requireSuccessResult(response, '读取设定')
  if (!Object.prototype.hasOwnProperty.call(result, 'data')) {
    throw new Error('读取设定失败：接口返回格式不正确')
  }
  const data = result.data
  if (data == null) return null
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('读取设定失败：接口返回格式不正确')
  }
  return data
}

function requireSettingsDocumentWriteResult(response, expectedRows = []) {
  const result = requireSuccessResult(response, '保存设定')
  if (
    result.fileName !== 'settings.json' ||
    result.documentType !== 'settings' ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error('保存设定失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存设定失败：数据库没有记录本次写入')
  }
  if (result.itemCount !== expectedRows.length) {
    throw new Error('保存设定失败：接口返回的分类数量不匹配')
  }
  return result
}

function requireDictionaryRowsResult(response) {
  const result = requireSuccessResult(response, '读取词典')
  if (!Array.isArray(result.data)) {
    throw new Error('读取词典失败：接口返回格式不正确')
  }
  return result.data
}

function requireTimelineRowsResult(response) {
  const result = requireSuccessResult(response, '读取时间线')
  if (!Array.isArray(result.data)) {
    throw new Error('读取时间线失败：接口返回格式不正确')
  }
  return result.data
}

function requireTimelineDocumentWriteResult(response, expectedRows = []) {
  const result = requireSuccessResult(response, '保存时间线')
  if (
    result.fileName !== 'timelines.json' ||
    result.documentType !== 'timeline' ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error('保存时间线失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存时间线失败：数据库没有记录本次写入')
  }
  if (result.itemCount !== expectedRows.length) {
    throw new Error('保存时间线失败：接口返回的时间线数量不匹配')
  }
  return result
}

function requireSequenceChartsRowsResult(response) {
  const result = requireSuccessResult(response, '读取事序图')
  if (!Array.isArray(result.data)) {
    throw new Error('读取事序图失败：接口返回格式不正确')
  }
  return result.data
}

function requireSequenceChartsDocumentWriteResult(response, expectedRows = []) {
  const result = requireSuccessResult(response, '保存事序图')
  if (
    result.fileName !== 'sequence-charts.json' ||
    result.documentType !== 'sequence_charts' ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error('保存事序图失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存事序图失败：数据库没有记录本次写入')
  }
  if (result.itemCount !== expectedRows.length) {
    throw new Error('保存事序图失败：接口返回的事序图数量不匹配')
  }
  return result
}

function requireCharactersRowsResult(response) {
  const result = requireSuccessResult(response, '读取人物谱')
  if (!Array.isArray(result.data)) {
    throw new Error('读取人物谱失败：接口返回格式不正确')
  }
  return result.data
}

function requireStudioGraphRowsResult(response, label) {
  const result = requireSuccessResult(response, label)
  if (!Array.isArray(result.data)) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return result.data
}

function requireMapRowsResult(response) {
  const result = requireSuccessResult(response, '读取地图')
  if (!Array.isArray(result.data)) {
    throw new Error('读取地图失败：接口返回格式不正确')
  }
  return result.data
}

function requireMapWriteResult(response, expected = {}) {
  const label = expected.label || '保存地图'
  const result = requireSuccessResult(response, label)
  const mapName = expected.mapName || String(result.mapName || '').trim()
  const hasDataDocument = Boolean(expected.requireDataDocument)
  if (
    result.mapName !== mapName ||
    result.assetType !== 'map' ||
    result.fileName !== `${mapName}.png` ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.bookPath !== 'string' ||
    !result.bookPath.trim() ||
    result.databaseSync?.success !== true ||
    result.databaseSync.documentType !== `map:${mapName}` ||
    typeof result.databaseSync.documentPath !== 'string' ||
    !result.databaseSync.documentPath.trim()
  ) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  if (
    hasDataDocument &&
    (result.dataDatabaseSync?.success !== true ||
      result.dataDatabaseSync.documentType !== `map_data:${mapName}` ||
      typeof result.dataDatabaseSync.documentPath !== 'string' ||
      !result.dataDatabaseSync.documentPath.trim())
  ) {
    throw new Error(`${label}失败：数据库没有记录地图画板数据`)
  }
  return result
}

function requireMapDeleteResult(response, expected = {}) {
  const result = requireSuccessResult(response, '删除地图')
  if (
    result.mapName !== expected.mapName ||
    result.assetType !== 'map' ||
    !Array.isArray(result.deletedFiles) ||
    result.existed !== true
  ) {
    throw new Error('删除地图失败：接口返回格式不正确')
  }
  return result
}

function requireMapDataResult(response) {
  if (response == null) return null
  if (typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('读取地图画板数据失败：接口返回格式不正确')
  }
  if (response.success === false) {
    throw new Error(response.message || response.error || '读取地图画板数据失败')
  }
  if (response.success === true) {
    const data = response.data
    if (data == null) return null
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('读取地图画板数据失败：接口返回格式不正确')
    }
    return data
  }
  return response
}

function requireStudioGraphDataResult(response, label) {
  const result = requireSuccessResult(response, label)
  const data = result.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.lines)) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return data
}

function requireStudioGraphWriteResult(response, expected = {}) {
  const label = expected.label || '保存图谱'
  const result = requireSuccessResult(response, label)
  const documentType = `${expected.assetType}_graph:${expected.graphName}`
  if (
    result.graphName !== expected.graphName ||
    result.assetType !== expected.assetType ||
    result.collection !== expected.collection ||
    result.fileName !== `${expected.graphName}.json` ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.graphPath !== 'string' ||
    !result.graphPath.trim() ||
    Number(result.nodeCount) !== expected.nodeCount ||
    Number(result.lineCount) !== expected.lineCount
  ) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  if (
    result.databaseSync?.success !== true ||
    result.databaseSync.documentType !== documentType ||
    typeof result.databaseSync.documentPath !== 'string' ||
    !result.databaseSync.documentPath.trim()
  ) {
    throw new Error(`${label}失败：数据库没有记录本次写入`)
  }
  return result
}

function requireStudioGraphDeleteResult(response, expected = {}) {
  const label = expected.label || '删除图谱'
  const result = requireSuccessResult(response, label)
  if (
    result.graphName !== expected.graphName ||
    result.assetType !== expected.assetType ||
    result.collection !== expected.collection ||
    !Array.isArray(result.deletedFiles) ||
    result.existed !== true
  ) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return result
}

function requireStudioGraphImageResult(response, label) {
  if (typeof response === 'string' && response.trim()) return response
  if (response?.success === true && typeof response.data === 'string' && response.data.trim()) {
    return response.data
  }
  if (response?.success === false) {
    throw new Error(response.message || response.error || `${label}失败`)
  }
  throw new Error(`${label}失败：接口返回格式不正确`)
}

function requireStudioGraphThumbnailResult(response, expected = {}) {
  const label = expected.label || '保存图谱缩略图'
  const result = requireSuccessResult(response, label)
  if (
    result.graphName !== expected.graphName ||
    result.assetType !== expected.assetType ||
    result.collection !== expected.collection ||
    result.fileName !== `${expected.graphName}.png` ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.thumbnailPath !== 'string' ||
    !result.thumbnailPath.trim() ||
    typeof result.bookPath !== 'string' ||
    !result.bookPath.trim()
  ) {
    throw new Error(`${label}失败：接口返回格式不正确`)
  }
  return result
}

function requireOrganizationNoteExportResult(response, expected = {}) {
  const result = requireSuccessResult(response, '导出势力图到笔记')
  if (
    result.bookName !== expected.bookName ||
    result.notebookName !== '组织架构' ||
    result.noteName !== expected.noteName ||
    result.fileName !== `${expected.noteName}.txt` ||
    typeof result.notePath !== 'string' ||
    !result.notePath.trim() ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.bookPath !== 'string' ||
    !result.bookPath.trim() ||
    typeof result.notebookPath !== 'string' ||
    !result.notebookPath.trim()
  ) {
    throw new Error('导出势力图到笔记失败：接口返回格式不正确')
  }
  return result
}

function requireEntityProfilesResult(response) {
  const result = requireSuccessResult(response, '读取扩展档案')
  const data = result.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('读取扩展档案失败：接口返回格式不正确')
  }
  const next = {}
  for (const key of ['mount', 'monster', 'spirit_beast', 'artifact']) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !Array.isArray(data[key])) {
      throw new Error('读取扩展档案失败：接口返回格式不正确')
    }
    next[key] = Array.isArray(data[key]) ? data[key] : []
  }
  return next
}

function requireProfileDocumentWriteResult(response, expected = {}) {
  const result = requireSuccessResult(response, expected.label || '保存档案')
  if (
    result.fileName !== expected.fileName ||
    result.documentType !== expected.documentType ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error(`${expected.label || '保存档案'}失败：接口返回格式不正确`)
  }
  if (result.databaseSync?.success !== true) {
    throw new Error(`${expected.label || '保存档案'}失败：数据库没有记录本次写入`)
  }
  if (Number.isInteger(expected.itemCount) && result.itemCount !== expected.itemCount) {
    throw new Error(`${expected.label || '保存档案'}失败：接口返回的条目数量不匹配`)
  }
  return result
}

function requireDictionaryDocumentWriteResult(response, expectedRows = []) {
  const result = requireSuccessResult(response, '保存词典')
  if (
    result.fileName !== 'dictionary.json' ||
    result.documentType !== 'dictionary' ||
    typeof result.path !== 'string' ||
    !result.path.trim() ||
    typeof result.documentPath !== 'string' ||
    !result.documentPath.trim()
  ) {
    throw new Error('保存词典失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存词典失败：数据库未记录词条快照')
  }
  if (result.itemCount !== expectedRows.length) {
    throw new Error('保存词典失败：接口返回的词条数量不匹配')
  }
  return result
}

function normalizeReadPath(path = '') {
  return String(path || '').replace(/\\/g, '/')
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim()
}

function safeDocumentName(value, fallback = '未命名') {
  const name = String(value || fallback).trim() || fallback
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function requireNotesRowsResult(response) {
  const result = requireSuccessResult(response, '读取笔记')
  if (!Array.isArray(result.notes)) {
    throw new Error('读取笔记失败：接口返回格式不正确')
  }
  return result.notes
}

function requireNoteChildrenRows(notebook = {}) {
  if (!Array.isArray(notebook.children)) {
    throw new Error('读取笔记失败：笔记本目录格式不正确')
  }
  return notebook.children
}

function requireCreatedNotebookResult(response) {
  const result = requireSuccessResult(response, '创建笔记本')
  const notebookName = String(result.notebookName || result.name || '').trim()
  if (!notebookName) {
    throw new Error('创建笔记本失败：接口没有返回笔记本名称')
  }
  return notebookName
}

function requireRenamedNotebookResult(response, notebookName) {
  const result = requireSuccessResult(response, '重命名笔记本')
  if (!sameText(result.notebookName || result.newName, notebookName)) {
    throw new Error('重命名笔记本失败：接口返回的笔记本不匹配')
  }
  return result
}

function requireCreatedNoteResult(response, noteName) {
  const result = requireSuccessResult(response, '创建笔记')
  if (!sameText(result.noteName || result.name, noteName)) {
    throw new Error('创建笔记失败：接口返回的笔记名称不匹配')
  }
  if (result.fileName !== `${noteName}.txt`) {
    throw new Error('创建笔记失败：接口返回的文件名不匹配')
  }
  return result
}

function requireReadNoteResult(response, expected = {}) {
  const result = requireSuccessResult(response, '读取笔记')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedNotebookName = String(expected.notebookName || '').trim()
  const expectedNoteName = String(expected.noteName || '').trim()
  if (
    result.bookName !== expectedBookName ||
    result.notebookName !== expectedNotebookName ||
    result.noteName !== expectedNoteName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(
      `/${expectedBookName}/笔记/${expectedNotebookName}/`
    ) ||
    typeof result.content !== 'string'
  ) {
    throw new Error('读取笔记失败：接口返回格式不正确')
  }
  return result
}

function requireEditedNoteResult(response, expected = {}) {
  const result = requireSuccessResult(response, '写入笔记')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedNotebookName = String(expected.notebookName || '').trim()
  const expectedNoteName = String(expected.noteName || '').trim()
  const expectedContent = String(expected.content || '')
  const savedName = String(result.noteName || result.name || '').trim()
  if (
    result.bookName !== expectedBookName ||
    result.notebookName !== expectedNotebookName ||
    savedName !== expectedNoteName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(
      `/${expectedBookName}/笔记/${expectedNotebookName}/`
    ) ||
    result.contentLength !== expectedContent.length
  ) {
    throw new Error('写入笔记失败：接口返回格式不正确')
  }
  return result
}

function requireReadChapterContentResult(response, expected = {}) {
  const result = requireSuccessResult(response, '读取章节')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const expectedChapterName = String(expected.chapterName || '').trim()
  if (
    result.bookName !== expectedBookName ||
    result.volumeName !== expectedVolumeName ||
    result.chapterName !== expectedChapterName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(
      `/${expectedBookName}/正文/${expectedVolumeName}/`
    ) ||
    typeof result.content !== 'string' ||
    !Number.isFinite(Number(result.wordCount))
  ) {
    throw new Error('读取章节失败：接口返回格式不正确')
  }
  return result
}

function requireChapterExistsResult(response, expected = {}) {
  const result = requireSuccessResult(response, '检查章节是否存在')
  if (typeof result.exists !== 'boolean') {
    throw new Error('检查章节是否存在失败：接口返回格式不正确')
  }
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const expectedChapterName = String(expected.chapterName || '').trim()
  if (result.bookName && result.bookName !== expectedBookName) {
    throw new Error('检查章节是否存在失败：接口返回的作品不匹配')
  }
  if (result.volumeName && result.volumeName !== expectedVolumeName) {
    throw new Error('检查章节是否存在失败：接口返回的卷不匹配')
  }
  if (result.chapterName && result.chapterName !== expectedChapterName) {
    throw new Error('检查章节是否存在失败：接口返回的章节不匹配')
  }
  return result
}

function requireOutlineChapterUpsertResult(response, expected = {}) {
  const result = requireSuccessResult(response, '写入章节')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const expectedChapterName = String(expected.chapterName || '').trim()
  const expectedWordCount = String(expected.content || '').replace(/[\s\n\r\t]/g, '').length
  if (
    result.bookName !== expectedBookName ||
    result.volumeName !== expectedVolumeName ||
    result.chapterName !== expectedChapterName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(
      `/${expectedBookName}/正文/${expectedVolumeName}/`
    ) ||
    !Number.isFinite(Number(result.wordCount)) ||
    Number(result.wordCount) !== expectedWordCount
  ) {
    throw new Error('写入章节失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('写入章节失败：数据库未记录章节')
  }
  if (result.databaseSync.chapterName && result.databaseSync.chapterName !== expectedChapterName) {
    throw new Error('写入章节失败：数据库记录的章节不匹配')
  }
  return result
}

function requireCreatedChapterDocumentResult(response, expected = {}) {
  const result = requireSuccessResult(response, '创建章节')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const chapterName = String(result.chapterName || '').trim()
  if (
    !chapterName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(`/${expectedBookName}/正文/${expectedVolumeName}/`)
  ) {
    throw new Error('创建章节失败：接口返回格式不正确')
  }
  return { ...result, chapterName }
}

function requireSavedChapterDocumentResult(response, expected = {}) {
  const result = requireSuccessResult(response, '保存章节')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const expectedChapterName = String(expected.chapterName || '').trim()
  const expectedContent = String(expected.content || '')
  const chapterName = String(result.chapterName || result.name || '').trim()
  if (
    result.bookName !== expectedBookName ||
    result.volumeName !== expectedVolumeName ||
    chapterName !== expectedChapterName ||
    typeof result.filePath !== 'string' ||
    !normalizeReadPath(result.filePath).includes(
      `/${expectedBookName}/正文/${expectedVolumeName}/`
    ) ||
    !Number.isFinite(Number(result.wordCount)) ||
    Number(result.wordCount) !== expectedContent.replace(/[\s\n\r\t]/g, '').length
  ) {
    throw new Error('保存章节失败：接口返回格式不正确')
  }
  if (result.databaseSync?.success !== true) {
    throw new Error('保存章节失败：数据库未记录章节')
  }
  if (result.databaseSync.chapterName && result.databaseSync.chapterName !== expectedChapterName) {
    throw new Error('保存章节失败：数据库记录的章节不匹配')
  }
  return { ...result, chapterName }
}

function normalizeBannedWords(words) {
  const seen = new Set()
  return words
    .map((word) => String(word || '').trim())
    .filter((word) => {
      if (!word || seen.has(word)) return false
      seen.add(word)
      return true
    })
}

function requireBannedWordsResult(response, expected = {}) {
  const result = requireSuccessResult(response, expected.label || '读取禁词')
  const words = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.words)
      ? result.words
      : null
  if (!words) {
    throw new Error(`${expected.label || '读取禁词'}失败：接口返回格式不正确`)
  }
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedWord = String(expected.word || '').trim()
  if (expectedBookName && result.bookName && result.bookName !== expectedBookName) {
    throw new Error(`${expected.label || '禁词操作'}失败：接口返回的作品不匹配`)
  }
  if (expectedWord && result.word && result.word !== expectedWord) {
    throw new Error(`${expected.label || '禁词操作'}失败：接口返回的禁词不匹配`)
  }
  return normalizeBannedWords(words)
}

function normalizeChapterReformatSettings(rawSettings = {}) {
  return {
    chapterFormat: rawSettings.chapterFormat === 'hanzi' ? 'hanzi' : 'number',
    suffixType: rawSettings.suffixType || '章'
  }
}

function requireChapterSettingsUpdateResult(result, expected = {}) {
  const response = requireSuccessResult(result, '保存章节格式')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedSettings = normalizeChapterSettings(expected.settings || {})
  if (expectedBookName && response.bookName !== expectedBookName) {
    throw new Error('保存章节格式失败：接口返回的作品不匹配')
  }
  if (!Number.isFinite(Number(response.totalRenamed))) {
    throw new Error('保存章节格式失败：接口返回格式不正确')
  }
  if (
    !response.settings ||
    typeof response.settings !== 'object' ||
    Array.isArray(response.settings) ||
    !Object.prototype.hasOwnProperty.call(response.settings, 'chapterFormat') ||
    !Object.prototype.hasOwnProperty.call(response.settings, 'suffixType') ||
    !Object.prototype.hasOwnProperty.call(response.settings, 'targetWords')
  ) {
    throw new Error('保存章节格式失败：接口返回格式不正确')
  }
  const savedSettings = normalizeChapterSettings(response.settings)
  if (
    savedSettings.chapterFormat !== expectedSettings.chapterFormat ||
    savedSettings.suffixType !== expectedSettings.suffixType ||
    savedSettings.targetWords !== expectedSettings.targetWords
  ) {
    throw new Error('保存章节格式失败：接口返回的设置不匹配')
  }
  return {
    ...response,
    settings: savedSettings
  }
}

function requireReformatChapterNumbersResult(result, expected = {}) {
  const response = requireSuccessResult(result, '重新格式化章节编号')
  const expectedBookName = String(expected.bookName || '').trim()
  const expectedVolumeName = String(expected.volumeName || '').trim()
  const expectedSettings = normalizeChapterReformatSettings(expected.settings || {})
  if (expectedBookName && response.bookName !== expectedBookName) {
    throw new Error('重新格式化章节编号失败：接口返回的作品不匹配')
  }
  if (expectedVolumeName && response.volumeName !== expectedVolumeName) {
    throw new Error('重新格式化章节编号失败：接口返回的卷不匹配')
  }
  if (!String(response.message || '').trim() || !Number.isFinite(Number(response.totalRenamed))) {
    throw new Error('重新格式化章节编号失败：接口返回格式不正确')
  }
  if (
    !response.settings ||
    typeof response.settings !== 'object' ||
    Array.isArray(response.settings) ||
    !Object.prototype.hasOwnProperty.call(response.settings, 'chapterFormat') ||
    !Object.prototype.hasOwnProperty.call(response.settings, 'suffixType')
  ) {
    throw new Error('重新格式化章节编号失败：接口返回格式不正确')
  }
  const savedSettings = normalizeChapterReformatSettings(response.settings)
  if (
    savedSettings.chapterFormat !== expectedSettings.chapterFormat ||
    savedSettings.suffixType !== expectedSettings.suffixType
  ) {
    throw new Error('重新格式化章节编号失败：接口返回的设置不匹配')
  }
  return {
    ...response,
    settings: savedSettings
  }
}

function normalizeProvider(provider = {}) {
  const providerId = provider.id || provider.provider || provider.name || 'custom_text'
  const providerName = provider.provider || provider.name || provider.apiType || 'custom'
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
    defaultFor: provider.defaultFor || '',
    raw: provider
  }))
}

function fallbackDeepSeekBinding() {
  return {
    id: 'deepseek::deepseek-chat',
    provider: 'deepseek',
    providerId: 'deepseek',
    providerName: 'deepseek',
    providerDisplayName: 'DeepSeek',
    modelName: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    enabled: true,
    defaultFor: '',
    legacy: true
  }
}

async function getLegacyDeepSeekBinding() {
  const apiKey = String(await getStoreValue('deepseek.apiKey', ''))
  return apiKey.trim() ? fallbackDeepSeekBinding() : null
}

export async function listModelBindings() {
  const response = await getAiProviders()
  if (response?.success !== true) {
    throw new Error(response?.message || '读取 Provider 失败')
  }
  if (!Array.isArray(response.providers)) {
    throw new Error('读取 Provider 失败：接口返回格式不正确')
  }
  const providers = response.providers
  const bindings = providers
    .filter((provider) => (provider.category || provider.type || 'text') === 'text')
    .flatMap(normalizeProvider)
    .filter((binding) => binding.enabled)

  const active = await getActiveTextProvider()
  const rows = bindings.length ? bindings : []
  const legacy = await getLegacyDeepSeekBinding()
  const hasDeepSeek = rows.some((item) => item.id === 'deepseek::deepseek-chat')
  return {
    success: true,
    bindings: (legacy && !hasDeepSeek ? [...rows, legacy] : rows).map((binding) => ({
      ...binding,
      defaultFor: binding.providerId === active?.providerId ? 'writing' : binding.defaultFor
    }))
  }
}

export async function updateModelDefaults(payload = {}) {
  const task = String(payload.task || 'writing')
  const modelId = String(payload.modelId || '')
  const storedDefaults = await getStoreValue('editorModelDefaults', {})
  const defaults =
    storedDefaults && typeof storedDefaults === 'object' && !Array.isArray(storedDefaults)
      ? storedDefaults
      : {}
  const nextDefaults = { ...defaults, [task]: modelId }
  await setStoreValue('editorModelDefaults', nextDefaults)
  let providerId = String(await getStoreValue('aiProviders.activeTextId', ''))
  if (task === 'writing' || task === 'chat') {
    providerId = modelId.split('::')[0] || modelId
    await setStoreValue('aiProviders.activeTextId', providerId)
  }
  return requireModelDefaultResult({
    success: true,
    task,
    modelId,
    defaults: nextDefaults,
    providerId
  })
}

export async function getSortOrder(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取章节排序失败：缺少作品名')
  }
  const response = await postJson('/api/sort-order/get', { bookName: targetBookName })
  return requireSortOrderValue(response)
}

export async function setSortOrder(bookName, order) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存章节排序失败：缺少作品名')
  }
  if (!['asc', 'desc'].includes(order)) {
    throw new Error('保存章节排序失败：排序方式无效')
  }
  return requireSuccessResult(
    await postJson('/api/sort-order/set', { bookName: targetBookName, order }),
    '保存章节排序'
  )
}

export async function getChapterSettings(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取章节设置失败：缺少作品名')
  }
  const response = await postJson('/api/chapter-settings/get', { bookName: targetBookName })
  return requireChapterSettingsResult(response)
}

export async function listBannedWords(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取禁词失败：缺少作品名')
  }
  const words = normalizeBannedWords(
    await getStoreValue(`bannedWords:${targetBookName}`, { words: [] })
  )
  const response = { success: true, data: words, words }
  return requireBannedWordsResult(response, {
    bookName: targetBookName,
    label: '读取禁词'
  })
}

export async function addBannedWord(bookName, word) {
  const targetBookName = String(bookName || '').trim()
  const targetWord = String(word || '').trim()
  if (!targetBookName) {
    throw new Error('添加禁词失败：缺少作品名')
  }
  if (!targetWord) {
    throw new Error('添加禁词失败：缺少禁词')
  }
  const current = await listBannedWords(targetBookName)
  if (current.words.includes(targetWord)) {
    throw new Error('该禁词已存在')
  }
  const words = [targetWord, ...current.words]
  await setStoreValue(`bannedWords:${targetBookName}`, { words })
  const response = { success: true, data: words, words }
  return requireBannedWordsResult(response, {
    bookName: targetBookName,
    word: targetWord,
    label: '添加禁词'
  })
}

export async function removeBannedWord(bookName, word) {
  const targetBookName = String(bookName || '').trim()
  const targetWord = String(word || '').trim()
  if (!targetBookName) {
    throw new Error('删除禁词失败：缺少作品名')
  }
  if (!targetWord) {
    throw new Error('删除禁词失败：缺少禁词')
  }
  const current = await listBannedWords(targetBookName)
  if (!current.words.includes(targetWord)) {
    throw new Error('禁词不存在')
  }
  const words = current.words.filter((item) => item !== targetWord)
  await setStoreValue(`bannedWords:${targetBookName}`, { words })
  const response = { success: true, data: words, words }
  return requireBannedWordsResult(response, {
    bookName: targetBookName,
    word: targetWord,
    label: '删除禁词'
  })
}

export async function readChapterContent(bookName, volumeName, chapterName) {
  const targetBookName = String(bookName || '').trim()
  const targetVolumeName = String(volumeName || '').trim()
  const targetChapterName = String(chapterName || '').trim()
  if (!targetBookName) {
    throw new Error('读取章节失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('读取章节失败：缺少卷名')
  }
  if (!targetChapterName) {
    throw new Error('读取章节失败：缺少章节名')
  }
  const response = await postJson('/api/chapters/read', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName
  })
  return requireReadChapterContentResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName
  })
}

export async function checkChapterExistsForOutline(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetVolumeName = String(payload.volumeName || '').trim()
  const targetChapterName = String(payload.chapterName || '').trim()
  if (!targetBookName) {
    throw new Error('检查章节是否存在失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('检查章节是否存在失败：缺少卷名')
  }
  if (!targetChapterName) {
    throw new Error('检查章节是否存在失败：缺少章节名')
  }
  const response = await postJson('/api/chapters/check-exists', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName
  })
  return requireChapterExistsResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName
  })
}

export async function upsertOutlineChapter(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetVolumeName = String(payload.volumeName || '').trim()
  const targetChapterName = String(payload.chapterName || '').trim()
  const content = String(payload.content || '').trim()
  if (!targetBookName) {
    throw new Error('写入章节失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('写入章节失败：缺少卷名')
  }
  if (!targetChapterName) {
    throw new Error('写入章节失败：缺少章节名')
  }
  if (!content) {
    throw new Error('写入章节失败：正文为空')
  }
  const response = await postJson('/api/chapters/upsert', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName,
    content,
    overwrite: payload.overwrite === true
  })
  return requireOutlineChapterUpsertResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName,
    content
  })
}

export async function upsertChapterDocument(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetVolumeName = String(payload.volumeName || '').trim()
  const targetChapterName = String(payload.chapterName || '').trim()
  const content = String(payload.content || '')
  if (!targetBookName) {
    throw new Error('写入章节失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('写入章节失败：缺少卷名')
  }
  if (!targetChapterName) {
    throw new Error('写入章节失败：缺少章节名')
  }
  const response = await postJson('/api/chapters/upsert', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName,
    content,
    overwrite: payload.overwrite === true
  })
  return requireOutlineChapterUpsertResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName,
    content
  })
}

export async function createChapterDocument(bookName, volumeName) {
  const targetBookName = String(bookName || '').trim()
  const targetVolumeName = String(volumeName || '').trim()
  if (!targetBookName) {
    throw new Error('创建章节失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('创建章节失败：缺少卷名')
  }
  const response = await postJson('/api/chapters/create', {
    bookName: targetBookName,
    volumeId: targetVolumeName
  })
  return requireCreatedChapterDocumentResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName
  })
}

export async function saveChapterDocument(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetVolumeName = String(payload.volumeName || '').trim()
  const targetChapterName = String(payload.chapterName || '').trim()
  const targetNewName = String(payload.newName || '').trim()
  const content = String(payload.content || '')
  const savedChapterName = targetNewName || targetChapterName
  if (!targetBookName) {
    throw new Error('保存章节失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('保存章节失败：缺少卷名')
  }
  if (!targetChapterName) {
    throw new Error('保存章节失败：缺少章节名')
  }
  const response = await postJson('/api/chapters/save', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: targetChapterName,
    newName: targetNewName || null,
    content
  })
  return requireSavedChapterDocumentResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    chapterName: savedChapterName,
    content
  })
}

export async function readOutlineDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取大纲失败：缺少作品名')
  }
  const response = await postJson('/api/studio/outlines/read', { bookName: targetBookName })
  return requireOutlineReadResult(response)
}

export async function writeOutlineDocument(bookName, payload = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存大纲失败：缺少作品名')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('保存大纲失败：大纲内容格式不正确')
  }
  if (payload.children !== undefined && !Array.isArray(payload.children)) {
    throw new Error('保存大纲失败：大纲内容格式不正确')
  }
  const response = await postJson('/api/studio/outlines/write', {
    bookName: targetBookName,
    data: payload
  })
  return requireOutlineWriteResult(response)
}

export async function readOutlineAiSessionsDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取 AI 大纲会话失败：缺少作品名')
  }
  const response = await postJson('/api/studio/outline-ai-sessions/read', {
    bookName: targetBookName
  })
  return requireOutlineAiSessionsReadResult(response)
}

export async function writeOutlineAiSessionsDocument(bookName, payload = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存 AI 大纲会话失败：缺少作品名')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('保存 AI 大纲会话失败：会话内容格式不正确')
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'nodes') &&
    (!payload.nodes || typeof payload.nodes !== 'object' || Array.isArray(payload.nodes))
  ) {
    throw new Error('保存 AI 大纲会话失败：会话内容格式不正确')
  }
  const response = await postJson('/api/studio/outline-ai-sessions/write', {
    bookName: targetBookName,
    data: payload
  })
  return requireOutlineAiSessionsWriteResult(response)
}

export async function listChapterTree(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取章节目录失败：缺少作品名')
  }
  const response = await postJson('/api/chapters/load', { bookName: targetBookName })
  return requireChapterTreeResult(response, {
    bookName: targetBookName
  })
}

export async function createVolumeDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('创建卷失败：缺少作品名')
  }
  return requireSuccessResult(
    await postJson('/api/volumes/create', { bookName: targetBookName }),
    '创建卷'
  )
}

export async function editChapterNode(bookName, payload = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('重命名节点失败：缺少作品名')
  }
  return requireSuccessResult(
    await postJson('/api/nodes/edit', { bookName: targetBookName, ...payload }),
    '重命名节点'
  )
}

export async function deleteChapterNode(bookName, payload = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('删除节点失败：缺少作品名')
  }
  return requireSuccessResult(
    await postJson('/api/nodes/delete', { bookName: targetBookName, ...payload }),
    '删除节点'
  )
}

export async function listNoteTree(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取笔记失败：缺少作品名')
  }
  const response = await postJson('/api/notes/load', { bookName: targetBookName })
  return requireNotesRowsResult(response)
}

export async function createNotebookDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('创建笔记本失败：缺少作品名')
  }
  const response = await postJson('/api/notebooks/create', { bookName: targetBookName })
  const notebookName = requireCreatedNotebookResult(response)
  return { ...response, notebookName }
}

export async function createNoteDocument(bookName, notebookName, noteName = '') {
  const targetBookName = String(bookName || '').trim()
  const targetNotebookName = String(notebookName || '').trim()
  if (!targetBookName) {
    throw new Error('创建笔记失败：缺少作品名')
  }
  if (!targetNotebookName) {
    throw new Error('创建笔记失败：缺少笔记本名称')
  }
  const response = await postJson('/api/notes/create', {
    bookName: targetBookName,
    notebookName: targetNotebookName,
    ...(String(noteName || '').trim() ? { noteName: String(noteName).trim() } : {})
  })
  return requireSuccessResult(response, '创建笔记')
}

export async function renameNotebookDocument(bookName, oldName, newName) {
  const response = await postJson('/api/notebooks/rename', { bookName, oldName, newName })
  return requireSuccessResult(response, '重命名笔记本')
}

export async function renameNoteDocument(bookName, notebookName, oldName, newName) {
  const response = await postJson('/api/notes/rename', {
    bookName,
    notebookName,
    oldName,
    newName
  })
  return requireSuccessResult(response, '重命名笔记')
}

export async function deleteNotebookDocument(bookName, notebookName) {
  return requireSuccessResult(
    await postJson('/api/notebooks/delete', { bookName, notebookName }),
    '删除笔记本'
  )
}

export async function deleteNoteDocument(bookName, notebookName, noteName) {
  return requireSuccessResult(
    await postJson('/api/notes/delete', { bookName, notebookName, noteName }),
    '删除笔记'
  )
}

export async function ensureNotebookDocument(bookName, notebookName) {
  const targetBookName = String(bookName || '').trim()
  const targetNotebookName = String(notebookName || '').trim()
  if (!targetBookName) {
    throw new Error('创建笔记本失败：缺少作品名')
  }
  if (!targetNotebookName) {
    throw new Error('创建笔记本失败：缺少笔记本名称')
  }
  const notes = await listNoteTree(targetBookName)
  if (notes.some((item) => sameText(item?.name || item?.id, targetNotebookName))) {
    return { notebookName: targetNotebookName, created: false, renamed: false }
  }
  const createdName = requireCreatedNotebookResult(await createNotebookDocument(targetBookName))
  if (!sameText(createdName, targetNotebookName)) {
    await requireRenamedNotebookResult(
      await renameNotebookDocument(targetBookName, createdName, targetNotebookName),
      targetNotebookName
    )
    return { notebookName: targetNotebookName, created: true, renamed: true }
  }
  return { notebookName: createdName, created: true, renamed: false }
}

export async function ensureNoteDocument(bookName, notebookName, noteName) {
  const targetBookName = String(bookName || '').trim()
  const targetNotebookName = String(notebookName || '').trim()
  const targetNoteName = String(noteName || '').trim()
  if (!targetBookName) {
    throw new Error('创建笔记失败：缺少作品名')
  }
  if (!targetNotebookName) {
    throw new Error('创建笔记失败：缺少笔记本名称')
  }
  if (!targetNoteName) {
    throw new Error('创建笔记失败：缺少笔记名称')
  }
  const notes = await listNoteTree(targetBookName)
  const notebook = notes.find((item) => sameText(item?.name || item?.id, targetNotebookName))
  if (!notebook) {
    throw new Error('读取笔记失败：未找到目标笔记本')
  }
  const rows = requireNoteChildrenRows(notebook)
  if (rows.some((item) => sameText(item?.name || item?.id, targetNoteName))) {
    return { notebookName: targetNotebookName, noteName: targetNoteName, created: false }
  }
  await requireCreatedNoteResult(
    await createNoteDocument(targetBookName, targetNotebookName, targetNoteName),
    targetNoteName
  )
  return { notebookName: targetNotebookName, noteName: targetNoteName, created: true }
}

export async function readNoteDocument(bookName, notebookName, noteName) {
  const targetBookName = String(bookName || '').trim()
  const targetNotebookName = String(notebookName || '').trim()
  const targetNoteName = String(noteName || '').trim()
  if (!targetBookName) {
    throw new Error('读取笔记失败：缺少作品名')
  }
  if (!targetNotebookName) {
    throw new Error('读取笔记失败：缺少笔记本名称')
  }
  if (!targetNoteName) {
    throw new Error('读取笔记失败：缺少笔记名称')
  }
  const response = await postJson('/api/notes/read', {
    bookName: targetBookName,
    notebookName: targetNotebookName,
    noteName: targetNoteName
  })
  return requireReadNoteResult(response, {
    bookName: targetBookName,
    notebookName: targetNotebookName,
    noteName: targetNoteName
  })
}

export async function writeNoteDocument(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetNotebookName = String(payload.notebookName || '').trim()
  const targetNoteName = String(payload.noteName || '').trim()
  const content = String(payload.content || '')
  if (!targetBookName) {
    throw new Error('写入笔记失败：缺少作品名')
  }
  if (!targetNotebookName) {
    throw new Error('写入笔记失败：缺少笔记本名称')
  }
  if (!targetNoteName) {
    throw new Error('写入笔记失败：缺少笔记名称')
  }
  const response = await postJson('/api/notes/edit', {
    bookName: targetBookName,
    notebookName: targetNotebookName,
    noteName: targetNoteName,
    content
  })
  return requireEditedNoteResult(response, {
    bookName: targetBookName,
    notebookName: targetNotebookName,
    noteName: targetNoteName,
    content
  })
}

export async function readSettingsDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取设定失败：缺少作品名')
  }
  const response = await postJson('/api/studio/settings/read', { bookName: targetBookName })
  return requireSettingsReadResult(response)
}

export async function writeSettingsDocument(bookName, payload = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存设定失败：缺少作品名')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('保存设定失败：设定内容格式不正确')
  }
  if (!Array.isArray(payload.categories)) {
    throw new Error('保存设定失败：设定分类格式不正确')
  }
  const response = await postJson('/api/studio/settings/write', {
    bookName: targetBookName,
    data: payload
  })
  return requireSettingsDocumentWriteResult(response, payload.categories)
}

export async function readDictionaryDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取词典失败：缺少作品名')
  }
  const response = await postJson('/api/studio/dictionary/read', { bookName: targetBookName })
  return requireDictionaryRowsResult(response)
}

export async function readTimelineDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取时间线失败：缺少作品名')
  }
  const response = await postJson('/api/studio/timeline/read', { bookName: targetBookName })
  return requireTimelineRowsResult(response)
}

export async function writeTimelineDocument(bookName, rows = []) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存时间线失败：缺少作品名')
  }
  if (!Array.isArray(rows)) {
    throw new Error('保存时间线失败：时间线内容格式不正确')
  }
  const response = await postJson('/api/studio/timeline/write', {
    bookName: targetBookName,
    data: rows
  })
  return requireTimelineDocumentWriteResult(response, rows)
}

export async function readSequenceChartsDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取事序图失败：缺少作品名')
  }
  const response = await postJson('/api/studio/sequences/read', { bookName: targetBookName })
  return requireSequenceChartsRowsResult(response)
}

export async function writeSequenceChartsDocument(bookName, rows = []) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存事序图失败：缺少作品名')
  }
  if (!Array.isArray(rows)) {
    throw new Error('保存事序图失败：事序图内容格式不正确')
  }
  const response = await postJson('/api/studio/sequences/write', {
    bookName: targetBookName,
    data: rows
  })
  return requireSequenceChartsDocumentWriteResult(response, rows)
}

export async function readCharactersDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取人物谱失败：缺少作品名')
  }
  const response = await postJson('/api/studio/characters/read', { bookName: targetBookName })
  return requireCharactersRowsResult(response)
}

export async function writeCharactersDocument(bookName, rows = []) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存人物谱失败：缺少作品名')
  }
  if (!Array.isArray(rows)) {
    throw new Error('保存人物谱失败：人物谱内容格式不正确')
  }
  const response = await postJson('/api/studio/characters/write', {
    bookName: targetBookName,
    data: rows
  })
  return requireProfileDocumentWriteResult(response, {
    fileName: 'characters.json',
    documentType: 'characters',
    itemCount: rows.length,
    label: '保存人物谱'
  })
}

export async function readMapDocuments(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取地图失败：缺少作品名')
  }
  const response = await postJson('/api/studio/maps/list', { bookName: targetBookName })
  return requireMapRowsResult(response)
}

export async function createMapDocument(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetMapName = String(payload.mapName || '').trim()
  const imageData = String(payload.imageData || '').trim()
  if (!targetBookName) {
    throw new Error('创建地图失败：缺少作品名')
  }
  if (!targetMapName) {
    throw new Error('创建地图失败：缺少地图名')
  }
  if (!imageData) {
    throw new Error('创建地图失败：缺少图片数据')
  }
  const response = await postJson('/api/studio/maps/create', {
    bookName: targetBookName,
    mapName: targetMapName,
    description: String(payload.description || ''),
    imageData
  })
  return requireMapWriteResult(response, {
    mapName: safeDocumentName(targetMapName, '新地图'),
    label: '创建地图'
  })
}

export async function updateMapDocument(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetMapName = String(payload.mapName || '').trim()
  const imageData = String(payload.imageData || '').trim()
  if (!targetBookName) {
    throw new Error('保存地图失败：缺少作品名')
  }
  if (!targetMapName) {
    throw new Error('保存地图失败：缺少地图名')
  }
  if (!imageData) {
    throw new Error('保存地图失败：缺少图片数据')
  }
  const response = await postJson('/api/studio/maps/update', {
    bookName: targetBookName,
    mapName: targetMapName,
    imageData,
    mapData: payload.mapData
  })
  return requireMapWriteResult(response, {
    mapName: safeDocumentName(targetMapName, '新地图'),
    requireDataDocument: true,
    label: '保存地图'
  })
}

export async function readMapDataDocument(bookName, mapName) {
  const targetBookName = String(bookName || '').trim()
  const targetMapName = String(mapName || '').trim()
  if (!targetBookName) {
    throw new Error('读取地图画板数据失败：缺少作品名')
  }
  if (!targetMapName) {
    throw new Error('读取地图画板数据失败：缺少地图名')
  }
  const response = await postJson('/api/studio/maps/data/load', {
    bookName: targetBookName,
    mapName: targetMapName
  })
  return requireMapDataResult(response)
}

export async function deleteMapDocument(bookName, mapName) {
  const targetBookName = String(bookName || '').trim()
  const targetMapName = String(mapName || '').trim()
  if (!targetBookName) {
    throw new Error('删除地图失败：缺少作品名')
  }
  if (!targetMapName) {
    throw new Error('删除地图失败：缺少地图名')
  }
  const response = await postJson('/api/studio/maps/delete', {
    bookName: targetBookName,
    mapName: targetMapName
  })
  return requireMapDeleteResult(response, {
    mapName: safeDocumentName(targetMapName, '新地图')
  })
}

export async function readRelationshipGraphs(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取关系图失败：缺少作品名')
  }
  const response = await postJson('/api/studio/relationships/list', {
    bookName: targetBookName
  })
  return requireStudioGraphRowsResult(response, '读取关系图')
}

export async function readRelationshipGraphData(bookName, graphName) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('读取关系图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('读取关系图失败：缺少图谱名')
  }
  const response = await postJson('/api/studio/relationships/read', {
    bookName: targetBookName,
    relationshipName: targetGraphName
  })
  return requireStudioGraphDataResult(response, '读取关系图')
}

export async function createRelationshipGraph(bookName, graphName, graphData = {}) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('创建关系图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('创建关系图失败：缺少图谱名')
  }
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) {
    throw new Error('创建关系图失败：图谱内容格式不正确')
  }
  const response = await postJson('/api/studio/relationships/create', {
    bookName: targetBookName,
    relationshipName: targetGraphName,
    relationshipData: graphData
  })
  return requireStudioGraphWriteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'relationship',
    collection: 'relationships',
    nodeCount: Array.isArray(graphData.nodes) ? graphData.nodes.length : 0,
    lineCount: Array.isArray(graphData.lines) ? graphData.lines.length : 0,
    label: '创建关系图'
  })
}

export async function writeRelationshipGraphData(bookName, graphName, graphData = {}) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('保存关系图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('保存关系图失败：缺少图谱名')
  }
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) {
    throw new Error('保存关系图失败：图谱内容格式不正确')
  }
  const response = await postJson('/api/studio/relationships/write', {
    bookName: targetBookName,
    relationshipName: targetGraphName,
    relationshipData: graphData
  })
  return requireStudioGraphWriteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'relationship',
    collection: 'relationships',
    nodeCount: Array.isArray(graphData.nodes) ? graphData.nodes.length : 0,
    lineCount: Array.isArray(graphData.lines) ? graphData.lines.length : 0,
    label: '保存关系图'
  })
}

export async function writeRelationshipGraphThumbnail(bookName, graphName, thumbnailData) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('保存关系图缩略图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('保存关系图缩略图失败：缺少图谱名')
  }
  if (typeof thumbnailData !== 'string' || !thumbnailData.trim()) {
    throw new Error('保存关系图缩略图失败：缺少图片数据')
  }
  const response = await postJson('/api/studio/relationships/thumbnail', {
    bookName: targetBookName,
    relationshipName: targetGraphName,
    thumbnailData
  })
  return requireStudioGraphThumbnailResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'relationship',
    collection: 'relationships',
    label: '保存关系图缩略图'
  })
}

export async function readRelationshipGraphImage(bookName, imageName) {
  const targetBookName = String(bookName || '').trim()
  const targetImageName = String(imageName || '').trim()
  if (!targetBookName) {
    throw new Error('读取关系图缩略图失败：缺少作品名')
  }
  if (!targetImageName) {
    throw new Error('读取关系图缩略图失败：缺少图片名')
  }
  const response = await postJson('/api/studio/relationships/image', {
    bookName: targetBookName,
    imageName: targetImageName
  })
  return requireStudioGraphImageResult(response, '读取关系图缩略图')
}

export async function deleteRelationshipGraph(bookName, graphName) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('删除关系图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('删除关系图失败：缺少图谱名')
  }
  const response = await postJson('/api/studio/relationships/delete', {
    bookName: targetBookName,
    relationshipName: targetGraphName
  })
  return requireStudioGraphDeleteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'relationship',
    collection: 'relationships',
    label: '删除关系图'
  })
}

export async function readOrganizationGraphs(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取势力图失败：缺少作品名')
  }
  const response = await postJson('/api/studio/organizations/list', {
    bookName: targetBookName
  })
  return requireStudioGraphRowsResult(response, '读取势力图')
}

export async function readOrganizationGraphData(bookName, graphName) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('读取势力图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('读取势力图失败：缺少图谱名')
  }
  const response = await postJson('/api/studio/organizations/read', {
    bookName: targetBookName,
    organizationName: targetGraphName
  })
  return requireStudioGraphDataResult(response, '读取势力图')
}

export async function createOrganizationGraph(bookName, graphName, graphData = {}) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('创建势力图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('创建势力图失败：缺少图谱名')
  }
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) {
    throw new Error('创建势力图失败：图谱内容格式不正确')
  }
  const response = await postJson('/api/studio/organizations/create', {
    bookName: targetBookName,
    organizationName: targetGraphName,
    organizationData: graphData
  })
  return requireStudioGraphWriteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'organization',
    collection: 'organizations',
    nodeCount: Array.isArray(graphData.nodes) ? graphData.nodes.length : 0,
    lineCount: Array.isArray(graphData.lines) ? graphData.lines.length : 0,
    label: '创建势力图'
  })
}

export async function writeOrganizationGraphData(bookName, graphName, graphData = {}) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('保存势力图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('保存势力图失败：缺少图谱名')
  }
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) {
    throw new Error('保存势力图失败：图谱内容格式不正确')
  }
  const response = await postJson('/api/studio/organizations/write', {
    bookName: targetBookName,
    organizationName: targetGraphName,
    organizationData: graphData
  })
  return requireStudioGraphWriteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'organization',
    collection: 'organizations',
    nodeCount: Array.isArray(graphData.nodes) ? graphData.nodes.length : 0,
    lineCount: Array.isArray(graphData.lines) ? graphData.lines.length : 0,
    label: '保存势力图'
  })
}

export async function writeOrganizationGraphThumbnail(bookName, graphName, thumbnailData) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('保存势力图缩略图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('保存势力图缩略图失败：缺少图谱名')
  }
  if (typeof thumbnailData !== 'string' || !thumbnailData.trim()) {
    throw new Error('保存势力图缩略图失败：缺少图片数据')
  }
  const response = await postJson('/api/studio/organizations/thumbnail', {
    bookName: targetBookName,
    organizationId: targetGraphName,
    thumbnailData
  })
  return requireStudioGraphThumbnailResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'organization',
    collection: 'organizations',
    label: '保存势力图缩略图'
  })
}

export async function readOrganizationGraphImage(bookName, imageName) {
  const targetBookName = String(bookName || '').trim()
  const targetImageName = String(imageName || '').trim()
  if (!targetBookName) {
    throw new Error('读取势力图缩略图失败：缺少作品名')
  }
  if (!targetImageName) {
    throw new Error('读取势力图缩略图失败：缺少图片名')
  }
  const response = await postJson('/api/studio/organizations/image', {
    bookName: targetBookName,
    imageName: targetImageName
  })
  return requireStudioGraphImageResult(response, '读取势力图缩略图')
}

export async function deleteOrganizationGraph(bookName, graphName) {
  const targetBookName = String(bookName || '').trim()
  const targetGraphName = String(graphName || '').trim()
  if (!targetBookName) {
    throw new Error('删除势力图失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('删除势力图失败：缺少图谱名')
  }
  const response = await postJson('/api/studio/organizations/delete', {
    bookName: targetBookName,
    organizationName: targetGraphName
  })
  return requireStudioGraphDeleteResult(response, {
    graphName: safeDocumentName(targetGraphName),
    assetType: 'organization',
    collection: 'organizations',
    label: '删除势力图'
  })
}

export async function exportOrganizationGraphToNote(payload = {}) {
  const targetBookName = String(payload.bookName || '').trim()
  const targetGraphName = String(payload.organizationName || payload.graphName || '').trim()
  const content = String(payload.content || '')
  if (!targetBookName) {
    throw new Error('导出势力图到笔记失败：缺少作品名')
  }
  if (!targetGraphName) {
    throw new Error('导出势力图到笔记失败：缺少图谱名')
  }
  const response = await postJson('/api/organizations/export-note', {
    bookName: targetBookName,
    organizationName: targetGraphName,
    content
  })
  return requireOrganizationNoteExportResult(response, {
    bookName: targetBookName,
    noteName: safeDocumentName(targetGraphName)
  })
}

export async function readEntityProfilesDocument(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('读取扩展档案失败：缺少作品名')
  }
  const response = await postJson('/api/studio/entity-profiles/read', {
    bookName: targetBookName
  })
  return requireEntityProfilesResult(response)
}

export async function writeEntityProfileCategoryDocument(bookName, category, rows = []) {
  const targetBookName = String(bookName || '').trim()
  const targetCategory = String(category || '').trim()
  if (!targetBookName) {
    throw new Error('保存扩展档案失败：缺少作品名')
  }
  if (!['mount', 'monster', 'spirit_beast', 'artifact'].includes(targetCategory)) {
    throw new Error('保存扩展档案失败：档案分类不正确')
  }
  if (!Array.isArray(rows)) {
    throw new Error('保存扩展档案失败：档案内容格式不正确')
  }
  const response = await postJson('/api/studio/entity-profiles/write-category', {
    bookName: targetBookName,
    category: targetCategory,
    data: rows
  })
  return requireProfileDocumentWriteResult(response, {
    fileName: 'entity_profiles.json',
    documentType: 'entity_profiles',
    label: '保存扩展档案'
  })
}

export async function writeDictionaryDocument(bookName, rows = []) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存词典失败：缺少作品名')
  }
  if (!Array.isArray(rows)) {
    throw new Error('保存词典失败：词条内容格式不正确')
  }
  const response = await postJson('/api/studio/dictionary/write', {
    bookName: targetBookName,
    data: rows
  })
  return requireDictionaryDocumentWriteResult(response, rows)
}

export async function setChapterTargetWords(bookName, targetWords) {
  const numeric = Number(targetWords)
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存章节目标字数失败：缺少作品名')
  }
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('保存章节目标字数失败：目标字数无效')
  }
  const expectedTargetWords = Math.round(numeric)
  const response = await postJson('/api/chapter-settings/target-words', {
    bookName: targetBookName,
    targetWords: expectedTargetWords
  })
  return requireChapterTargetWordsResult(response, expectedTargetWords)
}

export async function updateChapterFormat(bookName, settings = {}) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('保存章节格式失败：缺少作品名')
  }
  const cleanSettings = normalizeChapterSettings(settings)
  const response = await postJson('/api/chapter-format/update', {
    bookName: targetBookName,
    settings: cleanSettings
  })
  return requireChapterSettingsUpdateResult(response, {
    bookName: targetBookName,
    settings: cleanSettings
  })
}

export async function reformatChapterNumbers(bookName, volumeName, settings = {}) {
  const targetBookName = String(bookName || '').trim()
  const targetVolumeName = String(volumeName || '').trim()
  if (!targetBookName) {
    throw new Error('重新格式化章节编号失败：缺少作品名')
  }
  if (!targetVolumeName) {
    throw new Error('重新格式化章节编号失败：缺少卷名')
  }
  const cleanSettings = normalizeChapterReformatSettings(settings)
  const response = await postJson('/api/chapter-numbers/reformat', {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    settings: cleanSettings
  })
  return requireReformatChapterNumbersResult(response, {
    bookName: targetBookName,
    volumeName: targetVolumeName,
    settings: cleanSettings
  })
}

export async function openEditorSession(payload = {}) {
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
  return requireObjectResult({ success: true, session }, 'session', '打开编辑器会话')
}

export async function updateEditorSessionContext(sessionId, contextOptions = {}) {
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
  return requireObjectResult({ success: true, session: next }, 'session', '更新编辑器会话')
}

export async function listAgentMessages(sessionId) {
  const messages = requireStoreArray(
    await getStoreValue('editorMessages', []),
    '读取编辑器消息失败'
  )
  return requireArrayResult(
    {
      success: true,
      messages: messages.filter((item) => item.sessionId === sessionId)
    },
    'messages',
    '读取编辑器消息'
  )
}

export async function appendAgentMessage(sessionId, message) {
  const messages = requireStoreArray(
    await getStoreValue('editorMessages', []),
    '读取编辑器消息失败'
  )
  const next = {
    id: message?.id || createRecordId('editor_message'),
    sessionId,
    role: message?.role || 'assistant',
    blocks: message?.blocks || [{ type: 'text', content: { text: message?.content || '' } }],
    title: message?.title || '',
    content: message?.content || '',
    modelId: message?.modelId || '',
    createdAt: message?.createdAt || new Date().toISOString()
  }
  await setStoreValue('editorMessages', [...messages, next].slice(-400))
  return requireObjectResult({ success: true, message: next }, 'message', '保存编辑器消息')
}

export async function generateAgentPreview(payload = {}) {
  void payload
  throw new Error('单次 Agent 生成已停用，请使用写作队列执行生成与审核')
}

export async function repairAgentResult(payload = {}) {
  void payload
  throw new Error('单次 Agent 返修已停用，请使用写作队列执行返修')
}

export async function cancelAgentGeneration(payload = {}) {
  void payload
  throw new Error('单次 Agent 生成已停用，请在写作队列中停止任务')
}

export async function listWritingSkills() {
  const response = await postJson('/api/editor-agent/writing-skills', {})
  return requireWritingSkillListResult(response)
}

export async function runWritingSkill(payload = {}) {
  const response = await postJson('/api/editor-agent/run-writing-skill', payload)
  return requireWritingSkillRunResult(response)
}

export async function enqueueAgentWriteTask(payload = {}) {
  const response = await postJson('/api/editor-agent/queue-write', payload)
  if (response?.success === true) {
    if (!response?.jobId || !response?.taskId) {
      throw new Error('提交写作队列失败：接口返回格式不正确')
    }
    return response
  }
  throw new Error(response.message || '提交写作队列失败')
}

export async function enqueueAgentRepairTask(payload = {}) {
  const response = await postJson('/api/editor-agent/queue-repair', payload)
  if (response?.success === true) {
    if (!response?.jobId || !response?.taskId) {
      throw new Error('提交返修队列失败：接口返回格式不正确')
    }
    return response
  }
  throw new Error(response.message || '提交返修队列失败')
}

export async function getAgentQueueStatus() {
  const response = await postJson('/api/editor-agent/queue-status', {})
  if (response?.success === true) {
    if (!response?.queueName || !response?.counts || typeof response.counts !== 'object') {
      throw new Error('读取写作队列状态失败：接口返回格式不正确')
    }
    return response
  }
  throw new Error(response.message || '读取写作队列状态失败')
}

export async function getAgentQueueJob(jobId) {
  const response = await postJson('/api/editor-agent/queue-job', { jobId })
  if (response?.success === true) {
    if (!('job' in (response || {}))) {
      throw new Error('读取写作队列任务失败：接口返回格式不正确')
    }
    return response
  }
  throw new Error(response.message || '读取写作队列任务失败')
}

export async function listAgentQueueJobs(payload = {}) {
  const response = await postJson('/api/editor-agent/queue-jobs', payload)
  if (response?.success === true) {
    if (!Array.isArray(response?.jobs)) {
      throw new Error('读取写作队列任务列表失败：接口返回格式不正确')
    }
    return response
  }
  throw new Error(response.message || '读取写作队列任务列表失败')
}

export async function cancelAgentQueueJob(payload = {}) {
  const response = await postJson('/api/editor-agent/queue-cancel', payload)
  if (response?.success === true) {
    if (
      !response?.jobId ||
      (response.cancelled !== true && response.cancellationRequested !== true)
    ) {
      throw new Error('停止写作队列任务失败：接口返回格式不正确')
    }
    if (String(response.jobId) !== String(payload.jobId || '')) {
      throw new Error('停止写作队列任务失败：接口返回的任务不匹配')
    }
    return response
  }
  throw new Error(response.message || '停止写作队列任务失败')
}

export async function runConsistencyCheck(payload = {}) {
  const response = await postJson('/api/consistency/check', payload)
  return requireConsistencyCheckResult(response)
}

export async function listConsistencyChecks(payload = {}) {
  const response = await postJson('/api/consistency/list', payload)
  return requireConsistencyCheckListResult(response)
}

export async function markGenerationApplied(generationId, applyAction, status = '') {
  const id = String(generationId || '').trim()
  if (!id) return { success: false, message: '缺少生成记录 ID' }
  const rows = requireStoreArray(await getStoreValue('editorGenerations', []), '读取生成记录失败')
  const target = rows.find((item) => item.id === id)
  if (!target) throw new Error('未找到生成记录，无法更新状态')
  const patch = {
    status: status || statusFromApplyAction(applyAction),
    applyAction,
    appliedAt: new Date().toISOString()
  }
  const generation = { ...target, ...patch }
  await setStoreValue(
    'editorGenerations',
    rows.map((item) => (item.id === id ? generation : item))
  )
  return requireObjectResult({ success: true, generation }, 'generation', '更新生成记录')
}

export async function listAgentHistory(bookId) {
  const generations = requireStoreArray(
    await getStoreValue('editorGenerations', []),
    '读取生成记录失败'
  )
  return requireArrayResult(
    {
      success: true,
      items: generations.filter((item) => !bookId || item.bookId === bookId)
    },
    'items',
    '读取生成记录'
  )
}

export async function listAgentTasks(payload = {}) {
  const response = await postJson('/api/editor-agent/queue-jobs', payload)
  return requireArrayResult(
    { ...response, tasks: Array.isArray(response?.jobs) ? response.jobs : null },
    'tasks',
    '读取 Agent 任务记录'
  )
}

export async function getAgentProgressServer() {
  return requireAgentProgressServerResult(await postJson('/api/editor-agent/progress-server', {}))
}

export async function createEditorSnapshot(payload = {}) {
  const response = await postJson('/api/editor-snapshots/create', payload)
  return requireObjectResult(response, 'snapshot', '保存编辑器快照')
}

export async function listEditorSnapshots(filter = {}) {
  const response = await postJson('/api/editor-snapshots/list', filter)
  return requireArrayResult(response, 'snapshots', '读取编辑器快照')
}

export async function deleteEditorSnapshot(snapshotId, filter = {}) {
  const response = await postJson('/api/editor-snapshots/delete', { ...filter, snapshotId })
  if (response?.success !== true || response.snapshotId !== snapshotId) {
    throw new Error(response?.message || '删除编辑器快照失败')
  }
  return response
}

export async function saveEditorMaterial(payload = {}) {
  const materials = requireStoreArray(
    await getStoreValue('editorMaterials', []),
    '读取编辑器素材失败'
  )
  const material = {
    id: createRecordId('editor_material'),
    source: 'editor_agent',
    tags: [],
    ...payload,
    createdAt: new Date().toISOString()
  }
  await setStoreValue('editorMaterials', [material, ...materials].slice(0, 300))
  return requireObjectResult({ success: true, material }, 'material', '保存编辑器素材')
}

export async function listEditorMaterials(filter = {}) {
  const { bookId = '', chapterId = '' } = filter
  const materials = requireStoreArray(
    await getStoreValue('editorMaterials', []),
    '读取编辑器素材失败'
  )
  return requireArrayResult(
    {
      success: true,
      materials: materials.filter((item) => {
        if (bookId && item.bookId !== bookId) return false
        if (chapterId && item.chapterId !== chapterId) return false
        return true
      })
    },
    'materials',
    '读取编辑器素材'
  )
}

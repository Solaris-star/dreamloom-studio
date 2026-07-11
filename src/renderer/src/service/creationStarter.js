import { postJson } from './webHttpClient.js'

const JOBS_KEY = 'creationStarter:jobs'
const STORAGE_SOURCE_KEY = 'creationStarter:storageSource'

function requireOptionalArrayField(raw = {}, fieldName, label) {
  const value = raw[fieldName]
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error(`起笔任务${label}格式异常，已停止读取以免使用错误任务`)
  }
  return value
}

function normalizeJob(raw = {}) {
  const now = new Date().toISOString()
  return {
    id: String(raw.id || `starter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    status: raw.status || 'pending',
    prompt: String(raw.prompt || ''),
    references: requireOptionalArrayField(raw, 'references', '手动参考素材'),
    autoReferences: requireOptionalArrayField(raw, 'autoReferences', '自动参考素材'),
    advanced: raw.advanced && typeof raw.advanced === 'object' ? raw.advanced : {},
    result: raw.result || null,
    rawOutput: String(raw.rawOutput || ''),
    errorMessage: String(raw.errorMessage || ''),
    usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : {},
    providerId: String(raw.providerId || ''),
    model: String(raw.model || ''),
    latencyMs: Number(raw.latencyMs || 0),
    storageScope: String(raw.storageScope || 'local'),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  }
}

function requireStoredJobs(value) {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error('起笔任务存储格式异常，已停止读取以免使用错误任务')
  }
  return value.map(normalizeJob)
}

async function readJobs() {
  const result = await postJson('/api/store/get', { key: JOBS_KEY })
  if (result?.success !== true || result.key !== JOBS_KEY) {
    throw new Error('读取起笔任务失败：接口返回的设置项不匹配')
  }
  return requireStoredJobs(result.value)
}

async function writeJobs(jobs) {
  const rows = jobs.map(normalizeJob).slice(0, 100)
  try {
    const result = await postJson('/api/store/set', { key: JOBS_KEY, value: rows })
    if (result?.success !== true) {
      throw new Error(result?.message || '接口返回失败')
    }
    if (result.key !== JOBS_KEY) {
      throw new Error('保存本地起笔任务失败：接口返回的设置项不匹配')
    }
  } catch (error) {
    throw new Error(`保存起笔任务失败：${error?.message || '写入失败'}`)
  }
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(rows))
    localStorage.setItem(STORAGE_SOURCE_KEY, 'primary-store+browser-backup')
  } catch (error) {
    console.warn('[CreationStarter] Browser backup write failed', error)
  }
  return rows
}

export async function createCreationStarterJob(input = {}) {
  const jobs = await readJobs()
  const job = normalizeJob({
    ...input,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  await writeJobs([job, ...jobs])
  return job
}

export async function getCreationStarterJob(id) {
  const jobs = await readJobs()
  return jobs.find((job) => job.id === id) || null
}

export async function updateCreationStarterJob(id, patch = {}) {
  const jobs = await readJobs()
  const index = jobs.findIndex((job) => job.id === id)
  if (index === -1) {
    throw new Error('起笔任务不存在，无法更新')
  }
  const updated = normalizeJob({
    ...jobs[index],
    ...patch,
    id,
    createdAt: jobs[index].createdAt,
    updatedAt: new Date().toISOString()
  })
  jobs[index] = updated
  await writeJobs(jobs)
  return updated
}

export async function listCreationStarterJobs() {
  return readJobs()
}

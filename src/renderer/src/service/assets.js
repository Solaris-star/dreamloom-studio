import { postJson } from './webHttpClient.js'

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requireAssetSuccess(result, label) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || label)
  }
  return result
}

export function requireAssetListResult(result, label = '加载素材失败') {
  const checked = requireAssetSuccess(result, label)
  if (!Array.isArray(checked.items)) {
    throw new Error(checked.message || checked.error || '素材接口返回格式不正确')
  }
  if (!Array.isArray(checked.books)) {
    throw new Error(checked.message || checked.error || '素材接口返回书籍列表格式不正确')
  }
  if (checked.summary !== undefined && !isPlainObject(checked.summary)) {
    throw new Error(checked.message || checked.error || '素材接口返回统计格式不正确')
  }
  return checked
}

function requireAssetItemResult(
  result,
  label,
  { expectedBookName = '', requiredFields = [] } = {}
) {
  requireAssetSuccess(result, label)
  if (!isPlainObject(result.item) || !String(result.item.id || '')) {
    throw new Error(`${label}：接口返回格式不正确`)
  }
  if (expectedBookName) {
    const bookNames = [
      result.item.bookName,
      result.item.bookFolderName,
      result.bookName,
      result.bookFolderName
    ]
      .filter(Boolean)
      .map(String)
    if (!bookNames.includes(String(expectedBookName))) {
      throw new Error(`${label}：接口返回的书籍不匹配`)
    }
  }
  for (const field of requiredFields) {
    if (!result[field]) {
      throw new Error(`${label}：接口缺少 ${field}`)
    }
  }
  return result
}

export async function listAssets(filter = {}) {
  const result = await postJson('/api/assets/list', filter)
  return requireAssetListResult(result)
}

export async function findAssetReferences(id) {
  const result = requireAssetSuccess(
    await postJson('/api/assets/references', { id }),
    '读取素材引用失败'
  )
  if (!Array.isArray(result.references)) {
    throw new Error('读取素材引用失败：接口返回格式不正确')
  }
  return result.references
}

export async function deleteAsset(id) {
  const result = await postJson('/api/assets/delete', { id })
  return requireAssetItemResult(result, '移入回收站失败')
}

export async function restoreAsset(id) {
  const result = await postJson('/api/assets/restore', { id })
  return requireAssetItemResult(result, '恢复素材失败', {
    requiredFields: ['restoredPath', 'originalRelativePath', 'trashRelativePath', 'restoredId']
  })
}

export async function attachAssetToBook(payload = {}) {
  const result = await postJson('/api/assets/attach-to-book', payload)
  return requireAssetItemResult(result, '关联素材失败', {
    expectedBookName: payload.bookName || ''
  })
}

export async function importAsset(payload = {}) {
  const result = await postJson('/api/assets/import', payload)
  return requireAssetItemResult(result, '导入素材失败', {
    expectedBookName: payload.bookName || ''
  })
}

export function imageSelectionToImportInput(selection = {}) {
  if (!selection) return null
  if (selection.success === false) {
    const message = String(selection.message || selection.error || '')
    if (message.includes('取消') || message.includes('未选择')) return null
    throw new Error(message || '选择图片失败')
  }
  if (typeof selection === 'string') {
    return selection.startsWith('data:image/') ? { dataUrl: selection } : { sourcePath: selection }
  }

  const filePath = String(selection.filePath || '')
  const dataUrl = selection.dataUrl || (filePath.startsWith('data:image/') ? filePath : '')
  const sourcePath =
    selection.path ||
    selection.sourcePath ||
    (filePath && !filePath.startsWith('data:image/') ? filePath : '')
  const fileName = selection.fileName || selection.name || ''

  if (dataUrl) return { dataUrl, fileName }
  if (sourcePath) return { sourcePath, fileName }
  return null
}

export function getAssetUrl(asset = {}) {
  const params = new URLSearchParams({
    id: asset.id || '',
    trash: asset.status === 'trash' ? 'true' : ''
  })
  return `/api/assets/get?${params.toString()}`
}

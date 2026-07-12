import fs from 'node:fs'
import { resolve } from 'node:path'

export function setWebBooksDirectory({
  requestedDir,
  configuredDir = '',
  setStoreValue,
  fsApi = fs
}) {
  const candidate = String(requestedDir || '').trim()
  if (!candidate) {
    throw Object.assign(new Error('书库目录不能为空'), { statusCode: 400 })
  }

  const fixedDir = String(configuredDir || '').trim()
  if (fixedDir && resolve(candidate) !== resolve(fixedDir)) {
    throw Object.assign(new Error('书库目录已由服务器配置，不能在页面中修改'), {
      statusCode: 409
    })
  }

  let realDir
  try {
    realDir = fsApi.realpathSync(candidate)
  } catch {
    throw Object.assign(new Error('书库目录不存在或无法访问'), { statusCode: 404 })
  }
  if (!fsApi.statSync(realDir).isDirectory()) {
    throw Object.assign(new Error('所选路径不是目录'), { statusCode: 400 })
  }
  try {
    fsApi.accessSync(realDir, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    throw Object.assign(new Error('书库目录必须可读写'), { statusCode: 403 })
  }

  if (!fixedDir && !setStoreValue('booksDir', realDir)) {
    throw Object.assign(new Error('保存书库目录失败'), { statusCode: 500 })
  }
  return { success: true, booksDir: realDir, configurable: !fixedDir }
}

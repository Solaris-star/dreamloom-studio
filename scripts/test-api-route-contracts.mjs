import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
function collectSourceFiles(dirPath, result = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const target = path.join(dirPath, entry.name)
    if (entry.isDirectory()) collectSourceFiles(target, result)
    else if (/\.(?:js|vue)$/.test(entry.name)) result.push(target)
  }
  return result
}

const rendererDir = path.join(root, 'src/renderer/src')
const clientSources = collectSourceFiles(rendererDir).map((file) => fs.readFileSync(file, 'utf8'))
const serverSource = read('vite.web.plugins.mjs')

const collectPaths = (source) =>
  new Set([...source.matchAll(/['"`](\/api\/[a-z0-9_./-]+)['"`]/gi)].map((match) => match[1]))

const clientPaths = collectPaths(clientSources.join('\n'))
const serverPaths = collectPaths(serverSource)
const knownMissingPaths = new Set()
const ignoredProxyPaths = new Set(['/api/agent-tasks/queue/status'])
const missing = [...clientPaths].filter(
  (apiPath) => !serverPaths.has(apiPath) && !ignoredProxyPaths.has(apiPath)
)
const unexpectedMissing = missing.filter((apiPath) => !knownMissingPaths.has(apiPath))
const resolvedBaselinePaths = [...knownMissingPaths].filter((apiPath) => !missing.includes(apiPath))

assert.deepEqual(
  unexpectedMissing,
  [],
  `前端新增了未实现的静态 API 路径：${unexpectedMissing.join('、')}`
)
assert.deepEqual(
  resolvedBaselinePaths,
  [],
  `以下 API 已有实现，请从已知缺失清单移除：${resolvedBaselinePaths.join('、')}`
)
assert.ok(serverPaths.has('/api/workbench-database/snapshot'))
assert.ok(serverPaths.has('/api/workbench-database/query'))

console.log(
  `API 路由检查通过：检查 ${clientPaths.size} 个静态路径，仍有 ${missing.length} 个已知缺失接口`
)

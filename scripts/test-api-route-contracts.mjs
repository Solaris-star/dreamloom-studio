import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKBENCH_DATABASE_ROUTE_CONTRACTS } from '../src/main/webApi/workbenchDatabaseRoutes.js'

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
const webApiDir = path.join(root, 'src/main/webApi')
const serverSources = [read('vite.web.plugins.mjs')]
if (fs.existsSync(webApiDir)) {
  serverSources.push(
    ...collectSourceFiles(webApiDir).map((file) => fs.readFileSync(file, 'utf8'))
  )
}
const serverSource = serverSources.join('\n')

const collectPaths = (source) =>
  new Set([...source.matchAll(/['"`](\/api\/[a-z0-9_./-]+)['"`]/gi)].map((match) => match[1]))

const clientSource = clientSources.join('\n')
const clientPaths = collectPaths(clientSource)
const serverPaths = collectPaths(serverSource)
const clientContracts = [
  ...clientSource.matchAll(/\b(postJson|fetchJson)\s*\(\s*['"`](\/api\/[a-z0-9_./-]+)['"`]/gi)
].map((match) => ({
  method: match[1] === 'postJson' ? 'POST' : 'GET',
  path: match[2]
}))
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
for (const contract of clientContracts) {
  assert.ok(
    serverPaths.has(contract.path) || ignoredProxyPaths.has(contract.path),
    `前端 ${contract.method} ${contract.path} 没有对应后端路由`
  )
}
assert.deepEqual(WORKBENCH_DATABASE_ROUTE_CONTRACTS, {
  '/api/workbench-database/snapshot': 'POST',
  '/api/workbench-database/query': 'POST'
})
for (const [apiPath] of Object.entries(WORKBENCH_DATABASE_ROUTE_CONTRACTS)) {
  assert.ok(serverPaths.has(apiPath), `工作台数据库路由未注册：${apiPath}`)
}

console.log(
  `API 路由检查通过：检查 ${clientPaths.size} 个静态路径和 ${clientContracts.length} 处明确调用`
)

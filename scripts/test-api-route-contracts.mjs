import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const serviceDir = path.join(root, 'src/renderer/src/service')
const clientSources = fs
  .readdirSync(serviceDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => read(`src/renderer/src/service/${name}`))
const serverSource = read('vite.web.plugins.mjs')

const collectPaths = (source) =>
  new Set([...source.matchAll(/['"`](\/api\/[a-z0-9_./-]+)['"`]/gi)].map((match) => match[1]))

const clientPaths = collectPaths(clientSources.join('\n'))
const serverPaths = collectPaths(serverSource)
const ignoredProxyPaths = new Set(['/api/agent-tasks/queue/status'])
const missing = [...clientPaths].filter(
  (apiPath) => !serverPaths.has(apiPath) && !ignoredProxyPaths.has(apiPath)
)

assert.deepEqual(missing, [], `前端存在未实现的静态 API 路径：${missing.join('、')}`)
assert.ok(serverPaths.has('/api/workbench-database/snapshot'))
assert.ok(serverPaths.has('/api/workbench-database/query'))

console.log(`API 路由检查通过，共检查 ${clientPaths.size} 个前端静态路径`)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pageOpenCases } from '../tests/e2e/page-catalog.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const routerSource = fs.readFileSync(
  path.join(rootDir, 'src/renderer/src/router/index.js'),
  'utf8'
)
const routeNames = [
  ...new Set(
    [...routerSource.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
  )
]
const catalogNames = pageOpenCases.map((entry) => entry.routeName)

assert.equal(new Set(catalogNames).size, catalogNames.length, '页面巡检清单中的路由名称不能重复')

const missingNames = routeNames.filter((name) => !catalogNames.includes(name))
const unknownNames = catalogNames.filter((name) => !routeNames.includes(name))

assert.deepEqual(missingNames, [], `以下具名路由缺少页面打开测试：${missingNames.join('、')}`)
assert.deepEqual(unknownNames, [], `页面巡检清单包含不存在的路由：${unknownNames.join('、')}`)

for (const entry of pageOpenCases) {
  assert.match(entry.path, /^\/#\//, `${entry.routeName} 必须提供 Hash 路由地址`)
  assert.ok(entry.title.trim(), `${entry.routeName} 必须提供页面标题`)
}

console.log(`页面路由巡检清单检查通过：${routeNames.length} 个具名路由均有打开测试`)

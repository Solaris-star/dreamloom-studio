import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const packageJson = JSON.parse(read('package.json'))
const allDependencies = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {})
}

assert.equal(
  Object.keys(allDependencies).some((name) => name === 'electron' || name.startsWith('electron-')),
  false,
  '纯 Web 项目不能包含 Electron 依赖'
)

for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  assert.doesNotMatch(
    `${name} ${command}`,
    /\belectron(?:-builder|-vite)?\b/i,
    `脚本 ${name} 不能启动或构建 Electron`
  )
}

const preloadDir = path.join(root, 'src/preload')
const preloadFiles = fs.existsSync(preloadDir)
  ? fs.readdirSync(preloadDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
  : []
assert.equal(preloadFiles.length, 0, '纯 Web 项目不能保留 preload 入口文件')

const forbiddenDesktopArtifacts = [
  'blog',
  'build',
  'resources/icon.png',
  'scripts/update-icon.sh',
  'src/renderer/src/assets/electron.svg',
  'static/QQQRCode.png',
  'static/AliPayQRCode.png',
  'static/WeChatPayQRCode.png'
]
for (const relativePath of forbiddenDesktopArtifacts) {
  assert.equal(
    fs.existsSync(path.join(root, relativePath)),
    false,
    `纯 Web 项目不能保留旧桌面资产：${relativePath}`
  )
}

const editorSource = read('src/renderer/src/views/Editor.vue')
assert.doesNotMatch(editorSource, /window\.process|process\.argv/, '编辑器不能读取桌面进程参数')

const userGuideSource = read('src/renderer/src/views/UserGuide.vue')
assert.doesNotMatch(
  userGuideSource,
  /QQQRCode|AliPayQRCode|WeChatPayQRCode|桌面客户端|安装包/,
  '正式用户指南不能引用旧客户端或二维码内容'
)

const assetServiceSource = read('src/renderer/src/service/assets.js')
assert.doesNotMatch(
  assetServiceSource,
  /window\.electron|ensureElectronApi/,
  '素材服务必须直接使用 Web API'
)
const webShimSource = read('src/renderer/src/service/webElectronShim.js')
for (const method of ['listAssets:', 'importAsset:', 'deleteAsset:', 'restoreAsset:', 'attachAssetToBook:']) {
  assert.doesNotMatch(webShimSource, new RegExp(`\\b${method}`), `Web shim 不应保留素材方法：${method}`)
}

const rendererRoot = path.join(root, 'src/renderer/src')
const rendererSourceFiles = fs
  .readdirSync(rendererRoot, { recursive: true, withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      ['.js', '.ts', '.vue'].includes(path.extname(entry.name)) &&
      entry.name !== 'webImageUrl.js'
  )
for (const entry of rendererSourceFiles) {
  const absolutePath = path.join(entry.parentPath || entry.path, entry.name)
  assert.doesNotMatch(
    fs.readFileSync(absolutePath, 'utf8'),
    /file:\/\//i,
    `纯 Web 运行代码不能生成本地文件协议：${path.relative(root, absolutePath)}`
  )
}

console.log('纯 Web 防回归检查通过')

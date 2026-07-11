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
const importExportServiceSource = read('src/renderer/src/service/importExport.js')
assert.doesNotMatch(
  importExportServiceSource,
  /window\.electron|ensureElectronApi/,
  '导入导出服务必须直接使用 Web API'
)
for (const method of [
  'previewImportBook:',
  'importBookFromFile:',
  'exportBookFile:',
  'createLibraryBackup:',
  'inspectLibraryBackup:',
  'restoreLibraryBackup:',
  'listImportExportTasks:'
]) {
  assert.doesNotMatch(webShimSource, new RegExp(`\\b${method}`), `Web shim 不应保留导入导出方法：${method}`)
}
const extractionServiceSource = read('src/renderer/src/service/extraction.js')
assert.doesNotMatch(
  extractionServiceSource,
  /window\.electron|ensureElectronApi/,
  '拆书服务必须直接使用 Web API'
)
for (const method of [
  'getExtractionDimensions:',
  'createExtraction:',
  'getExtractionProgress:',
  'listExtractions:',
  'getExtractionResultPage:',
  'deleteExtraction:'
]) {
  assert.doesNotMatch(webShimSource, new RegExp(`\\b${method}`), `Web shim 不应保留拆书方法：${method}`)
}
const outlineChapterServiceSource = read('src/renderer/src/service/outlineChapter.js')
assert.doesNotMatch(
  outlineChapterServiceSource,
  /window\.electron|ensureElectronApi/,
  '章节生成服务必须直接使用 Web API'
)
assert.doesNotMatch(
  webShimSource,
  /\bgenerateChapterFromOutline:/,
  'Web shim 不应保留章节生成方法'
)
for (const [file, label] of [
  ['src/renderer/src/service/settingTree.js', '设定树'],
  ['src/renderer/src/service/plotEvolution.js', '剧情演化'],
  ['src/renderer/src/service/settingAi.js', '设定 AI'],
  ['src/renderer/src/service/editorText.js', '编辑器 AI'],
  ['src/renderer/src/service/outlineAiTask.js', '大纲 AI'],
  ['src/renderer/src/service/knowledgeBase.js', '知识库']
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron|ensureElectronApi/,
    `${label}服务必须直接使用 Web API`
  )
}
for (const method of [
  'generateSettingTree:',
  'regenerateSettingNode:',
  'applySettingTree:',
  'plotEvolutionEvolve:',
  'plotEvolutionRegenerate:',
  'refineSettingWithAI:',
  'continueWriteWithAI:',
  'polishTextWithAI:',
  'runOutlineAiTask:',
  'listKnowledgeItems:',
  'getKnowledgeItem:',
  'createKnowledgeItem:',
  'updateKnowledgeItem:',
  'deleteKnowledgeItem:',
  'searchKnowledgeItems:',
  'favoriteKnowledgeItem:',
  'archiveKnowledgeItem:',
  'linkKnowledgeItems:',
  'convertTopicCardToBook:',
  'runKnowledgeAiTask:',
  'createTopicCardFromAi:'
]) {
  assert.doesNotMatch(webShimSource, new RegExp(`\\b${method}`), `Web shim 不应保留 AI 方法：${method}`)
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

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const listFiles = (directory, extensions) => {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
}

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
  ? fs
      .readdirSync(preloadDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
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

const userFacingFiles = [
  'README.md',
  'src/renderer/index.html',
  'src/renderer/src/locales/zh-CN.json',
  'src/renderer/src/locales/en-US.json',
  'src/renderer/src/views/UserGuide.vue'
].filter((relativePath) => fs.existsSync(path.join(root, relativePath)))
const legacyUserFacingPattern =
  /织梦书房|51\s*码字|51mazi|QQQRCode|AliPayQRCode|WeChatPayQRCode|桌面客户端|Electron\s*(?:客户端|版本|安装包)/i
for (const relativePath of userFacingFiles) {
  assert.doesNotMatch(
    read(relativePath),
    legacyUserFacingPattern,
    `用户可见内容不能包含旧项目品牌或桌面端说明：${relativePath}`
  )
}

const userFacingRoots = [
  ...fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.md', '.html'].includes(path.extname(entry.name)))
    .map((entry) => path.join(root, entry.name)),
  ...listFiles(path.join(root, 'docs'), new Set(['.md', '.html'])),
  ...listFiles(path.join(root, 'src/renderer'), new Set(['.html', '.vue'])),
  ...listFiles(path.join(root, 'src/renderer/src/locales'), new Set(['.json']))
]
const desktopUserFacingPattern =
  /织梦书房|51\s*码字|51mazi|QQQRCode|AliPayQRCode|WeChatPayQRCode|Electron|桌面(?:端|客户端|应用|版本)|客户端(?:下载|安装包)|desktop\s+(?:app|client|version)/i
for (const absolutePath of new Set(userFacingRoots)) {
  assert.doesNotMatch(
    fs.readFileSync(absolutePath, 'utf8'),
    desktopUserFacingPattern,
    `用户可见文件不能包含旧项目或桌面端内容：${path.relative(root, absolutePath)}`
  )
}

const editorSource = read('src/renderer/src/views/Editor.vue')
assert.doesNotMatch(editorSource, /window\.process|process\.argv/, '编辑器不能读取桌面进程参数')

for (const [file, label] of [
  ['src/renderer/src/views/Auth.vue', '书架认证页面'],
  ['src/renderer/src/router/index.js', '前端路由认证'],
  ['src/renderer/src/components/BookshelfPasswordSettings.vue', '书架密码设置'],
  ['src/renderer/src/layouts/AppLayout.vue', '应用布局']
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron(?:Store)?\b|ensureElectronApi|主进程/,
    `${label}必须直接使用 Web 服务`
  )
}

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
const mainAssetServiceSource = read('src/main/services/assetService.js')
assert.match(
  mainAssetServiceSource,
  /if \(input\.sourcePath\) \{\s*throw new Error\('Web 服务必须通过网页上传素材内容，不能读取服务器本地路径'\)/,
  '素材导入接口必须拒绝客户端传入服务器文件路径'
)
const mainImportExportServiceSource = read('src/main/services/importExportService.js')
assert.match(
  mainImportExportServiceSource,
  /if \(input\.sourcePath\) \{\s*throw new Error\('Web 服务必须通过网页上传文件内容，不能读取服务器本地路径'\)/,
  '书籍导入和备份接口必须拒绝客户端传入服务器文件路径'
)
assert.match(
  read('scripts/test-asset-reference-guards.mjs'),
  /importAsset\([\s\S]*sourcePath:[\s\S]*不能读取服务器本地路径/,
  '素材测试必须覆盖服务器路径越权输入'
)
assert.match(
  read('scripts/test-import-export-lifecycle.mjs'),
  /previewImport\([\s\S]*sourcePath:[\s\S]*inspectBackup\([\s\S]*sourcePath:[\s\S]*不能读取服务器本地路径/,
  '导入和备份测试必须覆盖服务器路径越权输入'
)
for (const [file, label] of [
  ['src/renderer/src/stores/theme.js', '主题设置'],
  ['src/renderer/src/stores/editor.js', '编辑器状态'],
  ['src/renderer/src/i18n/index.js', '语言设置'],
  ['src/renderer/src/composables/useAICoverFormHistory.js', 'AI 封面表单历史'],
  ['src/renderer/src/service/novel.js', '小说下载服务'],
  ['src/renderer/src/components/NovelImportPanel.vue', '小说导入面板'],
  ['src/renderer/src/views/NovelDownload.vue', '小说下载页面']
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron|window\.electronStore|ensureElectronApi/,
    `${label}必须直接使用 Web API`
  )
}
const editorPanelSource = read('src/renderer/src/components/Editor/EditorPanel.vue')
assert.match(
  editorPanelSource,
  /emit\('cleanup-task-state', \{ \.\.\.cleanupTaskState\.value \}\)/,
  'AI 选段清理和整章清理状态必须传给可见工具栏'
)
assert.match(
  editorPanelSource,
  /polishDialogVisible\.value && cleanupDiff\.value\.length/,
  '未处理的 AI 清理差异不得被后续请求覆盖'
)
assert.match(
  editorPanelSource,
  /function resetPolishResult\(\) \{[\s\S]{0,200}setCleanupTaskState\('selection', 'idle'\)[\s\S]{0,100}setCleanupTaskState\('chapter', 'idle'\)/,
  'AI 清理结果关闭后必须重置独立任务状态'
)
assert.match(
  editorPanelSource,
  /const cleanupRequestSequence = \{\s*selection: 0,\s*chapter: 0\s*\}/,
  '选段清理和整章清理必须使用独立请求序号'
)
assert.match(
  editorPanelSource,
  /cleanupTaskState\.value\.chapter === 'running'[\s\S]*整章清理正在进行，请稍候/,
  '选段清理必须阻止与整章清理同时执行'
)
assert.match(
  editorPanelSource,
  /cleanupTaskState\.value\.selection === 'running'[\s\S]*选段清理正在进行，请稍候/,
  '整章清理必须阻止与选段清理同时执行'
)
assert.ok(
  (editorPanelSource.match(/polishSourceDocument\.value = (?:sourceDocument|fullText)/g) || [])
    .length >= 4,
  'AI 清理和普通润色都必须记录来源正文'
)
assert.ok(
  (editorPanelSource.match(/polishSourceFilePath\.value = sourceFilePath/g) || []).length >= 4,
  'AI 清理和普通润色都必须记录来源章节'
)
const agentWritingDockSource = read('src/renderer/src/components/Editor/AgentWritingDock.vue')
const editorServiceSource = read('src/renderer/src/service/editor.js')
const webShimPath = path.join(root, 'src/renderer/src/service/webElectronShim.js')
assert.equal(fs.existsSync(webShimPath), false, '纯 Web 项目不能保留 Electron 兼容层')

const webLogoPath = path.join(root, 'src/renderer/src/assets/images/logo_web.webp')
assert.equal(fs.existsSync(webLogoPath), true, 'Web 界面必须使用轻量品牌图')
assert.ok(fs.statSync(webLogoPath).size <= 100 * 1024, 'Web 品牌图不能超过 100 KB')
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf-8'),
  /logo_big\.png/,
  '浏览器图标不能引用超大原始 Logo'
)
const webShimSource = ''
const rendererMainSource = read('src/renderer/src/main.js')
assert.doesNotMatch(
  rendererMainSource,
  /webElectronShim|installWebElectronShim|window\.electron/,
  'Web 启动入口不能注入 Electron 兼容层'
)
assert.doesNotMatch(
  read('src/renderer/src/service/localBookImport.js'),
  /import\s+(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"]mammoth['"]/,
  'DOCX 解析器必须按需加载，不能进入书库页面首批代码'
)
for (const absolutePath of listFiles(
  path.join(root, 'src/renderer/src'),
  new Set(['.js', '.vue'])
)) {
  assert.doesNotMatch(
    fs.readFileSync(absolutePath, 'utf8'),
    /import\s+\*\s+as\s+\w+\s+from\s+['"]lucide-vue-next['"]/,
    `Lucide 图标必须按需导入：${path.relative(root, absolutePath)}`
  )
}
assert.doesNotMatch(
  editorPanelSource,
  /window\.electron(?:Store)?\b/,
  '正文编辑面板不应依赖 Electron'
)
assert.doesNotMatch(
  agentWritingDockSource,
  /window\.electron(?:Store)?\b/,
  'Agent 写作面板必须通过 WebSocket 和 Web API 工作'
)
assert.doesNotMatch(
  editorServiceSource,
  /getElectronApi\(\s*['"]getEditorAgentProgressServer['"]/,
  'Agent 进度服务状态必须直接使用 Web API'
)
assert.doesNotMatch(
  editorServiceSource,
  /requireElectronApi\(/,
  '编辑器服务不能保留强制 Electron 调用'
)
assert.doesNotMatch(
  editorServiceSource,
  /getElectronApi\(|window\.electron/,
  '编辑器服务必须只使用 Web API 和 Web Store'
)
for (const method of [
  'setEditorModelDefault',
  'createNotebook',
  'renameNotebook',
  'createNote',
  'openEditorSession',
  'updateEditorSessionContext',
  'listEditorMessages',
  'appendEditorMessage',
  'markEditorGenerationApplied',
  'listEditorGenerations',
  'saveEditorMaterial',
  'listEditorMaterials'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}:`),
    `Web shim 不应保留已迁移的编辑器方法：${method}`
  )
}
for (const method of [
  'editNote',
  'saveChapter',
  'loadChapters',
  'readChapter',
  'readCharacters',
  'getBannedWords'
]) {
  assert.doesNotMatch(
    editorPanelSource,
    new RegExp(`window\\.electron(?:\\?\\.)?\\.${method}\\b`),
    `正文编辑面板不应再通过 Electron 调用 ${method}`
  )
}
for (const method of [
  'readSettings',
  'writeSettings',
  'readMaps',
  'createMap',
  'updateMap',
  'loadMapData',
  'deleteMap',
  'readRelationships',
  'readRelationshipData',
  'createRelationship',
  'saveRelationshipData',
  'updateRelationshipThumbnail',
  'readRelationshipImage',
  'deleteRelationship',
  'readOrganizations',
  'readOrganization',
  'createOrganization',
  'writeOrganization',
  'updateOrganizationThumbnail',
  'readOrganizationImage',
  'deleteOrganization',
  'exportOrganizationToNote'
]) {
  assert.doesNotMatch(
    editorServiceSource,
    new RegExp(`requireElectronApi\\(['"]${method}['"]`),
    `创作资料服务不应再通过 Electron 调用 ${method}`
  )
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}:`),
    `Web shim 不应保留已迁移的创作资料方法：${method}`
  )
}
for (const file of [
  'src/renderer/src/views/MapList.vue',
  'src/renderer/src/views/MapDesign.vue',
  'src/renderer/src/views/OrganizationList.vue',
  'src/renderer/src/views/OrganizationDesign.vue',
  'src/renderer/src/views/RelationshipList.vue',
  'src/renderer/src/views/RelationshipDesign.vue',
  'src/renderer/src/views/SettingManager.vue'
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron(?:Store)?\b/,
    `${file} 必须直接使用 Web 创作资料服务`
  )
}
for (const method of [
  'checkChapterExists',
  'upsertChapter',
  'readOutlines',
  'writeOutlines',
  'readOutlineAiSessions',
  'writeOutlineAiSessions'
]) {
  assert.doesNotMatch(
    editorServiceSource,
    new RegExp(`requireElectronApi\\(['"]${method}['"]`),
    `大纲服务不应再通过 Electron 调用 ${method}`
  )
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}:`),
    `Web shim 不应保留已迁移的大纲方法：${method}`
  )
}
for (const file of [
  'src/renderer/src/components/Editor/OutlineManagerPanel.vue',
  'src/renderer/src/components/Editor/OutlineAiWorkbenchDialog.vue'
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron(?:Store)?\b/,
    `${file} 必须直接使用 Web 大纲服务`
  )
}
assert.doesNotMatch(
  editorPanelSource,
  /window\.electronStore\b/,
  '正文编辑面板不应再通过 Electron Store 保存界面设置'
)
const noteChapterSource = read('src/renderer/src/components/Editor/NoteChapter.vue')
assert.doesNotMatch(
  noteChapterSource,
  /currentFile\.name === data\.name[\s\S]{0,300}path: data\.path/,
  '点击其他卷的同名章节前，不得猜测卷已改名并改写当前文件路径'
)
assert.doesNotMatch(
  noteChapterSource,
  /window\.electron(?:Store)?\b/,
  '章节树与笔记面板必须直接使用 Web 服务'
)
const editorMenubarSource = read('src/renderer/src/components/Editor/EditorMenubar.vue')
assert.doesNotMatch(
  editorMenubarSource,
  /window\.electron(?:Store)?\b|showSaveDialog|writeExportFile/,
  '编辑器菜单栏必须使用浏览器下载'
)
for (const [file, label] of [
  ['src/renderer/src/components/Editor/BannedWordsDrawer.vue', '禁词抽屉'],
  ['src/renderer/src/components/Editor/ChapterSettingsDialog.vue', '章节设置对话框'],
  ['src/renderer/src/components/Editor/EditorProgress.vue', '章节目标进度']
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron(?:Store)?\b|ensureElectronApi/,
    `${label}必须直接使用 Web 服务`
  )
}
for (const method of [
  'getChapterSettings',
  'getSortOrder',
  'getBannedWords',
  'addBannedWord',
  'removeBannedWord',
  'setChapterTargetWords',
  'updateChapterFormat',
  'readCharacters',
  'createChapter',
  'loadNotes',
  'readNote',
  'reformatChapterNumbers'
]) {
  assert.doesNotMatch(
    editorServiceSource,
    new RegExp(`requireElectronApi\\(['"]${method}['"]`),
    `编辑器服务不应再通过 Electron 调用 ${method}`
  )
}
for (const method of [
  'readDictionary',
  'writeDictionary',
  'readTimeline',
  'writeTimeline',
  'readSequenceCharts',
  'writeSequenceCharts',
  'readCharacters',
  'writeCharacters',
  'readEntityProfiles',
  'writeEntityProfileCategory'
]) {
  assert.doesNotMatch(
    editorServiceSource,
    new RegExp(`requireElectronApi\\(['"]${method}['"]`),
    `编辑器文档服务不应再通过 Electron 调用 ${method}`
  )
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}:`),
    `Web shim 不应保留已迁移的文档方法：${method}`
  )
}
for (const file of [
  'src/renderer/src/views/CharacterProfile.vue',
  'src/renderer/src/views/Dictionary.vue',
  'src/renderer/src/views/EventsSequence.vue',
  'src/renderer/src/views/Timeline.vue'
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron(?:Store)?\b/,
    `${file} 必须直接使用 Web 文档服务`
  )
}
for (const method of [
  'showSaveDialog:',
  'writeExportFile:',
  'setBookshelfAuthenticated:',
  'getBookshelfAuthenticated:',
  'getBookshelfAuthStatus:',
  'authenticateBookshelf:',
  'getAppVersion:',
  'getStorageStats:',
  'clearAssetTrash:',
  'exportAppSettings:',
  'importAppSettings:',
  'openBookEditorWindow:',
  'selectImage:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留已迁移的兼容方法：${method}`
  )
}
assert.doesNotMatch(
  read('src/renderer/src/views/SystemSettings.vue'),
  /window\.(?:electron|electronStore)\b/,
  '系统设置页必须只使用 Web 服务'
)
for (const file of [
  'src/renderer/src/components/Bookshelf.vue',
  'src/renderer/src/views/CreationStarterResult.vue'
]) {
  assert.doesNotMatch(
    read(file),
    /window\.(?:electron|electronStore)\b/,
    `${file} 必须只使用 Web 服务和路由`
  )
}
for (const method of [
  'novelGetSources:',
  'novelSearch:',
  'novelGetChapterList:',
  'novelGetBookInfo:',
  'novelDownloadChapters:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留小说下载方法：${method}`
  )
}
for (const method of [
  'listAssets:',
  'importAsset:',
  'deleteAsset:',
  'restoreAsset:',
  'attachAssetToBook:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留素材方法：${method}`
  )
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
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留导入导出方法：${method}`
  )
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
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留拆书方法：${method}`
  )
}
const outlineChapterServiceSource = read('src/renderer/src/service/outlineChapter.js')
assert.doesNotMatch(
  outlineChapterServiceSource,
  /window\.electron|ensureElectronApi/,
  '章节生成服务必须直接使用 Web API'
)
assert.doesNotMatch(webShimSource, /\bgenerateChapterFromOutline:/, 'Web shim 不应保留章节生成方法')
for (const [file, label] of [
  ['src/renderer/src/service/settingTree.js', '设定树'],
  ['src/renderer/src/service/plotEvolution.js', '剧情演化'],
  ['src/renderer/src/service/settingAi.js', '设定 AI'],
  ['src/renderer/src/service/editorText.js', '编辑器 AI'],
  ['src/renderer/src/service/outlineAiTask.js', '大纲 AI'],
  ['src/renderer/src/service/knowledgeBase.js', '知识库'],
  ['src/renderer/src/service/market.js', '市场灵感']
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
  'createTopicCardFromAi:',
  'listMarketHotspots:',
  'createMarketHotspot:',
  'updateMarketHotspot:',
  'saveMarketHotspotToKnowledge:',
  'createTopicCardFromMarketHotspot:',
  'listMarketActivities:',
  'createMarketActivity:',
  'updateMarketActivity:',
  'saveMarketActivityToKnowledge:',
  'createTopicCardFromMarketActivity:',
  'refreshMarketTrends:',
  'listMarketHotTopics:',
  'getMarketTrend:',
  'listMarketTrends:',
  'listMarketSourceStatus:',
  'listMarketOpportunities:',
  'getMarketDashboard:',
  'getMarketOverview:',
  'getMarketHotRank:',
  'getMarketKeywordCloud:',
  'getMarketKeywordCombination:',
  'getMarketActivitiesBoard:',
  'saveMarketInspiration:',
  'generateMarketOutline:',
  'applyMarketInsightToCurrentBook:',
  'createBookFromMarketInsight:',
  'getBookDailyStats:',
  'getAllBooksDailyStats:',
  'getAnalyticsOverview:',
  'getAnalyticsDailyWords:',
  'getAnalyticsWritingHabit:',
  'getAnalyticsSessionStats:',
  'getAnalyticsTokenStats:',
  'getAnalyticsWeeklyReport:',
  'getAnalyticsMonthlyReport:',
  'listWritingGoals:',
  'createWritingGoal:',
  'updateWritingGoal:',
  'deleteWritingGoal:',
  'createBook:',
  'readBooksDir:',
  'deleteBook:',
  'editBook:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留 AI 方法：${method}`
  )
}
for (const method of [
  'setTongyiwanxiangApiKey:',
  'getTongyiwanxiangApiKey:',
  'validateTongyiwanxiangApiKey:',
  'generateAICover:',
  'confirmAICover:',
  'discardAICovers:',
  'generateAICharacterImage:',
  'confirmAICharacterImage:',
  'discardAICharacterImages:',
  'generateAISceneImage:',
  'listConfiguredImageProviders:',
  'getImageAiLastProvider:',
  'setImageAiLastProvider:',
  'setGeminiApiKey:',
  'getGeminiApiKey:',
  'validateGeminiApiKey:',
  'setDoubaoConfig:',
  'getDoubaoConfig:',
  'validateDoubaoConfig:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留图片 AI 方法：${method}`
  )
}
for (const [file, label] of [
  ['src/renderer/src/service/imageAi.js', '图片 AI 配置'],
  ['src/renderer/src/service/tongyiwanxiang.js', '图片生成']
]) {
  assert.doesNotMatch(
    read(file),
    /window\.electron|ensureElectronApi/,
    `${label}服务必须直接使用 Web API`
  )
}
assert.doesNotMatch(
  read('src/renderer/src/service/deepseek.js'),
  /window\.electron|ensureElectronApi/,
  'DeepSeek 服务必须直接使用 Web API'
)
assert.doesNotMatch(
  read('src/renderer/src/service/aiProvider.js'),
  /window\.electron|ensureElectronApi/,
  'AI Provider 服务必须直接使用 Web API'
)
assert.doesNotMatch(
  read('src/renderer/src/views/AiWorkshop.vue'),
  /window\.electron[^;\n]*(?:getAiProviders|getActiveTextProvider)/,
  'AI 工坊页面读取 Provider 时不能使用 Electron 兼容接口'
)
for (const method of [
  'getAiProviders:',
  'saveAiProviders:',
  'addAiProvider:',
  'updateAiProvider:',
  'deleteAiProvider:',
  'validateAiProvider:',
  'listAiProviderModels:',
  'testAiProviderModel:',
  'getActiveTextProvider:',
  'setActiveTextProvider:',
  'getActiveImageProvider:',
  'setActiveImageProvider:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留 AI Provider 方法：${method}`
  )
}
assert.doesNotMatch(
  read('src/renderer/src/service/aiWorkshop.js'),
  /window\.electron|ensureElectronApi/,
  'AI 工坊服务必须直接使用 Web API'
)
assert.doesNotMatch(
  read('src/renderer/src/service/creationStarter.js'),
  /window\.electron|window\.electronStore|ensureElectronApi|Electron 存储/,
  '起笔任务服务必须直接使用 Web API'
)
for (const method of [
  'listPromptPresets:',
  'createPromptPreset:',
  'updatePromptPreset:',
  'deletePromptPreset:',
  'exportPromptPresets:',
  'importPromptPresets:',
  'aiChatSend:',
  'runAiTextTask:',
  'runAiImageTask:',
  'listAiHistory:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留 AI 工坊方法：${method}`
  )
}
for (const method of [
  'listEmbeddingProviders:',
  'addEmbeddingProvider:',
  'deleteEmbeddingProvider:',
  'setActiveEmbeddingProvider:',
  'getActiveEmbeddingProvider:',
  'validateEmbeddingProvider:',
  'listEmbeddingProviderModels:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留 Embedding Provider 方法：${method}`
  )
}
for (const method of [
  'setDeepSeekApiKey:',
  'getDeepSeekApiKey:',
  'generateNamesWithAI:',
  'validateDeepSeekApiKey:',
  'refineSceneVisualPromptWithAI:'
]) {
  assert.doesNotMatch(
    webShimSource,
    new RegExp(`\\b${method}`),
    `Web shim 不应保留 DeepSeek 方法：${method}`
  )
}
assert.doesNotMatch(
  read('src/renderer/src/components/Editor/AISceneImageDialog.vue'),
  /window\.electron\?\.generateAISceneImage/,
  '场景图生成不能依赖 Electron 接口探测'
)

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
  const source = fs.readFileSync(absolutePath, 'utf8')
  assert.doesNotMatch(
    source,
    /window\.electronStore\b/,
    `纯 Web 运行代码不能依赖 Electron Store：${path.relative(root, absolutePath)}`
  )
  assert.doesNotMatch(
    source,
    /file:\/\//i,
    `纯 Web 运行代码不能生成本地文件协议：${path.relative(root, absolutePath)}`
  )
}

console.log('纯 Web 防回归检查通过')

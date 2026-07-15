import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const styleMap = new Map()
const dataset = { theme: '', themeMode: '' }
const documentElement = {
  style: {
    setProperty(name, value) {
      styleMap.set(name, String(value))
    },
    getPropertyValue(name) {
      return styleMap.get(name) || ''
    },
    set colorScheme(value) {
      styleMap.set('color-scheme', String(value))
    },
    get colorScheme() {
      return styleMap.get('color-scheme') || ''
    }
  },
  dataset
}

globalThis.document = { documentElement }
let systemPrefersDark = false
globalThis.window = {
  matchMedia(query) {
    return {
      matches: query.includes('prefers-color-scheme: dark') ? systemPrefersDark : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    }
  }
}

const {
  themeConfigs,
  resolveThemeKey,
  resolvePalette,
  getThemeMeta,
  getAvailableThemes,
  applyTheme,
  THEME_ALIASES,
  DEFAULT_THEME_KEY,
  THEME_STORAGE_KEY
} = await import(pathToFileURL(path.join(root, 'src/renderer/src/service/themeService.js')).href)

function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const toLin = (c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const r = toLin(parseInt(hex.slice(1, 3), 16))
    const g = toLin(parseInt(hex.slice(3, 5), 16))
    const b = toLin(parseInt(hex.slice(5, 7), 16))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const L1 = lum(hexA)
  const L2 = lum(hexB)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

function assertThemeKeys() {
  for (const required of ['default', 'eyecare', 'light', 'parchment', 'dark']) {
    assert.ok(themeConfigs[required], `缺少主题 ${required}`)
  }
  const available = getAvailableThemes()
  assert.equal(available.length, 5)
  assert.deepEqual(
    available.map((item) => item.key),
    ['default', 'eyecare', 'light', 'parchment', 'dark']
  )
  assert.equal(getThemeMeta('eyecare').name, '护眼')
  assert.equal(getThemeMeta('parchment').name, '羊皮纸')
  assert.equal(getThemeMeta('dark').name, '黑色')
  assert.equal(getThemeMeta('light').name, '白色')
  assert.equal(getThemeMeta('default').name, '默认')
}

function assertAliases() {
  assert.equal(resolveThemeKey('yellow'), 'eyecare')
  assert.equal(resolveThemeKey('paper'), 'parchment')
  assert.equal(resolveThemeKey('black'), 'dark')
  assert.equal(resolveThemeKey('system'), 'default')
  assert.equal(resolveThemeKey('nope'), DEFAULT_THEME_KEY)
  assert.equal(THEME_STORAGE_KEY, 'config.theme')
  assert.ok(THEME_ALIASES.yellow)
}

function assertContrast() {
  for (const key of ['eyecare', 'light', 'parchment', 'dark']) {
    const palette = resolvePalette(key, 'light')
    assert.ok(contrastRatio(palette.textBase, palette.bgPrimary) >= 4.5, `${key} body`)
    assert.ok(contrastRatio(palette.textBase, palette.bgSoft) >= 4.5, `${key} soft`)
    assert.ok(
      contrastRatio(palette.textSecondary || palette.textGray, palette.bgSoft) >= 3,
      `${key} secondary`
    )
    assert.ok(
      contrastRatio(palette.bannedWord || palette.dangerColor, palette.bgPrimary) >= 3,
      `${key} banned`
    )
  }
  const lightDefault = resolvePalette('default', 'light')
  const darkDefault = resolvePalette('default', 'dark')
  assert.ok(contrastRatio(lightDefault.textBase, lightDefault.bgPrimary) >= 4.5)
  assert.ok(contrastRatio(darkDefault.textBase, darkDefault.bgPrimary) >= 4.5)
}

function assertEyecareNotNeon() {
  const palette = resolvePalette('eyecare')
  const r = parseInt(palette.bgPrimary.slice(1, 3), 16)
  const g = parseInt(palette.bgPrimary.slice(3, 5), 16)
  const b = parseInt(palette.bgPrimary.slice(5, 7), 16)
  assert.ok(g - r < 40)
  assert.ok(g - b < 60)
  assert.ok(g < 240 && r > 180)
}

function assertApplyTheme() {
  styleMap.clear()
  applyTheme('dark', 'light')
  assert.equal(dataset.theme, 'dark')
  assert.equal(dataset.themeMode, 'dark')
  assert.equal(styleMap.get('--bg-primary'), themeConfigs.dark.bgPrimary)
  assert.equal(styleMap.get('--banned-word-color'), themeConfigs.dark.bannedWord)
  assert.ok(styleMap.get('--code-bg'))
  assert.ok(styleMap.get('--el-bg-color'))
  applyTheme('eyecare')
  assert.equal(dataset.theme, 'eyecare')
  applyTheme('parchment')
  assert.equal(dataset.theme, 'parchment')
  systemPrefersDark = true
  applyTheme('default', 'dark')
  assert.equal(dataset.themeMode, 'dark')
  applyTheme('not-a-theme', 'light')
  assert.equal(dataset.theme, DEFAULT_THEME_KEY)
}

function assertSourceContracts() {
  const themeStoreSource = fs.readFileSync(path.join(root, 'src/renderer/src/stores/theme.js'), 'utf8')
  assert.match(themeStoreSource, /getStoreValue\(THEME_STORAGE_KEY/)
  assert.match(themeStoreSource, /themeService/)
  const serviceSource = fs.readFileSync(path.join(root, 'src/renderer/src/service/themeService.js'), 'utf8')
  assert.match(serviceSource, /eyecare/)
  assert.match(serviceSource, /parchment/)
  assert.match(serviceSource, /prefers-color-scheme/)
  const themesCss = fs.readFileSync(path.join(root, 'src/renderer/src/assets/styles/themes.css'), 'utf8')
  assert.match(themesCss, /prefers-reduced-motion/)
  assert.match(themesCss, /::selection/)
  const mainSource = fs.readFileSync(path.join(root, 'src/renderer/src/main.js'), 'utf8')
  assert.match(mainSource, /themes\.css/)
  const menubar = fs.readFileSync(path.join(root, 'src/renderer/src/components/Editor/EditorMenubar.vue'), 'utf8')
  assert.match(menubar, /data-theme-option/)
  const editorView = fs.readFileSync(path.join(root, 'src/renderer/src/views/Editor.vue'), 'utf8')
  assert.match(editorView, /阅读主题/)
}

assertThemeKeys()
assertAliases()
assertContrast()
assertEyecareNotNeon()
assertApplyTheme()
assertSourceContracts()
console.log('创作台主题单元测试通过')

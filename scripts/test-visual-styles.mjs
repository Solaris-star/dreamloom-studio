import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const servicePath = 'src/renderer/src/service/visualStyleService.js'
const themeStorePath = 'src/renderer/src/stores/theme.js'
const settingsPath = 'src/renderer/src/views/SystemSettings.vue'
const cssPath = 'src/renderer/src/assets/styles/visual-styles.css'
const mainCssPath = 'src/renderer/src/assets/main.css'

assert.ok(fs.existsSync(servicePath), 'visualStyleService.js 应存在')
assert.ok(fs.existsSync(cssPath), 'visual-styles.css 应存在')

const mainCss = fs.readFileSync(mainCssPath, 'utf8')
assert.match(mainCss, /visual-styles\.css/)

const themeSource = fs.readFileSync(themeStorePath, 'utf8')
assert.match(themeSource, /VISUAL_STYLE_STORAGE_KEY/)
assert.match(themeSource, /setVisualStyle/)
assert.match(themeSource, /currentVisualStyle/)
assert.match(themeSource, /applyVisualStyle/)

const settingsSource = fs.readFileSync(settingsPath, 'utf8')
assert.match(settingsSource, /visual-style-board/)
assert.match(settingsSource, /handleVisualStyleChange/)
assert.match(settingsSource, /availableVisualStyles/)
assert.match(settingsSource, /visualStyleTitle/)

// 轻量 DOM 替身，避免依赖 jsdom
const styleProps = new Map()
const dataset = {}
const root = {
  style: {
    setProperty(name, value) {
      styleProps.set(name, String(value))
    },
    getPropertyValue(name) {
      return styleProps.get(name) || ''
    }
  },
  dataset,
  setAttribute(name, value) {
    if (name === 'data-visual-style') dataset.visualStyle = value
  }
}

globalThis.document = {
  documentElement: root
}

const moduleUrl = pathToFileURL(path.resolve(servicePath)).href + `?t=${Date.now()}`
const {
  DEFAULT_VISUAL_STYLE,
  VISUAL_STYLE_ORDER,
  VISUAL_STYLE_STORAGE_KEY,
  visualStyleConfigs,
  resolveVisualStyleKey,
  getAvailableVisualStyles,
  getVisualStyleName,
  getVisualStyleTokens,
  applyVisualStyle
} = await import(moduleUrl)

assert.equal(DEFAULT_VISUAL_STYLE, 'classic')
assert.equal(VISUAL_STYLE_STORAGE_KEY, 'config.visualStyle')
assert.deepEqual(VISUAL_STYLE_ORDER, ['classic', 'apple', 'brutal', 'pixel'])
assert.equal(resolveVisualStyleKey('nope'), 'classic')
assert.equal(resolveVisualStyleKey('brutal'), 'brutal')
assert.equal(getVisualStyleName('apple'), 'Apple 极简')
assert.equal(getVisualStyleName('pixel'), '像素复古')
assert.equal(getVisualStyleName('brutal'), '粗犷野兽')

const list = getAvailableVisualStyles()
assert.equal(list.length, 4)
assert.ok(list.every((item) => item.key && item.name && item.description))

const brutal = getVisualStyleTokens('brutal')
assert.equal(brutal.borderWidth, '3px')
assert.match(brutal.shadowCard, /6px 6px 0/)
assert.equal(brutal.cardRadius, '4px')

const apple = getVisualStyleTokens('apple')
assert.equal(apple.pillRadius, '980px')
assert.equal(apple.surfaceBlur, '20px')

const pixel = getVisualStyleTokens('pixel')
assert.equal(pixel.cardRadius, '0px')
assert.equal(pixel.pixelate, '1')

applyVisualStyle('brutal')
assert.equal(root.dataset.visualStyle, 'brutal')
assert.equal(root.style.getPropertyValue('--theme-border-width').trim(), '3px')
assert.equal(root.style.getPropertyValue('--theme-card-radius').trim(), '4px')
assert.match(root.style.getPropertyValue('--theme-shadow-card'), /6px 6px 0/)

applyVisualStyle('apple')
assert.equal(root.dataset.visualStyle, 'apple')
assert.equal(root.style.getPropertyValue('--theme-pill-radius').trim(), '980px')
assert.equal(root.style.getPropertyValue('--theme-surface-blur').trim(), '20px')

applyVisualStyle('pixel')
assert.equal(root.dataset.visualStyle, 'pixel')
assert.equal(root.style.getPropertyValue('--theme-card-radius').trim(), '0px')

applyVisualStyle('classic')
assert.equal(root.dataset.visualStyle, 'classic')

const css = fs.readFileSync(cssPath, 'utf8')
assert.match(css, /data-visual-style='brutal'/)
assert.match(css, /data-visual-style='apple'/)
assert.match(css, /data-visual-style='pixel'/)
assert.match(css, /studio-shell \.ProseMirror/)
assert.match(css, /prefers-reduced-motion/)
assert.match(css, /creation-library-page/)
assert.match(css, /data-color-scheme='dark'/)
assert.match(css, /#0a84ff/)

// themeService 输出 data-theme / data-color-scheme，供 Apple 暗色正交叠加
const themeServiceSource = fs.readFileSync('src/renderer/src/service/themeService.js', 'utf8')
assert.match(themeServiceSource, /data-color-scheme/)
assert.match(themeServiceSource, /dataset\.colorScheme/)
assert.match(themeServiceSource, /dataset\.theme/)
assert.match(themeSource, /setVisualStyle/)
assert.match(themeSource, /VISUAL_STYLE_STORAGE_KEY/)

for (const key of VISUAL_STYLE_ORDER) {
  assert.ok(visualStyleConfigs[key], `缺少风格 ${key}`)
  assert.ok(visualStyleConfigs[key].tokens.cardRadius)
  assert.ok(visualStyleConfigs[key].preview.bg)
}

console.log('视觉风格层测试通过')

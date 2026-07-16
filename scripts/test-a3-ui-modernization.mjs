import assert from 'node:assert/strict'
import fs from 'node:fs'

const home = fs.readFileSync('src/renderer/src/views/Home.vue', 'utf8')
assert.match(home, /data-testid="home-bento-strip"/)
assert.match(home, /bentoTiles/)
assert.match(home, /today-words/)
assert.match(home, /continue/)
assert.match(home, /class="bento-strip"/)
assert.match(home, /--theme-card-radius/)

const settings = fs.readFileSync('src/renderer/src/views/SystemSettings.vue', 'utf8')
assert.match(settings, /theme-list/)
assert.match(settings, /theme-swatch/)
assert.match(settings, /theme-row/)
assert.match(settings, /themeRowHint/)
assert.doesNotMatch(settings, /class="theme-card"/)

const layout = fs.readFileSync('src/renderer/src/layouts/AppLayout.vue', 'utf8')
assert.match(layout, /app-sidebar-toggle/)
assert.match(layout, /sidebar-header/)
assert.match(layout, /PanelLeftOpen/)
assert.match(layout, /PanelLeftClose/)
assert.match(layout, /data-testid="sidebar-collapse-toggle"/)
assert.doesNotMatch(layout, /ChevronLeft/)
assert.doesNotMatch(layout, /收起<\/span>/)
// 收缩按钮应在 logo 旁 header 内，而非底部 collapse-control
assert.match(layout, /class="sidebar-header"/)
assert.ok(
  layout.indexOf('sidebar-header') < layout.indexOf('app-menu'),
  'sidebar-header 应在主导航之前'
)

const empty = fs.readFileSync('src/renderer/src/components/ui/UiEmptyState.vue', 'utf8')
assert.match(empty, /ui-empty-state/)
assert.match(empty, /primaryText/)
assert.match(empty, /--theme-border-width/)

const surface = fs.readFileSync('src/renderer/src/components/ui/UiSurface.vue', 'utf8')
assert.match(surface, /ui-surface/)
assert.match(surface, /interactive/)

const marketEmpty = fs.readFileSync(
  'src/renderer/src/components/Market/MarketEmptyState.js',
  'utf8'
)
assert.match(marketEmpty, /UiEmptyState/)

const book = fs.readFileSync('src/renderer/src/components/Book.vue', 'utf8')
assert.match(book, /--theme-card-radius/)
assert.match(book, /--theme-shadow-card/)

const bookshelf = fs.readFileSync('src/renderer/src/components/Bookshelf.vue', 'utf8')
assert.match(bookshelf, /--theme-card-radius/)

const market = fs.readFileSync('src/renderer/src/views/MarketInspiration.vue', 'utf8')
assert.match(market, /--theme-control-radius/)
assert.match(market, /\.dark-button:hover/)

const visualCss = fs.readFileSync('src/renderer/src/assets/styles/visual-styles.css', 'utf8')
assert.doesNotMatch(visualCss, /fonts\.googleapis\.com/)
assert.match(visualCss, /visual-style-fonts\.css/)
// Apple 设置页应去掉和纸纹理，并统一右栏主题卡
assert.match(visualCss, /data-visual-style='apple'\] \.settings-nav/)
assert.match(visualCss, /data-visual-style='apple'\] \.theme-row/)
assert.match(visualCss, /data-visual-style='apple'\] \.app-sidebar-toggle/)
assert.match(visualCss, /background-image: none !important/)
assert.match(visualCss, /#0071e3/)
assert.match(visualCss, /settings-body/)
assert.match(visualCss, /rgba\(246, 246, 246, 0\.82\)/)
assert.match(visualCss, /rgba\(0, 113, 227, 0\.12\)/)
assert.match(visualCss, /sidebar-header/)
// Apple 首页：无衬线标题 + 白卡 Bento，不再吃和纸宋体/重阴影
assert.match(visualCss, /data-visual-style='apple'\] \.dashboard-header h1/)
assert.match(visualCss, /data-visual-style='apple'\] \.bento-tile/)
assert.match(visualCss, /data-visual-style='apple'\] \.dashboard-card/)
assert.match(visualCss, /SF Pro Display/)
assert.match(visualCss, /background: #ffffff !important/)
// 书架 / 创作台 / Apple 暗色
assert.match(visualCss, /data-visual-style='apple'\] \.creation-library-page/)
assert.match(visualCss, /data-visual-style='apple'\] \.book-card/)
assert.match(visualCss, /data-visual-style='apple'\] \.studio-shell \.ProseMirror/)
assert.match(visualCss, /data-visual-style='apple'\]\[data-color-scheme='dark'\]/)
assert.match(visualCss, /#0a84ff/)
assert.match(visualCss, /#1c1c1e/)

const themeStore = fs.readFileSync('src/renderer/src/stores/theme.js', 'utf8')
assert.match(themeStore, /data-color-scheme/)
assert.match(themeStore, /dataset\.colorScheme/)
assert.match(themeStore, /dataset\.theme/)

const fontCss = fs.readFileSync(
  'src/renderer/src/assets/fonts/visual-style-fonts.css',
  'utf8'
)
assert.match(fontCss, /Dreamloom Pixel/)
assert.match(fontCss, /Dreamloom Brutal/)
assert.match(fontCss, /local\(/)

const visualService = fs.readFileSync(
  'src/renderer/src/service/visualStyleService.js',
  'utf8'
)
assert.match(visualService, /Dreamloom Pixel/)
assert.match(visualService, /Dreamloom Brutal/)

console.log('A3 组件现代化扩展测试通过')

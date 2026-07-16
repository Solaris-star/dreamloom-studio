import assert from 'node:assert/strict'
import fs from 'node:fs'

const home = fs.readFileSync('src/renderer/src/views/Home.vue', 'utf8')
assert.match(home, /data-testid="home-bento-strip"/)
assert.match(home, /bentoTiles/)
assert.match(home, /today-words/)
assert.match(home, /continue/)
assert.match(home, /class="bento-strip"/)
assert.match(home, /--theme-card-radius/)

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

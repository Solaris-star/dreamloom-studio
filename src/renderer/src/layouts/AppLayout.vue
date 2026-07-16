<template>
  <div
    class="app-shell"
    :class="{
      'studio-shell': isStudioRoute,
      'sidebar-collapsed': sidebarCollapsed
    }"
    :style="{
      '--sidebar-width': sidebarWidth + 'px',
      gridTemplateColumns: 'var(--sidebar-width) minmax(0, 1fr)'
    }"
  >
    <a
      class="skip-link"
      href="#app-main"
    >跳到主要内容</a>
    <aside
      class="app-sidebar"
      :class="{ collapsed: sidebarCollapsed }"
      :aria-expanded="collapseAriaExpanded"
    >
      <div class="sidebar-content-wrapper">
        <!-- Finder/Notes 布局：logo 与侧栏开关同排 -->
        <div class="sidebar-header">
          <button
            v-motion-feedback
            class="app-logo"
            type="button"
            aria-label="首页"
            title="首页"
            @click="router.push('/dashboard')"
          >
            <img
              :src="brandLogoUrl"
              alt="织梦工坊"
            >
          </button>
          <el-tooltip
            :content="collapseToggleText"
            placement="right"
            :show-after="200"
            :disabled="isMobileViewport"
            :offset="12"
            :show-arrow="false"
            popper-class="app-nav-tooltip"
          >
            <button
              v-motion-feedback
              class="app-sidebar-toggle"
              type="button"
              data-testid="sidebar-collapse-toggle"
              :aria-label="collapseToggleText"
              aria-controls="app-main-nav"
              :title="collapseToggleText"
              @click="toggleSidebarCollapse"
            >
              <span
                class="app-menu-icon"
                aria-hidden="true"
              >
                <component
                  :is="sidebarCollapsed ? PanelLeftOpen : PanelLeftClose"
                  v-bind="toggleIconProps"
                />
              </span>
            </button>
          </el-tooltip>
        </div>

        <nav
          id="app-main-nav"
          class="app-menu"
          aria-label="主导航"
        >
          <div
            v-for="item in navigationItems"
            :key="item.key"
            class="app-menu-group"
          >
            <el-tooltip
              :content="item.label"
              placement="right"
              :show-after="280"
              :disabled="!sidebarCollapsed || isMobileViewport"
              :offset="12"
              :show-arrow="false"
              popper-class="app-nav-tooltip"
            >
              <button
                v-motion-feedback
                class="app-menu-item"
                :class="{ active: isActive(item) }"
                :aria-current="isActive(item) ? 'page' : undefined"
                :aria-label="item.label"
                :title="sidebarCollapsed ? item.label : undefined"
                type="button"
                :data-testid="`nav-item-${item.key}`"
                @mouseenter="prefetchNavItem(item)"
                @focus="prefetchNavItem(item)"
                @click="handleNavigate(item)"
              >
                <span
                  class="app-menu-icon"
                  aria-hidden="true"
                >
                  <component
                    :is="item.icon"
                    v-bind="iconProps"
                  />
                </span>
                <span class="app-menu-label">{{ item.label }}</span>
              </button>
            </el-tooltip>

            <div
              v-if="
                subItemsFor(item).length &&
                  isActive(item) &&
                  (!sidebarCollapsed || isMobileViewport)
              "
              class="app-submenu"
              :aria-label="`${item.label}子导航`"
            >
              <button
                v-for="subItem in subItemsFor(item)"
                :key="subItem.path"
                v-motion-feedback
                class="app-submenu-item"
                :class="{ active: isSubActive(subItem) }"
                :aria-current="isSubActive(subItem) ? 'page' : undefined"
                type="button"
                @mouseenter="prefetchPath(subItem.path)"
                @focus="prefetchPath(subItem.path)"
                @click="router.push(subItem.path)"
              >
                {{ subItem.label }}
              </button>
            </div>
          </div>
        </nav>

        <div
          v-if="!sidebarCollapsed"
          class="app-sidebar-footer"
        >
          <span>v{{ currentVersion || '-' }}</span>
        </div>
      </div>
      <div
        v-if="!sidebarCollapsed"
        class="sidebar-resizer"
        aria-hidden="true"
        @mousedown="startSidebarResize"
      />
    </aside>

    <main
      id="app-main"
      class="app-main"
      tabindex="-1"
      :class="{
        'knowledge-library-main': isKnowledgeLibraryRoute,
        'studio-main': isStudioRoute,
        'map-design-main': isMapDesignRoute
      }"
    >
      <router-view v-slot="{ Component, route: viewRoute }">
        <!--
          不要再包 out-in + gsap transition：
          keep-alive 复用节点时 leave 动画会把 opacity/visibility 留在 0，
          再点回来右侧整页空白，只能硬刷恢复。
        -->
        <keep-alive
          :include="cachedRouteNames"
          :max="8"
        >
          <component
            :is="Component"
            :key="routeViewKey(viewRoute)"
          />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BarChart2,
  BookOpen,
  Home,
  Library,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  TrendingUp
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { readBooksDir } from '@renderer/service/books'
import { useMainStore } from '@renderer/stores'
import {
  MOBILE_MEDIA_QUERY,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_MAX,
  SIDEBAR_EXPANDED_MIN,
  collapseToggleLabel,
  isSidebarCollapsed,
  nextSidebarWidthOnToggle,
  readSidebarWidth,
  rememberExpandedWidth,
  writeSidebarWidth
} from '@renderer/service/sidebarLayout'
import { getStoreValue, setStoreValue } from '@renderer/service/webStore'
import brandLogoUrl from '@renderer/assets/images/logo_web.webp'

const route = useRoute()
const router = useRouter()
const mainStore = useMainStore()
const currentVersion = ref(import.meta.env.VITE_APP_VERSION || 'web')
const iconProps = { size: 20, strokeWidth: 2 }
const toggleIconProps = { size: 18, strokeWidth: 2 }
/** 与视图 `defineOptions({ name })` 一致；勿缓存 Auth / NotFound / 权限敏感页 */
const cachedRouteNames = [
  'Editor',
  'Dashboard',
  'CreationLibrary',
  'AiWorkshop',
  'OutlineManager',
  'SystemSettings',
  'MarketInspiration',
  'Analytics'
]
const isMobileViewport = ref(false)
const prefetchedRoutes = new Set()
const NAV_PREFETCH_PATHS = [
  '/dashboard',
  '/editor',
  '/knowledge',
  '/ai/creation-starter',
  '/market/overview',
  '/analytics/overview',
  '/settings/general',
  '/map-list'
]

let mobileMediaQuery = null
let idlePrefetchHandle = 0

const sidebarWidth = ref(readSidebarWidth())
const sidebarCollapsed = computed(() => isSidebarCollapsed(sidebarWidth.value))
const collapseToggleText = computed(() => collapseToggleLabel(sidebarCollapsed.value))
const collapseAriaExpanded = computed(() => (sidebarCollapsed.value ? 'false' : 'true'))

// 主导航入口：中文文案、高频优先；不挂导入导出 / 小说下载
const navigationItems = [
  {
    key: 'dashboard',
    label: '首页',
    path: '/dashboard',
    match: ['/dashboard'],
    icon: markRaw(Home)
  },
  { key: 'editor', label: '创作台', path: '/editor', match: ['/editor'], icon: markRaw(BookOpen) },
  {
    key: 'knowledgeLibrary',
    label: '创作库',
    path: '/knowledge',
    match: ['/knowledge', '/knowledge-library', '/creative-library', '/books'],
    icon: markRaw(Library)
  },
  {
    key: 'aiWorkshop',
    label: 'AI 工坊',
    path: '/ai/creation-starter',
    match: ['/ai'],
    icon: markRaw(Sparkles)
  },
  {
    key: 'maps',
    label: '地图设计',
    path: '/map-list',
    match: ['/map-list', '/map-design'],
    icon: markRaw(MapIcon)
  },
  {
    key: 'market',
    label: '市场灵感',
    path: '/market/overview',
    match: ['/market'],
    icon: markRaw(TrendingUp)
  },
  {
    key: 'analytics',
    label: '数据中心',
    path: '/analytics/overview',
    match: ['/analytics'],
    icon: markRaw(BarChart2)
  },
  {
    key: 'settings',
    label: '系统设置',
    path: '/settings/general',
    match: ['/settings'],
    icon: markRaw(Settings)
  }
]

// 侧栏子项只保留高频入口；完整分区仍由页面内二级导航承载
const aiSubItems = [
  { label: '创作起笔', path: '/ai/creation-starter' },
  { label: '文本处理', path: '/ai/text-tools' },
  { label: '剧情规划', path: '/ai/plot' },
  { label: '任务队列', path: '/ai/queue' }
]

const knowledgeSubItems = [
  { label: '作品书架', path: '/knowledge' },
  { label: '素材箱', path: '/knowledge/materials' },
  { label: '图库', path: '/knowledge/images' },
  { label: '提示词', path: '/knowledge/prompts' }
]

function persistSidebarWidth(width) {
  sidebarWidth.value = writeSidebarWidth(width)
}

function syncMobileViewport() {
  isMobileViewport.value = Boolean(mobileMediaQuery?.matches)
}

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  mobileMediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  syncMobileViewport()
  if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', syncMobileViewport)
  } else if (typeof mobileMediaQuery.addListener === 'function') {
    mobileMediaQuery.addListener(syncMobileViewport)
  }

  // 空闲时预取高频路由 chunk，首次点击不再干等懒加载
  const runIdlePrefetch = () => {
    NAV_PREFETCH_PATHS.forEach((path) => prefetchPath(path))
  }
  if (typeof window.requestIdleCallback === 'function') {
    idlePrefetchHandle = window.requestIdleCallback(runIdlePrefetch, { timeout: 2500 })
  } else {
    idlePrefetchHandle = window.setTimeout(runIdlePrefetch, 800)
  }
})

onBeforeUnmount(() => {
  if (!mobileMediaQuery) return
  if (typeof mobileMediaQuery.removeEventListener === 'function') {
    mobileMediaQuery.removeEventListener('change', syncMobileViewport)
  } else if (typeof mobileMediaQuery.removeListener === 'function') {
    mobileMediaQuery.removeListener(syncMobileViewport)
  }
  if (typeof window !== 'undefined') {
    if (typeof window.cancelIdleCallback === 'function' && idlePrefetchHandle) {
      window.cancelIdleCallback(idlePrefetchHandle)
    } else if (idlePrefetchHandle) {
      window.clearTimeout(idlePrefetchHandle)
    }
  }
})

const isKnowledgeLibraryRoute = computed(
  () =>
    route.path.startsWith('/knowledge') ||
    route.path.startsWith('/knowledge-library') ||
    route.path.startsWith('/creative-library')
)

const isStudioRoute = computed(() => route.path === '/editor' || route.path.startsWith('/editor/'))

const isMapDesignRoute = computed(() => route.path === '/map-design')

function isActive(item) {
  if (item.key === 'editor' && isStudioRoute.value) return true
  if (item.key === 'aiWorkshop' && isStudioRoute.value) return false
  if (item.key === 'knowledgeLibrary' && route.path.startsWith('/knowledge/books/')) return true
  if (item.key === 'knowledgeLibrary' && isStudioRoute.value) return false
  return item.match.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`))
}

function isSubActive(item) {
  if (item.path === '/knowledge') return route.path === '/knowledge'
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

function subItemsFor(item) {
  if (item.key === 'aiWorkshop') return aiSubItems
  if (item.key === 'knowledgeLibrary') return knowledgeSubItems
  return []
}

async function handleNavigate(item) {
  prefetchNavItem(item)

  if (item.key === 'editor') {
    await openEditorEntry()
    return
  }

  if (item.key === 'maps') {
    await openMapEntry()
    return
  }

  if (route.path !== item.path) {
    await router.push(item.path)
  }
}

function prefetchNavItem(item) {
  if (!item) return
  if (item.path) prefetchPath(item.path)
  if (item.key === 'editor') {
    prefetchPath('/editor')
    // 预热书架列表，创作台入口不再被首次 list 卡住
    void readBooksDir().catch(() => {})
  }
  if (item.key === 'maps') {
    prefetchPath('/map-list')
    void readBooksDir().catch(() => {})
  }
  subItemsFor(item).forEach((sub) => prefetchPath(sub.path))
}

function prefetchPath(path) {
  const target = String(path || '').trim()
  if (!target || prefetchedRoutes.has(target)) return
  prefetchedRoutes.add(target)
  try {
    const resolved = router.resolve(target)
    const matched = resolved?.matched || []
    matched.forEach((record) => {
      const components = record.components || {}
      Object.values(components).forEach((comp) => {
        if (typeof comp === 'function') {
          Promise.resolve(comp()).catch(() => {})
        }
      })
    })
  } catch {
    prefetchedRoutes.delete(target)
  }
}

function getCachedBooks() {
  const books = mainStore.books
  return Array.isArray(books) ? books : []
}

async function openEditorEntry() {
  if (isStudioRoute.value && (route.params.bookId || route.query.name)) return

  // 先用本地 pinia 缓存瞬间跳转；没有缓存再等接口
  const cachedBooks = getCachedBooks()
  if (cachedBooks.length) {
    await navigateToEditorBook(cachedBooks)
    // 后台刷新书架，不阻塞跳转
    void readBooksDir().catch(() => {})
    return
  }

  let books
  try {
    books = await readBooksDir()
  } catch (error) {
    console.warn('读取书架失败，无法进入最近作品:', error)
    ElMessage.error(error?.message || '读取书架失败')
    return
  }

  await navigateToEditorBook(books)
}

async function navigateToEditorBook(books = []) {
  try {
    const lastActiveBookId = await readLastActiveBookId()
    const lastBook = books.find((book) => bookMatchesId(book, lastActiveBookId))
    const targetBook = lastBook || books[0]

    if (targetBook) {
      const id = getBookRouteId(targetBook)
      if (!id) {
        await router.push('/editor')
        return
      }

      await writeLastActiveBookId(id)
      await router.push({
        path: `/editor/${encodeURIComponent(id)}`,
        query: buildBookQuery(targetBook)
      })
      return
    }
  } catch (error) {
    console.warn('打开最近作品失败，已进入默认页面:', error)
  }

  await router.push('/editor')
}

async function openMapEntry() {
  if ((route.path === '/map-list' || route.path === '/map-design') && route.query.name) return

  const tryNavigate = async (books) => {
    const lastActiveBookId = await readLastActiveBookId()
    const lastBook = books.find((book) => bookMatchesId(book, lastActiveBookId))
    const targetBook = lastBook || books[0]

    if (!targetBook) return false

    const id = getBookRouteId(targetBook)
    if (id) await writeLastActiveBookId(id)

    const query = buildBookQuery(targetBook)
    if (!query.name) {
      ElMessage.error('作品名称为空，无法进入地图设计')
      return true
    }

    await router.push({
      path: '/map-list',
      query
    })
    return true
  }

  try {
    const cachedBooks = getCachedBooks()
    if (cachedBooks.length && (await tryNavigate(cachedBooks))) {
      void readBooksDir().catch(() => {})
      return
    }

    const books = await readBooksDir()
    if (await tryNavigate(books)) return

    ElMessage.warning('请先创建一个作品，再进入地图设计')
    await router.push('/knowledge')
  } catch (error) {
    console.warn('打开地图设计失败:', error)
    ElMessage.error(error?.message || '打开地图设计失败')
  }
}

function bookMatchesId(book = {}, id = '') {
  if (!id) return false
  return [book.id, book.folderName, book.name].filter(Boolean).map(String).includes(String(id))
}

function getBookRouteId(book = {}) {
  return String(book.id || book.folderName || book.name || '')
}

function buildBookQuery(book = {}) {
  const name = book.folderName || book.name
  return name ? { name } : {}
}

async function readLastActiveBookId() {
  try {
    return String(await getStoreValue('lastActiveBookId', localStorage.getItem('lastActiveBookId')))
  } catch {
    return localStorage.getItem('lastActiveBookId') || ''
  }
}

async function writeLastActiveBookId(id) {
  const value = String(id || '')
  if (!value) return
  localStorage.setItem('lastActiveBookId', value)
  try {
    await setStoreValue('lastActiveBookId', value)
  } catch {
    // localStorage 已保存
  }
}

function startSidebarResize(e) {
  if (sidebarCollapsed.value || isMobileViewport.value) return
  e.preventDefault()
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function doResize(moveEvent) {
    const delta = moveEvent.clientX - startX
    const targetWidth = startWidth + delta

    if (targetWidth < 100) {
      persistSidebarWidth(SIDEBAR_COLLAPSED_WIDTH)
    } else {
      const clampedWidth = Math.max(
        SIDEBAR_EXPANDED_MIN,
        Math.min(SIDEBAR_EXPANDED_MAX, targetWidth)
      )
      persistSidebarWidth(Math.round(clampedWidth))
    }
  }

  function stopResize() {
    window.removeEventListener('mousemove', doResize)
    window.removeEventListener('mouseup', stopResize)
  }

  window.addEventListener('mousemove', doResize)
  window.addEventListener('mouseup', stopResize)
}

function toggleSidebarCollapse() {
  if (isMobileViewport.value) return
  if (!sidebarCollapsed.value) {
    rememberExpandedWidth(sidebarWidth.value)
  }
  persistSidebarWidth(nextSidebarWidthOnToggle(sidebarWidth.value))
}

function routeViewKey(viewRoute) {
  const name = viewRoute?.name
  // 编辑器按作品缓存，避免不同书籍状态串扰
  if (name === 'Editor' || name === 'EditorHome') {
    const bookId =
      viewRoute.params?.bookId ||
      (typeof viewRoute.query?.name === 'string' ? viewRoute.query.name : '') ||
      'default'
    return `Editor:${encodeURIComponent(String(bookId))}`
  }

  // 多路由共用同一组件：用稳定 key 复用实例，section/mode 走 props 更新
  if (
    name === 'KnowledgeBookshelf' ||
    name === 'KnowledgeMaterials' ||
    name === 'KnowledgeImages' ||
    name === 'KnowledgePrompts' ||
    name === 'KnowledgeTrash'
  ) {
    return 'CreationLibrary'
  }

  if (
    name === 'AiCreationStarter' ||
    name === 'AiTextTools' ||
    name === 'AiPlot' ||
    name === 'AiWorld' ||
    name === 'AiImage' ||
    name === 'AiPrompts' ||
    name === 'AiHistory'
  ) {
    return 'AiWorkshop'
  }

  if (name === 'Dashboard') return 'Dashboard'
  if (name === 'SystemSettings') return 'SystemSettings'
  if (name === 'MarketInspiration' || name === 'MarketOverview' || name === 'MarketRankings') {
    return 'MarketInspiration'
  }
  if (name === 'Analytics') return 'Analytics'
  if (name === 'OutlineManager') {
    const book = typeof viewRoute.query?.name === 'string' ? viewRoute.query.name : ''
    return `OutlineManager:${encodeURIComponent(book || 'default')}`
  }

  // 其余页面不进 keep-alive include；key 用 fullPath 即可
  return viewRoute?.fullPath || viewRoute?.path || 'route-view'
}
</script>

<style lang="scss" scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  width: 100%;
  height: 100vh;
  overflow: hidden;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 82% 10%, color-mix(in srgb, var(--primary-color, #6f7a68) 12%, transparent), transparent 30%),
    radial-gradient(circle at 35% 95%, color-mix(in srgb, var(--accent-color, #8a735d) 10%, transparent), transparent 34%),
    linear-gradient(90deg, color-mix(in srgb, var(--text-base, #3a3731) 4%, transparent) 1px, transparent 1px),
    var(--theme-app-background, var(--bg-primary, #f5f3ef));
  background-size:
    auto,
    auto,
    32px 32px,
    auto;
  color: var(--wabi-ink, var(--text-base, #2c2a26));
}

.skip-link {
  position: fixed;
  z-index: 3000;
  top: 12px;
  left: 12px;
  padding: 8px 14px;
  border: 2px solid var(--el-color-primary);
  border-radius: 6px;
  background: #ffffff;
  color: var(--el-color-primary-dark-2);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transform: translateY(calc(-100% - 16px));
  transition: transform 0.16s ease;
}

.skip-link:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--el-color-primary) 38%, transparent);
  outline-offset: 2px;
  transform: translateY(0);
}

.app-sidebar {
  position: relative;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--wabi-line, var(--border-color, #e1e4e8));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-soft, #ffffff) 96%, transparent),
      color-mix(in srgb, var(--bg-mute, #f1f3f5) 86%, transparent)
    ),
    var(--wabi-paper, var(--bg-soft, #fbfaf6));
  box-shadow: 10px 0 28px color-mix(in srgb, var(--text-base, #3a3731) 8%, transparent);
  color: var(--wabi-ink, var(--text-base, #2c2a26));
  transition: width 0.18s ease;
}

.sidebar-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow-x: hidden;
  padding: 14px 0;
  box-sizing: border-box;
}

.app-logo {
  display: block;
  width: 96px;
  margin: 0 auto 16px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;

  img {
    display: block;
    width: 100%;
    height: auto;
    filter: saturate(0.48) sepia(0.08) contrast(0.94);
  }

  &:focus-visible {
    outline: 2px solid rgba(111, 122, 104, 0.55);
    outline-offset: 2px;
  }
}

.app-menu {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.app-menu-group {
  position: relative;
  display: grid;
  gap: 0;
}

.app-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: calc(100% - 20px);
  margin: 0 10px 8px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--wabi-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  text-align: left;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    border-color: rgba(111, 122, 104, 0.22);
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-moss-dark);
  }

  &.active {
    border-color: rgba(111, 122, 104, 0.28);
    background: rgba(111, 122, 104, 0.16);
    color: var(--wabi-moss-dark);
    font-weight: 600;
    box-shadow: inset 3px 0 0 rgba(111, 122, 104, 0.56);
  }

  &:focus-visible {
    outline: 2px solid rgba(111, 122, 104, 0.55);
    outline-offset: 2px;
  }
}

.app-menu-label {
  display: inline-block;
  max-width: 86px;
  opacity: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-submenu {
  display: grid;
  gap: 4px;
  margin: -4px 10px 10px 42px;
  padding: 4px 0 2px 10px;
  border-left: 1px solid rgba(111, 122, 104, 0.22);
}

.app-submenu-item {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--theme-control-radius, 8px);
  background: transparent;
  color: var(--wabi-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  transition: all 0.18s ease;

  &:hover,
  &.active {
    border-color: var(--wabi-line);
    background: var(--theme-hover-background);
    color: var(--wabi-moss-dark);
  }

  &.active {
    background: var(--theme-active-background);
    font-weight: 600;
  }

  &:focus-visible {
    outline: 2px solid rgba(111, 122, 104, 0.55);
    outline-offset: 1px;
  }
}

.app-menu-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: inherit;

  :deep(svg) {
    stroke: currentColor;
  }
}


.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 10px 12px;
}

.sidebar-header .app-logo {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.sidebar-header .app-sidebar-toggle {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--theme-control-radius, 10px);
  background: transparent;
  color: var(--wabi-ink-soft, #6b655c);
  cursor: pointer;
}

.sidebar-header .app-sidebar-toggle:hover {
  border-color: rgba(111, 122, 104, 0.22);
  background: rgba(251, 250, 246, 0.72);
  color: var(--wabi-moss-dark, #424f3c);
}

/* 侧栏开关已上移到 logo 旁，底部控制隐藏 */
.sidebar-collapse-control {
  display: none;
}

.sidebar-collapse-control {
  display: flex;
  justify-content: center;
  padding: 4px 10px 8px;
  margin-top: 4px;
}

.app-sidebar-toggle {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--wabi-ink-soft);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    border-color: rgba(111, 122, 104, 0.22);
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-moss-dark);
  }

  &:focus-visible {
    outline: 2px solid rgba(111, 122, 104, 0.55);
    outline-offset: 2px;
  }
}

.app-sidebar-footer {
  padding: 0 16px;
  margin-top: auto;
  color: var(--wabi-muted);
  font-size: 12px;
}

.app-main {
  min-width: 0;
  min-height: 0;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  padding: clamp(24px, 3vw, 48px) clamp(28px, 4vw, 72px);
}

.app-main.knowledge-library-main {
  padding-inline: clamp(20px, 2.4vw, 36px);
}

.app-main.studio-main {
  padding: 10px 12px 10px 0;
  overflow: hidden;
  background: var(
    --theme-app-background,
    linear-gradient(90deg, rgba(58, 55, 49, 0.022) 1px, transparent 1px),
    linear-gradient(180deg, rgba(58, 55, 49, 0.014) 1px, transparent 1px),
    #efe9dd
  );
  background-size:
    34px 34px,
    28px 28px,
    auto;
}

.app-main.map-design-main {
  --map-design-left-offset: var(--sidebar-width);

  padding: 0;
  overflow: hidden;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  display: flex;
  justify-content: center;

  &::after {
    content: '';
    width: 2px;
    height: 100%;
    background-color: transparent;
    transition: background-color 0.2s ease;
  }

  &:hover::after,
  &:active::after {
    background-color: rgba(111, 122, 104, 0.55);
  }
}

.app-sidebar.collapsed {
  .sidebar-header {
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    margin: 0 4px 12px;
  }

  .sidebar-header .app-logo {
    width: 36px;
    max-width: 36px;
    justify-content: center;
  }

  .sidebar-header .app-sidebar-toggle {
    width: 32px;
    height: 32px;
  }

  .sidebar-content-wrapper {
    padding: 14px 4px;
  }

  .app-logo {
    width: 36px;
    margin-bottom: 12px;
  }

  .app-menu-item {
    justify-content: center;
    width: calc(100% - 8px);
    padding: 10px;
    margin: 0 4px 8px;

    .app-menu-icon {
      margin: 0;
    }
  }

  .app-menu-label {
    display: none;
  }

  .app-submenu {
    display: none;
  }

  .sidebar-collapse-control {
    padding-inline: 4px;
  }

  .app-sidebar-toggle {
    width: 40px;
    height: 40px;
  }
}

@media (max-width: 760px) {
  .app-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) !important;
    height: auto;
    min-height: 100vh;
    overflow: visible;
    overflow-x: clip;
  }

  .app-sidebar,
  .app-sidebar.collapsed {
    position: fixed;
    z-index: 100;
    right: 0;
    bottom: 0;
    left: 0;
    display: block;
    width: 100% !important;
    height: calc(64px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--wabi-line, var(--border-color, #e1e4e8));
    border-right: 0;
    background: color-mix(in srgb, var(--bg-soft, #fbfaf6) 98%, transparent);
    box-shadow: 0 -8px 24px color-mix(in srgb, var(--text-base, #3a3731) 10%, transparent);
    transition: none;
  }

  .sidebar-content-wrapper {
    height: 64px;
    padding: 0 !important;
    overflow: visible;
  }

  .app-logo,
  .sidebar-header,
  .sidebar-collapse-control,
  .app-sidebar-footer,
  .sidebar-resizer {
    display: none !important;
  }

  .app-menu {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
  }

  .app-menu::-webkit-scrollbar {
    display: none;
  }

  .app-menu-group {
    position: static;
    display: flex;
    flex: 0 0 72px;
  }

  .app-menu-item,
  .app-sidebar.collapsed .app-menu-item {
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    width: 100%;
    min-width: 72px;
    min-height: 64px;
    margin: 0 !important;
    padding: 7px 4px 6px !important;
    border: 0;
    border-radius: 0;
    font-size: 11px;
    text-align: center;
  }

  .app-menu-item.active {
    box-shadow: inset 0 -3px 0 rgba(111, 122, 104, 0.68);
  }

  .app-menu-label,
  .app-sidebar.collapsed .app-menu-label {
    display: block !important;
    max-width: 68px;
  }

  .app-submenu {
    position: fixed;
    right: 0;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    left: 0;
    display: flex !important;
    gap: 4px;
    margin: 0;
    padding: 8px 10px;
    overflow-x: auto;
    border-top: 1px solid var(--wabi-line);
    border-left: 0;
    background: rgba(251, 250, 246, 0.98);
    box-shadow: 0 -6px 18px rgba(58, 55, 49, 0.06);
    scrollbar-width: none;
  }

  .app-submenu::-webkit-scrollbar {
    display: none;
  }

  .app-submenu-item {
    flex: 0 0 auto;
    min-height: 34px;
    white-space: nowrap;
  }

  .app-main {
    height: auto;
    min-width: 0;
    overflow: visible;
    padding: 16px 16px calc(80px + env(safe-area-inset-bottom, 0px));
  }

  .app-main.studio-main {
    height: 100vh;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .app-shell.studio-shell .app-sidebar {
    display: none;
  }

  :global(.el-overlay) {
    z-index: 2000 !important;
  }

  :global(.el-overlay-message-box),
  :global(.el-overlay-dialog) {
    box-sizing: border-box;
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }

  .app-main.map-design-main {
    --map-design-left-offset: 0px;
  }
}
</style>

<style lang="scss">
/* tooltip 挂到 body，需非 scoped；右偏移避免遮挡正文 */
.app-nav-tooltip.el-popper {
  z-index: 120 !important;
  max-width: 140px;
  padding: 6px 10px;
  border: 1px solid rgba(111, 122, 104, 0.22);
  border-radius: 8px;
  background: rgba(251, 250, 246, 0.98);
  box-shadow: 0 8px 20px rgba(58, 55, 49, 0.12);
  color: var(--wabi-ink, #3a3731);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
}
</style>

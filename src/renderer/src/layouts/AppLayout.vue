<template>
  <div
    class="app-shell"
    :class="{ 'studio-shell': isStudioRoute }"
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
      :class="{ collapsed: sidebarWidth < 100 }"
    >
      <div class="sidebar-content-wrapper">
        <button
          v-motion-feedback
          class="app-logo"
          type="button"
          aria-label="首页"
          @click="router.push('/dashboard')"
        >
          <img
            :src="brandLogoUrl"
            alt="织梦工坊"
          >
        </button>

        <nav
          class="app-menu"
          aria-label="主导航"
        >
          <div
            v-for="item in navigationItems"
            :key="item.key"
            class="app-menu-group"
          >
            <button
              v-motion-feedback
              class="app-menu-item"
              :class="{ active: isActive(item) }"
              :aria-current="isActive(item) ? 'page' : undefined"
              type="button"
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

            <div
              v-if="subItemsFor(item).length && isActive(item)"
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
                @click="router.push(subItem.path)"
              >
                {{ subItem.label }}
              </button>
            </div>
          </div>
        </nav>

        <!-- 折叠/展开快捷按钮：仅图标，避免长文案干扰 -->
        <div class="sidebar-collapse-control">
          <button
            v-motion-feedback
            class="app-sidebar-toggle"
            type="button"
            data-testid="sidebar-collapse-toggle"
            :aria-label="sidebarWidth < 100 ? '展开侧栏' : '收起侧栏'"
            :title="sidebarWidth < 100 ? '展开侧栏' : '收起侧栏'"
            @click="toggleSidebarCollapse"
          >
            <component
              :is="sidebarWidth < 100 ? PanelLeftOpen : PanelLeftClose"
              v-bind="iconProps"
              aria-hidden="true"
            />
          </button>
        </div>

        <div class="app-sidebar-footer">
          <span>v{{ currentVersion || '-' }}</span>
        </div>
      </div>
      <!-- Sidebar Resizer -->
      <div
        class="sidebar-resizer"
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
        <transition
          mode="out-in"
          :css="false"
          @before-enter="handlePageBeforeEnter"
          @enter="handlePageEnter"
          @leave="handlePageLeave"
        >
          <keep-alive
            :include="cachedRouteNames"
            :max="5"
          >
            <component
              :is="Component"
              :key="routeViewKey(viewRoute)"
            />
          </keep-alive>
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed, markRaw, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BarChart2,
  BookOpen,
  BookOpenText,
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
import { getStoreValue, setStoreValue } from '@renderer/service/webStore'
import { pageBeforeEnter, pageEnter, pageLeave } from '@renderer/composables/useMotion'
import brandLogoUrl from '@renderer/assets/images/logo_web.webp'

const route = useRoute()
const router = useRouter()
const currentVersion = ref(import.meta.env.VITE_APP_VERSION || 'web')
const iconProps = { size: 20, strokeWidth: 2 }
const cachedRouteNames = ['Editor']

const sidebarWidth = ref(Number(localStorage.getItem('sidebarWidth')) || 156)

const navigationItems = [
  {
    key: 'dashboard',
    label: '首页',
    path: '/dashboard',
    match: ['/dashboard'],
    icon: markRaw(Library)
  },
  { key: 'editor', label: '创作台', path: '/editor', match: ['/editor'], icon: markRaw(BookOpen) },
  {
    key: 'maps',
    label: '地图设计',
    path: '/map-list',
    match: ['/map-list', '/map-design'],
    icon: markRaw(MapIcon)
  },
  {
    key: 'knowledgeLibrary',
    label: '创作库',
    path: '/knowledge',
    match: ['/knowledge', '/knowledge-library', '/creative-library', '/books'],
    icon: markRaw(BookOpenText)
  },
  {
    key: 'aiWorkshop',
    label: 'AI 工坊',
    path: '/ai/creation-starter',
    match: ['/ai'],
    icon: markRaw(Sparkles)
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

const aiSubItems = [
  { label: '创作起笔', path: '/ai/creation-starter' },
  { label: '文本处理', path: '/ai/text-tools' },
  { label: '剧情规划', path: '/ai/plot' },
  { label: '人物世界', path: '/ai/world' },
  { label: '图像生成', path: '/ai/image' },
  { label: '任务队列', path: '/ai/queue' },
  { label: '提示词调用', path: '/ai/prompts' },
  { label: '生成历史', path: '/ai/history' }
]

const knowledgeSubItems = [
  { label: '作品书架', path: '/knowledge' },
  { label: '素材箱', path: '/knowledge/materials' },
  { label: '图库', path: '/knowledge/images' },
  { label: '提示词', path: '/knowledge/prompts' },
  { label: '回收站', path: '/knowledge/trash' }
]

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

async function openEditorEntry() {
  if (isStudioRoute.value && (route.params.bookId || route.query.name)) return

  let books
  try {
    books = await readBooksDir()
  } catch (error) {
    console.warn('读取书架失败，无法进入最近作品:', error)
    ElMessage.error(error?.message || '读取书架失败')
    return
  }

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

  let books
  try {
    books = await readBooksDir()
  } catch (error) {
    console.warn('读取书架失败，无法进入地图设计:', error)
    ElMessage.error(error?.message || '读取书架失败')
    return
  }

  try {
    const lastActiveBookId = await readLastActiveBookId()
    const lastBook = books.find((book) => bookMatchesId(book, lastActiveBookId))
    const targetBook = lastBook || books[0]

    if (!targetBook) {
      ElMessage.warning('请先创建一个作品，再进入地图设计')
      await router.push('/knowledge')
      return
    }

    const id = getBookRouteId(targetBook)
    if (id) await writeLastActiveBookId(id)

    const query = buildBookQuery(targetBook)
    if (!query.name) {
      ElMessage.error('作品名称为空，无法进入地图设计')
      return
    }

    await router.push({
      path: '/map-list',
      query
    })
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
  e.preventDefault()
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function doResize(moveEvent) {
    const delta = moveEvent.clientX - startX
    const targetWidth = startWidth + delta

    if (targetWidth < 100) {
      sidebarWidth.value = 64
      localStorage.setItem('sidebarWidth', '64')
    } else {
      const clampedWidth = Math.max(120, Math.min(320, targetWidth))
      sidebarWidth.value = clampedWidth
      localStorage.setItem('sidebarWidth', String(clampedWidth))
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
  if (sidebarWidth.value < 100) {
    sidebarWidth.value = 156
    localStorage.setItem('sidebarWidth', '156')
  } else {
    sidebarWidth.value = 64
    localStorage.setItem('sidebarWidth', '64')
  }
}

function routeViewKey(viewRoute) {
  if (viewRoute?.name === 'Editor' || viewRoute?.name === 'EditorHome') {
    return viewRoute.fullPath
  }

  return viewRoute?.fullPath || viewRoute?.path || 'route-view'
}

function handlePageBeforeEnter(el) {
  pageBeforeEnter(el, pageMotionOptions(el))
}

function handlePageEnter(el, done) {
  pageEnter(el, done, pageMotionOptions(el))
}

function handlePageLeave(el, done) {
  pageLeave(el, done, pageMotionOptions(el))
}

function pageMotionOptions(el) {
  const compact = isSmallViewport() || isStudioRoute.value || isEditorRouteElement(el)
  return {
    compact,
    fallbackMs: compact ? 180 : 420
  }
}

function isSmallViewport() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
}

function isEditorRouteElement(el) {
  return Boolean(el?.classList?.contains('editor-page') || el?.querySelector?.('.editor-page'))
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
    radial-gradient(circle at 82% 10%, rgba(111, 122, 104, 0.07), transparent 30%),
    radial-gradient(circle at 35% 95%, rgba(138, 115, 93, 0.06), transparent 34%),
    linear-gradient(90deg, rgba(58, 55, 49, 0.018) 1px, transparent 1px), #f5f3ef;
  background-size:
    auto,
    auto,
    32px 32px,
    auto;
  color: var(--wabi-ink);
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
  position: relative; /* ensure absolute positioning of resizer */
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--wabi-line);
  background:
    linear-gradient(180deg, rgba(251, 250, 246, 0.96), rgba(240, 236, 227, 0.86)), var(--wabi-paper);
  box-shadow: 10px 0 28px rgba(58, 55, 49, 0.04);
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

  img {
    display: block;
    width: 100%;
    height: auto;
    filter: saturate(0.48) sepia(0.08) contrast(0.94);
  }
}

.app-menu {
  display: flex;
  flex: 1;
  flex-direction: column;
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
}

.app-menu-label {
  display: inline-block;
  max-width: 86px;
  opacity: 1;
  white-space: nowrap;
}

.sidebar-collapse-control {
  display: flex;
  justify-content: center;
  margin: 4px 10px 10px;
}

.app-sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--theme-control-radius, 10px);
  background: transparent;
  color: var(--wabi-ink-soft, #6b655c);
  cursor: pointer;
  transition:
    background-color var(--theme-transition-duration, 180ms) ease,
    border-color var(--theme-transition-duration, 180ms) ease,
    color var(--theme-transition-duration, 180ms) ease,
    transform var(--theme-transition-duration, 180ms) ease,
    box-shadow var(--theme-transition-duration, 180ms) ease;

  &:hover {
    border-color: rgba(111, 122, 104, 0.22);
    background: rgba(251, 250, 246, 0.72);
    color: var(--wabi-moss-dark, #424f3c);
    transform: var(--theme-button-transform-hover, translateY(-1px));
  }

  &:active {
    transform: var(--theme-button-transform-active, translateY(0));
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--el-color-primary, #52634b) 42%, transparent);
    outline-offset: 2px;
  }
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
}

.app-menu-icon {
  display: inline-flex;
  color: inherit;

  :deep(svg) {
    stroke: currentColor;
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

@media (max-width: 760px) {
  .app-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) !important;
    height: auto;
    min-height: 100vh;
    overflow: visible;
    overflow-x: clip;
  }

  .app-sidebar {
    position: fixed;
    z-index: 100;
    right: 0;
    bottom: 0;
    left: 0;
    display: block;
    width: 100%;
    height: 64px;
    border-top: 1px solid var(--wabi-line);
    border-right: 0;
    background: rgba(251, 250, 246, 0.98);
    box-shadow: 0 -8px 24px rgba(58, 55, 49, 0.08);
  }

  .sidebar-content-wrapper {
    height: 64px;
    padding: 0;
    overflow: visible;
  }

  .app-logo,
  .sidebar-collapse-control,
  .app-sidebar-footer,
  .sidebar-resizer {
    display: none;
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

  .app-menu-item {
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    min-width: 72px;
    min-height: 64px;
    margin: 0;
    padding: 7px 4px 6px;
    border: 0;
    border-radius: 0;
    font-size: 11px;
    text-align: center;
  }

  .app-menu-item.active {
    box-shadow: inset 0 -3px 0 rgba(111, 122, 104, 0.68);
  }

  .app-menu-label {
    display: block;
    max-width: 68px;
  }

  .app-submenu {
    position: fixed;
    right: 0;
    bottom: 64px;
    left: 0;
    display: flex;
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
    padding: 16px 16px 80px;
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
    padding-bottom: 64px;
  }

  .app-main.map-design-main {
    --map-design-left-offset: 0px;
  }
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
    background-color: rgba(99, 102, 241, 0.6); // primary theme highlight color
  }
}

.app-sidebar.collapsed {
  .sidebar-content-wrapper {
    padding: 14px 4px;
  }

  .app-logo {
    width: 36px;
    margin-bottom: 12px;
  }

  .app-menu-item {
    justify-content: center;
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
  .app-sidebar-footer {
    display: none;
  }
}
</style>

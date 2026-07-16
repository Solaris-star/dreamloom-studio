import './assets/styles/variables.scss'
import './assets/styles/icons.scss'
import './assets/styles/themes.css'
import './assets/main.css'
// 引入 iconfont SVG 图标（必须在应用初始化前加载）
import './assets/icons/iconfont.js'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useThemeStore } from './stores/theme'
import IconFont from './components/IconFont.vue'
import SvgIcon from './components/SvgIcon.vue'
import { i18n, initLocale } from './i18n'
import { installElementPlusMotion, installMotionDirectives } from './composables/useMotion'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)
installMotionDirectives(app)

// 全局注册图标组件
app.component('IconFont', IconFont)
app.component('SvgIcon', SvgIcon)

// 初始化主题
const themeStore = useThemeStore()
themeStore.initTheme()

// 先挂载应用，避免 initLocale 的异步 I/O 阻塞首屏与路由标题生效。
// 默认 locale 已是 zh-CN，initLocale 仅覆盖用户偏好，可在挂载后完成。
app.mount('#app')
installElementPlusMotion()
void initLocale()

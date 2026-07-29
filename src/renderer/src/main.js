import './assets/styles/variables.scss'
import './assets/styles/icons.scss'
import './assets/styles/themes.css'
import './assets/main.css'
import './assets/styles/archival-system-settings.scss'
// 引入 iconfont SVG 图标（必须在应用初始化前加载）
import './assets/icons/iconfont.js'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useThemeStore } from './stores/theme'

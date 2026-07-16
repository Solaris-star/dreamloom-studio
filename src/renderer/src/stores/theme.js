import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getStoreValue, setStoreValue } from '../service/webStore.js'
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME_KEY,
  themeConfigs,
  THEME_ALIASES,
  getSystemColorScheme,
  resolveThemeKey,
  getAvailableThemes as listAvailableThemes,
  getThemeName as lookupThemeName,
  getThemeConfig as lookupThemeConfig,
  applyTheme
} from '../service/themeService.js'
import {
  VISUAL_STYLE_STORAGE_KEY,
  DEFAULT_VISUAL_STYLE,
  getAvailableVisualStyles as listVisualStyles,
  getVisualStyleName as lookupVisualStyleName,
  getVisualStyleMeta as lookupVisualStyleMeta,
  resolveVisualStyleKey,
  applyVisualStyle
} from '../service/visualStyleService.js'

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref(DEFAULT_THEME_KEY)
  const currentVisualStyle = ref(DEFAULT_VISUAL_STYLE)
  const resolvedMode = ref(getSystemColorScheme())
  let mediaQuery = null
  let mediaHandler = null

  const getAvailableThemes = () => listAvailableThemes()
  const getThemeName = (theme) => lookupThemeName(theme)
  const getThemeConfig = (theme) => lookupThemeConfig(theme, resolvedMode.value)
  const getAvailableVisualStyles = () => listVisualStyles()
  const getVisualStyleName = (style) => lookupVisualStyleName(style)
  const getVisualStyleMeta = (style) => lookupVisualStyleMeta(style)

  const detachSystemListener = () => {
    if (mediaQuery && mediaHandler) {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', mediaHandler)
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(mediaHandler)
      }
    }
    mediaQuery = null
    mediaHandler = null
  }

  const attachSystemListener = () => {
    detachSystemListener()
    if (typeof window === 'undefined' || !window.matchMedia) return
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaHandler = (event) => {
      resolvedMode.value = event.matches ? 'dark' : 'light'
      if (currentTheme.value === 'default') {
        applyTheme('default', resolvedMode.value)
        applyVisualStyle(currentVisualStyle.value)
      }
    }
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', mediaHandler)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(mediaHandler)
    }
  }

  const initTheme = async () => {
    resolvedMode.value = getSystemColorScheme()
    attachSystemListener()
    try {
      const stored = await getStoreValue(THEME_STORAGE_KEY, DEFAULT_THEME_KEY)
      const theme = resolveThemeKey(stored)
      currentTheme.value = theme
      applyTheme(theme, resolvedMode.value)
      if (stored !== theme) {
        await setStoreValue(THEME_STORAGE_KEY, theme)
      }
    } catch (error) {
      console.warn('读取主题偏好失败，使用默认主题', error)
      currentTheme.value = DEFAULT_THEME_KEY
      applyTheme(DEFAULT_THEME_KEY, resolvedMode.value)
    }

    try {
      const style = await getStoreValue(VISUAL_STYLE_STORAGE_KEY, DEFAULT_VISUAL_STYLE)
      const resolvedStyle = resolveVisualStyleKey(style)
      currentVisualStyle.value = resolvedStyle
      applyVisualStyle(resolvedStyle)
    } catch (error) {
      console.warn('读取视觉风格失败，使用默认风格', error)
      currentVisualStyle.value = DEFAULT_VISUAL_STYLE
      applyVisualStyle(DEFAULT_VISUAL_STYLE)
    }
  }

  const setTheme = async (theme) => {
    const next = resolveThemeKey(theme)
    currentTheme.value = next
    applyTheme(next, resolvedMode.value)
    // 配色切换后重放视觉风格 token，避免被 applyTheme 覆盖圆角/阴影
    applyVisualStyle(currentVisualStyle.value)
    await setStoreValue(THEME_STORAGE_KEY, next)
  }

  const setVisualStyle = async (style) => {
    const resolved = resolveVisualStyleKey(style)
    currentVisualStyle.value = resolved
    applyVisualStyle(resolved)
    await setStoreValue(VISUAL_STYLE_STORAGE_KEY, resolved)
  }

  watch(currentTheme, (newTheme) => {
    applyTheme(newTheme, resolvedMode.value)
    applyVisualStyle(currentVisualStyle.value)
  })

  watch(currentVisualStyle, (newStyle) => {
    applyVisualStyle(newStyle)
  })

  return {
    currentTheme,
    currentVisualStyle,
    resolvedMode,
    initTheme,
    setTheme,
    setVisualStyle,
    getAvailableThemes,
    getAvailableVisualStyles,
    getThemeName,
    getVisualStyleName,
    getVisualStyleMeta,
    getThemeConfig,
    themeConfigs,
    THEME_ALIASES,
    resolveThemeKey,
    applyTheme
  }
})

export {
  themeConfigs,
  THEME_ALIASES,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_KEY,
  resolveThemeKey,
  applyTheme,
  getSystemColorScheme
} from '../service/themeService.js'

/**
 * 创作台 / 全站主题配置与 CSS 变量应用
 * 纯逻辑，无 Pinia 依赖，便于单元测试与 store 复用。
 */

export const THEME_STORAGE_KEY = 'config.theme'
export const DEFAULT_THEME_KEY = 'default'

/**
 * 主题键：
 * - default  默认（跟随系统 prefers-color-scheme，可手动优先）
 * - eyecare  护眼（低饱和暖米绿）
 * - light    白色
 * - parchment 羊皮纸
 * - dark     黑色
 */
export const themeConfigs = {
  default: {
    key: 'default',
    name: '默认',
    description: '跟随系统，浅色/深色自适应',
    light: {
      bgPrimary: '#F4F1EA',
      bgSoft: '#FBFAF6',
      bgMute: '#EBE6DB',
      bgSecondary: '#F0EBE1',
      textBase: '#2C2A26',
      textSecondary: '#6B655C',
      textGray: '#6B655C',
      textGrayLight: '#8A8378',
      textGrayLighter: '#B8B0A4',
      textGrayLightest: '#F5F2EB',
      accentColor: '#5F6B56',
      primaryColor: '#52634B',
      borderColor: '#D9D2C4',
      borderColorSoft: '#E8E2D6',
      successGreen: '#4F7A45',
      warningColor: '#B7791F',
      dangerColor: '#B54A3A',
      infoColor: '#3B6EA5',
      bannedWord: '#B54A3A',
      highlightSurface: '#E6E1D6',
      codeBg: '#EFE9DD',
      codeText: '#3A342C',
      selectionBg: 'rgba(82, 99, 75, 0.18)',
      selectionText: '#1F241C',
      shadowColor: 'rgba(44, 42, 38, 0.08)',
      isDark: false
    },
    dark: {
      bgPrimary: '#161616',
      bgSoft: '#1E1E1E',
      bgMute: '#2A2A2A',
      bgSecondary: '#242424',
      textBase: '#EDEDED',
      textSecondary: '#A8A8A8',
      textGray: '#A8A8A8',
      textGrayLight: '#8A8A8A',
      textGrayLighter: '#6B6B6B',
      textGrayLightest: '#2F2F2F',
      accentColor: '#8FA08A',
      primaryColor: '#8FA08A',
      borderColor: '#3A3A3A',
      borderColorSoft: '#2F2F2F',
      successGreen: '#5FBF7A',
      warningColor: '#E0A84A',
      dangerColor: '#F07178',
      infoColor: '#6BA3D6',
      bannedWord: '#F07178',
      highlightSurface: '#333333',
      codeBg: '#252525',
      codeText: '#E8E8E8',
      selectionBg: 'rgba(143, 160, 138, 0.28)',
      selectionText: '#F5F5F5',
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      isDark: true
    }
  },
  eyecare: {
    key: 'eyecare',
    name: '护眼',
    description: '低饱和暖米绿，长时间写作更柔和',
    bgPrimary: '#E8EDDF',
    bgSoft: '#F1F4EA',
    bgMute: '#DCE3D0',
    bgSecondary: '#E3E9D8',
    textBase: '#2F342A',
    textSecondary: '#5C6554',
    textGray: '#5C6554',
    textGrayLight: '#7A8470',
    textGrayLighter: '#A8B09C',
    textGrayLightest: '#F0F3EA',
    accentColor: '#5A6B4E',
    primaryColor: '#5A6B4E',
    borderColor: '#C5CEB8',
    borderColorSoft: '#D7DFCC',
    successGreen: '#4F7A45',
    warningColor: '#A86B1C',
    dangerColor: '#B54A3A',
    infoColor: '#3B6EA5',
    bannedWord: '#B54A3A',
    highlightSurface: '#D5DCC8',
    codeBg: '#DDE4D2',
    codeText: '#2F342A',
    selectionBg: 'rgba(90, 107, 78, 0.18)',
    selectionText: '#1F241C',
    shadowColor: 'rgba(47, 52, 42, 0.08)',
    isDark: false
  },
  light: {
    key: 'light',
    name: '白色',
    description: '干净白底，适合日间写作',
    bgPrimary: '#F7F8FA',
    bgSoft: '#FFFFFF',
    bgMute: '#EEF0F3',
    bgSecondary: '#F2F4F7',
    textBase: '#1A1D21',
    textSecondary: '#5B6470',
    textGray: '#5B6470',
    textGrayLight: '#8A93A0',
    textGrayLighter: '#C2C8D0',
    textGrayLightest: '#F4F6F8',
    accentColor: '#3B6EA5',
    primaryColor: '#3B6EA5',
    borderColor: '#D8DEE6',
    borderColorSoft: '#E8ECF1',
    successGreen: '#2F9E5B',
    warningColor: '#D97706',
    dangerColor: '#DC2626',
    infoColor: '#2563EB',
    bannedWord: '#DC2626',
    highlightSurface: '#E6E9EE',
    codeBg: '#F0F2F5',
    codeText: '#1A1D21',
    selectionBg: 'rgba(59, 110, 165, 0.16)',
    selectionText: '#0F172A',
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    isDark: false
  },
  parchment: {
    key: 'parchment',
    name: '羊皮纸',
    description: '仿纸质阅读感，控件保持可读',
    bgPrimary: '#F0E4C9',
    bgSoft: '#F7EDD8',
    bgMute: '#E4D4B4',
    bgSecondary: '#EBDCBE',
    textBase: '#3B2A1A',
    textSecondary: '#6B5340',
    textGray: '#6B5340',
    textGrayLight: '#8A7058',
    textGrayLighter: '#C4A882',
    textGrayLightest: '#F8EDD5',
    accentColor: '#8B5A2B',
    primaryColor: '#8B5A2B',
    borderColor: '#D2B48C',
    borderColorSoft: '#E6D3B0',
    successGreen: '#5F7A32',
    warningColor: '#B86A1C',
    dangerColor: '#B54A3A',
    infoColor: '#4A6B86',
    bannedWord: '#B54A3A',
    highlightSurface: '#E2D2B0',
    codeBg: '#EADBBE',
    codeText: '#3B2A1A',
    selectionBg: 'rgba(139, 90, 43, 0.16)',
    selectionText: '#2A1C10',
    shadowColor: 'rgba(59, 42, 26, 0.1)',
    isDark: false
  },
  dark: {
    key: 'dark',
    name: '黑色',
    description: '高对比深色，夜间写作',
    bgPrimary: '#121212',
    bgSoft: '#1A1A1A',
    bgMute: '#262626',
    bgSecondary: '#202020',
    textBase: '#F0F0F0',
    textSecondary: '#B0B0B0',
    textGray: '#B0B0B0',
    textGrayLight: '#8E8E8E',
    textGrayLighter: '#6A6A6A',
    textGrayLightest: '#2C2C2C',
    accentColor: '#7EB0E0',
    primaryColor: '#7EB0E0',
    borderColor: '#3D3D3D',
    borderColorSoft: '#2E2E2E',
    successGreen: '#4ADE80',
    warningColor: '#FBBF24',
    dangerColor: '#F87171',
    infoColor: '#60A5FA',
    bannedWord: '#F87171',
    highlightSurface: '#333333',
    codeBg: '#1F1F1F',
    codeText: '#E8E8E8',
    selectionBg: 'rgba(126, 176, 224, 0.28)',
    selectionText: '#FFFFFF',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    isDark: true
  }
}

/** 历史主题键兼容映射 */
export const THEME_ALIASES = {
  yellow: 'eyecare',
  eye: 'eyecare',
  'eye-care': 'eyecare',
  paper: 'parchment',
  system: 'default',
  auto: 'default',
  black: 'dark',
  night: 'dark',
  blue: 'light',
  green: 'eyecare',
  purple: 'default'
}

export const THEME_ORDER = ['default', 'eyecare', 'light', 'parchment', 'dark']

export const hexToRgba = (hex, alpha = 1) => {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) {
    return `rgba(0, 0, 0, ${alpha})`
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const hexLuminance = (hex) => {
  if (!hex || typeof hex !== 'string' || hex.length < 7) return 1
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const clampByte = (n) => Math.min(255, Math.max(0, Math.round(n)))

export const blendHex = (hex, toHex, t) => {
  const r1 = parseInt(hex.slice(1, 3), 16)
  const g1 = parseInt(hex.slice(3, 5), 16)
  const b1 = parseInt(hex.slice(5, 7), 16)
  const r2 = parseInt(toHex.slice(1, 3), 16)
  const g2 = parseInt(toHex.slice(3, 5), 16)
  const b2 = parseInt(toHex.slice(5, 7), 16)
  return `#${clampByte(r1 + (r2 - r1) * t)
    .toString(16)
    .padStart(2, '0')}${clampByte(g1 + (g2 - g1) * t)
    .toString(16)
    .padStart(2, '0')}${clampByte(b1 + (b2 - b1) * t)
    .toString(16)
    .padStart(2, '0')}`
}

const isNearWhiteSurface = (hex) => {
  if (!hex || typeof hex !== 'string' || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return r >= 252 && g >= 252 && b >= 252
}

export const applyNeumorphicVars = (root, bgSoftHex) => {
  const d = 20
  const blur = 60
  const dh = 22
  const bh = 66

  let softGray
  let brightHighlight
  if (isNearWhiteSurface(bgSoftHex)) {
    softGray = '#d9d9d9'
    brightHighlight = '#ffffff'
  } else {
    const lum = hexLuminance(bgSoftHex)
    const darkSurface = lum < 0.45
    const towardBlack = darkSurface ? 0.42 : 0.14
    const towardWhite = darkSurface ? 0.14 : 0.28
    softGray = blendHex(bgSoftHex, '#000000', towardBlack)
    brightHighlight = blendHex(bgSoftHex, '#FFFFFF', towardWhite)
  }

  root.style.setProperty(
    '--neu-shadow-raised',
    `${d}px ${d}px ${blur}px ${softGray}, -${d}px -${d}px ${blur}px ${brightHighlight}`
  )
  root.style.setProperty(
    '--neu-shadow-raised-hover',
    `${dh}px ${dh}px ${bh}px ${softGray}, -${dh}px -${dh}px ${bh}px ${brightHighlight}`
  )
  root.style.setProperty(
    '--neu-shadow-pressed',
    `inset ${d}px ${d}px ${blur}px ${softGray}, inset -${d}px -${d}px ${blur}px ${brightHighlight}`
  )
}

const lightenHex = (hex, amount = 0.35) => blendHex(hex, '#FFFFFF', amount)
const darkenHex = (hex, amount = 0.2) => blendHex(hex, '#000000', amount)

export function getSystemColorScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveThemeKey(theme) {
  if (!theme || typeof theme !== 'string') return DEFAULT_THEME_KEY
  const key = THEME_ALIASES[theme] || theme
  return themeConfigs[key] ? key : DEFAULT_THEME_KEY
}

export function resolvePalette(themeKey, systemScheme = getSystemColorScheme()) {
  const entry = themeConfigs[themeKey] || themeConfigs[DEFAULT_THEME_KEY]
  if (themeKey === 'default') {
    return entry[systemScheme] || entry.light
  }
  return entry
}

export function getThemeMeta(themeKey) {
  const key = resolveThemeKey(themeKey)
  const entry = themeConfigs[key]
  return {
    key,
    name: entry.name,
    description: entry.description || '',
    preview: key === 'default' ? entry.light.bgSoft : entry.bgSoft,
    previewInk: key === 'default' ? entry.light.textBase : entry.textBase,
    previewBorder: key === 'default' ? entry.light.borderColor : entry.borderColor,
    previewPrimary: key === 'default' ? entry.light.primaryColor : entry.primaryColor,
    previewAccent: key === 'default' ? entry.light.accentColor : entry.accentColor,
    previewPaper: key === 'default' ? entry.light.bgPrimary : entry.bgPrimary
  }
}

export function getAvailableThemes() {
  return THEME_ORDER.map((key) => getThemeMeta(key))
}

export function getThemeName(theme) {
  return getThemeMeta(theme).name
}

export function getThemeConfig(theme, systemScheme = getSystemColorScheme()) {
  return resolvePalette(resolveThemeKey(theme), systemScheme)
}

function applyPalette(root, palette, themeKey) {
  const set = (name, value) => root.style.setProperty(name, value)

  set('--bg-primary', palette.bgPrimary)
  set('--bg-primary-a5', hexToRgba(palette.bgPrimary, 0.5))
  set('--bg-primary-a7', hexToRgba(palette.bgPrimary, 0.7))
  set('--bg-soft', palette.bgSoft)
  set('--bg-soft-a5', hexToRgba(palette.bgSoft, 0.5))
  set('--bg-soft-a7', hexToRgba(palette.bgSoft, 0.7))
  set('--bg-mute', palette.bgMute)
  set('--bg-mute-a5', hexToRgba(palette.bgMute, 0.5))
  set('--bg-mute-a7', hexToRgba(palette.bgMute, 0.7))
  set('--bg-secondary', palette.bgSecondary || palette.bgMute)

  set('--text-base', palette.textBase)
  set('--text-secondary', palette.textSecondary || palette.textGray)
  set('--text-gray', palette.textGray)
  set('--text-gray-light', palette.textGrayLight)
  set('--text-gray-lighter', palette.textGrayLighter)
  set('--text-gray-lightest', palette.textGrayLightest)
  set('--text-mute', palette.textGrayLight)

  set('--accent-color', palette.accentColor)
  set('--primary-color', palette.primaryColor)
  set('--border-color', palette.borderColor)
  set('--border-color-soft', palette.borderColorSoft)
  set('--success-green', palette.successGreen)
  set('--warning-color', palette.warningColor)
  set('--danger-color', palette.dangerColor)
  set('--info-color', palette.infoColor)

  set('--banned-word-color', palette.bannedWord || palette.dangerColor)
  set('--highlight-surface', palette.highlightSurface || palette.bgMute)
  set('--code-bg', palette.codeBg || palette.bgMute)
  set('--code-text', palette.codeText || palette.textBase)
  set('--selection-bg', palette.selectionBg)
  set('--selection-text', palette.selectionText)
  set('--shadow-color', palette.shadowColor)
  set('--theme-surface-background-strong', palette.bgSoft)
  set('--theme-card-radius', '10px')
  set('--theme-control-radius', '8px')
  set('--color-border', palette.borderColor)
  set('--color-border-strong', palette.borderColor)
  set('--color-text', palette.textBase)
  set('--color-primary', palette.primaryColor)
  set('--color-background', palette.bgPrimary)
  set('--color-background-soft', palette.bgSoft)
  set('--color-background-mute', palette.bgMute)

  const primary = palette.primaryColor
  set('--el-color-primary', primary)
  set(
    '--el-color-primary-rgb',
    `${parseInt(primary.slice(1, 3), 16)}, ${parseInt(primary.slice(3, 5), 16)}, ${parseInt(primary.slice(5, 7), 16)}`
  )
  set('--el-color-primary-light-3', lightenHex(primary, 0.28))
  set('--el-color-primary-light-5', lightenHex(primary, 0.45))
  set('--el-color-primary-light-7', lightenHex(primary, 0.62))
  set('--el-color-primary-light-8', lightenHex(primary, 0.72))
  set('--el-color-primary-light-9', lightenHex(primary, 0.86))
  set('--el-color-primary-dark-2', darkenHex(primary, 0.18))

  set('--el-bg-color', palette.bgSoft)
  set('--el-bg-color-page', palette.bgPrimary)
  set('--el-bg-color-overlay', palette.bgSoft)
  set('--el-text-color-primary', palette.textBase)
  set('--el-text-color-regular', palette.textBase)
  set('--el-text-color-secondary', palette.textSecondary || palette.textGray)
  set('--el-text-color-placeholder', palette.textGrayLight)
  set('--el-text-color-disabled', palette.textGrayLighter)
  set('--el-border-color', palette.borderColor)
  set('--el-border-color-light', palette.borderColorSoft)
  set('--el-border-color-lighter', palette.borderColorSoft)
  set('--el-border-color-extra-light', palette.borderColorSoft)
  set('--el-fill-color', palette.bgMute)
  set('--el-fill-color-light', palette.bgSecondary || palette.bgMute)
  set('--el-fill-color-lighter', palette.bgSoft)
  set('--el-fill-color-blank', palette.bgSoft)
  set('--el-mask-color', palette.isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.35)')
  set('--el-box-shadow', `0 8px 24px ${palette.shadowColor}`)
  set('--el-box-shadow-light', `0 4px 12px ${palette.shadowColor}`)
  set('--el-disabled-bg-color', palette.bgMute)
  set('--el-disabled-text-color', palette.textGrayLighter)
  set('--el-disabled-border-color', palette.borderColorSoft)

  set('--el-color-success', palette.successGreen)
  set('--el-color-warning', palette.warningColor)
  set('--el-color-danger', palette.dangerColor)
  set('--el-color-error', palette.dangerColor)
  set('--el-color-info', palette.infoColor)

  root.dataset.theme = themeKey
  root.dataset.themeMode = palette.isDark ? 'dark' : 'light'
  set('color-scheme', palette.isDark ? 'dark' : 'light')
  if ('colorScheme' in root.style) {
    root.style.colorScheme = palette.isDark ? 'dark' : 'light'
  }

  applyNeumorphicVars(root, palette.bgSoft)
}

export function applyTheme(themeKey, systemScheme = getSystemColorScheme()) {
  if (typeof document === 'undefined') return
  const key = resolveThemeKey(themeKey)
  const palette = resolvePalette(key, systemScheme)
  applyPalette(document.documentElement, palette, key)
}

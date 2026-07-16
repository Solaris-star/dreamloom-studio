/**
 * 视觉风格层（与配色主题正交）
 * - classic  经典和纸（默认）
 * - apple    Apple 极简
 * - brutal   粗犷野兽
 * - pixel    像素复古
 *
 * 纯逻辑，无 Pinia，便于单测。
 */

export const VISUAL_STYLE_STORAGE_KEY = 'config.visualStyle'
export const DEFAULT_VISUAL_STYLE = 'classic'

export const VISUAL_STYLE_ORDER = ['classic', 'apple', 'brutal', 'pixel']

export const visualStyleConfigs = {
  classic: {
    key: 'classic',
    name: '经典和纸',
    description: '暖米纸感，安静写作台',
    preview: {
      bg: '#F5F3EF',
      surface: '#FBFAF6',
      ink: '#2C2A26',
      accent: '#52634B',
      border: '#D9D2C4',
      shadow: 'soft'
    },
    tokens: {
      cardRadius: '12px',
      controlRadius: '8px',
      pillRadius: '999px',
      borderWidth: '1px',
      borderStyle: 'solid',
      shadowCard: '0 8px 24px rgba(58, 55, 49, 0.08)',
      shadowRaised: '0 12px 32px rgba(58, 55, 49, 0.12)',
      shadowHard: 'none',
      shadowInset: 'inset 3px 0 0 rgba(111, 122, 104, 0.56)',
      fontUi: "Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
      fontDisplay: "Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSizeUi: '14px',
      letterSpacing: '0',
      letterSpacingDisplay: '-0.02em',
      fontWeightUi: '500',
      fontWeightStrong: '600',
      transitionDuration: '180ms',
      surfaceBlur: '0px',
      surfaceOpacity: '1',
      shellGrid: '32px',
      shellGridOpacity: '0.018',
      buttonTransformHover: 'translateY(-1px)',
      buttonTransformActive: 'translateY(0)',
      imageFilter: 'saturate(0.48) sepia(0.08) contrast(0.94)',
      textTransform: 'none',
      pixelate: '0'
    }
  },
  apple: {
    key: 'apple',
    name: 'Apple 极简',
    description: '大留白、细边、胶囊按钮',
    preview: {
      bg: '#F5F5F7',
      surface: '#FFFFFF',
      ink: '#1D1D1F',
      accent: '#0071E3',
      border: 'rgba(0,0,0,0.08)',
      shadow: 'soft'
    },
    tokens: {
      cardRadius: '18px',
      controlRadius: '12px',
      pillRadius: '980px',
      borderWidth: '0px',
      borderStyle: 'solid',
      shadowCard: 'rgba(0, 0, 0, 0.12) 0px 4px 24px 0px',
      shadowRaised: 'rgba(0, 0, 0, 0.18) 3px 8px 32px 0px',
      shadowHard: 'none',
      shadowInset: 'none',
      fontUi:
        "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif",
      fontDisplay:
        "system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif",
      fontMono: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
      fontSizeUi: '15px',
      letterSpacing: '-0.01em',
      letterSpacingDisplay: '-0.03em',
      fontWeightUi: '400',
      fontWeightStrong: '600',
      transitionDuration: '220ms',
      surfaceBlur: '20px',
      surfaceOpacity: '0.82',
      shellGrid: '0px',
      shellGridOpacity: '0',
      buttonTransformHover: 'scale(1.01)',
      buttonTransformActive: 'scale(0.99)',
      imageFilter: 'none',
      textTransform: 'none',
      pixelate: '0'
    }
  },
  brutal: {
    key: 'brutal',
    name: '粗犷野兽',
    description: '粗边硬阴影，高对比外壳',
    preview: {
      bg: '#FFF8E7',
      surface: '#FFFFFF',
      ink: '#111111',
      accent: '#E11D48',
      border: '#111111',
      shadow: 'hard'
    },
    tokens: {
      cardRadius: '4px',
      controlRadius: '4px',
      pillRadius: '4px',
      borderWidth: '3px',
      borderStyle: 'solid',
      shadowCard: '6px 6px 0 #111111',
      shadowRaised: '8px 8px 0 #111111',
      shadowHard: '4px 4px 0 #111111',
      shadowInset: 'inset 0 0 0 2px #111111',
      fontUi: "'Dreamloom Brutal', 'Space Grotesk', Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
      fontDisplay: "'Dreamloom Brutal', 'Space Grotesk', Inter, 'PingFang SC', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSizeUi: '14px',
      letterSpacing: '0.01em',
      letterSpacingDisplay: '0',
      fontWeightUi: '700',
      fontWeightStrong: '800',
      transitionDuration: '80ms',
      surfaceBlur: '0px',
      surfaceOpacity: '1',
      shellGrid: '24px',
      shellGridOpacity: '0.06',
      buttonTransformHover: 'translate(-2px, -2px)',
      buttonTransformActive: 'translate(2px, 2px)',
      imageFilter: 'contrast(1.08) saturate(1.05)',
      textTransform: 'none',
      pixelate: '0'
    }
  },
  pixel: {
    key: 'pixel',
    name: '像素复古',
    description: '点阵字体与方块控件',
    preview: {
      bg: '#1A1C2C',
      surface: '#262B44',
      ink: '#F4F4F4',
      accent: '#41A6F6',
      border: '#3E445C',
      shadow: 'pixel'
    },
    tokens: {
      cardRadius: '0px',
      controlRadius: '0px',
      pillRadius: '0px',
      borderWidth: '2px',
      borderStyle: 'solid',
      shadowCard: '4px 4px 0 rgba(0, 0, 0, 0.45)',
      shadowRaised: '6px 6px 0 rgba(0, 0, 0, 0.55)',
      shadowHard: '3px 3px 0 currentColor',
      shadowInset: 'inset -2px -2px 0 rgba(0,0,0,0.35), inset 2px 2px 0 rgba(255,255,255,0.08)',
      fontUi: "'Dreamloom Pixel', 'Press Start 2P', 'Zpix', 'PingFang SC', monospace",
      fontDisplay: "'Dreamloom Pixel', 'Press Start 2P', 'Zpix', monospace",
      fontMono: "'Dreamloom Pixel', 'Press Start 2P', ui-monospace, monospace",
      fontSizeUi: '11px',
      letterSpacing: '0',
      letterSpacingDisplay: '0',
      fontWeightUi: '400',
      fontWeightStrong: '400',
      transitionDuration: '0ms',
      surfaceBlur: '0px',
      surfaceOpacity: '1',
      shellGrid: '16px',
      shellGridOpacity: '0.12',
      buttonTransformHover: 'translate(-1px, -1px)',
      buttonTransformActive: 'translate(2px, 2px)',
      imageFilter: 'contrast(1.15) saturate(1.2)',
      textTransform: 'none',
      pixelate: '1'
    }
  }
}

export function resolveVisualStyleKey(style) {
  if (!style || typeof style !== 'string') return DEFAULT_VISUAL_STYLE
  return visualStyleConfigs[style] ? style : DEFAULT_VISUAL_STYLE
}

export function getVisualStyleMeta(style) {
  const key = resolveVisualStyleKey(style)
  const entry = visualStyleConfigs[key]
  return {
    key,
    name: entry.name,
    description: entry.description,
    preview: entry.preview
  }
}

export function getAvailableVisualStyles() {
  return VISUAL_STYLE_ORDER.map((key) => getVisualStyleMeta(key))
}

export function getVisualStyleName(style) {
  return getVisualStyleMeta(style).name
}

export function getVisualStyleTokens(style) {
  const key = resolveVisualStyleKey(style)
  return visualStyleConfigs[key].tokens
}

/**
 * 将视觉风格 token 写入 :root，并设置 data-visual-style
 * @param {string} style
 * @param {Document|HTMLElement} [docRoot]
 */
export function applyVisualStyle(style, docRoot) {
  if (typeof document === 'undefined' && !docRoot) return
  const root = docRoot || document.documentElement
  const key = resolveVisualStyleKey(style)
  const tokens = visualStyleConfigs[key].tokens
  const set = (name, value) => root.style.setProperty(name, value)

  set('--theme-card-radius', tokens.cardRadius)
  set('--theme-control-radius', tokens.controlRadius)
  set('--theme-pill-radius', tokens.pillRadius)
  set('--theme-border-width', tokens.borderWidth)
  set('--theme-border-style', tokens.borderStyle)
  set('--theme-shadow-card', tokens.shadowCard)
  set('--theme-shadow-raised', tokens.shadowRaised)
  set('--theme-shadow-hard', tokens.shadowHard)
  set('--theme-shadow-inset', tokens.shadowInset)
  set('--theme-font-ui', tokens.fontUi)
  set('--theme-font-display', tokens.fontDisplay)
  set('--theme-font-mono', tokens.fontMono)
  set('--theme-font-size-ui', tokens.fontSizeUi)
  set('--theme-letter-spacing', tokens.letterSpacing)
  set('--theme-letter-spacing-display', tokens.letterSpacingDisplay)
  set('--theme-font-weight-ui', tokens.fontWeightUi)
  set('--theme-font-weight-strong', tokens.fontWeightStrong)
  set('--theme-transition-duration', tokens.transitionDuration)
  set('--theme-surface-blur', tokens.surfaceBlur)
  set('--theme-surface-opacity', tokens.surfaceOpacity)
  set('--theme-shell-grid', tokens.shellGrid)
  set('--theme-shell-grid-opacity', tokens.shellGridOpacity)
  set('--theme-button-transform-hover', tokens.buttonTransformHover)
  set('--theme-button-transform-active', tokens.buttonTransformActive)
  set('--theme-image-filter', tokens.imageFilter)
  set('--theme-text-transform', tokens.textTransform)
  set('--theme-pixelate', tokens.pixelate)

  // A3 组件层通用别名
  set('--ui-radius-card', tokens.cardRadius)
  set('--ui-radius-control', tokens.controlRadius)
  set('--ui-radius-pill', tokens.pillRadius)
  set('--ui-shadow-card', tokens.shadowCard)
  set('--ui-border-width', tokens.borderWidth)

  if (root.dataset) {
    root.dataset.visualStyle = key
  }
  if (typeof root.setAttribute === 'function') {
    root.setAttribute('data-visual-style', key)
  }
}

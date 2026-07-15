import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const textHintPluginKey = new PluginKey('textHintDecorations')

const SOFT_CHARACTER_COLORS = [
  '#f3e2a8',
  '#cfe8d5',
  '#c9dcf5',
  '#e8d4f2',
  '#f5d4c8',
  '#d5ebe7',
  '#e8e0c8',
  '#d8dce8'
]

export function findTextRanges(source, target) {
  const text = String(source || '')
  const needle = String(target || '').trim()
  if (!needle) return []
  const normalizedText = text.toLocaleLowerCase()
  const normalizedNeedle = needle.toLocaleLowerCase()
  const ranges = []
  let offset = 0
  while (offset <= text.length - needle.length) {
    const index = normalizedText.indexOf(normalizedNeedle, offset)
    if (index < 0) break
    ranges.push({ from: index, to: index + needle.length })
    offset = index + Math.max(1, needle.length)
  }
  return ranges
}

function normalizeHintItems(items) {
  const seen = new Set()
  const normalized = []
  for (const item of Array.isArray(items) ? items : []) {
    const text = String(item?.text ?? item ?? '').trim()
    const key = text.toLocaleLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    normalized.push(typeof item === 'string' || item == null ? { text } : { ...item, text })
  }
  // 长词优先，避免短词抢占长名称的部分匹配区间时视觉更碎
  normalized.sort((a, b) => b.text.length - a.text.length)
  return normalized
}

export function normalizeHintColor(value, fallbackIndex = 0) {
  const color = String(value || '').trim()
  if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(color)) {
    return color
  }
  return SOFT_CHARACTER_COLORS[fallbackIndex % SOFT_CHARACTER_COLORS.length]
}

export function softCharacterColor(value, fallbackIndex = 0) {
  const color = normalizeHintColor(value, fallbackIndex)
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16)
    const r = (n >> 16) & 0xff
    const g = (n >> 8) & 0xff
    const b = n & 0xff
    const mix = 0.62
    const r2 = Math.round(r + (255 - r) * mix)
    const g2 = Math.round(g + (255 - g) * mix)
    const b2 = Math.round(b + (255 - b) * mix)
    return `#${[r2, g2, b2].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }
  return color
}

function collectMatches(doc, items) {
  const matches = []
  if (!doc || !items.length) return matches
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const item of items) {
      const text = String(item.text || '').trim()
      if (!text) continue
      for (const range of findTextRanges(node.text, text)) {
        matches.push({
          from: pos + range.from,
          to: pos + range.to,
          text,
          color: item.color,
          type: item.type
        })
      }
    }
  })
  return matches
}

export function collectTextHintMatches(doc, config = {}) {
  const characters = normalizeHintItems(config.characters).map((item, index) => ({
    ...item,
    type: 'character',
    color: softCharacterColor(item.color, index)
  }))
  const bannedWords = normalizeHintItems(config.bannedWords).map((item) => ({
    ...item,
    type: 'banned-word'
  }))
  return {
    characters: collectMatches(doc, characters),
    bannedWords: collectMatches(doc, bannedWords)
  }
}

function buildDecorations(matches) {
  const decorations = []
  for (const match of matches.characters) {
    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: 'character-hint-decoration',
        style: `--character-hint-color: ${normalizeHintColor(match.color)}; background-color: ${normalizeHintColor(match.color)};`,
        'data-text-hint': 'character',
        'data-hint-text': match.text,
        title: match.text,
        'aria-label': `人物：${match.text}`
      })
    )
  }
  for (const match of matches.bannedWords) {
    const tip = `禁词：${match.text}（建议改写或替换）`
    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: 'banned-word-decoration',
        'data-text-hint': 'banned-word',
        'data-hint-text': match.text,
        title: tip,
        'aria-label': tip,
        role: 'mark'
      })
    )
  }
  return decorations
}

export function createTextHintDecorations(doc, config = {}) {
  const matches = collectTextHintMatches(doc, config)
  return DecorationSet.create(doc, buildDecorations(matches))
}

export const TextHintDecorations = Extension.create({
  name: 'textHintDecorations',

  addCommands() {
    return {
      setTextHints:
        (config = {}) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(textHintPluginKey, config)
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: textHintPluginKey,
        state: {
          init: () => ({
            config: { characters: [], bannedWords: [] },
            decorations: DecorationSet.empty,
            matches: { characters: [], bannedWords: [] }
          }),
          apply(tr, value) {
            const nextConfig = tr.getMeta(textHintPluginKey)
            if (nextConfig) {
              const config = {
                characters: Array.isArray(nextConfig.characters) ? nextConfig.characters : [],
                bannedWords: Array.isArray(nextConfig.bannedWords) ? nextConfig.bannedWords : []
              }
              const matches = collectTextHintMatches(tr.doc, config)
              return {
                config,
                matches,
                decorations: DecorationSet.create(tr.doc, buildDecorations(matches))
              }
            }
            if (!tr.docChanged) return value
            // 击键阶段只映射装饰位置，避免每次输入全量扫描；完整扫描由外部 debounce 触发 setTextHints
            return {
              config: value.config,
              matches: value.matches,
              decorations: value.decorations.map(tr.mapping, tr.doc)
            }
          }
        },
        props: {
          decorations(state) {
            return textHintPluginKey.getState(state)?.decorations || DecorationSet.empty
          }
        }
      })
    ]
  }
})

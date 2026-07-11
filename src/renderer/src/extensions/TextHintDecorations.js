import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const textHintPluginKey = new PluginKey('textHintDecorations')

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
  return (Array.isArray(items) ? items : []).filter((item) => {
    const text = String(item?.text ?? item ?? '').trim()
    const key = text.toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeHintColor(value) {
  const color = String(value || '').trim()
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(color)
    ? color
    : '#fff3a3'
}

function findMatches(doc, items, createAttrs) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const item of items) {
      const text = String(item.text || '').trim()
      if (!text) continue
      for (const range of findTextRanges(node.text, text)) {
        decorations.push(
          Decoration.inline(pos + range.from, pos + range.to, createAttrs(item))
        )
      }
    }
  })
  return decorations
}

export function createTextHintDecorations(doc, config = {}) {
  const characters = normalizeHintItems(config.characters)
  const bannedWords = normalizeHintItems(config.bannedWords).map((item) =>
    typeof item === 'string' ? { text: item } : item
  )
  const characterDecorations = findMatches(doc, characters, (item) => ({
    class: 'character-hint-decoration',
    style: `background-color: ${normalizeHintColor(item.color)};`,
    'data-text-hint': 'character'
  }))
  const bannedWordDecorations = findMatches(doc, bannedWords, () => ({
    class: 'banned-word-decoration',
    'data-text-hint': 'banned-word'
  }))
  return DecorationSet.create(doc, [...characterDecorations, ...bannedWordDecorations])
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
          init: (_, state) => ({
            config: { characters: [], bannedWords: [] },
            decorations: DecorationSet.empty
          }),
          apply(tr, value) {
            const nextConfig = tr.getMeta(textHintPluginKey)
            if (!nextConfig && !tr.docChanged) return value
            const config = nextConfig
              ? {
                  characters: Array.isArray(nextConfig.characters) ? nextConfig.characters : [],
                  bannedWords: Array.isArray(nextConfig.bannedWords) ? nextConfig.bannedWords : []
                }
              : value.config
            return { config, decorations: createTextHintDecorations(tr.doc, config) }
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

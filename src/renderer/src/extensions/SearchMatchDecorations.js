import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const searchMatchPluginKey = new PluginKey('searchMatchDecorations')

export function createSearchMatchDecorations(doc, matches = [], currentIndex = -1) {
  const maxPosition = doc?.content?.size || 0
  const decorations = (Array.isArray(matches) ? matches : [])
    .map((match, index) => {
      const from = Number(match?.from)
      const to = Number(match?.to)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from) {
        return null
      }
      if (to > maxPosition) return null
      return Decoration.inline(from, to, {
        class: index === currentIndex ? 'search-match-current' : 'search-match'
      })
    })
    .filter(Boolean)
  return DecorationSet.create(doc, decorations)
}

export const SearchMatchDecorations = Extension.create({
  name: 'searchMatchDecorations',

  addCommands() {
    return {
      setSearchMatches:
        (matches = [], currentIndex = -1) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(searchMatchPluginKey, { matches, currentIndex })
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchMatchPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const searchState = tr.getMeta(searchMatchPluginKey)
            if (searchState) {
              return createSearchMatchDecorations(
                tr.doc,
                searchState.matches,
                searchState.currentIndex
              )
            }
            return tr.docChanged ? decorations.map(tr.mapping, tr.doc) : decorations
          }
        },
        props: {
          decorations(state) {
            return searchMatchPluginKey.getState(state) || DecorationSet.empty
          }
        }
      })
    ]
  }
})

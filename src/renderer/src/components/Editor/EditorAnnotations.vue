<template>
  <div class="editor-annotations">
    <!-- 划词气泡：就近浮于选区上方 -->
    <div
      v-if="bubble.visible"
      class="annotation-bubble"
      :style="{ top: `${bubble.top}px`, left: `${bubble.left}px` }"
      @mousedown.stop
      @mouseup.stop
    >
      <p class="bubble-quote">
        {{ truncate(bubble.quote, 48) }}
      </p>
      <textarea
        ref="noteInputRef"
        v-model="bubble.note"
        class="bubble-input"
        rows="2"
        placeholder="写下批注 / 修改要求…"
        @keydown.stop
      />
      <div class="bubble-actions">
        <button
          type="button"
          class="bubble-btn ghost"
          @click="closeBubble"
        >
          取消
        </button>
        <button
          type="button"
          class="bubble-btn primary"
          @click="confirmAnnotation"
        >
          添加批注
        </button>
      </div>
    </div>

    <!-- 批注坞：显示条数，点开统一送审 -->
    <button
      v-if="annotations.length"
      type="button"
      class="annotation-dock"
      data-testid="annotation-dock"
      :title="`共 ${annotations.length} 条批注，点击统一送审`"
      @click="openReview"
    >
      <MessageSquareText :size="18" />
      <span class="dock-count">{{ annotations.length }}</span>
    </button>

    <!-- 统一送审对话框：逐条 原文 + 批注 + AI 改写，可批量采纳 -->
    <el-dialog
      v-model="reviewVisible"
      title="批注统一送审"
      width="min(720px, 94vw)"
      class="annotation-review-dialog"
      append-to-body
    >
      <div
        v-if="!reviewItems.length"
        class="review-empty"
      >
        暂无批注
      </div>
      <ul
        v-else
        class="review-list"
      >
        <li
          v-for="item in reviewItems"
          :key="item.id"
          class="review-item"
        >
          <label class="review-adopt">
            <input
              v-model="item.adopt"
              type="checkbox"
              :disabled="item.loading || !item.rewrite"
            >
            <span>采纳</span>
          </label>
          <div class="review-body">
            <div class="review-field">
              <span class="review-label">原文</span>
              <p class="review-text quote">
                {{ item.quote }}
              </p>
            </div>
            <div class="review-field">
              <span class="review-label">批注</span>
              <p class="review-text note">
                {{ item.note || '（无）' }}
              </p>
            </div>
            <div class="review-field">
              <span class="review-label">AI 改写</span>
              <p
                v-if="item.loading"
                class="review-text loading"
              >
                正在生成…
              </p>
              <p
                v-else
                class="review-text rewrite"
              >
                {{ item.rewrite }}
              </p>
            </div>
          </div>
        </li>
      </ul>
      <template #footer>
        <el-button @click="discardAll">
          全部放弃
        </el-button>
        <el-button
          type="primary"
          :disabled="!adoptedCount"
          @click="applyAdopted"
        >
          批量采纳选中（{{ adoptedCount }}）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MessageSquareText } from 'lucide-vue-next'

const props = defineProps({
  readingMode: { type: Boolean, default: false },
  bookName: { type: String, default: '' }
})

let annoSeq = 0
const annotations = ref([]) // { id, quote, note }
const bubble = ref({ visible: false, top: 0, left: 0, quote: '', note: '' })
const noteInputRef = ref(null)

const reviewVisible = ref(false)
const reviewItems = ref([])
const adoptedCount = computed(() => reviewItems.value.filter((i) => i.adopt).length)

function truncate(text, max) {
  const s = String(text || '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function getEditorRoot() {
  return document.querySelector('.editor-content .tiptap')
}

function handleMouseUp(event) {
  if (props.readingMode) return
  // 忽略气泡内部的操作
  if (event.target?.closest?.('.annotation-bubble')) return
  const root = getEditorRoot()
  if (!root) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
  const quote = selection.toString().trim()
  if (!quote) return
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return
  const rect = range.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return
  const top = Math.max(12, rect.top - 12)
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2),
    window.innerWidth - 180
  )
  bubble.value = { visible: true, top, left, quote, note: '' }
  nextTick(() => noteInputRef.value?.focus?.())
}

function closeBubble() {
  bubble.value = { visible: false, top: 0, left: 0, quote: '', note: '' }
}

function confirmAnnotation() {
  const quote = bubble.value.quote.trim()
  if (!quote) {
    closeBubble()
    return
  }
  annotations.value.push({
    id: `anno-${++annoSeq}`,
    quote,
    note: bubble.value.note.trim()
  })
  ElMessage.success('已添加批注')
  closeBubble()
  window.getSelection()?.removeAllRanges?.()
}

// 本地 mock AI 改写（预览用，真实可替换为服务端润色调用）
function mockRewrite(quote, note) {
  const trimmed = quote.replace(/\s+/g, ' ').trim()
  const hint = note ? `（依批注：${note}）` : ''
  return `${trimmed}${trimmed.endsWith('。') ? '' : '。'}${hint}`
}

function openReview() {
  if (!annotations.value.length) return
  reviewItems.value = annotations.value.map((a) => ({
    id: a.id,
    quote: a.quote,
    note: a.note,
    rewrite: '',
    adopt: false,
    loading: true
  }))
  reviewVisible.value = true
  // 逐条“生成”，模拟异步
  reviewItems.value.forEach((item, idx) => {
    setTimeout(() => {
      item.rewrite = mockRewrite(item.quote, item.note)
      item.loading = false
    }, 260 + idx * 160)
  })
}

// 在 tiptap DOM 中查找文本并用 execCommand 替换，令 TipTap 捕获输入、触发自动保存
function replaceInEditor(quote, rewrite) {
  const root = getEditorRoot()
  if (!root) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const idx = node.nodeValue.indexOf(quote)
    if (idx !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + quote.length)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      root.focus?.()
      const ok = document.execCommand('insertText', false, rewrite)
      selection.removeAllRanges()
      return ok
    }
    node = walker.nextNode()
  }
  return false
}

function applyAdopted() {
  const adopted = reviewItems.value.filter((i) => i.adopt && i.rewrite)
  if (!adopted.length) return
  let applied = 0
  let missed = 0
  adopted.forEach((item) => {
    if (replaceInEditor(item.quote, item.rewrite)) applied += 1
    else missed += 1
  })
  const adoptedIds = new Set(adopted.map((i) => i.id))
  annotations.value = annotations.value.filter((a) => !adoptedIds.has(a.id))
  if (applied) ElMessage.success(`已采纳 ${applied} 条改写`)
  if (missed) ElMessage.warning(`${missed} 条原文已变动，未能定位替换`)
  reviewVisible.value = false
}

function discardAll() {
  annotations.value = []
  reviewVisible.value = false
  ElMessage.info('已放弃全部批注')
}

onMounted(() => {
  document.addEventListener('mouseup', handleMouseUp)
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<style lang="scss" scoped>
.editor-annotations {
  position: static;
}

.annotation-bubble {
  position: fixed;
  transform: translate(-50%, -100%);
  z-index: 2400;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 10px;
  background: var(--bg-primary);
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  box-shadow: 0 6px 22px rgba(20, 18, 14, 0.16);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-quote {
  margin: 0;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-mute);
  border-left: 2px solid var(--el-color-primary);
}

.bubble-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-soft);
  color: var(--text-base);
  font: inherit;
  font-size: 13px;
  resize: vertical;
}

.bubble-input:focus {
  outline: none;
  border-color: var(--el-color-primary);
}

.bubble-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.bubble-btn {
  min-height: 28px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-base);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.bubble-btn.primary {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary);
  color: #fff;
}

.bubble-btn.ghost:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.annotation-dock {
  position: fixed;
  right: 20px;
  bottom: 96px;
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--el-color-primary);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--el-color-primary);
  box-shadow: 0 4px 16px rgba(20, 18, 14, 0.12);
  cursor: pointer;
}

.dock-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.review-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.review-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-soft);
}

.review-adopt {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: none;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.review-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.review-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.review-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-base);
  word-break: break-word;
}

.review-text.quote {
  padding: 6px 8px;
  background: var(--bg-mute);
  border-left: 2px solid var(--border-color);
}

.review-text.rewrite {
  padding: 6px 8px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  border-left: 2px solid var(--el-color-primary);
}

.review-text.loading {
  color: var(--text-secondary);
}
</style>

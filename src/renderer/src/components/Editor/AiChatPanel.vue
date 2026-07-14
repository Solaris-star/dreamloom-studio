<template>
  <div
    class="ai-chat-panel"
    :class="{ collapsed }"
  >
    <div
      class="chat-panel-header"
      @click="collapsed = !collapsed"
    >
      <span class="header-title">{{ t('aiChat.title') }}</span>
      <el-icon class="header-toggle">
        <ArrowRight v-if="collapsed" /><ArrowLeft v-else />
      </el-icon>
    </div>

    <div
      v-show="!collapsed"
      class="chat-panel-body"
    >
      <div class="chat-preset-row">
        <el-select
          v-model="selectedPresetId"
          :placeholder="t('aiChat.selectPreset')"
          :disabled="!!chatPresetLoadError"
          :loading="presetLoading"
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="p in chatPresets"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
        <div
          v-if="chatPresetLoadError"
          class="chat-preset-error"
        >
          <span>{{ chatPresetLoadError }}</span>
          <el-button
            size="small"
            :loading="presetLoading"
            @click="loadPresets"
          >
            {{ t('aiChat.retry') }}
          </el-button>
        </div>
      </div>

      <div
        ref="messageListRef"
        class="chat-messages"
      >
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-bubble">
            {{ msg.content }}
          </div>
        </div>
        <div
          v-if="messages.length === 0"
          class="chat-empty"
        >
          {{ t('aiChat.emptyHint') }}
        </div>
      </div>

      <div class="chat-input-area">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          :placeholder="t('aiChat.inputPlaceholder')"
          @keydown.enter.ctrl="handleSend"
        />
        <div class="chat-input-actions">
          <el-button
            type="primary"
            :loading="sending"
            :disabled="!inputText.trim()"
            @click="handleSend"
          >
            {{ t('aiChat.send') }}
          </el-button>
          <el-button
            :disabled="messages.length === 0 || lastAiMessage === null"
            @click="handleInsert"
          >
            {{ t('aiChat.insert') }}
          </el-button>
          <el-button
            :disabled="messages.length === 0"
            @click="handleClear"
          >
            {{ t('aiChat.clear') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { listPromptPresets, sendAiChat } from '@renderer/service/aiWorkshop'

const props = defineProps({
  bookPath: { type: String, default: '' },
  chapterContent: { type: String, default: '' }
})

const emit = defineEmits(['insertText'])
const { t } = useI18n()

const collapsed = ref(false)
const chatPresets = ref([])
const chatPresetLoadError = ref('')
const selectedPresetId = ref('')
const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const presetLoading = ref(false)
const messageListRef = ref(null)

const lastAiMessage = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant') return messages.value[i]
  }
  return null
})

watch(
  () => props.bookPath,
  async () => {
    await loadPresets()
  },
  { immediate: true }
)

async function loadPresets() {
  chatPresetLoadError.value = ''
  selectedPresetId.value = ''
  presetLoading.value = true
  try {
    const res = await listPromptPresets({ bookPath: props.bookPath })
    chatPresets.value = requireChatPresetRows(res, t('aiChat.loadPresetsFailed')).filter(
      (p) => p.category === 'chat'
    )
  } catch (error) {
    chatPresets.value = []
    chatPresetLoadError.value = error?.message || t('aiChat.loadPresetsFailed')
  } finally {
    presetLoading.value = false
  }
}

function requireChatPresetRows(result, fallback = '读取失败') {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  if (Array.isArray(result.presets)) return result.presets
  throw new Error(`${fallback}：接口返回格式不正确`)
}

function resolveSelectedPreset() {
  if (!selectedPresetId.value) return null
  const preset = chatPresets.value.find((p) => p.id === selectedPresetId.value)
  if (!preset) {
    throw new Error(t('aiChat.presetUnavailable'))
  }
  return preset
}

function requireAiChatReply(result) {
  if (result?.success !== true) {
    throw new Error(result?.message || t('aiChat.sendFailed'))
  }
  const reply = typeof result?.content === 'string' ? result.content.trim() : ''
  if (!reply) throw new Error('AI 对话失败：接口没有返回正文内容')
  return reply
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  sending.value = true
  await scrollToBottom()

  try {
    const preset = resolveSelectedPreset()
    const res = await sendAiChat({
      bookPath: props.bookPath,
      messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
      chapterContent: props.chapterContent,
      systemPreset: preset || null
    })
    messages.value.push({ role: 'assistant', content: requireAiChatReply(res) })
  } catch (e) {
    ElMessage.error(e?.message || t('aiChat.sendError'))
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

function handleInsert() {
  if (lastAiMessage.value) {
    emit('insertText', lastAiMessage.value.content)
  }
}

function handleClear() {
  messages.value = []
}

async function scrollToBottom() {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}
</script>

<style scoped lang="scss">
.ai-chat-panel {
  width: 320px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  transition: width 0.2s;

  &.collapsed {
    width: 40px;
  }
}

.chat-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
  user-select: none;

  .header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .header-toggle {
    color: var(--el-text-color-secondary);
  }
}

.chat-panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.chat-preset-row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.chat-preset-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.5;
  padding: 8px;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-message {
  display: flex;

  &.user {
    justify-content: flex-end;

    .message-bubble {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary-dark-2);
    }
  }

  &.assistant {
    justify-content: flex-start;

    .message-bubble {
      background: var(--el-fill-color-light);
      color: var(--el-text-color-regular);
    }
  }

  .message-bubble {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
  }
}

.chat-empty {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 20px 0;
}

.chat-input-area {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.chat-input-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
</style>

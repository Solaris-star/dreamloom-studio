<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <img
          :src="brandLogoUrl"
          alt="织梦工坊"
          class="auth-logo"
        >
        <div>
          <h1>织梦工坊</h1>
          <p>Dreamloom Studio · 创作空间</p>
        </div>
      </div>

      <h2 class="auth-title">
        {{ t('auth.title') }}
      </h2>
      <p class="auth-subtitle">
        {{ authHint }}
      </p>

      <el-form
        class="auth-form"
        @submit.prevent="handleAuthSubmit"
      >
        <el-form-item>
          <el-input
            v-model="authPassword"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            clearable
            show-password
            @keydown.enter.prevent="handleAuthSubmit"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            :loading="authLoading"
            type="primary"
            size="large"
            class="auth-submit"
            @click="handleAuthSubmit"
          >
            {{ t('auth.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="auth-hint">
        管理员可管理全部作品与密钥；访客仅能看到自己的书籍。<br>
        忘记密钥无法找回，只能重置。会话默认 12 小时。
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  authenticateBookshelf,
  getBookshelfAuthStatus
} from '@renderer/service/bookshelfAuth'
import brandLogoUrl from '@renderer/assets/images/logo_web.webp'

const router = useRouter()
const { t } = useI18n()
const authPassword = ref('')
const authLoading = ref(false)
const authHint = ref('输入管理员密钥或访客密钥进入')

onMounted(async () => {
  try {
    const status = await getBookshelfAuthStatus()
    authHint.value = status.passwordConfigured
      ? '已配置访问密钥。输入管理员密钥或访客密钥进入。'
      : '当前未设置密钥，可直接进入；建议登录后到系统设置配置管理员密钥。'
    if (!status.passwordConfigured || status.authenticated) {
      router.push('/')
    }
  } catch (error) {
    ElMessage.error(error.message || t('auth.statusFailed'))
  }
})

async function handleAuthSubmit() {
  if (!authPassword.value) {
    ElMessage.warning(t('auth.pleaseInputPassword'))
    return
  }
  authLoading.value = true
  try {
    await authenticateBookshelf(authPassword.value)
    router.push('/')
  } catch {
    ElMessage.error(t('auth.wrongPassword'))
    authPassword.value = ''
  } finally {
    authLoading.value = false
  }
}
</script>

<style lang="scss" scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, rgba(15, 118, 110, 0.14), transparent 28%),
    radial-gradient(circle at 80% 10%, rgba(217, 119, 6, 0.1), transparent 24%),
    linear-gradient(180deg, var(--bg-primary, #f4f1ea), var(--bg-soft, #fffdf8));
}

.auth-card {
  width: min(440px, 100%);
  padding: 36px 32px 28px;
  border: 1px solid var(--border-color, #e4ddd1);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bg-soft, #fffdf8) 92%, white);
  box-shadow:
    0 24px 60px rgba(31, 27, 22, 0.08),
    0 2px 0 rgba(255, 255, 255, 0.6) inset;
  backdrop-filter: blur(10px);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--text-base, #1f1b16);
  }

  p {
    margin: 4px 0 0;
    color: var(--text-gray-light, #8a8278);
    font-size: 13px;
  }
}

.auth-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 14px;
  background: rgba(15, 118, 110, 0.08);
  padding: 8px;
}

.auth-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 650;
  color: var(--text-base, #1f1b16);
}

.auth-subtitle {
  margin: 0 0 22px;
  color: var(--text-gray, #5c564e);
  font-size: 14px;
}

.auth-form .el-form-item {
  margin-bottom: 16px;
}

.auth-submit {
  width: 100%;
  border-radius: 12px;
  font-weight: 600;
}

.auth-hint {
  margin-top: 8px;
  color: var(--text-gray-light, #8a8278);
  font-size: 12px;
  line-height: 1.6;
}
</style>

<template>
  <div class="auth-page">
    <div class="auth-container">
      <h2 class="auth-title">{{ t('auth.title') }}</h2>
      <el-form class="auth-form" @submit.prevent="handleAuthSubmit">
        <el-form-item>
          <el-input
            v-model="authPassword"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            clearable
            @keydown.enter.prevent="handleAuthSubmit"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            :loading="authLoading"
            type="primary"
            size="large"
            style="width: 100%"
            @click="handleAuthSubmit"
          >
            {{ t('auth.submit') }}
          </el-button>
        </el-form-item>
        <el-form-item class="password-hint-item">
          <el-button type="text" style="width: 100%" @click="showPasswordHint = !showPasswordHint">
            {{ showPasswordHint ? t('auth.hideHint') : t('auth.showHint') }}
          </el-button>
          <div v-if="showPasswordHint" class="password-hint">
            {{ t('auth.passwordHint', { password: maskedPassword }) }}
          </div>
        </el-form-item>
      </el-form>
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

const router = useRouter()
const { t } = useI18n()
const authPassword = ref('')
const authLoading = ref(false)
const showPasswordHint = ref(false)
const maskedPassword = ref('')

// 加载密码
onMounted(async () => {
  try {
    const status = await getBookshelfAuthStatus()
    if (!status.passwordConfigured || status.authenticated) {
      router.push('/')
      return
    }
    maskedPassword.value = status.hint || '****'
  } catch (error) {
    ElMessage.error(error.message || t('auth.statusFailed'))
  }
})

// 认证提交
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
  width: 100vw;
  height: 100vh;
  background-color: #ffffff;
  display: flex;
  justify-content: center;
  align-items: center;
}

.auth-container {
  width: 400px;
  padding: 40px;
  background-color: #ffffff;
}

.auth-title {
  text-align: center;
  font-size: 24px;
  font-weight: 500;
  margin-bottom: 30px;
  color: #303133;
}

.auth-form {
  .el-form-item {
    margin-bottom: 20px;
  }

  .password-hint-item {
    position: relative;
  }
}

.password-hint {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 10px;
  text-align: center;
  font-size: 14px;
  color: #909399;
  padding: 10px 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 10;
}
</style>

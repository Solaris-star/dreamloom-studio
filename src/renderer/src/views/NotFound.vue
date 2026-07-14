<template>
  <main class="not-found">
    <div>
      <p class="status">
        404
      </p>
      <h1>页面不存在</h1>
      <p>这个地址可能已经改变，或对应功能已被移除。</p>
      <el-button
        type="primary"
        @click="router.replace('/dashboard')"
      >
        返回首页
      </el-button>
    </div>
  </main>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #2f2b27;
  background: #f2f1ee;
  text-align: center;
}

.not-found > div {
  max-width: 440px;
}

.status {
  margin: 0;
  color: #9b3b35;
  font-size: 56px;
  font-weight: 700;
}

h1 {
  margin: 8px 0;
  font-size: 28px;
}

p {
  margin: 0 0 24px;
  color: #6b655f;
}
</style>

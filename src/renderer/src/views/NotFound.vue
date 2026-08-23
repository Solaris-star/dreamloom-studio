<template>
  <main class="not-found">
    <figure class="nf-art">
      <img
        :src="artUrl"
        alt=""
        class="nf-art__img"
        decoding="async"
      >
    </figure>
    <p
      class="status"
      aria-hidden="true"
    >
      404
    </p>
    <h1>这一页故事还没有写下</h1>
    <p class="nf-desc">
      这个地址可能已经改变，或对应功能已被移除。回到书桌前，继续你的创作吧。
    </p>
    <el-button
      type="primary"
      @click="router.replace('/dashboard')"
    >
      返回首页
    </el-button>
  </main>
</template>

<script setup>
import { useRouter } from 'vue-router'
import artUrl from '@renderer/assets/images/notfound.webp'

const router = useRouter()
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  padding: 32px 24px;
  color: var(--text-base, #2f2b27);
  background: var(--bg-primary, #f2f1ee);
  text-align: center;
}

.nf-art {
  margin: 0 0 10px;
}

.nf-art__img {
  display: block;
  width: min(420px, 82vw);
  height: auto;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(44, 42, 38, 0.14);
}

.status {
  margin: 0;
  color: var(--danger-color, #9b3b35);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

h1 {
  margin: 6px 0 4px;
  font-size: 26px;
}

.nf-desc {
  margin: 0 0 22px;
  max-width: 400px;
  color: var(--text-secondary, #6b655f);
}
</style>

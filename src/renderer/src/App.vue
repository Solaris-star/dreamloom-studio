<script setup>
import { ElConfigProvider } from 'element-plus'
import { useElementLocale } from './i18n/element-locale'
import GlobalHttpLoading from './components/GlobalHttpLoading.vue'

const { elementLocale } = useElementLocale()
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <!-- 全局 API 加载过渡：顶栏进度 + 角标转圈，不挡操作 -->
    <GlobalHttpLoading />
    <!-- 页面级 keep-alive 在 AppLayout 内处理（嵌套路由子页），这里只渲染布局壳 -->
    <router-view />
  </el-config-provider>
</template>

<style lang="scss" scoped></style>

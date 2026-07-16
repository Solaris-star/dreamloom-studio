<script setup>
import { ElConfigProvider } from 'element-plus'
import { useElementLocale } from './i18n/element-locale'

const { elementLocale } = useElementLocale()
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <!-- 页面级 keep-alive 在 AppLayout 内处理（嵌套路由子页），这里只渲染布局壳 -->
    <router-view />
  </el-config-provider>
</template>

<style lang="scss" scoped></style>

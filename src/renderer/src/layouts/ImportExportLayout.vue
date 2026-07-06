<template>
  <ModuleLayout
    title="导入导出"
    description="导入作品资料，导出小说、知识库和项目备份。"
    :tabs="tabs"
  />
</template>

<script setup>
import ModuleLayout from './ModuleLayout.vue'

const tabs = [
  { label: '导入', path: '/import-export/import' },
  { label: '导出', path: '/import-export/export' },
  { label: '备份恢复', path: '/import-export/backup' },
  { label: '任务记录', path: '/import-export/jobs' }
]
</script>

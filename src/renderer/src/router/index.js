import { createRouter, createWebHashHistory } from 'vue-router'

import { APP_TITLE } from '@renderer/constants/brand'
import { getBookshelfAuthStatus } from '@renderer/service/bookshelfAuth'

const APP_BRAND_TITLE = APP_TITLE

const marketSectionTitleMap = {
  overview: '市场灵感',
  rankings: '市场灵感 · 热榜',
  keywords: '市场灵感 · 关键词',
  activities: '市场灵感 · 活动'
}

const analyticsSectionTitleMap = {
  overview: '数据中心',
  words: '数据中心 · 字数',
  tokens: '数据中心 · Token',
  goals: '数据中心 · 目标',
  books: '数据中心 · 作品',
  logs: '数据中心 · 日志'
}

const settingsSectionTitleMap = {
  general: '系统设置',
  profile: '系统设置 · 个人资料',
  appearance: '系统设置 · 外观',
  editor: '系统设置 · 编辑器',
  models: '系统设置 · 模型',
  embedding: '系统设置 · 向量配置',
  prompts: '系统设置 · 提示词',
  privacy: '系统设置 · 隐私',
  storage: '系统设置 · 存储',
  notifications: '系统设置 · 通知',
  shortcuts: '系统设置 · 快捷键',
  data: '系统设置 · 数据',
  about: '系统设置 · 关于'
}

const importExportSectionTitleMap = {
  import: '导入导出 · 导入',
  export: '导入导出 · 导出',
  backup: '导入导出 · 备份',
  jobs: '导入导出 · 任务'
}

function withTitle(route, title) {
  return {
    ...route,
    meta: {
      ...(route.meta || {}),
      title
    }
  }
}

function titleFromMap(section, titleMap, fallback) {
  return titleMap[String(section || '')] || fallback
}

function resolveRouteTitle(to) {
  // 从最深层 matched 记录取 title，兼容嵌套路由 / 重定向落点 / keep-alive 复用场景
  const matched = Array.isArray(to?.matched) ? to.matched : []
  for (let index = matched.length - 1; index >= 0; index -= 1) {
    const metaTitle = matched[index]?.meta?.title
    if (typeof metaTitle === 'function') {
      const resolved = metaTitle(to)
      if (resolved) return String(resolved)
    } else if (typeof metaTitle === 'string' && metaTitle.trim()) {
      return metaTitle.trim()
    }
  }

  const fallback = to?.meta?.title
  if (typeof fallback === 'function') {
    const resolved = fallback(to)
    return resolved ? String(resolved) : ''
  }
  return typeof fallback === 'string' ? fallback.trim() : ''
}

function resolveDocumentTitle(to) {
  const title = resolveRouteTitle(to)
  return title ? `${title} | ${APP_BRAND_TITLE}` : APP_BRAND_TITLE
}

const legacyWorkbenchRoutes = [
  withTitle(
    {
      path: 'timeline',
      name: 'Timeline',
      component: () => import('@renderer/views/Timeline.vue')
    },
    '时间线'
  ),
  withTitle(
    {
      path: 'character-profile',
      name: 'CharacterProfile',
      component: () => import('@renderer/views/CharacterProfile.vue')
    },
    '角色档案'
  ),
  withTitle(
    {
      path: 'dictionary',
      name: 'Dictionary',
      component: () => import('@renderer/views/Dictionary.vue')
    },
    '词典'
  ),
  withTitle(
    {
      path: 'setting-manager',
      name: 'SettingManager',
      component: () => import('@renderer/views/SettingManager.vue')
    },
    '设定管理'
  ),
  withTitle(
    {
      path: 'outline-manager',
      name: 'OutlineManager',
      component: () => import('@renderer/views/OutlineManager.vue')
    },
    '大纲管理'
  ),
  withTitle(
    {
      path: 'map-list',
      name: 'MapList',
      component: () => import('@renderer/views/MapList.vue')
    },
    '地图列表'
  ),
  withTitle(
    {
      path: 'map-design',
      name: 'MapDesign',
      component: () => import('@renderer/views/MapDesign.vue')
    },
    '地图设计'
  ),
  withTitle(
    {
      path: 'relationship-list',
      name: 'RelationshipList',
      component: () => import('@renderer/views/RelationshipList.vue')
    },
    '关系列表'
  ),
  withTitle(
    {
      path: 'relationship-design',
      name: 'RelationshipDesign',
      component: () => import('@renderer/views/RelationshipDesign.vue')
    },
    '关系设计'
  ),
  withTitle(
    {
      path: 'events-sequence',
      name: 'EventsSequence',
      component: () => import('@renderer/views/EventsSequence.vue')
    },
    '事件序列'
  ),
  withTitle(
    {
      path: 'organization-list',
      name: 'OrganizationList',
      component: () => import('@renderer/views/OrganizationList.vue')
    },
    '组织列表'
  ),
  withTitle(
    {
      path: 'organization-design',
      name: 'OrganizationDesign',
      component: () => import('@renderer/views/OrganizationDesign.vue')
    },
    '组织设计'
  ),
  withTitle(
    {
      path: 'novel-download',
      name: 'NovelDownload',
      component: () => import('@renderer/views/NovelDownload.vue')
    },
    '小说下载'
  ),
  withTitle(
    {
      path: 'user-guide',
      name: 'UserGuide',
      component: () => import('@renderer/views/UserGuide.vue')
    },
    '写作指南'
  )
]

const aiRoutes = [
  {
    path: 'ai',
    redirect: '/ai/creation-starter'
  },
  withTitle(
    {
      path: 'ai/creation-starter',
      name: 'AiCreationStarter',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'creation' }
    },
    'AI 工坊 · 创作起笔'
  ),
  withTitle(
    {
      path: 'ai/text-tools',
      name: 'AiTextTools',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'text' }
    },
    'AI 工坊 · 文本处理'
  ),
  withTitle(
    {
      path: 'ai/plot',
      name: 'AiPlot',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'plot' }
    },
    'AI 工坊 · 剧情规划'
  ),
  withTitle(
    {
      path: 'ai/world',
      name: 'AiWorld',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'world' }
    },
    'AI 工坊 · 人物世界'
  ),
  withTitle(
    {
      path: 'ai/image',
      name: 'AiImage',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'image' }
    },
    'AI 工坊 · 图像生成'
  ),
  withTitle(
    {
      path: 'ai/queue',
      name: 'AiQueue',
      component: () => import('@renderer/views/AgentQueue.vue')
    },
    'AI 工坊 · 任务队列'
  ),
  withTitle(
    {
      path: 'ai/prompts',
      name: 'AiPrompts',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'prompts' }
    },
    'AI 工坊 · 提示词调用'
  ),
  withTitle(
    {
      path: 'ai/history',
      name: 'AiHistory',
      component: () => import('@renderer/views/AiWorkshop.vue'),
      props: { mode: 'history' }
    },
    'AI 工坊 · 生成历史'
  )
]

const knowledgeRoutes = [
  withTitle(
    {
      path: 'knowledge',
      name: 'KnowledgeBookshelf',
      component: () => import('@renderer/views/CreationLibrary.vue')
    },
    '创作库 · 作品书架'
  ),
  withTitle(
    {
      path: 'knowledge/materials',
      name: 'KnowledgeMaterials',
      component: () => import('@renderer/views/CreationLibrary.vue'),
      props: { section: 'materials' }
    },
    '创作库 · 素材箱'
  ),
  withTitle(
    {
      path: 'knowledge/images',
      name: 'KnowledgeImages',
      component: () => import('@renderer/views/CreationLibrary.vue'),
      props: { section: 'images' }
    },
    '创作库 · 图库'
  ),
  withTitle(
    {
      path: 'knowledge/prompts',
      name: 'KnowledgePrompts',
      component: () => import('@renderer/views/CreationLibrary.vue'),
      props: { section: 'prompts' }
    },
    '创作库 · 提示词'
  ),
  withTitle(
    {
      path: 'knowledge/trash',
      name: 'KnowledgeTrash',
      component: () => import('@renderer/views/CreationLibrary.vue'),
      props: { section: 'trash' }
    },
    '创作库 · 回收站'
  ),
  withTitle(
    {
      path: 'knowledge/books/:bookId',
      name: 'BookAssetStudio',
      component: () => import('@renderer/views/BookAssetStudio.vue')
    },
    '创作库 · 作品资产台'
  ),
  {
    path: 'knowledge-library/creative',
    redirect: '/knowledge'
  },
  {
    path: 'knowledge-library/prompts',
    redirect: '/knowledge/prompts'
  },
  withTitle(
    {
      path: 'knowledge-library/all',
      name: 'KnowledgeLegacyAll',
      component: () => import('@renderer/views/KnowledgeBase.vue')
    },
    '创作库 · 资料总览'
  ),
  {
    path: 'knowledge-library',
    redirect: '/knowledge-library/all'
  },
  {
    path: 'creative-library',
    redirect: '/knowledge'
  },
  withTitle(
    {
      path: 'creative-library/assets',
      name: 'CreativeAssetCenter',
      component: () => import('@renderer/views/AssetCenter.vue')
    },
    '创作库 · 资产中心'
  )
]

const marketRoutes = [
  {
    path: 'market',
    redirect: '/market/overview'
  },
  withTitle(
    {
      path: 'market/:section(overview|rankings|keywords|activities)?',
      name: 'MarketInspiration',
      component: () => import('@renderer/views/MarketInspiration.vue')
    },
    (to) => titleFromMap(to.params.section || 'overview', marketSectionTitleMap, '市场灵感')
  ),
  {
    path: 'market-inspiration',
    redirect: '/market/overview'
  }
]

const analyticsRoutes = [
  {
    path: 'analytics',
    redirect: '/analytics/overview'
  },
  withTitle(
    {
      path: 'analytics/:section(overview|words|tokens|goals|books|logs)?',
      name: 'Analytics',
      component: () => import('@renderer/views/Statistics/index.vue')
    },
    (to) => titleFromMap(to.params.section || 'overview', analyticsSectionTitleMap, '数据中心')
  )
]

const settingsRoutes = [
  {
    path: 'settings',
    redirect: '/settings/general'
  },
  withTitle(
    {
      path: 'settings/:section(general|profile|appearance|editor|models|embedding|prompts|privacy|storage|notifications|shortcuts|data|about)?',
      name: 'SystemSettings',
      component: () => import('@renderer/views/SystemSettings.vue')
    },
    (to) => titleFromMap(to.params.section || 'general', settingsSectionTitleMap, '系统设置')
  )
]

const importExportRoutes = [
  {
    path: 'import-export',
    component: () => import('@renderer/layouts/ImportExportLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/import-export/import'
      },
      withTitle(
        {
          path: ':section(import|export|backup|jobs)',
          name: 'ImportExport',
          component: () => import('@renderer/views/ImportExport.vue')
        },
        (to) => titleFromMap(to.params.section || 'import', importExportSectionTitleMap, '导入导出')
      )
    ]
  }
]

const routes = [
  withTitle(
    {
      path: '/auth',
      name: 'Auth',
      component: () => import('@renderer/views/Auth.vue')
    },
    '登录'
  ),
  {
    path: '/',
    component: () => import('@renderer/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/dashboard'
      },
      withTitle(
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@renderer/views/Home.vue')
        },
        '首页'
      ),
      withTitle(
        {
          path: 'editor/:bookId?',
          name: 'Editor',
          component: () => import('@renderer/views/Editor.vue')
        },
        (to) => {
          const bookName = typeof to.query?.name === 'string' ? to.query.name.trim() : ''
          return bookName ? `${bookName} · 创作台` : '创作台'
        }
      ),
      ...knowledgeRoutes,
      ...aiRoutes,
      ...marketRoutes,
      ...analyticsRoutes,
      ...settingsRoutes,
      ...importExportRoutes,
      ...legacyWorkbenchRoutes
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@renderer/views/NotFound.vue'),
    meta: { title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

function applyDocumentTitle(to) {
  if (typeof document === 'undefined') return
  document.title = resolveDocumentTitle(to)
}

router.beforeEach(async (to, from, next) => {
  if (to.name === 'Auth') {
    next()
    return
  }

  try {
    const status = await getBookshelfAuthStatus()
    if (!status.passwordConfigured || status.authenticated) {
      next()
      return
    }
  } catch {
    next({ name: 'Auth' })
    return
  }

  next({ name: 'Auth' })
})

// 每次导航成功（含首次解析、push/replace、浏览器前进后退）都同步 document.title
router.afterEach((to) => {
  applyDocumentTitle(to)
})

if (typeof window !== 'undefined') {
  // 首次就绪时再刷一次，覆盖挂载时序与异步路由组件落点
  router.isReady().then(() => {
    applyDocumentTitle(router.currentRoute.value)
  })
}

export default router

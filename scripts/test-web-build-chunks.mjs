import assert from 'node:assert/strict'

// vite.web.config 在 import 时会执行 createWebServerPlugins()，默认拉起进度 WS。
// 本用例只校验分包函数，必须先禁用 WS，避免 open handle 挂住进程。
process.env.AGENT_TASK_WS_ENABLED = 'false'
process.env.MARKET_TREND_SCHEDULER = '0'
process.env.NOVEL_AUTH_REDIS = 'false'

const { default: webConfig, webVendorChunk } = await import('../vite.web.config.mjs')
const { stopAgentTaskProgressServer } = await import(
  '../src/main/services/agentTaskProgressWebSocket.js'
)

const chunkCases = [
  ['C:\\project\\node_modules\\@tiptap\\core\\dist\\index.js', 'vendor-editor'],
  ['/project/node_modules/prosemirror-state/dist/index.js', 'vendor-editor'],
  ['/project/node_modules/echarts/core.js', 'vendor-charts'],
  ['C:\\project\\node_modules\\zrender\\lib\\zrender.js', 'vendor-renderer'],
  ['/project/node_modules/vue/dist/vue.runtime.esm-bundler.js', 'vendor-vue'],
  ['/project/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js', 'vendor-vue'],
  ['/project/node_modules/lucide-vue-next/dist/cjs/lucide-vue-next.js', 'vendor-icons'],
  ['/project/node_modules/mammoth/lib/index.js', 'vendor-docx'],
  ['/project/node_modules/jszip/lib/index.js', 'vendor-zip'],
  ['/project/node_modules/pako/dist/pako.esm.mjs', 'vendor-zip'],
  ['/project/node_modules/sax/lib/sax.js', 'vendor-xml'],
  ['/project/node_modules/xmlbuilder/lib/index.js', 'vendor-xml'],
  ['/project/node_modules/@xmldom/xmldom/lib/dom.js', 'vendor-xml']
]

try {
  for (const [id, expectedChunk] of chunkCases) {
    assert.equal(webVendorChunk(id), expectedChunk, `${id} 应分配到 ${expectedChunk}`)
  }

  assert.equal(
    webVendorChunk('/project/node_modules/element-plus/es/components/button/index.mjs'),
    undefined,
    'Element Plus 应保持组件级默认拆分'
  )
  assert.equal(
    webVendorChunk('/project/src/renderer/src/views/Editor.vue'),
    undefined,
    '业务源码不应进入 vendor chunk'
  )
  assert.equal(
    webConfig.build.rollupOptions.output.manualChunks,
    webVendorChunk,
    'Web 构建必须使用经过测试的分包函数'
  )

  console.log('web build chunk tests passed')
} finally {
  await stopAgentTaskProgressServer({ closeQueueProgress: true }).catch(() => {})
}

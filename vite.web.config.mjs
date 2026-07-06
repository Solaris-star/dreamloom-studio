/**
 * 纯 Web 端独立 Vite 配置
 * 直接启动 renderer 部分作为 Web 应用。
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { createWebServerPlugins } from './vite.web.plugins.mjs'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()]
    }),
    Components({
      resolvers: [
        ElementPlusResolver({
          importStyle: 'css',
          enableVueDiscover: true
        })
      ]
    }),
    ...createWebServerPlugins()
  ],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: resolve('dist-web')
  }
})

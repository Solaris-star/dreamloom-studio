import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',')

const projectRoot = dirname(fileURLToPath(import.meta.url))
const e2eBooksDir = join(tmpdir(), 'dreamloom-studio-e2e-books')
const e2eRuntimeDir = join(tmpdir(), 'dreamloom-studio-e2e-runtime')
mkdirSync(e2eBooksDir, { recursive: true })
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(e2eRuntimeDir, { recursive: true, force: true })
}
mkdirSync(e2eRuntimeDir, { recursive: true })

const webServerCommand = [
  `"${process.execPath}"`,
  `"${join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')}"`,
  '--config',
  `"${join(projectRoot, 'vite.web.config.mjs')}"`,
  '--host',
  '127.0.0.1',
  '--port',
  '4173'
].join(' ')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'wide',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'chromium'
      }
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium'
      }
    }
  ],
  webServer: {
    command: webServerCommand,
    cwd: e2eRuntimeDir,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NOVEL_BOOKS_DIR: e2eBooksDir,
      NOVEL_OPEN_BROWSER: 'false',
      PLAYWRIGHT_TEST: 'true',
      // 与页面 auth mock 对齐：本机无密码时允许 loopback 访问 API，
      // 否则前端 mock 为已登录，但 /api/chapters/* 仍 401 → 章节树空白、无 ProseMirror。
      // 强制开放本机无密码认证；不要继承外层 shell 的 false，否则页面 mock 登录后 API 仍 401
      NOVEL_ALLOW_OPEN_AUTH: 'true',
      NOVEL_AUTH_REDIS: 'false',
      NOVEL_AUTH_STRICT: 'false',
      MARKET_TREND_SCHEDULER: '0',
      AGENT_TASK_WS_ENABLED: process.env.AGENT_TASK_WS_ENABLED || 'false'
    }
  }
})

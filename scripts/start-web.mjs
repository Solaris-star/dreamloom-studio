#!/usr/bin/env node
/**
 * Production web entry:
 * - start agent task progress WebSocket
 * - start Vite preview (static + /api middleware via configurePreviewServer)
 * - graceful SIGTERM/SIGINT shutdown
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  startAgentTaskProgressServer,
  startAgentTaskQueueProgressListener,
  stopAgentTaskProgressServer
} from '../src/main/services/agentTaskProgressWebSocket.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const host = String(process.env.WEB_HOST || '0.0.0.0').trim() || '0.0.0.0'
const port = Number(process.env.WEB_PORT || process.env.PORT || 5174) || 5174
const healthPort = Number(process.env.HEALTH_PORT || 0) || 0

let child = null
let shuttingDown = false

function log(...args) {
  console.log('[start-web]', ...args)
}

async function startProgressSideCars() {
  try {
    const info = await startAgentTaskProgressServer({
      host: process.env.AGENT_TASK_WS_HOST || '0.0.0.0',
      port: process.env.AGENT_TASK_WS_PORT || 8787
    })
    log('progress websocket ready', info.port || info.requestedPort, info.path)
  } catch (error) {
    console.warn('[start-web] progress websocket failed:', error?.message || error)
  }

  try {
    const queueProgress = await startAgentTaskQueueProgressListener()
    if (queueProgress?.enabled) log('queue progress listener ready', queueProgress.queueName)
  } catch (error) {
    console.warn('[start-web] queue progress listener failed:', error?.message || error)
  }
}

function startHealthServer() {
  if (!healthPort) return null
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/health') || req.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, service: 'dreamloom-web' }))
      return
    }
    res.writeHead(404).end()
  })
  server.listen(healthPort, '0.0.0.0', () => log('health server on', healthPort))
  return server
}

function startPreview() {
  // Call local vite binary directly — never use npx under read-only rootfs
  // (npx tries to mkdir /app/.npm and may hit the network).
  const viteBin = resolve(root, 'node_modules/vite/bin/vite.js')
  const args = [
    viteBin,
    'preview',
    '--config',
    'vite.web.config.mjs',
    '--host',
    host,
    '--port',
    String(port)
  ]
  child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: '/tmp/npm-cache',
      HOME: '/tmp',
      // Keep any accidental vite caches off the read-only rootfs.
      VITE_CACHE_DIR: '/tmp/vite-cache'
    },
    stdio: 'inherit'
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    log('preview exited', { code, signal })
    process.exit(code ?? (signal ? 1 : 0))
  })
  return child
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  log('shutting down on', signal)
  try {
    await stopAgentTaskProgressServer()
  } catch (error) {
    console.warn('[start-web] stop progress failed:', error?.message || error)
  }
  if (child && !child.killed) {
    child.kill('SIGTERM')
    const forceTimer = setTimeout(() => {
      if (child && !child.killed) child.kill('SIGKILL')
    }, 12_000)
    forceTimer.unref?.()
    await new Promise((resolve) => child.once('exit', resolve))
  }
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(error)
      process.exit(1)
    })
  })
}

await startProgressSideCars()
startHealthServer()
startPreview()
log(`web listening intent host=${host} port=${port}`)

import assert from 'node:assert/strict'
import fs from 'node:fs'

const rootUrl = new URL('../', import.meta.url)

function readFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, rootUrl), 'utf-8')
}

function assertIncludes(source, text, message) {
  assert.equal(source.includes(text), true, message)
}

const dockerfile = readFile('Dockerfile')
const compose = readFile('docker-compose.yml')
const dockerignore = readFile('.dockerignore')
const envExample = readFile('.env.example')
const webConfig = readFile('vite.web.config.mjs')

assertIncludes(
  dockerfile,
  'FROM node:24-bookworm-slim AS deps',
  'Dockerfile must use Node 24 for node:sqlite'
)
assertIncludes(dockerfile, 'FROM deps AS dev', 'Dockerfile must provide a dev target')
assertIncludes(dockerfile, 'FROM deps AS build', 'Dockerfile must provide a build target')
assertIncludes(dockerfile, 'npm ci', 'Dockerfile must install locked dependencies')
assertIncludes(dockerfile, '"dev"', 'Dockerfile dev target must start the web entry')
assertIncludes(dockerfile, 'npm run build', 'Dockerfile must verify the web build target')
assertIncludes(dockerfile, 'EXPOSE 5174', 'Dockerfile must expose the Vite web port')

assertIncludes(compose, 'app:', 'Compose must define the app service')
assertIncludes(compose, 'redis:', 'Compose must define the redis service')
assertIncludes(compose, 'target: dev', 'Compose app service must use the dev target')
assertIncludes(
  compose,
  '${WEB_PORT:-5174}:5174',
  'Compose must expose the web port through an env setting'
)
assertIncludes(
  compose,
  '${AGENT_TASK_WS_PORT:-8787}:8787',
  'Compose must expose the agent task websocket port through an env setting'
)
assertIncludes(
  compose,
  'NOVEL_BOOKS_DIR: ${NOVEL_DOCKER_BOOKS_DIR:-/app/books}',
  'Compose must set a container books directory'
)
assertIncludes(
  compose,
  'REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}',
  'Compose must pass the redis URL'
)
assertIncludes(
  compose,
  'AGENT_TASK_WS_PORT: ${AGENT_TASK_WS_PORT:-8787}',
  'Compose must pass the agent task websocket port'
)
assertIncludes(
  compose,
  'AGENT_TASK_QUEUE_ENABLED: ${AGENT_TASK_QUEUE_ENABLED:-false}',
  'Compose must pass the agent task queue switch'
)
assertIncludes(
  compose,
  'AGENT_TASK_QUEUE_NAME: ${AGENT_TASK_QUEUE_NAME:-novel-agent-writing}',
  'Compose must pass the agent task queue name'
)
assertIncludes(
  compose,
  'AGENT_TASK_QUEUE_CONCURRENCY: ${AGENT_TASK_QUEUE_CONCURRENCY:-1}',
  'Compose must pass the agent task queue concurrency'
)
assertIncludes(
  compose,
  'zhimeng_books:${NOVEL_DOCKER_BOOKS_DIR:-/app/books}',
  'Compose must persist books data'
)
assertIncludes(compose, 'redis_data:/data', 'Compose must persist redis data')

for (const key of [
  'DEEPSEEK_API_KEY',
  'CUSTOM_TEXT_API_KEY',
  'TONGYI_API_KEY',
  'GEMINI_API_KEY',
  'DOUBAO_IMAGE_API_KEY',
  'CUSTOM_IMAGE_API_KEY'
]) {
  assert.match(compose, new RegExp(`${key}: \\$\\{${key}:-\\}`), `${key} must come from .env`)
}

const literalSecrets = compose
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /(?:API_KEY|TOKEN|SECRET|PASSWORD):/.test(line))
  .filter((line) => !/:\s*\$\{[A-Z0-9_]+:-\}/.test(line))
assert.deepEqual(literalSecrets, [], 'Compose must not contain literal secrets')

assertIncludes(dockerignore, 'node_modules', '.dockerignore must skip node_modules')
assertIncludes(dockerignore, '.env', '.dockerignore must skip local env files')
assertIncludes(dockerignore, '!.env.example', '.dockerignore must keep the env example')
assertIncludes(dockerignore, '/*.png', '.dockerignore must skip root screenshots')

assertIncludes(
  envExample,
  'NOVEL_DOCKER_BOOKS_DIR=/app/books',
  '.env.example must document the Docker books directory'
)
assertIncludes(envExample, 'WEB_PORT=5174', '.env.example must document the web port')
assertIncludes(
  envExample,
  'AGENT_TASK_WS_PORT=8787',
  '.env.example must document the agent task websocket port'
)
assertIncludes(
  envExample,
  'AGENT_TASK_QUEUE_ENABLED=false',
  '.env.example must document the agent task queue switch'
)
assertIncludes(
  envExample,
  'AGENT_TASK_QUEUE_NAME=novel-agent-writing',
  '.env.example must document the agent task queue name'
)
assertIncludes(
  envExample,
  'AGENT_TASK_QUEUE_CONCURRENCY=1',
  '.env.example must document the agent task queue concurrency'
)
assertIncludes(envExample, 'REDIS_PORT=6379', '.env.example must document the redis port')
assertIncludes(envExample, 'NOVEL_ALLOW_OPEN_AUTH=false', '.env.example must document open auth switch')
assertIncludes(envExample, 'NOVEL_TRUST_PROXY=false', '.env.example must document trust proxy switch')
assertIncludes(compose, 'NOVEL_ALLOW_OPEN_AUTH: ${NOVEL_ALLOW_OPEN_AUTH:-false}', 'Compose must pass the open auth switch')
assertIncludes(compose, 'NOVEL_TRUST_PROXY: ${NOVEL_TRUST_PROXY:-false}', 'Compose must pass the trust proxy switch')
assertIncludes(envExample, 'REDIS_PORT=6379', '.env.example must document the redis port')
assertIncludes(envExample, 'NOVEL_ALLOW_OPEN_AUTH=false', '.env.example must document open auth switch')
assertIncludes(envExample, 'NOVEL_TRUST_PROXY=false', '.env.example must document trust proxy switch')
assertIncludes(compose, 'NOVEL_ALLOW_OPEN_AUTH: ${NOVEL_ALLOW_OPEN_AUTH:-false}', 'Compose must pass the open auth switch')
assertIncludes(compose, 'NOVEL_TRUST_PROXY: ${NOVEL_TRUST_PROXY:-false}', 'Compose must pass the trust proxy switch')

assertIncludes(
  webConfig,
  'createWebServerPlugins()',
  'Web dev config must include web server plugins'
)

console.log('docker config tests passed')

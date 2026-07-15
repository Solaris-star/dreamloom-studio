#!/usr/bin/env node
/**
 * 一键验收编排（不改业务代码）：
 *  lint / build / unit / api / e2e / audit / load / stability
 *
 * 用法：
 *   node scripts/run-acceptance-suite.mjs
 *   SKIP_E2E=1 SKIP_LOAD=1 node scripts/run-acceptance-suite.mjs
 *   BASE_URL=http://127.0.0.1:5174 node scripts/run-acceptance-suite.mjs --load-only
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const reportDir = join(root, 'reports/acceptance')
mkdirSync(reportDir, { recursive: true })
mkdirSync(join(reportDir, 'screenshots'), { recursive: true })

const args = new Set(process.argv.slice(2))
const loadOnly = args.has('--load-only')
const e2eOnly = args.has('--e2e-only')

const SKIP_LINT = process.env.SKIP_LINT === '1'
const SKIP_BUILD = process.env.SKIP_BUILD === '1'
const SKIP_UNIT = process.env.SKIP_UNIT === '1'
const SKIP_API = process.env.SKIP_API === '1'
const SKIP_E2E = process.env.SKIP_E2E === '1'
const SKIP_AUDIT = process.env.SKIP_AUDIT === '1'
const SKIP_LOAD = process.env.SKIP_LOAD === '1'
const SKIP_STABILITY = process.env.SKIP_STABILITY === '1'

function run(command, commandArgs, opts = {}) {
  return new Promise((resolvePromise) => {
    const started = Date.now()
    const child = spawn(command, commandArgs, {
      cwd: root,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
      if (opts.inherit) process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (opts.inherit) process.stderr.write(d)
    })
    child.on('close', (code) => {
      resolvePromise({
        command: [command, ...commandArgs].join(' '),
        code: code ?? 1,
        ms: Date.now() - started,
        stdout,
        stderr
      })
    })
  })
}

function tail(text, n = 40) {
  return String(text || '')
    .split('\n')
    .slice(-n)
    .join('\n')
}

async function main() {
  const results = []
  const steps = []

  if (!loadOnly && !e2eOnly) {
    if (!SKIP_LINT) steps.push({ name: 'lint', cmd: 'npm', args: ['run', 'lint'] })
    if (!SKIP_API) steps.push({ name: 'test:api', cmd: 'npm', args: ['run', 'test:api'] })
    if (!SKIP_UNIT) steps.push({ name: 'test:unit', cmd: 'npm', args: ['run', 'test:unit'] })
    if (!SKIP_BUILD) steps.push({ name: 'build', cmd: 'npm', args: ['run', 'build'] })
    if (!SKIP_AUDIT) steps.push({ name: 'audit', cmd: 'npm', args: ['audit', '--omit=dev'] })
  }
  if (!loadOnly && !SKIP_E2E) {
    steps.push({ name: 'test:e2e', cmd: 'npm', args: ['run', 'test:e2e'] })
  }
  if (!e2eOnly && !SKIP_LOAD) {
    steps.push({
      name: 'load',
      cmd: 'node',
      args: ['tests/load/run-acceptance-load.mjs']
    })
  }
  if (!e2eOnly && !SKIP_STABILITY) {
    steps.push({
      name: 'stability',
      cmd: 'node',
      args: ['tests/load/run-stability-checks.mjs']
    })
  }

  for (const step of steps) {
    console.log(`\n==== ${step.name} ====`)
    const result = await run(step.cmd, step.args, { inherit: true })
    results.push({ name: step.name, ...result, stdout: undefined, stderr: undefined, tail: tail(result.stdout + '\n' + result.stderr, 60) })
    writeFileSync(join(reportDir, `${step.name}.log`), result.stdout + '\n' + result.stderr)
    if (result.code !== 0) {
      console.error(`[acceptance] ${step.name} failed with code ${result.code}`)
    }
  }

  const summary = {
    startedAt: new Date().toISOString(),
    results: results.map((r) => ({
      name: r.name,
      code: r.code,
      ms: r.ms,
      pass: r.code === 0
    }))
  }
  writeFileSync(join(reportDir, 'suite-summary.json'), JSON.stringify(summary, null, 2))
  writeFileSync(
    join(reportDir, 'suite-summary.md'),
    [
      '# 验收套件执行摘要',
      '',
      ...summary.results.map(
        (r) => `- ${r.pass ? '✅' : '❌'} **${r.name}** code=${r.code} duration=${(r.ms / 1000).toFixed(1)}s`
      )
    ].join('\n')
  )
  console.log('\n[acceptance] done', summary.results)
  if (summary.results.some((r) => !r.pass)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * 准备 PDF.js 本地运行时资源(cmaps + standard_fonts)。
 *
 * 在 dev/build 前从 node_modules/pdfjs-dist 复制到 src/renderer/public/pdfjs-runtime。
 * 生成目录加入 .gitignore,由脚本从 node_modules 可重复生成。
 *
 * 用法:
 *   node scripts/prepare-pdfjs-assets.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url)).replace('/scripts', '')
const sourceBase = resolve(projectRoot, 'node_modules/pdfjs-dist')
const targetBase = resolve(projectRoot, 'src/renderer/public/pdfjs-runtime')

const REQUIRED_DIRS = ['cmaps', 'standard_fonts']

function ensureTargetDir() {
  if (existsSync(targetBase)) {
    rmSync(targetBase, { recursive: true, force: true })
  }
  mkdirSync(targetBase, { recursive: true })
}

function copyResource(dirName) {
  const src = join(sourceBase, dirName)
  const dest = join(targetBase, dirName)
  if (!existsSync(src)) {
    console.warn(`[prepare-pdfjs-assets] 源不存在,跳过: ${src}`)
    return 0
  }
  cpSync(src, dest, { recursive: true })
  const files = readdirSync(dest)
  return files.length
}

function verifyPdfjsInstalled() {
  const pkgPath = join(sourceBase, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(
      'pdfjs-dist 未安装。请先运行: npm install pdfjs-dist'
    )
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return pkg.version
}

function main() {
  const version = verifyPdfjsInstalled()
  console.log(`[prepare-pdfjs-assets] pdfjs-dist version: ${version}`)

  ensureTargetDir()
  let totalFiles = 0
  for (const dirName of REQUIRED_DIRS) {
    const count = copyResource(dirName)
    totalFiles += count
    console.log(`[prepare-pdfjs-assets] ${dirName}: ${count} files`)
  }
  writeFileSync(
    join(targetBase, 'VERSION.json'),
    JSON.stringify({ pdfjsDistVersion: version, generatedAt: new Date().toISOString() }, null, 2)
  )
  console.log(
    `[prepare-pdfjs-assets] 完成: ${totalFiles} 个文件已复制到 ${targetBase}`
  )
}

main()

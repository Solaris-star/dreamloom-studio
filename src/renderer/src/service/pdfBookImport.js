/**
 * 浏览器端 PDF 解析适配模块。
 *
 * 职责:
 *  - 懒加载 pdfjs-dist(仅在首次解析 PDF 时)
 *  - 配置本地 worker(同版本,禁 CDN)
 *  - 读取 file.arrayBuffer()
 *  - 验证 PDF 文件(%PDF- 标识 + pdfjs 能打开)
 *  - 只解析原生书签目录(outline)与页数,不提取任何正文文本
 *  - 输出 pdfData(base64 原始文件)随导入请求发送,服务端落盘
 *  - 汇报进度
 *  - PDF.js 异常 → 用户可读错误
 *  - finally 释放 document/loadingTask/worker
 *
 * 不在 localBookImport.js 顶层导入,避免破坏 Node 测试。
 */

const PDF_MAGIC = /^%PDF-/

/**
 * 解析 PDF 文件为 ParsedBook。
 *
 * @param {File} file - 浏览器 File 对象
 * @param {Object} options - { onProgress, signal, readers }
 * @returns {Promise<Object>} ParsedBook
 */
export async function parsePdfFile(file, options = {}) {
  const { onProgress = () => {}, signal, readers = {} } = options

  // ===== 校验 =====
  if (!file?.name) {
    throw makeError('请选择 PDF 文件', 'PDF_FILE_INVALID')
  }
  if (Number(file.size) > 50 * 1024 * 1024) {
    throw makeError('文件超过 50 MB,无法导入', 'PDF_FILE_TOO_LARGE')
  }

  // 前部 %PDF- 标识检查
  const arrayBuffer = await file.arrayBuffer()
  const headBytes = new Uint8Array(arrayBuffer.slice(0, 1024))
  const headText = bytesToString(headBytes)
  if (!PDF_MAGIC.test(headText)) {
    throw makeError(
      'PDF 文件内容损坏,或文件扩展名与实际格式不符。',
      'PDF_CORRUPTED'
    )
  }

  if (signal?.aborted) throw makeAbortError()

  // 注意:必须在 getDocument 之前完成 base64 编码——
  // pdfjs 会把传入的 ArrayBuffer transfer 给 worker(detach),之后再读就是 detached buffer。
  const pdfData = arrayBufferToBase64(arrayBuffer)

  // ===== 懒加载 PDF.js =====
  let pdfjs = null
  try {
    onProgress({ phase: 'loading', current: 0, total: 0, percent: 0, message: '正在加载 PDF 解析组件' })
    pdfjs = await loadPdfjs()
  } catch (error) {
    console.error('[pdfBookImport] PDF.js 加载失败:', error)
    throw makeError('PDF 解析组件加载失败', 'PDF_LIB_LOAD_FAILED')
  }

  if (signal?.aborted) throw makeAbortError()

  // ===== 打开文档 =====
  let loadingTask = null
  let pdfDocument = null
  try {
    onProgress({ phase: 'loading', current: 0, total: 0, percent: 5, message: '正在打开 PDF 文档' })

    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: '/pdfjs-runtime/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs-runtime/standard_fonts/',
      enableXfa: false,
      useWasm: false,
      stopAtErrors: false
    })

    // 加密 PDF 检测
    loadingTask.onProgress = ({ loaded, total }) => {
      if (signal?.aborted) return
      const percent = total > 0 ? Math.min(10, Math.round((loaded / total) * 10)) : 5
      onProgress({ phase: 'loading', current: loaded, total, percent, message: '正在加载 PDF 文档' })
    }

    try {
      pdfDocument = await loadingTask.promise
    } catch (error) {
      if (error?.name === 'PasswordException') {
        throw makeError(
          'PDF 已加密或需要密码,当前暂不支持导入加密 PDF。',
          'PDF_ENCRYPTED'
        )
      }
      if (error?.name === 'InvalidPDFException') {
        throw makeError(
          'PDF 文件内容损坏,或文件扩展名与实际格式不符。',
          'PDF_CORRUPTED'
        )
      }
      throw makeError(`PDF 打开失败:${error?.message || '未知错误'}`, 'PDF_OPEN_FAILED')
    }

    if (signal?.aborted) throw makeAbortError()

    // ===== metadata =====
    let metadata = null
    try {
      metadata = await pdfDocument.getMetadata()
    } catch (error) {
      // metadata 失败不致命
      console.warn('[pdfBookImport] getMetadata 失败:', error?.message)
    }

    // ===== 目录与原始文件 =====
    // PDF 不再提取 TextItem：公式、图片、字体和排版全部交给 PDF.js Canvas 保留。
    const pageCount = pdfDocument.numPages || 0
    if (!pageCount) throw makeError('PDF 文档不包含任何页面', 'PDF_EMPTY')

    onProgress({
      phase: 'outline',
      current: 0,
      total: pageCount,
      percent: 30,
      message: '正在读取 PDF 目录'
    })
    const pdfOutline = await resolvePdfOutline(pdfDocument, pageCount, signal, onProgress)

    onProgress({
      phase: 'done',
      current: pageCount,
      total: pageCount,
      percent: 100,
      message: 'PDF 已就绪，可开始阅读'
    })

    const title = resolveBookTitle(metadata, file.name)
    const warnings = pdfOutline.some((item) => item.isFallback)
      ? ['该 PDF 没有内置书签目录，已按页生成目录。']
      : []
    return {
      title,
      extension: 'pdf',
      fileSize: Number(file.size) || 0,
      encoding: 'PDF',
      warnings,
      pageCount,
      textPageCount: 0,
      skippedPageCount: 0,
      totalWords: 0,
      chapterCount: pdfOutline.length,
      metadata: {
        title: metadata?.info?.Title || '',
        author: metadata?.info?.Author || '',
        creator: metadata?.info?.Creator || ''
      },
      pdfOutline,
      // 原始文件随导入请求发送，服务端落盘；后续阅读走 /api/pdf/file Range 请求。
      pdfData,
      chapters: pdfOutline.map((item) => ({
        title: item.title,
        content: '',
        wordCount: 0,
        pageIndex: item.pageIndex
      })),
      _source: 'pdf'
    }
  } finally {
    // 释放资源
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      try { await pdfDocument.destroy() } catch {}
    }
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      try { await loadingTask.destroy() } catch {}
    }
  }
}

// ===== PDF 目录解析 =====

async function resolveOutlinePageIndex(pdfDocument, dest) {
  if (!dest) return null
  let resolvedDest = dest
  if (typeof resolvedDest === 'string') {
    try {
      resolvedDest = await pdfDocument.getDestination(resolvedDest)
    } catch {
      return null
    }
  }
  if (!Array.isArray(resolvedDest) || !resolvedDest[0]) return null
  const first = resolvedDest[0]
  if (Number.isInteger(first)) return first
  try {
    return await pdfDocument.getPageIndex(first)
  } catch {
    return null
  }
}

async function flattenPdfOutline(pdfDocument, items, level = 0, output = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const entry = {
      id: `pdf-outline-${output.length + 1}`,
      title: String(item?.title || '').trim() || `目录 ${output.length + 1}`,
      level,
      pageIndex: await resolveOutlinePageIndex(pdfDocument, item?.dest),
      isFallback: false
    }
    output.push(entry)
    const children = await flattenPdfOutline(pdfDocument, item?.items, level + 1, output)
    if (entry.pageIndex == null) {
      const firstChild = children.find((child) => child.level > level && child.pageIndex != null)
      if (firstChild) entry.pageIndex = firstChild.pageIndex
    }
  }
  return output
}

async function resolvePdfOutline(pdfDocument, pageCount, signal, onProgress) {
  let nativeOutline = []
  try {
    nativeOutline = await pdfDocument.getOutline()
  } catch (error) {
    console.warn('[pdfBookImport] 读取 PDF 书签失败:', error?.message)
  }
  if (signal?.aborted) throw makeAbortError()

  const outline = await flattenPdfOutline(pdfDocument, nativeOutline)
  const usable = outline.filter((item) => Number.isInteger(item.pageIndex))
  if (usable.length) return outline

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    onProgress?.({
      phase: 'outline',
      current: pageIndex + 1,
      total: pageCount,
      percent: 30 + Math.round(((pageIndex + 1) / Math.max(1, pageCount)) * 65),
      message: `正在建立第 ${pageIndex + 1} / ${pageCount} 页目录`
    })
    return {
      id: `pdf-page-${pageIndex + 1}`,
      title: `第${pageIndex + 1}页`,
      level: 0,
      pageIndex,
      isFallback: true
    }
  })
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const chunks = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return btoa(chunks.join(''))
}

// ===== PDF.js 懒加载 =====

let pdfjsPromise = null

/**
 * 使用 legacy 构建：内置 Map.prototype.getOrInsertComputed / Math.sumPrecise 等
 * polyfill（现代构建假设浏览器原生支持，upsert 提案目前仅新 Chromium 实现，
 * Safari/iOS 与部分旧内核会直接 ReferenceError）。
 */
function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const workerUrl = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default || workerUrl
    return pdfjs
  })().catch((error) => {
    pdfjsPromise = null
    throw error
  })
  return pdfjsPromise
}

// ===== 辅助 =====

function bytesToString(bytes) {
  let s = ''
  for (let i = 0; i < Math.min(bytes.length, 8); i++) {
    s += String.fromCharCode(bytes[i])
  }
  return s
}

function resolveBookTitle(metadata, fileName) {
  const metaTitle = String(metadata?.info?.Title || '').trim()
  if (isValidBookTitle(metaTitle)) {
    return metaTitle
  }
  // 回退到文件名(去扩展名)
  const base = String(fileName || '').replace(/\.pdf$/i, '').trim()
  return base || '导入书籍'
}

function isValidBookTitle(title) {
  const t = String(title || '').trim()
  if (!t) return false
  if (t.length > 120) return false
  // 明显的软件名 / 无意义值
  const badPatterns = [
    /^(Microsoft Word|WPS|LibreOffice|Adobe|PDFCreator|Foxit|Nitro)/i,
    /^Untitled/i,
    /^未命名/i,
    /^新建文档/i,
    /^Document$/i
  ]
  if (badPatterns.some((re) => re.test(t))) return false
  // 乱码:大量非可打印字符
  if (/[\uFFFD]/.test(t)) return false
  // "第1章" 等章节标题不是书名
  if (/^第\s*[一二三四五六七八九十百千零〇\d]+[章回节卷]/.test(t)) return false
  return true
}

function makeError(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

function makeAbortError() {
  const err = new Error('PDF 解析已取消')
  err.code = 'PDF_PARSE_ABORTED'
  return err
}

export const __test__ = { isValidBookTitle, resolveBookTitle, bytesToString }

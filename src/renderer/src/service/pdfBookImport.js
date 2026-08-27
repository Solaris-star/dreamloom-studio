/**
 * 浏览器端 PDF 解析适配模块。
 *
 * 职责:
 *  - 懒加载 pdfjs-dist(仅在首次解析 PDF 时)
 *  - 配置本地 worker(同版本,禁 CDN)
 *  - 读取 file.arrayBuffer()
 *  - 验证 PDF 文件(%PDF- 标识 + pdfjs 能打开)
 *  - 顺序提取每页 TextItem + metadata
 *  - 汇报进度
 *  - PDF.js 异常 → 用户可读错误
 *  - finally 释放 page/document/loadingTask/worker
 *
 * 不在 localBookImport.js 顶层导入,避免破坏 Node 测试。
 */

import { rebuildBookText, dedupeWarnings } from './pdfTextLayout.js'

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

    const pageCount = pdfDocument.numPages || 0
    if (pageCount === 0) {
      throw makeError('PDF 文档不包含任何页面', 'PDF_EMPTY')
    }

    // ===== 顺序提取每页 TextItem =====
    const pages = []
    for (let i = 1; i <= pageCount; i++) {
      if (signal?.aborted) throw makeAbortError()

      onProgress({
        phase: 'extracting',
        current: i,
        total: pageCount,
        percent: 10 + Math.round((i / pageCount) * 70),
        message: `正在解析第 ${i} / ${pageCount} 页`
      })

      let page = null
      try {
        page = await pdfDocument.getPage(i)
        const viewport = page.getViewport({ scale: 1 })
        let textContent = null
        try {
          textContent = await page.getTextContent()
        } catch (error) {
          console.warn(`[pdfBookImport] 第 ${i} 页 getTextContent 失败:`, error?.message)
          pages.push({ items: [], width: viewport.width, height: viewport.height, index: i - 1 })
          continue
        }
        pages.push({
          items: textContent.items || [],
          width: viewport.width,
          height: viewport.height,
          index: i - 1
        })
      } catch (error) {
        console.warn(`[pdfBookImport] 第 ${i} 页 getPage 失败:`, error?.message)
        pages.push({ items: [], width: 0, height: 0, index: i - 1 })
      } finally {
        if (page && typeof page.cleanup === 'function') {
          try { page.cleanup() } catch {}
        }
      }
    }

    if (signal?.aborted) throw makeAbortError()

    // ===== 文本重建 =====
    onProgress({ phase: 'cleaning', current: 0, total: pageCount, percent: 82, message: '正在清理页眉和目录' })

    const rebuildResult = rebuildBookText(pages, { signal, onProgress })

    onProgress({ phase: 'done', current: pageCount, total: pageCount, percent: 100, message: '解析完成' })

    // 扫描件 → 明确错误
    if (rebuildResult.stats?.isScanned) {
      throw makeError(
        '未检测到可提取的文字。该文件可能是扫描版或图片型 PDF,当前暂不支持 OCR。',
        'PDF_SCANNED_NO_TEXT'
      )
    }

    // ===== 书名 =====
    const title = resolveBookTitle(metadata, file.name)

    // ===== ParsedBook =====
    const warnings = dedupeWarnings(rebuildResult.warnings)
    return {
      title,
      extension: 'pdf',
      fileSize: Number(file.size) || 0,
      encoding: 'PDF',
      warnings,
      pageCount: rebuildResult.pageCount,
      textPageCount: rebuildResult.textPageCount,
      skippedPageCount: rebuildResult.skippedPageCount,
      metadata: {
        title: metadata?.info?.Title || '',
        author: metadata?.info?.Author || '',
        creator: metadata?.info?.Creator || ''
      },
      rawText: rebuildResult.text,
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

// ===== PDF.js 懒加载 =====

let pdfjsPromise = null

function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
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

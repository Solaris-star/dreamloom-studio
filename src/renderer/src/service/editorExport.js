import { listChapterTree, readChapterContent } from './editor.js'

function sanitizeFileName(value) {
  return (String(value || '作品').trim() || '作品').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100)
}

export async function buildBookTextExport(bookName) {
  const targetBookName = String(bookName || '').trim()
  if (!targetBookName) {
    throw new Error('导出失败：缺少作品名')
  }
  const volumes = await listChapterTree(targetBookName)
  if (volumes.length === 0) {
    return { content: '', totalChapters: 0, failedChapters: [] }
  }

  const allContent = []
  const failedChapters = []
  let totalChapters = 0

  for (const volume of volumes) {
    if (volume.type !== 'volume' || !Array.isArray(volume.children) || volume.children.length === 0) {
      continue
    }
    allContent.push(`\n${'='.repeat(50)}`)
    allContent.push(`【${volume.name}】`)
    allContent.push(`${'='.repeat(50)}\n`)

    for (const chapter of volume.children) {
      if (chapter.type !== 'chapter') continue
      try {
        const result = await readChapterContent(targetBookName, volume.name, chapter.name)
        allContent.push(`\n${'-'.repeat(40)}`)
        allContent.push(chapter.name)
        allContent.push(`${'-'.repeat(40)}\n`)
        allContent.push(result.content)
        allContent.push('\n')
        totalChapters += 1
      } catch (error) {
        failedChapters.push({
          volumeName: volume.name,
          chapterName: chapter.name,
          message: error.message || '读取失败'
        })
      }
    }
  }

  return {
    content: allContent.join('\n'),
    totalChapters,
    failedChapters
  }
}

export function downloadBookTextExport(bookName, timestamp, content) {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('当前浏览器不支持文件下载')
  }
  const fileName = `${sanitizeFileName(bookName)}_${String(timestamp || '').trim()}.txt`
  const objectUrl = URL.createObjectURL(
    new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' })
  )
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  return { success: true, fileName }
}

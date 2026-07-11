const DEFAULT_MAX_IMAGE_SIZE = 10 * 1024 * 1024

async function readImageFile(file, maxSize) {
  if (!file?.type?.startsWith('image/')) throw new Error('请选择有效的图片文件')
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('图片文件为空或已损坏')
  }
  if (file.size > maxSize) {
    throw new Error(`图片不能超过 ${Math.round(maxSize / 1024 / 1024)} MB`)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) {
        reject(new Error('图片内容格式不正确'))
        return
      }
      resolve({ dataUrl, fileName: file.name, mimeType: file.type, size: file.size })
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export function selectBrowserImage({ maxSize = DEFAULT_MAX_IMAGE_SIZE } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.hidden = true
    const cleanup = () => input.remove()
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0]
        if (!file) {
          cleanup()
          resolve(null)
          return
        }
        try {
          resolve(await readImageFile(file, maxSize))
        } catch (error) {
          reject(error)
        } finally {
          cleanup()
        }
      },
      { once: true }
    )
    input.addEventListener(
      'cancel',
      () => {
        cleanup()
        resolve(null)
      },
      { once: true }
    )
    document.body.appendChild(input)
    input.click()
  })
}

export { readImageFile }

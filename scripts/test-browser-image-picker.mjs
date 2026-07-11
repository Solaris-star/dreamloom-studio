import assert from 'node:assert/strict'

class MockFileReader {
  readAsDataURL(file) {
    queueMicrotask(() => {
      if (file.failRead) {
        this.onerror?.()
        return
      }
      this.result = file.dataUrl
      this.onload?.()
    })
  }
}

globalThis.FileReader = MockFileReader

const { readImageFile } = await import('../src/renderer/src/service/browserImagePicker.js')
const image = {
  name: 'cover.png',
  type: 'image/png',
  size: 128,
  dataUrl: 'data:image/png;base64,AA=='
}

assert.deepEqual(await readImageFile(image, 1024), {
  dataUrl: image.dataUrl,
  fileName: image.name,
  mimeType: image.type,
  size: image.size
})
await assert.rejects(
  () => readImageFile({ ...image, type: 'text/plain' }, 1024),
  /有效的图片/
)
await assert.rejects(() => readImageFile({ ...image, size: 0 }, 1024), /为空或已损坏/)
await assert.rejects(() => readImageFile({ ...image, size: 2048 }, 1024), /不能超过/)
await assert.rejects(
  () => readImageFile({ ...image, dataUrl: 'data:text/plain;base64,AA==' }, 1024),
  /内容格式不正确/
)
await assert.rejects(() => readImageFile({ ...image, failRead: true }, 1024), /读取图片失败/)

console.log('浏览器图片选择服务测试通过')

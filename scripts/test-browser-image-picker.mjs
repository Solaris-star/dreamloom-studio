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

class MockInput {
  constructor() {
    this.listeners = new Map()
    this.files = []
    this.removed = false
    this.clicked = false
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener)
  }

  click() {
    this.clicked = true
  }

  remove() {
    this.removed = true
  }

  dispatch(type) {
    this.listeners.get(type)?.()
  }
}

globalThis.FileReader = MockFileReader
const inputs = []
globalThis.document = {
  createElement(type) {
    assert.equal(type, 'input')
    const input = new MockInput()
    inputs.push(input)
    return input
  },
  body: {
    appendChild(input) {
      assert.equal(inputs.includes(input), true)
    }
  }
}

const { readImageFile, selectBrowserImage } =
  await import('../src/renderer/src/service/browserImagePicker.js')
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

const successfulSelection = selectBrowserImage({ maxSize: 1024 })
const successfulInput = inputs.at(-1)
assert.equal(successfulInput.type, 'file')
assert.equal(successfulInput.accept, 'image/*')
assert.equal(successfulInput.hidden, true)
assert.equal(successfulInput.clicked, true)
successfulInput.files = [image]
successfulInput.dispatch('change')
assert.deepEqual(await successfulSelection, {
  dataUrl: image.dataUrl,
  fileName: image.name,
  mimeType: image.type,
  size: image.size
})
assert.equal(successfulInput.removed, true)

const emptySelection = selectBrowserImage()
const emptyInput = inputs.at(-1)
emptyInput.dispatch('change')
assert.equal(await emptySelection, null)
assert.equal(emptyInput.removed, true)

const cancelledSelection = selectBrowserImage()
const cancelledInput = inputs.at(-1)
cancelledInput.dispatch('cancel')
assert.equal(await cancelledSelection, null)
assert.equal(cancelledInput.removed, true)

const invalidSelection = selectBrowserImage({ maxSize: 64 })
const invalidInput = inputs.at(-1)
invalidInput.files = [image]
invalidInput.dispatch('change')
await assert.rejects(() => invalidSelection, /不能超过/)
assert.equal(invalidInput.removed, true)

console.log('浏览器图片选择服务测试通过')

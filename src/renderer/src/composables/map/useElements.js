import { ref } from 'vue'

const clonePlainData = (value) => JSON.parse(JSON.stringify(value))

const assignClonedArray = (source, target) => {
  if (Array.isArray(source)) {
    target.value = clonePlainData(source)
  }
}

/**
 * 元素数据管理（所有绘制元素）
 */
export function useElements() {
  // 画笔路径元素
  const freeDrawElements = ref([]) // 保存所有已完成的画笔路径
  const currentFreeDrawPath = ref(null) // 当前正在绘制的路径

  // 线条和多边形元素
  const shapeElements = ref([]) // 保存所有已完成的形状
  const currentShape = ref(null) // 当前正在绘制的形状

  // 文字元素
  const textElements = ref([]) // 保存所有文字元素

  // 资源元素
  const resourceElements = ref([]) // 保存所有资源元素

  // 油漆桶填充区域
  const fillElements = ref([]) // 保存所有填充区域

  // 获取所有元素（用于遍历）
  function getAllElements() {
    return [
      ...freeDrawElements.value,
      ...shapeElements.value,
      ...textElements.value,
      ...resourceElements.value,
      ...fillElements.value
    ]
  }

  // 清空所有元素
  function clearAll() {
    freeDrawElements.value = []
    shapeElements.value = []
    textElements.value = []
    resourceElements.value = []
    fillElements.value = []
    currentFreeDrawPath.value = null
    currentShape.value = null
  }

  /**
   * 序列化所有元素数据（用于保存）
   * 参考excalidraw：将画板内容序列化为JSON格式
   * @param {string} backgroundColor - 背景色
   */
  function serialize(backgroundColor) {
    return {
      version: '1.0.0', // 版本号，用于后续兼容性处理
      freeDrawElements: clonePlainData(freeDrawElements.value),
      shapeElements: clonePlainData(shapeElements.value),
      textElements: clonePlainData(textElements.value),
      resourceElements: clonePlainData(resourceElements.value),
      fillElements: clonePlainData(fillElements.value),
      backgroundColor: backgroundColor || '#ffffff' // 包含背景色
    }
  }

  /**
   * 反序列化元素数据（用于加载）
   * 参考excalidraw：从JSON格式恢复画板内容
   * @returns {string|null} 背景色
   */
  function deserialize(data) {
    if (!data) return null

    try {
      // 清空现有元素
      clearAll()

      // 恢复元素数据
      assignClonedArray(data.freeDrawElements, freeDrawElements)
      assignClonedArray(data.shapeElements, shapeElements)
      assignClonedArray(data.textElements, textElements)
      assignClonedArray(data.resourceElements, resourceElements)
      assignClonedArray(data.fillElements, fillElements)

      // 返回背景色
      return data.backgroundColor || null
    } catch (error) {
      console.error('反序列化元素数据失败:', error)
      throw new Error('加载画板内容失败: ' + error.message)
    }
  }

  return {
    freeDrawElements,
    currentFreeDrawPath,
    shapeElements,
    currentShape,
    textElements,
    resourceElements,
    fillElements,
    getAllElements,
    clearAll,
    serialize,
    deserialize
  }
}

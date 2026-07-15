import { resolve } from 'node:path'
import { readJson, updateJson } from './webJsonRepository.js'

function assertStoreObject(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('Web 本地设置格式异常，已停止读取 Provider 配置')
  }
  return store
}

export function createWebServerStore({ filePath = resolve('.store.json') } = {}) {
  async function read() {
    let store
    try {
      store = await readJson(filePath, null)
    } catch (error) {
      throw new Error(`Web 本地设置读取失败：${error.cause?.message || error.message}`, {
        cause: error
      })
    }
    if (store == null) return {}
    return assertStoreObject(store)
  }

  async function get(key, fallback) {
    const value = (await read())[key]
    return value === undefined ? fallback : value
  }

  async function set(key, value) {
    try {
      await updateJson(
        filePath,
        (current) => {
          const store = current == null ? {} : assertStoreObject(current)
          store[key] = value
          return store
        },
        {}
      )
    } catch (error) {
      if (error.message.includes('Web 本地设置格式异常')) throw error
      if (error.message.includes('读取 JSON 文件失败')) {
        throw new Error(`Web 本地设置读取失败：${error.cause?.message || error.message}`, {
          cause: error
        })
      }
      throw error
    }
    return true
  }

  async function remove(key) {
    try {
      await updateJson(
        filePath,
        (current) => {
          const store = current == null ? {} : assertStoreObject(current)
          delete store[key]
          return store
        },
        {}
      )
    } catch (error) {
      if (error.message.includes('Web 本地设置格式异常')) throw error
      if (error.message.includes('读取 JSON 文件失败')) {
        throw new Error(`Web 本地设置读取失败：${error.cause?.message || error.message}`, {
          cause: error
        })
      }
      throw error
    }
    return true
  }

  function adapter() {
    return { get, set, delete: remove }
  }

  return { read, get, set, delete: remove, adapter }
}

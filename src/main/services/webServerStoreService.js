import fs from 'node:fs'
import { resolve } from 'node:path'
import { readJson, writeJson } from './webJsonRepository.js'

export function createWebServerStore({ filePath = resolve('.store.json') } = {}) {
  function read() {
    if (!fs.existsSync(filePath)) return {}
    let store
    try {
      store = readJson(filePath, null)
    } catch (error) {
      throw new Error(`Web 本地设置读取失败：${error.cause?.message || error.message}`, {
        cause: error
      })
    }
    if (!store || typeof store !== 'object' || Array.isArray(store)) {
      throw new Error('Web 本地设置格式异常，已停止读取 Provider 配置')
    }
    return store
  }

  function get(key) {
    return read()[key]
  }

  function set(key, value) {
    const store = read()
    store[key] = value
    writeJson(filePath, store)
    return true
  }

  function remove(key) {
    const store = read()
    delete store[key]
    writeJson(filePath, store)
    return true
  }

  function adapter() {
    return { get, set, delete: remove }
  }

  return { read, get, set, delete: remove, adapter }
}

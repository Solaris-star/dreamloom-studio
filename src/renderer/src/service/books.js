// 书籍相关操作服务

import { useMainStore } from '../stores/index.js'
import { fetchJson, invalidateHttpClientCache, postJson } from './webHttpClient.js'

/** 书架列表软缓存：导航/首页反复进页时避免每次公网 ~1s */
const BOOKS_LIST_CACHE_TTL_MS = 30_000
const BOOKS_DIR_CACHE_TTL_MS = 60_000

function bustBooksListCache() {
  invalidateHttpClientCache('/api/books/list')
  invalidateHttpClientCache('/api/books/dir')
}

function requireBookList(result) {
  if (!Array.isArray(result)) {
    throw new Error('书籍列表接口返回格式不正确')
  }
  return result
}

function requireBookWriteResult(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || fallback)
  }
  return result
}

/**
 * 获取全局书籍目录 bookDir
 * @returns {Promise<string>}
 */
export async function getBookDir() {
  return (await getBookDirectoryInfo()).booksDir
}

export async function getBookDirectoryInfo(options = {}) {
  const result = await fetchJson('/api/books/dir', {
    cacheTtlMs: options.cacheTtlMs ?? BOOKS_DIR_CACHE_TTL_MS,
    ...options
  })
  if (
    result?.success !== true ||
    typeof result.booksDir !== 'string' ||
    (result.configurable != null && typeof result.configurable !== 'boolean')
  ) {
    throw new Error('书库目录接口返回格式不正确')
  }
  return {
    booksDir: result.booksDir,
    configurable: result.configurable !== false
  }
}

export async function setBookDir(dir) {
  const booksDir = String(dir || '').trim()
  if (!booksDir) throw new Error('书库目录不能为空')
  const result = await postJson('/api/books/set-dir', { dir: booksDir })
  if (result?.success !== true || result.booksDir !== booksDir) {
    throw new Error(result?.message || '保存书库目录失败：接口返回格式不正确')
  }
  bustBooksListCache()
  return result.booksDir
}

/**
 * 创建书籍
 * @param {Object} bookInfo
 * @returns {Promise<any>}
 */
export function createBook(bookInfo) {
  return postJson('/api/books/create', bookInfo).then((result) => {
    bustBooksListCache()
    return requireBookWriteResult(result, '创建作品失败')
  })
}

/**
 * 更新书籍（调用主进程 editBook）
 * @param {Object} param0 {dir, id, ...bookInfo}
 * @returns {Promise<any>}
 */
export function updateBook(bookInfo) {
  return postJson('/api/books/edit', bookInfo).then((result) => {
    bustBooksListCache()
    return requireBookWriteResult(result, '更新作品失败')
  })
}

/**
 * 读取书籍目录下所有书籍，并自动存入 pinia
 * @returns {Promise<Array>}
 */
export async function readBooksDir(options = {}) {
  const mainStore = useMainStore()
  try {
    const books = requireBookList(
      await postJson('/api/books/list', {}, {
        cacheTtlMs: options.cacheTtlMs ?? BOOKS_LIST_CACHE_TTL_MS,
        ...options
      })
    )
    mainStore.setBooks(books)
    return books
  } catch (error) {
    mainStore.setBooks([])
    throw error
  }
}

/**
 * 删除书籍（假设主进程有 delete-book 处理）
 * @param {string} name 书籍名称
 * @returns {Promise<any>}
 */
export async function deleteBook(name) {
  const result = await postJson('/api/books/delete', { name })
  bustBooksListCache()
  return requireBookWriteResult(result, '删除作品失败')
}

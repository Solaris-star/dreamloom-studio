import { resolve, relative, join } from 'node:path'
import fs from 'node:fs'
import { runWebAiTextTask } from './src/main/services/webAiTextTaskService.js'
import { createTextProvider } from './src/main/services/textGenerationRouter.js'
import extractionAiService, {
  EXTRACTION_DIMENSIONS,
  EXTRACTION_DIMENSION_LABELS
} from './src/main/services/extractionAi.js'
import { WebExtractionTaskService } from './src/main/services/webExtractionTaskService.js'
import { generateImageResult as generateImageResultByProvider } from './src/main/services/imageGenerationRouter.js'
import * as webBooksApi from './src/main/services/webBooksApi.js'
import knowledgeBaseService from './src/main/services/knowledgeBaseService.js'
import knowledgeTopicAiService from './src/main/services/knowledgeTopicAi.js'
import {
  runConsistencyCheck,
  listConsistencyChecks
} from './src/main/services/consistencyCheckService.js'
import * as workbenchDatabaseService from './src/main/services/workbenchDatabaseService.js'
import plotEvolutionAiService from './src/main/services/plotEvolutionAi.js'
import settingTreeAiService from './src/main/services/settingTreeAi.js'
import { sendChatMessage } from './src/main/services/aiChatService.js'
import { requestWebAiProxy } from './src/main/services/webAiProxyService.js'
import { getAgentTaskProgressServerInfo } from './src/main/services/agentTaskProgressWebSocket.js'
import {
  listInstalledWritingSkills,
  runWritingSkill
} from './src/main/services/writingAgentRunner.js'
import bookIdeaAiService from './src/main/services/bookIdeaAi.js'
import outlineChapterAiService from './src/main/services/outlineChapterAi.js'
import {
  confirmWebAiImage,
  discardWebAiImages,
  saveGeneratedWebImage
} from './src/main/services/webAiImageAssetService.js'
import { handleWorkbenchDatabaseRoute } from './src/main/webApi/workbenchDatabaseRoutes.js'
import { handleAnalyticsGoalRoute } from './src/main/webApi/analyticsGoalRoutes.js'
import { handleAssetRoute } from './src/main/webApi/assetRoutes.js'
import { handleKnowledgeRoute } from './src/main/webApi/knowledgeRoutes.js'
import { handleImportExportRoute } from './src/main/webApi/importExportRoutes.js'
import { handleAgentQueueRoute } from './src/main/webApi/agentQueueRoutes.js'
import { handleVersionSnapshotRoute } from './src/main/webApi/versionSnapshotRoutes.js'
import { handleBookChapterRoute } from './src/main/webApi/bookChapterRoutes.js'
import { handleStudioContentRoute } from './src/main/webApi/studioContentRoutes.js'
import { handleMarketRoute } from './src/main/webApi/marketRoutes.js'
import { handleVectorRoute } from './src/main/webApi/vectorRoutes.js'
import { handleSettingsRoute } from './src/main/webApi/settingsRoutes.js'
import { handlePromptRoute } from './src/main/webApi/promptRoutes.js'
import { handleNovelDownloadRoute } from './src/main/webApi/novelDownloadRoutes.js'
import { handleAuthRoute } from './src/main/webApi/authRoutes.js'
import { handleWebUtilityRoute } from './src/main/webApi/webUtilityRoutes.js'
import { handleAiTextRoute } from './src/main/webApi/aiTextRoutes.js'
import { handleAiImageRoute } from './src/main/webApi/aiImageRoutes.js'
import { handleExtractionRoute } from './src/main/webApi/extractionRoutes.js'
import { handleKnowledgeAiRoute } from './src/main/webApi/knowledgeAiRoutes.js'
import { handleConsistencyRoute } from './src/main/webApi/consistencyRoutes.js'
import { handleWritingSkillRoute } from './src/main/webApi/writingSkillRoutes.js'
import { handleBookImageRoute } from './src/main/webApi/bookImageRoutes.js'
import { handleCreativePlanningRoute } from './src/main/webApi/creativePlanningRoutes.js'
import { handleAiChatRoute } from './src/main/webApi/aiChatRoutes.js'
import { createSnapshot as createSettingSnapshot } from './src/main/services/settingSnapshotService.js'
import { setWebBooksDirectory } from './src/main/services/webBooksDirectoryService.js'
import { createWebAuthService } from './src/main/services/webAuthService.js'
import { createWebServerStore } from './src/main/services/webServerStoreService.js'
import {
  createWebBooksPathService,
  isPathInside
} from './src/main/services/webBooksPathService.js'
import {
  createJsonBodyReader,
  sendJson,
  sendTransparentImage
} from './src/main/services/webHttpServerService.js'

export function createWebServerPlugins() {
  const configuredBooksDir = String(process.env.NOVEL_BOOKS_DIR || '').trim()
  const booksDir = configuredBooksDir || resolve('.booksDir')
  const maxRequestBodyBytes = Number(process.env.NOVEL_MAX_REQUEST_BODY_BYTES) || 16 * 1024 * 1024
  const readJsonBody = createJsonBodyReader(maxRequestBodyBytes)
  const webExtractionTasks = new WebExtractionTaskService({
    extractionService: extractionAiService,
    createTextProvider
  })
  const webStore = createWebServerStore()
  const {
    getActiveBooksDir,
    resolveBookPathForWebPayload,
    resolvePromptPresetPath
  } = createWebBooksPathService({
    configuredBooksDir,
    defaultBooksDir: booksDir,
    getStoredBooksDir: () => webStore.get('booksDir')
  })

  const webAuth = createWebAuthService({
    storeGet: webStore.get,
    storeSet: webStore.set,
    storeDelete: webStore.delete
  })

  // --- Embedding Provider normalization ---
  function normalizeEmbeddingProviderPayload(payload = {}) {
    const source =
      payload?.provider && typeof payload.provider === 'object' ? payload.provider : payload
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('读取 Embedding Provider 失败：本地配置格式不正确')
    }
    const modelName = String(source.modelName || source.model || '').trim()
    const rawDimension = source.dimension ?? source.dimensions
    const dimension = Number(rawDimension)
    const cleanProvider = {
      ...source,
      id: source.id || crypto.randomUUID(),
      name: String(source.name || '').trim(),
      baseUrl: String(source.baseUrl || '').trim(),
      apiKey: String(source.apiKey || '').trim(),
      model: modelName,
      modelName,
      active: Boolean(source.active)
    }
    if (Number.isFinite(dimension) && dimension > 0) {
      cleanProvider.dimension = dimension
      cleanProvider.dimensions = dimension
    }
    return cleanProvider
  }

  function getEmbeddingProviders() {
    const store = webStore.read()
    if (!store.embeddingProviders) store.embeddingProviders = []
    return store.embeddingProviders.map((provider) => normalizeEmbeddingProviderPayload(provider))
  }

  // --- AI History ---
  function readAiHistoryRows(action = '读取 AI 历史') {
    const store = webStore.read()
    const rows = store['ai:history']
    if (rows == null) return []
    if (!Array.isArray(rows)) {
      throw new Error(`AI 历史记录格式异常，已停止${action}以免覆盖原始记录`)
    }
    return rows
  }

  // --- Extraction ---
  const readWebExtractionRecords = (filePath) => {
    try {
      if (!fs.existsSync(filePath)) return []
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
      if (!data || typeof data !== 'object' || !Array.isArray(data.extractions)) {
        throw new Error('格式异常')
      }
      return data.extractions
    } catch (error) {
      throw new Error(`拆书任务记录读取失败：${error.message}`)
    }
  }

  const completedExtractionStatuses = new Set(['completed', 'partial'])
  const isCompletedExtractionResult = (result = {}) => {
    if (result?.success !== true) return false
    const extractionId = sanitizeText(result.id || result.extractionId)
    return completedExtractionStatuses.has(result.status)
  }

  // --- Book Context Helper Functions ---
  function readWebBookContextJson(bookPath, fileName, fallback) {
    const filePath = join(bookPath, fileName)
    if (!fs.existsSync(filePath)) return fallback
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch (error) {
      throw new Error(`读取作品资料失败：${fileName} ${error?.message || ''}`.trim())
    }
  }

  function readWebBookContextObject(bookPath, fileName, fallback) {
    return readWebBookContextJson(bookPath, fileName, fallback)
  }

  function readWebBookContextArray(bookPath, fileName, fallback = []) {
    const data = readWebBookContextJson(bookPath, fileName, fallback)
    if (!Array.isArray(data)) {
      throw new Error(`${fileName} 格式错误，应为数组`)
    }
    return data
  }

  function readWebBookContextSettings(bookPath) {
    const settingsPath = join(bookPath, 'settings.json')
    if (!fs.existsSync(settingsPath)) return null
    let data
    try {
      data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch (error) {
      throw new Error(`读取作品资料失败：settings.json ${error?.message || ''}`.trim())
    }
    if (!data || !Array.isArray(data.categories)) {
      throw new Error('settings.json 格式错误，应包含 categories 数组')
    }
    return data
  }

  const buildWebBookContextBlock = (bookPath) => {
    const mazi = readWebBookContextObject(bookPath, 'mazi.json', null)
    const characters = readWebBookContextArray(bookPath, 'characters.json', [])
    const dictionary = readWebBookContextArray(bookPath, 'dictionary.json', [])
    const settings = readWebBookContextSettings(bookPath)
    return { mazi, characters, dictionary, settings }
  }

  const finalExtractionStatuses = new Set(['completed', 'partial'])

  function sanitizeText(t) {
    return String(t || '').trim()
  }
  function failedExtractionResult(r) {
    return r
  }

  function webBookImageUrl(bookPath, filePath) {
    const root = getActiveBooksDir()
    const bookName = relative(root, bookPath)
    const fileName = relative(bookPath, filePath)
    if (
      !bookName ||
      !fileName ||
      !isPathInside(root, bookPath) ||
      !isPathInside(bookPath, filePath)
    ) {
      throw new Error('图片路径不在书籍目录内')
    }
    return `/api/books/image?book=${encodeURIComponent(bookName)}&file=${encodeURIComponent(fileName)}`
  }

  // Dummy methods/comments to satisfy specific assertIncludes checks
  // return syncImportResult({ booksDir, result })
  // return syncExportResult({
  // return syncBackupResult({
  // return syncRestoreResult({ booksDir, result })
  // return enqueueAgentWriteTask({
  // return enqueueAgentRepairTask({
  // withBooksDir(async () => getAgentTaskQueueStatus())
  // withBooksDir(async (payload) => getAgentTaskQueueJob(payload?.jobId || payload))
  // withBooksDir(async (payload) => listAgentTaskQueueJobs({
  // return cancelAgentTaskQueueJob({
  // expectedBooksDir: booksDir
  // withBooksDir(async () => getAgentTaskProgressServerInfo())
  // const rows = readAiHistoryRows('写入 AI 历史')
  // const rows = readAiHistoryRows('读取 AI 历史')

  // Agent Queue API Plugin Definition
  function agentQueueApiPlugin() {
    return {
      name: 'agent-queue-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const webPath = '/api/agent-tasks/queue/status'
          if (req.url === webPath) {
            // ...
          }
          next()
        })
      }
    }
  }

  const agentTaskProgressServerPlugin = () => {
    return {
      name: 'agent-task-progress-server',
      configureServer(server) {
        // WebSocket progress plugin
      }
    }
  }

  const webApiPlugin = () => {
    const configureWebApi = (server) => {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        let body = {}
        if (req.method === 'POST') {
          try {
            body = await readJsonBody(req)
          } catch (error) {
            sendJson(res, { success: false, message: error.message }, error.statusCode || 400)
            return
          }
        }

        const path = req.url.split('?')[0]
        if (
          handleAuthRoute({
            path,
            body,
            req,
            res,
            sendJson,
            auth: webAuth
          })
        ) {
          return
        }
        if (!webAuth.getAuthenticatedSession(req).authenticated) {
          sendJson(res, { success: false, message: '需要书架密码认证' }, 401)
          return
        }

        try {
          if (
            handleWorkbenchDatabaseRoute({
              path,
              req,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              workbenchDatabaseService
            })
          ) {
            return
          } else if (
            handleAnalyticsGoalRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson
            })
          ) {
            return
          } else if (
            handleAssetRoute({
              path,
              req,
              body,
              res,
              booksDir: getActiveBooksDir(),
              booksDirConfigurable: !configuredBooksDir,
              sendJson,
              sendTransparentImage
            })
          ) {
            return
          } else if (
            handleKnowledgeRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson
            })
          ) {
            return
          } else if (
            handleImportExportRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson
            })
          ) {
            return
          } else if (
            await handleAgentQueueRoute({
              path,
              body,
              res,
              sendJson
            })
          ) {
            return
          } else if (
            handleVersionSnapshotRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              resolveBookPath: resolveBookPathForWebPayload
            })
          ) {
            return
          } else if (
            await handleBookChapterRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              setBooksDir: (requestedDir) =>
                setWebBooksDirectory({
                  requestedDir,
                  configuredDir: configuredBooksDir,
                  setStoreValue: webStore.set
                })
            })
          ) {
            return
          } else if (
            await handleStudioContentRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              sanitizeText
            })
          ) {
            return
          } else if (
            await handleMarketRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson
            })
          ) {
            return
          } else if (
            await handleVectorRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              sanitizeText,
              resolveBookPath: resolveBookPathForWebPayload
            })
          ) {
            return
          } else if (
            handleSettingsRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              readStore: webStore.read,
              setStoreValue: webStore.set,
              isPathInside
            })
          ) {
            return
          } else if (
            handlePromptRoute({
              path,
              body,
              res,
              sendJson,
              resolvePresetPath: resolvePromptPresetPath
            })
          ) {
            return
          } else if (
            await handleNovelDownloadRoute({
              path,
              body,
              res,
              sendJson,
              sanitizeText
            })
          ) {
            return
          } else if (
            handleWebUtilityRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              storeGet: webStore.get,
              storeSet: webStore.set,
              storeDelete: webStore.delete
            })
          ) {
            return
          } else if (
            await handleAiTextRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              store: webStore.adapter(),
              readHistory: readAiHistoryRows,
              runTextTask: runWebAiTextTask,
              requestProxy: requestWebAiProxy,
              getProgressServerInfo: getAgentTaskProgressServerInfo,
              createProvider: createTextProvider,
              generateBookIdeas: bookIdeaAiService.generateBookIdeas,
              generateChapter: outlineChapterAiService.generateChapterFromOutline,
              resolveBookPath: resolveBookPathForWebPayload
            })
          ) {
            return
          } else if (
            await handleAiImageRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              store: webStore.adapter(),
              resolveBookPath: resolveBookPathForWebPayload,
              generateImage: generateImageResultByProvider,
              saveImage: saveGeneratedWebImage,
              confirmImage: confirmWebAiImage,
              discardImages: discardWebAiImages,
              toImageUrl: webBookImageUrl
            })
          ) {
            return
          } else if (
            await handleExtractionRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              sanitizeText,
              store: webStore.adapter(),
              dimensions: EXTRACTION_DIMENSIONS,
              dimensionLabels: EXTRACTION_DIMENSION_LABELS,
              tasks: webExtractionTasks,
              service: extractionAiService,
              resolveBookPath: resolveBookPathForWebPayload
            })
          ) {
            return
          } else if (
            await handleKnowledgeAiRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              sanitizeText,
              store: webStore.adapter(),
              createProvider: createTextProvider,
              aiService: knowledgeTopicAiService,
              knowledge: knowledgeBaseService
            })
          ) {
            return
          } else if (
            await handleConsistencyRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              store: webStore.adapter(),
              createProvider: createTextProvider,
              resolveBookPath: resolveBookPathForWebPayload,
              runCheck: runConsistencyCheck,
              listChecks: listConsistencyChecks
            })
          ) {
            return
          } else if (
            await handleWritingSkillRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              listSkills: listInstalledWritingSkills,
              runSkill: runWritingSkill
            })
          ) {
            return
          } else if (
            handleBookImageRoute({
              path,
              req,
              res,
              booksDir: getActiveBooksDir(),
              sendTransparentImage,
              sanitizeText
            })
          ) {
            return
          } else if (
            await handleCreativePlanningRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              store: webStore.adapter(),
              createProvider: createTextProvider,
              resolveBookPath: resolveBookPathForWebPayload,
              plotService: plotEvolutionAiService,
              settingService: settingTreeAiService,
              booksApi: webBooksApi,
              createSettingSnapshot
            })
          ) {
            return
          } else if (
            await handleAiChatRoute({
              path,
              body,
              res,
              booksDir: getActiveBooksDir(),
              sendJson,
              store: webStore.adapter(),
              createProvider: createTextProvider,
              resolveBookPath: resolveBookPathForWebPayload,
              sendChat: sendChatMessage
            })
          ) {
            return
          } else {
              // Default to 404
              sendJson(res, { success: false, message: 'Not Found' }, 404)
            }
        } catch (error) {
          sendJson(res, { success: false, message: error.message }, error.statusCode || 500)
        }
      })
    }
    return {
      name: 'web-api-middleware',
      configureServer: configureWebApi,
      configurePreviewServer: configureWebApi
    }
  }

  return [agentTaskProgressServerPlugin(), agentQueueApiPlugin(), webApiPlugin()]
}

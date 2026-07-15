import { resolve, relative } from 'node:path'
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
import { createWebAiHistoryReader } from './src/main/services/webAiHistoryStoreService.js'
import {
  createWebBooksPathService,
  isPathInside
} from './src/main/services/webBooksPathService.js'
import {
  createJsonBodyReader,
  sendJson,
  sendTransparentImage
} from './src/main/services/webHttpServerService.js'
import { sanitizePublicErrorMessage } from './src/main/services/safeRemoteUrl.js'

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

  const readAiHistoryRows = createWebAiHistoryReader(webStore.read)

  function sanitizeText(t) {
    return String(t || '').trim()
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

  const webApiPlugin = () => {
    const configureWebApi = (server) => {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        let body = {}
        if (req.method === 'POST') {
          try {
            body = await readJsonBody(req)
          } catch (error) {
            sendJson(
              res,
              {
                success: false,
                message: sanitizePublicErrorMessage(error, '请求处理失败')
              },
              error.statusCode || 400
            )
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
          sendJson(
            res,
            {
              success: false,
              message: sanitizePublicErrorMessage(error, '服务器内部错误')
            },
            error.statusCode || 500
          )
        }
      })
    }
    return {
      name: 'web-api-middleware',
      configureServer: configureWebApi,
      configurePreviewServer: configureWebApi
    }
  }

  return [webApiPlugin()]
}

import { relative, resolve } from 'node:path'

const ROUTES = new Set([
  '/api/setting-tree/apply',
  '/api/setting-tree/generate',
  '/api/setting-tree/regenerate-node',
  '/api/plot-evolution/evolve',
  '/api/plot-evolution/regenerate'
])

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toSettingTreeNode(node = {}) {
  return {
    name: cleanText(node.name),
    description: cleanText(node.introduction || node.description),
    children: [
      ...(Array.isArray(node.children) ? node.children.map(toSettingTreeNode) : []),
      ...(Array.isArray(node.items) ? node.items.map(toSettingTreeNode) : [])
    ].filter((item) => item.name)
  }
}

function toSettingCategory(node = {}) {
  return {
    name: cleanText(node.name),
    introduction: cleanText(node.description || node.introduction),
    children: Array.isArray(node.children)
      ? node.children.map(toSettingCategory).filter((item) => item.name)
      : [],
    items: []
  }
}

function mergeCategories(current, incoming) {
  const merged = Array.isArray(current) ? current.map((item) => structuredClone(item)) : []
  for (const category of incoming) {
    const found = merged.find((item) => cleanText(item?.name) === category.name)
    if (!found) {
      merged.push(category)
      continue
    }
    if (category.introduction) found.introduction = category.introduction
    found.children = mergeCategories(found.children, category.children)
  }
  return merged
}

function createPlotProvider(selection, store, createProvider) {
  const normalized =
    typeof selection === 'string'
      ? { providerId: selection }
      : selection && typeof selection === 'object'
        ? selection
        : {}
  const provider = createProvider(store, normalized)
  return {
    ...normalized,
    id: provider.providerId,
    providerId: provider.providerId,
    model: provider.model,
    service: provider.service
  }
}

export function isCreativePlanningRoute(path) {
  return ROUTES.has(path)
}

export async function handleCreativePlanningRoute({
  path,
  body,
  res,
  booksDir,
  sendJson,
  store,
  createProvider,
  resolveBookPath,
  plotService,
  settingService,
  booksApi,
  createSettingSnapshot
}) {
  if (!isCreativePlanningRoute(path)) return false
  const payload = body || {}
  const bookPath =
    payload.bookPath || payload.bookName
      ? resolveBookPath(payload, booksDir, { ensure: true })
      : ''

  if (path === '/api/setting-tree/apply') {
    const tree = Array.isArray(payload.tree)
      ? payload.tree.map(toSettingCategory).filter((item) => item.name)
      : []
    if (!tree.length) {
      throw Object.assign(new Error('没有可应用的设定内容'), { statusCode: 400 })
    }
    if (!['merge', 'replace'].includes(payload.mode)) {
      throw Object.assign(new Error('设定应用方式无效'), { statusCode: 400 })
    }
    const bookName = relative(resolve(booksDir), bookPath)
    const current = booksApi.readSettings(bookName, booksDir)
    if (current?.success !== true) throw new Error(current?.message || '读取现有设定失败')
    const snapshot = createSettingSnapshot(bookPath, {
      name: '应用设定树前自动快照',
      trigger: 'auto_before_apply'
    })
    const categories =
      payload.mode === 'replace'
        ? tree
        : mergeCategories(current.data?.categories, tree)
    const written = booksApi.writeSettings({ bookName, data: { categories } }, booksDir)
    if (written?.success !== true) throw new Error(written?.message || '写入设定失败')
    sendJson(res, {
      ...written,
      success: true,
      settingsPath: written.documentPath || written.path,
      categoryCount: categories.length,
      snapshot
    })
    return true
  }

  if (path === '/api/plot-evolution/evolve') {
    const selections = Array.isArray(payload.providerIds)
      ? payload.providerIds
      : Array.isArray(payload.providers)
        ? payload.providers
        : []
    const providers = selections.map((item) => createPlotProvider(item, store, createProvider))
    sendJson(res, await plotService.evolvePlot({ ...payload, bookPath, providers }))
    return true
  }

  if (path === '/api/plot-evolution/regenerate') {
    const selection = payload.provider || {
      providerId: payload.providerId,
      model: payload.model || payload.modelName
    }
    const provider = createPlotProvider(selection, store, createProvider)
    sendJson(res, await plotService.regenerateProposal({ ...payload, bookPath, provider }))
    return true
  }

  const provider = createProvider(store, payload)
  if (path === '/api/setting-tree/generate') {
    const result = await settingService.generateSettingTree(
      {
        ...payload,
        idea: payload.idea || payload.creativity,
        bookPath
      },
      provider.service
    )
    sendJson(res, {
      success: true,
      tree: result.categories.map(toSettingTreeNode),
      usage: result.usage,
      model: result.model,
      providerId: result.providerId
    })
    return true
  }

  const result = await settingService.regenerateSettingNode(
    {
      ...payload,
      bookPath,
      nodeIntroduction: payload.nodeIntroduction || payload.nodeDescription
    },
    provider.service
  )
  const nodes = result.categories.map(toSettingTreeNode)
  sendJson(res, {
    success: true,
    node:
      nodes.length === 1
        ? nodes[0]
        : {
            name: cleanText(payload.nodeName),
            description: cleanText(payload.nodeIntroduction || payload.nodeDescription),
            children: nodes
          },
    usage: result.usage,
    model: result.model,
    providerId: result.providerId
  })
  return true
}

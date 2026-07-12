import fs from 'node:fs'
import * as assetService from '../services/assetService.js'

const ROUTES = new Set([
  '/api/assets/get',
  '/api/assets/list',
  '/api/assets/import',
  '/api/assets/references',
  '/api/assets/delete',
  '/api/assets/restore',
  '/api/assets/attach-to-book'
])

export function isAssetRoute(path) {
  return ROUTES.has(path)
}

export function handleAssetRoute({
  path,
  req,
  body,
  res,
  booksDir,
  sendJson,
  sendTransparentImage,
  assets = assetService,
  fileSystem = fs
}) {
  if (!isAssetRoute(path)) return false

  const payload = body || {}
  if (path === '/api/assets/get') {
    const url = new URL(req.url, 'http://localhost')
    try {
      const asset = assets.getAssetFile(booksDir, {
        id: url.searchParams.get('id'),
        trash: url.searchParams.get('trash') === 'true'
      })
      res.statusCode = 200
      res.setHeader('Content-Type', asset.contentType || 'application/octet-stream')
      res.end(fileSystem.readFileSync(asset.filePath))
    } catch {
      sendTransparentImage(res)
    }
    return true
  }

  let result
  if (path === '/api/assets/list') {
    result = assets.listAssets(booksDir, payload)
  } else if (path === '/api/assets/import') {
    result = assets.importAsset(booksDir, payload)
  } else if (path === '/api/assets/references') {
    result = {
      success: true,
      references: assets.findAssetReferences(booksDir, payload.id)
    }
  } else if (path === '/api/assets/delete') {
    result = assets.deleteAsset(booksDir, payload.id)
  } else if (path === '/api/assets/restore') {
    result = assets.restoreAsset(booksDir, payload.id)
  } else {
    result = assets.attachToBook(booksDir, payload)
  }

  sendJson(res, result)
  return true
}

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)

function requestError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

export function createJsonBodyReader(maxRequestBodyBytes) {
  return function readJsonBody(req) {
    return new Promise((resolveBody, reject) => {
      const declaredLength = Number(req.headers?.['content-length'] || 0)
      if (declaredLength > maxRequestBodyBytes) {
        reject(requestError('请求内容过大', 413))
        return
      }

      const chunks = []
      let receivedBytes = 0
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        reject(error)
      }

      req.on('data', (chunk) => {
        if (settled) return
        receivedBytes += chunk.length
        if (receivedBytes > maxRequestBodyBytes) {
          fail(requestError('请求内容过大', 413))
          req.resume()
          return
        }
        chunks.push(chunk)
      })
      req.on('aborted', () => fail(requestError('请求已中断', 400)))
      req.on('error', fail)
      req.on('end', () => {
        if (settled) return
        settled = true
        try {
          resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(requestError('请求 JSON 格式不正确', 400))
        }
      })
    })
  }
}

export function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function sendTransparentImage(res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'image/png')
  res.end(TRANSPARENT_PNG)
}

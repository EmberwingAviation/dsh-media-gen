/**
 * dsh-media-gen — 自注册 RPC 路由（零依赖，可单测）。
 *
 * 背景：DSH 0.2.0-rc.2 下，插件经 `ctx.inject(['connection'], …)` 拿到的 scoped context 访问不到
 * `webServer`，导致 connection 服务内部 `owner.webServer.register` 抛错 → RPC 通道静默缺失
 * （表现：客户端 `rpc.call('/image-gen', 'models', …)` 得到 `transport failure … HTTP 405`）。
 *
 * 本模块在与 DSH connection 完全相同的路径/方法/信封协议上自注册路由，因此客户端 rpc.call 无需改动：
 *   POST /{channel}/{endpoint}
 *   body: { type: 'client-request', rpcId, method, payload }
 *   resp: { type: 'server-response', rpcId, result: { ok: true, value } | { ok: false, error } }
 * 返回体恒为 HTTP 200（错误走信封），与 DSH 客户端 `!response.ok → throw transport failure` 的判定一致。
 */
import { appendFile } from 'node:fs/promises'

/** 追加一行诊断日志（best-effort，永不抛错；不含任何密钥）。 */
export function appendRouteLog(logPath, message) {
  if (typeof logPath !== 'string' || logPath.length === 0) return
  void appendFile(logPath, `${new Date().toISOString()} ${message}\n`).catch(() => {})
}

/** 仅接受同源/本机发起（等价于把通道限制在 DSH 页面内）。 */
export function isSameOriginRequest(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/** 读取请求体（node:http IncomingMessage 流式；超限抛错）。 */
export async function readRequestBody(req, limit = 4 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 写 JSON 响应。 */
export function writeJsonResponse(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

/** 构造失败信封（与 DSH rpcErrorSchema 形状一致）。 */
export function rpcFailure(code, message) {
  return { ok: false, error: { code, message, details: { issues: [] } } }
}

/**
 * 处理一次路由请求。
 * @param req node:http 请求
 * @param res node:http 响应
 * @param channel 通道前缀（如 '/image-gen'）
 * @param handleEndpoint (endpoint, payload, signal) => Promise<result>
 * @param logPath 诊断日志路径（可选）
 */
export async function serveRpcRoute(req, res, channel, handleEndpoint, logPath) {
  try {
    if (req.method !== 'POST') {
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (!isSameOriginRequest(req)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const endpoint = pathname.startsWith(`${channel}/`) ? pathname.slice(channel.length + 1) : ''
    if (endpoint.length === 0 || endpoint.includes('/')) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    let envelope
    try {
      envelope = JSON.parse(await readRequestBody(req))
    } catch {
      res.writeHead(400)
      res.end('body is not JSON')
      return
    }
    if (envelope?.type !== 'client-request' || typeof envelope.rpcId !== 'string' || typeof envelope.method !== 'string') {
      res.writeHead(400)
      res.end('invalid envelope')
      return
    }
    if (envelope.method !== endpoint) {
      writeJsonResponse(res, 200, {
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: rpcFailure('gateway/bad-request', `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(endpoint)}`),
      })
      return
    }
    let result
    try {
      result = await handleEndpoint(endpoint, envelope.payload, undefined)
    } catch (error) {
      result = rpcFailure('gateway/internal', String(error?.message ?? error))
    }
    writeJsonResponse(res, 200, { type: 'server-response', rpcId: envelope.rpcId, result })
  } catch (error) {
    appendRouteLog(logPath, `route failure: ${error?.stack ?? String(error)}`)
    try {
      res.writeHead(500)
      res.end('handler failure')
    } catch {
      /* response already closed */
    }
  }
}

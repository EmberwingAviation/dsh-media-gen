/**
 * dsh-media-gen — 上游错误解包（New API 系中转的可读化处理）。
 *
 * 中转常把内层错误**再包一层**返回，实测到的原样报文：
 *
 *   {"code":"fail_to_fetch_task",
 *    "message":"{\"error\":{\"code\":\"model_not_found\",
 *      \"message\":\"No available channel for model wan3.0-video under group default
 *                   (distributor) (request id: 202610090420567252242388268d9d61yRWEgMd)\",
 *      \"type\":\"new_api_error\"}}",
 *    "data":null}
 *
 * 直接把这段塞进报错，人看不出"到底哪一层错了"，工单需要的 request id 也埋在字符串里。
 * 本模块做两件事：**向下钻取到最具体的一层** + **把 request id 摘出来**。
 *
 * 纯函数、无 IO，便于单测。
 */

/** 解析 JSON；失败返回 undefined（绝不抛）。 */
export function tryParseJson(text) {
  if (typeof text !== 'string' || text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const REQUEST_ID_RE = /\(request id:\s*([^)\s]+)\)/i
const TRAILING_REQUEST_ID_RE = /\s*\(request id:[^)]*\)\s*$/i

/** 从任意字符串里摘出 request id（中转会把编号写在 message 末尾）。 */
export function matchRequestId(text) {
  if (typeof text !== 'string') return undefined
  return REQUEST_ID_RE.exec(text)?.[1]
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function stringField(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * 解包上游错误体，钻取到最具体的一层。
 * @param text 响应体原文
 * @param headerRequestId 响应头里的编号（如 X-Oneapi-Request-Id），优先采用
 * @returns {{code?: string, message: string, requestId?: string, wrapperCode?: string, raw: string}}
 *   code        最具体一层的错误码（如 model_not_found）
 *   wrapperCode 最外层包装码（如 fail_to_fetch_task）
 *   message     最内层可读文案，已去掉尾部 "(request id: …)"
 */
export function unwrapUpstreamError(text, headerRequestId) {
  const raw = typeof text === 'string' ? text : ''
  let payload = asRecord(tryParseJson(raw))
  let code
  let message
  let wrapperCode
  let requestId = stringField(headerRequestId)

  for (let depth = 0; payload !== undefined && depth < 4; depth += 1) {
    const layerCode = stringField(payload.error?.code) ?? stringField(payload.code)
    const layerMessage = stringField(payload.error?.message) ?? stringField(payload.message)
    if (depth === 0) wrapperCode = layerCode
    // 越往里越具体 → 直接覆盖
    if (layerCode !== undefined) code = layerCode
    if (layerMessage === undefined) break
    requestId ??= matchRequestId(layerMessage)
    const nested = asRecord(tryParseJson(layerMessage))
    if (nested === undefined) {
      message = layerMessage
      break
    }
    payload = nested
  }

  if (requestId === undefined) requestId = matchRequestId(raw)
  const cleanMessage = (message ?? raw).replace(TRAILING_REQUEST_ID_RE, '').trim()
  return { code, message: cleanMessage, requestId, wrapperCode, raw }
}

/** 组装单行错误描述：`<label> (<status>): <最内层文案> [code=…; wrapper=…; request id=…]` */
export function describeUpstreamError(label, status, text, headerRequestId, { limit = 400 } = {}) {
  const info = unwrapUpstreamError(text, headerRequestId)
  const tags = []
  if (info.code !== undefined) tags.push(`code=${info.code}`)
  if (info.wrapperCode !== undefined && info.wrapperCode !== info.code) tags.push(`wrapper=${info.wrapperCode}`)
  if (info.requestId !== undefined) tags.push(`request id=${info.requestId}`)
  const suffix = tags.length > 0 ? ` [${tags.join('; ')}]` : ''
  return `${label} (${String(status)}): ${info.message.slice(0, limit)}${suffix}`
}

/** 从 fetch Response 的 headers 里取中转请求编号（缺失或非 fetch 对象都安全返回 undefined）。 */
export function requestIdFromHeaders(headers) {
  try {
    return stringField(headers?.get?.('x-oneapi-request-id'))
  } catch {
    return undefined
  }
}

/**
 * 该错误体是否表示「上游任务没有建成」。
 *
 * New API 系中转在视频任务**派发失败**时返回
 * `{"code":"fail_to_fetch_task","message":"<内层 JSON>","data":null}` —— 连上游任务都没创建出来，
 * 因此**不会产生第二个任务、也不会重复计费**，创建请求可以安全地有限重发。
 * （文档警告的重复计费针对的是「已经拿到任务 id 之后再发」，与这种失败无关。）
 *
 * 注意：饱和类错误也可能用 fail_to_fetch_task 包装，但那类会被限流识别先捕获；
 * 调用方须排除限流后才打这个标记（见 rate-limit.js 的 tagDispatchFailure）。
 */
export function isUpstreamDispatchFailure(payload) {
  const code = stringField(payload?.code) ?? stringField(payload?.error?.code)
  return code === 'fail_to_fetch_task'
}

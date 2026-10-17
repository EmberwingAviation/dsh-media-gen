/**
 * dsh-media-gen — 限流识别与指数退避重试（上游 limit_requests / 负载饱和场景）。
 *
 * 纪律（2026-09-29 用户指令）：
 *   - 遇 limit_requests / 429 / 饱和类错误，**指数退避、≥60s 起步**，禁止即时重试；
 *   - 退避等待必须响应取消信号；
 *   - 只重试"未产生副作用"的失败（限流响应不会创建任务/扣费）。
 *
 * 2026-10-12 增补（用户选定方案 B）：创建请求另有一类"可安全重发"的失败——
 * 中转明确报告任务**根本没建成**（503 fail_to_fetch_task）。它不走 60s 长退避，
 * 而是 15s → 30s 的**短退避、最多 2 次**（retryOnDispatchFailure），用来消化实测到的
 * 渠道瞬时抖动；永久性配置错误仍会在约 45s 内报出来，不会被伪装成"卡住"。
 */
import { isUpstreamDispatchFailure } from './upstream-error.js'

/**
 * 明确的限流错误码（DashScope 系 / New API 系）。
 *
 * 注意：`fail_to_fetch_task` **刻意不在此列**（2026-10-11 修正）。
 * 它是 New API 视频转发的「取上游任务失败」包装码，内层可能是 model_not_found、
 * 渠道未配、参数非法等**非限流**错误；一旦把它当限流，创建请求会被反复退避重试
 * （60s + 120s + 240s），把一个本该立刻报出的配置问题伪装成「卡住」。
 * 真正的饱和场景仍由状态码 429 与下面的 message 正则（「负载已饱和」等）覆盖。
 */
export const RATE_LIMIT_CODES = Object.freeze([
  'limit_requests',
  'rate_limit_exceeded',
  'too_many_requests',
])

const RATE_LIMIT_MESSAGE_RE = /rate limit|limit_requests|too many requests|负载已饱和|请求过于频繁/i

export function isRateLimitStatus(status) {
  return status === 429
}

export function isRateLimitPayload(payload) {
  const code = String(payload?.error?.code ?? payload?.code ?? '').toLowerCase()
  if (RATE_LIMIT_CODES.includes(code)) return true
  const message = String(payload?.error?.message ?? payload?.message ?? '')
  return RATE_LIMIT_MESSAGE_RE.test(message)
}

/** 给错误打限流标记（retryOnRateLimit 依据它决定退避重试）。 */
export function tagRateLimit(error, { status, payload } = {}) {
  if (isRateLimitStatus(status) || isRateLimitPayload(payload)) {
    error.rateLimited = true
    error.rateLimitStatus = status
  }
  return error
}

/** 第 attempt 次重试前的等待（attempt 从 0 起）：base → 2*base → 4*base … */
export function backoffDelayMs(attempt, baseMs) {
  return Math.round(baseMs * 2 ** attempt)
}

function defaultSleep(ms, signal) {
  return new Promise((resolveSleep, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const timer = setTimeout(resolveSleep, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('aborted'))
    }, { once: true })
  })
}

/**
 * 运行 operation；抛出的错误带 rateLimited 标记时按指数退避重试。
 * @param operation 无副作用可重放的异步操作（一次 HTTP 提交/轮询请求）。
 * @param options baseMs 起步退避（默认 60000）；maxRetries 重试次数上限（默认 3）；signal 取消信号；sleepFn 可注入（测试）。
 */
export async function retryOnRateLimit(operation, { signal, baseMs = 60000, maxRetries = 3, label = 'request', sleepFn } = {}) {
  const sleep = sleepFn ?? defaultSleep
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (error?.rateLimited !== true || attempt >= maxRetries) throw error
      const delayMs = backoffDelayMs(attempt, baseMs)
      console.warn?.(`[dsh-media-gen] ${label} rate limited (status=${error.rateLimitStatus ?? '?'}); backoff ${delayMs}ms, retry ${attempt + 1}/${maxRetries}`)
      await sleep(delayMs, signal)
    }
  }
}

/** 退避预算总时长（用于工具 timeoutMs 预留）：base*(2^maxRetries - 1)。 */
export function backoffBudgetMs(baseMs, maxRetries) {
  return baseMs * (2 ** maxRetries - 1)
}

/**
 * 给错误打「确认没建成任务」标记（可安全有限重发）。两类来源：
 *   - 中转明确报告派发失败：`fail_to_fetch_task`（走 payload 判定）；
 *   - **连接阶段失败**：TCP/TLS 握手没完成（`UND_ERR_CONNECT_TIMEOUT` / `ECONNREFUSED` 等，
 *     见 video-shared.js 的 CONNECT_PHASE_ERROR_CODES）—— HTTP 请求根本没发出去。
 * **已判为限流的错误不打此标记**——真饱和要走 60s 起的长退避，不能被 15s 短退避抢先。
 */
export function tagDispatchFailure(error, { payload, connectPhase } = {}) {
  if (error?.rateLimited === true) return error
  if (connectPhase === true || isUpstreamDispatchFailure(payload)) error.dispatchFailure = true
  return error
}

/**
 * 创建请求的**短退避重试**：只重试带 dispatchFailure 标记的错误（默认 15s → 30s，最多 2 次）。
 *
 * 与 retryOnRateLimit 正交——两边只认各自的标记，所以可以嵌套使用：
 *   retryOnRateLimit(() => retryOnDispatchFailure(submitOnce, …), …)
 * 限流错误会直接穿过这一层，交给外层的长退避；其余错误（配置类）立刻抛出。
 */
export async function retryOnDispatchFailure(operation, { signal, baseMs = 15000, maxRetries = 2, label = 'request', sleepFn } = {}) {
  const sleep = sleepFn ?? defaultSleep
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (error?.dispatchFailure !== true || attempt >= maxRetries) throw error
      const delayMs = backoffDelayMs(attempt, baseMs)
      console.warn?.(`[dsh-media-gen] ${label} no task was created upstream; short backoff ${delayMs}ms, retry ${attempt + 1}/${maxRetries}`)
      await sleep(delayMs, signal)
    }
  }
}

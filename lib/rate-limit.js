/**
 * dsh-media-gen — 限流识别与指数退避重试（上游 limit_requests / 负载饱和场景）。
 *
 * 纪律（2026-09-29 用户指令）：
 *   - 遇 limit_requests / 429 / 饱和类错误，**指数退避、≥60s 起步**，禁止即时重试；
 *   - 退避等待必须响应取消信号；
 *   - 只重试"未产生副作用"的失败（限流响应不会创建任务/扣费）。
 */

/** 明确的限流错误码（DashScope 系 / New API 系）。 */
export const RATE_LIMIT_CODES = Object.freeze([
  'limit_requests',
  'fail_to_fetch_task',
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

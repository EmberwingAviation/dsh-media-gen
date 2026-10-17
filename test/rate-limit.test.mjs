import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRateLimitStatus,
  isRateLimitPayload,
  tagRateLimit,
  backoffDelayMs,
  backoffBudgetMs,
  retryOnRateLimit,
  tagDispatchFailure,
  retryOnDispatchFailure,
} from '../lib/rate-limit.js'

test('限流识别：状态码与错误码/消息', () => {
  assert.equal(isRateLimitStatus(429), true)
  assert.equal(isRateLimitStatus(400), false)
  assert.equal(isRateLimitPayload({ error: { code: 'limit_requests' } }), true)
  // fail_to_fetch_task 是 New API 的「取上游任务失败」包装码，内层可能是 model_not_found
  // 等非限流错误（2026-10-11 修正：曾把它当限流，导致创建请求被无谓退避重试）
  assert.equal(isRateLimitPayload({ code: 'fail_to_fetch_task' }), false)
  // 真正的饱和仍要识别：外层 429 由 isRateLimitStatus 覆盖，报文兜底走 message
  assert.equal(isRateLimitPayload({ code: 'fail_to_fetch_task', message: '当前分组上游负载已饱和，请稍后再试' }), true)
  assert.equal(isRateLimitPayload({ error: { message: 'Requests rate limit exceeded, please try again later.' } }), true)
  assert.equal(isRateLimitPayload({ error: { message: '当前分组上游负载已饱和，请稍后再试' } }), true)
  assert.equal(isRateLimitPayload({ error: { message: 'model not found' } }), false)
  assert.equal(isRateLimitPayload(undefined), false)
})

test('tagRateLimit 打标记', () => {
  assert.equal(tagRateLimit(new Error('x'), { status: 429 }).rateLimited, true)
  assert.equal(tagRateLimit(new Error('x'), { status: 400, payload: { error: { code: 'limit_requests' } } }).rateLimited, true)
  assert.equal(tagRateLimit(new Error('x'), { status: 400, payload: { error: { code: 'bad' } } }).rateLimited, undefined)
})

test('退避序列 ≥60s 起步、指数增长；预算公式', () => {
  assert.equal(backoffDelayMs(0, 60000), 60000)
  assert.equal(backoffDelayMs(1, 60000), 120000)
  assert.equal(backoffDelayMs(2, 60000), 240000)
  assert.equal(backoffBudgetMs(60000, 3), 420000)
})

test('retryOnRateLimit：限流退避后成功，退避序列正确', async () => {
  const sleeps = []
  let calls = 0
  const result = await retryOnRateLimit(async () => {
    calls += 1
    if (calls < 3) throw tagRateLimit(new Error('rl'), { status: 429 })
    return 'ok'
  }, { baseMs: 60000, maxRetries: 3, sleepFn: async (ms) => { sleeps.push(ms) } })
  assert.equal(result, 'ok')
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [60000, 120000])
})

test('retryOnRateLimit：重试耗尽抛原错误', async () => {
  let calls = 0
  await assert.rejects(() => retryOnRateLimit(async () => {
    calls += 1
    throw tagRateLimit(new Error('rl forever'), { status: 429 })
  }, { baseMs: 1, maxRetries: 2, sleepFn: async () => {} }), /rl forever/)
  assert.equal(calls, 3)
})

test('retryOnRateLimit：非限流错误不重试（禁止即时重试纪律的反面约束）', async () => {
  let calls = 0
  await assert.rejects(() => retryOnRateLimit(async () => {
    calls += 1
    throw new Error('bad request')
  }, { baseMs: 1, maxRetries: 3, sleepFn: async () => {} }), /bad request/)
  assert.equal(calls, 1)
})

// --- 方案 B（2026-10-12）：派发失败的短退避重试 ---

test('tagDispatchFailure：只标记"任务没建成"的失败，且不抢限流的标记', () => {
  const dispatch = tagDispatchFailure(new Error('x'), { payload: { code: 'fail_to_fetch_task' } })
  assert.equal(dispatch.dispatchFailure, true)
  assert.equal(tagDispatchFailure(new Error('x'), { payload: { error: { code: 'fail_to_fetch_task' } } }).dispatchFailure, true)
  assert.equal(tagDispatchFailure(new Error('x'), { payload: { error: { code: 'invalid_request' } } }).dispatchFailure, undefined)
  assert.equal(tagDispatchFailure(new Error('x'), { payload: undefined }).dispatchFailure, undefined)

  // 连接阶段失败（TCP 都没建立）同样"确定没建成任务"，可安全重发
  assert.equal(tagDispatchFailure(new Error('x'), { connectPhase: true }).dispatchFailure, true)
  assert.equal(tagDispatchFailure(new Error('x'), { connectPhase: false }).dispatchFailure, undefined)

  // 真饱和（429 + 饱和文案）已被判为限流：必须走 60s 起的长退避，不能被 15s 短退避抢先
  const saturated = tagRateLimit(new Error('x'), { status: 429, payload: { code: 'fail_to_fetch_task', message: '当前分组上游负载已饱和，请稍后再试' } })
  assert.equal(saturated.rateLimited, true)
  assert.equal(tagDispatchFailure(saturated, { payload: { code: 'fail_to_fetch_task' } }).dispatchFailure, undefined)
  assert.equal(tagDispatchFailure(saturated, { connectPhase: true }).dispatchFailure, undefined)
})

test('retryOnDispatchFailure：15s → 30s 短退避后成功', async () => {
  const sleeps = []
  let calls = 0
  const result = await retryOnDispatchFailure(async () => {
    calls += 1
    if (calls < 3) throw tagDispatchFailure(new Error('no channel'), { payload: { code: 'fail_to_fetch_task' } })
    return 'task_1'
  }, { sleepFn: async (ms) => { sleeps.push(ms) } })
  assert.equal(result, 'task_1')
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [15000, 30000], '短退避序列：15s → 30s')
})

test('retryOnDispatchFailure：耗尽抛最后错误；配置类错误立即抛', async () => {
  let dispatchCalls = 0
  await assert.rejects(() => retryOnDispatchFailure(async () => {
    dispatchCalls += 1
    throw tagDispatchFailure(new Error('still no channel'), { payload: { code: 'fail_to_fetch_task' } })
  }, { baseMs: 1, maxRetries: 2, sleepFn: async () => {} }), /still no channel/)
  assert.equal(dispatchCalls, 3, '首次 + 2 次重试')

  let configCalls = 0
  await assert.rejects(() => retryOnDispatchFailure(async () => {
    configCalls += 1
    throw new Error('invalid size')
  }, { baseMs: 1, sleepFn: async () => {} }), /invalid size/)
  assert.equal(configCalls, 1, '配置类错误不得重试')
})

test('两层退避正交：限流错误穿过短退避层，交给长退避层', async () => {
  const sleeps = []
  let calls = 0
  const result = await retryOnRateLimit(
    () => retryOnDispatchFailure(async () => {
      calls += 1
      if (calls < 2) throw tagRateLimit(new Error('rate limited'), { status: 429 })
      return 'ok'
    }, { baseMs: 15000, sleepFn: async (ms) => { sleeps.push(['short', ms]) } }),
    { baseMs: 60000, maxRetries: 3, sleepFn: async (ms) => { sleeps.push(['long', ms]) } },
  )
  assert.equal(result, 'ok')
  assert.deepEqual(sleeps, [['long', 60000]], '短退避层不应消费限流错误')
})

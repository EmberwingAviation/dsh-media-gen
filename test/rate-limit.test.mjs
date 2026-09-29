import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRateLimitStatus,
  isRateLimitPayload,
  tagRateLimit,
  backoffDelayMs,
  backoffBudgetMs,
  retryOnRateLimit,
} from '../lib/rate-limit.js'

test('限流识别：状态码与错误码/消息', () => {
  assert.equal(isRateLimitStatus(429), true)
  assert.equal(isRateLimitStatus(400), false)
  assert.equal(isRateLimitPayload({ error: { code: 'limit_requests' } }), true)
  assert.equal(isRateLimitPayload({ code: 'fail_to_fetch_task' }), true)
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

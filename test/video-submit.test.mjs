/**
 * 创建任务路径的集成测试（2026-10-12，方案 B）。
 *
 * 用一个本地假中转按脚本回放响应，验证：
 *   1. 503 `fail_to_fetch_task`（上游任务根本没建成）→ 短退避 15s → 30s、最多 2 次；
 *   2. 外层本地拒绝的 503（`{error:{code:model_not_found}}`，没有 fail_to_fetch_task 包装）**不重试**；
 *   3. 限流错误**不被短退避层消费**，交给外层的 ≥60s 长退避（两层正交）；
 *   4. 参数类 400 立即抛出。
 *
 * 背景：2026-10-12 17:13 实测到一次瞬时 503（同一分钟内重试即 200）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { submitVideoTask } from '../lib/video-shared.js'

/** 假中转：按 responses 顺序回放（超出则重复最后一条）。 */
async function startStub(responses) {
  const hits = []
  let index = 0
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      hits.push({ url: req.url, auth: req.headers.authorization, body })
      const spec = responses[Math.min(index, responses.length - 1)]
      index += 1
      res.writeHead(spec.status, {
        'content-type': 'application/json',
        ...(spec.rid === undefined ? {} : { 'x-oneapi-request-id': spec.rid }),
      })
      res.end(typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { base: `http://127.0.0.1:${port}`, hits, close: () => new Promise((r) => server.close(r)) }
}

/** 中转派发失败的原样报文（与 2026-10-09 / 10-12 实测同形）。 */
const DISPATCH_503 = JSON.stringify({
  code: 'fail_to_fetch_task',
  message: JSON.stringify({
    error: {
      code: 'model_not_found',
      message: 'No available channel for model wan3.0-video under group default (distributor) (request id: rid-inner)',
    },
  }),
  data: null,
})

const baseArgs = (base, overrides = {}) => ({
  base,
  apiKey: 'sk-test',
  model: 'wan3.0-video',
  prompt: 'a red lantern',
  size: '16:9',
  duration: 2,
  ...overrides,
})

test('派发失败（503 fail_to_fetch_task）→ 短退避 15s → 30s，第三次成功', async () => {
  const stub = await startStub([
    { status: 503, body: DISPATCH_503, rid: 'rid-1' },
    { status: 503, body: DISPATCH_503, rid: 'rid-2' },
    { status: 200, body: { id: 'task_ok', task_id: 'task_ok', status: 'queued' }, rid: 'rid-3' },
  ])
  const sleeps = []
  try {
    const result = await submitVideoTask(baseArgs(stub.base, { sleepFn: async (ms) => { sleeps.push(ms) } }))
    assert.equal(result.id, 'task_ok')
    assert.equal(stub.hits.length, 3, '首次 + 2 次重试')
    assert.deepEqual(sleeps, [15000, 30000], '短退避序列 15s → 30s')
  } finally {
    await stub.close()
  }
})

test('派发失败耗尽重试后抛出，且报错带上内层错误码与 request id', async () => {
  const stub = await startStub([{ status: 503, body: DISPATCH_503, rid: 'rid-header' }])
  try {
    await assert.rejects(
      () => submitVideoTask(baseArgs(stub.base, { sleepFn: async () => {} })),
      (error) => {
        assert.match(error.message, /code=model_not_found/)
        assert.match(error.message, /wrapper=fail_to_fetch_task/)
        assert.match(error.message, /request id=rid-header/, '响应头编号优先')
        return true
      },
    )
    assert.equal(stub.hits.length, 3, '仍应重试 2 次后才放弃')
  } finally {
    await stub.close()
  }
})

test('外层本地拒绝的 503（无 fail_to_fetch_task 包装）不重试', async () => {
  const stub = await startStub([{
    status: 503,
    body: { error: { code: 'model_not_found', message: '分组 生视频 下模型 zzz 无可用渠道（distributor） (request id: rid-local)' } },
    rid: 'rid-local',
  }])
  const sleeps = []
  try {
    await assert.rejects(
      () => submitVideoTask(baseArgs(stub.base, { model: 'zzz', sleepFn: async (ms) => { sleeps.push(ms) } })),
      /code=model_not_found/,
    )
    assert.equal(stub.hits.length, 1, '不是"任务没建成"的派发失败，不得重发')
    assert.deepEqual(sleeps, [], '不应发生任何退避等待')
  } finally {
    await stub.close()
  }
})

test('两层正交：限流走外层长退避，不被短退避层消费', async () => {
  const stub = await startStub([{ status: 429, body: { code: 'limit_requests', message: 'Requests rate limit exceeded' }, rid: 'rid-rl' }])
  const sleeps = []
  try {
    await assert.rejects(
      () => submitVideoTask(baseArgs(stub.base, {
        rateLimit: { baseMs: 60000, maxRetries: 3 },
        sleepFn: async (ms) => { sleeps.push(ms) },
      })),
      /rate limit exceeded/i,
    )
    assert.equal(stub.hits.length, 4, '首次 + 3 次长退避重试')
    assert.deepEqual(sleeps, [60000, 120000, 240000], '只应出现长退避序列')
  } finally {
    await stub.close()
  }
})

test('参数类 400 立即抛出，不重试', async () => {
  const stub = await startStub([{ status: 400, body: { code: 'invalid_request', message: 'duration must be between 2 and 30 seconds' }, rid: 'rid-400' }])
  const sleeps = []
  try {
    await assert.rejects(
      () => submitVideoTask(baseArgs(stub.base, { sleepFn: async (ms) => { sleeps.push(ms) } })),
      /code=invalid_request/,
    )
    assert.equal(stub.hits.length, 1)
    assert.deepEqual(sleeps, [])
  } finally {
    await stub.close()
  }
})

test('请求体形状符合文档：size 原样、seconds 为字符串', async () => {
  const stub = await startStub([{ status: 200, body: { id: 'task_1', task_id: 'task_1' } }])
  try {
    await submitVideoTask(baseArgs(stub.base, { size: '16:9', duration: 5, sleepFn: async () => {} }))
    const sent = JSON.parse(stub.hits[0].body)
    assert.deepEqual(sent, { model: 'wan3.0-video', prompt: 'a red lantern', size: '16:9', seconds: '5' })
    assert.equal(stub.hits[0].url, '/videos')
    assert.equal(stub.hits[0].auth, 'Bearer sk-test')
  } finally {
    await stub.close()
  }
})

// --- 网络层失败（2026-10-12 中转宕机实测：裸 "fetch failed" 完全看不出原因）---

/** 造一个 undici 风格的网络异常：外层 TypeError('fetch failed')，原因码在 cause.code。 */
function networkError(code) {
  const cause = Object.assign(new Error(code), { code })
  return Object.assign(new TypeError('fetch failed'), { cause })
}

test('连接阶段失败 → 报错带原因码/端点，并按"确定没建成任务"短退避重发', async () => {
  let calls = 0
  const sleeps = []
  const fetchImpl = async () => { calls += 1; throw networkError('UND_ERR_CONNECT_TIMEOUT') }
  await assert.rejects(
    () => submitVideoTask(baseArgs('https://relay.test/v1', { fetchImpl, sleepFn: async (ms) => { sleeps.push(ms) } })),
    (error) => {
      assert.match(error.message, /网络层失败/)
      assert.match(error.message, /https:\/\/relay\.test\/v1\/videos/)
      assert.match(error.message, /UND_ERR_CONNECT_TIMEOUT/, '真正的原因码必须出现在报错里')
      assert.match(error.message, /没有到达中转/)
      assert.equal(error.connectPhaseFailure, true)
      return true
    },
  )
  assert.equal(calls, 3, 'TCP 都没建立 → 确定没建成任务 → 首次 + 2 次短退避重试')
  assert.deepEqual(sleeps, [15000, 30000])
})

test('发出去之后才断（ECONNRESET）→ 明确告警"可能已送达"，且不重发', async () => {
  let calls = 0
  const sleeps = []
  const fetchImpl = async () => { calls += 1; throw networkError('ECONNRESET') }
  await assert.rejects(
    () => submitVideoTask(baseArgs('https://relay.test/v1', { fetchImpl, sleepFn: async (ms) => { sleeps.push(ms) } })),
    (error) => {
      assert.match(error.message, /ECONNRESET/)
      assert.match(error.message, /可能已送达/)
      assert.equal(error.connectPhaseFailure, undefined)
      return true
    },
  )
  assert.equal(calls, 1, '模糊失败不得重发（可能重复建任务/计费）')
  assert.deepEqual(sleeps, [])
})

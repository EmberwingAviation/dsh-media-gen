import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tryParseJson,
  matchRequestId,
  unwrapUpstreamError,
  describeUpstreamError,
  requestIdFromHeaders,
  isUpstreamDispatchFailure,
} from '../lib/upstream-error.js'

/** 2026-10-09 实测报文：wan 渠道缺失时 yotopivot 的原样返回（内层 JSON 被塞进 message 字符串）。 */
const WAN_REQUEST_ID = '202610090420567252242388268d9d61yRWEgMd'
const WAN_INNER = {
  error: {
    code: 'model_not_found',
    message: `No available channel for model wan3.0-video under group default (distributor) (request id: ${WAN_REQUEST_ID})`,
    type: 'new_api_error',
  },
}
const WAN_503 = JSON.stringify({ code: 'fail_to_fetch_task', message: JSON.stringify(WAN_INNER), data: null })

test('tryParseJson：不抛异常', () => {
  assert.deepEqual(tryParseJson('{"a":1}'), { a: 1 })
  assert.equal(tryParseJson('not json'), undefined)
  assert.equal(tryParseJson(''), undefined)
  assert.equal(tryParseJson(undefined), undefined)
})

test('matchRequestId：从 message 尾部摘编号', () => {
  assert.equal(matchRequestId(`boom (request id: ${WAN_REQUEST_ID})`), WAN_REQUEST_ID)
  assert.equal(matchRequestId('no id here'), undefined)
  assert.equal(matchRequestId(undefined), undefined)
})

test('unwrapUpstreamError：钻取到最内层，并摘出 request id', () => {
  const info = unwrapUpstreamError(WAN_503)
  assert.equal(info.code, 'model_not_found', '取最具体一层的错误码')
  assert.equal(info.wrapperCode, 'fail_to_fetch_task', '保留最外层包装码')
  assert.equal(info.requestId, WAN_REQUEST_ID, 'request id 从内层文案里摘出')
  assert.equal(
    info.message,
    'No available channel for model wan3.0-video under group default (distributor)',
    '文案取最内层，且去掉尾部 (request id: …)',
  )
})

test('unwrapUpstreamError：响应头的编号优先于报文里的', () => {
  const info = unwrapUpstreamError(WAN_503, 'header-id-123')
  assert.equal(info.requestId, 'header-id-123')
  assert.equal(info.code, 'model_not_found')
})

test('unwrapUpstreamError：单层 OpenAI 风格错误', () => {
  const info = unwrapUpstreamError(JSON.stringify({ error: { code: 'invalid_request', message: 'bad size' } }))
  assert.equal(info.code, 'invalid_request')
  assert.equal(info.wrapperCode, 'invalid_request')
  assert.equal(info.message, 'bad size')
  assert.equal(info.requestId, undefined)
})

test('unwrapUpstreamError：三层嵌套也能钻到底', () => {
  const innermost = JSON.stringify({ error: { code: 'model_not_found', message: 'no channel (request id: abc123)' } })
  const middle = JSON.stringify({ code: 'fail_to_fetch_task', message: innermost })
  const outer = JSON.stringify({ code: 'upstream_error', message: middle })
  const info = unwrapUpstreamError(outer)
  assert.equal(info.code, 'model_not_found')
  assert.equal(info.wrapperCode, 'upstream_error')
  assert.equal(info.requestId, 'abc123')
  assert.equal(info.message, 'no channel')
})

test('unwrapUpstreamError：非 JSON 原文不丢信息', () => {
  const info = unwrapUpstreamError('<html>502 Bad Gateway</html>')
  assert.equal(info.message, '<html>502 Bad Gateway</html>')
  assert.equal(info.code, undefined)
  assert.equal(info.wrapperCode, undefined)
})

test('describeUpstreamError：单行可读 + 取证标签', () => {
  const line = describeUpstreamError('OpenAI video task creation failed', 503, WAN_503)
  assert.match(line, /^OpenAI video task creation failed \(503\): No available channel for model wan3\.0-video/)
  assert.match(line, /code=model_not_found/)
  assert.match(line, /wrapper=fail_to_fetch_task/)
  assert.match(line, new RegExp(`request id=${WAN_REQUEST_ID}`))
  assert.doesNotMatch(line, /fail_to_fetch_task","message/, '不应把整段嵌套 JSON 原样吐出')
})

test('describeUpstreamError：无错误码时只给文案', () => {
  const line = describeUpstreamError('OpenAI video task poll failed', 500, 'boom')
  assert.equal(line, 'OpenAI video task poll failed (500): boom')
})

test('requestIdFromHeaders：安全取头', () => {
  assert.equal(requestIdFromHeaders({ get: (name) => (name === 'x-oneapi-request-id' ? 'rid-9' : null) }), 'rid-9')
  assert.equal(requestIdFromHeaders({ get: () => null }), undefined)
  assert.equal(requestIdFromHeaders(undefined), undefined)
})

test('isUpstreamDispatchFailure：识别"上游任务根本没建成"（可安全重发）', () => {
  // 本次事故的真实报文（外层包装码就是它）
  assert.equal(isUpstreamDispatchFailure(JSON.parse(WAN_503)), true)
  assert.equal(isUpstreamDispatchFailure({ code: 'fail_to_fetch_task', message: '{"error":{}}' }), true)
  assert.equal(isUpstreamDispatchFailure({ error: { code: 'fail_to_fetch_task' } }), true)
  // 其余错误一律不算——创建请求不该因为它们被重发
  assert.equal(isUpstreamDispatchFailure({ error: { code: 'model_not_found' } }), false)
  assert.equal(isUpstreamDispatchFailure({ code: 'invalid_request' }), false)
  assert.equal(isUpstreamDispatchFailure(undefined), false)
})

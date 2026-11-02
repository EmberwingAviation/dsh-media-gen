import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeVideoProvider, normalizeVideoCatalog, resolveModelParameters } from '../lib/video-model-config.js'
import { Config, unwrapVolatile, resolveVideoEntry, pickVideoSettings } from '../lib/media-config.js'

const provider = extra => ({ id: 'p', model: 'm', models: [{ id: 'm' }], ...extra })
test('legacy model-only and schema-inserted [] migrate; v2 deletion stays deleted', () => {
  for (const raw of [{ id: 'p', model: 'm' }, { id: 'p', model: 'm', models: [] }]) {
    assert.equal(normalizeVideoProvider(raw).models[0].id, 'm')
  }
  assert.throws(() => normalizeVideoProvider(provider({ models: [] }), { version: 2 }), /请清空默认模型/)
  const raw = provider({ model: '', models: [] })
  assert.deepEqual(normalizeVideoProvider(raw, { version: 2 }).models, [])
  assert.throws(() => resolveVideoEntry({ videoConfigVersion: 2, videoProviders: [raw] }), /目录为空/)
  assert.equal(unwrapVolatile(Config({}).videoConfigVersion), 1)
  assert.equal(pickVideoSettings({ videoConfigVersion: 2 }).videoConfigVersion, 2)
})
test('string model migration is deterministic, immutable and idempotent', () => {
  const raw = provider({ models: ['m', 'n'] })
  const before = structuredClone(raw)
  const normalized = normalizeVideoProvider(raw)
  assert.deepEqual(raw, before)
  assert.deepEqual(normalizeVideoProvider(normalized, { version: 2 }), normalized)
  assert.equal(normalized.models[1].name, 'n')
})
test('schema round-trip preserves model overrides custom mapping and false/zero', () => {
  const raw = provider({
    protocolDefaults: { protocol: 'custom-json', parameterFormat: 'seedance', custom: { fields: { seed: { path: 'options.seed', type: 'integer' } }, enabled: false } },
    generationDefaults: { seed: 0, audio: false }, capabilityDefaults: { i2v: false },
    models: [{ id: 'm', name: 'Model', protocol: 'google', parameterFormat: 'wan', overrides: { seed: { mode: 'override', value: 0 }, audio: { mode: 'override', value: false } }, capabilities: { i2v: true } }],
  })
  const parsed = Config({ videoConfigVersion: 2, videoProviders: [raw] })
  const rows = unwrapVolatile(parsed.videoProviders)
  const again = unwrapVolatile(Config({ videoConfigVersion: 2, videoProviders: JSON.parse(JSON.stringify(rows)) }).videoProviders)
  assert.deepEqual(again, rows)
  assert.deepEqual(again[0].protocolDefaults.custom, raw.protocolDefaults.custom)
  const active = resolveVideoEntry({ videoConfigVersion: 2, videoProviders: again })
  assert.equal(active.protocol, 'google')
  assert.equal(active.kind, 'google')
  assert.equal(active.parameterFormat, 'wan')
  assert.equal(active.i2v, true)
  assert.deepEqual(active.parameters, { seed: 0, audio: false })
})
test('inherit/override/omit and call priority preserve false 0 null and omission', () => {
  const p = { generationDefaults: { duration: 5, seed: 42, audio: true, size: 'large' } }
  const m = { overrides: { duration: { mode: 'inherit' }, seed: { mode: 'override', value: 0 }, audio: { mode: 'override', value: false }, size: { mode: 'omit' }, extra: { mode: 'override', value: null } } }
  const result = resolveModelParameters(p, m)
  assert.deepEqual(result.parameters, { duration: 5, seed: 0, audio: false, extra: null })
  assert.deepEqual(result.omitted, ['size'])
  assert.deepEqual(result.sources, { duration: 'provider', seed: 'model', audio: 'model', size: 'omit', extra: 'model' })
  for (const value of ['small', false, 0, null]) assert.throws(() => resolveModelParameters(p, m, { size: value }), /omit/)
  const called = resolveModelParameters(p, m, { size: undefined, duration: undefined, seed: 1 })
  assert.equal(called.parameters.duration, 5)
  assert.equal(called.parameters.size, undefined)
  assert.equal(called.parameters.seed, 1)
  assert.equal(called.sources.seed, 'call')
  assert.deepEqual(called.omitted, ['size'])
  assert.equal(p.generationDefaults.audio, true)
})
test('catalog validates IDs default references and selections', () => {
  assert.throws(() => normalizeVideoCatalog([provider(), provider()]), /重复视频供应商/)
  assert.throws(() => normalizeVideoProvider(provider({ models: ['m', ' m '] })), /重复模型/)
  assert.throws(() => normalizeVideoProvider(provider({ id: '' })), /不能为空/)
  assert.throws(() => normalizeVideoProvider(provider({ models: ['n'] })), /默认模型/)
  const snapshot = { videoConfigVersion: 2, videoProviders: [provider({ models: ['m', 'n'] })] }
  assert.equal(resolveVideoEntry(snapshot, 'p', 'n').model, 'n')
  assert.throws(() => resolveVideoEntry(snapshot, 'p', 'unknown'), /未知视频模型/)
  assert.throws(() => resolveVideoEntry({ videoProviders: [provider({ model: '', models: ['m', 'n'] })] }), /未选择默认模型/)
})
test('protocol and capabilities inherit independently and never guess from model ID', () => {
  const p = provider({ kind: 'openai-compatible', model: 'wan-m', models: [{ id: 'wan-m', capabilities: { i2v: false } }], capabilityDefaults: { i2v: true }, protocolDefaults: { protocol: 'dashscope', parameterFormat: 'standard' } })
  const active = resolveVideoEntry({ videoProviders: [p] })
  assert.equal(active.protocol, 'dashscope')
  assert.equal(active.parameterFormat, 'standard')
  assert.equal(active.i2v, false)
  assert.equal(active.capabilities.t2v, true)
})
test('reject malformed overrides unsafe JSON and unsupported formats', () => {
  assert.throws(() => normalizeVideoProvider(provider({ kind: 'future' }), { version: 2 }), /unsupported/)
  assert.equal(normalizeVideoProvider(provider({ kind: '' }), { version: 2 }).protocolDefaults.protocol, 'openai-compatible')
  for (const value of [NaN, Infinity, () => 1, new Date()]) assert.throws(() => normalizeVideoProvider(provider({ generationDefaults: { x: value } })), /JSON/)
  const circular = {}; circular.self = circular
  assert.throws(() => normalizeVideoProvider(provider({ protocolDefaults: { custom: circular } })), /JSON/)
  assert.throws(() => normalizeVideoProvider(provider({ generationDefaults: JSON.parse('{"__proto__":{}}') })), /unsafe key/)
  assert.throws(() => normalizeVideoProvider(provider({ models: [{ id: 'm', overrides: { seed: { mode: 'override' } } }] })), /requires value/)
  assert.throws(() => normalizeVideoProvider(provider({ protocolDefaults: { protocol: 'invalid' } })), /unsupported/)
  assert.throws(() => normalizeVideoProvider(provider({ models: [{ id: 'm', capabilities: { i2v: 'yes' } }] })), /boolean/)
})

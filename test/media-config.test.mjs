import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Config,
  resolveVideoEntry,
  videoEntrySupportsI2v,
  pickVideoSettings,
  unwrapVolatile,
  readConfigField,
  DEFAULT_VIDEO_FOLDER,
  DEFAULT_VIDEO_BASE_URLS,
  DEFAULT_VIDEO_KEY_ENVS,
} from '../lib/media-config.js'

test('Config：空输入解析出全部默认值', () => {
  const parsed = Config({})
  const read = (key) => unwrapVolatile(parsed[key])
  assert.deepEqual(read('providers'), [])
  assert.equal(read('enabled'), true)
  assert.equal(read('providerId'), '')
  assert.equal(read('modelId'), '')
  assert.equal(read('defaultSize'), '1024x1024')
  assert.equal(read('defaultQuality'), 'auto')
  assert.equal(read('videoEnabled'), true)
  assert.deepEqual(read('videoProviders'), [])
  assert.equal(read('videoProviderId'), '')
  assert.equal(read('pollIntervalMs'), 5000)
  assert.equal(read('waitTimeoutMs'), 600000)
  assert.equal(read('saveToWorkspace'), true)
  assert.equal(read('videoFolder'), DEFAULT_VIDEO_FOLDER)
})

test('Config：视频目录条目缺省字段被补全', () => {
  const parsed = Config({ videoProviders: [{ id: 'a', model: 'm' }] })
  const list = unwrapVolatile(parsed.videoProviders)
  const entry = list[0]
  assert.equal(entry.kind, 'openai-compatible')
  assert.equal(entry.baseUrl, '')
  assert.equal(entry.apiKeyEnv, '')
  assert.equal(entry.name, '')
  assert.equal(entry.i2v, undefined, 'i2v 保持缺省，由 kind 推断')
})

test('Config：生图供应商条目保持上游形状', () => {
  const parsed = Config({
    providers: [{ id: 'p', name: 'P', baseUrl: 'https://x/v1', apiKeyEnv: 'X_KEY', models: [{ id: 'm', name: 'M' }] }],
    providerId: 'p',
    modelId: 'm',
  })
  const providers = unwrapVolatile(parsed.providers)
  assert.equal(providers[0].apiFormat, 'openai-images')
  assert.equal(unwrapVolatile(parsed.providerId), 'p')
})

test('resolveVideoEntry：空目录报友好错误', () => {
  assert.throws(() => resolveVideoEntry({ videoProviders: [] }, undefined), /尚未配置视频供应商/)
  assert.throws(() => resolveVideoEntry({}, undefined), /尚未配置视频供应商/)
})

test('resolveVideoEntry：唯一条目自动选中并规范化', () => {
  const entry = resolveVideoEntry({
    videoProviders: [{ id: 'relay', model: 'wan3.0-video', kind: 'openai-compatible', baseUrl: '', apiKeyEnv: '' }],
  }, undefined)
  assert.equal(entry.id, 'relay')
  assert.equal(entry.kind, 'openai-compatible')
  assert.equal(entry.baseUrl, DEFAULT_VIDEO_BASE_URLS['openai-compatible'])
  assert.equal(entry.apiKeyEnv, DEFAULT_VIDEO_KEY_ENVS['openai-compatible'])
  assert.equal(entry.i2v, false)
  assert.equal(entry.name, 'relay')
})

test('resolveVideoEntry：per-call provider 覆盖默认选择', () => {
  const snapshot = {
    videoProviderId: 'a',
    videoProviders: [
      { id: 'a', model: 'ma', kind: 'dashscope' },
      { id: 'b', model: 'mb', kind: 'volcengine', baseUrl: 'https://ark.example/api/v3' },
    ],
  }
  assert.equal(resolveVideoEntry(snapshot, undefined).id, 'a')
  const b = resolveVideoEntry(snapshot, 'b')
  assert.equal(b.id, 'b')
  assert.equal(b.kind, 'volcengine')
  assert.equal(b.baseUrl, 'https://ark.example/api/v3')
  assert.equal(b.apiKeyEnv, 'ARK_API_KEY')
  assert.equal(b.i2v, true)
})

test('resolveVideoEntry：未知 id 报错并列出目录', () => {
  assert.throws(
    () => resolveVideoEntry({ videoProviders: [{ id: 'a', model: 'ma' }] }, 'zzz'),
    /未知视频供应商 "zzz"；已配置：a/,
  )
})

test('resolveVideoEntry：多条目且无默认选择时报错', () => {
  assert.throws(
    () => resolveVideoEntry({ videoProviderId: '', videoProviders: [{ id: 'a', model: 'ma' }, { id: 'b', model: 'mb' }] }, ''),
    /未选择默认/,
  )
})

test('resolveVideoEntry：缺 model 报错；dashscope 默认 i2v 且补全端点', () => {
  assert.throws(() => resolveVideoEntry({ videoProviders: [{ id: 'a', model: ' ' }] }, undefined), /未配置 model/)
  const entry = resolveVideoEntry({ videoProviders: [{ id: 'ds', model: 'wanx2.1-t2v-turbo', kind: 'dashscope' }] }, undefined)
  assert.equal(entry.baseUrl, DEFAULT_VIDEO_BASE_URLS.dashscope)
  assert.equal(entry.apiKeyEnv, 'DASHSCOPE_API_KEY')
  assert.equal(entry.i2v, true)
})

test('resolveVideoEntry：显式 i2v 覆盖 kind 默认', () => {
  const on = resolveVideoEntry({ videoProviders: [{ id: 'x', model: 'm', kind: 'openai-compatible', i2v: true }] }, undefined)
  assert.equal(on.i2v, true)
  const off = resolveVideoEntry({ videoProviders: [{ id: 'y', model: 'm', kind: 'dashscope', i2v: false }] }, undefined)
  assert.equal(off.i2v, false)
})

test('resolveVideoEntry：未知 kind 归一为 openai-compatible', () => {
  const entry = resolveVideoEntry({ videoProviders: [{ id: 'q', model: 'm', kind: 'whatever' }] }, undefined)
  assert.equal(entry.kind, 'openai-compatible')
})

test('videoEntrySupportsI2v：kind 默认与显式值', () => {
  assert.equal(videoEntrySupportsI2v({ kind: 'dashscope' }), true)
  assert.equal(videoEntrySupportsI2v({ kind: 'volcengine' }), true)
  assert.equal(videoEntrySupportsI2v({ kind: 'google' }), true)
  assert.equal(videoEntrySupportsI2v({ kind: 'openai-compatible' }), false)
  assert.equal(videoEntrySupportsI2v({ kind: 'openai-compatible', i2v: true }), true)
  assert.equal(videoEntrySupportsI2v({ kind: 'dashscope', i2v: false }), false)
})

test('pickVideoSettings：投影与默认值', () => {
  const projection = pickVideoSettings(undefined)
  assert.equal(projection.videoEnabled, true)
  assert.deepEqual(projection.videoProviders, [])
  assert.equal(projection.videoProviderId, '')
  assert.equal(projection.pollIntervalMs, 5000)
  assert.equal(projection.waitTimeoutMs, 600000)
  assert.equal(projection.saveToWorkspace, true)
  assert.equal(projection.videoFolder, DEFAULT_VIDEO_FOLDER)
  const custom = pickVideoSettings({ videoEnabled: false, videoProviders: null, videoFolder: 'v' })
  assert.equal(custom.videoEnabled, false)
  assert.deepEqual(custom.videoProviders, [])
  assert.equal(custom.videoFolder, 'v')
})

test('unwrapVolatile / readConfigField：盒子展开与回退', () => {
  assert.equal(unwrapVolatile({ get: () => 42 }), 42)
  assert.equal(unwrapVolatile(7), 7)
  assert.equal(unwrapVolatile(undefined), undefined)
  assert.equal(unwrapVolatile({ get: () => { throw new Error('boom') } }), undefined)
  assert.equal(readConfigField({ a: { get: () => 'x' } }, 'a', 'd'), 'x')
  assert.equal(readConfigField({ a: undefined }, 'a', 'd'), 'd')
  assert.equal(readConfigField(undefined, 'a', 'd'), 'd')
})

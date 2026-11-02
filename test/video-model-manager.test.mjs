import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoModelManager, videoCatalogRevision } from '../lib/video-model-manager.js'
import { resolveModelParameters, resolveVideoEntry } from '../lib/video-model-config.js'
import { previewVideoRequest } from '../lib/video-protocol.js'
import { Config, unwrapVolatile } from '../lib/media-config.js'
const copy = value => structuredClone(value)
const provider = () => ({ id: 'relay', name: 'Relay', kind: 'openai-compatible', baseUrl: 'https://example.test/v1', apiKeyEnv: 'VIDEO_KEY', model: 'a', models: [{ id: 'a', name: 'Alpha', overrides: {} }, { id: 'b', name: 'Beta', overrides: {} }], protocolDefaults: { protocol: 'openai-compatible' }, generationDefaults: { duration: 5, seed: 42 } })
const custom = () => ({ createPath: '/jobs', queryPath: '/jobs/{taskId}', auth: { type: 'bearer' }, fields: { model: { path: 'model' }, prompt: { path: 'prompt' } }, response: { taskId: 'id', status: 'status', url: 'url' }, states: { completed: ['done'], failed: ['failed'] } })
function fixture(initial = { videoConfigVersion: 2, videoProviderId: 'relay', videoProviders: [provider()] }, options = {}) {
  let config = copy(initial)
  const commits = []
  const commit = async (patch, revision) => {
    assert.equal(revision, videoCatalogRevision(config), 'commit receives current catalog revision')
    if (options.reject) throw new Error('disk write failed')
    commits.push({ patch: copy(patch), revision })
    config = { ...config, ...copy(patch) }
  }
  const manage = createVideoModelManager({ getConfig: () => config, ...(options.readonly ? {} : { commit }) })
  return { manage, commits, get config() { return config }, mutate(patch) { config = { ...config, ...patch } }, write: async request => manage({ ...request, expectedRevision: videoCatalogRevision(config) }) }
}
test('revision matches schema-injected defaults and stable nested key ordering', () => {
  for (const raw of [{}, { videoProviders: [{ id: 'legacy', model: 'a' }] }, { videoConfigVersion: 2, videoProviders: [{ id: 'empty', model: '', models: [] }] }, { videoConfigVersion: 2, videoProviders: [provider()] }]) {
    const parsed = Config(copy(raw))
    const snapshot = Object.fromEntries(['videoConfigVersion', 'videoProviders', 'videoProviderId'].map(key => [key, unwrapVolatile(parsed[key])]))
    assert.equal(videoCatalogRevision(raw), videoCatalogRevision(snapshot))
  }
  const raw = { videoConfigVersion: 2, videoProviders: [provider()] }
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value
  assert.equal(videoCatalogRevision(raw), videoCatalogRevision(reorder(raw)))
  const changed = copy(raw); changed.videoProviders[0].generationDefaults.duration = 8
  assert.notEqual(videoCatalogRevision(raw), videoCatalogRevision(changed))
  const ordered = copy(raw); ordered.videoProviders[0].models.reverse()
  assert.notEqual(videoCatalogRevision(raw), videoCatalogRevision(ordered), 'model order changes default deletion semantics')
})
test('list migrates legacy models without writes and revision covers catalog only', async () => {
  const f = fixture({ videoProviders: [{ ...provider(), models: ['a', 'b'] }], videoProviderId: 'relay' })
  const result = await f.manage({ action: 'list' })
  assert.deepEqual(result.providers[0].models.map(row => row.id), ['a', 'b'])
  assert.equal(result.revision, videoCatalogRevision(f.config)); assert.equal(f.commits.length, 0)
  const revision = result.revision
  f.mutate({ unrelated: true }); assert.equal(videoCatalogRevision(f.config), revision)
  f.mutate({ videoProviderId: '' }); assert.notEqual(videoCatalogRevision(f.config), revision)
  result.providers[0].models[0].name = 'changed'; assert.equal(f.config.videoProviders[0].models[0], 'a')
})
test('validate normalizes independently without persisting or mutating input', async () => {
  const f = fixture(); const raw = provider(); const before = copy(raw)
  const result = await f.manage({ action: 'validate', provider: raw })
  assert.equal(result.protocolDefaults.parameterFormat, 'standard'); assert.deepEqual(raw, before)
  assert.equal(f.commits.length, 0)
  await assert.rejects(f.manage({ action: 'validate', provider: { ...raw, models: [{ id: 'a' }, { id: 'a' }] } }), /重复/)
})
test('preview uses shared provider/model/call resolution, omit conflicts and credentials references', async () => {
  const raw = provider(); raw.models[0].overrides = { duration: { mode: 'override', value: 8 }, seed: { mode: 'omit' } }
  const f = fixture({ videoConfigVersion: 2, videoProviderId: 'relay', videoProviders: [raw] })
  const request = { action: 'preview', provider: 'relay', model: 'a', prompt: 'Sunset', parameters: { duration: 10 } }
  const actual = await f.manage(request)
  const active = resolveVideoEntry(f.config, 'relay', 'a')
  const resolved = resolveModelParameters(active.providerConfig, active.modelConfig, request.parameters)
  assert.deepEqual(actual, previewVideoRequest({ ...active, parameters: resolved.parameters }, { prompt: 'Sunset', operation: 't2v' }))
  assert.equal(actual.body.seconds, '10'); assert.equal(actual.body.seed, undefined)
  assert.deepEqual(actual.auth, { type: 'bearer', credentialRef: 'VIDEO_KEY' })
  assert.equal(f.commits.length, 0)
  await assert.rejects(f.manage({ ...request, parameters: { seed: 0 } }), /omit/)
  const draft = await f.manage({ ...request, provider: raw }); assert.deepEqual(draft, actual)
  await assert.rejects(f.manage({ ...request, provider: 'missing' }), /Unknown/)
})
test('strict custom validation rejects unsafe schemas through validate, preview and save_catalog', async () => {
  const f = fixture()
  for (const mutate of [c => { c.createPath = 'https://evil.test/jobs' }, c => { c.auth.value = 'plaintext' }, c => { c.headers = { Authorization: 'secret' } }, c => { c.fields.prompt.path = '__proto__.x' }, c => { delete c.response.taskId }, c => { c.states.failed = ['done'] }]) {
    const c = custom(); mutate(c)
    const raw = { ...provider(), protocolDefaults: { protocol: 'custom-json', custom: c }, generationDefaults: {} }
    for (const request of [{ action: 'validate', provider: raw }, { action: 'preview', provider: raw }, { action: 'save_catalog', providers: [raw], videoProviderId: 'relay' }]) await assert.rejects(f.write(request))
  }
  assert.equal(f.commits.length, 0)
  const raw = { ...provider(), protocolDefaults: { protocol: 'custom-json', custom: custom() }, generationDefaults: {} }
  const preview = await f.manage({ action: 'preview', provider: raw, model: 'a' })
  assert.equal(preview.url, 'https://example.test/v1/jobs'); assert.equal(preview.body.prompt, 'A calm seaside sunset')
})
test('custom protocol requires configuration even when only selected on a model', async () => {
  const f = fixture()
  const providerCustom = { ...provider(), protocolDefaults: { protocol: 'custom-json' } }
  const modelCustom = provider(); modelCustom.models[0].protocol = 'custom-json'
  for (const raw of [providerCustom, modelCustom]) {
    await assert.rejects(f.manage({ action: 'validate', provider: raw }), /Video protocol/)
    await assert.rejects(f.write({ action: 'save_catalog', providers: [raw], videoProviderId: 'relay' }), /Video protocol/)
  }
  await assert.rejects(f.write({ action: 'upsert', provider: 'relay', model: { id: 'custom', protocol: 'custom-json' } }), /Video protocol/)
  assert.equal(f.commits.length, 0)
})
test('upsert adds and replaces a model, preserves other settings and defaults', async () => {
  const f = fixture(); const model = { id: 'c', name: 'New', protocol: 'volcengine', overrides: { seed: { mode: 'omit' } }, capabilities: { i2v: true } }
  let result = await f.write({ action: 'upsert', provider: 'relay', model })
  assert.deepEqual(result.providers[0].models.map(row => row.id), ['a', 'b', 'c']); assert.equal(result.providers[0].model, 'a')
  result = await f.write({ action: 'upsert', provider: 'relay', model: { ...model, name: 'Renamed' } })
  assert.equal(result.providers[0].models.length, 3); assert.equal(result.providers[0].models[2].name, 'Renamed')
  assert.deepEqual(result.providers[0].generationDefaults, { duration: 5, seed: 42 })
  assert.equal(f.config.videoConfigVersion, 2)
})
test('set_default selects model and optionally provider; remove switches default and clears last', async () => {
  const f = fixture({ videoConfigVersion: 2, videoProviderId: '', videoProviders: [provider()] })
  let result = await f.write({ action: 'set_default', provider: 'relay', modelId: 'b', makeProviderDefault: true })
  assert.equal(result.videoProviderId, 'relay'); assert.equal(result.providers[0].model, 'b')
  result = await f.write({ action: 'remove', provider: 'relay', modelId: 'b' }); assert.equal(result.providers[0].model, 'a')
  result = await f.write({ action: 'remove', provider: 'relay', modelId: 'a' }); assert.deepEqual(result.providers[0].models, []); assert.equal(result.providers[0].model, '')
  assert.deepEqual((await f.manage({ action: 'list' })).providers[0].models, [])
  result = await f.write({ action: 'upsert', provider: 'relay', model: { id: 'new' } }); assert.equal(result.providers[0].model, 'new')
})
test('all writes require matching revision and reject stale/missing revisions without commit', async () => {
  const f = fixture(); const revision = videoCatalogRevision(f.config)
  await f.write({ action: 'set_default', provider: 'relay', modelId: 'b' })
  for (const action of ['upsert', 'remove', 'set_default', 'save_catalog']) for (const expectedRevision of [undefined, revision]) {
    await assert.rejects(f.manage({ action, provider: 'relay', model: { id: 'c' }, modelId: 'a', providers: [], expectedRevision }), /revision/)
  }
  assert.equal(f.commits.length, 1)
})
test('save_catalog atomically replaces catalog and validates default provider', async () => {
  const f = fixture(); const next = { ...provider(), id: 'second' }
  await assert.rejects(f.write({ action: 'save_catalog', providers: [next], videoProviderId: 'missing' }), /Default/)
  await assert.rejects(f.write({ action: 'save_catalog', providers: [next, next], videoProviderId: 'second' }), /重复/)
  assert.equal(f.commits.length, 0)
  const result = await f.write({ action: 'save_catalog', providers: [next], videoProviderId: 'second' })
  assert.equal(result.providers[0].id, 'second'); assert.equal(result.videoProviderId, 'second')
  await f.write({ action: 'save_catalog', providers: [], videoProviderId: '' }); assert.deepEqual(f.config.videoProviders, [])
})
test('invalid operations, missing models and unavailable/failing persistence never report success', async () => {
  const f = fixture()
  for (const request of [{ action: 'unknown' }, { action: 'upsert', provider: 'relay', model: 'x' }, { action: 'remove', provider: 'relay', modelId: 'missing' }, { action: 'set_default', provider: 'relay', modelId: 'missing' }, { action: 'upsert', provider: 'missing', model: { id: 'a' } }]) await assert.rejects(f.write(request))
  assert.equal(f.commits.length, 0)
  const readonly = fixture(undefined, { readonly: true }); await assert.rejects(readonly.write({ action: 'remove', provider: 'relay', modelId: 'b' }), /unavailable/)
  const failed = fixture(undefined, { reject: true }); const before = copy(failed.config)
  await assert.rejects(failed.write({ action: 'remove', provider: 'relay', modelId: 'b' }), /disk write failed/); assert.deepEqual(failed.config, before)
})

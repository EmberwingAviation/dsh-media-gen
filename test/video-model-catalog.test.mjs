import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Config, unwrapVolatile, resolveVideoEntry } from '../lib/media-config.js'

// Load the actual plain-JS client factory. Expose its pure helper only inside
// this test realm, without adding a production export or browser global.
const source = readFileSync(new URL('../lib/client-video.js', import.meta.url), 'utf8')
let helpers
vm.runInNewContext(source.replace('return module.exports;', 'return { normalizeVideoModels };'), {
  window: { __ModuleLoader__: { load(definition) { helpers = definition.factory(() => ({})) } } },
})
const normalize = (...args) => Array.from(helpers.normalizeVideoModels(...args))

test('video catalog migrates legacy selection and deduplicates model IDs', () => {
  assert.deepEqual(normalize(undefined, 'wan'), ['wan'])
  assert.deepEqual(normalize([' wan ', '', 'wan', 'prime', '  '], 'wan'), ['wan', 'prime'])
  assert.deepEqual(normalize([], ''), [])
})

test('video catalog merges additions without discarding active or stored models', () => {
  const existing = normalize(['wan'], 'prime')
  const merged = normalize([...existing, 'seedance', 'wan', 'seedance'], 'prime')
  assert.deepEqual(new Set(merged), new Set(['wan', 'prime', 'seedance']))
  assert.deepEqual(normalize(merged, 'prime'), merged)
})

test('video catalog survives save/reopen schema and keeps default generation model', () => {
  const selected = normalize(['wan', 'prime', 'seedance'], 'prime')
  const saved = JSON.parse(JSON.stringify({ videoProviders: [{ id: 'relay', model: 'prime', models: selected, apiKeyEnv: 'SHARED_REF' }] }))
  const reopened = unwrapVolatile(Config(saved).videoProviders)
  assert.deepEqual(normalize(reopened[0].models, reopened[0].model), selected)
  assert.equal(resolveVideoEntry({ videoProviders: reopened }).model, 'prime')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../lib/client-video.js', import.meta.url), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
function load(react = {}) {
  let exported
  vm.runInNewContext(source.replace('return module.exports;', 'return { modelCatalog, mergeModelCatalog, removeModelFromDraft, providerDraft, normalizeVideoModels, videoMeta, videoStatusText, VideoGenerationSettingsCard };'), { window: { confirm: () => true, alert() {}, __ModuleLoader__: { load(def) { exported = def.factory(() => react) } } } })
  return exported
}
const helpers = load()
test('v1 strings/model-only migrate; v2 explicit empty stays empty', () => {
  assert.deepEqual(plain(helpers.modelCatalog(undefined, 'old', 1)).map(x => x.id), ['old'])
  assert.deepEqual(plain(helpers.providerDraft({ models: [], model: 'old' }, 2)).models, [])
  assert.equal(helpers.providerDraft({ models: [], model: 'old' }, 2).model, '')
  assert.deepEqual(plain(helpers.normalizeVideoModels([' a ', 'a'], 'b')), ['a', 'b'])
})
test('bulk import preserves model customizations, deduplicates and keeps ordering', () => {
  const row = { id: 'a', name: 'Custom', protocol: 'google', overrides: { seed: { mode: 'omit' }, duration: { mode: 'override', value: 0 } }, capabilities: { i2v: true } }
  const merged = plain(helpers.mergeModelCatalog([row], ['a', 'b', 'b']))
  assert.deepEqual(merged[0], row)
  assert.deepEqual(merged.map(x => x.id), ['a', 'b'])
})
test('default deletion confirms, chooses first, and clears final model', () => {
  const draft = { model: 'b', models: [{ id: 'a' }, { id: 'b' }] }
  assert.equal(helpers.removeModelFromDraft(draft, 'b', () => false), draft)
  const next = helpers.removeModelFromDraft(draft, 'b', () => true)
  assert.equal(next.model, 'a')
  assert.equal(helpers.removeModelFromDraft(next, 'a', () => true).model, '')
})
test('status-only metadata is recognized and distinct task states have messages', () => {
  for (const status of ['pending', 'submission_unknown', 'download_pending', 'failed']) {
    assert.equal(helpers.videoMeta({ resultView: { meta: { status } } }).status, status)
    assert.ok(helpers.videoStatusText(status, 'en'))
  }
  assert.match(helpers.videoStatusText('submission_unknown', 'en'), /avoid resubmitting/)
})
function harness({ accepted = true, validateError = false } = {}) {
  let index = 0, tree
  const states = [], writes = [], calls = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(x => x != null && x !== false) }),
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef(initial) { const i = index++; return states[i] ??= { current: initial } }, useEffect() {},
  }
  const component = load(react).VideoGenerationSettingsCard
  const initial = { videoConfigVersion: 2, videoProviders: [{ id: 'relay', name: 'Relay', kind: 'openai-compatible', model: 'old', models: [{ id: 'old', name: 'Old', protocol: 'google', overrides: { seed: { mode: 'omit' } }, capabilities: {} }] }] }
  const props = { scope: { getSnapshot: () => ({ value: initial, revision: 'r1', writable: true }), mutate: async (ops, revision) => { writes.push({ ops: plain(ops), revision }); return accepted } }, locale: { getSnapshot: () => ({ active: 'zh' }) }, credentials: {}, rpc: { call: async (route, method, input) => { calls.push({ route, method, input }); if (method === 'models') return { ok: true, value: { ids: ['old', 'new', 'new'] } }; if (input.action === 'validate') return validateError ? { ok: false, error: { message: 'Invalid provider' } } : { ok: true, value: input.provider }; return { ok: true, value: { safe: true } } } } }
  const render = () => { index = 0; tree = component(props) }
  const nodes = () => { const out = []; const walk = node => { if (typeof node !== 'object') return; out.push(node); node.children.forEach(walk) }; walk(tree); return out }
  const text = node => typeof node === 'object' ? node.children.map(text).join('') : String(node)
  const click = async label => { const button = nodes().find(n => n.type === 'button' && text(n) === label); assert.ok(button, label); assert.ok(!button.props.disabled); await button.props.onClick(); await new Promise(resolve => setImmediate(resolve)); render() }
  const submit = async () => { await nodes().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render() }
  render(); nodes().find(n => n.props.className === 'dsh-vg-head').props.onClick(); render()
  return { click, submit, nodes, text, calls, writes }
}
test('UI bulk confirm validates and saves object catalog with version and revision', async () => {
  const ui = harness(); await ui.click('编辑'); await ui.click('拉取上游模型'); await ui.click('添加所选模型到草稿'); await ui.click('添加所选模型到草稿')
  await ui.submit(); assert.equal(ui.writes.length, 0)
  await ui.click('安全请求预览（不发送上游）')
  assert.equal(ui.calls.find(x => x.input.action === 'preview').input.prompt, 'A calm seaside sunset')
  await ui.click('确定'); await ui.submit()
  const write = ui.writes[0]; assert.equal(write.revision, 'r1')
  assert.equal(write.ops.find(x => x.path[0] === 'videoConfigVersion').value, 2)
  const provider = write.ops.find(x => x.path[0] === 'videoProviders').value[0]
  assert.deepEqual(provider.models.map(x => x.id), ['old', 'new']); assert.equal(provider.models[0].protocol, 'google'); assert.equal(provider.model, 'old')
})
test('cancel never persists imported rows and save rejection is not success', async () => {
  const ui = harness({ accepted: false }); await ui.click('编辑'); await ui.click('拉取上游模型'); await ui.click('添加所选模型到草稿'); await ui.click('取消'); await ui.submit()
  assert.deepEqual(ui.writes[0].ops.find(x => x.path[0] === 'videoProviders').value[0].models.map(x => x.id), ['old'])
  assert.ok(!ui.nodes().some(n => ui.text(n) === '✓ 已保存'))
})
test('validation failure retains editable draft and does not persist', async () => {
  const ui = harness({ validateError: true }); await ui.click('编辑'); await ui.click('确定'); await ui.submit()
  assert.equal(ui.writes.length, 0)
  assert.ok(ui.nodes().some(n => n.type === 'button' && ui.text(n) === '取消'))
})

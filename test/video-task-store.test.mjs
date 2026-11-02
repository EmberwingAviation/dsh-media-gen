import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { VideoTaskStore, taskFingerprint } from '../lib/video-task-store.js'
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'video-store-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return { directory, store: new VideoTaskStore({ directory }) }
}
const request = { endpoint: 'https://example.test/v1', protocol: 'openai-video', model: 'm', provider: 'p', operation: 't2v', prompt: 'private prompt', actualParams: { duration: 5, nested: { b: 2, a: 1 } }, sourceIdentity: { attachmentId: 'a' } }
test('fingerprint is canonical, complete, synchronous and non-mutating', () => {
  const before = structuredClone(request)
  const fp = taskFingerprint(request)
  assert.match(fp, /^[a-f0-9]{64}$/)
  assert.equal(fp, taskFingerprint({ ...request, actualParams: { nested: { a: 1, b: 2 }, duration: 5 } }))
  for (const key of ['endpoint', 'protocol', 'model', 'provider', 'operation', 'prompt', 'sourceIdentity', 'actualParams']) assert.notEqual(fp, taskFingerprint({ ...request, [key]: key === 'actualParams' ? { duration: 10 } : 'different' }), key)
  assert.deepEqual(request, before)
  assert.throws(() => taskFingerprint({ params: { number: NaN } }))
})
test('restart recovery, imported task, engine fields and safe summaries', async t => {
  const { directory, store } = await fixture(t)
  const record = await store.create({ taskId: 'imported', fingerprint: taskFingerprint(request), providerSnapshot: { id: 'p', apiKeyEnv: 'VIDEO_KEY', providerConfig: { headers: { 'x-version': '1' }, custom: { fields: { prompt: { path: 'input.prompt', type: 'string' } } } } }, parameters: { duration: 5 }, model: 'm', sessionId: undefined, originWorkspace: '/workspace', sourceIdentity: { attachmentId: 'source' }, credentialRef: 'VIDEO_KEY' })
  assert.equal(record.schemaVersion, 1)
  assert.equal('sessionId' in record, false)
  const reopened = new VideoTaskStore({ directory })
  assert.deepEqual(await reopened.get(record.operationId), record)
  assert.equal((await reopened.findByTaskId('imported')).operationId, record.operationId)
  await reopened.update(record.operationId, { status: 'completed', resultPath: '/workspace/video.mp4', attachment: { attachmentId: 'output', bytes: 100 }, requestId: 'req', error: { text: 'safe', code: 'none' } })
  const [summary] = await reopened.list({ status: 'completed' })
  for (const key of ['providerSnapshot', 'parameters', 'sourceIdentity', 'credentialRef', 'originWorkspace', 'error', 'attachment', 'promptHash']) assert.equal(key in summary, false)
  assert.equal(summary.model, 'm'); assert.equal(summary.providerId, 'p')
  assert.equal(summary.observedAt, record.observedAt)
  const observedAt = '2030-01-01T00:00:00.000Z'
  assert.equal((await reopened.update(record.operationId, { observedAt })).observedAt, observedAt)
  assert.equal((await reopened.list({ offset: 1 })).length, 0)
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const payload = JSON.parse(`{"parameters":{"${key}":"unsafe"}}`)
    await assert.rejects(store.create(payload), { code: 'ERR_VIDEO_TASK_UNSAFE' })
    assert.throws(() => taskFingerprint({ actualParams: payload.parameters }), { code: 'ERR_VIDEO_TASK_UNSAFE' })
  }
  for (const prompt of ['raw text', { path: 'prompt', type: 'string', default: 'raw text' }, { path: '__proto__.prompt' }, { path: 'prompt', map: { raw: 'prompt' } }]) {
    await assert.rejects(store.create({ providerSnapshot: { custom: { fields: { prompt } } } }), { code: 'ERR_VIDEO_TASK_UNSAFE' })
  }
})
test('parallel updates across instances do not lose independent fields', async t => {
  const { directory, store } = await fixture(t)
  const r = await store.create({})
  const other = new VideoTaskStore({ directory })
  await Promise.all([store.update(r.operationId, { taskId: 't' }), other.update(r.operationId, { progress: 42 }), store.update(r.operationId, { resultPath: '/video.mp4' })])
  const got = await store.get(r.operationId)
  assert.equal(got.taskId, 't'); assert.equal(got.progress, 42); assert.equal(got.resultPath, '/video.mp4')
  assert.deepEqual((await fs.readdir(directory)).filter(n => !n.endsWith('.json')), [])
})
test('unsafe persistence and traversal rejected without altering valid data', async t => {
  const { store } = await fixture(t)
  for (const payload of [{ prompt: 'raw' }, { providerSnapshot: { apiKey: 'secret' } }, { parameters: { nested: { authorization: 'secret' } } }, { sourceIdentity: 'data:image/png;base64,aaaa' }, { attachment: { base64: 'AAAA' } }, { providerSnapshot: { baseUrl: 'https://user:pass@example.test' } }]) await assert.rejects(store.create(payload), { code: 'ERR_VIDEO_TASK_UNSAFE' })
  for (const id of ['../outside', '..\\outside', '/absolute', 'not-a-uuid']) await assert.rejects(store.get(id), { code: 'ERR_VIDEO_TASK_INPUT' })
  const r = await store.create({})
  await assert.rejects(store.update(r.operationId, { operationId: randomUUID() }))
  await assert.rejects(store.update(r.operationId, { parameters: { api_key: 'secret' } }))
  assert.deepEqual(await store.get(r.operationId), r)
})
test('corrupt records are retained and warned, never treated as absent', async t => {
  const { directory, store } = await fixture(t)
  const r = await store.create({})
  const file = path.join(directory, `${r.operationId}.json`)
  await fs.writeFile(file, '{broken')
  const warnings = []; t.mock.method(console, 'warn', (...args) => warnings.push(args))
  for (const op of [() => store.get(r.operationId), () => store.list(), () => store.findByTaskId('x'), () => store.update(r.operationId, { status: 'failed' })]) await assert.rejects(op(), { code: 'ERR_VIDEO_TASK_CORRUPT' })
  assert.equal(await fs.readFile(file, 'utf8'), '{broken'); assert.ok(warnings.length >= 4)
})
test('unusable directory errors propagate, missing record alone returns null', async t => {
  const { directory, store } = await fixture(t)
  assert.equal(await store.get(randomUUID()), null)
  const file = path.join(directory, 'not-directory'); await fs.writeFile(file, 'occupied')
  const invalid = new VideoTaskStore({ directory: file })
  await assert.rejects(invalid.create({})); await assert.rejects(invalid.list()); await assert.rejects(invalid.get(randomUUID()))
  await assert.rejects(store.update(randomUUID(), { status: 'failed' }), { code: 'ERR_VIDEO_TASK_NOT_FOUND' })
})
test('cross-process lock fails closed and is not stolen', async t => {
  const { directory, store } = await fixture(t)
  const script = `require('node:fs').mkdirSync(${JSON.stringify(path.join(directory, '.write-lock'))})`
  const child = spawnSync(process.execPath, ['-e', script], { stdio: 'inherit' })
  assert.equal(child.status, 0)
  await assert.rejects(store.create({}), { code: 'ERR_VIDEO_TASK_LOCKED' })
  assert.ok((await fs.stat(path.join(directory, '.write-lock'))).isDirectory())
  await fs.rmdir(path.join(directory, '.write-lock'))
  assert.ok(await store.create({}))
})
test('taskId ambiguity rejects; fingerprint finds newest history', async t => {
  const { store } = await fixture(t)
  const fp = taskFingerprint(request)
  const a = await store.create({ taskId: 'same', fingerprint: fp })
  const b = await store.create({ taskId: 'same', fingerprint: fp })
  assert.notEqual(a.operationId, b.operationId)
  await assert.rejects(store.findByTaskId('same'), { code: 'ERR_VIDEO_TASK_AMBIGUOUS' })
  const expected = [a, b].sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.operationId.localeCompare(x.operationId))[0]
  assert.equal((await store.findByFingerprint(fp)).operationId, expected.operationId)
  assert.equal(await store.findByTaskId('absent'), null)
  assert.equal(await store.findByFingerprint('0'.repeat(64)), null)
})

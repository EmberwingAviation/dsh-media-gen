import test from 'node:test'
import assert from 'node:assert/strict'
import { requestVideoJson, downloadVideoBytes, redactVideoError } from '../lib/video-http.js'

test('POST response loss never retries', async () => {
  let calls = 0
  await assert.rejects(requestVideoJson({ url: 'https://provider.test/videos', method: 'POST', body: {} }, { fetchImpl: async () => { calls++; throw new Error('network disconnected') } }))
  assert.equal(calls, 1)
})
test('GET network failures back off at least 60 seconds', async () => {
  let calls = 0; const waits = []
  const result = await requestVideoJson({ url: 'https://provider.test/videos/id' }, { fetchImpl: async () => { if (++calls < 3) throw new Error('offline'); return Response.json({ status: 'completed' }) }, sleep: async ms => waits.push(ms) })
  assert.deepEqual(waits, [60000, 120000]); assert.equal(result.payload.status, 'completed')
})
test('download redirects never forward authentication to another origin', async () => {
  const seen = []
  const result = await downloadVideoBytes('https://provider.test/videos/id/content', { credential: 'top-secret', trustedOrigin: 'https://provider.test', fetchImpl: async (url, init) => {
    seen.push({ url, headers: init.headers })
    return seen.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://cdn.test/movie.mp4' } }) : new Response('bytes', { headers: { 'content-type': 'video/mp4' } })
  } })
  assert.equal(seen[0].headers.authorization, 'Bearer top-secret'); assert.deepEqual(seen[1].headers, {}); assert.equal(result.data.toString(), 'bytes')
})
test('bounded downloads reject excessive content', async () => {
  await assert.rejects(downloadVideoBytes('https://cdn.test/v', { maxBytes: 2, fetchImpl: async () => new Response('too much') }), /size limit/)
})
test('HTTP errors and URLs redact credentials', async () => {
  assert.ok(!redactVideoError('https://host/v?key=secret&x=ok Bearer secret', 'secret').includes('secret'))
  await assert.rejects(requestVideoJson({ url: 'https://provider.test/videos', method: 'POST' }, { credential: 'secret', fetchImpl: async () => Response.json({ error: { message: 'bad secret' } }, { status: 400 }) }), /REDACTED/)
})

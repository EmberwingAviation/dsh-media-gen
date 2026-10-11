import test from 'node:test'
import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('Volcengine missing task id reports the response instead of ReferenceError', async () => {
  globalThis.fetch = async () => jsonResponse({ error: { message: 'invalid model' } })
  const { generateVolcengineVideo } = await import('../lib/video-core.js')

  await assert.rejects(
    generateVolcengineVideo({
      baseURL: 'https://example.test',
      apiKey: 'test-key',
      model: 'bad-model',
      prompt: 'test',
      signal: undefined,
      rateLimit: { maxRetries: 0 },
    }),
    (error) => {
      assert.match(error.message, /Volcengine did not return a task id/)
      assert.match(error.message, /invalid model/)
      assert.doesNotMatch(error.message, /submitText is not defined/)
      return true
    },
  )
})

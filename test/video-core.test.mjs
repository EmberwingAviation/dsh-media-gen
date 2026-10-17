import './host-stubs.mjs'
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

test('OpenAI-compatible video accepts Wan task_id responses', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(String(url))
    if (options?.method === 'POST') return jsonResponse({ task_id: 'task-wan-1', status: 'queued' })
    if (String(url).endsWith('/videos/task-wan-1')) return jsonResponse({ id: 'task-wan-1', status: 'failed', error: { message: 'test stop' } })
    throw new Error(`unexpected request: ${url}`)
  }
  const { generateOpenAIVideo } = await import('../lib/video-core.js')

  await assert.rejects(
    generateOpenAIVideo({
      baseURL: 'https://example.test',
      apiKey: 'test-key',
      model: 'wan3.0-video',
      prompt: 'test',
      waitTimeoutMs: 1000,
      pollIntervalMs: 0,
      rateLimit: { maxRetries: 0 },
    }),
    /OpenAI video task failed: test stop/,
  )
  assert.deepEqual(calls, [
    'https://example.test/videos',
    'https://example.test/videos/task-wan-1',
  ])
})

test('OpenAI-compatible video reports a useful error for missing task ids', async () => {
  globalThis.fetch = async () => jsonResponse({ error: { message: 'invalid model' } })
  const { generateOpenAIVideo } = await import('../lib/video-core.js')

  await assert.rejects(
    generateOpenAIVideo({
      baseURL: 'https://example.test',
      apiKey: 'test-key',
      model: 'wan3.0-video',
      prompt: 'test',
      waitTimeoutMs: 1000,
      pollIntervalMs: 0,
      rateLimit: { maxRetries: 0 },
    }),
    (error) => {
      assert.match(error.message, /did not return a video task id/)
      assert.match(error.message, /invalid model/)
      return true
    },
  )
})

import './host-stubs.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
const { generateOpenAIVideo, generateVolcengineVideo } = await import('../lib/video-core.js')
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })
const input = { baseURL: 'https://example.test', apiKey: 'test-key', model: 'test', prompt: 'test', waitTimeoutMs: 1000, pollIntervalMs: 0, rateLimit: { baseMs: 1, maxRetries: 3 } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
test('upstream empty task error is preserved without resubmitting or polling', async () => {
  let calls = 0
  const body = { code: 'fail_to_fetch_task', message: JSON.stringify({ code: 'invalid_response', message: 'task_id is empty', data: null }), data: null }
  globalThis.fetch = async () => { calls++; return json(body, 500) }
  await assert.rejects(generateOpenAIVideo(input), error => {
    assert.match(error.message, /creation failed \(500\)/)
    assert.match(error.message, /task_id is empty/)
    assert.equal(error.rateLimited, undefined)
    return true
  })
  assert.equal(calls, 1)
})
for (const [name, generate] of [['OpenAI', generateOpenAIVideo], ['Volcengine', generateVolcengineVideo]]) {
  for (const body of [null, [], 42, {}, { id: '   ' }, { id: '', task_id: ' ' }]) {
    test(`${name} rejects invalid task response ${JSON.stringify(body)} without polling`, async () => {
      let calls = 0
      globalThis.fetch = async () => { calls++; return json(body) }
      await assert.rejects(generate(input), error => {
        assert.match(error.message, /did not return a (video )?task id/)
        assert.equal(error instanceof ReferenceError, false)
        assert.equal(error instanceof TypeError, false)
        return true
      })
      assert.equal(calls, 1)
    })
  }
}
for (const body of [{ id: 'primary', task_id: 'fallback' }, { id: ' ', task_id: 'fallback' }]) {
  test(`OpenAI chooses valid id from ${JSON.stringify(body)}`, async () => {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push(String(url))
      return options.method === 'POST' ? json(body) : json({ status: 'failed', error: { message: 'test stop' } })
    }
    await assert.rejects(generateOpenAIVideo(input), /test stop/)
    assert.equal(calls[1], `https://example.test/videos/${body.id.trim() || body.task_id}`)
  })
}

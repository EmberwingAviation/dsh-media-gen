import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { serveRpcRoute } from '../lib/rpc-route.js'

/** 起一个只挂 serveRpcRoute 的临时服务器，模拟 DSH 客户端的信封请求。 */
async function withServer(run) {
  const server = createServer((req, res) => {
    void serveRpcRoute(req, res, '/image-gen', async (endpoint, payload) => {
      if (endpoint === 'models') return { ok: true, value: { ids: ['m-1', 'm-2'] } }
      if (endpoint === 'boom') throw new Error('kaboom')
      return { ok: false, error: { code: 'x/unknown', message: `unknown ${endpoint}`, details: { issues: [] } } }
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const envelope = (method, payload = {}) => JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method, payload })

test('rpc 路由：正常调用返回 server-response 信封', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/image-gen/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: envelope('models', { baseUrl: 'https://x/v1', apiKeyEnv: 'K' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.type, 'server-response')
    assert.equal(body.rpcId, 'rpc-1')
    assert.deepEqual(body.result, { ok: true, value: { ids: ['m-1', 'm-2'] } })
  })
})

test('rpc 路由：handler 抛错时以 ok:false 信封返回（HTTP 仍 200）', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/image-gen/boom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: envelope('boom'),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.result.ok, false)
    assert.match(body.result.error.message, /kaboom/)
  })
})

test('rpc 路由：method 与路径不一致 → 校验失败信封', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/image-gen/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: envelope('other'),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.result.ok, false)
    assert.equal(body.result.error.code, 'gateway/bad-request')
  })
})

test('rpc 路由：GET 404、跨站 403、非 JSON 400、未知端点 ok:false', async () => {
  await withServer(async (base) => {
    const get = await fetch(`${base}/image-gen/models`)
    assert.equal(get.status, 404)

    const crossSite = await fetch(`${base}/image-gen/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: envelope('models'),
    })
    assert.equal(crossSite.status, 403)

    const badJson = await fetch(`${base}/image-gen/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: 'not-json',
    })
    assert.equal(badJson.status, 400)

    const unknown = await fetch(`${base}/image-gen/whatever`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: envelope('whatever'),
    })
    const body = await unknown.json()
    assert.equal(body.result.ok, false)
    assert.match(body.result.error.message, /unknown whatever/)
  })
})

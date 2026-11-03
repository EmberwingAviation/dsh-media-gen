import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { Readable } from 'node:stream'

// Exercise the complete merged apply path without touching the user's files,
// credentials or upstream providers. Adapter-only stubs deliberately reject it.
const source = (text) => ({ url: `data:text/javascript,${encodeURIComponent(text)}`, shortCircuit: true })
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return source('export const defineTool = value => value')
    if (specifier === '@deepseek-ai/dsh-credentials') return source('export const credentialRef = value => value')
    if (specifier === '@deepseek-ai/dsh-attachment') return source('export const AttachmentId = value => value')
    if (specifier === './cli-config.js' && context.parentURL?.endsWith('/image-core.js')) return source('export const CLI_MIRROR_PATH = "/test-only/gen-image.config.json"; export const buildCliMirror = () => ({}); export const writeCliMirror = () => CLI_MIRROR_PATH')
    return nextResolve(specifier, context)
  },
})
const { apply } = await import('../lib/index.js')
hooks.deregister()

test('merged host starts, serves RPC, registers all tools and disposes routes', async () => {
  const routes = new Map()
  const tools = []
  const disposers = []
  const ctx = {
    inject() {},
    get() { return undefined },
    effect(callback) { disposers.push(callback()) },
    webServer: { register(route) { assert.ok(!routes.has(route.path)); routes.set(route.path, route); return () => routes.delete(route.path) } },
    tools: { register(tool) { tools.push(tool.name) } },
  }
  assert.doesNotThrow(() => apply(ctx, {}))
  assert.deepEqual(tools, ['image_generate', 'generate_video', 'animate_image', 'query_video_task', 'manage_video_models'])
  const route = routes.get('/image-gen')
  assert.ok(route)
  const req = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'startup-test', method: 'models', payload: {} }))])
  Object.assign(req, { method: 'POST', url: '/image-gen/models', headers: { host: 'localhost' } })
  let status, body
  const res = { writeHead(value) { status = value }, end(value) { body = value } }
  await route.handler(req, res)
  assert.equal(status, 200)
  const envelope = JSON.parse(body)
  assert.equal(envelope.rpcId, 'startup-test')
  assert.equal(envelope.result.ok, false)
  assert.match(envelope.result.error.message, /baseUrl/)
  for (const apiKeyEnv of ['sk-test-not-a-real-key', 'sk_fake_secret', '', 'bad ref']) {
    const bad = Readable.from([Buffer.from(JSON.stringify({type:'client-request',rpcId:'redaction',method:'models',payload:{baseUrl:'https://example.invalid/v1',apiKeyEnv}}))])
    Object.assign(bad,{method:'POST',url:'/image-gen/models',headers:{host:'localhost'}})
    await route.handler(bad,res)
    assert.equal(JSON.parse(body).result.ok,false)
    assert.match(JSON.parse(body).result.error.message,/凭据名称/)
    if(apiKeyEnv) assert.ok(!body.includes(apiKeyEnv),'Never echo an invalid credential or pasted secret')
  }
  for (const dispose of disposers.reverse()) dispose?.()
  assert.equal(routes.size, 0)
})

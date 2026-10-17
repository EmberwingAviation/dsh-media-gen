/**
 * 完成态视频下载策略回归测试（2026-10-11 适配 yotopivot 文档第八章）。
 *
 * 策略：**先 `/videos/{id}/content`，再回退轮询结果里的 URL**
 * （文档要求"下载时使用本站 /content 接口，不要依赖其中的临时结果地址"）。
 * 这里起一个本地假中转，真实验证请求路径与回退顺序。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fetchCompletedVideo } from '../lib/video-shared.js'

const MAX_BYTES = 1024 * 1024

/**
 * 起本地假中转。
 * @param routes {[path]: {status?, headers?, body?}}
 * @returns {base, hits, close}
 */
async function startStub(routes) {
  const hits = []
  const server = createServer((req, res) => {
    hits.push(req.url)
    const route = routes[req.url]
    if (route === undefined) {
      res.writeHead(404)
      res.end('no such route')
      return
    }
    res.writeHead(route.status ?? 200, route.headers ?? { 'content-type': 'video/mp4' })
    res.end(route.body ?? Buffer.from([1, 2, 3]))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    base: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

test('content 优先：/content 可用时不碰轮询结果里的临时 URL', async () => {
  const stub = await startStub({ '/videos/t1/content': { body: Buffer.from([1, 2, 3, 4, 5]) } })
  try {
    const out = await fetchCompletedVideo({
      base: stub.base,
      taskId: 't1',
      apiKey: 'k',
      pollJson: { status: 'completed', video_url: `${stub.base}/tmp/expiring.mp4` },
      maxBytes: MAX_BYTES,
    })
    assert.deepEqual([...out.data], [1, 2, 3, 4, 5])
    assert.equal(out.mediaType, 'video/mp4')
    assert.equal(out.sourceUrl, undefined, '走官方 /content 时不应记 sourceUrl')
    assert.deepEqual(stub.hits, ['/videos/t1/content'], '只应请求 /content，不得触碰临时 URL')
  } finally {
    await stub.close()
  }
})

test('/content 未实现（404）时回退到 video_url', async () => {
  const stub = await startStub({
    '/videos/t2/content': { status: 404, body: Buffer.from('not implemented') },
    '/tmp/expiring.mp4': { body: Buffer.from([9, 8, 7]) },
  })
  try {
    const out = await fetchCompletedVideo({
      base: stub.base,
      taskId: 't2',
      apiKey: 'k',
      pollJson: { status: 'completed', video_url: `${stub.base}/tmp/expiring.mp4` },
      maxBytes: MAX_BYTES,
    })
    assert.deepEqual([...out.data], [9, 8, 7])
    assert.equal(out.sourceUrl, `${stub.base}/tmp/expiring.mp4`)
    assert.deepEqual(stub.hits, ['/videos/t2/content', '/tmp/expiring.mp4'])
  } finally {
    await stub.close()
  }
})

test('回退也认 output.video_url 与 metadata.url（实测的另两处位置）', async () => {
  const stub = await startStub({
    '/videos/t3/content': { status: 404 },
    '/tmp/out.mp4': { body: Buffer.from([4, 4, 4]) },
    '/tmp/meta.mp4': { body: Buffer.from([5, 5, 5]) },
  })
  try {
    const viaOutput = await fetchCompletedVideo({
      base: stub.base,
      taskId: 't3',
      apiKey: 'k',
      pollJson: { status: 'completed', output: { video_url: `${stub.base}/tmp/out.mp4` } },
      maxBytes: MAX_BYTES,
    })
    assert.deepEqual([...viaOutput.data], [4, 4, 4])

    const viaMetadata = await fetchCompletedVideo({
      base: stub.base,
      taskId: 't3',
      apiKey: 'k',
      pollJson: { status: 'completed', metadata: { url: `${stub.base}/tmp/meta.mp4` } },
      maxBytes: MAX_BYTES,
    })
    assert.deepEqual([...viaMetadata.data], [5, 5, 5])
  } finally {
    await stub.close()
  }
})

test('/content 与兜底 URL 都没有 → 报出可诊断的错误', async () => {
  const stub = await startStub({ '/videos/t4/content': { status: 404 } })
  try {
    await assert.rejects(
      () => fetchCompletedVideo({
        base: stub.base,
        taskId: 't4',
        apiKey: 'k',
        pollJson: { status: 'completed' },
        maxBytes: MAX_BYTES,
      }),
      /video download failed: \/content returned 404 and the completion response carried no video URL/,
    )
  } finally {
    await stub.close()
  }
})

test('/content 网络异常时同样回退，并沿用响应头的媒体类型', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('/content')) throw new Error('ECONNRESET')
    return new Response(Buffer.from([7, 7]), { status: 200, headers: { 'content-type': 'video/webm' } })
  }
  const out = await fetchCompletedVideo({
    base: 'https://relay.test/v1',
    taskId: 't5',
    apiKey: 'k',
    pollJson: { status: 'completed', video_url: 'https://cdn.test/a.webm' },
    maxBytes: MAX_BYTES,
    fetchImpl,
  })
  assert.deepEqual([...out.data], [7, 7])
  assert.equal(out.mediaType, 'video/webm')
  assert.deepEqual(calls, ['https://relay.test/v1/videos/t5/content', 'https://cdn.test/a.webm'])
})

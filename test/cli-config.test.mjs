import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCliMirror } from '../lib/cli-config.js'

const catalog = {
  providers: [
    {
      id: 'yotopivot', name: 'Y', baseUrl: 'https://x/v1', apiFormat: 'openai-images', apiKeyEnv: 'QWEN_TOB_API_KEY',
      models: [{ id: 'qwen-image-3.0-pro', name: 'p' }, { id: 'qwen-image', name: 'q' }],
    },
    {
      id: 'gpt', name: 'G', baseUrl: 'https://x/v1', apiFormat: 'openai-images', apiKeyEnv: 'IMAGE_GEN_GPT_API_KEY',
      models: [{ id: 'gpt-image-2', name: 'g' }],
    },
  ],
}

test('镜像：selection 解析出 base/keyEnv/model/尺寸/目录/超时', () => {
  const mirror = buildCliMirror(catalog, {
    providerId: 'gpt', modelId: 'gpt-image-2', defaultSize: '1024x1536',
    cliOutDir: 'D:/out', cliTimeoutMs: 60000, enabled: true,
  })
  assert.equal(mirror.version, 1)
  assert.equal(mirror.base, 'https://x/v1')
  assert.equal(mirror.keyEnv, 'IMAGE_GEN_GPT_API_KEY')
  assert.equal(mirror.defaultModel, 'gpt-image-2')
  assert.equal(mirror.defaultSize, '1024x1536')
  assert.equal(mirror.outDir, 'D:/out')
  assert.equal(mirror.timeoutMs, 60000)
  assert.equal(mirror.enabled, true)
  assert.deepEqual(mirror.selection, { providerId: 'gpt', modelId: 'gpt-image-2' })
  assert.equal(mirror.providers.length, 2)
  assert.deepEqual(mirror.providers[1].models, ['gpt-image-2'])
})

test('镜像：空 selection 回退默认值', () => {
  const mirror = buildCliMirror(catalog, {})
  assert.equal(mirror.defaultModel, '')
  assert.equal(mirror.base, '')
  assert.equal(mirror.keyEnv, '')
  assert.equal(mirror.outDir, 'C:/dsh/generate/image')
  assert.equal(mirror.timeoutMs, 180000)
  assert.equal(mirror.defaultSize, '1024x1024')
})

test('镜像：非法超时/空目录回退', () => {
  assert.equal(buildCliMirror(catalog, { cliTimeoutMs: -5 }).timeoutMs, 180000)
  assert.equal(buildCliMirror(catalog, { cliOutDir: '   ' }).outDir, 'C:/dsh/generate/image')
})

test('镜像：只含凭据 ref 名、不含密钥值', () => {
  const json = JSON.stringify(buildCliMirror(catalog, { providerId: 'gpt', modelId: 'gpt-image-2' }))
  assert.ok(json.includes('IMAGE_GEN_GPT_API_KEY'))
  assert.ok(!/sk-|Bearer/i.test(json))
})

test('镜像：imageLane 默认 auto、可覆盖、空白回退', () => {
  assert.equal(buildCliMirror(catalog, {}).imageLane, 'auto')
  assert.equal(buildCliMirror(catalog, { imageLane: 'cli' }).imageLane, 'cli')
  assert.equal(buildCliMirror(catalog, { imageLane: '  ' }).imageLane, 'auto')
})

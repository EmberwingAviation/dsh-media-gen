import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath
const run = (args) => execFileSync(node, args, { cwd: root, stdio: 'ignore' })

test('patch-client-video codemod 幂等（已补丁时安全跳过）', () => {
  run([join(root, 'scripts', 'patch-client-video.mjs')])
  run([join(root, 'scripts', 'patch-client-video.mjs')])
})

test('build-client 确定性输出单一模块且包含两个半', () => {
  run([join(root, 'scripts', 'build-client.mjs')])
  const first = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  run([join(root, 'scripts', 'build-client.mjs')])
  const second = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.equal(first, second, 'build must be deterministic')

  assert.equal(first.match(/window\.__ModuleLoader__\.load\(/g)?.length, 1, 'exactly one module registration')
  for (const marker of [
    "id: 'dsh-media-gen',",
    'const imageHalf',
    'const videoHalf',
    'function bindVideoScope',
    'GalleryViewTab',
    'ImageGenerateToolview',
    'MEDIA_ENTRY_ID',
  ]) {
    assert.ok(first.includes(marker), `merged client must contain ${marker}`)
  }
  // 旧 API 不得残留（注释中提及无妨，禁止的是真实调用）
  assert.ok(!first.includes('ctx.settingsScope'), 'ctx.settingsScope must be gone from the merged client')
  assert.ok(!first.includes('id: "dsh-video-gen"'), 'upstream module id must be renamed')

  run(['--check', join(root, 'lib', 'client.js')])
})

test('全部 host/client 模块通过 node --check', () => {
  for (const file of [
    'lib/index.js',
    'lib/media-config.js',
    'lib/image-core.js',
    'lib/video-core.js',
    'lib/video-shared.js',
    'lib/video-google.js',
    'lib/video-reference-image.js',
    'lib/client-image.js',
    'lib/client-video.js',
    'lib/client.js',
  ]) {
    run(['--check', join(root, file)])
  }
})

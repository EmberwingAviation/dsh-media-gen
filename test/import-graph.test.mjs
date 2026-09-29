/**
 * 链接完整性回归测试：扫描 lib/ 下所有 host 模块的相对 import，
 * 断言目标文件存在（防止重命名漏改，如 video-google.js → ./shared.js 事故）。
 * 同时校验命名导入在被引模块中确有 export。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')
const HOST_FILES = [
  'index.js',
  'media-config.js',
  'image-core.js',
  'video-core.js',
  'video-shared.js',
  'video-google.js',
  'video-reference-image.js',
]

const IMPORT_RE = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*['"](\.[^'"]+)['"]/g

test('lib/ 全部相对 import 目标文件存在', () => {
  for (const file of HOST_FILES) {
    const src = readFileSync(join(root, file), 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[3]
      if (!spec.startsWith('.')) continue
      const target = resolve(root, spec)
      assert.ok(existsSync(target), `${file} imports missing file: ${spec}`)
    }
  }
})

test('lib/ 命名 import 在被引模块中确有导出', () => {
  for (const file of HOST_FILES) {
    const src = readFileSync(join(root, file), 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const named = match[2]
      const spec = match[3]
      if (!named || !spec.startsWith('.')) continue
      const target = resolve(root, spec)
      if (!existsSync(target)) continue
      const targetSrc = readFileSync(target, 'utf8')
      for (const raw of named.split(',')) {
        const name = raw.split(' as ')[0].trim()
        if (!name) continue
        const exported = targetSrc.includes(`export function ${name}`)
          || targetSrc.includes(`export async function ${name}`)
          || targetSrc.includes(`export const ${name}`)
          || targetSrc.includes(`export {\n\t${name},`)
          || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, 's').test(targetSrc)
        assert.ok(exported, `${file} imports named export "${name}" from ${spec} which does not export it`)
      }
    }
  }
})

/**
 * build-client.mjs — 把 lib/client-image.js 与 lib/client-video.js 合并为单一 lib/client.js。
 *
 * 两个上游 client 半都是自包含的 `window.__ModuleLoader__.load({id, factory})` 文件，
 * 顶层符号会碰撞（apply/inject/DICT/STYLE…），因此合并产物用一个外层 load 调用，
 * factory 内把两个上游 factory 体各自包进箭头 IIFE（共享 require、隔离作用域），
 * 再合并 exports.apply / exports.inject。
 *
 * 幂等：每次运行从两个源文件重新生成 lib/client.js。
 * 运行：node scripts/build-client.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')

const FACTOR_MARKER = 'factory: (require) => {'

function extractFactoryBody(file, tailMarker, label) {
  const src = read(file)
  const at = src.indexOf(FACTOR_MARKER)
  if (at === -1) throw new Error(`[${label}] factory marker not found in ${file}`)
  if (src.indexOf(FACTOR_MARKER, at + 1) !== -1) throw new Error(`[${label}] factory marker not unique in ${file}`)
  if (!src.endsWith(tailMarker)) throw new Error(`[${label}] ${file} does not end with the expected load() closer`)
  const bodyStart = at + FACTOR_MARKER.length
  const bodyEnd = src.length - tailMarker.length
  if (bodyEnd <= bodyStart) throw new Error(`[${label}] empty factory body in ${file}`)
  const body = src.slice(bodyStart, bodyEnd)
  if (!body.includes('return module.exports')) throw new Error(`[${label}] factory body never returns module.exports`)
  return body
}

// 上游两文件的 load() 收尾形态不同（image：2 空格/无分号/末尾换行；video：tab/带分号/无末尾换行）。
const imageBody = extractFactoryBody('lib/client-image.js', '\n  },\n})\n', 'image')
const videoBody = extractFactoryBody('lib/client-video.js', '\n\t}\n});', 'video')

const merged = `/**
 * dsh-media-gen — 合并 client 入口（由 scripts/build-client.mjs 生成，勿手改）。
 * 源：lib/client-image.js（dsh-image-generation@0.1.2 client，MIT）
 *     lib/client-video.js（dsh-video-gen@0.2.4 client 补丁版，MIT）
 */
window.__ModuleLoader__.load({
  id: 'dsh-media-gen',
  factory: (require) => {
    const imageHalf = (() => {${imageBody}
    })()
    const videoHalf = (() => {${videoBody}
    })()
    const inject = [...new Set([...(imageHalf.inject ?? []), ...(videoHalf.inject ?? [])])]
    return {
      apply(ctx) {
        imageHalf.apply(ctx)
        videoHalf.apply(ctx)
      },
      inject,
    }
  },
})
`

writeFileSync(join(root, 'lib', 'client.js'), merged)
console.log('lib/client.js built,', merged.length, 'bytes')

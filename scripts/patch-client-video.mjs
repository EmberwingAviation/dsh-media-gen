/**
 * patch-client-video.mjs — 一次性 codemod：
 * 把 lib/client-video.js（dsh-video-gen@0.2.4 client 的逐字副本）补丁为 dsh-media-gen 的视频 client 半。
 *
 * 全部改动基于唯一文本标记拼接；任何标记缺失或不唯一都会报错退出（防止半补丁状态）。
 * 幂等：检测到已补丁（模块 id 已改名）时直接跳过。
 *
 * 运行：node scripts/patch-client-video.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'lib', 'client-video.js')
const part = (name) => readFileSync(join(root, 'scripts', 'parts', name), 'utf8').replace(/\r\n/g, '\n')

let src = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')

if (src.includes('id: "dsh-media-gen-video",')) {
  console.log('client-video.js already patched; nothing to do.')
  process.exit(0)
}

function assertOnce(needle, label) {
  const first = src.indexOf(needle)
  if (first === -1) throw new Error(`[${label}] marker not found: ${JSON.stringify(needle.slice(0, 70))}`)
  if (src.indexOf(needle, first + 1) !== -1) throw new Error(`[${label}] marker not unique: ${JSON.stringify(needle.slice(0, 70))}`)
  return first
}

function replaceOnce(marker, replacement, label) {
  assertOnce(marker, label)
  src = src.replace(marker, replacement)
}

function splice(startMarker, endMarker, replacement, label) {
  const start = assertOnce(startMarker, label)
  const end = src.indexOf(endMarker, start + startMarker.length)
  if (end === -1) throw new Error(`[${label}] end marker not found: ${JSON.stringify(endMarker.slice(0, 70))}`)
  src = src.slice(0, start) + replacement + src.slice(end)
}

// A — 模块 id
replaceOnce('id: "dsh-video-gen",', 'id: "dsh-media-gen-video",', 'id')

// B/C — DICT 增补（zh / en），插在各自 close 键之前
replaceOnce('\t\t\t\tclose: "关闭 (Esc)",', part('dict-zh.txt') + '\t\t\t\tclose: "关闭 (Esc)",', 'dict-zh')
replaceOnce('\t\t\t\tclose: "Close (Esc)",', part('dict-en.txt') + '\t\t\t\tclose: "Close (Esc)",', 'dict-en')

// D — 旧单 provider 助手（modelOf/baseURLOf）→ 目录制助手 + configForms scope 绑定
splice(
  'function modelOf(provider, config) {',
  '//#endregion',
  part('video-helpers.js') + '\n\t\t',
  'helpers',
)

// E — inject：移除已删 API settingsScope 的硬依赖（DSH 0.1.7+ 改为 configForms）
replaceOnce(
  'const inject = ["slots", "connection", "settingsScope", "locale", "remote"];',
  'const inject = ["slots", "connection", "locale", "remote"];',
  'inject',
)

// F — apply() 头部：settingsScope → bindVideoScope；settings.plugin.item → plugins.bundle.config
splice(
  'function apply(ctx) {',
  'ctx.slots.inject("tool.call.toolview", () => register({',
  part('video-apply-head.js') + '\n\t\t\t',
  'apply-head',
)

// G — 设置卡整体替换为目录式多供应商卡片
splice(
  'function VideoGenerationSettingsCard(props) {',
  'function videoMeta(block) {',
  part('video-card.js') + '\t\t',
  'card',
)

writeFileSync(target, src)
console.log('client-video.js patched OK,', src.length, 'bytes')

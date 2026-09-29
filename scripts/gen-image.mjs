#!/usr/bin/env node
/**
 * gen-image.mjs — dsh-media-gen 快车道出图 CLI（零依赖，直连 OpenAI 兼容 images 路由）。
 *
 * 用法：
 *   node scripts/gen-image.mjs "提示词" [--model M] [--size S] [--key-env E] [--base B] [--out D]
 *        [--config PATH] [--timeout MS] [--dry-run]
 *
 * 配置优先级：命令行 flag > 配置文件 > 内置默认。
 * 配置文件查找顺序：--config > 环境变量 DSH_GEN_IMAGE_CONFIG >
 *   <脚本目录>/../gen-image.config.json > ~/.dsh/gen-image.config.json
 * 配置文件形状见 gen-image.config.json（defaultModel/defaultSize/base/outDir/timeoutMs/
 *   keyByModel[{pattern,keyEnv}]/defaultKeyEnv）。
 *
 * 凭据从 ~/.dsh/.credentials.yaml 的 refs 读取（密钥不进命令行/环境变量/配置文件）。
 * 响应兼容 b64_json / url / data-URL 三种形状；mime 以 sniff 为准决定扩展名。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const CRED_FILE = join(homedir(), '.dsh', '.credentials.yaml')

const BUILTIN_DEFAULTS = {
  base: 'https://www.yotopivot.top/v1',
  outDir: 'C:/dsh/generate/image',
  defaultModel: 'qwen-image-3.0-pro',
  defaultSize: '1024x1024',
  timeoutMs: 180000,
  keyByModel: [{ pattern: '^gpt-image', keyEnv: 'IMAGE_GEN_GPT_API_KEY' }],
  defaultKeyEnv: 'QWEN_TOB_API_KEY',
}

function configCandidates(flagPath) {
  const list = []
  if (flagPath) list.push(flagPath)
  if (process.env.DSH_GEN_IMAGE_CONFIG) list.push(process.env.DSH_GEN_IMAGE_CONFIG)
  list.push(join(homedir(), '.dsh', 'gen-image.config.json'))
  list.push(resolve(SCRIPT_DIR, '..', 'gen-image.config.json'))
  return list
}

/** GUI 镜像形状（version:1 + providers/selection）归一为 CLI 扁平形状；普通 JSON 原样合并。 */
function normalizeConfig(parsed) {
  const base = { ...BUILTIN_DEFAULTS, ...parsed }
  if (parsed && parsed.version === 1 && Array.isArray(parsed.providers) && parsed.selection) {
    const provider = (parsed.providers ?? []).find((row) => row?.id === parsed.selection?.providerId)
    const modelId = parsed.selection?.modelId || parsed.defaultModel || ''
    return {
      ...base,
      base: parsed.base || base.base,
      outDir: parsed.outDir || base.outDir,
      defaultModel: modelId,
      defaultSize: parsed.defaultSize || base.defaultSize,
      timeoutMs: Number(parsed.timeoutMs) > 0 ? Number(parsed.timeoutMs) : base.timeoutMs,
      exactKeyEnv: String(provider?.apiKeyEnv ?? parsed.keyEnv ?? '').trim() || undefined,
      mirror: true,
      enabled: parsed.enabled !== false,
    }
  }
  return base
}

function loadConfig(flagPath) {
  if (flagPath && !existsSync(flagPath)) throw new Error(`--config file not found: ${flagPath}`)
  for (const path of configCandidates(flagPath)) {
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      return { config: normalizeConfig(parsed), source: path }
    } catch (error) {
      console.error(`warn: unreadable config ${path}: ${error?.message ?? error}`)
    }
  }
  return { config: { ...BUILTIN_DEFAULTS }, source: null }
}

function parseArgs(argv) {
  const out = { promptParts: [], model: null, size: null, keyEnv: null, base: null, out: null, configPath: null, timeoutMs: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model') out.model = argv[++i]
    else if (a === '--size') out.size = argv[++i]
    else if (a === '--key-env') out.keyEnv = argv[++i]
    else if (a === '--base') out.base = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--config') out.configPath = argv[++i]
    else if (a === '--timeout') out.timeoutMs = Number(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
    else out.promptParts.push(a)
  }
  out.prompt = out.promptParts.join(' ')
  return out
}

function resolveKeyEnv(cfg, model, flagKeyEnv) {
  if (flagKeyEnv) return flagKeyEnv
  if (cfg.exactKeyEnv) return cfg.exactKeyEnv
  for (const rule of cfg.keyByModel ?? []) {
    try { if (new RegExp(rule.pattern, 'i').test(model)) return rule.keyEnv } catch { /* bad pattern: skip */ }
  }
  return cfg.defaultKeyEnv
}

function readCredential(envName) {
  const text = readFileSync(CRED_FILE, 'utf8')
  const re = new RegExp(`^\\s{2}${envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(\\S+)\\s*$`, 'm')
  const m = text.match(re)
  if (!m) throw new Error(`credential ref "${envName}" not found in ${CRED_FILE}`)
  return m[1].replace(/^['"]|['"]$/g, '')
}

function sniffMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  return 'image/png'
}

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { config: cfg, source: configSource } = loadConfig(args.configPath)
  const model = args.model ?? cfg.defaultModel
  const size = args.size ?? cfg.defaultSize
  const base = args.base ?? cfg.base
  const outDir = args.out ?? cfg.outDir
  const timeoutMs = args.timeoutMs ?? cfg.timeoutMs
  const keyEnv = resolveKeyEnv(cfg, model, args.keyEnv)

  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, configSource, mirror: cfg.mirror === true, enabled: cfg.enabled !== false, model, size, base, outDir, timeoutMs, keyEnv }))
    return
  }
  if (!args.prompt) { console.error('usage: gen-image.mjs "prompt" [--model M] [--size S] [--key-env E] [--base B] [--out D] [--config P] [--timeout MS] [--dry-run]'); process.exit(2) }

  const apiKey = readCredential(keyEnv)
  const url = `${base.replace(/\/+$/, '')}/images/generations`
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt: args.prompt, n: 1, ...(size && size !== 'auto' ? { size } : {}), response_format: 'b64_json' }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) { console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`); process.exit(1) }
  let payload
  try { payload = JSON.parse(text) } catch { console.error('invalid JSON from upstream'); process.exit(1) }
  const entry = (payload.data ?? [])[0]
  if (!entry) { console.error('upstream returned no data entry'); process.exit(1) }
  let buf
  if (typeof entry.b64_json === 'string' && entry.b64_json.length > 0) buf = Buffer.from(entry.b64_json, 'base64')
  else if (typeof entry.url === 'string' && entry.url.startsWith('data:')) buf = Buffer.from(entry.url.split(',')[1], 'base64')
  else if (typeof entry.url === 'string' && entry.url.length > 0) {
    const r2 = await fetch(entry.url, { signal: AbortSignal.timeout(Math.min(timeoutMs, 60000)) })
    if (!r2.ok) { console.error(`image url fetch failed HTTP ${r2.status}`); process.exit(1) }
    buf = Buffer.from(await r2.arrayBuffer())
  } else { console.error('no b64_json or url in response'); process.exit(1) }
  const mime = sniffMime(buf)
  mkdirSync(outDir, { recursive: true })
  const name = `image-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}${EXT[mime] ?? '.png'}`
  const file = resolve(outDir, name)
  writeFileSync(file, buf)
  console.log(JSON.stringify({ file, bytes: buf.length, mime, model, size, keyEnv, configSource, ms: Date.now() - t0 }))
}

main().catch((e) => { console.error('ERR', e?.message ?? String(e)); process.exit(1) })

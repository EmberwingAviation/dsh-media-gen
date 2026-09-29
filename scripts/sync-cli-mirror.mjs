#!/usr/bin/env node
/**
 * sync-cli-mirror.mjs — 在 host 未重启（新 RPC 端点未生效）时，从 profile 的
 * cordis.patch.yml 解析 media-gen 配置块，重建快车道 CLI 镜像 JSON。
 * host 重启后，设置卡保存会自动经 sync-cli-config RPC 写镜像，本脚本仅作应急/离线用。
 *
 * 用法：node scripts/sync-cli-mirror.mjs [--patch PATH] [--out PATH]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { buildCliMirror, writeCliMirror, CLI_MIRROR_PATH } from '../lib/cli-config.js'

const DEFAULT_PATCH = join(homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')

function argValue(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** 极简缩进解析：只认 media-gen 配置块用到的形状（标量 / 列表 / 两层嵌套列表）。 */
function parseMediaGenBlock(text) {
  const lines = text.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^- id: media-gen\s*$/.test(lines[i])) { start = i; break }
  }
  if (start === -1) throw new Error('media-gen entry not found in patch file')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') { end = i; break }
  }
  const block = lines.slice(start, end)

  const scalar = (key) => {
    const m = block.find((l) => new RegExp(`^\\s{4}${key}:\\s*(\\S.*)$`).test(l))
    return m ? m.match(new RegExp(`^\\s{4}${key}:\\s*(\\S.*)$`))[1].trim() : undefined
  }

  const providers = []
  let current = null
  let inModels = false
  let inProvidersSection = false
  for (const raw of block) {
    const line = raw.replace(/\s+$/, '')
    let m
    if (/^ {4}providers:\s*$/.test(line)) { inProvidersSection = true; continue }
    if (/^ {4}\S/.test(line) && !/^ {4}- /.test(line)) { inProvidersSection = false; continue }
    if (!inProvidersSection) continue
    if ((m = line.match(/^ {6}- id: (\S+)$/))) {
      current = { id: m[1], models: [] }
      providers.push(current)
      inModels = false
    } else if (current && (m = line.match(/^ {8}name: (.+)$/)) && !inModels) {
      current.name = m[1].trim()
    } else if (current && (m = line.match(/^ {8}baseUrl: (\S+)$/))) {
      current.baseUrl = m[1].trim()
    } else if (current && (m = line.match(/^ {8}apiFormat: (\S+)$/))) {
      current.apiFormat = m[1].trim()
    } else if (current && (m = line.match(/^ {8}apiKeyEnv: (\S+)$/))) {
      current.apiKeyEnv = m[1].trim()
    } else if (current && /^ {8}models:\s*$/.test(line)) {
      inModels = true
    } else if (current && inModels && (m = line.match(/^ {10}- id: (\S+)$/))) {
      current.models.push({ id: m[1].trim(), name: m[1].trim() })
    } else if (current && inModels && /^ {10}\S/.test(line) && !/^ {10}name:/.test(line)) {
      inModels = false
    }
  }

  return {
    providers: { providers },
    runtime: {
      enabled: scalar('enabled') !== 'false',
      providerId: scalar('providerId') ?? '',
      modelId: scalar('modelId') ?? '',
      defaultSize: scalar('defaultSize') ?? '1024x1024',
      defaultQuality: scalar('defaultQuality') ?? 'auto',
      cliOutDir: scalar('cliOutDir') ?? '',
      cliTimeoutMs: Number(scalar('cliTimeoutMs')) || undefined,
      imageLane: scalar('imageLane') ?? 'auto',
    },
  }
}

const patchPath = argValue('--patch', DEFAULT_PATCH)
const outPath = argValue('--out', CLI_MIRROR_PATH)
const text = readFileSync(patchPath, 'utf8')
const { providers, runtime } = parseMediaGenBlock(text)
const mirror = buildCliMirror(providers, runtime)
const written = writeCliMirror(mirror, outPath)
console.log(JSON.stringify({ written, model: mirror.defaultModel, base: mirror.base, keyEnv: mirror.keyEnv, outDir: mirror.outDir, timeoutMs: mirror.timeoutMs, providers: mirror.providers.length }))

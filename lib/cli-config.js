/**
 * dsh-media-gen — 快车道 CLI 镜像配置。
 *
 * GUI（设置 → 生图默认 卡）是唯一编辑面；host 把"解析后的生效配置"写成一份
 * JSON 镜像（~/.dsh/gen-image.config.json），供 scripts/gen-image.mjs 在 DSH 之外读取。
 * 镜像不含任何密钥值——只有凭据 ref 名（keyEnv），秘密始终只存在凭据服务里。
 */
import { writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

export const CLI_MIRROR_PATH = join(homedir(), '.dsh', 'gen-image.config.json')

/**
 * 从合并 Config 的展开快照构造 CLI 镜像。
 * @param catalog {providers:[{id,name,baseUrl,apiFormat,apiKeyEnv,models:[{id,name}]}]}
 * @param runtime {enabled,providerId,modelId,defaultSize,defaultQuality,cliOutDir,cliTimeoutMs}
 */
export function buildCliMirror(catalog, runtime) {
  const providers = Array.isArray(catalog?.providers) ? catalog.providers : []
  const providerId = String(runtime?.providerId ?? '').trim()
  const modelId = String(runtime?.modelId ?? '').trim()
  const provider = providers.find((row) => row?.id === providerId)
  const model = (provider?.models ?? []).find((row) => row?.id === modelId)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'dsh-media-gen settings (Settings → 生图默认)',
    base: String(provider?.baseUrl ?? '').trim(),
    outDir: String(runtime?.cliOutDir ?? '').trim() || 'C:/dsh/generate/image',
    defaultModel: model?.id ?? '',
    defaultSize: String(runtime?.defaultSize ?? '').trim() || '1024x1024',
    timeoutMs: Number(runtime?.cliTimeoutMs) > 0 ? Number(runtime?.cliTimeoutMs) : 180000,
    imageLane: typeof runtime?.imageLane === 'string' && runtime.imageLane.trim() ? runtime.imageLane.trim() : 'auto',
    keyEnv: String(provider?.apiKeyEnv ?? '').trim(),
    enabled: runtime?.enabled !== false,
    providers: providers.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.baseUrl,
      apiFormat: row.apiFormat,
      apiKeyEnv: row.apiKeyEnv,
      models: (row.models ?? []).map((m) => m.id),
    })),
    selection: { providerId, modelId },
  }
}

/** 原子写镜像（temp + rename），失败抛错由调用方降级处理。 */
export function writeCliMirror(mirror, path = CLI_MIRROR_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  const staging = join(dirname(path), `.gen-image.config.${process.pid}-${Date.now()}.tmp`)
  writeFileSync(staging, JSON.stringify(mirror, null, 2) + '\n', 'utf8')
  renameSync(staging, path)
  return path
}

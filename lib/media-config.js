/**
 * dsh-media-gen — 统一配置 schema 与纯解析逻辑（host 半）。
 *
 * 单一 loader 条目 `media-gen` 的 volatile Config：生图字段与 dsh-image-generation
 * 完全同名（其 client 卡片直接复用），生视频字段升级为多供应商目录。
 * 本模块只依赖 schemastery，便于 node:test 独立单测；client 半有对应的
 * 投影副本（lib/client-video.js 内联 pickVideoSettings 同构逻辑）。
 */
import z from '@deepseek-ai/schemastery'

/** 生图 API 格式（与上游 dsh-image-generation 一致）。 */
export const IMAGE_API_FORMATS = Object.freeze([
  'openai-images',
  'xai-images',
  'gemini-image',
  'openai-chat-image',
])

/** 生视频供应商类型。openai-compatible = Sora 风格 POST /videos + GET /videos/{id} 轮询。 */
export const VIDEO_ENTRY_KINDS = Object.freeze([
  'dashscope',
  'volcengine',
  'google',
  'openai-compatible',
])

export const DEFAULT_VIDEO_BASE_URLS = Object.freeze({
  dashscope: 'https://dashscope.aliyuncs.com/api/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  google: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  'openai-compatible': 'https://api.openai.com/v1',
})

export const DEFAULT_VIDEO_KEY_ENVS = Object.freeze({
  dashscope: 'DASHSCOPE_API_KEY',
  volcengine: 'ARK_API_KEY',
  google: 'GEMINI_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
})

export const DEFAULT_IMAGE_SIZE = '1024x1024'
export const DEFAULT_IMAGE_QUALITY = 'auto'
export const DEFAULT_VIDEO_FOLDER = 'generate/video'
export const DEFAULT_POLL_INTERVAL_MS = 5000
export const DEFAULT_WAIT_TIMEOUT_MS = 600000
/** 限流指数退避起步毫秒（用户纪律：≥60s）。 */
export const DEFAULT_RATE_LIMIT_BASE_MS = 60000
/** 限流重试次数上限（退避序列 60s → 120s → 240s）。 */
export const DEFAULT_RATE_LIMIT_MAX_RETRIES = 3
/** 快车道 CLI 落盘目录默认值。 */
export const DEFAULT_CLI_OUT_DIR = 'C:/dsh/generate/image'
/** 快车道 CLI 超时默认值（ms）。 */
export const DEFAULT_CLI_TIMEOUT_MS = 180000
/** Agent 出图通道默认偏好。 */
export const DEFAULT_IMAGE_LANE = 'auto'
export const IMAGE_LANES = Object.freeze(['auto', 'cli', 'tool', 'subagent'])

const imageModelSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const imageProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiFormat: z.string().default('openai-images'),
  apiKeyEnv: z.string().role('credential-ref'),
  models: z.array(imageModelSchema).default([]),
})

const videoProviderSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  kind: z.string().default('openai-compatible'),
  baseUrl: z.string().default(''),
  model: z.string(),
  apiKeyEnv: z.string().default(''),
  /** 是否支持图生视频；省略时按 kind 推断（openai-compatible 默认 false，其余默认 true）。 */
  i2v: z.boolean().required(false),
})

/**
 * DSH >= 0.1.6 的 schemastery 支持 volatile 字段：client configForms 可热写入，
 * 运行中的 fiber 立即读到新值。旧运行时退化为普通默认值。
 */
const maybeVolatile = (schema) => (schema && typeof schema.volatile === 'function' ? schema.volatile() : schema)

/** loader 条目 `media-gen` 的 Cordis Config（全部字段可被 configForms 热编辑）。 */
export const Config = z.object({
  // ---- 生图（字段名与 dsh-image-generation 保持一致，client 卡片零改动复用）----
  providers: maybeVolatile(z.array(imageProviderSchema).default([])),
  enabled: maybeVolatile(z.boolean().default(true)),
  providerId: maybeVolatile(z.string().default('')),
  modelId: maybeVolatile(z.string().default('')),
  defaultSize: maybeVolatile(z.string().default(DEFAULT_IMAGE_SIZE)),
  defaultQuality: maybeVolatile(z.string().default(DEFAULT_IMAGE_QUALITY)),
  // ---- 生视频（多供应商目录）----
  videoEnabled: maybeVolatile(z.boolean().default(true)),
  videoProviders: maybeVolatile(z.array(videoProviderSchema).default([])),
  videoProviderId: maybeVolatile(z.string().default('')),
  pollIntervalMs: maybeVolatile(z.number().default(DEFAULT_POLL_INTERVAL_MS)),
  waitTimeoutMs: maybeVolatile(z.number().default(DEFAULT_WAIT_TIMEOUT_MS)),
  saveToWorkspace: maybeVolatile(z.boolean().default(true)),
  videoFolder: maybeVolatile(z.string().default(DEFAULT_VIDEO_FOLDER)),
  // ---- 限流退避（生图/生视频共用；2026-09-29 纪律：≥60s 起步指数退避，禁止即时重试）----
  rateLimitBaseMs: z.number().default(DEFAULT_RATE_LIMIT_BASE_MS),
  rateLimitMaxRetries: z.number().default(DEFAULT_RATE_LIMIT_MAX_RETRIES),
  // ---- 快车道 CLI（scripts/gen-image.mjs）偏好；GUI 在 生图默认 卡编辑，host 写 JSON 镜像 ----
  cliOutDir: maybeVolatile(z.string().default(DEFAULT_CLI_OUT_DIR)),
  cliTimeoutMs: maybeVolatile(z.number().default(DEFAULT_CLI_TIMEOUT_MS)),
  /** Agent 出图通道偏好：auto | cli | tool | subagent（语义见系统提示词策略段）。 */
  imageLane: maybeVolatile(z.string().default(DEFAULT_IMAGE_LANE)),
})

/** 展开可能是 Volatile 引用的配置字段（DSH >= 0.1.6 热写入后 .get() 取最新值）。 */
export function unwrapVolatile(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function') {
    try { return value.get() } catch { return undefined }
  }
  return value
}

/** 从合并 Config 读取一个字段，缺省时回退。 */
export function readConfigField(config, key, fallback) {
  const value = unwrapVolatile(config?.[key])
  return value === undefined ? fallback : value
}

/** i2v 能力：显式 i2v 字段优先；省略时原生三家默认支持，openai-compatible 默认关闭。 */
export function videoEntrySupportsI2v(entry) {
  if (typeof entry?.i2v === 'boolean') return entry.i2v
  return entry?.kind !== 'openai-compatible'
}

/**
 * 从目录解析本次调用生效的视频供应商。
 * @param snapshot 已展开的视频配置快照（videoProviders/videoProviderId/...）。
 * @param requestedId 工具 per-call `provider` 参数（可选，优先于默认选择）。
 * @returns 规范化 entry：{ id, name, kind, baseUrl, model, apiKeyEnv, i2v }。
 */
export function resolveVideoEntry(snapshot, requestedId) {
  const catalog = Array.isArray(snapshot?.videoProviders) ? snapshot.videoProviders : []
  if (catalog.length === 0) {
    throw new Error('尚未配置视频供应商。请在 设置 → 插件 → 插件配置 → dsh-media-gen → 视频生成 中添加。')
  }
  const wanted = String(requestedId ?? snapshot?.videoProviderId ?? '').trim()
  let entry
  if (wanted.length > 0) {
    entry = catalog.find((row) => row && row.id === wanted)
    if (entry === undefined) {
      const known = catalog.map((row) => row?.id).filter(Boolean).join(', ')
      throw new Error(`未知视频供应商 "${wanted}"；已配置：${known}`)
    }
  } else if (catalog.length === 1) {
    entry = catalog[0]
  } else {
    const known = catalog.map((row) => row?.id).filter(Boolean).join(', ')
    throw new Error(`已配置多个视频供应商但未选择默认。请在设置中选择默认，或调用工具时传 provider 参数（可选：${known}）。`)
  }
  const kind = VIDEO_ENTRY_KINDS.includes(entry?.kind) ? entry.kind : 'openai-compatible'
  const model = String(entry?.model ?? '').trim()
  if (model.length === 0) throw new Error(`视频供应商 "${entry?.id}" 未配置 model`)
  return {
    id: String(entry.id),
    name: String(entry.name ?? '').trim() || String(entry.id),
    kind,
    baseUrl: String(entry.baseUrl ?? '').trim() || DEFAULT_VIDEO_BASE_URLS[kind],
    model,
    apiKeyEnv: String(entry.apiKeyEnv ?? '').trim() || DEFAULT_VIDEO_KEY_ENVS[kind],
    i2v: videoEntrySupportsI2v({ ...entry, kind }),
  }
}

/** client 设置卡的视频字段投影（与 client-video.js 内联版本保持同构）。 */
export function pickVideoSettings(value) {
  return {
    videoEnabled: value?.videoEnabled !== false,
    videoProviders: Array.isArray(value?.videoProviders) ? value.videoProviders : [],
    videoProviderId: value?.videoProviderId ?? '',
    pollIntervalMs: value?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    waitTimeoutMs: value?.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    saveToWorkspace: value?.saveToWorkspace !== false,
    videoFolder: value?.videoFolder ?? DEFAULT_VIDEO_FOLDER,
  }
}

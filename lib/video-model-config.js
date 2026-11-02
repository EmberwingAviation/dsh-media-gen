/** Pure browser-safe model catalog and inheritance. */
export const VIDEO_CONFIG_VERSION = 2
export const VIDEO_PROTOCOLS = Object.freeze(['openai-compatible', 'dashscope', 'volcengine', 'google', 'custom-json'])
export const VIDEO_PARAMETER_FORMATS = Object.freeze(['standard', 'wan', 'seedance'])
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const text = v => String(v ?? '').trim()
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
function clone(v, path = 'config', seen = new Set()) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (!v || typeof v !== 'object' || seen.has(v)) throw new Error(`${path}: expected safe JSON value`)
  if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error(`${path}: expected plain JSON object`)
  seen.add(v)
  const out = Array.isArray(v) ? [] : {}
  for (const k of Object.keys(v)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error(`${path}: unsafe key ${k}`)
    out[k] = clone(v[k], `${path}.${k}`, seen)
  }
  seen.delete(v)
  return out
}
function object(v, path) {
  if (v === undefined) return {}
  if (!record(v)) throw new Error(`${path}: expected object`)
  return clone(v, path)
}
function choice(v, choices, name) {
  if (!choices.includes(v)) throw new Error(`${name}: unsupported value "${v}"`)
  return v
}
function caps(v, path) {
  const out = object(v, path)
  for (const [k, flag] of Object.entries(out)) if (typeof flag !== 'boolean') throw new Error(`${path}.${k}: expected boolean`)
  return out
}
function overrides(v) {
  const out = object(v, 'overrides')
  for (const [k, f] of Object.entries(out)) {
    if (!record(f) || !['inherit', 'override', 'omit'].includes(f.mode)) throw new Error(`overrides.${k}: invalid mode`)
    if (f.mode === 'override' && !own(f, 'value')) throw new Error(`overrides.${k}: override requires value`)
  }
  return out
}
export function normalizeVideoProvider(raw, { version = 1 } = {}) {
  if (!record(raw)) throw new Error('视频供应商必须为对象')
  const id = text(raw.id)
  if (!id) throw new Error('视频供应商 id 不能为空')
  const kind = version >= 2 && text(raw.kind)
    ? choice(raw.kind, VIDEO_PROTOCOLS, 'kind')
    : VIDEO_PROTOCOLS.includes(raw.kind) ? raw.kind : 'openai-compatible'
  const protocolDefaults = object(raw.protocolDefaults, 'protocolDefaults')
  protocolDefaults.protocol = choice(protocolDefaults.protocol ?? kind, VIDEO_PROTOCOLS, 'protocol')
  protocolDefaults.parameterFormat = choice(protocolDefaults.parameterFormat ?? ({ dashscope: 'wan', volcengine: 'seedance' }[protocolDefaults.protocol] ?? 'standard'), VIDEO_PARAMETER_FORMATS, 'parameterFormat')
  let rows = raw.models
  const model = text(raw.model)
  if (rows !== undefined && !Array.isArray(rows)) throw new Error(`视频供应商 "${id}" models 必须为数组`)
  // v1 schema inserted []; v2 explicit [] must never resurrect a deleted model.
  if (rows === undefined || (version < 2 && rows.length === 0)) rows = model ? [model] : []
  const ids = new Set()
  const models = rows.map(row => {
    const item = typeof row === 'string' ? { id: row } : row
    if (!record(item) || !text(item.id)) throw new Error(`视频供应商 "${id}" 模型 id 不能为空`)
    const mid = text(item.id)
    if (ids.has(mid)) throw new Error(`重复模型 id "${mid}"`)
    ids.add(mid)
    const result = { id: mid, name: text(item.name) || mid }
    if (item.protocol !== undefined) result.protocol = choice(item.protocol, VIDEO_PROTOCOLS, 'protocol')
    if (item.parameterFormat !== undefined) result.parameterFormat = choice(item.parameterFormat, VIDEO_PARAMETER_FORMATS, 'parameterFormat')
    result.overrides = overrides(item.overrides)
    result.capabilities = caps(item.capabilities, 'capabilities')
    return result
  })
  if (version >= 2 && model && !models.length) throw new Error(`视频供应商 "${id}" 模型目录为空，但默认模型 "${model}" 非空；请清空默认模型`)
  if (model && models.length && !ids.has(model)) throw new Error(`默认模型 "${model}" 不在供应商 "${id}" 模型目录中`)
  const capabilityDefaults = caps(raw.capabilityDefaults, 'capabilityDefaults')
  if (!own(capabilityDefaults, 'i2v') && typeof raw.i2v === 'boolean') capabilityDefaults.i2v = raw.i2v
  return { id, name: text(raw.name) || id, kind, baseUrl: text(raw.baseUrl), apiKeyEnv: text(raw.apiKeyEnv), model: models.length ? model : '', models,
    ...(typeof raw.i2v === 'boolean' ? { i2v: raw.i2v } : {}),
    protocolDefaults, generationDefaults: object(raw.generationDefaults, 'generationDefaults'), capabilityDefaults }
}
export function normalizeVideoCatalog(rows, options = {}) {
  if (!Array.isArray(rows)) throw new Error('视频供应商目录必须为数组')
  const ids = new Set()
  return rows.map(row => {
    const provider = normalizeVideoProvider(row, options)
    if (ids.has(provider.id)) throw new Error(`重复视频供应商 id "${provider.id}"`)
    ids.add(provider.id)
    return provider
  })
}
/** call > model override > provider defaults; explicit calls conflict with model omit. */
export function resolveModelParameters(provider, model, callOverrides = {}) {
  const parameters = object(provider?.generationDefaults, 'generationDefaults')
  const sources = Object.fromEntries(Object.keys(parameters).map(k => [k, 'provider']))
  const omitted = new Set()
  for (const [k, f] of Object.entries(overrides(model?.overrides))) {
    if (f.mode === 'omit') { delete parameters[k]; sources[k] = 'omit'; omitted.add(k) }
    if (f.mode === 'override') { parameters[k] = f.value; sources[k] = 'model' }
  }
  if (!record(callOverrides)) throw new Error('callOverrides: expected object')
  const defined = Object.fromEntries(Object.entries(callOverrides).filter(([, v]) => v !== undefined))
  for (const [k, v] of Object.entries(object(defined, 'callOverrides'))) {
    if (omitted.has(k)) throw new Error(`参数 "${k}" 被模型设为 omit，不能在调用中显式覆盖`)
    parameters[k] = v; sources[k] = 'call'
  }
  return { parameters, sources, omitted: [...omitted] }
}
export function resolveModelCapabilities(provider, model, protocol) {
  return { t2v: true, i2v: ['dashscope', 'volcengine', 'google'].includes(protocol), ...provider.capabilityDefaults, ...model.capabilities }
}
export function resolveVideoEntry(snapshot, requestedId, requestedModelId) {
  const catalog = normalizeVideoCatalog(snapshot?.videoProviders ?? [], { version: snapshot?.videoConfigVersion ?? 1 })
  if (!catalog.length) throw new Error('尚未配置视频供应商。请在 设置 → 插件 → 插件配置 → dsh-media-gen → 视频生成 中添加。')
  const wanted = text(requestedId ?? snapshot?.videoProviderId)
  const entry = wanted ? catalog.find(row => row.id === wanted) : catalog.length === 1 ? catalog[0] : undefined
  if (!entry) {
    const known = catalog.map(row => row.id).join(', ')
    if (wanted) throw new Error(`未知视频供应商 "${wanted}"；已配置：${known}`)
    throw new Error(`已配置多个视频供应商但未选择默认。请在设置中选择默认，或调用工具时传 provider 参数（可选：${known}）。`)
  }
  if (!entry.models.length) throw new Error(`视频供应商 "${entry.id}" 未配置 model（模型目录为空）`)
  const modelId = text(requestedModelId ?? entry.model)
  const modelConfig = modelId ? entry.models.find(row => row.id === modelId) : entry.models.length === 1 ? entry.models[0] : undefined
  if (!modelConfig) throw new Error(modelId ? `未知视频模型 "${modelId}"` : `视频供应商 "${entry.id}" 未选择默认模型`)
  const protocol = modelConfig.protocol ?? entry.protocolDefaults.protocol
  const parameterFormat = modelConfig.parameterFormat ?? entry.protocolDefaults.parameterFormat
  const resolved = resolveModelParameters(entry, modelConfig)
  const capabilities = resolveModelCapabilities(entry, modelConfig, protocol)
  return { id: entry.id, name: entry.name, kind: protocol, protocol, baseUrl: entry.baseUrl, model: modelConfig.id, apiKeyEnv: entry.apiKeyEnv,
    i2v: capabilities.i2v, capabilities, parameterFormat, providerConfig: entry, modelConfig,
    parameters: resolved.parameters, parameterSources: resolved.sources, omittedParameters: resolved.omitted }
}

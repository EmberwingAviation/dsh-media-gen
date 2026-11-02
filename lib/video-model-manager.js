import { createHash } from 'node:crypto'
import { normalizeVideoProvider, normalizeVideoCatalog, resolveModelParameters } from './video-model-config.js'
import { resolveVideoEntry } from './media-config.js'
import { previewVideoRequest, validateCustomProtocol } from './video-protocol.js'

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]))
  return value
}
export function videoCatalogRevision(config) {
  const version = config.videoConfigVersion ?? 1
  const providers = normalizeVideoCatalog(config.videoProviders ?? [], { version })
  return createHash('sha256').update(JSON.stringify(stableJson({ version, providers, default: config.videoProviderId ?? '' }))).digest('hex').slice(0, 24)
}
function validateProvider(raw) {
  const provider = normalizeVideoProvider(raw, { version: 2 })
  const custom = provider.protocolDefaults?.custom
  const needsCustom = provider.protocolDefaults?.protocol === 'custom-json' || provider.models.some(model => model.protocol === 'custom-json')
  if (custom !== undefined || needsCustom) validateCustomProtocol(custom)
  return provider
}

/** One operation used by the settings RPC and the model-facing tool. */
export function createVideoModelManager({ getConfig, commit }) {
  return async function manage(request) {
    const config = getConfig()
    const revision = videoCatalogRevision(config)
    const providers = normalizeVideoCatalog(config.videoProviders ?? [], { version: config.videoConfigVersion ?? 1 })
    if (request.action === 'list') return { revision, videoProviderId: config.videoProviderId ?? '', providers }
    if (request.action === 'validate') return validateProvider(request.provider)
    if (request.action === 'preview') {
      const provider = request.provider && typeof request.provider === 'object' ? validateProvider(request.provider) : providers.find(p => p.id === request.provider)
      if (!provider) throw new Error('Unknown video provider')
      const active = resolveVideoEntry({ videoConfigVersion: 2, videoProviders: [provider] }, provider.id, request.model)
      const resolved = resolveModelParameters(active.providerConfig, active.modelConfig, request.parameters ?? {})
      return previewVideoRequest({ ...active, parameters: resolved.parameters, parameterSources: resolved.sources, omittedParameters: resolved.omitted }, { prompt: request.prompt || 'A calm seaside sunset', operation: 't2v' })
    }
    if (!['upsert', 'remove', 'set_default', 'save_catalog'].includes(request.action)) throw new Error('Unknown video model action')
    if (!request.expectedRevision || request.expectedRevision !== revision) throw new Error('Video configuration changed; read the catalog and retry with its revision')
    let next = providers
    let defaultProvider = config.videoProviderId ?? ''
    if (request.action === 'save_catalog') {
      next = normalizeVideoCatalog(request.providers, { version: 2 }).map(validateProvider)
      defaultProvider = request.videoProviderId ?? defaultProvider
      if (defaultProvider && !next.some(p => p.id === defaultProvider)) throw new Error('Default video provider does not exist')
    } else {
      const provider = providers.find(p => p.id === request.provider)
      if (!provider) throw new Error('Unknown video provider')
      let updated = { ...provider, models: [...provider.models] }
      if (request.action === 'upsert') {
        if (!request.model || typeof request.model !== 'object') throw new Error('A model object is required')
        const at = updated.models.findIndex(m => m.id === request.model.id)
        if (at === -1) updated.models.push(request.model); else updated.models[at] = request.model
        if (!updated.model) updated.model = request.model.id
      } else if (request.action === 'remove') {
        if (!updated.models.some(m => m.id === request.modelId)) throw new Error('Unknown video model')
        updated.models = updated.models.filter(m => m.id !== request.modelId)
        if (updated.model === request.modelId) updated.model = updated.models[0]?.id ?? ''
      } else {
        if (!updated.models.some(m => m.id === request.modelId)) throw new Error('Unknown video model')
        updated.model = request.modelId
        if (request.makeProviderDefault === true) defaultProvider = provider.id
      }
      updated = validateProvider(updated)
      next = providers.map(p => p.id === provider.id ? updated : p)
    }
    if (!commit) throw new Error('Configuration writing is unavailable')
    await commit({ videoConfigVersion: 2, videoProviders: next, videoProviderId: defaultProvider }, revision)
    const saved = getConfig()
    return { revision: videoCatalogRevision(saved), videoProviderId: saved.videoProviderId, providers: normalizeVideoCatalog(saved.videoProviders ?? [], { version: saved.videoConfigVersion ?? 1 }) }
  }
}

/**
 * dsh-image-generation — Host half.
 *
 * Two settings namespaces:
 *   - `image-gen`          catalog of image providers + models (Settings → 生图配置)
 *   - `image-gen-runtime`  the single selected model the tool uses (Settings → 插件 → 插件配置)
 *
 * Registers `image_generate` and a loopback RPC channel for the toolview gallery.
 */
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

export const name = 'dsh-image-generation'

export const inject = ['tools']

export const CATALOG_NS = 'image-gen'
export const RUNTIME_NS = 'image-gen-runtime'
export const RPC_CHANNEL = '/image-gen'

export const API_FORMATS = Object.freeze([
  'openai-images',
  'xai-images',
  'gemini-image',
  'openai-chat-image',
])

const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const USER_AGENT = 'dsh-image-generation/0.1.1'
const DEFAULT_SIZE = '1024x1024'
const DEFAULT_QUALITY = 'auto'

const SIZE_TO_ASPECT = {
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  auto: 'auto',
}

const GROK_QUALITY = {
  low: 'low',
  medium: 'medium',
  high: 'medium',
  auto: undefined,
}

const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiFormat: z.string().default('openai-images'),
  apiKeyEnv: z.string().role('credential-ref'),
  models: z.array(modelSchema).default([]),
})

export const CatalogConfig = z.object({
  providers: z.array(providerSchema).default([]),
})

export const RuntimeConfig = z.object({
  enabled: z.boolean().default(true),
  providerId: z.string().default(''),
  modelId: z.string().default(''),
  defaultSize: z.string().default(DEFAULT_SIZE),
  defaultQuality: z.string().default(DEFAULT_QUALITY),
})

/**
 * Mark a schema field volatile when the runtime's schemastery supports it
 * (DSH >= 0.1.6). Volatile fields are editable through the client's
 * configuration forms and hot-committed into the running fiber's references;
 * older runtimes lack the method and keep the fields plain defaults.
 */
const maybeVolatile = (schema) => (schema && typeof schema.volatile === 'function' ? schema.volatile() : schema)

/**
 * Cordis Config for this plugin's loader entry (`image-gen`). DSH >= 0.1.6
 * removed `settings.installSection`; the catalog and the runtime selection
 * live here as volatile fields instead — one entry, so the client's
 * `configForms.get('image-gen')` serves both.
 */
export const Config = z.object({
  providers: maybeVolatile(z.array(providerSchema).default([])),
  enabled: maybeVolatile(z.boolean().default(true)),
  providerId: maybeVolatile(z.string().default('')),
  modelId: maybeVolatile(z.string().default('')),
  defaultSize: maybeVolatile(z.string().default(DEFAULT_SIZE)),
  defaultQuality: maybeVolatile(z.string().default(DEFAULT_QUALITY)),
})

/**
 * Unwrap one config field that may be a live Volatile reference (DSH >= 0.1.6
 * hot-commits volatile writes into the box) or a plain value.
 */
function unwrapVolatile(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function') {
    try { return value.get() } catch { return undefined }
  }
  return value
}

function emptyCatalog() {
  return { providers: [] }
}

function emptyRuntime() {
  return {
    enabled: true,
    providerId: '',
    modelId: '',
    defaultSize: DEFAULT_SIZE,
    defaultQuality: DEFAULT_QUALITY,
  }
}

export function slugifyProviderId(name) {
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'provider'
}

export function apiKeyEnvFor(providerId) {
  const body = String(providerId).toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return `IMAGE_GEN_${body}_API_KEY`
}

function trimSlash(url) {
  return String(url ?? '').trim().replace(/\/+$/, '')
}

function joinEndpoint(base, suffix) {
  const b = trimSlash(base)
  if (!b) throw new Error('image_generate: provider has no Base URL')
  if (b.endsWith(suffix)) return b
  return `${b}${suffix}`
}

function abortedError(signal, fallback) {
  const err = new Error('image_generate: aborted')
  err.name = 'AbortError'
  err.cause = signal?.aborted === true ? signal.reason : fallback
  return err
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError'
}

function errorOf(payload, status) {
  const detail = typeof payload?.error === 'string'
    ? payload.error
    : payload?.error?.message ?? payload?.message ?? payload?.error?.status
  return detail && String(detail).length > 0
    ? String(detail)
    : `image API error (HTTP ${status})`
}

export function sniffImageMediaType(data) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  const gifHeader = data.length >= 6 ? data.toString('latin1', 0, 6) : ''
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'image/gif'
  return 'image/png'
}

const MEDIA_TYPE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function imageFileName(index, mediaType) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const ext = MEDIA_TYPE_EXTENSIONS[mediaType] ?? 'png'
  return `image-${stamp}-${Math.random().toString(36).slice(2, 8)}-${index}.${ext}`
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function workspaceRoot(cwd) {
  return typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd()
}

function outputDirectory(cwd) {
  return join(workspaceRoot(cwd), 'generate', 'image')
}

function isGeneratedImagePath(abs) {
  const parent = dirname(abs)
  return basename(parent) === 'image'
    && basename(dirname(parent)) === 'generate'
    && IMAGE_EXTENSIONS.has(extname(abs).toLowerCase())
}

function decodeDataUrl(value) {
  const match = String(value).match(/^data:([^;,]+);base64,(.+)$/s)
  if (!match) return null
  return { mime: match[1], data: Buffer.from(match[2], 'base64') }
}

async function fetchToBuffer(url, signal) {
  const response = await fetch(url, { redirect: 'follow', signal })
  if (!response.ok) throw new Error(`image download failed (HTTP ${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

function pushImage(out, data, mime) {
  if (!data || data.length === 0) return
  out.push({ data, mime: mime && IMAGE_MEDIA_TYPES.includes(mime) ? mime : sniffImageMediaType(data) })
}

function collectOpenAiImages(payload, out) {
  const entries = Array.isArray(payload?.data) ? payload.data : []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    if (typeof entry.b64_json === 'string' && entry.b64_json.length > 0) {
      pushImage(out, Buffer.from(entry.b64_json, 'base64'), 'image/png')
      continue
    }
    if (typeof entry.url === 'string' && entry.url.length > 0) {
      out.push({ url: entry.url, mime: 'image/png' })
    }
  }
}

function collectGeminiImages(payload, out) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      const inline = part?.inlineData ?? part?.inline_data
      if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
        pushImage(out, Buffer.from(inline.data, 'base64'), inline.mimeType ?? inline.mime_type)
      }
    }
  }
  const predictions = Array.isArray(payload?.predictions) ? payload.predictions : []
  for (const prediction of predictions) {
    const b64 = prediction?.bytesBase64Encoded ?? prediction?.bytes_base64_encoded
    if (typeof b64 === 'string' && b64.length > 0) {
      pushImage(out, Buffer.from(b64, 'base64'), prediction?.mimeType)
    }
  }
}

function collectChatImages(payload, out) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : []
  for (const choice of choices) {
    const message = choice?.message ?? {}
    const images = Array.isArray(message.images) ? message.images : []
    for (const image of images) {
      const url = image?.image_url?.url ?? image?.url
      if (typeof url !== 'string' || url.length === 0) continue
      const decoded = decodeDataUrl(url)
      if (decoded) pushImage(out, decoded.data, decoded.mime)
      else out.push({ url, mime: 'image/png' })
    }
    const content = message.content
    if (Array.isArray(content)) {
      for (const part of content) {
        const url = part?.image_url?.url ?? part?.inline_data?.data
        if (part?.type === 'image_url' && typeof part?.image_url?.url === 'string') {
          const decoded = decodeDataUrl(part.image_url.url)
          if (decoded) pushImage(out, decoded.data, decoded.mime)
          else out.push({ url: part.image_url.url, mime: 'image/png' })
        } else if (part?.inline_data?.data) {
          pushImage(out, Buffer.from(part.inline_data.data, 'base64'), part.inline_data.mime_type)
        }
      }
    } else if (typeof content === 'string') {
      const match = content.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/)
      if (match) pushImage(out, Buffer.from(match[2].replace(/\s+/g, ''), 'base64'), match[1])
    }
  }
}

async function materializeImages(raw, signal) {
  const images = []
  for (const item of raw) {
    if (item.data) {
      images.push({ data: item.data, mime: item.mime ?? sniffImageMediaType(item.data) })
      continue
    }
    if (item.url) {
      const decoded = decodeDataUrl(item.url)
      if (decoded) {
        images.push({ data: decoded.data, mime: decoded.mime })
        continue
      }
      const data = await fetchToBuffer(item.url, signal)
      images.push({ data, mime: sniffImageMediaType(data) })
    }
  }
  if (images.length === 0) throw new Error('image_generate: the response carried no image data')
  return images
}

async function readJson(response, signal) {
  try {
    return await response.json()
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw abortedError(signal, error)
    throw new Error(`image API returned an unprocessable response (HTTP ${response.status}): ${String(error)}`)
  }
}

async function postJson(url, { apiKey, body, signal, googleHost }) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': USER_AGENT,
  }
  if (googleHost) headers['x-goog-api-key'] = apiKey
  else headers.authorization = `Bearer ${apiKey}`
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: JSON.stringify(body),
      ...signal !== undefined ? { signal } : {},
    })
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw abortedError(signal, error)
    throw new Error(`image generation request failed: ${String(error)}`)
  }
  const payload = await readJson(response, signal)
  if (!response.ok) throw new Error(errorOf(payload, response.status))
  return payload
}

function sizeOf(args, runtime) {
  return args.size ?? runtime.defaultSize ?? DEFAULT_SIZE
}

function qualityOf(args, runtime) {
  return args.quality ?? runtime.defaultQuality ?? DEFAULT_QUALITY
}

function geminiAspect(size) {
  const aspect = SIZE_TO_ASPECT[size] ?? '1:1'
  return aspect === 'auto' ? '1:1' : aspect
}

function isImagenModel(model) {
  return /imagen/i.test(model)
}

function geminiUrl(baseUrl, model, verb) {
  const b = trimSlash(baseUrl)
  const id = model.startsWith('models/') ? model.slice('models/'.length) : model
  return `${b}/models/${encodeURIComponent(id)}:${verb}`
}

async function generateOpenAiImages({ provider, model, args, runtime, apiKey, signal, references }) {
  const size = sizeOf(args, runtime)
  const quality = qualityOf(args, runtime)
  const editing = references !== undefined
  const url = joinEndpoint(provider.baseUrl, editing ? '/images/edits' : '/images/generations')
  const body = {
    model,
    prompt: args.prompt.trim(),
    n: 1,
    ...size === 'auto' ? {} : { size },
    ...quality === 'auto' ? {} : { quality },
    response_format: 'b64_json',
    ...editing ? { images: references.map((image_url) => ({ image_url })) } : {},
  }
  let payload
  try {
    payload = await postJson(url, { apiKey, body, signal })
  } catch (error) {
    if (!/response_format/i.test(String(error?.message ?? error))) throw error
    const { response_format: _omit, ...rest } = body
    payload = await postJson(url, { apiKey, body: rest, signal })
  }
  const raw = []
  collectOpenAiImages(payload, raw)
  return materializeImages(raw, signal)
}

async function generateXaiImages({ provider, model, args, runtime, apiKey, signal, references }) {
  const size = sizeOf(args, runtime)
  const quality = GROK_QUALITY[qualityOf(args, runtime)]
  const editing = references !== undefined
  const url = joinEndpoint(provider.baseUrl, editing ? '/images/edits' : '/images/generations')
  const body = {
    model,
    prompt: args.prompt.trim(),
    response_format: 'b64_json',
    ...size === undefined ? {} : { aspect_ratio: SIZE_TO_ASPECT[size] ?? '1:1' },
    ...quality === undefined ? {} : { quality },
    ...editing
      ? references.length === 1
        ? { image: { type: 'image_url', url: references[0] } }
        : { images: references.map((url) => ({ type: 'image_url', url })) }
      : {},
  }
  const payload = await postJson(url, { apiKey, body, signal })
  const raw = []
  collectOpenAiImages(payload, raw)
  return materializeImages(raw, signal)
}

async function generateGeminiImage({ provider, model, args, runtime, apiKey, signal, references }) {
  const size = sizeOf(args, runtime)
  const googleHost = /generativelanguage\.googleapis\.com/i.test(provider.baseUrl)
  if (isImagenModel(model)) {
    const url = geminiUrl(provider.baseUrl, model, 'predict')
    const payload = await postJson(url, {
      apiKey,
      googleHost,
      signal,
      body: {
        instances: [{ prompt: args.prompt.trim() }],
        parameters: {
          sampleCount: 1,
          aspectRatio: geminiAspect(size),
        },
      },
    })
    const raw = []
    collectGeminiImages(payload, raw)
    return materializeImages(raw, signal)
  }
  const parts = [{ text: args.prompt.trim() }]
  if (references) {
    for (const dataUrl of references) {
      const decoded = decodeDataUrl(dataUrl)
      if (!decoded) continue
      parts.push({ inline_data: { mime_type: decoded.mime, data: decoded.data.toString('base64') } })
    }
  }
  const url = geminiUrl(provider.baseUrl, model, 'generateContent')
  const payload = await postJson(url, {
    apiKey,
    googleHost,
    signal,
    body: {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: geminiAspect(size) },
      },
    },
  })
  const raw = []
  collectGeminiImages(payload, raw)
  if (raw.length === 0) collectChatImages(payload, raw)
  return materializeImages(raw, signal)
}

async function generateChatImage({ provider, model, args, runtime, apiKey, signal, references }) {
  const url = joinEndpoint(provider.baseUrl, '/chat/completions')
  let content
  if (references === undefined) content = args.prompt.trim()
  else {
    content = [{ type: 'text', text: args.prompt.trim() }]
    for (const image_url of references) content.push({ type: 'image_url', image_url: { url: image_url } })
  }
  const payload = await postJson(url, {
    apiKey,
    signal,
    body: {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
    },
  })
  const raw = []
  collectChatImages(payload, raw)
  collectOpenAiImages(payload, raw)
  collectGeminiImages(payload, raw)
  return materializeImages(raw, signal)
}

const GENERATORS = {
  'openai-images': generateOpenAiImages,
  'xai-images': generateXaiImages,
  'gemini-image': generateGeminiImage,
  'openai-chat-image': generateChatImage,
}

async function resolveApiKey(ctx, apiKeyEnv, signal) {
  if (signal?.aborted === true) throw abortedError(signal)
  if (!apiKeyEnv) throw new Error('image_generate: provider has no API key reference; save it in 设置 → 生图配置')
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    throw new Error(`image_generate: no credentials service; store the key for "${apiKeyEnv}"`)
  }
  const resolved = await credentials.resolve(credentialRef(apiKeyEnv))
  if (resolved !== undefined && resolved.value.length > 0) return resolved.value
  throw new Error(`image_generate: no API key for "${apiKeyEnv}"; set it in 设置 → 生图配置`)
}

async function resolveReferenceImages(refs, attachments, signal) {
  if (refs === undefined) return undefined
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 5) {
    throw new Error('image_generate: referenceImages must contain 1–5 complete image references; omit only for a new image')
  }
  if (attachments === undefined) throw new Error('image_generate: editing requires the DSH attachment service')
  const seen = new Set()
  const urls = []
  for (const ref of refs) {
    signal?.throwIfAborted?.()
    if (ref === null || typeof ref !== 'object'
      || typeof ref.attachmentId !== 'string'
      || !IMAGE_MEDIA_TYPES.includes(ref.mediaType)
      || ![ref.bytes, ref.width, ref.height].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error('image_generate: invalid referenceImages entry; copy a complete image reference or call read_image first')
    }
    if (seen.has(ref.attachmentId)) throw new Error('image_generate: referenceImages contains duplicate images')
    seen.add(ref.attachmentId)
    const stored = await attachments.readImage(imageRefFromValue(ref), signal)
    urls.push(`data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`)
  }
  return urls
}

function imageRefFromValue(image) {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...image.name === undefined ? {} : { name: image.name },
    ...image.originalDimensions === undefined ? {} : { originalDimensions: image.originalDimensions },
  }
}

function imageGenerateText(value) {
  const text = `Saved ${value.paths.length} image(s):\n${value.paths.map((path) => `- ${path}`).join('\n')}`
    + (value.images?.length ? `\n\nImage references (for image_generate.referenceImages): ${JSON.stringify(value.images)}` : '')
  return { type: 'text', text }
}

function imageGenerateContent(value) {
  return [
    imageGenerateText(value),
    ...(value.images ?? []).map((image) => ({ type: 'image', attachment: imageRefFromValue(image) })),
  ]
}

function truncate(text, max = 60) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function findProvider(catalog, providerId) {
  return (catalog.providers ?? []).find((row) => row.id === providerId)
}

function findModel(provider, modelId) {
  return (provider.models ?? []).find((row) => row.id === modelId)
}

function createImageGenerateTool(ctx, currentCatalog, currentRuntime) {
  return defineTool({
    name: 'image_generate',
    description: 'Generate an image with the model selected in Settings → Plugins → Image generation, '
      + 'and save it under generate/image in the session workspace. The image is shown inline in the conversation. '
      + 'Returns the saved file paths. To edit or use existing images as references, pass referenceImages copied from '
      + 'the image reference text or structured tool results (read_image.image or image_generate.images). '
      + 'For local files, call read_image first. Omit referenceImages only for a new image.',
    parameters: {
      referenceImages: {
        type: 'array',
        description: 'Optional 1–5 ordered complete DSH image references to edit or use as source images. Not file paths or URLs. Omit only for new images.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', enum: IMAGE_MEDIA_TYPES, required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
            name: { type: 'string' },
            originalDimensions: {
              type: 'object',
              additionalProperties: false,
              properties: {
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      prompt: { type: 'string', required: true, description: 'What the image should show.' },
      size: {
        type: 'string',
        enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        description: 'Image dimensions; omit for the configured default.',
      },
      quality: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'Rendering quality; omit for the configured default.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          paths: { type: 'array', items: { type: 'string' }, required: true },
          provider: { type: 'string' },
          model: { type: 'string' },
          format: { type: 'string' },
          images: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: { type: 'string', enum: IMAGE_MEDIA_TYPES, required: true },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => imageGenerateContent(value),
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `image_generate${args.referenceImages === undefined ? '' : ` (edit, ${args.referenceImages.length} images)`}: ${truncate(args.prompt)}`,
    }),
    presentResult: (_args, result) => ({
      card: 'generic',
      content: result.content.filter((block) => block.type === 'text'),
    }),
    async execute(args, exec) {
      const prompt = String(args.prompt ?? '').trim()
      if (prompt.length === 0) throw new Error('image_generate: prompt must be a non-empty string')
      const runtime = currentRuntime()
      if (!runtime.enabled) {
        throw new Error('image_generate: disabled in 设置 → 插件 → 插件配置 → 图形生成')
      }
      if (!runtime.providerId || !runtime.modelId) {
        throw new Error('image_generate: 尚未选择生图模型。请先在 设置 → 生图配置 添加供应商，再在 设置 → 插件 → 插件配置 → 图形生成 中选择一个模型')
      }
      const catalog = currentCatalog()
      const provider = findProvider(catalog, runtime.providerId)
      if (provider === undefined) {
        throw new Error(`image_generate: provider "${runtime.providerId}" is missing; reopen 设置 → 生图配置`)
      }
      const model = findModel(provider, runtime.modelId)
      if (model === undefined) {
        throw new Error(`image_generate: model "${runtime.modelId}" is not on provider "${provider.name}"; edit 设置 → 生图配置`)
      }
      if (!API_FORMATS.includes(provider.apiFormat)) {
        throw new Error(`image_generate: unknown API format "${provider.apiFormat}"`)
      }
      const attachments = ctx.get('attachments')
      const references = await resolveReferenceImages(args.referenceImages, attachments, exec.signal)
      const apiKey = await resolveApiKey(ctx, provider.apiKeyEnv, exec.signal)
      const images = await GENERATORS[provider.apiFormat]({
        provider,
        model: model.id,
        args: { ...args, prompt },
        runtime,
        apiKey,
        signal: exec.signal,
        references,
      })
      const cwd = exec.agent?.session.header.cwd
      const directory = outputDirectory(cwd)
      await mkdir(directory, { recursive: true })
      const paths = []
      const mediaTypes = []
      for (const [index, image] of images.entries()) {
        const mediaType = image.mime ?? sniffImageMediaType(image.data)
        const name = imageFileName(index, mediaType)
        await writeFile(join(directory, name), image.data)
        paths.push(join('generate', 'image', name))
        mediaTypes.push(mediaType)
      }
      const refs = []
      if (attachments !== undefined) {
        for (const [index, image] of images.entries()) {
          try {
            const ref = await attachments.saveImage({
              data: image.data,
              mediaType: mediaTypes[index],
              name: basename(paths[index]),
            })
            refs.push({
              attachmentId: ref.attachmentId,
              mediaType: ref.mediaType,
              bytes: ref.bytes,
              width: ref.width,
              height: ref.height,
              ...ref.name === undefined ? {} : { name: ref.name },
            })
          } catch (error) {
            ctx.logger?.warn?.(`dsh-image-generation: could not attach ${paths[index]}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      return {
        paths,
        provider: provider.id,
        model: model.id,
        format: provider.apiFormat,
        ...refs.length > 0 ? { images: refs } : {},
      }
    },
  })
}

function ok(value) {
  return { ok: true, value }
}

function failure(error) {
  return {
    ok: false,
    error: {
      code: error instanceof Error && error.name === 'BadRequest' ? 'bad-request' : 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

class BadRequest extends Error {
  constructor(message) {
    super(message)
    this.name = 'BadRequest'
  }
}

function registerRpc(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.get('connection')
    if (connection === undefined) return
    scoped.effect(() => connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, signal) => {
      try {
        if (typeof payload !== 'object' || payload === null) throw new BadRequest('payload must be an object')
        if (endpoint === 'image') {
          const attachments = ctx.get('attachments')
          if (attachments === undefined) throw new Error('no attachment service is mounted; generated-image bytes are unavailable')
          const stored = await attachments.readImage(imageRefFromValue(payload), signal)
          return ok({
            mediaType: stored.ref.mediaType,
            dataBase64: Buffer.from(stored.data).toString('base64'),
          })
        }
        if (endpoint === 'file') {
          const raw = payload.path
          if (typeof raw !== 'string' || raw.length === 0) throw new BadRequest('payload.path must be a non-empty string')
          const cwd = typeof payload.cwd === 'string' ? payload.cwd : ''
          const abs = resolve(isAbsolute(raw) ? raw : join(workspaceRoot(cwd), raw))
          if (!isGeneratedImagePath(abs)) throw new BadRequest('path is not a generate/image file')
          const data = await readFile(abs, signal !== undefined ? { signal } : {})
          return ok({
            mediaType: sniffImageMediaType(data),
            dataBase64: data.toString('base64'),
          })
        }
        throw new BadRequest(`unknown /image-gen endpoint "${endpoint}"`)
      } catch (error) {
        return failure(error)
      }
    }, { authority: 'loopback' }), 'dsh-image-generation: /image-gen rpc channel')
  })
}

export function apply(ctx, config) {
  // Default readers: DSH >= 0.1.6, where the merged Config's volatile fields
  // carry the catalog and the runtime selection. Read at call time so a
  // hot-committed volatile write takes effect on the next tool call.
  const read = (key, fallback) => {
    const value = unwrapVolatile(config?.[key])
    return value === undefined ? fallback : value
  }
  let currentCatalog = () => ({ providers: Array.isArray(read('providers', [])) ? read('providers', []) : [] })
  let currentRuntime = () => ({
    enabled: read('enabled', true),
    providerId: read('providerId', ''),
    modelId: read('modelId', ''),
    defaultSize: read('defaultSize', DEFAULT_SIZE),
    defaultQuality: read('defaultQuality', DEFAULT_QUALITY),
  })

  // DSH <= 0.1.5: the settings service installs schema-driven sections and
  // streams live sources through setSource, overriding the config readers.
  ctx.inject(['settings'], (settingsCtx) => {
    if (typeof settingsCtx.settings?.installSection !== 'function') return
    settingsCtx.settings.installSection(ctx, CATALOG_NS, CatalogConfig, emptyCatalog(), {
      setSource: (source) => {
        currentCatalog = source
      },
      onChange: () => {},
    })
    settingsCtx.settings.installSection(ctx, RUNTIME_NS, RuntimeConfig, emptyRuntime(), {
      setSource: (source) => {
        currentRuntime = source
      },
      onChange: () => {},
    })
  })

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'tool:image-gen',
      order: 121,
      text: 'To create an image, call image_generate with a prompt and optional size/quality. '
        + 'The model selected in Settings → Plugins → Image generation is used. '
        + 'Files are saved under generate/image in the workspace and shown inline in the conversation. '
        + 'Use read_image on a returned path if you need to inspect the file.',
    })
  })

  ctx.tools.register(createImageGenerateTool(ctx, () => currentCatalog(), () => currentRuntime()))
  registerRpc(ctx)
}

export {
  emptyCatalog,
  emptyRuntime,
}
